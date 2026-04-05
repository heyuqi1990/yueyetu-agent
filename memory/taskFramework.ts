/**
 * Task Framework v2.2 - 任务生命周期管理
 * 
 * 源自Claude Code的Task框架
 * 统一的registerTask/updateTaskState接口
 * 支持增量输出读取和终端状态自动GC
 */

import { createSignal, type Signal } from './signal'
import { globalSignalManager } from './signal'

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 任务状态
 */
export type TaskStatus = 
  | 'pending'    // 等待执行
  | 'running'    // 执行中
  | 'completed'  // 已完成
  | 'failed'     // 失败
  | 'killed'     // 被终止

/**
 * 任务类型
 */
export type TaskType = 
  | 'bash'           // Bash命令
  | 'agent'          // Agent执行
  | 'extraction'     // 记忆提取
  | 'compaction'      // 上下文压缩
  | 'watch'          // 文件监控
  | 'cron'           // 定时任务
  | 'workflow'       // 工作流

/**
 * 任务对象接口
 */
export interface Task {
  id: string
  type: TaskType
  name: string
  status: TaskStatus
  createdAt: number
  startedAt?: number
  completedAt?: number
  retain?: boolean      // 是否保留UI（用于显示）
  retainUntil?: number  // 保留截止时间
  notified?: boolean    // 是否已通知
  outputOffset?: number // 增量输出偏移
  error?: string
}

/**
 * 任务附加信息
 */
export interface TaskAttachment {
  taskId: string
  type: 'text' | 'error' | 'output'
  content: string
  timestamp: number
}

/**
 * 任务状态变更
 */
export interface TaskStateChange {
  taskId: string
  previousStatus: TaskStatus
  newStatus: TaskStatus
  timestamp: number
}

/**
 * 任务注册选项
 */
export interface RegisterTaskOptions {
  id?: string
  type: TaskType
  name: string
  retain?: boolean
  retainMs?: number  // 保留时间（毫秒）
}

/**
 * 任务输出
 */
export interface TaskOutput {
  content: string
  isError: boolean
  timestamp: number
}

// ============================================================================
// 常量
// ============================================================================

/**
 * 任务ID前缀
 */
const TASK_ID_PREFIXES: Record<TaskType, string> = {
  bash: 'bx',
  agent: 'ag',
  extraction: 'ex',
  compaction: 'cp',
  watch: 'wt',
  cron: 'cn',
  workflow: 'wf'
}

const TASK_ID_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz'

/**
 * Panel宽限期（30秒）
 * 任务完成后30秒内不驱逐
 */
export const PANEL_GRACE_MS = 30_000

/**
 * 终端状态
 */
const TERMINAL_STATUSES: TaskStatus[] = ['completed', 'failed', 'killed']

/**
 * 默认保留时间
 */
const DEFAULT_RETAIN_MS = PANEL_GRACE_MS

// ============================================================================
// 任务注册表
// ============================================================================

/**
 * 全局任务表
 */
let tasks: Map<string, Task> = new Map()

/**
 * 任务输出存储
 */
let taskOutputs: Map<string, TaskOutput[]> = new Map()

/**
 * 任务信号
 */
const taskStarted = createSignal<[task: Task]>()
const taskCompleted = createSignal<[task: Task, duration: number]>()
const taskFailed = createSignal<[task: Task, error: string]>()
const taskKilled = createSignal<[task: Task]>()
const taskEvicted = createSignal<[taskId: string]>()
const taskOutput = createSignal<[taskId: string, output: TaskOutput]>()
const taskStatusChanged = createSignal<[change: TaskStateChange]>()

/**
 * 轮询定时器
 */
let pollTimer: ReturnType<typeof setInterval> | null = null
let isPolling = false

// ============================================================================
// 任务ID生成
// ============================================================================

/**
 * 生成安全的任务ID
 * 格式: prefix + 8个随机字符
 * 36^8 ≈ 2.8万亿组合，防暴力攻击
 */
export function generateTaskId(type: TaskType): string {
  const prefix = TASK_ID_PREFIXES[type] ?? 'x'
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  const randomPart = Array.from(bytes, b => TASK_ID_ALPHABET[b % 36]).join('')
  return prefix + randomPart
}

// ============================================================================
// 任务注册
// ============================================================================

