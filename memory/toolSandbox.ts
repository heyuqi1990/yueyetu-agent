/**
 * Tool Sandbox v2.3 - 工具沙箱隔离
 * 
 * 源自Claude Code的Tool Sandbox设计
 * 支持工具执行隔离、超时控制、资源限制
 */

import { createSignal } from './signal'

// ============================================================================
// 类型定义
// ============================================================================

export type ToolCategory = 
  | 'read'      // 读操作
  | 'write'     // 写操作
  | 'delete'    // 删除操作
  | 'execute'   // 执行操作
  | 'network'   // 网络操作
  | 'system'    // 系统操作

export interface ToolPermission {
  toolName: string
  category: ToolCategory
  allowed: boolean
  requiresConfirmation: boolean
  maxCallsPerSession?: number
  rateLimitPerMinute?: number
}

export interface SandboxConfig {
  enabled: boolean
  defaultPolicy: 'allow' | 'deny' | 'prompt'
  timeoutMs: number
  maxMemoryMb: number
  maxCpuPercent: number
  enableNetworkIsolation: boolean
  allowedPaths?: string[]       // 允许的文件路径
  deniedPaths?: string[]       // 拒绝的路径
  allowedDomains?: string[]     // 允许的域名
  deniedDomains?: string[]       // 拒绝的域名
}

export interface ToolCallResult {
  success: boolean
  output?: any
  error?: string
  duration: number
  sandboxed: boolean
  policyApplied: 'allow' | 'deny' | 'prompt' | 'rate_limit'
}

export interface RateLimitEntry {
  count: number
  resetTime: number
}

export interface ToolCall {
  toolName: string
  args: any
  timestamp: number
  result?: ToolCallResult
}

// ============================================================================
// 默认配置
// ============================================================================

const DEFAULT_CONFIG: SandboxConfig = {
  enabled: true,
  defaultPolicy: 'prompt',
  timeoutMs: 30000,           // 30秒超时
  maxMemoryMb: 512,           // 512MB内存
  maxCpuPercent: 80,          // 80% CPU
  enableNetworkIsolation: true,
  allowedPaths: [],           // 默认允许所有路径
  deniedPaths: [
    '/etc',                   // 系统配置
    '/root',                 // root目录
    '/.ssh',                 // SSH密钥
    '/.aws',                 // AWS凭证
  ],
  allowedDomains: [],          // 默认拒绝所有域名
  deniedDomains: [
    'localhost',
    '127.0.0.1',
  ]
}

// ============================================================================
// 存储
// ============================================================================

let config: SandboxConfig = { ...DEFAULT_CONFIG }
const toolPermissions = new Map<string, ToolPermission>()
const rateLimits = new Map<string, RateLimitEntry>()
const callHistory: ToolCall[] = []
const maxHistorySize = 1000

// 默认权限规则
const DEFAULT_PERMISSIONS: ToolPermission[] = [
  // 读操作 - 默认允许
  { toolName: 'read', category: 'read', allowed: true, requiresConfirmation: false },
  { toolName: 'readFile', category: 'read', allowed: true, requiresConfirmation: false },
  { toolName: 'memory_search', category: 'read', allowed: true, requiresConfirmation: false },
  
  // 写操作 - 需要确认
  { toolName: 'write', category: 'write', allowed: true, requiresConfirmation: true },
  { toolName: 'writeFile', category: 'write', allowed: true, requiresConfirmation: true },
  { toolName: 'edit', category: 'write', allowed: true, requiresConfirmation: true },
  
  // 删除操作 - 严格限制
  { toolName: 'delete', category: 'delete', allowed: false, requiresConfirmation: true },
  { toolName: 'unlink', category: 'delete', allowed: false, requiresConfirmation: true },
  { toolName: 'rm', category: 'delete', allowed: false, requiresConfirmation: true },
  
  // 执行操作 - 需要确认
  { toolName: 'exec', category: 'execute', allowed: true, requiresConfirmation: true },
  { toolName: 'bash', category: 'execute', allowed: true, requiresConfirmation: true },
  
  // 网络操作 - 默认拒绝
  { toolName: 'fetch', category: 'network', allowed: false, requiresConfirmation: true },
  { toolName: 'curl', category: 'network', allowed: false, requiresConfirmation: true },
  { toolName: 'http', category: 'network', allowed: false, requiresConfirmation: true },
]

