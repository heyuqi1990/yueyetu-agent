/**
 * Memory System v2.0 - Auto Extract
 * 
 * 自动记忆提取机制
 * 参考: Claude Code extractMemories/extractMemories.ts
 */

/**
 * 配置
 */
export interface ExtractConfig {
  /** 新消息数量阈值 */
  minMessages?: number
  /** Token数量阈值 */
  minTokens?: number
  /** 最大保存文件数 */
  maxMemoryFiles?: number
  /** 提取间隔（turns）*/
  extractInterval?: number
}

const DEFAULT_CONFIG: Required<ExtractConfig> = {
  minMessages: 10,
  minTokens: 1000,
  maxMemoryFiles: 200,
  extractInterval: 1,
}

// 状态
let config: Required<ExtractConfig> = { ...DEFAULT_CONFIG }
let lastExtractMessageCount = 0
let turnsSinceLastExtraction = 0
let lastExtractedMessageUuid: string | undefined

/**
 * 更新配置
 */
export function setExtractConfig(newConfig: Partial<ExtractConfig>): void {
  config = { ...config, ...newConfig }
}

/**
 * 获取当前配置
 */
export function getExtractConfig(): Required<ExtractConfig> {
  return { ...config }
}

/**
 * 重置状态
 */
export function resetExtractState(): void {
  lastExtractMessageCount = 0
  turnsSinceLastExtraction = 0
  lastExtractedMessageUuid = undefined
}

/**
 * 估算token数量（简化版）
 */
function estimateTokens(text: string): number {
  // 粗略估算：中文约2字符/token，英文约4字符/token
  const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length
  const otherChars = text.length - chineseChars
  return Math.ceil(chineseChars / 2) + Math.ceil(otherChars / 4)
}

/**
 * 计算消息的token数量
 */
export function estimateMessageTokens(messages: Message[]): number {
  return messages.reduce((sum, msg) => {
    if (msg.type === 'user' || msg.type === 'assistant') {
      const content = typeof msg.message?.content === 'string' 
        ? msg.message.content 
        : Array.isArray(msg.message?.content) 
          ? msg.message.content.map(c => c.type === 'text' ? c.text : '').join('')
          : ''
      return sum + estimateTokens(content)
    }
    return sum
  }, 0)
}

/**
 * 消息类型
 */
interface Message {
  type: 'user' | 'assistant' | 'system'
  uuid?: string
  message?: {
    content?: string | Array<{ type: string; text?: string }>
  }
}

/**
 * 检查是否应该触发提取
 */
export function shouldExtract(
  messages: Message[],
  options?: {
    force?: boolean
    lastMessageUuid?: string
  }
): { should: boolean; reason?: string } {
  const force = options?.force ?? false
  const currentUuid = options?.lastMessageUuid

  // 如果有新的唯一消息ID，说明是新对话
  if (currentUuid && currentUuid !== lastExtractedMessageUuid) {
    lastExtractedMessageUuid = currentUuid
  }

  // Force模式直接返回true
  if (force) {
    return { should: true, reason: 'forced' }
  }

  // 检查提取间隔
  turnsSinceLastExtraction++
  if (turnsSinceLastExtraction < config.extractInterval) {
    return { 
      should: false, 
      reason: `throttled: ${turnsSinceLastExtraction}/${config.extractInterval}` 
    }
  }

  // 检查消息数量
  const newMessageCount = messages.length - lastExtractMessageCount
  if (newMessageCount < config.minMessages) {
    return { 
      should: false, 
      reason: `not enough messages: ${newMessageCount}/${config.minMessages}` 
    }
  }

  // 检查token数量
  const recentMessages = messages.slice(-config.minMessages)
  const tokenCount = estimateMessageTokens(recentMessages)
  if (tokenCount < config.minTokens) {
    return { 
      should: false, 
      reason: `not enough tokens: ${tokenCount}/${config.minTokens}` 
    }
  }

  return { should: true, reason: 'thresholds met' }
}

/**
 * 标记提取完成
 */
export function markExtractionComplete(messages: Message[]): void {
  lastExtractMessageCount = messages.length
  turnsSinceLastExtraction = 0
  
  const lastMessage = messages[messages.length - 1]
  if (lastMessage?.uuid) {
    lastExtractedMessageUuid = lastMessage.uuid
  }
}

/**
 * 提取结果
 */
export interface ExtractionResult {
  success: boolean
  filesWritten: string[]
  memoriesSaved: number
  turnsUsed: number
  tokensUsed: number
  error?: string
}

/**
 * 创建提取结果
 */
export function createExtractionResult(
  filesWritten: string[],
  turnsUsed: number,
  tokensUsed: number
): ExtractionResult {
  return {
    success: true,
    filesWritten,
    memoriesSaved: filesWritten.length,
    turnsUsed,
    tokensUsed,
  }
}

/**
 * 创建提取错误结果
 */
export function createExtractionError(error: unknown): ExtractionResult {
  return {
    success: false,
    filesWritten: [],
    memoriesSaved: 0,
    turnsUsed: 0,
    tokensUsed: 0,
    error: error instanceof Error ? error.message : String(error),
  }
}

/**
 * 提取统计
 */
export interface ExtractionStats {
  totalExtractions: number
  totalMemoriesSaved: number
  totalTokensUsed: number
  averageTurnsPerExtraction: number
  lastExtractionTime?: number
}

let stats: ExtractionStats = {
  totalExtractions: 0,
  totalMemoriesSaved: 0,
  totalTokensUsed: 0,
  averageTurnsPerExtraction: 0,
}

/**
 * 更新统计
 */
export function updateStats(result: ExtractionResult): void {
  stats.totalExtractions++
  stats.totalMemoriesSaved += result.memoriesSaved
  stats.totalTokensUsed += result.tokensUsed
  stats.averageTurnsPerExtraction = 
    (stats.averageTurnsPerExtraction * (stats.totalExtractions - 1) + result.turnsUsed) 
    / stats.totalExtractions
  stats.lastExtractionTime = Date.now()
}

/**
 * 获取统计
 */
export function getStats(): ExtractionStats {
  return { ...stats }
}

/**
 * 重置统计
 */
export function resetStats(): void {
  stats = {
    totalExtractions: 0,
    totalMemoriesSaved: 0,
    totalTokensUsed: 0,
    averageTurnsPerExtraction: 0,
  }
}
