/**
 * Hook System v1.0 - 官方Hooks系统
 * 
 * 源自Claude Code的Hook设计
 * 支持事件驱动Hook、异步Hook、多种Hook类型
 * 
 * Hook目录: ~/.openclaw/hooks/
 * 格式: {event}.{type}.{name}.{ext}
 * 示例: SessionStart.exec.prompt.my-hook.sh
 */

// ============================================================================
// 导入
// ============================================================================

import { createSignal } from './signal'
import { exec } from 'child_process'
import { promisify } from 'util'
import { readdir, access, readFile } from 'fs/promises'
import { join, basename, extname } from 'path'

const execAsync = promisify(exec)

// ============================================================================
// 类型定义
// ============================================================================

/**
 * Hook事件类型
 */
export type HookEvent = 
  | 'SessionStart'     // 会话开始
  | 'Setup'            // 初始化
  | 'CanUseTool'       // 工具调用前
  | 'ToolResult'       // 工具结果
  | 'Message'          // 消息
  | 'Assistant'        // 助手回复
  | 'User'            // 用户消息
  | 'Compaction'       // 压缩前
  | 'SessionEnd'       // 会话结束
  | 'Error'           // 错误发生

/**
 * Hook类型
 */
export type HookType = 'prompt' | 'agent' | 'http' | 'exec'

/**
 * Hook配置
 */
export interface HookConfig {
  name: string
  event: HookEvent
  type: HookType
  enabled: boolean
  timeout: number       // 超时ms
  retry: number         // 重试次数
  blocking: boolean     // 是否阻塞主流程
  path: string
}

/**
 * Hook执行结果
 */
export interface HookResult {
  success: boolean
  output?: string
  error?: string
  duration: number
  hookName: string
}

/**
 * Hook执行上下文
 */
export interface HookContext {
  event: HookEvent
  sessionId: string
  timestamp: number
  data?: any
}

// ============================================================================
// 常量
// ============================================================================

const HOOKS_DIR = join(process.env.HOME || '~', '.openclaw', 'hooks')
const DEFAULT_TIMEOUT = 15000  // 15秒
const DEFAULT_RETRY = 0

// 支持的事件
const HOOK_EVENTS: HookEvent[] = [
  'SessionStart', 'Setup', 'CanUseTool', 'ToolResult',
  'Message', 'Assistant', 'User', 'Compaction', 'SessionEnd', 'Error'
]

// ============================================================================
// 存储
// ============================================================================

let hooks: Map<string, HookConfig> = new Map()
let isInitialized = false

// 信号
const hookStarted = createSignal<[hookName: string, event: HookEvent]>()
const hookCompleted = createSignal<[result: HookResult]>()
const hookFailed = createSignal<[hookName: string, error: string]>()
const hookEventEmitted = createSignal<[event: HookEvent, context: HookContext]>()

// ============================================================================
// 初始化
// ============================================================================

/**
 * 初始化Hook系统
 */
export async function initializeHookSystem(): Promise<void> {
  if (isInitialized) return
  
  console.log('[HookSystem] 初始化Hook系统...')
  
  // 确保hooks目录存在
  try {
    await access(HOOKS_DIR)
  } catch {
    // 目录不存在，创建示例
    await createExampleHooks()
  }
  
  // 扫描并注册hooks
  await scanAndRegisterHooks()
  
  isInitialized = true
  console.log(`[HookSystem] 已加载 ${hooks.size} 个Hooks`)
}

/**
 * 创建示例Hooks
 */
async function createExampleHooks(): Promise<void> {
  const examples: { name: string; event: HookEvent; type: HookType; content: string }[] = [
    {
      name: 'welcome',
      event: 'SessionStart',
      type: 'exec',
      content: `#!/bin/bash
echo "Welcome! Session started at $(date)"`
    },
    {
      name: 'log-message',
      event: 'Message',
      type: 'exec',
      content: `#!/bin/bash
echo "Message received at $(date)" >> ~/.openclaw/logs/hooks.log`
    },
    {
      name: 'tool-check',
      event: 'CanUseTool',
      type: 'exec',
      content: `#!/bin/bash
# 检查工具调用权限
echo '{"allowed": true}'`
    }
  ]
  
  for (const ex of examples) {
    const filename = `${ex.event}.exec.${ex.name}.sh`
    const filepath = join(HOOKS_DIR, filename)
    // 示例暂时不创建，只创建目录
  }
}

/**
 * 扫描hooks目录并注册
 */
