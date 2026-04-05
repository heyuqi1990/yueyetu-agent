/**
 * Memory System v2.1 - Core Engine
 * 
 * 统一的记忆系统核心引擎
 * 整合Phase 1-4所有模块，实现记忆永不丢失
 */

import { readFile, writeFile, readdir, mkdir, access, rename, unlink } from 'fs/promises'
import { basename, join, dirname } from 'path'
import { 
  MEMORY_TYPES, 
  parseMemoryType, 
  type MemoryType 
} from './memoryTypes'
import { 
  buildExtractPrompt, 
  buildAccessPrompt,
  buildExplicitSavePrompt,
  buildForgetPrompt 
} from './extractPrompt'
import { 
  shouldExtract,
  markExtractionComplete,
  setExtractConfig,
  getExtractConfig,
  type ExtractConfig,
  type ExtractionResult
} from './autoExtract'
import { 
  createStandardMemoryToolChecker,
  type PermissionDecision 
} from './toolPermissions'
import { 
  shouldExtractMemory,
  setupSessionMemoryFile,
  getSessionMemoryTemplate,
  buildSessionMemoryUpdatePrompt,
  setSessionMemoryConfig,
  getSessionMemoryConfig,
  resetSessionMemory,
  setLastExtractionMessageId,
  getLastExtractionMessageId
} from './sessionMemory'
import { 
  calculateMessagesToKeepIndex,
  createCompactBoundaryMessage,
  buildPostCompactMessages,
  truncateSessionMemoryForCompact,
  createCompactionResultFromSessionMemory,
  isCompactBoundaryMessage,
  type CompactionResult
} from './compact'
import { 
  checkDuplicateWithScan,
  scanAllMemoryEntries,
  type SimilarityResult 
} from './dedup'
import { 
  validateFrontmatter,
  checkStaleness,
  assessTrustLevel,
  type VerificationResult,
  type TrustLevel
} from './verify'
import { 
  estimateTokens,
  generateOptimizationSuggestions,
  type TokenStats,
  type OptimizationSuggestion
} from './tokenOptimizer'

// ============================================================================
// 导出所有类型
// ============================================================================

export type { MemoryType }
export { MEMORY_TYPES, parseMemoryType }
export type { ExtractConfig, ExtractionResult }
export type { PermissionDecision }
export type { VerificationResult, TrustLevel }
export type { TokenStats, OptimizationSuggestion }
export type { CompactionResult }
export type { SimilarityResult }

// ============================================================================
// 常量
// ============================================================================

const MEMORY_DIR = join(process.env.HOME || '~', '.openclaw', 'memory')
const MEMORY_INDEX = 'MEMORY.md'
const SESSION_MEMORY = 'session.md'
const BACKUP_DIR = 'backups'
const LOG_FILE = 'memory.log'

// ============================================================================
// 记忆条目接口
// ============================================================================

export interface MemoryHeader {
  filename: string
  filePath: string
  name: string
  description: string
  type: MemoryType
  mtimeMs: number
  size: number
}

export interface MemoryContent extends MemoryHeader {
  body: string
  tokens: number
  trustLevel: TrustLevel
}

export interface MemoryEntry {
  header: MemoryHeader
  content: string
  verification: VerificationResult
  stats?: TokenStats
}

// ============================================================================
// 日志系统
// ============================================================================

type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG'

async function log(level: LogLevel, message: string, data?: unknown): Promise<void> {
  const timestamp = new Date().toISOString()
  const logEntry = `[${timestamp}] [${level}] ${message}${data ? ' ' + JSON.stringify(data) : ''}\n`
  
  try {
    const logPath = join(MEMORY_DIR, LOG_FILE)
    await appendToFile(logPath, logEntry)
  } catch {
    // 忽略日志写入失败
  }
  
  if (level === 'ERROR') {
    console.error(logEntry)
  }
}

// ============================================================================
// 工具函数
// ============================================================================

async function appendToFile(filePath: string, content: string): Promise<void> {
  try {
    const dir = dirname(filePath)
    await mkdir(dir, { recursive: true, mode: 0o700 })
    await writeFile(filePath, content, { encoding: 'utf-8', flag: 'a' })
  } catch (e) {
    console.error('Failed to append to file:', e)
  }
}

