/**
 * Session Memory Enhanced v2.2 - 会话级记忆持久化
 * 
 * 增强的Session Memory机制
 * 支持会话间记忆持久化、跨会话恢复、自动摘要
 */

import { readFile, writeFile, access, mkdir } from 'fs/promises'
import { join, dirname } from 'path'
import { createSignal } from './signal'
import { getSessionId, getSessionMessageCount } from './state'

// ============================================================================
// 类型定义
// ============================================================================

export interface SessionMemoryEntry {
  id: string
  timestamp: number
  type: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  tokens: number
  important?: boolean
  tags?: string[]
}

export interface SessionMemoryMetadata {
  sessionId: string
  createdAt: number
  lastUpdated: number
  messageCount: number
  totalTokens: number
  version: string
}

export interface SessionSnapshot {
  metadata: SessionMemoryMetadata
  entries: SessionMemoryEntry[]
  summary?: string
  pendingExtractions: string[]
}

export interface SessionMemoryConfig {
  maxEntries: number
  maxTokens: number
  autoSnapshot: boolean
  snapshotInterval: number  // 毫秒
  persistOnExit: boolean
  loadOnStart: boolean
}

// ============================================================================
// 配置
// ============================================================================

const DEFAULT_CONFIG: SessionMemoryConfig = {
  maxEntries: 1000,
  maxTokens: 50000,
  autoSnapshot: true,
  snapshotInterval: 5 * 60 * 1000,  // 5分钟
  persistOnExit: true,
  loadOnStart: true
}

let config: SessionMemoryConfig = { ...DEFAULT_CONFIG }
let currentSessionId: string | null = null

// ============================================================================
// 状态
// ============================================================================

let entries: SessionMemoryEntry[] = []
let pendingExtractions: string[] = []
let summary: string = ''
let isDirty = false
let lastSnapshotTime = 0

// 信号
const entryAdded = createSignal<[entry: SessionMemoryEntry]>()
const entryRemoved = createSignal<[id: string]>()
const sessionLoaded = createSignal<[sessionId: string, entryCount: number]>()
const sessionSaved = createSignal<[sessionId: string]>()
const snapshotCreated = createSignal<[snapshot: SessionSnapshot]>()
const summaryUpdated = createSignal<[summary: string]>()
const memoryOverflow = createSignal<[removedCount: number]>()

// ============================================================================
// 路径管理
// ============================================================================

function getSessionMemoryDir(): string {
  return join(process.env.HOME || '~', '.openclaw', 'memory', 'sessions')
}

function getSessionMemoryPath(sessionId: string): string {
  return join(getSessionMemoryDir(), `${sessionId}.json`)
}

function getCurrentSessionPath(): string {
  return currentSessionId 
    ? getSessionMemoryPath(currentSessionId) 
    : join(getSessionMemoryDir(), 'current.json')
}

// ============================================================================
// 核心功能
// ============================================================================

/**
 * 初始化Session Memory
 */
export async function initializeSessionMemory(
  sessionId?: string,
  options?: Partial<SessionMemoryConfig>
): Promise<void> {
  // 更新配置
  if (options) {
    config = { ...config, ...options }
  }

  // 获取或创建sessionId
  currentSessionId = sessionId ?? getSessionId()

  // 确保目录存在
  const dir = getSessionMemoryDir()
  await mkdir(dir, { recursive: true, mode: 0o700 })

  // 如果配置了loadOnStart，尝试加载
  if (config.loadOnStart) {
    const loaded = await tryLoadSession(currentSessionId)
    if (loaded) {
      sessionLoaded.emit(currentSessionId, entries.length)
      return
    }
  }

  // 初始化空会话
  entries = []
  pendingExtractions = []
  summary = ''
  isDirty = false
  lastSnapshotTime = Date.now()

  sessionLoaded.emit(currentSessionId, 0)
}

/**
 * 尝试加载会话
 */
async function tryLoadSession(sessionId: string): Promise<boolean> {
  try {
    const path = getSessionMemoryPath(sessionId)
    await access(path)
    
    const content = await readFile(path, 'utf-8')
    const snapshot: SessionSnapshot = JSON.parse(content)
    
    entries = snapshot.entries || []
    pendingExtractions = snapshot.pendingExtractions || []
    summary = snapshot.summary || ''
    lastSnapshotTime = Date.now()
    isDirty = false

    return true
  } catch {
    return false
  }
}

/**
 * 添加记忆条目
 */
export async function addSessionEntry(
  content: string,
  type: SessionMemoryEntry['type'],
  options?: {
    tokens?: number
    important?: boolean
    tags?: string[]
  }
): Promise<SessionMemoryEntry> {
  const entry: SessionMemoryEntry = {
    id: generateEntryId(),
    timestamp: Date.now(),
    type,
    content,
    tokens: options?.tokens ?? estimateTokens(content),
    important: options?.important ?? false,
    tags: options?.tags
  }

  entries.push(entry)

  // 检查是否溢出
  await checkAndHandleOverflow()

  // 标记为脏
  isDirty = true

  // 发送信号
  entryAdded.emit(entry)

  // 自动快照
  if (config.autoSnapshot) {
    checkAutoSnapshot()
  }

  return entry
}

