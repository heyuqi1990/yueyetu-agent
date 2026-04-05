/**
 * Forked Agent v2.2 - 后台异步Agent执行
 * 
 * 源自Claude Code的runForkedAgent机制
 * 支持后台forked运行，不阻塞主会话
 */

import { spawn, ChildProcess } from 'child_process'
import { randomBytes } from 'crypto'
import { createSignal } from './signal'
import { registerTask, completeTask, failTask, addTaskOutput, type TaskType } from './taskFramework'

// ============================================================================
// 类型定义
// ============================================================================

export interface ForkedAgentResult {
  success: boolean
  output: string
  error?: string
  exitCode: number | null
  duration: number
}

export interface ForkedAgentOptions {
  id?: string
  type?: TaskType
  name?: string
  retain?: boolean
  timeout?: number  // 超时毫秒
  env?: Record<string, string>
  cwd?: string
}

export interface ForkedAgentInstance {
  id: string
  taskId: string
  pid: number
  startedAt: number
  promise: Promise<ForkedAgentResult>
  process: ChildProcess | null
  killed: boolean
}

// ============================================================================
// 全局管理
// ============================================================================

const forkedAgents = new Map<string, ForkedAgentInstance>()
const agentQueue: string[] = []
let isProcessingQueue = false

// 信号
const agentStarted = createSignal<[id: string, pid: number]>()
const agentCompleted = createSignal<[id: string, result: ForkedAgentResult]>()
const agentFailed = createSignal<[id: string, error: string]>()
const agentKilled = createSignal<[id: string]>()
const agentOutput = createSignal<[id: string, chunk: string]>()
const queueChanged = createSignal<[queueLength: number]>()

// ============================================================================
// 核心函数
// ============================================================================

/**
 * 生成Agent ID
 */
function generateAgentId(): string {
  return `fork_${Date.now().toString(36)}_${randomBytes(4).toString('hex')}`
}

/**
 * 执行后台Agent
 */
export async function runForkedAgent(
  prompt: string,
  options?: ForkedAgentOptions
): Promise<ForkedAgentResult> {
  const id = options?.id ?? generateAgentId()
  const startedAt = Date.now()

  // 注册任务框架
  const task = registerTask({
    id: options?.id ? `fork_${options.id}` : undefined,
    type: options?.type ?? 'agent',
    name: options?.name ?? `Forked Agent: ${prompt.slice(0, 50)}...`,
    retain: options?.retain ?? true
  })

  // 创建Promise
  const promise = new Promise<ForkedAgentResult>((resolve) => {
    // 超时控制
    let timeoutId: NodeJS.Timeout | null = null
    if (options?.timeout) {
      timeoutId = setTimeout(() => {
        killForkedAgent(id)
        resolve({
          success: false,
          output: '',
          error: `Timeout after ${options.timeout}ms`,
          exitCode: null,
          duration: Date.now() - startedAt
        })
      }, options.timeout)
    }

    // 模拟forked agent执行
    // 在实际实现中，这里会spawn子进程
    const duration = 1000 + Math.random() * 2000
    
    const process = setTimeout(() => {
      if (timeoutId) clearTimeout(timeoutId)
      
      const result: ForkedAgentResult = {
        success: true,
        output: `[模拟执行] ${prompt}`,
        exitCode: 0,
        duration: Date.now() - startedAt
      }
      
      completeTask(task.id)
      resolve(result)
    }, duration) as unknown as ChildProcess

    // 保存实例
    forkedAgents.set(id, {
      id,
      taskId: task.id,
      pid: 0, // 模拟PID
      startedAt,
      promise,
      process,
      killed: false
    })

    // 发送启动信号
    agentStarted.emit(id, 0)
  })

  // 添加到队列
  agentQueue.push(id)
  queueChanged.emit(agentQueue.length)

  // 处理队列
  processQueue()

  return promise
}

/**
 * 处理队列
 */
async function processQueue(): Promise<void> {
  if (isProcessingQueue) return
  isProcessingQueue = true

  while (agentQueue.length > 0) {
    const id = agentQueue.shift()
    if (id) {
      queueChanged.emit(agentQueue.length)
      
      // 检查是否还存在
      const instance = forkedAgents.get(id)
      if (!instance || instance.killed) {
        continue
      }

      // 执行结果已通过promise处理
      // 这里可以做额外的队列处理逻辑
    }
  }

  isProcessingQueue = false
}

/**
 * 终止后台Agent
 */
export function killForkedAgent(id: string): boolean {
  const instance = forkedAgents.get(id)
  if (!instance) return false

  instance.killed = true

  // 终止进程
  if (instance.process) {
    if (typeof instance.process.kill === 'function') {
      instance.process.kill()
    } else {
      // 模拟的setTimeout需要clear
      clearTimeout(instance.process as unknown as NodeJS.Timeout)
    }
  }

  // 更新任务状态
  failTask(instance.taskId, 'Killed by user')

  // 发送信号
  agentKilled.emit(id)

  // 从队列移除
  const queueIndex = agentQueue.indexOf(id)
  if (queueIndex >= 0) {
    agentQueue.splice(queueIndex, 1)
    queueChanged.emit(agentQueue.length)
  }

  return true
}