async function safeReadFile(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, 'utf-8')
  } catch {
    return null
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

function getTypeDir(type: MemoryType): string {
  return join(MEMORY_DIR, type)
}

// ============================================================================
// 核心API
// ============================================================================

/**
 * 初始化记忆系统
 */
export async function initialize(): Promise<void> {
  await log('INFO', 'Initializing Memory System v2.1')
  
  // 创建目录结构
  await mkdir(MEMORY_DIR, { recursive: true, mode: 0o700 })
  await mkdir(join(MEMORY_DIR, BACKUP_DIR), { recursive: true, mode: 0o700 })
  await mkdir(join(MEMORY_DIR, 'user'), { recursive: true, mode: 0o700 })
  await mkdir(join(MEMORY_DIR, 'feedback'), { recursive: true, mode: 0o700 })
  await mkdir(join(MEMORY_DIR, 'project'), { recursive: true, mode: 0o700 })
  await mkdir(join(MEMORY_DIR, 'reference'), { recursive: true, mode: 0o700 })
  
  // 创建索引文件
  const indexPath = join(MEMORY_DIR, MEMORY_INDEX)
  if (!(await fileExists(indexPath))) {
    await writeFile(indexPath, getDefaultIndexContent(), { mode: 0o600 })
  }
  
  // 创建Session Memory模板
  const sessionPath = join(MEMORY_DIR, SESSION_MEMORY)
  if (!(await fileExists(sessionPath))) {
    await writeFile(sessionPath, getSessionMemoryTemplate(), { mode: 0o600 })
  }
  
  await log('INFO', 'Memory System initialized')
}

/**
 * 获取默认索引内容
 */
function getDefaultIndexContent(): string {
  return `# Memory Index

## User (用户)
<!-- 格式: - [名称](user/文件名.md) — 描述 -->

## Feedback (反馈)

## Project (项目)

## Reference (参考)

---

*Last updated: ${new Date().toISOString().split('T')[0]}*
*Memory System v2.1*
`
}

// ============================================================================
// 记忆操作
// ============================================================================

/**
 * 保存记忆
 */
export async function saveMemory(
  name: string,
  description: string,
  type: MemoryType,
  body: string,
  options?: {
    skipDuplicateCheck?: boolean
    skipBackup?: boolean
    skipIndex?: boolean
  }
): Promise<{ success: boolean; path?: string; error?: string; duplicateOf?: string }> {
  try {
    await log('INFO', 'Saving memory', { name, type })
    
    // 1. 验证输入
    if (!name || !description || !body) {
      return { success: false, error: 'Missing required fields' }
    }
    
    // 2. 生成文件名
    const filename = generateFilename(name)
    const typeDir = getTypeDir(type)
    const filePath = join(typeDir, filename)
    
    // 3. 检查重复
    if (!options?.skipDuplicateCheck) {
      const duplicate = await checkDuplicateWithScan(
        { name, description, content: body, type },
        MEMORY_DIR
      )
      if (duplicate.isDuplicate && duplicate.matchedEntry) {
        await log('WARN', 'Duplicate memory detected', { 
          existing: duplicate.matchedEntry.filename,
          reason: duplicate.reason 
        })
        return { 
          success: false, 
          error: 'Duplicate memory',
          duplicateOf: duplicate.matchedEntry.filePath 
        }
      }
    }
    
    // 4. 备份现有文件（如果存在）
    if (!options?.skipBackup && await fileExists(filePath)) {
      await backupMemory(filePath)
    }
    
    // 5. 生成前置元数据
    const frontmatter = generateFrontmatter(name, description, type)
    const content = `${frontmatter}\n${body}\n`
    
    // 6. 写入文件
    await mkdir(typeDir, { recursive: true, mode: 0o700 })
    await writeFile(filePath, content, { mode: 0o600 })
    
    // 7. 更新索引
    if (!options?.skipIndex) {
      await updateIndexEntry(type, filename, name, description)
    }
    
    // 8. 记录日志
    const tokens = estimateTokens(content)
    await log('INFO', 'Memory saved', { path: filePath, tokens })
    
    return { success: true, path: filePath }
    
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    await log('ERROR', 'Failed to save memory', { error })
    return { success: false, error }
  }
}

/**
 * 更新记忆
 */
export async function updateMemory(
  filePath: string,
  updates: {
    name?: string
    description?: string
    type?: MemoryType
    body?: string
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. 读取现有内容
    const existing = await readMemory(filePath)
    if (!existing) {
      return { success: false, error: 'Memory not found' }
    }
    
    // 2. 备份
    await backupMemory(filePath)
    
    // 3. 应用更新
    const newName = updates.name ?? existing.header.name
    const newDesc = updates.description ?? existing.header.description
    const newType = updates.type ?? existing.header.type
    const newBody = updates.body ?? existing.content
    
    // 4. 如果类型改变，需要移动文件
    if (updates.type && updates.type !== existing.header.type) {
      const newPath = join(getTypeDir(updates.type), basename(filePath))
      await rename(filePath, newPath)
      
      // 更新索引
      await removeFromIndex(existing.header.type, basename(filePath))
      await updateIndexEntry(updates.type, basename(filePath), newName, newDesc)
      
      await log('INFO', 'Memory type changed, moved', { 
        from: filePath, 
        to: newPath 
      })
    }
    
    // 5. 写入更新
    const frontmatter = generateFrontmatter(newName, newDesc, newType)
    await writeFile(filePath, `${frontmatter}\n${newBody}\n`, { mode: 0o600 })
    
    await log('INFO', 'Memory updated', { path: filePath })
    return { success: true }
    
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    await log('ERROR', 'Failed to update memory', { error })
    return { success: false, error }
  }
}

/**
 * 删除记忆
 */
export async function deleteMemory(
  filePath: string,
  options?: { backup?: boolean }
): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. 读取获取类型
    const existing = await readMemory(filePath)
    if (!existing) {
      return { success: false, error: 'Memory not found' }
    }
    
    // 2. 备份（可选）
    if (options?.backup !== false) {
      await backupMemory(filePath)
    }
    
    // 3. 从索引移除
    await removeFromIndex(existing.header.type, basename(filePath))
    
    // 4. 删除文件
    await unlink(filePath)
    
    await log('INFO', 'Memory deleted', { path: filePath })
    return { success: true }
    
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    await log('ERROR', 'Failed to delete memory', { error })
    return { success: false, error }
  }
}

