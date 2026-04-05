/**
 * Signal System v2.2 - 轻量级事件信号机制
 * 
 * 源自Claude Code的信号系统实现
 * 用于"发生了什么"类型的事件通知
 */

/**
 * 信号接口
 * 轻量级发布-订阅模式
 */
export interface Signal<Args extends unknown[] = []> {
  subscribe(listener: (...args: Args) => void): () => void
  emit(...args: Args): void
  clear(): void
}

/**
 * 创建一个新的信号
 * @example
 * const sessionSwitched = createSignal<[sessionId: string]>()
 * 
 * // 订阅
 * const unsubscribe = sessionSwitched.subscribe((sessionId) => {
 *   console.log('Session switched to:', sessionId)
 * })
 * 
 * // 发布
 * sessionSwitched.emit('new-session-id')
 * 
 * // 取消订阅
 * unsubscribe()
 */
export function createSignal<Args extends unknown[] = []>(): Signal<Args> {
  const listeners = new Set<(...args: Args) => void>()

  return {
    subscribe(listener: (...args: Args) => void): () => void {
      listeners.add(listener)
      // 返回取消订阅函数
      return () => listeners.delete(listener)
    },

    emit(...args: Args): void {
      for (const listener of listeners) {
        listener(...args)
      }
    },

    clear(): void {
      listeners.clear()
    }
  }
}

// ============================================================================
// 预定义系统信号
// ============================================================================

/**
 * 会话切换信号
 * 参数: [sessionId: string, previousSessionId: string | null]
 */
export const sessionSwitched = createSignal<[sessionId: string, previousSessionId: string | null]>()

/**
 * 记忆提取完成信号
 * 参数: [memoryType: string, filePath: string]
 */
export const memoryExtracted = createSignal<[memoryType: string, filePath: string]>()

/**
 * 记忆保存完成信号
 * 参数: [memoryType: string, filePath: string, name: string]
 */
export const memorySaved = createSignal<[memoryType: string, filePath: string, name: string]>()

/**
 * 记忆删除信号
 * 参数: [filePath: string]
 */
export const memoryDeleted = createSignal<[filePath: string]>()

/**
 * 压缩开始信号
 * 参数: [originalMessageCount: number]
 */
export const compactionStarted = createSignal<[originalMessageCount: number]>()

/**
 * 压缩完成信号
 * 参数: [keptMessageCount: number, removedMessageCount: number]
 */
export const compactionCompleted = createSignal<[keptMessageCount: number, removedMessageCount: number]>()

/**
 * 系统初始化完成信号
 * 参数: []
 */
export const systemInitialized = createSignal<[]>()

/**
 * 错误发生信号
 * 参数: [error: Error, context: string]
 */
export const errorOccurred = createSignal<[error: Error, context: string]>()

/**
 * 配置更新信号
 * 参数: [configKey: string, newValue: unknown]
 */
export const configUpdated = createSignal<[configKey: string, newValue: unknown]>()

// ============================================================================
// 信号管理器
// ============================================================================

/**
 * 信号管理器
 * 用于批量管理和调试信号
 */
export class SignalManager {
  private signals = new Map<string, Signal<unknown[]>>()
  private emissionLog: Array<{ signal: string; time: number; args: unknown[] }> = []

  /**
   * 注册一个信号
   */
  register<Args extends unknown[]>(name: string, signal?: Signal<Args>): Signal<Args> {
    const s = signal || createSignal<Args>()
    this.signals.set(name, s)
    return s
  }

  /**
   * 获取已注册的信号
   */
  get<Args extends unknown[]>(name: string): Signal<Args> | undefined {
    return this.signals.get(name) as Signal<Args> | undefined
  }

  /**
   * 获取所有已注册的信号名称
   */
  list(): string[] {
    return Array.from(this.signals.keys())
  }

  /**
   * 获取发射日志（用于调试）
   */
  getEmissionLog(limit?: number): Array<{ signal: string; time: number; args: unknown[] }> {
    return limit ? this.emissionLog.slice(-limit) : [...this.emissionLog]
  }

  /**
   * 清空发射日志
   */
  clearEmissionLog(): void {
    this.emissionLog = []
  }

  /**
   * 清空所有信号
   */
  clearAll(): void {
    for (const signal of this.signals.values()) {
      signal.clear()
    }
    this.signals.clear()
    this.emissionLog = []
  }
}

// 导出全局信号管理器实例
export const globalSignalManager = new SignalManager()

// ============================================================================
// 工具函数
// ============================================================================

/**
 * 创建一个一次性信号
 * 触发一次后自动清除
 */
export function createOneTimeSignal<Args extends unknown[] = []>(): Signal<Args> {
  let fired = false
  const signal = createSignal<Args>()

  return {
    subscribe(listener: (...args: Args) => void): () => void {
      if (fired) {
        // 已经触发过，立即调用一次然后返回空函数
        return () => {}
      }
      return signal.subscribe((...args) => {
        listener(...args)
        fired = true
        signal.clear()
      })
    },
    emit(...args: Args): void {
      if (!fired) {
        fired = true
        signal.emit(...args)
        signal.clear()
      }
    },
    clear(): void {
      signal.clear()
    }
  }
}

/**
 * 创建一个防抖信号
 * 连续调用只在最后一次触发后延迟执行
 */
export function createDebouncedSignal<Args extends unknown[] = []>(
  delayMs: number = 300
): Signal<Args> {
  let timeout: ReturnType<typeof setTimeout> | null = null
  let pendingArgs: Args | null = null
  const signal = createSignal<Args>()

  return {
    subscribe(listener: (...args: Args) => void): () => void {
      return signal.subscribe(listener)
    },
    emit(...args: Args): void {
      pendingArgs = args
      if (timeout) {
        clearTimeout(timeout)
      }
      timeout = setTimeout(() => {
        if (pendingArgs) {
          signal.emit(...pendingArgs)
        }
        timeout = null
        pendingArgs = null
      }, delayMs)
    },
    clear(): void {
      if (timeout) {
        clearTimeout(timeout)
        timeout = null
      }
      pendingArgs = null
      signal.clear()
    }
  }
}

// ============================================================================
// 类型守卫
// ============================================================================

export function isSignal(value: unknown): value is Signal<unknown[]> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'subscribe' in value &&
    'emit' in value &&
    'clear' in value &&
    typeof (value as Signal<unknown[]>).subscribe === 'function' &&
    typeof (value as Signal<unknown[]>).emit === 'function' &&
    typeof (value as Signal<unknown[]>).clear === 'function'
  )
}
