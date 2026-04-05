/**
 * Update & Doctor System v2.2 - 自动更新检测 + 问题诊断
 * 
 * 源自Claude Code的update.ts设计
 * 支持多种安装方式检测、自动诊断安装冲突
 */

import { exec } from 'child_process'
import { promisify } from 'util'
import { readFile, access, readdir } from 'fs/promises'
import { join } from 'path'
import { createSignal } from './signal'

const execAsync = promisify(exec)

// ============================================================================
// 类型定义
// ============================================================================

export type InstallationType = 
  | 'npm-local' | 'npm-global' | 'native' | 'homebrew' 
  | 'winget' | 'apk' | 'snap' | 'development' | 'unknown'

export interface DiagnosticCheck {
  name: string
  status: 'pass' | 'warn' | 'fail'
  message: string
  details?: string
}

export interface DiagnosticResult {
  timestamp: number
  installationType: InstallationType
  version: string
  nodeVersion: string
  platform: string
  checks: DiagnosticCheck[]
  multipleInstallations?: { type: InstallationType; path: string }[]
  issues: string[]
  suggestions: string[]
}

export interface UpdateResult {
  success: boolean
  currentVersion: string
  latestVersion?: string
  updated: boolean
  error?: string
}

// ============================================================================
// 安装检测
// ============================================================================

export async function detectInstallationType(): Promise<InstallationType> {
  if (process.env.OPENCLAW_DEV === '1') return 'development'
  
  try {
    const { stdout } = await execAsync('npm list -g --depth=0 2>/dev/null')
    if (stdout.includes('openclaw')) return 'npm-global'
  } catch {}
  
  try {
    await execAsync('snap list 2>/dev/null')
    return 'snap'
  } catch {}
  
  try {
    const { stdout } = await execAsync('which openclaw 2>/dev/null')
    if (stdout.trim()) return 'native'
  } catch {}
  
  return 'unknown'
}

export async function getCurrentVersion(): Promise<string> {
  try {
    const pkgPath = join(process.cwd(), 'package.json')
    const content = await readFile(pkgPath, 'utf-8')
    const pkg = JSON.parse(content)
    return pkg.version || 'unknown'
  } catch {
    try {
      const { stdout } = await execAsync('openclaw --version 2>/dev/null')
      return stdout.trim()
    } catch {
      return 'unknown'
    }
  }
}

export async function getLatestVersion(): Promise<string | null> {
  try {
    const { stdout } = await execAsync('npm view openclaw version 2>/dev/null')
    return stdout.trim() || null
  } catch {
    return null
  }
}

// ============================================================================
// 诊断检查
// ============================================================================