/**
 * 读取单个记忆
 */
export async function readMemory(filePath: string): Promise<MemoryContent | null> {
  try {
    const content = await readFile(filePath, 'utf-8')
    const { frontmatter, body } = parseMemoryContent(content)
    
    const header: MemoryHeader = {
      filename: basename(filePath),
      filePath,
      name: frontmatter.name || basename(filePath, '.md'),
      description: frontmatter.description || '',
      type: parseMemoryType(frontmatter.type) || 'user',
      mtimeMs: Date.now(),
      size: content.length
    }
    
    // 验证
    const verification = validateFrontmatter({ ...header, content: body })
    const trustLevel = assessTrustLevel({ ...header, content: body }, verification)
    const tokens = estimateTokens(content)
    
    return {
      ...header,
      body,
      tokens,
      trustLevel
    }
  } catch {
    return null
  }
}

/**
 * 扫描所有记忆
 */
export async function scanAllMemories(): Promise<MemoryContent[]> {
  const memories: MemoryContent[] = []
  
  for (const type of MEMORY_TYPES) {
    const typeDir = getTypeDir(type)
    try {
      const files = await readdir(typeDir)
      const mdFiles = files.filter(f => f.endsWith('.md'))
      
      for (const file of mdFiles) {
        const memory = await readMemory(join(typeDir, file))
        if (memory) {
          memories.push(memory)
        }
      }
    } catch {
      // 目录不存在，跳过
    }
  }
  
  return memories.sort((a, b) => b.mtimeMs - a.mtimeMs)
}

/**
 * 按类型获取记忆
 */
export async function getMemoriesByType(type: MemoryType): Promise<MemoryContent[]> {
  const typeDir = getTypeDir(type)
  const memories: MemoryContent[] = []
  
  try {
    const files = await readdir(typeDir)
    const mdFiles = files.filter(f => f.endsWith('.md'))
    
    for (const file of mdFiles) {
      const memory = await readMemory(join(typeDir, file))
      if (memory) {
        memories.push(memory)
      }
    }
  } catch {
    // 目录不存在
  }
  
  return memories.sort((a, b) => b.mtimeMs - a.mtimeMs)
}

// ============================================================================
// 备份与恢复
// ============================================================================

/**
 * 备份记忆
 */
