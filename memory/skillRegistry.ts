/**
 * Skill Registry v2.2 - Skill优先级与覆盖机制
 * 
 * 源自Claude Code的Agent覆盖机制
 * 支持Skill按来源分组、优先级覆盖
 */

import { readdir, access, readFile } from 'fs/promises'
import { join, basename } from 'path'
import { createSignal } from './signal'

// ============================================================================
// 类型定义
// ============================================================================

/**
 * Skill来源
 */
export type SkillSource = 
  | 'builtin'    // 内置Skills
  | 'plugin'     // 插件Skills
  | 'marketplace' // ClawHub市场
  | 'user'       // 用户自定义
  | 'external'   // 外部安装

/**
 * Skill覆盖配置
 */
export interface SkillOverride {
  skillName: string
  priority: number
  disabled?: boolean
  config?: Record<string, unknown>
}

/**
 * Skill定义
 */
export interface SkillDefinition {
  name: string
  source: SkillSource
  path: string
  description?: string
  version?: string
  priority: number
  disabled: boolean
  config?: Record<string, any>
  overriddenBy?: string  // 被哪个Skill覆盖
}

/**
 * Skill注册表
 */
export interface SkillRegistryData {
  skills: Map<string, SkillDefinition>
  overrides: Map<string, SkillOverride>
  disabledSkills: Set<string>
}

/**
 * Skill分组
 */
export interface SkillGroup {
  label: string
  source: SkillSource
  skills: SkillDefinition[]
}

// ============================================================================
// 常量
// ============================================================================

const SKILL_SOURCE_GROUPS: { label: string; source: SkillSource }[] = [
  { label: '内置 (Builtin)', source: 'builtin' },
  { label: '插件 (Plugin)', source: 'plugin' },
  { label: '市场 (Marketplace)', source: 'marketplace' },
  { label: '用户 (User)', source: 'user' },
  { label: '外部 (External)', source: 'external' }
]

const DEFAULT_PRIORITY = 50
const MAX_PRIORITY = 100
const MIN_PRIORITY = 1

// ============================================================================
// 注册表实现
// ============================================================================

let registry: SkillRegistryData = {
  skills: new Map(),
  overrides: new Map(),
  disabledSkills: new Set()
}

const registryChanged = createSignal<[]>()

// ============================================================================
// 扫描
// ============================================================================

/**
 * 扫描目录下的所有Skills
 */
async function scanSkillsDir(dirPath: string, source: SkillSource): Promise<SkillDefinition[]> {
  const skills: SkillDefinition[] = []
  
  try {
    await access(dirPath)
    const entries = await readdir(dirPath, { withFileTypes: true })
    
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue
      
      const skillPath = join(dirPath, entry.name)
      const skillName = entry.name
      
      // 读取SKILL.md获取描述
      let description: string | undefined
      let version: string | undefined
      
      try {
        const skillMdPath = join(skillPath, 'SKILL.md')
        const content = await readFile(skillMdPath, 'utf-8')
        
        // 简单解析description
        const descMatch = content.match(/description:\s*(.+)/i)
        if (descMatch) description = descMatch[1].trim()
        
        const verMatch = content.match(/version:\s*(.+)/i)
        if (verMatch) version = verMatch[1].trim()
        
      } catch {}
      
      skills.push({
        name: skillName,
        source,
        path: skillPath,
        description,
        version,
        priority: DEFAULT_PRIORITY,
        disabled: false
      })
    }
  } catch {}
  
  return skills
}

/**
 * 自动扫描并注册所有Skills
 */
export async function scanAndRegisterSkills(skillsBasePath: string): Promise<void> {
  registry = {
    skills: new Map(),
    overrides: new Map(),
    disabledSkills: new Set()
  }
  
  // 扫描各个目录
  const scanPaths: { path: string; source: SkillSource }[] = [
    { path: join(skillsBasePath, 'builtin'), source: 'builtin' },
    { path: join(skillsBasePath, 'plugins'), source: 'plugin' },
    { path: join(skillsBasePath, 'marketplace'), source: 'marketplace' },
    { path: join(skillsBasePath, 'user'), source: 'user' },
    { path: skillsBasePath, source: 'external' }  // 根目录直接是external
  ]
  
  for (const { path, source } of scanPaths) {
    const found = await scanSkillsDir(path, source)
    for (const skill of found) {
      registry.skills.set(skill.name, skill)
    }
  }
  
  // 应用覆盖配置
  applyOverrides()
  
  registryChanged.emit()
}