export async function runDiagnostics(): Promise<DiagnosticResult> {
  const checks: DiagnosticCheck[] = []
  const issues: string[] = []
  const suggestions: string[] = []
  
  const installType = await detectInstallationType()
  const version = await getCurrentVersion()
  const nodeVersion = process.version
  const platform = `${process.platform} ${process.arch}`

  // Node.js版本检查
  const nodeMajor = parseInt(process.version.slice(1).split('.')[0])
  if (nodeMajor < 18) {
    checks.push({ name: 'Node.js', status: 'fail', message: '版本过低，建议18+', details: process.version })
    issues.push('Node.js版本过低')
    suggestions.push('升级Node.js到18或更高')
  } else {
    checks.push({ name: 'Node.js', status: 'pass', message: '正常', details: process.version })
  }

  // 内存检查
  try {
    const mem = process.memoryUsage()
    const heapUsed = Math.round(mem.heapUsed / 1024 / 1024)
    const heapTotal = Math.round(mem.heapTotal / 1024 / 1024)
    const ratio = heapUsed / heapTotal
    if (ratio > 0.9) {
      checks.push({ name: '内存', status: 'warn', message: '使用率高', details: `${heapUsed}MB / ${heapTotal}MB` })
      suggestions.push('重启Gateway释放内存')
    } else {
      checks.push({ name: '内存', status: 'pass', message: '正常', details: `${heapUsed}MB / ${heapTotal}MB` })
    }
  } catch {}

  // 配置文件检查
  const configPath = join(process.env.HOME || '~', '.openclaw', 'openclaw.json')
  try {
    await access(configPath)
    const configContent = await readFile(configPath, 'utf-8')
    const config = JSON.parse(configContent)
    
    if (!config.apiKey && !config.auth?.apiKey) {
      checks.push({ name: 'API Key', status: 'fail', message: '未配置' })
      issues.push('缺少API Key')
      suggestions.push('配置有效的API Key')
    } else {
      checks.push({ name: 'API Key', status: 'pass', message: '已配置' })
    }
  } catch {
    checks.push({ name: '配置文件', status: 'fail', message: '不存在', details: configPath })
    issues.push('配置文件缺失')
  }

  // 磁盘空间
  try {
    const { stdout } = await execAsync('df -h . 2>/dev/null | tail -1')
    const match = stdout.match(/(\d+)%/)
    if (match) {
      const usage = parseInt(match[1])
      if (usage > 90) {
        checks.push({ name: '磁盘', status: 'fail', message: `使用率${usage}%过高` })
        issues.push('磁盘空间不足')
      } else if (usage > 80) {
        checks.push({ name: '磁盘', status: 'warn', message: `使用率${usage}%较高` })
      } else {
        checks.push({ name: '磁盘', status: 'pass', message: '充足' })
      }
    }
  } catch {}

  return {
    timestamp: Date.now(),
    installationType: installType,
    version,
    nodeVersion,
    platform,
    checks,
    issues,
    suggestions
  }
}

export function formatDiagnostics(result: DiagnosticResult): string {
  const lines: string[] = []
  lines.push('═══════════════════════════════════════')
  lines.push('       OpenClaw Doctor 诊断报告')
  lines.push('═══════════════════════════════════════')
  lines.push(`版本: ${result.version}`)
  lines.push(`平台: ${result.platform}`)
  lines.push(`Node: ${result.nodeVersion}`)
  lines.push(`安装: ${result.installationType}`)
  lines.push('')
  
  for (const check of result.checks) {
    const icon = check.status === 'pass' ? '✅' : check.status === 'warn' ? '⚠️' : '❌'
    lines.push(`${icon} ${check.name}: ${check.message}`)
    if (check.details) lines.push(`   └─ ${check.details}`)
  }
  
  if (result.issues.length > 0) {
    lines.push('')
    lines.push('问题:')
    for (const i of result.issues) lines.push(`  ❌ ${i}`)
  }
  
  if (result.suggestions.length > 0) {
    lines.push('')
    lines.push('建议:')
    for (const s of result.suggestions) lines.push(`  💡 ${s}`)
  }
  
  lines.push('═══════════════════════════════════════')
  return lines.join('\n')
}

export async function checkForUpdate(): Promise<{ available: boolean; current: string; latest: string | null }> {
  const current = await getCurrentVersion()
  const latest = await getLatestVersion()
  return { available: latest !== null && latest !== current, current, latest }
}

export async function performUpdate(): Promise<UpdateResult> {
  const currentVersion = await getCurrentVersion()
  try {
    const type = await detectInstallationType()
    if (type === 'npm-global') {
      await execAsync('npm update -g openclaw 2>/dev/null')
    } else if (type === 'npm-local') {
      await execAsync('npm update 2>/dev/null')
    } else if (type === 'snap') {
      await execAsync('sudo snap refresh openclaw 2>/dev/null')
    }
    const newVersion = await getCurrentVersion()
    return { success: true, currentVersion, latestVersion: newVersion, updated: newVersion !== currentVersion }
  } catch (error) {
    return { success: false, currentVersion, error: error instanceof Error ? error.message : String(error), updated: false }
  }
}

export const diagnosticsCompleted = createSignal<[result: DiagnosticResult]>()
export const updateAvailable = createSignal<[current: string, latest: string]>()