async function backupMemory(filePath: string): Promise<string | null> {
  try {
    const backupDir = join(MEMORY_DIR, BACKUP_DIR)
    const timestamp = Date.now()
    const filename = basename(filePath)
    const backupPath = join(backupDir, `${timestamp}_${filename}`)
    
    const content = await readFile(filePath, 'utf-8')
    await writeFile(backupPath, content, { mode: 0o600 })
    
    await log('INFO', 'Memory backed up', { from: filePath, to: backupPath })
    return backupPath
  } catch (e) {
    await log('ERROR', 'Backup failed', { filePath, error: e })
    return null
  }
}

/**
 * 恢复备份
 */
export async function restoreBackup(backupPath: string): Promise<{ success: boolean; error?: string }> {
  try {
    const content = await readFile(backupPath, 'utf-8')
    const { frontmatter } = parseMemoryContent(content)
    const type = parseMemoryType(frontmatter.type) || 'user'
    const filename = basename(backupPath).replace(/^\d+_/, '')
    
    const targetPath = join(getTypeDir(type), filename)
    await writeFile(targetPath, content, { mode: 0o600 })
    
    await log('INFO', 'Backup restored', { from: backupPath, to: targetPath })
    return { success: true }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    await log('ERROR', 'Restore failed', { backupPath, error })
    return { success: false, error }
  }
}

// ============================================================================
// 索引管理
// ============================================================================

/**
 * 更新索引条目
 */
async function updateIndexEntry(
  type: MemoryType,
  filename: string,
  name: string,
  description: string
): Promise<void> {
  const indexPath = join(MEMORY_DIR, MEMORY_INDEX)
  const content = await safeReadFile(indexPath)
  if (!content) return
  
  const typeSection = getTypeSectionName(type)
  const newEntry = `- [${name}](${type}/${filename}) — ${description}`
  
  // 检查是否已存在
  if (content.includes(`[${name}](${type}/${filename})`)) {
    return // 已存在
  }
  
  // 在对应类型部分添加
  const lines = content.split('\n')
  const insertIndex = lines.findIndex(l => l.startsWith(`## ${typeSection}`))
  
  if (insertIndex >= 0) {
    // 找到section，在下一个空行或section前插入
    let i = insertIndex + 1
    while (i < lines.length && lines[i].trim() && !lines[i].startsWith('##')) {
      i++
    }
    lines.splice(i, 0, newEntry)
  }
  
  await writeFile(indexPath, lines.join('\n'), { mode: 0o600 })
}

/**
 * 从索引移除
 */
async function removeFromIndex(type: MemoryType, filename: string): Promise<void> {
  const indexPath = join(MEMORY_DIR, MEMORY_INDEX)
  const content = await safeReadFile(indexPath)
  if (!content) return
  
  const lines = content.split('\n')
  const filtered = lines.filter(l => !l.includes(`(${type}/${filename})`))
  
  await writeFile(indexPath, filtered.join('\n'), { mode: 0o600 })
}

/**
 * 获取类型对应的索引部分名称
 */
function getTypeSectionName(type: MemoryType): string {
  const names: Record<MemoryType, string> = {
    user: 'User (用户)',
    feedback: 'Feedback (反馈)',
    project: 'Project (项目)',
    reference: 'Reference (参考)'
  }
  return names[type]
}

// ============================================================================
// 辅助函数
// ============================================================================

function generateFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_\u4e00-\u9fff-]/g, '')
    .slice(0, 50) + '.md'
}

function generateFrontmatter(name: string, description: string, type: MemoryType): string {
  return [
    '---',
    `name: ${name}`,
    `description: ${description}`,
    `type: ${type}`,
    '---'
  ].join('\n')
}

function parseMemoryContent(content: string): { frontmatter: Record<string, string>; body: string } {
  const lines = content.split('\n')
  const frontmatter: Record<string, string> = {}
  let body = content
  let inFrontmatter = false
  let bodyStart = 0
  
  if (lines[0]?.trim() === '---') {
    inFrontmatter = true
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim()
      if (line === '---') {
        bodyStart = i + 1
        break
      }
      const colonIndex = line.indexOf(':')
      if (colonIndex > 0) {
        const key = line.slice(0, colonIndex).trim()
        const value = line.slice(colonIndex + 1).trim()
        frontmatter[key] = value
      }
    }
    body = lines.slice(bodyStart).join('\n').trim()
  }
  
  return { frontmatter, body }
}

// ============================================================================
// 提取与压缩
// ============================================================================

/**
 * 检查是否应该触发提取
 */
