/**
 * Session Cron Scheduler v2.2 - 会话级定时任务
 * 
 * 基于State系统中的SessionCronTask
 * 实现定时任务的注册、调度和执行
 */

import { addSessionCronTask as addToState, removeSessionCronTask as removeFromState, getSessionCronTasks, type SessionCronTask } from './state'
import { registerTask, completeTask, failTask, addTaskOutput, type TaskType } from './taskFramework'
import { globalSignalManager } from './signal'

// ============================================================================
// 类型定义
// ============================================================================

/**
 * Cron任务配置
 */
export interface CronTaskConfig {
  id?: string
  cron: string                    // Cron表达式
  prompt: string                  // 执行的prompt
  type?: TaskType                 // 任务类型，默认agent
  recurring?: boolean             // 是否重复，默认true
  agentId?: string               // 关联的agent
  enabled?: boolean              // 是否启用
  tags?: string[]                // 标签
  description?: string           // 描述
  maxRuns?: number              // 最大执行次数（0=无限）
  timeoutMs?: number            // 超时时间
}

/**
 * Cron任务实例（运行时）
 */
export interface CronTaskInstance extends CronTaskConfig {
  id: string
  createdAt: number
  lastRunAt?: number
  nextRunAt?: number
  runCount: number
  status: 'pending' | 'running' | 'paused' | 'stopped'
  lastError?: string
}

/**
 * Cron执行结果
 */
export interface CronExecutionResult {
  taskId: string
  cronTaskId: string
  success: boolean
  startTime: number
  endTime: number
  duration: number
  output?: string
  error?: string
}

/**
 * Cron事件
 */
export interface CronTaskEvent {
  type: 'registered' | 'executed' | 'completed' | 'failed' | 'removed'
  task: CronTaskInstance
  timestamp: number
  result?: CronExecutionResult
}

// ============================================================================
// Cron解析器（简化版）
// ============================================================================

/**
 * 解析cron表达式
 * 支持: * * * * * (分 时 日 月 周)
 */
