/**
 * Multi-Agent System v1.0 - 多智能体系统
 * 
 * trader交易Agent + risk风控Agent分离
 * bindings路由隔离
 */

// ============================================================================
// 导入
// ============================================================================

import { createSignal } from './signal'
import { runForkedAgent, type ForkedAgentResult } from './forkedAgent'

// ============================================================================
// 类型定义
// ============================================================================

/**
 * Agent类型
 */
export type AgentType = 'trader' | 'risk' | 'coordinator' | 'extractor' | 'custom'

/**
 * Agent状态
 */
export type AgentStatus = 'idle' | 'running' | 'paused' | 'stopped' | 'error'

/**
 * Agent配置
 */
export interface AgentConfig {
  name: string
  type: AgentType
  description: string
  enabled: boolean
  model?: string
  temperature?: number
  maxTokens?: number
  systemPrompt?: string
  bindings?: string[]      // 绑定的事件类型
  isolation?: 'strict' | 'relaxed'  // 隔离级别
}

/**
 * Agent实例
 */
export interface AgentInstance {
  id: string
  config: AgentConfig
  status: AgentStatus
  startedAt: number
  lastActiveAt: number
  tasksCompleted: number
  currentTask?: string
  error?: string
}

/**
 * 交易上下文
 */
export interface TradingContext {
  symbol?: string
  action?: 'buy' | 'sell' | 'hold'
  quantity?: number
  price?: number
  reason?: string
  riskScore?: number
}

/**
 * 风控结果
 */
export interface RiskControlResult {
  allowed: boolean
  riskLevel: 'low' | 'medium' | 'high' | 'critical'
  reason: string
  suggestions?: string[]
  requiredConfirmations?: string[]
}

// ============================================================================
// 存储
// ============================================================================

const agents: Map<string, AgentInstance> = new Map()
const agentConfigs: Map<string, AgentConfig> = new Map()
const taskQueue: Map<string, any> = new Map()

// 信号
const agentStarted = createSignal<[agentId: string]>()
const agentStopped = createSignal<[agentId: string]>()
const agentError = createSignal<[agentId: string, error: string]>()
const tradingRequest = createSignal<[context: TradingContext]>()
const tradingApproved = createSignal<[context: TradingContext]>()
const tradingRejected = createSignal<[result: RiskControlResult]>()
const taskCompleted = createSignal<[agentId: string, taskId: string]>()

// ============================================================================
// Agent注册
// ============================================================================

/**
 * 注册Agent
 */
export function registerAgent(config: AgentConfig): void {
  const id = `${config.type}_${config.name}_${Date.now().toString(36)}`
  
  const instance: AgentInstance = {
    id,
    config,
    status: 'idle',
    startedAt: Date.now(),
    lastActiveAt: Date.now(),
    tasksCompleted: 0
  }
  
  agents.set(id, instance)
  agentConfigs.set(id, config)
  
  console.log(`[MultiAgent] 注册Agent: ${config.name} (${config.type})`)
}

/**
 * 批量注册默认Agents
 */
export function registerDefaultAgents(): void {
  // Trader Agent
  registerAgent({
    name: 'trader',
    type: 'trader',
    description: '交易选股下单Agent',
    enabled: true,
    systemPrompt: `你是一个专业的A股交易助手。
你的职责：
1. 分析市场行情和股票走势
2. 识别龙头股和强势股
3. 制定买入/卖出策略
4. 执行交易指令

交易原则：
- 短线龙头模式：追涨龙头股
- 强势股反弹：超跌反弹策略
- 反弹二波：抓住反弹行情的二次启动

当你需要执行交易时，必须先提交给风控Agent审核。`,
    bindings: ['trading_request', 'market_analysis'],
    isolation: 'relaxed'
  })

  // Risk Agent
  registerAgent({
    name: 'risk',
    type: 'risk',
    description: '风控审核Agent',
    enabled: true,
    systemPrompt: `你是一个专业的A股风控助手。
你的职责：
1. 审核交易请求的风险等级
2. 判断是否允许执行交易
3. 提供风险控制建议
4. 阻止高风险交易

风控规则：
- 单笔交易不超过总仓位的20%
- 亏损超过5%必须止损
- 连续亏损3次禁止开新仓
- 高波动股票需要额外确认

你必须严格把关，保护资金安全。`,
    bindings: ['risk_review', 'trading_approval'],
    isolation: 'strict'
  })

  // Coordinator Agent
  registerAgent({
    name: 'coordinator',
    type: 'coordinator',
    description: '协调Agent，负责分发任务',
    enabled: true,
    systemPrompt: `你是一个任务协调助手。
你的职责：
1. 接收用户请求
2. 分析任务类型
3. 分发给合适的Agent
4. 汇总结果返回用户

你会根据任务类型选择：
- trading_request → trader
- risk_review → risk
- data_extraction → extractor`,
    bindings: ['user_request'],
    isolation: 'strict'
  })

  console.log(`[MultiAgent] 已注册 ${agents.size} 个默认Agents`)
}

// ============================================================================
// Agent执行
// ============================================================================

/**
 * 执行Agent任务
 */