// 信号
const toolAllowed = createSignal<[tool: string, args: any]>()
const toolDenied = createSignal<[tool: string, reason: string]>()
const toolRateLimited = createSignal<[tool: string, limit: number]>()
const policyChanged = createSignal<[tool: string, policy: string]>()
const sandboxViolation = createSignal<[tool: string, violation: string]>()

// ============================================================================
// 初始化
// ============================================================================

/**
 * 初始化沙箱
 */
export function initializeSandbox(customConfig?: Partial<SandboxConfig>): void {
  if (customConfig) {
    config = { ...config, ...customConfig }
  }
  
  // 注册默认权限
  for (const perm of DEFAULT_PERMISSIONS) {
    toolPermissions.set(perm.toolName, { ...perm })
  }
}

// ============================================================================
// 权限管理
// ============================================================================

/**
 * 获取工具权限
 */
export function getToolPermission(toolName: string): ToolPermission | undefined {
  return toolPermissions.get(toolName)
}

/**
 * 设置工具权限
 */
export function setToolPermission(permission: ToolPermission): void {
  toolPermissions.set(permission.toolName, permission)
  policyChanged.emit(permission.toolName, permission.allowed ? 'allow' : 'deny')
}

/**
 * 批量设置权限
 */
export function setToolPermissions(permissions: ToolPermission[]): void {
  for (const perm of permissions) {
    setToolPermission(perm)
  }
}

/**
 * 重置为默认权限
 */
export function resetToDefaultPermissions(): void {
  toolPermissions.clear()
  for (const perm of DEFAULT_PERMISSIONS) {
    toolPermissions.set(perm.toolName, { ...perm })
  }
}

/**
 * 允许工具
 */
export function allowTool(toolName: string, requiresConfirmation: boolean = false): void {
  setToolPermission({
    toolName,
    category: guessCategory(toolName),
    allowed: true,
    requiresConfirmation
  })
}

/**
 * 拒绝工具
 */
export function denyTool(toolName: string): void {
  setToolPermission({
    toolName,
    category: guessCategory(toolName),
    allowed: false,
    requiresConfirmation: false
  })
}

/**
 * 猜测工具类别
 */
function guessCategory(toolName: string): ToolCategory {
  const lower = toolName.toLowerCase()
  
  if (lower.includes('read') || lower.includes('get') || lower.includes('list')) {
    return 'read'
  }
  if (lower.includes('write') || lower.includes('create') || lower.includes('add')) {
    return 'write'
  }
  if (lower.includes('delete') || lower.includes('remove') || lower.includes('rm')) {
    return 'delete'
  }
  if (lower.includes('exec') || lower.includes('bash') || lower.includes('run')) {
    return 'execute'
  }
  if (lower.includes('fetch') || lower.includes('http') || lower.includes('curl') || lower.includes('network')) {
    return 'network'
  }
  if (lower.includes('system') || lower.includes('sudo') || lower.includes('chmod')) {
    return 'system'
  }
  
  return 'read'  // 默认
}

// ============================================================================
// 速率限制
// ============================================================================

/**
 * 检查速率限制
 */
export function checkRateLimit(toolName: string): boolean {
  const permission = toolPermissions.get(toolName)
  if (!permission?.rateLimitPerMinute) return true

  const now = Date.now()
  const entry = rateLimits.get(toolName)

  if (!entry || entry.resetTime < now) {
    // 重置
    rateLimits.set(toolName, {
      count: 1,
      resetTime: now + 60 * 1000  // 1分钟窗口
    })
    return true
  }

  if (entry.count >= permission.rateLimitPerMinute) {
    toolRateLimited.emit(toolName, permission.rateLimitPerMinute)
    return false
  }

  entry.count++
  return true
}

// ============================================================================
// 路径/域名检查
// ============================================================================

/**
 * 检查路径是否允许
 */
export function isPathAllowed(path: string): boolean {
  // 检查拒绝列表
  for (const denied of config.deniedPaths || []) {
    if (path.startsWith(denied)) {
      return false
    }
  }

  // 如果有白名单，检查是否在白名单
  if (config.allowedPaths && config.allowedPaths.length > 0) {
    for (const allowed of config.allowedPaths) {
      if (path.startsWith(allowed)) {
        return true
      }
    }
    return false
  }

  return true
}

/**
 * 检查域名是否允许
 */