/**
 * 移除记忆条目
 */
export function removeSessionEntry(id: string): boolean {
  const index = entries.findIndex(e => e.id === id)
  if (index < 0) return false

  entries.splice(index, 1)
  isDirty = true
  entryRemoved.emit(id)

  return true
}

/**
 * 获取所有条目
 */
export function getSessionEntries(): SessionMemoryEntry[] {
  return [...entries]
}

/**
 * 获取指定类型的条目
 */
export function getSessionEntriesByType(type: SessionMemoryEntry['type']): SessionMemoryEntry[] {
  return entries.filter(e => e.type === type)
}

/**
 * 获取重要条目
 */
export function getImportantEntries(): SessionMemoryEntry[] {
  return entries.filter(e => e.important)
}

/**
 * 搜索条目
 */
export function searchSessionEntries(query: string): SessionMemoryEntry[] {
  const lower = query.toLowerCase()
  return entries.filter(e => 
    e.content.toLowerCase().includes(lower) ||
    e.tags?.some(t => t.toLowerCase().includes(lower))
  )
}

// ============================================================================
// 溢出处理
// ============================================================================

/**
 * 检查并处理溢出
 */
async function checkAndHandleOverflow(): Promise<void> {
  let removed = 0

  // 检查条目数
  while (entries.length > config.maxEntries) {
    // 移除最老的非重要条目
    const nonImportant = entries.findIndex(e => !e.important)
    if (nonImportant >= 0) {
      entries.splice(nonImportant, 1)
      removed++
    } else {
      // 所有条目都是重要的，停止移除
      break
    }
  }

  // 检查token数
  let totalTokens = entries.reduce((sum, e) => sum + e.tokens, 0)
  while (totalTokens > config.maxTokens && entries.length > 0) {
    const nonImportant = entries.findIndex(e => !e.important)
    if (nonImportant >= 0) {
      totalTokens -= entries[nonImportant].tokens
      entries.splice(nonImportant, 1)
      removed++
    } else {
      break
    }
  }

  if (removed > 0) {
    memoryOverflow.emit(removed)
  }
}

/**
 * 估算token数（简单版本）
 */
function estimateTokens(text: string): number {
  // 粗略估算：中文每个字约1.5token，英文每个词约1.3token
  const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length
  const englishWords = (text.match(/[a-zA-Z]+/g) || []).length
  return Math.ceil(chineseChars * 1.5 + englishWords * 1.3)
}

// ============================================================================
// 快照与持久化
// ============================================================================

/**
 * 创建快照
 */
export async function createSnapshot(): Promise<SessionSnapshot> {
  const metadata: SessionMemoryMetadata = {
    sessionId: currentSessionId ?? getSessionId(),
    createdAt: entries[0]?.timestamp ?? Date.now(),
    lastUpdated: Date.now(),
    messageCount: entries.length,
    totalTokens: entries.reduce((sum, e) => sum + e.tokens, 0),
    version: '2.2'
  }

  const snapshot: SessionSnapshot = {
    metadata,
    entries: [...entries],
    summary,
    pendingExtractions: [...pendingExtractions]
  }

  snapshotCreated.emit(snapshot)
  isDirty = true

  return snapshot
}

/**
 * 保存会话
 */
export async function saveSession(): Promise<void> {
  if (!currentSessionId) return

  const snapshot = await createSnapshot()
  const path = getSessionMemoryPath(currentSessionId)

  await writeFile(path, JSON.stringify(snapshot, null, 2), {
    mode: 0o600,
    flag: 'w'
  })

  isDirty = false
  sessionSaved.emit(currentSessionId)
}

/**
 * 保存到指定路径
 */
export async function saveSessionTo(path: string): Promise<void> {
  const snapshot = await createSnapshot()
  await writeFile(path, JSON.stringify(snapshot, null, 2), {
    mode: 0o600,
    flag: 'w'
  })
  isDirty = false
}

/**
 * 从指定路径加载
 */
export async function loadSessionFrom(path: string): Promise<boolean> {
  try {
    const content = await readFile(path, 'utf-8')
    const snapshot: SessionSnapshot = JSON.parse(content)

    entries = snapshot.entries || []
    pendingExtractions = snapshot.pendingExtractions || []
    summary = snapshot.summary || ''
    currentSessionId = snapshot.metadata.sessionId
    isDirty = false

    sessionLoaded.emit(currentSessionId, entries.length)
    return true
  } catch {
    return false
  }
}

/**
 * 检查是否需要自动快照
 */
