/**
 * Memory System v2.0 - Session Memory
 * 
 * 会话记忆持续维护模块
 * 参考: Claude Code SessionMemory/sessionMemory.ts
 */

import { writeFile, readFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { createSessionMemoryToolChecker } from './toolPermissions'

/**
 * Session Memory配置
 */
export interface SessionMemoryConfig {
  /** 初始化所需最小消息token数 */
  minimumMessageTokensToInit: number
  /** 更新间隔的最小token数 */
  minimumTokensBetweenUpdate: number
  /** 更新间隔的最小工具调用数 */
  toolCallsBetweenUpdates: number
}

const DEFAULT_SESSION_MEMORY_CONFIG: Required<SessionMemoryConfig> = {
  minimumMessageTokensToInit: 1000,
  minimumTokensBetweenUpdate: 500,
  toolCallsBetweenUpdates: 10,
}

// Session Memory状态
let sessionMemoryConfig: Required<SessionMemoryConfig> = { ...DEFAULT_SESSION_MEMORY_CONFIG }
let isInitialized = false
let lastExtractionMessageUuid: string | undefined
let lastExtractionTokenCount = 0

/**
 * Session Memory路径
 */
export function getSessionMemoryPath(): string {
  return join(process.env.HOME || '~', '.openclaw', 'memory', 'session.md')
}

/**
 * Session Memory目录
 */
export function getSessionMemoryDir(): string {
  return join(process.env.HOME || '~', '.openclaw', 'memory')
}

/**
 * 更新配置
 */
export function setSessionMemoryConfig(config: Partial<SessionMemoryConfig>): void {
  sessionMemoryConfig = {
    ...sessionMemoryConfig,
    ...Object.fromEntries(
      Object.entries(config).filter(([_, v]) => v !== undefined)
    )
  }
}

/**
 * 获取配置
 */
export function getSessionMemoryConfig(): Required<SessionMemoryConfig> {
  return { ...sessionMemoryConfig }
}

/**
 * 重置状态
 */
export function resetSessionMemory(): void {
  isInitialized = false
  lastExtractionMessageUuid = undefined
  lastExtractionTokenCount = 0
}

/**
 * 标记已初始化
 */
export function markInitialized(): void {
  isInitialized = true
}

/**
 * 检查是否已初始化
 */
export function isSessionMemoryInitialized(): boolean {
  return isInitialized
}

/**
 * 记录提取token数
 */
export function recordExtractionTokenCount(tokens: number): void {
  lastExtractionTokenCount = tokens
}

/**
 * 标记提取开始
 */
export function markExtractionStarted(): void {
  // 可以在这里添加日志或状态更新
}

/**
 * 标记提取完成
 */
export function markExtractionCompleted(): void {
  // 可以在这里添加日志或状态更新
}

/**
 * 设置最后提取的消息UUID
 */
export function setLastExtractionMessageId(uuid: string): void {
  lastExtractionMessageUuid = uuid
}

/**
 * 获取最后提取的消息UUID
 */
export function getLastExtractionMessageId(): string | undefined {
  return lastExtractionMessageUuid
}

/**
 * 估算token数
 */
function estimateTokens(text: string): number {
  const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length
  const otherChars = text.length - chineseChars
  return Math.ceil(chineseChars / 2) + Math.ceil(otherChars / 4)
}

/**
 * 计算消息的token数
 */
function estimateMessageTokens(messages: Message[]): number {
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
 * 工具调用消息
 */
interface ToolCallMessage extends Message {
  type: 'assistant'
  message: {
    content: Array<{ type: 'tool_use'; id: string; name: string }>
  }
}

/**
 * 检查最后一条assistant消息是否有工具调用
 */
function hasToolCallsInLastAssistantTurn(messages: Message[]): boolean {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg.type === 'assistant') {
      const content = msg.message?.content
      if (Array.isArray(content)) {
        return content.some(block => block.type === 'tool_use')
      }
      return false
    }
  }
  return false
}

/**
 * 计算自上次提取后的工具调用数
 */
function countToolCallsSince(
  messages: Message[],
  sinceUuid: string | undefined
): number {
  if (!sinceUuid) {
    return messages.filter(msg => {
      if (msg.type !== 'assistant') return false
      const content = msg.message?.content
      return Array.isArray(content) && content.some(block => block.type === 'tool_use')
    }).length
  }

  let foundStart = false
  let count = 0

  for (const msg of messages) {
    if (!foundStart) {
      if (msg.uuid === sinceUuid) {
        foundStart = true
      }
      continue
    }
    if (msg.type === 'assistant') {
      const content = msg.message?.content
      if (Array.isArray(content)) {
        count += content.filter(block => block.type === 'tool_use').length
      }
    }
  }

  return count
}