/**
 * 获取Agent实例
 */
export function getForkedAgent(id: string): ForkedAgentInstance | undefined {
  return forkedAgents.get(id)
}

/**
 * 获取所有运行中的Agent
 */
export function getRunningForkedAgents(): ForkedAgentInstance[] {
  return Array.from(forkedAgents.values()).filter(a => !a.killed)
}

/**
 * 获取队列长度
 */
export function getQueueLength(): number {
  return agentQueue.length
}

// ============================================================================
// 真实实现（基于子进程）
// ============================================================================

/**
 * 使用真实子进程执行
 */
export async function runForkedAgentWithProcess(
  command: string,
  args: string[] = [],
  options?: ForkedAgentOptions & { env?: Record<string, string>; cwd?: string }
): Promise<ForkedAgentResult> {
  const id = options?.id ?? generateAgentId()
  const startedAt = Date.now()

  const task = registerTask({
    id: options?.id ? `fork_${options.id}` : undefined,
    type: 'bash',
    name: options?.name ?? `Process: ${command}`,
    retain: options?.retain ?? true
  })

  return new Promise((resolve) => {
    const proc = spawn(command, args, {
      env: { ...process.env, ...options?.env },
      cwd: options?.cwd ?? process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe']
    })

    let output = ''
    let errorOutput = ''

    proc.stdout?.on('data', (data) => {
      const chunk = data.toString()
      output += chunk
      addTaskOutput(task.id, chunk)
      agentOutput.emit(id, chunk)
    })

    proc.stderr?.on('data', (data) => {
      const chunk = data.toString()
      errorOutput += chunk
      addTaskOutput(task.id, chunk, true)
      agentOutput.emit(id, chunk)
    })

    proc.on('close', (code) => {
      const result: ForkedAgentResult = {
        success: code === 0,
        output,
        error: errorOutput || undefined,
        exitCode: code,
        duration: Date.now() - startedAt
      }

      if (code === 0) {
        completeTask(task.id)
        agentCompleted.emit(id, result)
      } else {
        failTask(task.id, `Exit code: ${code}`)
        agentFailed.emit(id, errorOutput || `Exit code: ${code}`)
      }

      forkedAgents.delete(id)
      resolve(result)
    })

    proc.on('error', (err) => {
      const result: ForkedAgentResult = {
        success: false,
        output,
        error: err.message,
        exitCode: null,
        duration: Date.now() - startedAt
      }

      failTask(task.id, err.message)
      agentFailed.emit(id, err.message)
      forkedAgents.delete(id)
      resolve(result)
    })

    // 超时控制
    if (options?.timeout) {
      setTimeout(() => {
        proc.kill()
        const result: ForkedAgentResult = {
          success: false,
          output,
          error: `Timeout after ${options.timeout}ms`,
          exitCode: null,
          duration: Date.now() - startedAt
        }
        forkedAgents.delete(id)
        resolve(result)
      }, options.timeout)
    }

    // 保存实例
    forkedAgents.set(id, {
      id,
      taskId: task.id,
      pid: proc.pid,
      startedAt,
      promise: Promise.resolve(result),
      process: proc,
      killed: false
    })

    agentStarted.emit(id, proc.pid)
  })
}

// ============================================================================
// 订阅
// ============================================================================

export function onAgentStarted(callback: (id: string, pid: number) => void): () => void {
  return agentStarted.subscribe(callback)
}

export function onAgentCompleted(callback: (id: string, result: ForkedAgentResult) => void): () => void {
  return agentCompleted.subscribe(callback)
}

export function onAgentFailed(callback: (id: string, error: string) => void): () => void {
  return agentFailed.subscribe(callback)
}

export function onAgentKilled(callback: (id: string) => void): () => void {
  return agentKilled.subscribe(callback)
}

export function onAgentOutput(callback: (id: string, chunk: string) => void): () => void {
  return agentOutput.subscribe(callback)
}

export function onQueueChanged(callback: (queueLength: number) => void): () => void {
  return queueChanged.subscribe(callback)
}

// ============================================================================
// 工具
// ============================================================================

/**
 * 终止所有Agent
 */
export function killAllForkedAgents(): number {
  let count = 0
  for (const [id] of forkedAgents) {
    if (killForkedAgent(id)) count++
  }
  return count
}

/**
 * 获取Agent统计
 */
export function getForkedAgentStats(): {
  running: number
  queueLength: number
  total: number
} {
  return {
    running: getRunningForkedAgents().length,
    queueLength: agentQueue.length,
    total: forkedAgents.size
  }
}
