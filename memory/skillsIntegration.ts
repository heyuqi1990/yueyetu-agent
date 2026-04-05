/**
 * Skills Integration v3.5 - Skills能力整合
 * 
 * 统一接口，打通所有模块的Skills使用
 */

// ============================================================================
// 导入所有模块
// ============================================================================

import * as hookSystem from './hookSystem'
import * as multiAgent from './multiAgent'
import * as mcpBrowser from './mcpBrowser'
import * as orchestrator from './orchestrator'
import * as autoDream from './autoDream'
import * as growthBook from './growthBook'
import * as toolSandbox from './toolSandbox'
import { createSignal } from './signal'

// ============================================================================
// 类型定义
// ============================================================================

export type SkillCategory = 
  | 'memory'      // 记忆系统
  | 'trading'     // 交易
  | 'browser'     // 浏览器
  | 'automation'  // 自动化
  | 'analysis'    // 分析
  | 'system'      // 系统

export interface Skill {
  name: string
  category: SkillCategory
  description: string
  usage: string
  example: string
  enabled: boolean
}

export interface SkillResult {
  success: boolean
  output?: any
  error?: string
  duration: number
}

// ============================================================================
// Skills注册表
// ============================================================================

const skillsRegistry = new Map<string, Skill>()

/**
 * 注册Skill
 */
function registerSkill(skill: Skill): void {
  skillsRegistry.set(skill.name, skill)
}

/**
 * 批量注册Skills
 */
function registerSkills(skills: Skill[]): void {
  for (const skill of skills) {
    registerSkill(skill)
  }
}

// ============================================================================
// 预设Skills
// ============================================================================

/**
 * 初始化Skills注册表
 */
