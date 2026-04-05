/**
 * Memory System v2.0 - Memory Compaction
 * 
 * 记忆压缩与Compaction集成
 * 参考: Claude Code compact/sessionMemoryCompact.ts
 */

/**
 * Compaction配置
 */
export interface MemoryCompactConfig {
  /** 压缩后保留的最小token数 */
  minTokens: number
  /** 保留的最小文本块消息数 */
  minTextBlockMessages: number
  /** 压缩后保留的最大token数 */
  maxTokens: number
}

const DEFAULT_COMPACT_CONFIG: MemoryCompactConfig = {
  minTokens: 10_000,
  minTextBlockMessages: 5,
  maxTokens: 40_000,
}

let compactConfig: MemoryCompactConfig = { ...DEFAULT_COMPACT_CONFIG }

/**
 * 更新配置
 */
export function setMemoryCompactConfig(config: Partial<MemoryCompactConfig>): void {
  compactConfig = { ...compactConfig, ...config }
}

/**
 * 获取配置
 */
export function getMemoryCompactConfig(): MemoryCompactConfig {
  return { ...compactConfig }
}

/**
 * 消息类型
 */
interface Message {
  type: 'user' | 'assistant' | 'system'
  uuid?: string
  id?: string
  message?: {
    content?: string | Array<{ type: string; text?: string }>
  }
}

/**
 * 压缩边界消息
 */
interface CompactBoundaryMessage extends Message {
  type: 'system'
  isCompactBoundary?: boolean
  compactType?: 'auto' | 'manual'
  preCompactTokenCount?: number
  compactMetadata?: {
    preCompactDiscoveredTools?: string[]
  }
}

/**
 * 检查是否为压缩边界消息
 */
export function isCompactBoundaryMessage(msg: Message): boolean {
  return (
    msg.type === 'system' &&
    (msg as CompactBoundaryMessage).isCompactBoundary === true
  )
}

/**
 * 创建压缩边界消息
 */
export function createCompactBoundaryMessage(
  compactType: 'auto' | 'manual',
  preCompactTokenCount: number,
  lastMessageUuid?: string
): CompactBoundaryMessage {
  return {
    type: 'system',
    uuid: lastMessageUuid,
    isCompactBoundary: true,
    compactType,
    preCompactTokenCount,
    compactMetadata: {}
  }
}

/**
 * 估算消息的token数
 */
export function estimateMessageTokens(messages: Message[]): number {
  return messages.reduce((sum, msg) => {
    if (msg.type === 'user' || msg.type === 'assistant') {
      const content = typeof msg.message?.content === 'string' 
        ? msg.message.content 
        : Array.isArray(msg.message?.content) 
          ? msg.message.content.map(c => c.type === 'text' ? c.text : '').join('')
          : ''
      // 粗略估算
      const chineseChars = (content.match(/[\u4e00-\u9fff]/g) || []).length
      const otherChars = content.length - chineseChars
      return sum + Math.ceil(chineseChars / 2) + Math.ceil(otherChars / 4)
    }
    return sum
  }, 0)
}

/**
 * 检查消息是否有文本块
 */
export function hasTextBlocks(msg: Message): boolean {
  if (msg.type === 'assistant' || msg.type === 'user') {
    const content = msg.message?.content
    if (typeof content === 'string') {
      return content.length > 0
    }
    if (Array.isArray(content)) {
      return content.some(block => block.type === 'text')
    }
  }
  return false
}

/**
 * 计算消息中的工具调用ID
 */
export function getToolResultIds(msg: Message): string[] {
  if (msg.type !== 'user') return []
  
  const content = msg.message?.content
  if (!Array.isArray(content)) return []
  
  return content
    .filter(block => block.type === 'tool_result')
    .map(block => (block as { tool_use_id?: string }).tool_use_id || '')
    .filter(Boolean)
}

/**
 * 检查assistant消息是否包含特定工具调用ID
 */
export function hasToolUseWithIds(
  msg: Message,
  toolUseIds: Set<string>
): boolean {
  if (msg.type !== 'assistant') return false
  
  const content = msg.message?.content
  if (!Array.isArray(content)) return false
  
  return content.some(
    block => 
      block.type === 'tool_use' && 
      toolUseIds.has((block as { id?: string }).id || '')
  )
}

/**
 * 调整索引以保留API不变量
 * 确保不分割tool_use/tool_result对
 */
export function adjustIndexToPreserveApiInvariants(
  messages: Message[],
  startIndex: number
): number {
  if (startIndex <= 0 || startIndex >= messages.length) {
    return startIndex
  }

  let adjustedIndex = startIndex

  // 步骤1: 处理tool_use/tool_result对
  const allToolResultIds: string[] = []
  for (let i = startIndex; i < messages.length; i++) {
    allToolResultIds.push(...getToolResultIds(messages[i]!))
  }

  if (allToolResultIds.length > 0) {
    // 收集已保留范围内的tool_use ID
    const toolUseIdsInKeptRange = new Set<string>()
    for (let i = adjustedIndex; i < messages.length; i++) {
      const msg = messages[i]!
      if (msg.type === 'assistant' && Array.isArray(msg.message?.content)) {
        for (const block of msg.message.content) {
          if (block.type === 'tool_use') {
            toolUseIdsInKeptRange.add((block as { id?: string }).id || '')
          }
        }
      }
    }

    // 找出需要的前置tool_use
    const neededToolUseIds = new Set(
      allToolResultIds.filter(id => !toolUseIdsInKeptRange.has(id))
    )

    // 向前查找包含所需tool_use的消息
    for (let i = adjustedIndex - 1; i >= 0 && neededToolUseIds.size > 0; i--) {
      const message = messages[i]!
      if (hasToolUseWithIds(message, neededToolUseIds)) {
        adjustedIndex = i
        // 移除已找到的ID
        if (message.type === 'assistant' && Array.isArray(message.message?.content)) {
          for (const block of message.message.content) {
            if (block.type === 'tool_use') {
              neededToolUseIds.delete((block as { id?: string }).id || '')
            }
          }
        }
      }
    }
  }

  // 步骤2: 处理共享message.id的thinking块
  const messageIdsInKeptRange = new Set<string>()
  for (let i = adjustedIndex; i < messages.length; i++) {
    const msg = messages[i]!
    if (msg.type === 'assistant' && msg.id) {
      messageIdsInKeptRange.add(msg.id)
    }
  }

  // 向前查找共享message.id的消息
  for (let i = adjustedIndex - 1; i >= 0; i--) {
    const message = messages[i]!
    if (
      message.type === 'assistant' &&
      message.id &&
      messageIdsInKeptRange.has(message.id)
    ) {
      adjustedIndex = i
    }
  }

  return adjustedIndex
}