export async function scanAndRegisterHooks(): Promise<void> {
  hooks.clear()
  
  try {
    const files = await readdir(HOOKS_DIR)
    
    for (const file of files) {
      const hook = parseHookFile(file)
      if (hook) {
        hooks.set(hook.name, hook)
      }
    }
  } catch (error) {
    console.log('[HookSystem] hooks目录不存在或无法读取')
  }
}

/**
 * 解析Hook文件名
 * 格式: {event}.{type}.{name}.{ext}
 */
function parseHookFile(filename: string): HookConfig | null {
  const parts = basename(filename).split('.')
  
  if (parts.length < 4) return null
  
  const event = parts[0] as HookEvent
  const type = parts[1] as HookType
  const name = parts.slice(2, -1).join('.')  // 支持name中包含点
  const ext = parts[parts.length - 1]
  
  // 验证
  if (!HOOK_EVENTS.includes(event)) return null
  if (!['prompt', 'agent', 'http', 'exec'].includes(type)) return null
  if (!['sh', 'py', 'js', 'ts'].includes(ext)) return null
  
  return {
    name,
    event,
    type,
    enabled: true,
    timeout: DEFAULT_TIMEOUT,
    retry: DEFAULT_RETRY,
    blocking: false,
    path: join(HOOKS_DIR, filename)
  }
}

// ============================================================================
// Hook执行
// ============================================================================

/**
 * 执行Hook
 */
export async function executeHook(
  hookName: string,
  context: HookContext
): Promise<HookResult> {
  const hook = hooks.get(hookName)
  if (!hook) {
    return { success: false, error: 'Hook not found', duration: 0, hookName }
  }
  
  if (!hook.enabled) {
    return { success: false, error: 'Hook disabled', duration: 0, hookName }
  }
  
  const startTime = Date.now()
  hookStarted.emit(hookName, context.event)
  
  try {
    let output: string
    
    switch (hook.type) {
      case 'exec':
        output = await executeExecHook(hook, context)
        break
      case 'http':
        output = await executeHttpHook(hook, context)
        break
      case 'prompt':
        output = await executePromptHook(hook, context)
        break
      case 'agent':
        output = await executeAgentHook(hook, context)
        break
      default:
        output = ''
    }
    
    const duration = Date.now() - startTime
    const result: HookResult = { success: true, output, duration, hookName }
    hookCompleted.emit(result)
    return result
    
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    const duration = Date.now() - startTime
    hookFailed.emit(hookName, errorMsg)
    return { success: false, error: errorMsg, duration, hookName }
  }
}

/**
 * 执行Shell Hook
 */
async function executeExecHook(hook: HookConfig, context: HookContext): Promise<string> {
  const { stdout } = await execAsync(
    `bash "${hook.path}"`,
    {
      timeout: hook.timeout,
      env: {
        ...process.env,
        HOOK_EVENT: context.event,
        HOOK_SESSION: context.sessionId,
        HOOK_DATA: JSON.stringify(context.data || {})
      }
    }
  )
  return stdout.trim()
}

/**
 * 执行HTTP Hook
 */
async function executeHttpHook(hook: HookConfig, context: HookContext): Promise<string> {
  // 读取hook文件获取URL
  const content = await readFile(hook.path, 'utf-8')
  const url = content.trim()
  
  // 发送HTTP请求
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(context)
  })
  
  return await response.text()
}

/**
 * 执行Prompt Hook
 */
async function executePromptHook(hook: HookConfig, context: HookContext): Promise<string> {
  // 读取并返回prompt内容
  const content = await readFile(hook.path, 'utf-8')
  return content
}

/**
 * 执行Agent Hook
 */
async function executeAgentHook(hook: HookConfig, context: HookContext): Promise<string> {
  // Agent Hook需要在forked agent中执行
  // 这里暂时返回空
  return ''
}

// ============================================================================
// 事件触发
// ============================================================================

/**
 * 触发Hook事件
 */
export async function emitHookEvent(
  event: HookEvent,
  data?: any
): Promise<void> {
  const context: HookContext = {
    event,
    sessionId: getSessionId(),
    timestamp: Date.now(),
    data
  }
  
  hookEventEmitted.emit(event, context)
  
  // 获取所有监听此事件的hook
  const eventHooks = Array.from(hooks.values()).filter(h => h.event === event && h.enabled)
  
  for (const hook of eventHooks) {
    if (hook.blocking) {
      // 阻塞执行
      await executeHook(hook.name, context)
    } else {
      // 非阻塞执行
      executeHook(hook.name, context).catch(console.error)
    }
  }
}