export function isDomainAllowed(domain: string): boolean {
  // 检查拒绝列表
  for (const denied of config.deniedDomains || []) {
    if (domain.includes(denied)) {
      return false
    }
  }

  // 如果有白名单，检查是否在白名单
  if (config.allowedDomains && config.allowedDomains.length > 0) {
    for (const allowed of config.allowedDomains) {
      if (domain.includes(allowed)) {
        return true
      }
    }
    return false
  }

  return true
}

// ============================================================================
// 核心检查
// ============================================================================

/**
 * 检查工具是否允许执行
 */
export function canExecuteTool(
  toolName: string, 
  args?: any
): { allowed: boolean; reason: string; requiresConfirmation: boolean; policy: string } {
  // 检查沙箱是否启用
  if (!config.enabled) {
    return { allowed: true, reason: 'Sandbox disabled', requiresConfirmation: false, policy: 'allow' }
  }

  // 检查速率限制
  if (!checkRateLimit(toolName)) {
    return { 
      allowed: false, 
      reason: 'Rate limit exceeded', 
      requiresConfirmation: false, 
      policy: 'rate_limit' 
    }
  }

  // 获取权限
  const permission = toolPermissions.get(toolName)
  
  if (!permission) {
    // 没有特定权限，使用默认策略
    if (config.defaultPolicy === 'allow') {
      return { 
        allowed: true, 
        reason: 'Default allow', 
        requiresConfirmation: true, 
        policy: 'prompt' 
      }
    }
    return { 
      allowed: false, 
      reason: 'Tool not registered', 
      requiresConfirmation: false, 
      policy: 'deny' 
    }
  }

  if (!permission.allowed) {
    return { 
      allowed: false, 
      reason: 'Tool denied by policy', 
      requiresConfirmation: false, 
      policy: 'deny' 
    }
  }

  // 检查路径参数
  if (args) {
    const pathArgs = extractPathArgs(args)
    for (const path of pathArgs) {
      if (!isPathAllowed(path)) {
        sandboxViolation.emit(toolName, `Path not allowed: ${path}`)
        return { 
          allowed: false, 
          reason: `Path not allowed: ${path}`, 
          requiresConfirmation: false, 
          policy: 'deny' 
        }
      }
    }

    // 检查域名参数
    const domainArgs = extractDomainArgs(args)
    for (const domain of domainArgs) {
      if (!isDomainAllowed(domain)) {
        sandboxViolation.emit(toolName, `Domain not allowed: ${domain}`)
        return { 
          allowed: false, 
          reason: `Domain not allowed: ${domain}`, 
          requiresConfirmation: false, 
          policy: 'deny' 
        }
      }
    }
  }

  if (permission.requiresConfirmation) {
    return { 
      allowed: true, 
      reason: 'Requires confirmation', 
      requiresConfirmation: true, 
      policy: 'prompt' 
    }
  }

  return { 
    allowed: true, 
    reason: 'Allowed', 
    requiresConfirmation: false, 
    policy: 'allow' 
  }
}

/**
 * 从参数中提取路径
 */
function extractPathArgs(args: any): string[] {
  const paths: string[] = []
  
  if (typeof args === 'string') {
    paths.push(args)
  } else if (typeof args === 'object') {
    for (const value of Object.values(args)) {
      if (typeof value === 'string' && (value.startsWith('/') || value.startsWith('./'))) {
        paths.push(value)
      }
    }
  }
  
  return paths
}

/**
 * 从参数中提取域名
 */
function extractDomainArgs(args: any): string[] {
  const domains: string[] = []
  const urlPattern = /https?:\/\/([^/]+)/gi
  
  if (typeof args === 'string') {
    let match
    while ((match = urlPattern.exec(args)) !== null) {
      domains.push(match[1])
    }
  } else if (typeof args === 'object') {
    for (const value of Object.values(args)) {
      if (typeof value === 'string') {
        let match
        while ((match = urlPattern.exec(value)) !== null) {
          domains.push(match[1])
        }
      }
    }
  }
  
  return domains
}

// ============================================================================
// 记录
// ============================================================================

/**
 * 记录工具调用
 */
