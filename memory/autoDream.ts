/**
 * AutoDream v2.3 - 自动反思机制
 * 
 * 源自Claude Code的AutoDream机制
 * 在空闲时间自动进行反思、分析、生成洞察
 */

import { createSignal } from './signal'
import { runForkedAgent, getForkedAgentStats } from './forkedAgent'
import { getSessionEntries, getSessionMetadata, type SessionMemoryEntry } from './sessionMemoryEnhanced'
import { extractMemories, triggerAutoExtraction, type ExtractionTrigger } from './extractMemories'

// ============================================================================
// 类型定义
// ============================================================================

export interface DreamConfig {
  enabled: boolean
  idleThresholdMs: number        // 空闲阈值（毫秒）
  maxDreamDurationMs: number     // 最大反思时长
  minEntriesForDream: number     // 最少条目数触发
  dreamIntervalMs: number       // 反思间隔
  autoSaveInsights: boolean      // 自动保存洞察
  insightType: 'user' | 'feedback' | 'project' | 'reference'
}

export interface DreamResult {
  id: string
  timestamp: number
  duration: number
  entriesAnalyzed: number
  insights: DreamInsight[]
  extractions: number
  success: boolean
  error?: string
}

export interface DreamInsight {
  type: 'observation' | 'pattern' | 'suggestion' | 'learning'
  content: string
  confidence: number  // 0-1
  relatedEntries?: string[]
}

export interface DreamState {
  isDreaming: boolean
  lastDreamTime: number | null
  lastDreamId: string | null
  dreamCount: number
  consecutiveFailures: number
}

// ============================================================================
// 默认配置
// ============================================================================

const DEFAULT_CONFIG: DreamConfig = {
  enabled: true,
  idleThresholdMs: 5 * 60 * 1000,      // 5分钟空闲
  maxDreamDurationMs: 30 * 1000,       // 30秒反思
  minEntriesForDream: 10,               // 至少10条记录
  dreamIntervalMs: 30 * 60 * 1000,      // 30分钟间隔
  autoSaveInsights: true,
  insightType: 'reference'
}

let config: DreamConfig = { ...DEFAULT_CONFIG }
let state: DreamState = {
  isDreaming: false,
  lastDreamTime: null,
  lastDreamId: null,
  dreamCount: 0,
  consecutiveFailures: 0
}

// ============================================================================
// 空闲检测
// ============================================================================

let lastActivityTime = Date.now()
let idleCheckTimer: NodeJS.Timeout | null = null
let dreamTimer: NodeJS.Timeout | null = null

/**
 * 更新活动时间
 */
export function touch(): void {
  lastActivityTime = Date.now()
}

/**
 * 获取空闲时间
 */
export function getIdleTimeMs(): number {
  return Date.now() - lastActivityTime
}

/**
 * 检查是否空闲
 */
export function isIdle(): boolean {
  return getIdleTimeMs() >= config.idleThresholdMs
}

// ============================================================================
// 信号
// ============================================================================

const dreamStarted = createSignal<[dreamId: string, entriesAnalyzed: number]>()
const dreamCompleted = createSignal<[result: DreamResult]>()
const dreamFailed = createSignal<[error: string]>()
const insightGenerated = createSignal<[insight: DreamInsight]>()
const idleEntered = createSignal<[idleTimeMs: number]>()
const idleExited = createSignal<[]>()

// ============================================================================
// 核心功能
// ============================================================================

/**
 * 生成Dream ID
 */
