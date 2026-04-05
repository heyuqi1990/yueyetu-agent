/**
 * State System v2.2 - 全局状态管理
 * 
 * 源自Claude Code的State设计模式
 * 采用单例全局状态 + 访问器函数模式
 */

import { createSignal, type Signal } from './signal'

// ============================================================================
// 状态类型定义
// ============================================================================

export interface ModelUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  totalTokens: number
  cost: number
}

export interface SessionCronTask {
  id: string
  cron: string
  prompt: string
  createdAt: number
  recurring?: boolean
  agentId?: string
}

export interface InvokedSkillInfo {
  skillName: string
  skillPath: string
  content: string
  agentId: string | null
  invokedAt: number
}

export interface MemorySystemState {
  // 基础信息
  initialized: boolean
  projectRoot: string
  
  // 记忆统计
  totalMemories: number
  memoriesByType: {
    user: number
    feedback: number
    project: number
    reference: number
  }
  totalTokens: number
  
  // 提取统计
  extractionCount: number
  lastExtractionTime: number | null
  lastExtractionMessageId: string | null
  lastExtractionTokens: number
  
  // 压缩统计
  compactionCount: number
  lastCompactionTime: number | null
  messagesProcessed: number
  messagesKept: number
  
  // 会话管理
  sessionId: string
  sessionCreatedAt: number
  sessionMessageCount: number
  sessionCronTasks: SessionCronTask[]
  
  // 调用的Skills
  invokedSkills: Map<string, InvokedSkillInfo>
  
  // Beta功能标志（latch模式）
  betaModeLatched: boolean | null
  
  // 配置
  config: {
    extract: {
      minimumMessageTokensToInit: number
      minimumMessagesBetweenExtractions: number
      minimumTokensBetweenExtractions: number
      toolCallsBetweenUpdates: number
    }
    session: {
      minimumMessageTokensToInit: number
      minimumTokensBetweenUpdate: number
      toolCallsBetweenUpdates: number
    }
  }
}

// ============================================================================
// 状态实现
// ============================================================================

/**
 * 全局状态单例
 */
let STATE: MemorySystemState | null = null

/**
 * 状态变更信号
 */
const stateChanged = createSignal<[key: keyof MemorySystemState, value: unknown]>()

// ============================================================================
// 初始化
// ============================================================================

/**
 * 初始化状态
 */
export function initializeState(): MemorySystemState {
  if (STATE) {
    return STATE
  }

  STATE = createInitialState()
  
  // 发送初始化信号
  globalSignalManager.get('systemInitialized')?.emit()
  
  return STATE
}

function createInitialState(): MemorySystemState {
  return {
    // 基础信息
    initialized: true,
    projectRoot: process.env.HOME || '~',
    
    // 记忆统计
    totalMemories: 0,
    memoriesByType: {
      user: 0,
      feedback: 0,
      project: 0,
      reference: 0
    },
    totalTokens: 0,
    
    // 提取统计
    extractionCount: 0,
    lastExtractionTime: null,
    lastExtractionMessageId: null,
    lastExtractionTokens: 0,
    
    // 压缩统计
    compactionCount: 0,
    lastCompactionTime: null,
    messagesProcessed: 0,
    messagesKept: 0,
    
    // 会话管理
    sessionId: generateSessionId(),
    sessionCreatedAt: Date.now(),
    sessionMessageCount: 0,
    sessionCronTasks: [],
    
    // 调用的Skills
    invokedSkills: new Map(),
    
    // Beta功能
    betaModeLatched: null,
    
    // 配置
    config: {
      extract: {
        minimumMessageTokensToInit: 5000,
        minimumMessagesBetweenExtractions: 10,
        minimumTokensBetweenExtractions: 3000,
        toolCallsBetweenUpdates: 20
      },
      session: {
        minimumMessageTokensToInit: 2000,
        minimumTokensBetweenUpdate: 1500,
        toolCallsBetweenUpdates: 15
      }
    }
  }
}

// ============================================================================
// 访问器函数
// ============================================================================

/**
 * 获取当前状态（只读）
 */
export function getState(): MemorySystemState {
  if (!STATE) {
    return initializeState()
  }
  return STATE
}

/**
 * 获取是否已初始化
 */
export function isInitialized(): boolean {
  return STATE?.initialized ?? false
}