// ============================================================================
// Hook管理
// ============================================================================

/**
 * 获取所有Hooks
 */
export function getAllHooks(): HookConfig[] {
  return Array.from(hooks.values())
}

/**
 * 获取指定事件的Hooks
 */
export function getHooksByEvent(event: HookEvent): HookConfig[] {
  return Array.from(hooks.values()).filter(h => h.event === event)
}

/**
 * 启用Hook
 */
export function enableHook(name: string): boolean {
  const hook = hooks.get(name)
  if (!hook) return false
  hook.enabled = true
  return true
}

/**
 * 禁用Hook
 */
export function disableHook(name: string): boolean {
  const hook = hooks.get(name)
  if (!hook) return false
  hook.enabled = false
  return true
}

/**
 * 删除Hook
 */
export async function removeHook(name: string): Promise<boolean> {
  const hook = hooks.get(name)
  if (!hook) return false
  
  try {
    const { unlink } = await import('fs/promises')
    await unlink(hook.path)
    hooks.delete(name)
    return true
  } catch {
    return false
  }
}

/**
 * 获取Hook配置
 */
export function getHook(name: string): HookConfig | undefined {
  return hooks.get(name)
}

// ============================================================================
// 便捷方法
// ============================================================================

/**
 * 在会话开始时触发
 */
export async function onSessionStart(): Promise<void> {
  await emitHookEvent('SessionStart')
}

/**
 * 在工具调用前触发
 */
export async function onCanUseTool(toolName: string, toolInput: any): Promise<HookResult[]> {
  const context: HookContext = {
    event: 'CanUseTool',
    sessionId: getSessionId(),
    timestamp: Date.now(),
    data: { toolName, toolInput }
  }
  
  const eventHooks = getHooksByEvent('CanUseTool')
  const results: HookResult[] = []
  
  for (const hook of eventHooks) {
    const result = await executeHook(hook.name, context)
    results.push(result)
  }
  
  return results
}

/**
 * 在错误发生时触发
 */
export async function onError(error: string): Promise<void> {
  await emitHookEvent('Error', { error })
}

/**
 * 在会话结束时触发
 */
export async function onSessionEnd(): Promise<void> {
  await emitHookEvent('SessionEnd')
}

// ============================================================================
// 订阅
// ============================================================================

export function onHookStarted(callback: (hookName: string, event: HookEvent) => void): () => void {
  return hookStarted.subscribe((name, event) => callback(name, event))
}

export function onHookCompleted(callback: (result: HookResult) => void): () => void {
  return hookCompleted.subscribe(callback)
}

export function onHookFailed(callback: (hookName: string, error: string) => void): () => void {
  return hookFailed.subscribe((name, error) => callback(name, error))
}

export function onHookEventEmitted(callback: (event: HookEvent, context: HookContext) => void): () => void {
  return hookEventEmitted.subscribe((event, context) => callback(event, context))
}

// ============================================================================
// 工具
// ============================================================================

function getSessionId(): string {
  return process.env.OPENCLAW_SESSION_ID || 'unknown'
}

/**
 * 格式化Hook列表
 */
export function formatHooks(): string {
  const lines: string[] = []
  lines.push('═══════════════════════════════════════')
  lines.push('         Hook System')
  lines.push('═══════════════════════════════════════')
  lines.push(`Hooks目录: ${HOOKS_DIR}`)
  lines.push(`已注册: ${hooks.size}`)
  lines.push('')
  
  for (const event of HOOK_EVENTS) {
    const eventHooks = getHooksByEvent(event)
    if (eventHooks.length > 0) {
      lines.push(`## ${event}`)
      for (const hook of eventHooks) {
        const status = hook.enabled ? '✅' : '❌'
        lines.push(`  ${status} ${hook.name} (${hook.type})`)
      }
      lines.push('')
    }
  }
  
  lines.push('═══════════════════════════════════════')
  return lines.join('\n')
}

/**
 * 获取Hook统计
 */
export function getHookStats(): {
  total: number
  byEvent: Record<string, number>
  enabled: number
  disabled: number
} {
  const byEvent: Record<string, number> = {}
  let enabled = 0
  let disabled = 0
  
  for (const hook of hooks.values()) {
    byEvent[hook.event] = (byEvent[hook.event] || 0) + 1
    if (hook.enabled) enabled++
    else disabled++
  }
  
  return { total: hooks.size, byEvent, enabled, disabled }
}
