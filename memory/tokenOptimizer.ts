/**
 * Memory System v2.0 - Token Optimizer
 * 
 * Token使用优化工具
 */

/**
 * Token统计
 */
export interface TokenStats {
  totalChars: number
  estimatedTokens: number
  breakdown: {
    frontmatter: number
    content: number
  }
}

/**
 * 估算中文字符的token数
 */
function estimateChineseTokens(text: string): number {
  const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length
  return Math.ceil(chineseChars / 2) // 中文约2字符/token
}

/**
 * 估算英文token数
 */
function estimateEnglishTokens(text: string): number {
  const chineseText = text.replace(/[\u4e00-\u9fff]/g, '')
  const words = chineseText.split(/\s+/).filter(w => w.length > 0)
  return Math.ceil(words.length / 4) // 英文约4字符/token
}

/**
 * 估算总token数
 */
export function estimateTokens(text: string): number {
  return estimateChineseTokens(text) + estimateEnglishTokens(text)
}

/**
 * 分析记忆文件的token分布
 */
export function analyzeMemoryTokens(
  frontmatter: string,
  content: string
): TokenStats {
  const frontmatterTokens = estimateTokens(frontmatter)
  const contentTokens = estimateTokens(content)

  return {
    totalChars: frontmatter.length + content.length,
    estimatedTokens: frontmatterTokens + contentTokens,
    breakdown: {
      frontmatter: frontmatterTokens,
      content: contentTokens
    }
  }
}

/**
 * 优化建议
 */
export interface OptimizationSuggestion {
  type: 'remove' | 'truncate' | 'compress' | 'split'
  reason: string
  savedTokens: number
  original: string
  optimized?: string
}

/**
 * 生成优化建议
 */
export function generateOptimizationSuggestions(
  name: string,
  description: string,
  content: string,
  maxDescriptionLength: number = 150,
  maxContentLength: number = 5000
): OptimizationSuggestion[] {
  const suggestions: OptimizationSuggestion[] = []

  // 检查description长度
  if (description.length > maxDescriptionLength) {
    const excess = description.length - maxDescriptionLength
    suggestions.push({
      type: 'truncate',
      reason: `description超过${maxDescriptionLength}字符，建议精简`,
      savedTokens: estimateTokens(description.slice(maxDescriptionLength)),
      original: description
    })
  }

  // 检查content长度
  if (content.length > maxContentLength) {
    const excess = content.length - maxContentLength
    suggestions.push({
      type: 'truncate',
      reason: `content超过${maxContentLength}字符，建议截断或拆分`,
      savedTokens: estimateTokens(content.slice(maxContentLength)),
      original: content
    })
  }

  // 检查是否有重复的"为什么"或"如何应用"部分
  const whyCount = (content.match(/\*\*Why:\*\*/gi) || []).length
  if (whyCount > 2) {
    suggestions.push({
      type: 'compress',
      reason: `发现${whyCount}个"Why:"部分，建议合并或精简`,
      savedTokens: whyCount * 10,
      original: content
    })
  }

  // 检查是否包含代码块（可以压缩）
  const codeBlockCount = (content.match(/```[\s\S]*?```/g) || []).length
  if (codeBlockCount > 3) {
    suggestions.push({
      type: 'compress',
      reason: `发现${codeBlockCount}个代码块，建议使用简化注释替代`,
      savedTokens: codeBlockCount * 50,
      original: content
    })
  }

  return suggestions
}

/**
 * 执行优化
 */
export function applyOptimization(
  content: string,
  suggestion: OptimizationSuggestion
): string {
  switch (suggestion.type) {
    case 'truncate':
      // 简化截断
      return content.slice(0, Math.floor(content.length * 0.8))
    
    case 'compress':
      // 压缩重复内容
      let compressed = content
      // 合并多个空行为一个
      compressed = compressed.replace(/\n{3,}/g, '\n\n')
      // 移除多余空格
      compressed = compressed.replace(/  +/g, ' ')
      return compressed
    
    case 'remove':
      return ''
    
    default:
      return content
  }
}

/**
 * 计算压缩率
 */
export function calculateCompressionRate(
  original: string,
  optimized: string
): number {
  const originalTokens = estimateTokens(original)
  const optimizedTokens = estimateTokens(optimized)
  
  if (originalTokens === 0) return 0
  
  return Math.round((1 - optimizedTokens / originalTokens) * 100)
}

/**
 * 记忆大小分类
 */
export type MemorySizeCategory = 'small' | 'medium' | 'large' | 'xlarge'

/**
 * 分类标准
 */
const SIZE_THRESHOLDS = {
  small: 100,
  medium: 500,
  large: 2000,
  xlarge: 5000
}

/**
 * 获取记忆大小分类
 */
export function getMemorySizeCategory(tokens: number): MemorySizeCategory {
  if (tokens < SIZE_THRESHOLDS.small) return 'small'
  if (tokens < SIZE_THRESHOLDS.medium) return 'medium'
  if (tokens < SIZE_THRESHOLDS.large) return 'large'
  return 'xlarge'
}

/**
 * 获取分类描述
 */
export function getSizeCategoryDescription(category: MemorySizeCategory): string {
  const descriptions: Record<MemorySizeCategory, string> = {
    small: '简短记忆，信息密度高',
    medium: '适中大小，结构清晰',
    large: '较长记忆，考虑拆分',
    xlarge: '过大的记忆，建议拆分或压缩'
  }
  return descriptions[category]
}

/**
 * 批量分析多个记忆
 */
export function batchAnalyzeMemories(
  memories: Array<{ name: string; description: string; content: string }>
): Map<string, TokenStats> {
  const results = new Map<string, TokenStats>()

  for (const memory of memories) {
    const frontmatter = `name: ${memory.name}\ndescription: ${memory.description}`
    const stats = analyzeMemoryTokens(frontmatter, memory.content)
    results.set(memory.name, stats)
  }

  return results
}

/**
 * 获取总token预算建议
 */
export function getTokenBudgetAdvice(
  totalMemories: number,
  contextWindowTokens: number = 100000
): {
  recommendedMaxPerMemory: number
  recommendedMaxIndexEntries: number
  warnings: string[]
} {
  const warnings: string[] = []

  // 每个记忆平均token建议
  const avgPerMemory = Math.floor(contextWindowTokens * 0.1 / totalMemories)
  const recommendedMaxPerMemory = Math.min(avgPerMemory, 2000)

  // MEMORY.md索引条目建议（200行限制）
  const recommendedMaxIndexEntries = 150

  // 检查是否需要优化
  if (avgPerMemory < 100) {
    warnings.push(`记忆数量较多(${totalMemories})，建议每个记忆尽量精简`)
  }

  if (totalMemories > recommendedMaxIndexEntries) {
    warnings.push(`记忆数量超过${recommendedMaxIndexEntries}，MEMORY.md索引可能超限`)
  }

  return {
    recommendedMaxPerMemory,
    recommendedMaxIndexEntries,
    warnings
  }
}
