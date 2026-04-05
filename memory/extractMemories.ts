/**
 * Extract Memories v2.2 - 记忆自动提取增强
 * 
 * 源自Claude Code的extractMemories机制
 * 独立的记忆提取模块，支持多种触发条件和提取策略
 */

import { createSignal } from './signal'
import { saveMemory, scanAllMemories, type MemoryType } from './v2'
import { getSessionId, recordExtraction, getExtractionStats } from './state'
import { runForkedAgent, type ForkedAgentResult } from './forkedAgent'

// ============================================================================
// 类型定义
// ============================================================================

export interface ExtractionContext {
  messages: TruncatedMessage[]
  sessionId: string
  agentId?: string
  timestamp: number
  trigger: ExtractionTrigger
}

export interface TruncatedMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  tokenCount: number
}

export type ExtractionTrigger = 
  | 'manual'           // 手动触发
  | 'auto'             // 自动触发
  | 'threshold'        // 阈值触发
  | 'scheduled'        // 定时触发
  | 'forked'          // Forked Agent触发

export interface ExtractionRule {
  name: string
  type: MemoryType
  patterns: string[]       // 匹配模式
  priority: number         // 优先级
  enabled: boolean
  autoSave: boolean        // 是否自动保存
}

export interface ExtractionResult {
  success: boolean
  memories: SavedMemory[]
  tokensUsed: number
  duration: number
  trigger: ExtractionTrigger
}

export interface SavedMemory {
  name: string
  description: string
  type: MemoryType
  filePath: string
}

// ============================================================================
// 触发条件配置
// ============================================================================

export interface ExtractTriggerConfig {
  minMessages: number           // 最少消息数
  minTokens: number            // 最少token数
  minTimeMinutes: number        // 最少时间（分钟）
  toolCallsThreshold: number    // 工具调用次数阈值
  autoExtract: boolean         // 是否自动提取
  schedule?: string            // Cron表达式（定时触发）
}

// ============================================================================
// 提取规则
// ============================================================================

const DEFAULT_RULES: ExtractionRule[] = [
  {
    name: '用户偏好',
    type: 'user',
    patterns: ['喜欢', '偏好', '习惯', '想要', '希望'],
    priority: 80,
    enabled: true,
    autoSave: true
  },
  {
    name: '用户反馈',
    type: 'feedback',
    patterns: ['不对', '错了', '修改', '调整', '建议'],
    priority: 70,
    enabled: true,
    autoSave: true
  },
  {
    name: '项目进展',
    type: 'project',
    patterns: ['完成', '实现', '部署', '修复', '新增功能'],
    priority: 60,
    enabled: true,
    autoSave: false
  },
  {
    name: '重要决策',
    type: 'project',
    patterns: ['决定', '采用', '选择', '放弃', '结论'],
    priority: 90,
    enabled: true,
    autoSave: true
  },
  {
    name: '技术方案',
    type: 'reference',
    patterns: ['方案', '架构', '设计', '实现方式', '技术选型'],
    priority: 50,
    enabled: true,
    autoSave: false
  }
]

let rules = [...DEFAULT_RULES]

// ============================================================================
// 提取状态
// ============================================================================

let lastExtractionTime = 0
let lastExtractionTokenCount = 0
let messageCountSinceExtraction = 0
let toolCallCountSinceExtraction = 0

// 信号
const extractionStarted = createSignal<[trigger: ExtractionTrigger, messageCount: number]>()
const extractionCompleted = createSignal<[result: ExtractionResult]>()
const extractionFailed = createSignal<[error: string]>()
const memoryExtracted = createSignal<[memory: SavedMemory]>()
const ruleMatched = createSignal<[rule: ExtractionRule, content: string]>()

// ============================================================================
// 核心函数
// ============================================================================

/**
 * 检查是否应该触发提取
 */
export function shouldTriggerExtraction(
  messages: TruncatedMessage[],
  config: ExtractTriggerConfig
): { should: boolean; reason: ExtractionTrigger | null } {
  // 1. 检查手动触发（通过flag）
  if (messageCountSinceExtraction === -1) {
    return { should: true, reason: 'manual' }
  }

  // 2. 检查阈值触发
  const totalTokens = messages.reduce((sum, m) => sum + m.tokenCount, 0)
  const timeSinceLast = Date.now() - lastExtractionTime

  if (
    messages.length >= config.minMessages &&
    totalTokens >= config.minTokens &&
    timeSinceLast >= config.minTimeMinutes * 60 * 1000
  ) {
    return { should: true, reason: 'threshold' }
  }

  // 3. 检查工具调用阈值
  if (toolCallCountSinceExtraction >= config.toolCallsThreshold) {
    return { should: true, reason: 'auto' }
  }

  return { should: false, reason: null }
}