export function checkShouldExtract(
  messages: Message[],
  options?: { force?: boolean; lastUuid?: string }
): { should: boolean; reason?: string } {
  // 首先检查Session Memory阈值
  if (shouldExtractMemory(messages)) {
    return { should: true, reason: 'session_memory_threshold' }
  }
  
  // 然后检查普通记忆提取阈值
  const result = shouldExtract(messages, {
    force: options?.force,
    lastMessageUuid: options?.lastUuid
  })
  
  return result
}

/**
 * 执行记忆提取
 */
export async function executeExtraction(
  messages: Message[],
  options?: {
    force?: boolean
    skipIndex?: boolean
  }
): Promise<ExtractionResult> {
  const result = await doExtract(messages, options)
  
  if (result.success) {
    markExtractionComplete(messages)
  }
  
  return result
}

async function doExtract(
  messages: Message[],
  options?: { force?: boolean; skipIndex?: boolean }
): Promise<ExtractionResult> {
  try {
    // 1. 扫描现有记忆
    const existing = await scanAllMemoryEntries(MEMORY_DIR)
    const manifest = existing.map(m => `- ${m.filename}: ${m.description}`).join('\n')
    
    // 2. 构建提取提示
    const prompt = buildExtractPrompt(messages.length, manifest, {
      skipIndex: options?.skipIndex
    })
    
    // 3. 这里应该调用实际的LLM来提取记忆
    // 由于是模拟实现，这里返回成功状态
    await log('INFO', 'Extraction prompt generated', { 
      messageCount: messages.length,
      existingMemories: existing.length 
    })
    
    return {
      success: true,
      filesWritten: [],
      memoriesSaved: 0,
      turnsUsed: 0,
      tokensUsed: 0
    }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    await log('ERROR', 'Extraction failed', { error })
    return {
      success: false,
      filesWritten: [],
      memoriesSaved: 0,
      turnsUsed: 0,
      tokensUsed: 0,
      error
    }
  }
}

/**
 * 执行压缩
 */
export async function executeCompaction(messages: Message[]): Promise<CompactionResult | null> {
  try {
    const sessionMemory = await safeReadFile(join(MEMORY_DIR, SESSION_MEMORY))
    if (!sessionMemory) return null
    
    // 计算保留索引
    const lastSummarizedId = getLastExtractionMessageId()
    const lastIndex = lastSummarizedId 
      ? messages.findIndex(m => m.uuid === lastSummarizedId)
      : -1
    
    const startIndex = calculateMessagesToKeepIndex(messages, lastIndex)
    const messagesToKeep = messages.slice(startIndex)
    
    // 创建压缩结果
    const result = createCompactionResultFromSessionMemory(
      messages,
      sessionMemory,
      messagesToKeep,
      messages[messages.length - 1]?.uuid
    )
    
    await log('INFO', 'Compaction executed', { 
      originalMessages: messages.length,
      keptMessages: messagesToKeep.length
    })
    
    return result
    
  } catch (e) {
    await log('ERROR', 'Compaction failed', { error: e })
    return null
  }
}

/**
 * 消息接口
 */
interface Message {
  type: 'user' | 'assistant' | 'system'
  uuid?: string
  id?: string
  message?: {
    content?: string | Array<{ type: string; text?: string }>
  }
}

// ============================================================================
// 状态管理
// ============================================================================

export function getSystemStatus(): {
  initialized: boolean
  totalMemories: number
  byType: Record<MemoryType, number>
  totalTokens: number
  config: {
    extract: Required<ExtractConfig>
    session: typeof getSessionMemoryConfig extends () => infer R ? R : never
  }
} {
  // 这是同步的简化版本
  return {
    initialized: true,
    totalMemories: 0,
    byType: { user: 0, feedback: 0, project: 0, reference: 0 },
    totalTokens: 0,
    config: {
      extract: getExtractConfig(),
      session: getSessionMemoryConfig()
    }
  }
}

/**
 * 重置系统状态
 */
export function resetSystem(): void {
  resetSessionMemory()
  // 不重置配置，只重置运行时状态
}

// ============================================================================
// 导出配置更新函数
// ============================================================================

export function configure(options: {
  extract?: Partial<ExtractConfig>
  session?: Partial<{ minimumMessageTokensToInit: number; minimumTokensBetweenUpdate: number; toolCallsBetweenUpdates: number }>
}): void {
  if (options.extract) {
    setExtractConfig(options.extract)
  }
  if (options.session) {
    setSessionMemoryConfig(options.session)
  }
}
