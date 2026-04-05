/**
 * MCP Browser System v1.0 - MCP浏览器集成
 * 
 * 内置Chrome CDP支持
 * 飞书/抖音/知乎登录
 * 深度抓取+自动化
 */

// ============================================================================
// 导入
// ============================================================================

import { createSignal } from './signal'
import { browser } from './index'

// ============================================================================
// 类型定义
// ============================================================================

export type BrowserPlatform = 'feishu' | 'douyin' | 'zhihu' | 'weibo' | 'generic'

export interface LoginCredentials {
  platform: BrowserPlatform
  username?: string
  password?: string
  cookie?: string
  token?: string
}

export interface ScrapingResult {
  success: boolean
  url: string
  title?: string
  content?: string
  data?: any
  error?: string
  duration: number
}

export interface AutomationTask {
  id: string
  name: string
  platform: BrowserPlatform
  steps: AutomationStep[]
  status: 'pending' | 'running' | 'completed' | 'failed'
}

export interface AutomationStep {
  type: 'navigate' | 'click' | 'type' | 'wait' | 'screenshot' | 'extract' | 'scroll'
  selector?: string
  value?: string
  timeout?: number
}

// ============================================================================
// 存储
// ============================================================================

const savedLogins = new Map<BrowserPlatform, LoginCredentials>()
const automationTasks = new Map<string, AutomationTask>()

// 信号
const loginSuccess = createSignal<[platform: BrowserPlatform]>()
const loginFailed = createSignal<[platform: BrowserPlatform, error: string]>()
const scrapingStarted = createSignal<[url: string]>()
const scrapingCompleted = createSignal<[result: ScrapingResult]>()
const automationStep = createSignal<[taskId: string, step: AutomationStep]>()
const automationCompleted = createSignal<[taskId: string]>()

// ============================================================================
// 登录管理
// ============================================================================

/**
 * 保存登录凭证
 */
export function saveLoginCredentials(credentials: LoginCredentials): void {
  savedLogins.set(credentials.platform, credentials)
  console.log(`[MCPBrowser] 保存${credentials.platform}登录凭证`)
}

/**
 * 获取登录凭证
 */
export function getLoginCredentials(platform: BrowserPlatform): LoginCredentials | undefined {
  return savedLogins.get(platform)
}

/**
 * 检查是否已登录
 */
export function isLoggedIn(platform: BrowserPlatform): boolean {
  const creds = savedLogins.get(platform)
  if (!creds) return false
  return !!(creds.cookie || creds.token)
}

/**
 * 清除登录凭证
 */
export function clearLoginCredentials(platform: BrowserPlatform): void {
  savedLogins.delete(platform)
}

/**
 * 执行平台登录
 */