export function parseCron(cron: string): {
  next: (from?: number) => number | null
  isValid: boolean
} {
  const parts = cron.trim().split(/\s+/)
  
  if (parts.length < 5 || parts.length > 6) {
    return { next: () => null, isValid: false }
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts

  function matches(value: number, pattern: string): boolean {
    if (pattern === '*') return true
    
    // 列表 (e.g., 1,2,3)
    if (pattern.includes(',')) {
      return pattern.split(',').some(p => matches(value, p.trim()))
    }
    
    // 范围 (e.g., 1-5)
    if (pattern.includes('-')) {
      const [start, end] = pattern.split('-').map(Number)
      return value >= start && value <= end
    }
    
    // 步进 (e.g., */5)
    if (pattern.includes('/')) {
      const [, step] = pattern.split('/')
      return value % Number(step) === 0
    }
    
    return value === Number(pattern)
  }

  function calculateNext(from: number): number | null {
    const date = new Date(from)
    
    // 最多尝试100年
    for (let i = 0; i < 365 * 100; i++) {
      date.setTime(from + i * 60 * 1000) // 每次加1分钟
      
      const min = date.getMinutes()
      const hr = date.getHours()
      const dom = date.getDate()
      const mon = date.getMonth() + 1
      const dow = date.getDay()
      
      if (
        matches(min, minute) &&
        matches(hr, hour) &&
        matches(dom, dayOfMonth) &&
        matches(mon, month) &&
        matches(dow, dayOfWeek)
      ) {
        return date.getTime()
      }
    }
    
    return null
  }

  return {
    next: calculateNext,
    isValid: true
  }
}

/**
 * 验证cron表达式
 */
export function isValidCron(cron: string): boolean {
  return parseCron(cron).isValid
}

/**
 * 获取下次执行时间
 */
export function getNextRunTime(cron: string, from?: number): number | null {
  return parseCron(cron).next(from ?? Date.now())
}

// ============================================================================
// Cron任务表
// ============================================================================

/**
 * 全局Cron任务表
 */
let cronTasks: Map<string, CronTaskInstance> = new Map()

/**
 * 轮询定时器
 */
let pollInterval: ReturnType<typeof setInterval> | null = null
let isRunning = false

/**
 * Cron事件信号
 */
const cronTaskRegistered = globalSignalManager.register<CronTaskInstance>('cronTaskRegistered')
const cronTaskExecuted = globalSignalManager.register<CronExecutionResult>('cronTaskExecuted')
const cronTaskCompleted = globalSignalManager.register<CronExecutionResult>('cronTaskCompleted')
const cronTaskFailed = globalSignalManager.register<CronExecutionResult>('cronTaskFailed')
const cronTaskRemoved = globalSignalManager.register<[taskId: string]>('cronTaskRemoved')

// ============================================================================
// 任务注册
// ============================================================================

/**
 * 注册Cron任务
 */
export function registerCronTask(config: CronTaskConfig): string {
  // 生成ID
  const id = config.id ?? `cron_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
  
  // 解析cron获取下次执行时间
  const parsed = parseCron(config.cron)
  if (!parsed.isValid) {
    throw new Error(`Invalid cron expression: ${config.cron}`)
  }

  const now = Date.now()
  const instance: CronTaskInstance = {
    ...config,
    id,
    createdAt: now,
    nextRunAt: parsed.next(now),
    runCount: 0,
    status: config.enabled !== false ? 'pending' : 'paused',
    type: config.type ?? 'agent',
    recurring: config.recurring ?? true,
    enabled: config.enabled ?? true
  }

  cronTasks.set(id, instance)

  // 同步到State
  addToState({
    id,
    cron: config.cron,
    prompt: config.prompt,
    createdAt: now,
    recurring: config.recurring,
    agentId: config.agentId
  })

  // 发送信号
  cronTaskRegistered.emit(instance)
  globalSignalManager.get('cronTaskRegistered')?.emit(instance)

  return id
}

/**
 * 移除Cron任务
 */
export function removeCronTask(taskId: string): boolean {
  const task = cronTasks.get(taskId)
  if (!task) return false

  cronTasks.delete(taskId)
  removeFromState(taskId)

  cronTaskRemoved.emit(taskId)
  globalSignalManager.get('cronTaskRemoved')?.emit(taskId)

  return true
}

/**
 * 启用Cron任务
 */
export function enableCronTask(taskId: string): boolean {
  const task = cronTasks.get(taskId)
  if (!task) return false

  task.enabled = true
  task.status = 'pending'

  // 重新计算下次执行时间
  const parsed = parseCron(task.cron)
  if (parsed.isValid) {
    task.nextRunAt = parsed.next(Date.now())
  }

  return true
}

/**
 * 暂停Cron任务
 */
export function pauseCronTask(taskId: string): boolean {
  const task = cronTasks.get(taskId)
  if (!task) return false

  task.enabled = false
  task.status = 'paused'

  return true
}

/**
 * 更新Cron任务
 */
export function updateCronTask(taskId: string, updates: Partial<CronTaskConfig>): boolean {
  const task = cronTasks.get(taskId)
  if (!task) return false

  // 如果更新了cron，重新计算下次执行时间
  if (updates.cron) {
    const parsed = parseCron(updates.cron)
    if (!parsed.isValid) {
      return false
    }
    task.nextRunAt = parsed.next(Date.now())
  }

  // 应用其他更新
  Object.assign(task, updates)

  return true
}

// ============================================================================
// 任务执行
// ============================================================================

/**
 * 执行Cron任务
 */
async function executeCronTask(task: CronTaskInstance): Promise<CronExecutionResult> {
  const startTime = Date.now()
  const result: CronExecutionResult = {
    taskId: task.id,
    cronTaskId: task.id,
    success: false,
    startTime,
    endTime: startTime,
    duration: 0
  }

  // 更新状态
  task.status = 'running'
  task.lastRunAt = startTime
  task.runCount++

  cronTaskExecuted.emit(result)
  globalSignalManager.get('cronTaskExecuted')?.emit(result)

  // 注册为任务框架中的任务
  const frameworkTask = registerTask({
    type: task.type ?? 'agent',
    name: `[Cron] ${task.description ?? task.prompt.slice(0, 50)}...`,
    retain: true,
    retainMs: 5000
  })

  try {
    // 添加初始输出
    addTaskOutput(frameworkTask.id, `开始执行Cron任务: ${task.prompt}\n`, false)

    // 执行超时控制
    const timeoutMs = task.timeoutMs ?? 60000
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Task timed out after ${timeoutMs}ms`)), timeoutMs)
    })

    // 实际执行（这里应该调用实际的agent执行）
    const executePromise = executePrompt(task.prompt, frameworkTask.id)

    await Promise.race([executePromise, timeoutPromise])

    // 成功
    result.success = true
    result.endTime = Date.now()
    result.duration = result.endTime - result.startTime
    result.output = `执行完成`

    completeTask(frameworkTask.id)
    addTaskOutput(frameworkTask.id, `Cron任务执行成功\n`, false)

    cronTaskCompleted.emit(result)
    globalSignalManager.get('cronTaskCompleted')?.emit(result)

  } catch (error) {
    // 失败
    result.success = false
    result.endTime = Date.now()
    result.duration = result.endTime - result.startTime
    result.error = error instanceof Error ? error.message : String(error)
    result.output = `执行失败: ${result.error}`

    failTask(frameworkTask.id, result.error)
    addTaskOutput(frameworkTask.id, `Cron任务执行失败: ${result.error}\n`, true)

    task.lastError = result.error

    cronTaskFailed.emit(result)
    globalSignalManager.get('cronTaskFailed')?.emit(result)
  }

  // 更新下次执行时间（如果是重复任务）
  if (task.recurring && task.maxRuns !== 0) {
    const parsed = parseCron(task.cron)
    if (parsed.isValid) {
      task.nextRunAt = parsed.next(Date.now())
    }
    task.status = 'pending'
  } else {
    // 非重复任务或达到最大执行次数，停止
    task.status = 'stopped'
  }

  // 更新最后执行时间
  task.lastRunAt = result.endTime

  return result
}