function checkAutoSnapshot(): void {
  const now = Date.now()
  if (now - lastSnapshotTime >= config.snapshotInterval) {
    createSnapshot()
    lastSnapshotTime = now
  }
}

// ============================================================================
// 待提取内容
// ============================================================================

/**
 * 添加待提取内容
 */
export function addPendingExtraction(content: string): void {
  pendingExtractions.push(content)
}

/**
 * 获取待提取内容
 */
export function getPendingExtractions(): string[] {
  return [...pendingExtractions]
}

/**
 * 清除待提取内容
 */
export function clearPendingExtractions(): void {
  pendingExtractions = []
}

/**
 * 标记为已提取
 */
export function markExtracted(index: number): void {
  if (index >= 0 && index < pendingExtractions.length) {
    pendingExtractions.splice(index, 1)
  }
}

// ============================================================================
// 摘要
// ============================================================================

/**
 * 更新摘要
 */
export async function updateSummary(newSummary: string): Promise<void> {
  summary = newSummary
  summaryUpdated.emit(summary)
  isDirty = true
}

/**
 * 获取摘要
 */
export function getSummary(): string {
  return summary
}

/**
 * 生成自动摘要
 */
export async function generateAutoSummary(): Promise<string> {
  // 简单实现：取最近的条目
  const recentEntries = entries.slice(-20)
  
  const lines: string[] = [
    `# 会话摘要`,
    `会话ID: ${currentSessionId}`,
    `条目数: ${entries.length}`,
    `总Token: ${entries.reduce((sum, e) => sum + e.tokens, 0)}`,
    ``,
    `## 最近内容`
  ]

  for (const entry of recentEntries) {
    const prefix = entry.type === 'user' ? '👤' : entry.type === 'assistant' ? '🤖' : '📝'
    lines.push(`${prefix} ${entry.content.slice(0, 100)}...`)
  }

  const autoSummary = lines.join('\n')
  await updateSummary(autoSummary)
  
  return autoSummary
}

// ============================================================================
// 元数据
// ============================================================================

/**
 * 获取会话元数据
 */
export function getSessionMetadata(): SessionMemoryMetadata | null {
  if (!currentSessionId) return null

  return {
    sessionId: currentSessionId,
    createdAt: entries[0]?.timestamp ?? Date.now(),
    lastUpdated: entries[entries.length - 1]?.timestamp ?? Date.now(),
    messageCount: entries.length,
    totalTokens: entries.reduce((sum, e) => sum + e.tokens, 0),
    version: '2.2'
  }
}

/**
 * 获取统计信息
 */
export function getSessionStats(): {
  entryCount: number
  tokenCount: number
  byType: Record<string, number>
  isDirty: boolean
  lastSnapshot: number
} {
  const byType: Record<string, number> = {}
  for (const entry of entries) {
    byType[entry.type] = (byType[entry.type] ?? 0) + 1
  }

  return {
    entryCount: entries.length,
    tokenCount: entries.reduce((sum, e) => sum + e.tokens, 0),
    byType,
    isDirty,
    lastSnapshot: lastSnapshotTime
  }
}

// ============================================================================
// 配置
// ============================================================================

export function getSessionMemoryConfig(): SessionMemoryConfig {
  return { ...config }
}

export function updateSessionMemoryConfig(updates: Partial<SessionMemoryConfig>): void {
  config = { ...config, ...updates }
}

// ============================================================================
// 工具
// ============================================================================

function generateEntryId(): string {
  return `entry_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

/**
 * 检查是否有未保存的更改
 */
export function hasUnsavedChanges(): boolean {
  return isDirty
}

/**
 * 清除会话
 */
export function clearSession(): void {
  entries = []
  pendingExtractions = []
  summary = ''
  isDirty = true
}

/**
 * 获取当前会话ID
 */
export function getCurrentSessionId(): string | null {
  return currentSessionId
}

// ============================================================================
// 订阅
// ============================================================================

export function onEntryAdded(callback: (entry: SessionMemoryEntry) => void): () => void {
  return entryAdded.subscribe(callback)
}

export function onEntryRemoved(callback: (id: string) => void): () => void {
  return entryRemoved.subscribe(callback)
}

export function onSessionLoaded(callback: (sessionId: string, entryCount: number) => void): () => void {
  return sessionLoaded.subscribe(callback)
}

export function onSessionSaved(callback: (sessionId: string) => void): () => void {
  return sessionSaved.subscribe(callback)
}

export function onSnapshotCreated(callback: (snapshot: SessionSnapshot) => void): () => void {
  return snapshotCreated.subscribe(callback)
}

export function onSummaryUpdated(callback: (summary: string) => void): () => void {
  return summaryUpdated.subscribe(callback)
}

export function onMemoryOverflow(callback: (removedCount: number) => void): () => void {
  return memoryOverflow.subscribe(callback)
}