/**
 * 获取会话ID
 */
export function getSessionId(): string {
  return STATE?.sessionId ?? generateSessionId()
}

/**
 * 获取会话消息数
 */
export function getSessionMessageCount(): number {
  return STATE?.sessionMessageCount ?? 0
}

/**
 * 增加会话消息数
 */
export function incrementSessionMessageCount(): void {
  if (STATE) {
    STATE.sessionMessageCount++
  }
}

/**
 * 获取总记忆数
 */
export function getTotalMemories(): number {
  return STATE?.totalMemories ?? 0
}

/**
 * 获取某种类型的记忆数
 */
export function getMemoryCountByType(type: keyof typeof STATE.memoriesByType): number {
  return STATE?.memoriesByType[type] ?? 0
}

/**
 * 获取总Token数
 */
export function getTotalTokens(): number {
  return STATE?.totalTokens ?? 0
}

/**
 * 获取提取统计
 */
export function getExtractionStats(): {
  count: number
  lastTime: number | null
  lastTokens: number
} {
  return {
    count: STATE?.extractionCount ?? 0,
    lastTime: STATE?.lastExtractionTime ?? null,
    lastTokens: STATE?.lastExtractionTokens ?? 0
  }
}

/**
 * 获取压缩统计
 */
export function getCompactionStats(): {
  count: number
  lastTime: number | null
  messagesProcessed: number
  messagesKept: number
} {
  return {
    count: STATE?.compactionCount ?? 0,
    lastTime: STATE?.lastCompactionTime ?? null,
    messagesProcessed: STATE?.messagesProcessed ?? 0,
    messagesKept: STATE?.messagesKept ?? 0
  }
}

/**
 * 获取已调用的Skill列表
 */
export function getInvokedSkills(): InvokedSkillInfo[] {
  const skills = STATE?.invokedSkills
  if (!skills) return []
  return Array.from(skills.values())
}

/**
 * 检查Skill是否已被调用
 */
export function isSkillInvoked(skillName: string, agentId?: string): boolean {
  const skills = STATE?.invokedSkills
  if (!skills) return false
  const key = `${agentId ?? ''}:${skillName}`
  return skills.has(key)
}

// ============================================================================
// 设置器函数
// ============================================================================

/**
 * 设置记忆统计
 */
export function setMemoryStats(
  total: number,
  byType: { user: number; feedback: number; project: number; reference: number }
): void {
  if (STATE) {
    STATE.totalMemories = total
    STATE.memoriesByType = byType
    stateChanged.emit('totalMemories', total)
    stateChanged.emit('memoriesByType', byType)
  }
}

/**
 * 设置总Token数
 */
export function setTotalTokens(tokens: number): void {
  if (STATE) {
    STATE.totalTokens = tokens
    stateChanged.emit('totalTokens', tokens)
  }
}

/**
 * 记录一次提取
 */
export function recordExtraction(messageId: string, tokens: number): void {
  if (STATE) {
    STATE.extractionCount++
    STATE.lastExtractionTime = Date.now()
    STATE.lastExtractionMessageId = messageId
    STATE.lastExtractionTokens = tokens
    stateChanged.emit('extractionCount', STATE.extractionCount)
    stateChanged.emit('lastExtractionTime', STATE.lastExtractionTime)
  }
}

/**
 * 记录一次压缩
 */
export function recordCompaction(processed: number, kept: number): void {
  if (STATE) {
    STATE.compactionCount++
    STATE.lastCompactionTime = Date.now()
    STATE.messagesProcessed += processed
    STATE.messagesKept += kept
    stateChanged.emit('compactionCount', STATE.compactionCount)
    stateChanged.emit('lastCompactionTime', STATE.lastCompactionTime)
  }
}

/**
 * 添加会话级定时任务
 */
export function addSessionCronTask(task: Omit<SessionCronTask, 'id' | 'createdAt'>): string {
  const id = generateTaskId()
  if (STATE) {
    STATE.sessionCronTasks.push({
      ...task,
      id,
      createdAt: Date.now()
    })
    stateChanged.emit('sessionCronTasks', STATE.sessionCronTasks)
  }
  return id
}

/**
 * 移除会话级定时任务
 */