/**
 * 注册新任务
 */
export function registerTask(options: RegisterTaskOptions): Task {
  const id = options.id ?? generateTaskId(options.type)
  const now = Date.now()

  const task: Task = {
    id,
    type: options.type,
    name: options.name,
    status: 'pending',
    createdAt: now,
    retain: options.retain ?? false,
    retainUntil: options.retainMs 
      ? now + options.retainMs 
      : (options.retain ? now + DEFAULT_RETAIN_MS : undefined),
    notified: false,
    outputOffset: 0
  }

  // 检查是否已存在（替换场景）
  const existing = tasks.get(id)
  if (existing) {
    // 保留UI状态
    task.retain = existing.retain ?? task.retain
    task.startedAt = existing.startedAt
    task.outputOffset = existing.outputOffset ?? 0
    
    // 发送替换信号
    taskOutput.emit(id, {
      content: `[任务已替换]`,
      isError: false,
      timestamp: now
    })
  }

  tasks.set(id, task)
  taskOutputs.set(id, [])

  // 发送任务开始信号
  taskStarted.emit(task)

  // 发送SDK事件
  globalSignalManager.get('taskStarted')?.emit(task)

  // 如果不是pending，立即发送状态变更
  if (task.status !== 'pending') {
    taskStatusChanged.emit({
      taskId: id,
      previousStatus: 'pending',
      newStatus: task.status,
      timestamp: now
    })
  }

  return task
}

/**
 * 更新任务状态
 */
export function updateTaskState(
  taskId: string,
  updates: Partial<Pick<Task, 'status' | 'retain' | 'retainUntil' | 'notified' | 'error'>>
): Task | null {
  const task = tasks.get(taskId)
  if (!task) return null

  const now = Date.now()
  const previousStatus = task.status

  // 应用更新
  if (updates.status !== undefined) {
    task.status = updates.status
    
    // 记录时间
    if (updates.status === 'running' && !task.startedAt) {
      task.startedAt = now
    }
    if (TERMINAL_STATUSES.includes(updates.status) && !task.completedAt) {
      task.completedAt = now
    }
  }

  if (updates.retain !== undefined) {
    task.retain = updates.retain
  }

  if (updates.retainUntil !== undefined) {
    task.retainUntil = updates.retainUntil
  }

  if (updates.notified !== undefined) {
    task.notified = updates.notified
  }

  if (updates.error !== undefined) {
    task.error = updates.error
  }

  // 如果状态变更，发送信号
  if (updates.status !== undefined && updates.status !== previousStatus) {
    taskStatusChanged.emit({
      taskId,
      previousStatus,
      newStatus: updates.status,
      timestamp: now
    })

    // 发送特定状态信号
    if (updates.status === 'completed') {
      const duration = (task.completedAt ?? now) - (task.startedAt ?? task.createdAt)
      taskCompleted.emit(task, duration)
    } else if (updates.status === 'failed') {
      taskFailed.emit(task, task.error ?? 'Unknown error')
    } else if (updates.status === 'killed') {
      taskKilled.emit(task)
    }
  }

  return task
}

/**
 * 任务完成
 */
export function completeTask(taskId: string): Task | null {
  return updateTaskState(taskId, { status: 'completed' })
}

/**
 * 任务失败
 */
export function failTask(taskId: string, error?: string): Task | null {
  return updateTaskState(taskId, { status: 'failed', error })
}

/**
 * 终止任务
 */
export function killTask(taskId: string): Task | null {
  return updateTaskState(taskId, { status: 'killed' })
}

/**
 * 标记任务通知完成
 */
export function notifyTask(taskId: string): Task | null {
  return updateTaskState(taskId, { notified: true })
}

// ============================================================================
// 任务查询
// ============================================================================

/**
 * 获取任务
 */
export function getTask(taskId: string): Task | undefined {
  return tasks.get(taskId)
}

/**
 * 获取所有任务
 */
export function getAllTasks(): Task[] {
  return Array.from(tasks.values())
}

/**
 * 获取运行中的任务
 */
export function getRunningTasks(): Task[] {
  return Array.from(tasks.values()).filter(t => t.status === 'running')
}

/**
 * 获取终端状态的任务
 */