export function initializeSkillsRegistry(): void {
  // ========== Memory Skills ==========
  registerSkills([
    {
      name: 'memory.save',
      category: 'memory',
      description: '保存记忆到长期存储',
      usage: 'await memory.save(content, type, options)',
      example: "await memory.save('用户喜欢喝龙井', 'user', { important: true })",
      enabled: true
    },
    {
      name: 'memory.search',
      category: 'memory',
      description: '搜索记忆',
      usage: 'await memory.search(query)',
      example: "await memory.search('用户偏好')",
      enabled: true
    },
    {
      name: 'memory.extract',
      category: 'memory',
      description: '从对话中提取记忆',
      usage: 'await memory.extract(messages)',
      example: 'await memory.extract(conversationMessages)',
      enabled: true
    },
    {
      name: 'memory.snapshot',
      category: 'memory',
      description: '创建记忆快照',
      usage: 'await memory.snapshot()',
      example: 'await memory.snapshot()',
      enabled: true
    },
    {
      name: 'memory.dream',
      category: 'memory',
      description: '触发AI反思',
      usage: 'await memory.dream(force?)',
      example: 'await memory.dream({ force: true })',
      enabled: true
    }
  ])

  // ========== Trading Skills ==========
  registerSkills([
    {
      name: 'trading.submit',
      category: 'trading',
      description: '提交交易请求（自动过风控）',
      usage: 'await trading.submit(context)',
      example: "await trading.submit({ symbol: '600519', action: 'buy', quantity: 100 })",
      enabled: true
    },
    {
      name: 'trading.analyze',
      category: 'trading',
      description: '分析股票',
      usage: 'await trading.analyze(symbol)',
      example: "await trading.analyze('000001')",
      enabled: true
    },
    {
      name: 'trading.risk',
      category: 'trading',
      description: '风控审核',
      usage: 'await trading.risk(context)',
      example: "await trading.risk({ symbol: '600519', action: 'buy' })",
      enabled: true
    },
    {
      name: 'trading.dispatch',
      category: 'trading',
      description: '智能分发交易任务',
      usage: 'await trading.dispatch(task)',
      example: "await trading.dispatch('买入茅台100股')",
      enabled: true
    }
  ])

  // ========== Browser Skills ==========
  registerSkills([
    {
      name: 'browser.open',
      category: 'browser',
      description: '打开网页',
      usage: 'await browser.open(url)',
      example: "await browser.open('https://www.baidu.com')",
      enabled: true
    },
    {
      name: 'browser.scrape',
      category: 'browser',
      description: '抓取网页内容',
      usage: 'await browser.scrape(url)',
      example: "await browser.scrape('https://zhihu.com/question/123')",
      enabled: true
    },
    {
      name: 'browser.login',
      category: 'browser',
      description: '登录平台',
      usage: 'await browser.login(platform)',
      example: "await browser.login('zhihu')",
      enabled: true
    },
    {
      name: 'browser.automate',
      category: 'browser',
      description: '执行自动化任务',
      usage: 'await browser.automate(taskId)',
      example: "await browser.automate('auto_xxx')",
      enabled: true
    },
    {
      name: 'browser.quickScrape',
      category: 'browser',
      description: '快速抓取（自动处理登录）',
      usage: 'await browser.quickScrape(platform, url)',
      example: "await browser.quickScrape('zhihu', 'https://zhihu.com/question/123')",
      enabled: true
    }
  ])

  // ========== Automation Skills ==========
  registerSkills([
    {
      name: 'automation.create',
      category: 'automation',
      description: '创建自动化任务',
      usage: 'automation.create(name, platform, steps)',
      example: "automation.create('抓取知乎', 'zhihu', [{ type: 'navigate', value: 'url' }])",
      enabled: true
    },
    {
      name: 'automation.run',
      category: 'automation',
      description: '运行自动化任务',
      usage: 'await automation.run(taskId)',
      example: "await automation.run('auto_xxx')",
      enabled: true
    },
    {
      name: 'automation.status',
      category: 'automation',
      description: '查看自动化状态',
      usage: 'automation.status()',
      example: 'automation.status()',
      enabled: true
    }
  ])

  // ========== Analysis Skills ==========
  registerSkills([
    {
      name: 'analysis.market',
      category: 'analysis',
      description: '市场分析',
      usage: 'await analysis.market()',
      example: 'await analysis.market()',
      enabled: true
    },
    {
      name: 'analysis.stock',
      category: 'analysis',
      description: '股票分析',
      usage: 'await analysis.stock(symbol)',
      example: "await analysis.stock('000001')",
      enabled: true
    },
    {
      name: 'analysis.news',
      category: 'analysis',
      description: '新闻分析',
      usage: 'await analysis.news(keyword)',
      example: "await analysis.news('茅台')",
      enabled: true
    }
  ])

  // ========== System Skills ==========
  registerSkills([
    {
      name: 'system.status',
      category: 'system',
      description: '查看系统状态',
      usage: 'system.status()',
      example: 'system.status()',
      enabled: true
    },
    {
      name: 'system.diagnostics',
      category: 'system',
      description: '系统诊断',
      usage: 'await system.diagnostics()',
      example: 'await system.diagnostics()',
      enabled: true
    },
    {
      name: 'system.hooks',
      category: 'system',
      description: 'Hook管理',
      usage: 'system.hooks(action)',
      example: 'system.hooks("list")',
      enabled: true
    },
    {
      name: 'system.config',
      category: 'system',
      description: '系统配置',
      usage: 'system.config(key, value?)',
      example: "system.config('autoDream.enabled', true)",
      enabled: true
    }
  ])

  console.log(`[Skills] 已注册 ${skillsRegistry.size} 个Skills`)
}

// ============================================================================
// Skill执行器
// ============================================================================

const skillExecutors = new Map<string, Function>()

/**
 * 注册Skill执行器
 */
function registerExecutor(name: string, fn: Function): void {
  skillExecutors.set(name, fn)
}

/**
 * 执行Skill
 */
export async function executeSkill(
  name: string, 
  ...args: any[]
): Promise<SkillResult> {
  const startTime = Date.now()
  const skill = skillsRegistry.get(name)
  
  if (!skill) {
    return { 
      success: false, 
      error: `Skill not found: ${name}`, 
      duration: 0 
    }
  }
  
  if (!skill.enabled) {
    return { 
      success: false, 
      error: `Skill disabled: ${name}`, 
      duration: 0 
    }
  }
  
  const executor = skillExecutors.get(name)
  if (!executor) {
    return { 
      success: false, 
      error: `No executor for: ${name}`, 
      duration: 0 
    }
  }
  
  try {
    const output = await executor(...args)
    return { 
      success: true, 
      output, 
      duration: Date.now() - startTime 
    }
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : String(error), 
      duration: Date.now() - startTime 
    }
  }
}

/**
 * 注册所有执行器
 */