function generateDreamId(): string {
  return `dream_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
}

/**
 * 执行一次反思
 */
export async function dream(options?: {
  force?: boolean        // 强制执行
  customPrompt?: string  // 自定义prompt
}): Promise<DreamResult> {
  const dreamId = generateDreamId()
  const startTime = Date.now()

  // 检查是否已经在dream
  if (state.isDreaming) {
    return {
      id: dreamId,
      timestamp: startTime,
      duration: 0,
      entriesAnalyzed: 0,
      insights: [],
      extractions: 0,
      success: false,
      error: 'Already dreaming'
    }
  }

  // 检查条目数
  const entries = getSessionEntries()
  if (entries.length < config.minEntriesForDream) {
    return {
      id: dreamId,
      timestamp: startTime,
      duration: 0,
      entriesAnalyzed: 0,
      insights: [],
      extractions: 0,
      success: false,
      error: `Not enough entries: ${entries.length} < ${config.minEntriesForDream}`
    }
  }

  // 如果不是强制执行，检查空闲状态
  if (!options?.force && !isIdle()) {
    return {
      id: dreamId,
      timestamp: startTime,
      duration: 0,
      entriesAnalyzed: 0,
      insights: [],
      extractions: 0,
      success: false,
      error: 'Not idle'
    }
  }

  state.isDreaming = true
  dreamStarted.emit(dreamId, entries.length)

  try {
    // 构建反思prompt
    const prompt = options?.customPrompt ?? buildDreamPrompt(entries)

    // 在forked agent中执行反思
    const result = await runForkedAgent(prompt, {
      id: dreamId,
      name: `AutoDream: ${entries.length} entries`,
      timeout: config.maxDreamDurationMs
    })

    // 解析反思结果
    const insights = parseInsights(result.output, entries)

    // 处理洞察
    for (const insight of insights) {
      insightGenerated.emit(insight)

      if (config.autoSaveInsights) {
        // 可以选择保存洞察到记忆
        // await saveInsight(insight)
      }
    }

    // 触发记忆提取（如果有必要）
    let extractionCount = 0
    if (insights.length > 0) {
      try {
        const sessionEntries = entries.map(e => ({
          role: e.type as 'user' | 'assistant' | 'system',
          content: e.content,
          timestamp: e.timestamp,
          tokenCount: e.tokens
        }))
        
        await triggerAutoExtraction(sessionEntries as any, undefined)
        extractionCount = 1
      } catch {}
    }

    const duration = Date.now() - startTime
    const finalResult: DreamResult = {
      id: dreamId,
      timestamp: startTime,
      duration,
      entriesAnalyzed: entries.length,
      insights,
      extractions: extractionCount,
      success: true
    }

    // 更新状态
    state.lastDreamTime = startTime
    state.lastDreamId = dreamId
    state.dreamCount++
    state.consecutiveFailures = 0

    dreamCompleted.emit(finalResult)
    return finalResult

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    
    state.consecutiveFailures++
    
    dreamFailed.emit(errorMsg)
    
    return {
      id: dreamId,
      timestamp: startTime,
      duration: Date.now() - startTime,
      entriesAnalyzed: entries.length,
      insights: [],
      extractions: 0,
      success: false,
      error: errorMsg
    }
  } finally {
    state.isDreaming = false
    touch()  // 重置空闲时间
  }
}

/**
 * 构建反思prompt
 */
function buildDreamPrompt(entries: SessionMemoryEntry[]): string {
  const lines: string[] = []

  lines.push(`# AutoDream 反思任务`)
  lines.push(`时间: ${new Date().toISOString()}`)
  lines.push(`分析条目: ${entries.length}`)
  lines.push('')

  // 按类型分组最近的条目
  const recentEntries = entries.slice(-50)
  
  lines.push(`## 用户消息`)
  const userEntries = recentEntries.filter(e => e.type === 'user')
  for (const entry of userEntries.slice(-10)) {
    lines.push(`- ${entry.content.slice(0, 150)}`)
  }

  lines.push('')
  lines.push(`## 助手回复`)
  const assistantEntries = recentEntries.filter(e => e.type === 'assistant')
  for (const entry of assistantEntries.slice(-10)) {
    lines.push(`- ${entry.content.slice(0, 150)}`)
  }

  lines.push('')
  lines.push(`## 重要条目`)
  const importantEntries = recentEntries.filter(e => e.important)
  for (const entry of importantEntries) {
    lines.push(`- [重要] ${entry.content.slice(0, 150)}`)
  }

  lines.push('')
  lines.push(`## 反思问题`)
  lines.push(`请分析以上内容，回答以下问题:`)
  lines.push(``)
  lines.push(`1. **模式识别**: 用户的行为模式是什么？有什么重复出现的趋势？`)
  lines.push(`2. **未解决的问题**: 有哪些用户问题还没有被很好解决？`)
  lines.push(`3. **学习机会**: 从这次对话中学到了什么？有什么可以改进的？`)
  lines.push(`4. **洞察**: 有什么有价值的观察或见解？`)
  lines.push(``)
  lines.push(`请以JSON格式输出反思结果:`)
  lines.push(`{
  "insights": [
    {
      "type": "observation|pattern|suggestion|learning",
      "content": "具体内容",
      "confidence": 0.0-1.0,
      "relatedEntries": ["entry_id1", "entry_id2"]
    }
  ]
}`)

  return lines.join('\n')
}

/**
 * 解析洞察
 */