/**
 * 执行记忆提取
 */
export async function extractMemories(
  context: ExtractionContext,
  options?: {
    rules?: ExtractionRule[]
    skipAutoSave?: boolean
    customPrompt?: string
  }
): Promise<ExtractionResult> {
  const startTime = Date.now()
  const usedRules = options?.rules ?? rules
  const savedMemories: SavedMemory[] = []

  extractionStarted.emit(context.trigger, context.messages.length)

  try {
    // 1. 分析消息内容，匹配规则
    const matchedContent = analyzeAndMatch(context.messages, usedRules)

    // 2. 构建提取prompt
    const prompt = buildExtractPrompt(context, matchedContent, options?.customPrompt)

    // 3. 执行LLM提取（在forked agent中）
    const result = await runExtractAgent(prompt, context)

    // 4. 处理提取结果
    for (const item of result.items) {
      const rule = usedRules.find(r => r.name === item.type)
      const type = rule?.type ?? 'user'

      // 自动保存或返回待确认
      if (rule?.autoSave && !options?.skipAutoSave) {
        const saveResult = await saveMemory(
          item.name,
          item.description,
          type,
          item.content
        )

        if (saveResult.success) {
          savedMemories.push({
            name: item.name,
            description: item.description,
            type,
            filePath: saveResult.path!
          })

          memoryExtracted.emit(savedMemories[savedMemories.length - 1])
        }
      }
    }

    // 更新状态
    lastExtractionTime = Date.now()
    lastExtractionTokenCount = result.tokensUsed
    messageCountSinceExtraction = 0
    toolCallCountSinceExtraction = 0

    // 记录到State
    recordExtraction(context.sessionId, result.tokensUsed)

    const finalResult: ExtractionResult = {
      success: true,
      memories: savedMemories,
      tokensUsed: result.tokensUsed,
      duration: Date.now() - startTime,
      trigger: context.trigger
    }

    extractionCompleted.emit(finalResult)
    return finalResult

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    extractionFailed.emit(errorMsg)
    return {
      success: false,
      memories: [],
      tokensUsed: 0,
      duration: Date.now() - startTime,
      trigger: context.trigger
    }
  }
}

/**
 * 分析消息并匹配规则
 */
function analyzeAndMatch(
  messages: TruncatedMessage[],
  rules: ExtractionRule[]
): { rule: ExtractionRule; content: string }[] {
  const matched: { rule: ExtractionRule; content: string }[] = []

  for (const message of messages) {
    const content = typeof message.content === 'string' 
      ? message.content 
      : JSON.stringify(message.content)

    for (const rule of rules) {
      if (!rule.enabled) continue

      for (const pattern of rule.patterns) {
        if (content.includes(pattern)) {
          matched.push({ rule, content })
          ruleMatched.emit(rule, content.slice(0, 100))
          break
        }
      }
    }
  }

  // 按优先级排序
  return matched.sort((a, b) => b.rule.priority - a.rule.priority)
}

/**
 * 构建提取prompt
 */
function buildExtractPrompt(
  context: ExtractionContext,
  matchedContent: { rule: ExtractionRule; content: string }[],
  customPrompt?: string
): string {
  const lines: string[] = []

  lines.push(`# 记忆提取任务`)
  lines.push(`会话ID: ${context.sessionId}`)
  lines.push(`消息数: ${context.messages.length}`)
  lines.push(`触发方式: ${context.trigger}`)
  lines.push('')

  if (customPrompt) {
    lines.push(`## 自定义指令`)
    lines.push(customPrompt)
    lines.push('')
  }

  lines.push(`## 匹配的内容`)
  for (const { rule, content } of matchedContent.slice(0, 10)) {
    lines.push(`[${rule.name}]: ${content.slice(0, 200)}...`)
  }
  lines.push('')

  lines.push(`## 最近的消息`)
  for (const msg of context.messages.slice(-20)) {
    const role = msg.role === 'user' ? '用户' : '助手'
    const text = typeof msg.content === 'string' ? msg.content : '[复杂内容]'
    lines.push(`${role}: ${text.slice(0, 150)}`)
  }

  lines.push('')
  lines.push(`## 输出格式`)
  lines.push(`请以JSON格式输出需要记忆的内容:`)
  lines.push(`{
  "items": [
    {
      "name": "记忆名称",
      "type": "user|feedback|project|reference",
      "description": "简短描述",
      "content": "完整记忆内容"
    }
  ]
}`)

  return lines.join('\n')
}