export async function runAgent(
  agentId: string,
  task: string,
  context?: any
): Promise<ForkedAgentResult> {
  const agent = agents.get(agentId)
  if (!agent) {
    throw new Error(`Agent not found: ${agentId}`)
  }
  
  if (!agent.config.enabled) {
    throw new Error(`Agent ${agent.config.name} is disabled`)
  }
  
  agent.status = 'running'
  agent.currentTask = task
  agent.lastActiveAt = Date.now()
  
  agentStarted.emit(agentId)
  
  try {
    const result = await runForkedAgent(task, {
      name: `${agent.config.name}: ${task.slice(0, 30)}...`,
      timeout: 60000
    })
    
    agent.tasksCompleted++
    agent.status = 'idle'
    agent.currentTask = undefined
    
    taskCompleted.emit(agentId, task)
    
    return result
    
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    agent.status = 'error'
    agent.error = errorMsg
    agentError.emit(agentId, errorMsg)
    throw error
  }
}

/**
 * 通过类型查找Agent
 */
export function getAgentByType(type: AgentType): AgentInstance | undefined {
  for (const agent of agents.values()) {
    if (agent.config.type === type && agent.config.enabled) {
      return agent
    }
  }
  return undefined
}

// ============================================================================
// 交易流程
// ============================================================================

/**
 * 提交交易请求（通过风控）
 */
export async function submitTradingRequest(context: TradingContext): Promise<RiskControlResult> {
  console.log(`[MultiAgent] 提交交易请求: ${context.action} ${context.symbol}`)
  
  // 发送交易请求事件
  tradingRequest.emit(context)
  
  // 获取risk agent
  const riskAgent = getAgentByType('risk')
  if (!riskAgent) {
    return {
      allowed: false,
      riskLevel: 'critical',
      reason: '风控Agent未找到'
    }
  }
  
  // 执行风控检查
  const riskPrompt = buildRiskPrompt(context)
  
  try {
    const result = await runAgent(riskAgent.id, riskPrompt, context)
    
    // 解析风控结果
    const riskResult = parseRiskResult(result.output || '', context)
    
    if (riskResult.allowed) {
      tradingApproved.emit(context)
    } else {
      tradingRejected.emit(riskResult)
    }
    
    return riskResult
    
  } catch (error) {
    return {
      allowed: false,
      riskLevel: 'critical',
      reason: `风控检查失败: ${error}`
    }
  }
}

/**
 * 构建风控Prompt
 */
function buildRiskPrompt(context: TradingContext): string {
  return `请审核以下交易请求：

股票代码: ${context.symbol || '未指定'}
操作: ${context.action || '未指定'}
数量: ${context.quantity || '未指定'}
价格: ${context.price || '未指定'}
原因: ${context.reason || '未提供'}

请以JSON格式返回审核结果：
{
  "allowed": true/false,
  "riskLevel": "low/medium/high/critical",
  "reason": "审核说明",
  "suggestions": ["建议1", "建议2"],
  "requiredConfirmations": ["需要确认项"]
}`
}

/**
 * 解析风控结果
 */
function parseRiskResult(output: string, context: TradingContext): RiskControlResult {
  try {
    // 尝试从输出中提取JSON
    const jsonMatch = output.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0])
    }
  } catch {}
  
  // 默认风控逻辑
  const riskScore = calculateRiskScore(context)
  
  return {
    allowed: riskScore < 80,
    riskLevel: riskScore < 30 ? 'low' : riskScore < 60 ? 'medium' : riskScore < 80 ? 'high' : 'critical',
    reason: `自动风控评估: 风险分数 ${riskScore}`,
    suggestions: riskScore >= 60 ? ['建议降低仓位', '考虑分批建仓'] : undefined
  }
}

/**
 * 计算风险分数
 */
function calculateRiskScore(context: TradingContext): number {
  let score = 30  // 基础分
  
  // 股票波动性（假设）
  if (context.symbol) {
    score += 10
  }
  
  // 仓位
  if (context.quantity && context.quantity > 10000) {
    score += 20
  }
  
  // 操作类型
  if (context.action === 'sell') {
    score -= 20  // 卖出降低风险
  } else if (context.action === 'buy') {
    score += 15
  }
  
  return Math.max(0, Math.min(100, score))
}

// ============================================================================
// Coordinator路由
// ============================================================================

/**
 * 分发任务到合适的Agent
 */
export async function dispatchTask(task: string): Promise<any> {
  // 获取coordinator
  const coordinator = getAgentByType('coordinator')
  if (!coordinator) {
    throw new Error('Coordinator not found')
  }
  
  // 分析任务类型
  const taskType = analyzeTaskType(task)
  
  // 根据类型路由
  switch (taskType) {
    case 'trading':
      return await dispatchToTrader(task)
    case 'risk':
      return await dispatchToRisk(task)
    case 'analysis':
      return await dispatchToTrader(task)
    default:
      return await coordinator.run(task)
  }
}

/**
 * 分析任务类型
 */