export function registerExecutors(): void {
  // Memory执行器
  registerExecutor('memory.save', async (content: string, type: string, options?: any) => {
    const { addMemory } = await import('./orchestrator')
    await addMemory(content, type as any, options)
    return { saved: true, content, type }
  })

  registerExecutor('memory.dream', async (force?: boolean) => {
    return await autoDream.dream({ force })
  })

  registerExecutor('memory.extract', async (messages: any[]) => {
    const { triggerManualExtraction } = await import('./extractMemories')
    return await triggerManualExtraction(messages)
  })

  registerExecutor('memory.snapshot', async () => {
    const { createSnapshot } = await import('./sessionMemoryEnhanced')
    return await createSnapshot()
  })

  // Trading执行器
  registerExecutor('trading.submit', async (context: any) => {
    return await multiAgent.submitTradingRequest(context)
  })

  registerExecutor('trading.risk', async (context: any) => {
    const { getAgentByType, runAgent } = await import('./multiAgent')
    const riskAgent = getAgentByType('risk')
    if (!riskAgent) throw new Error('Risk agent not found')
    const prompt = `审核交易: ${JSON.stringify(context)}`
    return await runAgent(riskAgent.id, prompt)
  })

  registerExecutor('trading.analyze', async (symbol: string) => {
    const { getAgentByType, runAgent } = await import('./multiAgent')
    const traderAgent = getAgentByType('trader')
    if (!traderAgent) throw new Error('Trader agent not found')
    const prompt = `分析股票: ${symbol}`
    return await runAgent(traderAgent.id, prompt)
  })

  registerExecutor('trading.dispatch', async (task: string) => {
    return await multiAgent.dispatchTask(task)
  })

  // Browser执行器
  registerExecutor('browser.scrape', async (url: string) => {
    return await mcpBrowser.scrapePage(url)
  })

  registerExecutor('browser.login', async (platform: string) => {
    return await mcpBrowser.loginToPlatform(platform as any)
  })

  registerExecutor('browser.quickScrape', async (platform: string, url: string) => {
    if (platform === 'zhihu') return await mcpBrowser.quickScrapeZhihu(url)
    if (platform === 'douyin') return await mcpBrowser.quickScrapeDouyin(url)
    if (platform === 'feishu') return await mcpBrowser.quickScrapeFeishu(url)
    throw new Error(`Unknown platform: ${platform}`)
  })

  registerExecutor('browser.automate', async (taskId: string) => {
    return await mcpBrowser.runAutomationTask(taskId)
  })

  // Automation执行器
  registerExecutor('automation.create', (name: string, platform: string, steps: any[]) => {
    return mcpBrowser.createAutomationTask(name, platform as any, steps)
  })

  registerExecutor('automation.run', async (taskId: string) => {
    return await mcpBrowser.runAutomationTask(taskId)
  })

  registerExecutor('automation.status', () => {
    return mcpBrowser.getAutomationTasks()
  })

  // System执行器
  registerExecutor('system.status', () => {
    return orchestrator.getStatus()
  })

  registerExecutor('system.diagnostics', async () => {
    const { runDiagnostics, formatDiagnostics } = await import('./updateDoctor')
    const result = await runDiagnostics()
    return formatDiagnostics(result)
  })

  registerExecutor('system.hooks', (action?: string) => {
    if (action === 'list') return hookSystem.getAllHooks()
    return hookSystem.formatHooks()
  })

  registerExecutor('system.config', (key: string, value?: any) => {
    // 根据key设置配置
    if (key.startsWith('autoDream.')) {
      const subKey = key.replace('autoDream.', '')
      const config = autoDream.getDreamConfig()
      if (value !== undefined) {
        autoDream.updateDreamConfig({ [subKey]: value })
      }
      return config
    }
    if (key.startsWith('sandbox.')) {
      const subKey = key.replace('sandbox.', '')
      if (value !== undefined) {
        toolSandbox.updateSandboxConfig({ [subKey]: value })
      }
      return toolSandbox.getSandboxConfig()
    }
    return null
  })
}

// ============================================================================
// Skills查询
// ============================================================================

/**
 * 获取所有Skills
 */
export function getAllSkills(): Skill[] {
  return Array.from(skillsRegistry.values())
}

/**
 * 获取指定类别的Skills
 */
export function getSkillsByCategory(category: SkillCategory): Skill[] {
  return Array.from(skillsRegistry.values()).filter(s => s.category === category)
}

/**
 * 获取已启用的Skills
 */
export function getEnabledSkills(): Skill[] {
  return Array.from(skillsRegistry.values()).filter(s => s.enabled)
}

/**
 * 搜索Skills
 */