export function getTerminalTasks(): Task[] {
  return Array.from(tasks.values()).filter(t => TERMINAL_STATUSES.includes(t.status))
}

/**
 * 检查任务是否在宽限期内
 */
export function isInGracePeriod(task: Task): boolean {
  if (!task.retainUntil) return false
  return task.retainUntil > Date.now()
}

/**
 * 检查任务是否应该驱逐
 */
export function shouldEvict(task: Task): boolean {
  // 非终端状态不驱逐
  if (!TERMINAL_STATUSES.includes(task.status)) return false
  
  // 已通知但不在宽限期内
  if (task.notified && task.retainUntil) {
    return task.retainUntil <= Date.now()
  }
  
  // 无保留标志且已完成
  if (!task.retain && !task.retainUntil && TERMINAL_STATUSES.includes(task.status)) {
    return true
  }
  
  return false
}

// ============================================================================
// 任务输出
// ============================================================================

/**
 * 添加任务输出
 */
export function addTaskOutput(
  taskId: string,
  content: string,
  isError: boolean = false
): void {
  const output: TaskOutput = {
    content,
    isError,
    timestamp: Date.now()
  }

  // 获取现有输出
  let outputs = taskOutputs.get(taskId)
  if (!outputs) {
    outputs = []
    taskOutputs.set(taskId, outputs)
  }

  outputs.push(output)

  // 更新偏移量
  const task = tasks.get(taskId)
  if (task) {
    task.outputOffset = (task.outputOffset ?? 0) + content.length
  }

  // 发送输出信号
  taskOutput.emit(taskId, output)
}

/**
 * 获取任务输出
 */
export function getTaskOutput(taskId: string): TaskOutput[] {
  return taskOutputs.get(taskId) ?? []
}

/**
 * 获取增量输出（从offset开始）
 */
export function getTaskOutputDelta(taskId: string, offset: number): {
  content: string
  newOffset: number
} {
  const outputs = taskOutputs.get(taskId) ?? []
  
  // 从offset开始累积输出
  let content = ''
  let newOffset = offset

  for (const output of outputs) {
    if (newOffset >= output.content.length) {
      newOffset -= output.content.length
      continue
    }
    content += output.content.slice(newOffset)
    newOffset = 0
  }

  return { content, newOffset: offset + content.length }
}

/**
 * 清除任务输出
 */
export function clearTaskOutput(taskId: string): void {
  taskOutputs.delete(taskId)
  const task = tasks.get(taskId)
  if (task) {
    task.outputOffset = 0
  }
}

// ============================================================================
// 轮询与GC
// ============================================================================

/**
 * 检查需要驱逐的任务
 */
function checkEvictions(): string[] {
  const evicted: string[] = []

  for (const [taskId, task] of tasks) {
    if (shouldEvict(task)) {
      evicted.push(taskId)
    }
  }

  return evicted
}

/**
 * 执行驱逐
 */
function evictTasks(taskIds: string[]): void {
  for (const taskId of taskIds) {
    const task = tasks.get(taskId)
    if (task) {
      taskEvicted.emit(taskId)
      globalSignalManager.get('taskEvicted')?.emit(taskId)
      
      // 清除输出
      taskOutputs.delete(taskId)
      
      // 从任务表移除
      tasks.delete(taskId)
    }
  }
}

/**
 * 轮询任务状态
 */
export function pollTasks(): void {
  // 检查驱逐
  const toEvict = checkEvictions()
  if (toEvict.length > 0) {
    evictTasks(toEvict)
  }

  // 更新保留时间
  const now = Date.now()
  for (const task of tasks.values()) {
    if (task.retainUntil && task.retainUntil <= now && task.notified) {
      // 超过保留时间，标记为可驱逐
      if (!task.retain) {
        task.retainUntil = undefined
      }
    }
  }
}

/**
 * 开始轮询
 */
export function startTaskPolling(intervalMs: number = 1000): void {
  if (pollTimer) return
  
  isPolling = true
  pollTimer = setInterval(() => {
    if (isPolling) {
      pollTasks()
    }
  }, intervalMs)
  
  pollTimer.unref?.()
}

/**
 * 停止轮询
 */