/**
 * 计算要保留的消息起始索引
 */
export function calculateMessagesToKeepIndex(
  messages: Message[],
  lastSummarizedIndex: number
): number {
  if (messages.length === 0) return 0

  // 从lastSummarizedIndex之后开始
  let startIndex = lastSummarizedIndex >= 0 
    ? lastSummarizedIndex + 1 
    : messages.length

  // 计算当前token数和文本块消息数
  let totalTokens = 0
  let textBlockMessageCount = 0
  for (let i = startIndex; i < messages.length; i++) {
    const msg = messages[i]!
    totalTokens += estimateMessageTokens([msg])
    if (hasTextBlocks(msg)) {
      textBlockMessageCount++
    }
  }

  // 如果已达到最大上限，直接调整
  if (totalTokens >= compactConfig.maxTokens) {
    return adjustIndexToPreserveApiInvariants(messages, startIndex)
  }

  // 如果已满足最小要求，直接调整
  if (
    totalTokens >= compactConfig.minTokens &&
    textBlockMessageCount >= compactConfig.minTextBlockMessages
  ) {
    return adjustIndexToPreserveApiInvariants(messages, startIndex)
  }

  // 向前扩展直到满足要求或达到边界
  const floorIndex = messages.findLastIndex(m => isCompactBoundaryMessage(m))
  const floor = floorIndex === -1 ? 0 : floorIndex + 1

  for (let i = startIndex - 1; i >= floor; i--) {
    const msg = messages[i]!
    totalTokens += estimateMessageTokens([msg])
    if (hasTextBlocks(msg)) {
      textBlockMessageCount++
    }
    startIndex = i

    if (totalTokens >= compactConfig.maxTokens) break
    if (
      totalTokens >= compactConfig.minTokens &&
      textBlockMessageCount >= compactConfig.minTextBlockMessages
    ) break
  }

  return adjustIndexToPreserveApiInvariants(messages, startIndex)
}

/**
 * 压缩结果
 */
export interface CompactionResult {
  boundaryMarker: CompactBoundaryMessage
  summary: string
  messagesToKeep: Message[]
  hookResults?: unknown[]
  preCompactTokenCount?: number
  postCompactTokenCount?: number
}

/**
 * 从Session Memory创建压缩结果
 */
export function createCompactionResultFromSessionMemory(
  messages: Message[],
  sessionMemory: string,
  messagesToKeep: Message[],
  lastMessageUuid?: string
): CompactionResult {
  const preCompactTokenCount = estimateMessageTokens(messages)
  
  const boundaryMarker = createCompactBoundaryMessage(
    'auto',
    preCompactTokenCount,
    lastMessageUuid
  )

  // 从sessionMemory生成摘要
  const summary = summarizeSessionMemory(sessionMemory)

  return {
    boundaryMarker,
    summary,
    messagesToKeep,
  }
}

/**
 * 从Session Memory生成摘要
 */
export function summarizeSessionMemory(sessionMemory: string): string {
  // 提取关键部分
  const lines = sessionMemory.split('\n')
  const sections: string[] = []
  let currentSection: string[] = []
  let inSection = false

  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (currentSection.length > 0) {
        sections.push(currentSection.join('\n'))
        currentSection = []
      }
      currentSection.push(line)
      inSection = true
    } else if (inSection && line.trim()) {
      currentSection.push(line)
    }
  }

  if (currentSection.length > 0) {
    sections.push(currentSection.join('\n'))
  }

  return sections.join('\n\n')
}

/**
 * 构建压缩后的消息列表
 */
export function buildPostCompactMessages(result: CompactionResult): Message[] {
  const messages: Message[] = []
  
  // 添加边界标记
  messages.push(result.boundaryMarker)
  
  // 添加摘要消息
  if (result.summary) {
    messages.push({
      type: 'user',
      message: {
        content: `Session Summary:\n\n${result.summary}`
      }
    })
  }
  
  // 添加要保留的消息
  messages.push(...result.messagesToKeep)
  
  return messages
}

/**
 * 截断过长的Session Memory
 */
export function truncateSessionMemoryForCompact(
  sessionMemory: string,
  maxLength: number = 5000
): { truncatedContent: string; wasTruncated: boolean } {
  if (sessionMemory.length <= maxLength) {
    return { truncatedContent: sessionMemory, wasTruncated: false }
  }

  return {
    truncatedContent: sessionMemory.slice(0, maxLength) + '\n\n[...truncated...]',
    wasTruncated: true
  }
}