/**
 * 执行prompt（需要集成实际的agent执行）
 */
async function executePrompt(prompt: string, frameworkTaskId: string): Promise<void> {
  // 这里应该调用实际的agent执行
  // 目前是占位实现
  addTaskOutput(frameworkTaskId, `[模拟] 执行prompt: ${prompt.slice(0, 100)}...\n`, false)
  
  // 模拟执行延迟
  await new Promise(resolve => setTimeout(resolve, 1000))
  
  addTaskOutput(frameworkTaskId, `[模拟] 执行完成\n`, false)
}

// ============================================================================
// 轮询调度
// ============================================================================

/**
 * 检查并执行到期的任务
 */
async function checkAndExecute(): Promise<void> {
  if (!isRunning) return

  const now = Date.now()

  for (const task of cronTasks.values()) {
    // 跳过不启用的任务
    if (!task.enabled || task.status !== 'pending') continue

    // 检查是否到期
    if (task.nextRunAt && task.nextRunAt <= now) {
      // 检查最大执行次数
      if (task.maxRuns !== undefined && task.maxRuns !== 0 && task.runCount >= task.maxRuns) {
        task.status = 'stopped'
        continue
      }

      // 执行任务
      await executeCronTask(task)
    }
  }
}

/**
 * 开始调度
 */
export function startCronScheduler(intervalMs: number = 1000 * 60): void {
  if (pollInterval) return

  isRunning = true
  pollInterval = setInterval(checkAndExecute, intervalMs)
  pollInterval.unref?.()

  // 立即执行一次检查
  checkAndExecute()
}

/**
 * 停止调度
 */
export function stopCronScheduler(): void {
  isRunning = false
  if (pollInterval) {
    clearInterval(pollInterval)
    pollInterval = null
  }
}

/**
 * 获取调度器状态
 */
export function isCronSchedulerRunning(): boolean {
  return isRunning
}

// ============================================================================
// 查询
// ============================================================================

/**
 * 获取所有Cron任务
 */
export function getAllCronTasks(): CronTaskInstance[] {
  return Array.from(cronTasks.values())
}

/**
 * 获取运行中的Cron任务
 */
export function getRunningCronTasks(): CronTaskInstance[] {
  return Array.from(cronTasks.values()).filter(t => t.status === 'running')
}

/**
 * 获取待执行的Cron任务
 */
export function getPendingCronTasks(): CronTaskInstance[] {
  return Array.from(cronTasks.values()).filter(t => t.status === 'pending')
}

/**
 * 获取指定任务
 */
export function getCronTask(taskId: string): CronTaskInstance | undefined {
  return cronTasks.get(taskId)
}

/**
 * 获取即将执行的任务
 */
export function getUpcomingCronTasks(limit: number = 5): CronTaskInstance[] {
  return Array.from(cronTasks.values())
    .filter(t => t.enabled && t.status === 'pending' && t.nextRunAt)
    .sort((a, b) => (a.nextRunAt ?? 0) - (b.nextRunAt ?? 0))
    .slice(0, limit)
}

/**
 * 获取Cron任务统计
 */
export function getCronTaskStats(): {
  total: number
  pending: number
  running: number
  paused: number
  stopped: number
  totalRuns: number
} {
  let totalRuns = 0
  const counts = {
    total: cronTasks.size,
    pending: 0,
    running: 0,
    paused: 0,
    stopped: 0
  }

  for (const task of cronTasks.values()) {
    counts[task.status]++
    totalRuns += task.runCount
  }

  return { ...counts, totalRuns }
}