export function recordToolCall(toolName: string, args: any, result?: ToolCallResult): void {
  const call: ToolCall = {
    toolName,
    args,
    timestamp: Date.now(),
    result
  }
  
  callHistory.push(call)
  
  // 限制历史大小
  if (callHistory.length > maxHistorySize) {
    callHistory.shift()
  }

  if (result?.success) {
    toolAllowed.emit(toolName, args)
  } else if (result) {
    toolDenied.emit(toolName, result.error || 'Denied')
  }
}

/**
 * 获取调用历史
 */
export function getCallHistory(limit?: number): ToolCall[] {
  return limit ? callHistory.slice(-limit) : [...callHistory]
}

/**
 * 获取工具统计
 */
export function getToolStats(toolName?: string): {
  totalCalls: number
  successRate: number
  avgDuration: number
  lastCall: number | null
} {
  const calls = toolName 
    ? callHistory.filter(c => c.toolName === toolName)
    : callHistory

  if (calls.length === 0) {
    return { totalCalls: 0, successRate: 0, avgDuration: 0, lastCall: null }
  }

  const successes = calls.filter(c => c.result?.success).length
  const durations = calls.filter(c => c.result?.duration).map(c => c.result!.duration)
  const avgDuration = durations.length > 0 
    ? durations.reduce((a, b) => a + b, 0) / durations.length 
    : 0

  return {
    totalCalls: calls.length,
    successRate: successes / calls.length,
    avgDuration,
    lastCall: calls[calls.length - 1]?.timestamp || null
  }
}

// ============================================================================
// 配置
// ============================================================================

export function getSandboxConfig(): SandboxConfig {
  return { ...config }
}

export function updateSandboxConfig(updates: Partial<SandboxConfig>): void {
  config = { ...config, ...updates }
}

export function enableSandbox(): void {
  config.enabled = true
}

export function disableSandbox(): void {
  config.enabled = false
}

// ============================================================================
// 订阅
// ============================================================================

export function onToolAllowed(callback: (tool: string, args: any) => void): () => void {
  return toolAllowed.subscribe((tool, args) => callback(tool, args))
}

export function onToolDenied(callback: (tool: string, reason: string) => void): () => void {
  return toolDenied.subscribe((tool, reason) => callback(tool, reason))
}

export function onToolRateLimited(callback: (tool: string, limit: number) => void): () => void {
  return toolRateLimited.subscribe((tool, limit) => callback(tool, limit))
}

export function onPolicyChanged(callback: (tool: string, policy: string) => void): () => void {
  return policyChanged.subscribe((tool, policy) => callback(tool, policy))
}

export function onSandboxViolation(callback: (tool: string, violation: string) => void): () => void {
  return sandboxViolation.subscribe((tool, violation) => callback(tool, violation))
}

// ============================================================================
// 工具
// ============================================================================

/**
 * 检查沙箱是否启用
 */
export function isSandboxEnabled(): boolean {
  return config.enabled
}

/**
 * 获取所有被拒绝的工具
 */
export function getDeniedTools(): string[] {
  return Array.from(toolPermissions.values())
    .filter(p => !p.allowed)
    .map(p => p.toolName)
}

/**
 * 获取需要确认的工具
 */
export function getConfirmationRequiredTools(): string[] {
  return Array.from(toolPermissions.values())
    .filter(p => p.requiresConfirmation)
    .map(p => p.toolName)
}

/**
 * 清空调用历史
 */
export function clearCallHistory(): void {
  callHistory.length = 0
}

/**
 * 格式化沙箱状态
 */
export function formatSandboxStatus(): string {
  const lines: string[] = []
  lines.push('═══════════════════════════════════════')
  lines.push('         Tool Sandbox Status')
  lines.push('═══════════════════════════════════════')
  lines.push(`Enabled: ${config.enabled ? '✅' : '❌'}`)
  lines.push(`Default Policy: ${config.defaultPolicy}`)
  lines.push(`Timeout: ${config.timeoutMs}ms`)
  lines.push(`Denied Paths: ${config.deniedPaths?.length || 0}`)
  lines.push(`Denied Domains: ${config.deniedDomains?.length || 0}`)
  lines.push('')
  lines.push(`Registered Tools: ${toolPermissions.size}`)
  lines.push(`Denied: ${getDeniedTools().length}`)
  lines.push(`Confirmation Required: ${getConfirmationRequiredTools().length}`)
  lines.push(`Total Calls: ${callHistory.length}`)
  lines.push('═══════════════════════════════════════')
  return lines.join('\n')
}