function parseInsights(output: string, entries: SessionMemoryEntry[]): DreamInsight[] {
  try {
    // 尝试提取JSON
    const jsonMatch = output.match(/\{[\s\S]*"insights"[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      if (Array.isArray(parsed.insights)) {
        return parsed.insights.map((i: any) => ({
          type: i.type || 'observation',
          content: i.content || '',
          confidence: typeof i.confidence === 'number' ? i.confidence : 0.5,
          relatedEntries: i.relatedEntries || []
        }))
      }
    }
  } catch {}

  // 回退：简单解析
  const insights: DreamInsight[] = []
  
  if (output.includes('模式') || output.includes('pattern')) {
    insights.push({
      type: 'pattern',
      content: '识别到一个行为模式',
      confidence: 0.6
    })
  }

  if (output.includes('建议') || output.includes('suggestion')) {
    insights.push({
      type: 'suggestion',
      content: '生成了一条建议',
      confidence: 0.5
    })
  }

  return insights
}

// ============================================================================
// 自动调度
// ============================================================================

/**
 * 启动自动反思
 */
export function startDreamScheduler(): void {
  if (dreamTimer) return

  // 定期检查是否应该dream
  dreamTimer = setInterval(async () => {
    if (!config.enabled) return
    if (state.isDreaming) return
    if (!isIdle()) return

    // 检查间隔
    if (state.lastDreamTime) {
      const elapsed = Date.now() - state.lastDreamTime
      if (elapsed < config.dreamIntervalMs) return
    }

    // 执行反思
    await dream({ force: false })

  }, 60 * 1000)  // 每分钟检查

  dreamTimer.unref?.()
}

/**
 * 停止自动反思
 */
export function stopDreamScheduler(): void {
  if (dreamTimer) {
    clearInterval(dreamTimer)
    dreamTimer = null
  }
}

/**
 * 启动空闲检测
 */
export function startIdleMonitor(): void {
  if (idleCheckTimer) return

  idleCheckTimer = setInterval(() => {
    const wasIdle = isIdle()
    touch()  // 在调用之间没有活动才叫空闲
    
    if (!wasIdle && isIdle()) {
      idleEntered.emit(getIdleTimeMs())
    } else if (wasIdle && !isIdle()) {
      idleExited.emit()
    }
  }, 10 * 1000)  // 每10秒检查

  idleCheckTimer.unref?.()
}

/**
 * 停止空闲检测
 */
export function stopIdleMonitor(): void {
  if (idleCheckTimer) {
    clearInterval(idleCheckTimer)
    idleCheckTimer = null
  }
}

// ============================================================================
// 洞察管理
// ============================================================================

/**
 * 保存洞察到记忆
 */
export async function saveInsightAsMemory(insight: DreamInsight): Promise<string> {
  const { saveMemory } = await import('./v2')
  
  const result = await saveMemory(
    `洞察_${insight.type}_${Date.now()}`,
    insight.content,
    config.insightType,
    `来源: AutoDream\n置信度: ${insight.confidence}\n类型: ${insight.type}`
  )

  return result.path ?? ''
}

// ============================================================================
// 配置
// ============================================================================

export function getDreamConfig(): DreamConfig {
  return { ...config }
}

export function updateDreamConfig(updates: Partial<DreamConfig>): void {
  config = { ...config, ...updates }
}

export function enableDream(): void {
  config.enabled = true
}

export function disableDream(): void {
  config.enabled = false
}

// ============================================================================
// 状态
// ============================================================================

export function getDreamState(): DreamState {
  return { ...state }
}

export function resetDreamState(): void {
  state = {
    isDreaming: false,
    lastDreamTime: null,
    lastDreamId: null,
    dreamCount: 0,
    consecutiveFailures: 0
  }
}

// ============================================================================
// 统计
// ============================================================================

export function getDreamStats(): {
  dreamCount: number
  lastDream: number | null
  successRate: number
  avgDuration: number
} {
  return {
    dreamCount: state.dreamCount,
    lastDream: state.lastDreamTime,
    successRate: state.dreamCount > 0 
      ? (state.dreamCount - state.consecutiveFailures) / state.dreamCount 
      : 0
  }
}

// ============================================================================
// 订阅
// ============================================================================

export function onDreamStarted(callback: (dreamId: string, entriesAnalyzed: number) => void): () => void {
  return dreamStarted.subscribe((id, entries) => callback(id, entries))
}

export function onDreamCompleted(callback: (result: DreamResult) => void): () => void {
  return dreamCompleted.subscribe(callback)
}

export function onDreamFailed(callback: (error: string) => void): () => void {
  return dreamFailed.subscribe(callback)
}

export function onInsightGenerated(callback: (insight: DreamInsight) => void): () => void {
  return insightGenerated.subscribe(callback)
}

export function onIdleEntered(callback: (idleTimeMs: number) => void): () => void {
  return idleEntered.subscribe(callback)
}

export function onIdleExited(callback: () => void): () => void {
  return idleExited.subscribe(callback)
}

// ============================================================================
// 工具
// ============================================================================

/**
 * 检查是否可以开始反思
 */
export function canDream(): { can: boolean; reason?: string } {
  if (!config.enabled) {
    return { can: false, reason: 'Dream is disabled' }
  }

  if (state.isDreaming) {
    return { can: false, reason: 'Already dreaming' }
  }

  const entries = getSessionEntries()
  if (entries.length < config.minEntriesForDream) {
    return { can: false, reason: `Not enough entries: ${entries.length} < ${config.minEntriesForDream}` }
  }

  if (!isIdle()) {
    return { can: false, reason: 'Not idle' }
  }

  return { can: true }
}

/**
 * 格式化最近反思结果
 */
export function formatLastDream(): string {
  if (!state.lastDreamTime) {
    return 'No dreams yet'
  }

  const lines: string[] = []
  lines.push(`Last Dream: ${new Date(state.lastDreamTime).toLocaleString()}`)
  lines.push(`Dream Count: ${state.dreamCount}`)

  return lines.join('\n')
}
