/**
 * Memory System v2.0 - Memory Deduplication
 * 
 * 记忆去重检查模块
 */

import { readdir, readFile } from 'fs/promises'
import { basename, join } from 'path'
import { parseMemoryType, type MemoryType } from './memoryTypes'

/**
 * 记忆条目
 */
export interface MemoryEntry {
  filename: string
  filePath: string
  name: string
  description: string
  type: MemoryType
  content: string
}

/**
 * 相似度结果
 */
export interface SimilarityResult {
  isDuplicate: boolean
  score: number
  matchedEntry?: MemoryEntry
  reason?: string
}

/**
 * 计算两个字符串的相似度（Jaccard系数）
 */
function jaccardSimilarity(str1: string, str2: string): number {
  const set1 = new Set(str1.toLowerCase().split(/\s+/))
  const set2 = new Set(str2.toLowerCase().split(/\s+/))
  
  const intersection = new Set([...set1].filter(x => set2.has(x)))
  const union = new Set([...set1, ...set2])
  
  return union.size > 0 ? intersection.size / union.size : 0
}

/**
 * 检查名称相似度
 */
function isNameSimilar(name1: string, name2: string): boolean {
  const similarity = jaccardSimilarity(name1, name2)
  return similarity > 0.6
}

/**
 * 检查描述相似度
 */
function isDescriptionSimilar(desc1: string, desc2: string): boolean {
  const similarity = jaccardSimilarity(desc1, desc2)
  return similarity > 0.5
}

/**
 * 检查内容重叠度
 */
function getContentOverlap(content1: string, content2: string): number {
  // 提取关键短语（简化版：取前100字符）
  const key1 = content1.slice(0, 100).toLowerCase()
  const key2 = content2.slice(0, 100).toLowerCase()
  
  return jaccardSimilarity(key1, key2)
}

/**
 * 检查是否为重复记忆
 */
export function checkDuplicate(
  newEntry: { name: string; description: string; content: string; type: MemoryType },
  existingEntries: MemoryEntry[]
): SimilarityResult {
  // 只与同类型的记忆比较
  const sameTypeEntries = existingEntries.filter(e => e.type === newEntry.type)
  
  if (sameTypeEntries.length === 0) {
    return { isDuplicate: false, score: 0 }
  }

  for (const entry of sameTypeEntries) {
    // 检查名称相似度
    if (isNameSimilar(newEntry.name, entry.name)) {
      return {
        isDuplicate: true,
        score: 0.8,
        matchedEntry: entry,
        reason: `名称相似: "${newEntry.name}" vs "${entry.name}"`
      }
    }

    // 检查描述相似度
    if (isDescriptionSimilar(newEntry.description, entry.description)) {
      return {
        isDuplicate: true,
        score: 0.6,
        matchedEntry: entry,
        reason: `描述相似: "${newEntry.description}" vs "${entry.description}"`
      }
    }

    // 检查内容重叠
    const overlap = getContentOverlap(newEntry.content, entry.content)
    if (overlap > 0.7) {
      return {
        isDuplicate: true,
        score: overlap,
        matchedEntry: entry,
        reason: `内容重叠度: ${Math.round(overlap * 100)}%`
      }
    }
  }

  return { isDuplicate: false, score: 0 }
}

/**
 * 从文件内容解析记忆条目
 */
async function parseMemoryFile(filePath: string): Promise<MemoryEntry | null> {
  try {
    const content = await readFile(filePath, 'utf-8')
    const lines = content.split('\n')
    
    let name = ''
    let description = ''
    let type: MemoryType | undefined
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
        continue
      }
      
      if (!inFrontmatter) continue
      
      const colonIndex = line.indexOf(':')
      if (colonIndex > 0) {
        const key = line.slice(0, colonIndex).trim()
        const value = line.slice(colonIndex + 1).trim()
        
        if (key === 'name') name = value
        else if (key === 'description') description = value
        else if (key === 'type') type = parseMemoryType(value)
      }
    }
    
    const body = lines.slice(bodyStart).join('\n').trim()
    
    if (!name) return null
    
    return {
      filename: basename(filePath),
      filePath,
      name,
      description,
      type: type || 'user',
      content: body
    }
  } catch {
    return null
  }
}

/**
 * 扫描目录获取所有记忆条目
 */
export async function scanAllMemoryEntries(memoryDir: string): Promise<MemoryEntry[]> {
  try {
    const entries = await readdir(memoryDir, { recursive: true })
    const mdFiles = entries.filter(
      f => typeof f === 'string' && f.endsWith('.md') && basename(f) !== 'MEMORY.md'
    )

    const results: MemoryEntry[] = []
    
    for (const relativePath of mdFiles) {
      const filePath = join(memoryDir, relativePath)
      const entry = await parseMemoryFile(filePath)
      if (entry) {
        results.push(entry)
      }
    }

    return results
  } catch {
    return []
  }
}

/**
 * 检查新的记忆是否重复（带文件扫描）
 */
export async function checkDuplicateWithScan(
  newEntry: { name: string; description: string; content: string; type: MemoryType },
  memoryDir: string
): Promise<SimilarityResult> {
  const existingEntries = await scanAllMemoryEntries(memoryDir)
  return checkDuplicate(newEntry, existingEntries)
}

/**
 * 生成去重建议
 */
export function generateDuplicateAdvice(result: SimilarityResult): string {
  if (!result.isDuplicate || !result.matchedEntry) {
    return '可以保存'
  }

  return [
    `检测到重复记忆 (相似度: ${Math.round(result.score * 100)}%)`,
    `原因: ${result.reason}`,
    '',
    `建议:`,
    `1. 更新现有记忆: ${result.matchedEntry.filename}`,
    `2. 合并内容到现有记忆`,
    `3. 取消保存（如果完全重复）`,
  ].join('\n')
}