export function searchSkills(query: string): Skill[] {
  const lower = query.toLowerCase()
  return Array.from(skillsRegistry.values()).filter(s => 
    s.name.toLowerCase().includes(lower) ||
    s.description.toLowerCase().includes(lower)
  )
}

/**
 * 启用Skill
 */
export function enableSkill(name: string): boolean {
  const skill = skillsRegistry.get(name)
  if (!skill) return false
  skill.enabled = true
  return true
}

/**
 * 禁用Skill
 */
export function disableSkill(name: string): boolean {
  const skill = skillsRegistry.get(name)
  if (!skill) return false
  skill.enabled = false
  return true
}

// ============================================================================
// 工具
// ============================================================================

/**
 * 格式化Skills列表
 */
export function formatSkills(category?: SkillCategory): string {
  const skills = category ? getSkillsByCategory(category) : getAllSkills()
  
  const lines: string[] = []
  lines.push('═══════════════════════════════════════')
  lines.push(`        月野兔V3.5 Skills (${skills.length})`)
  lines.push('═══════════════════════════════════════')
  
  const byCategory = new Map<SkillCategory, Skill[]>()
  for (const skill of skills) {
    if (!byCategory.has(skill.category)) {
      byCategory.set(skill.category, [])
    }
    byCategory.get(skill.category)!.push(skill)
  }
  
  for (const [cat, catSkills] of byCategory) {
    lines.push(`\n## ${cat.toUpperCase()}`)
    for (const skill of catSkills) {
      const status = skill.enabled ? '✅' : '❌'
      lines.push(`  ${status} ${skill.name}`)
      lines.push(`     ${skill.description}`)
    }
  }
  
  lines.push('\n═══════════════════════════════════════')
  return lines.join('\n')
}

/**
 * 获取Skills统计
 */
export function getSkillsStats(): {
  total: number
  enabled: number
  byCategory: Record<string, number>
} {
  const byCategory: Record<string, number> = {}
  let enabled = 0
  
  for (const skill of skillsRegistry.values()) {
    byCategory[skill.category] = (byCategory[skill.category] || 0) + 1
    if (skill.enabled) enabled++
  }
  
  return { total: skillsRegistry.size, enabled, byCategory }
}

// ============================================================================
// 初始化
// ============================================================================

let isInitialized = false

/**
 * 初始化Skills系统
 */
export async function initializeSkills(): Promise<void> {
  if (isInitialized) return
  
  console.log('[Skills] 初始化Skills系统...')
  
  // 初始化注册表
  initializeSkillsRegistry()
  
  // 注册执行器
  registerExecutors()
  
  isInitialized = true
  console.log('[Skills] Skills系统初始化完成')
}

// ============================================================================
// 导出统一接口
// ============================================================================

export const memory = {
  save: (content: string, type: string, options?: any) => 
    executeSkill('memory.save', content, type, options),
  dream: (force?: boolean) => executeSkill('memory.dream', force),
  extract: (messages: any[]) => executeSkill('memory.extract', messages),
  snapshot: () => executeSkill('memory.snapshot')
}

export const trading = {
  submit: (context: any) => executeSkill('trading.submit', context),
  analyze: (symbol: string) => executeSkill('trading.analyze', symbol),
  risk: (context: any) => executeSkill('trading.risk', context),
  dispatch: (task: string) => executeSkill('trading.dispatch', task)
}

export const browser = {
  open: async (url: string) => {
    const { browser: b } = await import('./index')
    return await b.open(url)
  },
  scrape: (url: string) => executeSkill('browser.scrape', url),
  login: (platform: string) => executeSkill('browser.login', platform),
  automate: (taskId: string) => executeSkill('browser.automate', taskId),
  quickScrape: (platform: string, url: string) => 
    executeSkill('browser.quickScrape', platform, url)
}

export const automation = {
  create: (name: string, platform: string, steps: any[]) =>
    executeSkill('automation.create', name, platform, steps),
  run: (taskId: string) => executeSkill('automation.run', taskId),
  status: () => executeSkill('automation.status')
}

export const analysis = {
  market: () => executeSkill('analysis.market'),
  stock: (symbol: string) => executeSkill('analysis.stock', symbol),
  news: (keyword: string) => executeSkill('analysis.news', keyword)
}

export const system = {
  status: () => executeSkill('system.status'),
  diagnostics: () => executeSkill('system.diagnostics'),
  hooks: (action?: string) => executeSkill('system.hooks', action),
  config: (key: string, value?: any) => executeSkill('system.config', key, value)
}