/**
 * 手动注册单个Skill
 */
export function registerSkill(definition: SkillDefinition): void {
  registry.skills.set(definition.name, definition)
  registryChanged.emit()
}

/**
 * 移除Skill
 */
export function unregisterSkill(name: string): boolean {
  const result = registry.skills.delete(name)
  if (result) registryChanged.emit()
  return result
}

// ============================================================================
// 覆盖机制
// ============================================================================

/**
 * 添加覆盖规则
 */
export function addOverride(override: SkillOverride): void {
  // 限制优先级范围
  override.priority = Math.max(MIN_PRIORITY, Math.min(MAX_PRIORITY, override.priority))
  
  registry.overrides.set(override.skillName, override)
  
  if (override.disabled) {
    registry.disabledSkills.add(override.skillName)
  }
  
  applyOverrides()
  registryChanged.emit()
}

/**
 * 移除覆盖规则
 */
export function removeOverride(skillName: string): boolean {
  const result = registry.overrides.delete(skillName)
  if (result) {
    registry.disabledSkills.delete(skillName)
    applyOverrides()
    registryChanged.emit()
  }
  return result
}

/**
 * 禁用Skill
 */
export function disableSkill(skillName: string): boolean {
  if (!registry.skills.has(skillName)) return false
  registry.disabledSkills.add(skillName)
  applyOverrides()
  registryChanged.emit()
  return true
}

/**
 * 启用Skill
 */
export function enableSkill(skillName: string): boolean {
  if (!registry.skills.has(skillName)) return false
  registry.disabledSkills.delete(skillName)
  applyOverrides()
  registryChanged.emit()
  return true
}

/**
 * 应用覆盖配置
 */
function applyOverrides(): void {
  // 重置所有Skill的disabled状态
  for (const skill of registry.skills.values()) {
    skill.disabled = false
    skill.overriddenBy = undefined
  }
  
  // 应用覆盖
  for (const [skillName, override] of registry.overrides) {
    const skill = registry.skills.get(skillName)
    if (!skill) continue
    
    if (override.disabled) {
      skill.disabled = true
    }
    
    if (override.config) {
      skill.config = { ...skill.config, ...override.config }
    }
    
    skill.priority = override.priority
  }
  
  // 处理相互覆盖的情况
  for (const [skillName, override] of registry.overrides) {
    const skill = registry.skills.get(skillName)
    if (!skill) continue
    
    // 如果这个Skill被禁用，跳过
    if (skill.disabled) continue
    
    // 查找被这个Skill覆盖的其他Skill
    for (const other of registry.skills.values()) {
      if (other.name === skillName) continue
      
      const otherOverride = registry.overrides.get(other.name)
      if (otherOverride && otherOverride.priority < skill.priority) {
        other.overriddenBy = skillName
      }
    }
  }
}

// ============================================================================
// 查询
// ============================================================================

/**
 * 获取所有启用的Skills（按优先级排序）
 */
export function getEnabledSkills(): SkillDefinition[] {
  return Array.from(registry.skills.values())
    .filter(s => !s.disabled)
    .sort((a, b) => b.priority - a.priority)
}

/**
 * 获取所有Skills（包括禁用的）
 */
export function getAllSkills(): SkillDefinition[] {
  return Array.from(registry.skills.values())
}

/**
 * 获取指定Skill
 */
export function getSkill(name: string): SkillDefinition | undefined {
  return registry.skills.get(name)
}

/**
 * 获取已禁用的Skills
 */
export function getDisabledSkills(): SkillDefinition[] {
  return Array.from(registry.skills.values()).filter(s => s.disabled)
}

/**
 * 获取指定来源的Skills
 */
