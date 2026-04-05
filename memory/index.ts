/**
 * Memory System v2.0 - Core Module
 * 
 * 记忆系统核心模块
 * 参考: Claude Code extractMemories.ts
 * 
 * Phase 1: 基础架构 (memoryTypes, memoryScan, core CRUD)
 * Phase 2: 自动提取 (extractPrompt, autoExtract, toolPermissions)
 */

import { readdir, readFile, writeFile, mkdir } from 'fs/promises'
import { basename, join } from 'path'
import { 
  MEMORY_TYPES, 
  parseMemoryType, 
  type MemoryType 
} from './memoryTypes'

export type { MemoryType }
export { MEMORY_TYPES, parseMemoryType }

// 导出Phase 2模块
export { 
  buildExtractPrompt,
  buildAccessPrompt,
  buildExplicitSavePrompt,
  buildForgetPrompt 
} from './extractPrompt'

export {
  shouldExtract,
  markExtractionComplete,
  createExtractionResult,
  createExtractionError,
  getStats,
  resetStats,
  setExtractConfig,
  getExtractConfig,
  type ExtractConfig,
  type ExtractionResult,
  type ExtractionStats
} from './autoExtract'

export {
  createStandardMemoryToolChecker,
  createSessionMemoryToolChecker,
  canWriteMemory,
  isReadOnlyPath,
  type PermissionDecision
} from './toolPermissions'

// 导出Phase 3模块
export {
  shouldExtractMemory,
  setupSessionMemoryFile,
  getSessionMemoryTemplate,
  buildSessionMemoryUpdatePrompt,
  createSessionMemoryToolCheckerForUpdate,
  getSessionMemoryPath,
  getSessionMemoryDir,
  setSessionMemoryConfig,
  getSessionMemoryConfig,
  resetSessionMemory,
  markInitialized,
  isSessionMemoryInitialized,
  recordExtractionTokenCount,
  setLastExtractionMessageId,
  getLastExtractionMessageId,
  type SessionMemoryConfig
} from './sessionMemory'

export {
  setMemoryCompactConfig,
  getMemoryCompactConfig,
  calculateMessagesToKeepIndex,
  createCompactBoundaryMessage,
  buildPostCompactMessages,
  truncateSessionMemoryForCompact,
  createCompactionResultFromSessionMemory,
  isCompactBoundaryMessage,
  type MemoryCompactConfig,
  type CompactionResult
} from './compact'

/**
 * 记忆文件头
 */
export interface MemoryHeader {
  filename: string
  filePath: string
  mtimeMs: number
  description: string | null
  type: MemoryType | undefined
  name: string | null
}

/**
 * 记忆内容
 */
export interface MemoryContent {
  header: MemoryHeader
  content: string
}

/**
 * 记忆目录路径
 */
const MEMORY_DIR = join(process.env.HOME || '~', '.openclaw', 'memory')

/**
 * 扫描记忆目录
 */
export async function scanMemoryFiles(): Promise<MemoryHeader[]> {
  try {
    const memoryDir = MEMORY_DIR
    await mkdir(memoryDir, { recursive: true })
    
    const entries = await readdir(memoryDir, { recursive: true })
    const mdFiles = entries.filter(
      f => typeof f === 'string' && f.endsWith('.md') && basename(f) !== 'MEMORY.md'
    )

    const headers: MemoryHeader[] = []
    
    for (const relativePath of mdFiles) {
      const filePath = join(memoryDir, relativePath)
      try {
        const content = await readFile(filePath, 'utf-8')
        const frontmatter = parseFrontmatter(content)
        
        headers.push({
          filename: relativePath,
          filePath,
          mtimeMs: Date.now(),
          description: frontmatter.description || null,
          type: parseMemoryType(frontmatter.type),
          name: frontmatter.name || null
        })
      } catch {
        // 跳过无法读取的文件
      }
    }

    return headers.sort((a, b) => b.mtimeMs - a.mtimeMs)
  } catch {
    return []
  }
}

/**
 * 读取单个记忆文件
 */