function analyzeTaskType(task: string): string {
  const lower = task.toLowerCase()
  
  if (lower.includes('买') || lower.includes('卖') || lower.includes('交易')) {
    return 'trading'
  }
  if (lower.includes('风险') || lower.includes('止损') || lower.includes('风控')) {
    return 'risk'
  }
  if (lower.includes('分析') || lower.includes('行情') || lower.includes('走势')) {
    return 'analysis'
  }
  
  return 'general'
}

/**
 * 分发到Trader
 */
async function dispatchToTrader(task: string): Promise<any> {
  const trader = getAgentByType('trader')
  if (!trader) {
    throw new Error('Trader not found')
  }
  
  // 如果是买入/卖出请求，先过风控
  if (task.includes('买') || task.includes('卖')) {
    const context = parseTradingContext(task)
    const riskResult = await submitTradingRequest(context)
    
    if (!riskResult.allowed) {
      return { success: false, error: riskResult.reason, riskResult }
    }
  }
  
  return await runAgent(trader.id, task)
}

/**
 * 分发到Risk
 */
async function dispatchToRisk(task: string): Promise<any> {
  const risk = getAgentByType('risk')
  if (!risk) {
    throw new Error('Risk agent not found')
  }
  
  return await runAgent(risk.id, task)
}

/**
 * 解析交易上下文
 */
function parseTradingContext(task: string): TradingContext {
  const context: TradingContext = {}
  
  // 简单解析
  const symbolMatch = task.match(/[0-9]{6}/)
  if (symbolMatch) {
    context.symbol = symbolMatch[0]
  }
  
  if (task.includes('买')) {
    context.action = 'buy'
  } else if (task.includes('卖')) {
    context.action = 'sell'
  }
  
  return context
}

// ============================================================================
// Agent管理
// ============================================================================

/**
 * 获取所有Agent
 */
export function getAllAgents(): AgentInstance[] {
  return Array.from(agents.values())
}

/**
 * 获取运行中的Agent
 */
export function getRunningAgents(): AgentInstance[] {
  return Array.from(agents.values()).filter(a => a.status === 'running')
}

/**
 * 启用Agent
 */
export function enableAgent(agentId: string): boolean {
  const agent = agents.get(agentId)
  if (!agent) return false
  agent.config.enabled = true
  return true
}

/**
 * 禁用Agent
 */
export function disableAgent(agentId: string): boolean {
  const agent = agents.get(agentId)
  if (!agent) return false
  agent.config.enabled = false
  return true
}

/**
 * 停止Agent
 */
export function stopAgent(agentId: string): boolean {
  const agent = agents.get(agentId)
  if (!agent) return false
  agent.status = 'stopped'
  agentStopped.emit(agentId)
  return true
}

/**
 * 重启Agent
 */
export function restartAgent(agentId: string): boolean {
  const agent = agents.get(agentId)
  if (!agent) return false
  agent.status = 'idle'
  agent.error = undefined
  return true
}

// ============================================================================
// 订阅
// ============================================================================

export function onAgentStarted(callback: (agentId: string) => void): () => void {
  return agentStarted.subscribe(callback)
}

export function onAgentStopped(callback: (agentId: string) => void): () => void {
  return agentStopped.subscribe(callback)
}

export function onAgentError(callback: (agentId: string, error: string) => void): () => void {
  return agentError.subscribe((id, error) => callback(id, error))
}

export function onTradingRequest(callback: (context: TradingContext) => void): () => void {
  return tradingRequest.subscribe(callback)
}

export function onTradingApproved(callback: (context: TradingContext) => void): () => void {
  return tradingApproved.subscribe(callback)
}

export function onTradingRejected(callback: (result: RiskControlResult) => void): () => void {
  return tradingRejected.subscribe(callback)
}

// ============================================================================
// 工具
// ============================================================================

export function getAgentStats(): {
  total: number
  running: number
  byType: Record<string, number>
} {
  const byType: Record<string, number> = {}
  let running = 0
  
  for (const agent of agents.values()) {
    byType[agent.config.type] = (byType[agent.config.type] || 0) + 1
    if (agent.status === 'running') running++
  }
  
  return { total: agents.size, running, byType }
}

export function formatAgents(): string {
  const lines: string[] = []
  lines.push('═══════════════════════════════════════')
  lines.push('         Multi-Agent System')
  lines.push('═══════════════════════════════════════')
  lines.push(`总Agent数: ${agents.size}`)
  lines.push('')
  
  for (const [type, agentsOfType] of Object.entries(groupAgentsByType())) {
    lines.push(`## ${type} (${agentsOfType.length})`)
    for (const agent of agentsOfType) {
      const status = agent.status === 'running' ? '🟢' : agent.status === 'idle' ? '⚪' : '🔴'
      lines.push(`  ${status} ${agent.config.name} - ${agent.status}`)
    }
    lines.push('')
  }
  
  lines.push('═══════════════════════════════════════')
  return lines.join('\n')
}

function groupAgentsByType(): Record<string, AgentInstance[]> {
  const groups: Record<string, AgentInstance[]> = {}
  for (const agent of agents.values()) {
    const type = agent.config.type
    if (!groups[type]) groups[type] = []
    groups[type].push(agent)
  }
  return groups
}