export function removeSessionCronTask(taskId: string): boolean {
  if (!STATE) return false
  const index = STATE.sessionCronTasks.findIndex(t => t.id === taskId)
  if (index >= 0) {
    STATE.sessionCronTasks.splice(index, 1)
    stateChanged.emit('sessionCronTasks', STATE.sessionCronTasks)
    return true
  }
  return false
}

/**
 * 获取所有会话级定时任务
 */
export function getSessionCronTasks(): SessionCronTask[] {
  return STATE?.sessionCronTasks ?? []
}

/**
 * 记录Skill调用
 */
export function addInvokedSkill(
  skillName: string,
  skillPath: string,
  content: string,
  agentId: string | null = null
): void {
  if (STATE) {
    const key = `${agentId ?? ''}:${skillName}`
    STATE.invokedSkills.set(key, {
      skillName,
      skillPath,
      content,
      agentId,
      invokedAt: Date.now()
    })
    stateChanged.emit('invokedSkills', STATE.invokedSkills)
  }
}

/**
 * 设置Beta模式
 */
export function setBetaModeLatched(value: boolean): void {
  if (STATE) {
    // Latch模式：一旦设置，不能更改
    if (STATE.betaModeLatched === null) {
      STATE.betaModeLatched = value
      stateChanged.emit('betaModeLatched', value)
    }
  }
}

/**
 * 获取Beta模式
 */
export function getBetaModeLatched(): boolean | null {
  return STATE?.betaModeLatched ?? null
}

// ============================================================================
// 配置更新
// ============================================================================

/**
 * 更新提取配置
 */
export function updateExtractConfig(updates: Partial<MemorySystemState['config']['extract']>): void {
  if (STATE) {
    STATE.config.extract = { ...STATE.config.extract, ...updates }
    stateChanged.emit('config', STATE.config)
    globalSignalManager.get('configUpdated')?.emit('extract', STATE.config.extract)
  }
}

/**
 * 更新会话配置
 */
export function updateSessionConfig(updates: Partial<MemorySystemState['config']['session']>): void {
  if (STATE) {
    STATE.config.session = { ...STATE.config.session, ...updates }
    stateChanged.emit('config', STATE.config)
    globalSignalManager.get('configUpdated')?.emit('session', STATE.config.session)
  }
}

/**
 * 获取配置
 */
export function getConfig(): MemorySystemState['config'] {
  return STATE?.config ?? {
    extract: {
      minimumMessageTokensToInit: 5000,
      minimumMessagesBetweenExtractions: 10,
      minimumTokensBetweenExtractions: 3000,
      toolCallsBetweenUpdates: 20
    },
    session: {
      minimumMessageTokensToInit: 2000,
      minimumTokensBetweenUpdate: 1500,
      toolCallsBetweenUpdates: 15
    }
  }
}

// ============================================================================
// 状态订阅
// ============================================================================

/**
 * 订阅状态变更
 */
export function onStateChange(
  callback: (key: keyof MemorySystemState, value: unknown) => void
): () => void {
  return stateChanged.subscribe(callback)
}

/**
 * 订阅特定状态变化
 */
export function watch<T extends keyof MemorySystemState>(
  key: T,
  callback: (value: MemorySystemState[T]) => void
): () => void {
  return stateChanged.subscribe((changedKey, value) => {
    if (changedKey === key) {
      callback(value as MemorySystemState[T])
    }
  })
}

// ============================================================================
// 重置
// ============================================================================

/**
 * 重置状态（用于测试）
 */
export function resetState(): void {
  STATE = null
  stateChanged.clear()
}

/**
 * 创建新会话
 */
export function createNewSession(): string {
  if (STATE) {
    STATE.sessionId = generateSessionId()
    STATE.sessionCreatedAt = Date.now()
    STATE.sessionMessageCount = 0
    STATE.sessionCronTasks = []
    stateChanged.emit('sessionId', STATE.sessionId)
    globalSignalManager.get('sessionSwitched')?.emit(STATE.sessionId, null)
  }
  return STATE?.sessionId ?? generateSessionId()
}

// ============================================================================
// 工具函数
// ============================================================================

function generateSessionId(): string {
  return `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

function generateTaskId(): string {
  return `task_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

// 重新导出信号管理器
export { globalSignalManager } from './signal'

// 导入信号管理器
import { globalSignalManager } from './signal'