// ============================================================================
// 预设快捷方法
// ============================================================================

/**
 * 每N分钟执行
 */
export function everyMinutes(minutes: number, prompt: string, config?: Partial<CronTaskConfig>): string {
  const cron = `*/${minutes} * * * *`
  return registerCronTask({
    cron,
    prompt,
    description: `Every ${minutes} minutes`,
    ...config
  })
}

/**
 * 每小时执行
 */
export function hourly(prompt: string, config?: Partial<CronTaskConfig>): string {
  const cron = '0 * * * *'
  return registerCronTask({
    cron,
    prompt,
    description: 'Hourly',
    ...config
  })
}

/**
 * 每天执行
 */
export function daily(hour: number = 0, minute: number = 0, prompt: string, config?: Partial<CronTaskConfig>): string {
  const cron = `${minute} ${hour} * * *`
  return registerCronTask({
    cron,
    prompt,
    description: `Daily at ${hour}:${minute.toString().padStart(2, '0')}`,
    ...config
  })
}

/**
 * 每周执行
 */
export function weekly(dayOfWeek: number, hour: number = 0, minute: number = 0, prompt: string, config?: Partial<CronTaskConfig>): string {
  const cron = `${minute} ${hour} * * ${dayOfWeek}`
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  return registerCronTask({
    cron,
    prompt,
    description: `Weekly on ${dayNames[dayOfWeek]} at ${hour}:${minute.toString().padStart(2, '0')}`,
    ...config
  })
}

/**
 * 只执行一次（在指定时间）
 */
export function once(timestamp: number, prompt: string, config?: Partial<CronTaskConfig>): string {
  const date = new Date(timestamp)
  const cron = `${date.getMinutes()} ${date.getHours()} ${date.getDate()} ${date.getMonth() + 1} *`
  return registerCronTask({
    cron,
    prompt,
    description: `One-time at ${date.toLocaleString()}`,
    recurring: false,
    maxRuns: 1,
    ...config
  })
}

// ============================================================================
// 导入/导出
// ============================================================================

/**
 * 导出所有任务配置
 */
export function exportCronTasks(): string {
  const tasks = getAllCronTasks().map(t => {
    const { id, cron, prompt, type, recurring, agentId, enabled, tags, description, maxRuns, timeoutMs } = t
    return { id, cron, prompt, type, recurring, agentId, enabled, tags, description, maxRuns, timeoutMs }
  })
  return JSON.stringify(tasks, null, 2)
}

/**
 * 导入任务配置
 */
export function importCronTasks(json: string): number {
  try {
    const tasks = JSON.parse(json)
    let count = 0

    for (const task of tasks) {
      try {
        registerCronTask(task)
        count++
      } catch {
        // 忽略单个任务导入失败
      }
    }

    return count
  } catch {
    return 0
  }
}

/**
 * 清空所有Cron任务
 */
export function clearAllCronTasks(): void {
  for (const taskId of cronTasks.keys()) {
    removeCronTask(taskId)
  }
}

// ============================================================================
// 工具函数
// ============================================================================

/**
 * 格式化下次执行时间
 */
export function formatNextRun(cron: string, from?: number): string {
  const next = getNextRunTime(cron, from)
  if (!next) return 'Never'
  
  const diff = next - Date.now()
  if (diff <= 0) return 'Now'
  
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  
  if (days > 0) return `in ${days}d ${hours % 24}h`
  if (hours > 0) return `in ${hours}h ${minutes % 60}m`
  return `in ${minutes}m`
}

/**
 * 获取cron描述
 */
export function describeCron(cron: string): string {
  const parts = cron.trim().split(/\s+/)
  if (parts.length < 5) return 'Invalid'

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts

  // 简化描述
  if (minute.startsWith('*/')) return `Every ${minute.slice(2)} minutes`
  if (hour === '*' && minute !== '*') return `At minute ${minute} of every hour`
  if (dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return `Daily at ${hour}:${minute.padStart(2, '0')}`
  }
  if (dayOfMonth === '*' && dayOfWeek !== '*') {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    return `Every ${days[parseInt(dayOfWeek)]} at ${hour}:${minute.padStart(2, '0')}`
  }
  if (minute === '0' && hour === '0' && dayOfMonth === '*') return 'At midnight'
  if (minute === '0' && hour === '12') return 'At noon'

  return cron
}