/**
 * 执行提取Agent
 */
async function runExtractAgent(
  prompt: string,
  context: ExtractionContext
): Promise<{ items: ExtractionItem[]; tokensUsed: number }> {
  // 在真实实现中，这里会调用LLM
  // 目前是模拟实现
  
  // 简单模拟：基于匹配规则生成一些记忆
  const items: ExtractionItem[] = []
  
  const matchedTypes = new Set(context.messages
    .filter(m => m.role === 'user')
    .slice(-5)
    .map(() => 'user'))
  
  if (matchedTypes.size > 0) {
    items.push({
      name: '会话要点',
      type: 'user',
      description: '从对话中提取的关键信息',
      content: `会话ID: ${context.sessionId}\n消息数: ${context.messages.length}\n提取时间: ${new Date().toISOString()}`
    })
  }

  return {
    items,
    tokensUsed: prompt.length / 4  // 粗略估算
  }
}

interface ExtractionItem {
  name: string
  type: string
  description: string
  content: string
}

/**
 * 触发手动提取
 */
export async function triggerManualExtraction(
  messages: TruncatedMessage[],
  agentId?: string
): Promise<ExtractionResult> {
  messageCountSinceExtraction = -1  // 标记为手动

  return extractMemories({
    messages,
    sessionId: getSessionId(),
    agentId,
    timestamp: Date.now(),
    trigger: 'manual'
  })
}

/**
 * 触发自动提取
 */
export async function triggerAutoExtraction(
  messages: TruncatedMessage[],
  agentId?: string
): Promise<ExtractionResult> {
  return extractMemories({
    messages,
    sessionId: getSessionId(),
    agentId,
    timestamp: Date.now(),
    trigger: 'auto'
  })
}

// ============================================================================
// 规则管理
// ============================================================================

/**
 * 获取所有规则
 */
export function getExtractionRules(): ExtractionRule[] {
  return [...rules]
}

/**
 * 添加规则
 */
export function addExtractionRule(rule: ExtractionRule): void {
  rules.push(rule)
}

/**
 * 更新规则
 */
export function updateExtractionRule(name: string, updates: Partial<ExtractionRule>): boolean {
  const rule = rules.find(r => r.name === name)
  if (!rule) return false
  Object.assign(rule, updates)
  return true
}

/**
 * 删除规则
 */
export function removeExtractionRule(name: string): boolean {
  const index = rules.findIndex(r => r.name === name)
  if (index < 0) return false
  rules.splice(index, 1)
  return true
}

/**
 * 重置为默认规则
 */
export function resetExtractionRules(): void {
  rules = [...DEFAULT_RULES]
}

/**
 * 启用/禁用规则
 */
export function enableExtractionRule(name: string, enabled: boolean): boolean {
  const rule = rules.find(r => r.name === name)
  if (!rule) return false
  rule.enabled = enabled
  return true
}

// ============================================================================
// 统计
// ============================================================================

/**
 * 获取提取统计
 */
export function getExtractMemoryStats(): {
  lastExtraction: number
  tokensUsed: number
  messagesSinceExtraction: number
  toolCallsSinceExtraction: number
  totalExtractions: number
} {
  const stats = getExtractionStats()
  return {
    lastExtraction: lastExtractionTime,
    tokensUsed: lastExtractionTokenCount,
    messagesSinceExtraction: messageCountSinceExtraction,
    toolCallsSinceExtraction: toolCallCountSinceExtraction,
    totalExtractions: stats.count
  }
}

/**
 * 记录消息（用于计数）
 */
export function recordMessage(): void {
  if (messageCountSinceExtraction >= 0) {
    messageCountSinceExtraction++
  }
}

/**
 * 记录工具调用
 */
export function recordToolCall(): void {
  if (messageCountSinceExtraction >= 0) {
    toolCallCountSinceExtraction++
  }
}

// ============================================================================
// 订阅
// ============================================================================

export function onExtractionStarted(
  callback: (trigger: ExtractionTrigger, messageCount: number) => void
): () => void {
  return extractionStarted.subscribe((trigger, count) => callback(trigger, count))
}

export function onExtractionCompleted(
  callback: (result: ExtractionResult) => void
): () => void {
  return extractionCompleted.subscribe(callback)
}

export function onExtractionFailed(callback: (error: string) => void): () => void {
  return extractionFailed.subscribe(callback)
}

export function onMemoryExtracted(callback: (memory: SavedMemory) => void): () => void {
  return memoryExtracted.subscribe(callback)
}

export function onRuleMatched(callback: (rule: ExtractionRule, content: string) => void): () => void {
  return ruleMatched.subscribe(callback)
}
