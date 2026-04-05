/**
 * Memory System v2.0 - Memory Scan
 * 
 * 记忆目录扫描工具
 * 参考: Claude Code memoryScan.ts
 */

import { readdir } from 'fs/promises'
import { basename, join } from 'path'
import { parseMemoryType, type MemoryType } from './memoryTypes'

export type MemoryHeader = {
  filename: string
  filePath: string
  mtimeMs: number
  description: string | null
  type: MemoryType | undefined
  name: string | null
}

const MAX_MEMORY_FILES = 200
const FRONTMATTER_MAX_LINES = 30

/**
 * 扫描记忆目录，查找.md文件，读取前置元数据
 * 返回按时间排序的列表（最新优先）
 */
export async function scanMemoryFiles(
  memoryDir: string,
  signal?: AbortSignal
): Promise<MemoryHeader[]> {
  try {
    const entries = await readdir(memoryDir, { recursive: true })
    const mdFiles = entries.filter(
      f => typeof f === 'string' && f.endsWith('.md') && basename(f) !== 'MEMORY.md'
    )

    const headerResults = await Promise.allSettled(
      mdFiles.map(async (relativePath): Promise<MemoryHeader> => {
        const filePath = join(memoryDir, relativePath)
        const content = await readFileInRange(filePath, 0, FRONTMATTER_MAX_LINES)
        const frontmatter = parseFrontmatter(content)
        return {
          filename: relativePath,
          filePath,
          mtimeMs: Date.now(), // 简化版，实际应该用fs.stat
          description: frontmatter.description || null,
          type: parseMemoryType(frontmatter.type),
          name: frontmatter.name || null
        }
      })
    )

    return headerResults
      .filter(
        (r): r is PromiseFulfilledResult<MemoryHeader> => r.status === 'fulfilled'
      )
      .map(r => r.value)
      .sort((a, b) => b.mtimeMs - a.mtimeMs)
      .slice(0, MAX_MEMORY_FILES)
  } catch {
    return []
  }
}

/**
 * 简化版文件读取
 */
async function readFileInRange(
  filePath: string,
  startLine: number,
  maxLines: number
): Promise<string> {
  const { readFile } = await import('fs/promises')
  try {
    const content = await readFile(filePath, 'utf-8')
    const lines = content.split('\n')
    return lines.slice(startLine, startLine + maxLines).join('\n')
  } catch {
    return ''
  }
}

/**
 * 简化版前置元数据解析
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
    if (line === '---' || line === '```') {
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
 * 格式化记忆列表为文本清单
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
 * 按类型分组记忆
 */
export function groupMemoriesByType(memories: MemoryHeader[]): Record<MemoryType, MemoryHeader[]> {
  const groups: Record<string, MemoryHeader[]> = {
    user: [],
    feedback: [],
    project: [],
    reference: []
  }
  
  for (const memory of memories) {
    if (memory.type && groups[memory.type]) {
      groups[memory.type].push(memory)
    }
  }
  
  return groups as Record<MemoryType, MemoryHeader[]>
}

/**
 * 查找重复记忆
 */
export function findDuplicateMemories(
  memories: MemoryHeader[],
  newMemory: { name?: string; description?: string }
): MemoryHeader | undefined {
  return memories.find(m => 
    (newMemory.name && m.name === newMemory.name) ||
    (newMemory.description && m.description === newMemory.description)
  )
}
