/**
 * Memory System v2.0 - Memory Verification
 * 
 * 记忆验证与信任机制
 * 参考: Claude Code memoryTypes.ts TRUSTING_RECALL_SECTION
 */

/**
 * 验证结果
 */
export interface VerificationResult {
  isValid: boolean
  issues: VerificationIssue[]
  warnings: string[]
}

/**
 * 验证问题
 */
export interface VerificationIssue {
  type: 'stale' | 'conflict' | 'invalid' | 'missing'
  field?: string
  message: string
  severity: 'error' | 'warning'
}

/**
 * 记忆条目
 */
interface MemoryEntry {
  name: string
  description: string
  type: string
  content: string
  lastModified?: number
}

/**
 * 验证记忆条目的前置元数据
 */
export function validateFrontmatter(entry: MemoryEntry): VerificationResult {
  const issues: VerificationIssue[] = []
  const warnings: string[] = []

  // 检查必需字段
  if (!entry.name || entry.name.trim() === '') {
    issues.push({
      type: 'missing',
      field: 'name',
      message: '缺少name字段',
      severity: 'error'
    })
  }

  if (!entry.description || entry.description.trim() === '') {
    issues.push({
      type: 'missing',
      field: 'description',
      message: '缺少description字段',
      severity: 'warning'
    })
  }

  if (!entry.type) {
    issues.push({
      type: 'missing',
      field: 'type',
      message: '缺少type字段',
      severity: 'error'
    })
  } else {
    const validTypes = ['user', 'feedback', 'project', 'reference']
    if (!validTypes.includes(entry.type)) {
      issues.push({
        type: 'invalid',
        field: 'type',
        message: `无效的type: ${entry.type}，有效值为: ${validTypes.join(', ')}`,
        severity: 'error'
      })
    }
  }

  // 检查内容
  if (!entry.content || entry.content.trim() === '') {
    issues.push({
      type: 'missing',
      field: 'content',
      message: '记忆内容为空',
      severity: 'warning'
    })
  }

  return {
    isValid: issues.filter(i => i.severity === 'error').length === 0,
    issues,
    warnings
  }
}

/**
 * 验证文件是否存在
 */
export async function verifyFileExists(filePath: string): Promise<boolean> {
  try {
    const { access } = await import('fs/promises')
    await access(filePath)
    return true
  } catch {
    return false
  }
}

/**
 * 验证记忆引用的文件路径
 */
export async function verifyReferencedPaths(
  content: string,
  baseDir: string
): Promise<{ valid: string[]; invalid: string[] }> {
  const valid: string[] = []
  const invalid: string[] = []
  
  // 简单路径提取（简化版）
  const pathRegex = /[a-zA-Z0-9_/.-]+\.[a-z]+/g
  const paths = content.match(pathRegex) || []
  
  for (const path of paths) {
    if (path.startsWith('/') || path.startsWith('~')) {
      const exists = await verifyFileExists(path)
      if (exists) {
        valid.push(path)
      } else {
        invalid.push(path)
      }
    } else if (!path.includes('.')) {
      // 可能是目录引用，暂时跳过
    }
  }
  
  return { valid, invalid }
}

/**
 * 检查记忆是否过时
 */
export function checkStaleness(
  entry: MemoryEntry & { lastModified?: number },
  maxAgeDays: number = 30
): { isStale: boolean; daysSinceModified: number } {
  if (!entry.lastModified) {
    return { isStale: false, daysSinceModified: 0 }
  }

  const now = Date.now()
  const ageMs = now - entry.lastModified
  const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24))

  return {
    isStale: ageDays > maxAgeDays,
    daysSinceModified: ageDays
  }
}

/**
 * 信任级别
 */
export type TrustLevel = 'high' | 'medium' | 'low' | 'unverified'

/**
 * 评估记忆信任级别
 */
export function assessTrustLevel(
  entry: MemoryEntry,
  verification: VerificationResult
): TrustLevel {
  // 有错误 → 不可信
  if (verification.issues.some(i => i.severity === 'error')) {
    return 'unverified'
  }

  // 有警告 → 低信任
  if (verification.warnings.length > 0) {
    return 'low'
  }

  // 完整且有效 → 高信任
  if (entry.name && entry.description && entry.type && entry.content) {
    return 'high'
  }

  // 基本有效 → 中信任
  return 'medium'
}

/**
 * 构建验证报告
 */
export function buildVerificationReport(
  entryName: string,
  result: VerificationResult,
  trustLevel: TrustLevel
): string {
  const lines = [
    `# 记忆验证报告: ${entryName}`,
    '',
    `信任级别: ${trustLevel.toUpperCase()}`,
    '',
  ]

  if (result.issues.length > 0) {
    lines.push('## 问题')
    for (const issue of result.issues) {
      const icon = issue.severity === 'error' ? '❌' : '⚠️'
      lines.push(`${icon} [${issue.severity}] ${issue.message}`)
    }
    lines.push('')
  }

  if (result.warnings.length > 0) {
    lines.push('## 警告')
    for (const warning of result.warnings) {
      lines.push(`⚠️ ${warning}`)
    }
    lines.push('')
  }

  if (trustLevel === 'high') {
    lines.push('✅ 记忆验证通过')
  } else if (trustLevel === 'medium') {
    lines.push('⚠️ 记忆基本有效，建议补充信息')
  } else {
    lines.push('❌ 记忆存在问题，建议修复后再使用')
  }

  return lines.join('\n')
}

/**
 * 验证后建议
 */
export function getPostVerificationAdvice(
  trustLevel: TrustLevel,
  issues: VerificationIssue[]
): string[] {
  const advice: string[] = []

  switch (trustLevel) {
    case 'high':
      advice.push('记忆可以使用')
      break
    case 'medium':
      advice.push('建议补充缺失的字段')
      break
    case 'low':
      advice.push('建议检查并修复警告中的问题')
      break
    case 'unverified':
      advice.push('请修复错误后再使用')
      break
  }

  // 根据具体问题给出建议
  for (const issue of issues) {
    if (issue.field === 'description') {
      advice.push('添加description字段可以帮助在大量记忆时快速判断相关性')
    }
    if (issue.type === 'stale') {
      advice.push('记忆可能已过时，使用前请验证信息的准确性')
    }
  }

  return advice
}