export function getSkillsBySource(source: SkillSource): SkillDefinition[] {
  return Array.from(registry.skills.values()).filter(s => s.source === source)
}

/**
 * 获取覆盖规则
 */
export function getOverride(skillName: string): SkillOverride | undefined {
  return registry.overrides.get(skillName)
}

/**
 * 获取所有覆盖规则
 */
export function getAllOverrides(): SkillOverride[] {
  return Array.from(registry.overrides.values())
}

/**
 * 按分组获取Skills
 */
export function getSkillsGrouped(): SkillGroup[] {
  const groups: SkillGroup[] = []
  
  for (const { label, source } of SKILL_SOURCE_GROUPS) {
    const skills = Array.from(registry.skills.values())
      .filter(s => s.source === source)
      .sort((a, b) => b.priority - a.priority)
    
    if (skills.length > 0) {
      groups.push({ label, source, skills })
    }
  }
  
  return groups
}

/**
 * 获取有效的Skill（考虑覆盖）
 */
export function getEffectiveSkill(name: string): SkillDefinition | undefined {
  const skill = registry.skills.get(name)
  if (!skill) return undefined
  
  if (skill.disabled) return undefined
  
  // 如果被覆盖，返回覆盖者
  if (skill.overriddenBy) {
    const overrider = registry.skills.get(skill.overriddenBy)
    if (overrider && !overrider.disabled) {
      return overrider
    }
  }
  
  return skill
}

// ============================================================================
// 导入/导出
// ============================================================================

/**
 * 导出覆盖配置
 */
export function exportOverrides(): string {
  return JSON.stringify(Array.from(registry.overrides.values()), null, 2)
}

/**
 * 导入覆盖配置
 */
export function importOverrides(json: string): number {
  try {
    const overrides = JSON.parse(json) as SkillOverride[]
    let count = 0
    
    for (const override of overrides) {
      if (override.skillName) {
        addOverride(override)
        count++
      }
    }
    
    return count
  } catch {
    return 0
  }
}

/**
 * 清除所有覆盖
 */
export function clearAllOverrides(): void {
  registry.overrides.clear()
  registry.disabledSkills.clear()
  applyOverrides()
  registryChanged.emit()
}

// ============================================================================
// 工具函数
// ============================================================================

/**
 * 格式化Skill信息
 */
export function formatSkill(skill: SkillDefinition): string {
  const parts = [skill.name]
  if (skill.version) parts.push(`v${skill.version}`)
  parts.push(`[${skill.source}]`)
  if (skill.priority !== DEFAULT_PRIORITY) parts.push(`优先级:${skill.priority}`)
  if (skill.disabled) parts.push('[已禁用]')
  if (skill.overriddenBy) parts.push(`被${skill.overriddenBy}覆盖`)
  return parts.join(' · ')
}

/**
 * 格式化分组输出
 */
export function formatGroupedSkills(): string {
  const groups = getSkillsGrouped()
  const lines: string[] = []
  
  for (const group of groups) {
    lines.push(`\n## ${group.label}`)
    lines.push('─'.repeat(40))
    
    for (const skill of group.skills) {
      lines.push(`  ${formatSkill(skill)}`)
    }
  }
  
  return lines.join('\n')
}

/**
 * 搜索Skills
 */
export function searchSkills(query: string): SkillDefinition[] {
  const lower = query.toLowerCase()
  return getEnabledSkills().filter(s => 
    s.name.toLowerCase().includes(lower) ||
    s.description?.toLowerCase().includes(lower)
  )
}

// ============================================================================
// 订阅
// ============================================================================

export function onRegistryChanged(callback: () => void): () => void {
  return registryChanged.subscribe(callback)
}

// ============================================================================
// 预设覆盖
// ============================================================================

/**
 * 创建禁用覆盖
 */
export function createDisableOverride(skillName: string): SkillOverride {
  return { skillName, priority: 0, disabled: true }
}

/**
 * 创建高优先级覆盖
 */
export function createPriorityOverride(skillName: string, priority: number): SkillOverride {
  return { skillName, priority: Math.max(MIN_PRIORITY, Math.min(MAX_PRIORITY, priority)) }
}