export function stopTaskPolling(): void {
  isPolling = false
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

// ============================================================================
// 批量操作
// ============================================================================

/**
 * 生成任务附件（用于UI展示）
 */
export function generateTaskAttachments(): {
  attachments: TaskAttachment[]
  updatedTaskOffsets: Record<string, number>
  evictedTaskIds: string[]
} {
  const attachments: TaskAttachment[] = []
  const updatedTaskOffsets: Record<string, number> = {}
  const evictedTaskIds: string[] = []

  for (const [taskId, task] of tasks) {
    if (task.status === 'running') {
      // 获取增量输出
      const delta = getTaskOutputDelta(taskId, task.outputOffset ?? 0)
      if (delta.content) {
        attachments.push({
          taskId,
          type: 'output',
          content: delta.content,
          timestamp: Date.now()
        })
        updatedTaskOffsets[taskId] = delta.newOffset
      }
    }

    // 检查驱逐
    if (shouldEvict(task)) {
      evictedTaskIds.push(taskId)
    }
  }

  // 执行驱逐
  if (evictedTaskIds.length > 0) {
    evictTasks(evictedTaskIds)
  }

  return { attachments, updatedTaskOffsets, evictedTaskIds }
}

/**
 * 获取任务统计
 */
export function getTaskStats(): {
  total: number
  byStatus: Record<TaskStatus, number>
  byType: Record<TaskType, number>
  running: number
  completed: number
} {
  const byStatus: Record<TaskStatus, number> = {
    pending: 0,
    running: 0,
    completed: 0,
    failed: 0,
    killed: 0
  }
  const byType: Record<TaskType, number> = {
    bash: 0,
    agent: 0,
    extraction: 0,
    compaction: 0,
    watch: 0,
    cron: 0,
    workflow: 0
  }

  for (const task of tasks.values()) {
    byStatus[task.status]++
    byType[task.type]++
  }

  return {
    total: tasks.size,
    byStatus,
    byType,
    running: byStatus.running,
    completed: byStatus.completed
  }
}

// ============================================================================
// 订阅
// ============================================================================

/**
 * 订阅任务开始
 */
export function onTaskStarted(callback: (task: Task) => void): () => void {
  return taskStarted.subscribe(callback)
}

/**
 * 订阅任务完成
 */
export function onTaskCompleted(callback: (task: Task, duration: number) => void): () => void {
  return taskCompleted.subscribe(callback)
}

/**
 * 订阅任务失败
 */
export function onTaskFailed(callback: (task: Task, error: string) => void): () => void {
  return taskFailed.subscribe(callback)
}

/**
 * 订阅任务终止
 */
export function onTaskKilled(callback: (task: Task) => void): () => void {
  return taskKilled.subscribe(callback)
}

/**
 * 订阅任务驱逐
 */
export function onTaskEvicted(callback: (taskId: string) => void): () => void {
  return taskEvicted.subscribe(callback)
}

/**
 * 订阅任务输出
 */
export function onTaskOutput(callback: (taskId: string, output: TaskOutput) => void): () => void {
  return taskOutput.subscribe(callback)
}

/**
 * 订阅任务状态变更
 */
export function onTaskStatusChanged(callback: (change: TaskStateChange) => void): () => void {
  return taskStatusChanged.subscribe(callback)
}

// ============================================================================
// 重置
// ============================================================================

/**
 * 重置所有任务
 */
export function resetAllTasks(): void {
  tasks.clear()
  taskOutputs.clear()
  stopTaskPolling()
}

/**
 * 移除单个任务
 */
export function removeTask(taskId: string): boolean {
  taskOutputs.delete(taskId)
  return tasks.delete(taskId)
}

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 判断是否为终端状态
 */
export function isTerminalStatus(status: TaskStatus): boolean {
  return TERMINAL_STATUSES.includes(status)
}

/**
 * 获取任务持续时间
 */
export function getTaskDuration(task: Task): number {
  const end = task.completedAt ?? Date.now()
  const start = task.startedAt ?? task.createdAt
  return end - start
}

/**
 * 格式化任务信息
 */
export function formatTask(task: Task): string {
  const parts = [task.name]
  parts.push(task.status)
  
  if (task.startedAt) {
    const duration = getTaskDuration(task)
    parts.push(`${Math.round(duration / 1000)}s`)
  }
  
  if (task.error) {
    parts.push(`[${task.error}]`)
  }
  
  return parts.join(' · ')
}