/**
 * 检查是否满足初始化阈值
 */
export function hasMetInitializationThreshold(currentTokenCount: number): boolean {
  return currentTokenCount >= sessionMemoryConfig.minimumMessageTokensToInit
}

/**
 * 检查是否满足更新阈值
 */
export function hasMetUpdateThreshold(currentTokenCount: number): boolean {
  const tokensSinceLastExtraction = currentTokenCount - lastExtractionTokenCount
  return tokensSinceLastExtraction >= sessionMemoryConfig.minimumTokensBetweenUpdate
}

/**
 * 检查工具调用阈值
 */
export function hasMetToolCallsThreshold(toolCalls: number): boolean {
  return toolCalls >= sessionMemoryConfig.toolCallsBetweenUpdates
}

/**
 * 检查是否应该提取记忆
 */
export function shouldExtractMemory(messages: Message[]): boolean {
  // 检查是否已初始化
  if (!isInitialized) {
    const tokenCount = estimateMessageTokens(messages)
    if (!hasMetInitializationThreshold(tokenCount)) {
      return false
    }
    markInitialized()
  }

  // 检查token阈值
  const tokenCount = estimateMessageTokens(messages)
  const hasMetTokenThreshold = hasMetUpdateThreshold(tokenCount)

  // 检查工具调用阈值
  const toolCallsSinceLastUpdate = countToolCallsSince(
    messages,
    lastExtractionMessageUuid
  )
  const hasMetToolCallThreshold = hasMetToolCallsThreshold(toolCallsSinceLastUpdate)

  // 检查最后assistant消息是否有工具调用
  const hasToolCallsInLastTurn = hasToolCallsInLastAssistantTurn(messages)

  // 触发条件：
  // 1. token和工具调用阈值都满足，或
  // 2. token阈值满足且最后turn没有工具调用（自然对话停顿点）
  const shouldExtract =
    (hasMetTokenThreshold && hasMetToolCallThreshold) ||
    (hasMetTokenThreshold && !hasToolCallsInLastTurn)

  if (shouldExtract) {
    const lastMessage = messages[messages.length - 1]
    if (lastMessage?.uuid) {
      setLastExtractionMessageId(lastMessage.uuid)
    }
  }

  return shouldExtract
}

/**
 * 创建Session Memory文件
 */
export async function setupSessionMemoryFile(): Promise<{
  memoryPath: string
  currentMemory: string
}> {
  const memoryDir = getSessionMemoryDir()
  const memoryPath = getSessionMemoryPath()

  // 创建目录
  await mkdir(memoryDir, { mode: 0o700, recursive: true })

  // 创建文件（如果不存在）
  try {
    await writeFile(memoryPath, '', {
      encoding: 'utf-8',
      mode: 0o600,
      flag: 'wx'
    })
    // 写入模板
    const template = getSessionMemoryTemplate()
    await writeFile(memoryPath, template, {
      encoding: 'utf-8',
      mode: 0o600
    })
  } catch (e: unknown) {
    // EEXIST错误可以忽略
    const code = (e as { code?: string }).code
    if (code !== 'EEXIST') {
      throw e
    }
  }

  // 读取当前内容
  let currentMemory = ''
  try {
    currentMemory = await readFile(memoryPath, 'utf-8')
  } catch {
    // 忽略读取错误
  }

  return { memoryPath, currentMemory }
}

/**
 * 获取Session Memory模板
 */
export function getSessionMemoryTemplate(): string {
  return `# Session Memory

<!-- 自动维护的会话记忆 -->

## 当前会话摘要

<!-- 关键信息、决策、待办 -->

## 重要上下文

<!-- 当前任务的背景信息 -->

## 待完成事项

<!-- 用户交代但尚未完成的任务 -->

---
*自动生成，请勿手动编辑*
`
}

/**
 * 构建Session Memory更新提示
 */
export function buildSessionMemoryUpdatePrompt(
  currentMemory: string,
  memoryPath: string
): string {
  return `You are updating the session memory file at ${memoryPath}.

## Current session memory:
${currentMemory}

## Your task:
Review the recent conversation and update the session memory file to reflect:
1. Key decisions or conclusions reached
2. Important context that should be remembered
3. Pending tasks or follow-ups
4. Any information worth preserving from this session

## Rules:
- Only Edit the session memory file
- Keep the format clean and organized
- Remove outdated information
- Add new important context
- Preserve the structure (sections: 当前会话摘要, 重要上下文, 待完成事项)

## Output:
Update the session memory file with relevant information from the conversation.`
}

/**
 * 工具权限检查器（用于Session Memory更新）
 */
export function createSessionMemoryToolCheckerForUpdate(memoryPath: string) {
  return createSessionMemoryToolChecker(memoryPath)
}