export async function readMemory(filePath: string): Promise<MemoryContent | null> {
  try {
    const content = await readFile(filePath, 'utf-8')
    const frontmatter = parseFrontmatter(content)
    
    const header: MemoryHeader = {
      filename: basename(filePath),
      filePath,
      mtimeMs: Date.now(),
      description: frontmatter.description || null,
      type: parseMemoryType(frontmatter.type),
      name: frontmatter.name || null
    }

    // 分离前置元数据和正文
    const lines = content.split('\n')
    let bodyStart = 0
    let inFrontmatter = false
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      if (line === '---') {
        if (!inFrontmatter) {
          inFrontmatter = true
        } else {
          bodyStart = i + 1
          break
        }
      }
    }
    
    const body = lines.slice(bodyStart).join('\n').trim()

    return { header, content: body }
  } catch {
    return null
  }
}

/**
 * 解析前置元数据
 */
function parseFrontmatter(content: string): Record<string, string> {
  const result: Record<string, string> = {}
  const lines = content.split('\n')
  
  if (lines[0]?.trim() !== '---') {
    return result
  }
  
  let i = 1
  while (i < lines.length) {
    const line = lines[i].trim()
    if (line === '---') {
      break
    }
    const colonIndex = line.indexOf(':')
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim()
      const value = line.slice(colonIndex + 1).trim()
      result[key] = value
    }
    i++
  }
  
  return result
}

/**
 * 保存记忆
 */
export async function saveMemory(
  name: string,
  description: string,
  type: MemoryType,
  body: string
): Promise<string> {
  const memoryDir = MEMORY_DIR
  await mkdir(memoryDir, { recursive: true })
  
  // 生成文件名
  const filename = name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') + '.md'
  const filePath = join(memoryDir, filename)
  
  // 构建内容
  const content = [
    '---',
    `name: ${name}`,
    `description: ${description}`,
    `type: ${type}`,
    '---',
    '',
    body,
    ''
  ].join('\n')

  await writeFile(filePath, content, 'utf-8')
  
  return filePath
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
): Promise<boolean> {
  try {
    const existing = await readMemory(filePath)
    if (!existing) return false

    const newName = updates.name ?? existing.header.name ?? ''
    const newDesc = updates.description ?? existing.header.description ?? ''
    const newType = updates.type ?? existing.header.type ?? 'user'
    const newBody = updates.body ?? existing.content

    const content = [
      '---',
      `name: ${newName}`,
      `description: ${newDesc}`,
      `type: ${newType}`,
      '---',
      '',
      newBody,
      ''
    ].join('\n')

    await writeFile(filePath, content, 'utf-8')
    return true
  } catch {
    return false
  }
}

/**
 * 删除记忆
 */
export async function deleteMemory(filePath: string): Promise<boolean> {
  try {
    const { unlink } = await import('fs/promises')
    await unlink(filePath)
    return true
  } catch {
    return false
  }
}

/**
 * 获取所有记忆
 */
export async function getAllMemories(): Promise<MemoryContent[]> {
  const headers = await scanMemoryFiles()
  const memories: MemoryContent[] = []
  
  for (const header of headers) {
    const memory = await readMemory(header.filePath)
    if (memory) {
      memories.push(memory)
    }
  }
  
  return memories
}

/**
 * 按类型获取记忆
 */
export async function getMemoriesByType(type: MemoryType): Promise<MemoryContent[]> {
  const all = await getAllMemories()
  return all.filter(m => m.header.type === type)
}

/**
 * 格式化记忆清单
 */
export function formatMemoryManifest(memories: MemoryHeader[]): string {
  if (memories.length === 0) {
    return '(暂无记忆)'
  }
  
  return memories
    .map(m => {
      const tag = m.type ? `[${m.type}] ` : ''
      const desc = m.description || '(无描述)'
      return `- ${tag}${m.filename}: ${desc}`
    })
    .join('\n')
}

/**
 * 查找重复记忆
 */
export function findDuplicate(
  memories: MemoryHeader[],
  newMemory: { name?: string; description?: string }
): MemoryHeader | undefined {
  return memories.find(m => 
    (newMemory.name && m.name === newMemory.name) ||
    (newMemory.description && m.description === newMemory.description)
  )
}

/**
 * 获取记忆目录路径
 */
export function getMemoryDir(): string {
  return MEMORY_DIR
}

/**
 * 检查是否是记忆文件路径
 */
export function isMemoryPath(filePath: string): boolean {
  return filePath.startsWith(MEMORY_DIR) && filePath.endsWith('.md')
}