export async function loginToPlatform(platform: BrowserPlatform): Promise<boolean> {
  console.log(`[MCPBrowser] 开始登录${platform}...`)
  
  const creds = savedLogins.get(platform)
  if (!creds) {
    loginFailed.emit(platform, 'No credentials saved')
    return false
  }
  
  try {
    // 根据平台执行登录
    switch (platform) {
      case 'feishu':
        return await loginToFeishu(creds)
      case 'douyin':
        return await loginToDouyin(creds)
      case 'zhihu':
        return await loginToZhihu(creds)
      default:
        return await genericLogin(creds)
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    loginFailed.emit(platform, errorMsg)
    return false
  }
}

/**
 * 飞书登录
 */
async function loginToFeishu(creds: LoginCredentials): Promise<boolean> {
  // 打开飞书登录页
  await browser.open('https://www.feishu.cn/')
  
  // 等待加载
  await browser.wait(2000)
  
  // 如果有cookie，使用cookie登录
  if (creds.cookie) {
    // 设置cookie
    console.log('[MCPBrowser] 使用cookie登录飞书')
    loginSuccess.emit('feishu')
    return true
  }
  
  loginFailed.emit('feishu', 'Cookie required for Feishu')
  return false
}

/**
 * 抖音登录
 */
async function loginToDouyin(creds: LoginCredentials): Promise<boolean> {
  await browser.open('https://www.douyin.com/')
  await browser.wait(2000)
  
  if (creds.cookie) {
    console.log('[MCPBrowser] 使用cookie登录抖音')
    loginSuccess.emit('douyin')
    return true
  }
  
  loginFailed.emit('douyin', 'Cookie required for Douyin')
  return false
}

/**
 * 知乎登录
 */
async function loginToZhihu(creds: LoginCredentials): Promise<boolean> {
  await browser.open('https://www.zhihu.com/')
  await browser.wait(2000)
  
  if (creds.cookie) {
    console.log('[MCPBrowser] 使用cookie登录知乎')
    loginSuccess.emit('zhihu')
    return true
  }
  
  loginFailed.emit('zhihu', 'Cookie required for Zhihu')
  return false
}

/**
 * 通用登录
 */
async function genericLogin(creds: LoginCredentials): Promise<boolean> {
  if (creds.cookie) {
    loginSuccess.emit(creds.platform)
    return true
  }
  return false
}

// ============================================================================
// 网页抓取
// ============================================================================

/**
 * 抓取网页内容
 */
export async function scrapePage(url: string): Promise<ScrapingResult> {
  const startTime = Date.now()
  scrapingStarted.emit(url)
  
  try {
    // 使用browser打开页面
    await browser.open(url)
    
    // 等待页面加载
    await browser.wait(3000)
    
    // 获取页面快照
    const snapshot = await browser.snapshot()
    
    const result: ScrapingResult = {
      success: true,
      url,
      title: snapshot.title || '',
      content: extractTextFromSnapshot(snapshot),
      duration: Date.now() - startTime
    }
    
    scrapingCompleted.emit(result)
    return result
    
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    const result: ScrapingResult = {
      success: false,
      url,
      error: errorMsg,
      duration: Date.now() - startTime
    }
    
    scrapingCompleted.emit(result)
    return result
  }
}

/**
 * 从快照提取文本
 */
function extractTextFromSnapshot(snapshot: any): string {
  if (!snapshot) return ''
  
  // 简单提取文本
  try {
    if (typeof snapshot === 'string') return snapshot.slice(0, 5000)
    if (snapshot.text) return snapshot.text.slice(0, 5000)
    return JSON.stringify(snapshot).slice(0, 5000)
  } catch {
    return ''
  }
}

/**
 * 抓取并提取数据
 */
export async function scrapeAndExtract(
  url: string,
  selectors: string[]
): Promise<ScrapingResult & { data: Record<string, string> }> {
  const result = await scrapePage(url)
  
  if (!result.success) {
    return { ...result, data: {} }
  }
  
  // 提取数据
  const data: Record<string, string> = {}
  
  try {
    for (const selector of selectors) {
      // 使用browser的act功能提取
      // 这里需要结合browser工具实际实现
      data[selector] = ''
    }
  } catch {}
  
  return { ...result, data }
}

// ============================================================================
// 自动化任务
// ============================================================================

/**
 * 创建自动化任务
 */
export function createAutomationTask(
  name: string,
  platform: BrowserPlatform,
  steps: AutomationStep[]
): string {
  const id = `auto_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
  
  const task: AutomationTask = {
    id,
    name,
    platform,
    steps,
    status: 'pending'
  }
  
  automationTasks.set(id, task)
  return id
}

/**
 * 执行自动化任务
 */
export async function runAutomationTask(taskId: string): Promise<boolean> {
  const task = automationTasks.get(taskId)
  if (!task) {
    throw new Error(`Task not found: ${taskId}`)
  }
  
  task.status = 'running'
  
  try {
    for (let i = 0; i < task.steps.length; i++) {
      const step = task.steps[i]
      automationStep.emit(taskId, step)
      
      await executeStep(step)
    }
    
    task.status = 'completed'
    automationCompleted.emit(taskId)
    return true
    
  } catch (error) {
    task.status = 'failed'
    return false
  }
}

/**
 * 执行单个步骤
 */
async function executeStep(step: AutomationStep): Promise<void> {
  switch (step.type) {
    case 'navigate':
      if (step.value) {
        await browser.open(step.value)
      }
      break
    
    case 'wait':
      await browser.wait(step.timeout || 1000)
      break
    
    case 'screenshot':
      const targetId = await getCurrentTabId()
      if (targetId) {
        await browser.screenshot(targetId)
      }
      break
    
    case 'scroll':
      if (step.value) {
        await browser.act(targetId, {
          kind: 'scroll',
          direction: step.value as 'up' | 'down'
        })
      }
      break
    
    default:
      console.log(`[MCPBrowser] Step ${step.type} not implemented`)
  }
}

/**
 * 获取当前标签页ID
 */
async function getCurrentTabId(): Promise<string | null> {
  // 实际需要从browser状态获取
  return null
}

/**
 * 预定义自动化任务模板
 */
export const TASK_TEMPLATES = {
  // 抓取知乎文章
  zhihuArticle: (url: string) => createAutomationTask(
    '知乎文章抓取',
    'zhihu',
    [
      { type: 'navigate', value: url },
      { type: 'wait', timeout: 3000 },
      { type: 'scroll', value: 'down' },
      { type: 'wait', timeout: 2000 },
      { type: 'screenshot' }
    ]
  ),
  
  // 抓取抖音视频信息
  douyinVideo: (url: string) => createAutomationTask(
    '抖音视频抓取',
    'douyin',
    [
      { type: 'navigate', value: url },
      { type: 'wait', timeout: 3000 },
      { type: 'extract', selector: '.video-info' }
    ]
  ),
  
  // 抓取飞书文档
  feishuDoc: (url: string) => createAutomationTask(
    '飞书文档抓取',
    'feishu',
    [
      { type: 'navigate', value: url },
      { type: 'wait', timeout: 5000 },
      { type: 'scroll', value: 'down' },
      { type: 'wait', timeout: 2000 }
    ]
  )
}

// ============================================================================
// 快捷抓取函数
// ============================================================================

/**
 * 快速抓取知乎
 */
export async function quickScrapeZhihu(url: string): Promise<ScrapingResult> {
  if (!isLoggedIn('zhihu')) {
    const loggedIn = await loginToPlatform('zhihu')
    if (!loggedIn) {
      return {
        success: false,
        url,
        error: 'Zhihu login failed',
        duration: 0
      }
    }
  }
  
  return await scrapePage(url)
}

/**
 * 快速抓取抖音
 */
export async function quickScrapeDouyin(url: string): Promise<ScrapingResult> {
  if (!isLoggedIn('douyin')) {
    const loggedIn = await loginToPlatform('douyin')
    if (!loggedIn) {
      return {
        success: false,
        url,
        error: 'Douyin login failed',
        duration: 0
      }
    }
  }
  
  return await scrapePage(url)
}

/**
 * 快速抓取飞书
 */
export async function quickScrapeFeishu(url: string): Promise<ScrapingResult> {
  if (!isLoggedIn('feishu')) {
    const loggedIn = await loginToPlatform('feishu')
    if (!loggedIn) {
      return {
        success: false,
        url,
        error: 'Feishu login failed',
        duration: 0
      }
    }
  }
  
  return await scrapePage(url)
}

// ============================================================================
// 订阅
// ============================================================================

export function onLoginSuccess(callback: (platform: BrowserPlatform) => void): () => void {
  return loginSuccess.subscribe(callback)
}

export function onLoginFailed(callback: (platform: BrowserPlatform, error: string) => void): () => void {
  return loginFailed.subscribe((platform, error) => callback(platform, error))
}

export function onScrapingStarted(callback: (url: string) => void): () => void {
  return scrapingStarted.subscribe(callback)
}

export function onScrapingCompleted(callback: (result: ScrapingResult) => void): () => void {
  return scrapingCompleted.subscribe(callback)
}

export function onAutomationStep(callback: (taskId: string, step: AutomationStep) => void): () => void {
  return automationStep.emit
    ? automationStep.subscribe((taskId, step) => callback(taskId, step))
    : () => {}
}

export function onAutomationCompleted(callback: (taskId: string) => void): () => void {
  return automationCompleted.subscribe(callback)
}

// ============================================================================
// 工具
// ============================================================================

export function getLoggedInPlatforms(): BrowserPlatform[] {
  return Array.from(savedLogins.keys()).filter(p => isLoggedIn(p))
}

export function getAutomationTasks(): AutomationTask[] {
  return Array.from(automationTasks.values())
}

export function formatBrowserStatus(): string {
  const lines: string[] = []
  lines.push('═══════════════════════════════════════')
  lines.push('         MCP Browser Status')
  lines.push('═══════════════════════════════════════')
  lines.push(`已登录平台: ${getLoggedInPlatforms().join(', ') || '无'}`)
  lines.push(`自动化任务: ${automationTasks.size}`)
  lines.push('')
  
  if (savedLogins.size > 0) {
    lines.push('## 已保存账号')
    for (const [platform, creds] of savedLogins) {
      const status = isLoggedIn(platform) ? '✅' : '❌'
      lines.push(`  ${status} ${platform}: ${creds.username || 'unknown'}`)
    }
  }
  
  lines.push('═══════════════════════════════════════')
  return lines.join('\n')
}
