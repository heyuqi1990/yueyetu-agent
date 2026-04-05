/**
 * Auto Mode System v2.2 - 权限分类器
 * 
 * 源自Claude Code的Auto Mode设计
 * 使用LLM作为分类器判断工具调用是否自动批准
 */

/**
 * 权限决策类型
 */
export type PermissionDecision = 
  | { behavior: 'allow'; reason?: string }
  | { behavior: 'deny'; reason?: string }
  | { behavior: 'need_confirmation'; reason?: string }

/**
 * 工具调用上下文
 */
export interface ToolUseContext {
  sessionId: string
  agentId?: string
  toolName: string
  toolInput: Record<string, unknown>
  messageId?: string
  timestamp: number
}

/**
 * 默认规则类型
 */
export type RuleType = 'allow' | 'soft_deny' | 'environment'

/**
 * 规则结构
 */
export interface AutoModeRule {
  type: RuleType
  pattern: string
  description: string
  examples?: string[]
}

/**
 * 权限请求结果
 */
export interface PermissionRequestResult {
  decision: PermissionDecision
  source: 'rule' | 'classifier' | 'mode' | 'hook'
  matchedRule?: string
  reasoning?: string
}

/**
 * 默认规则
 */
const DEFAULT_ALLOW_RULES: AutoModeRule[] = [
  {
    type: 'allow',
    pattern: 'read.*file',
    description: '读取文件操作'
  },
  {
    type: 'allow',
    pattern: 'search.*memory',
    description: '搜索记忆系统'
  },
  {
    type: 'allow',
    pattern: 'get.*status',
    description: '获取系统状态'
  },
  {
    type: 'allow',
    pattern: 'list.*files',
    description: '列出文件'
  }
]

const DEFAULT_SOFT_DENY_RULES: AutoModeRule[] = [
  {
    type: 'soft_deny',
    pattern: 'write.*file',
    description: '写入文件操作需要确认'
  },
  {
    type: 'soft_deny',
    pattern: 'delete.*file',
    description: '删除文件操作需要确认'
  },
  {
    type: 'soft_deny',
    pattern: 'exec.*command',
    description: '执行命令需要确认'
  }
]

const DEFAULT_ENVIRONMENT_RULES: AutoModeRule[] = [
  {
    type: 'environment',
    pattern: '*.sudo*',
    description: 'sudo权限操作'
  },
  {
    type: 'environment',
    pattern: '*.password*',
    description: '密码相关操作'
  },
  {
    type: 'environment',
    pattern: '*.financial*',
    description: '金融交易操作'
  }
]

// ============================================================================
// 规则匹配
// ============================================================================

/**
 * 匹配规则
 */
function matchRule(pattern: string, toolName: string, toolInput: Record<string, unknown>): boolean {
  // 简单的通配符匹配
  const regex = new RegExp(
    '^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$',
    'i'
  )
  return regex.test(toolName)
}

/**
 * 评估工具调用
 */
export function evaluateToolCall(
  toolName: string,
  toolInput: Record<string, unknown>,
  context: ToolUseContext,
  customRules?: {
    allow?: AutoModeRule[]
    soft_deny?: AutoModeRule[]
    environment?: AutoModeRule[]
  }
): PermissionRequestResult {
  const rules = {
    allow: customRules?.allow ?? DEFAULT_ALLOW_RULES,
    soft_deny: customRules?.soft_deny ?? DEFAULT_SOFT_DENY_RULES,
    environment: customRules?.environment ?? DEFAULT_ENVIRONMENT_RULES
  }

  // 1. 先检查allow规则
  for (const rule of rules.allow) {
    if (matchRule(rule.pattern, toolName, toolInput)) {
      return {
        decision: { behavior: 'allow', reason: rule.description },
        source: 'rule',
        matchedRule: rule.pattern
      }
    }
  }

  // 2. 检查environment规则
  for (const rule of rules.environment) {
    if (matchRule(rule.pattern, toolName, toolInput)) {
      return {
        decision: { behavior: 'need_confirmation', reason: rule.description },
        source: 'rule',
        matchedRule: rule.pattern
      }
    }
  }

  // 3. 检查soft_deny规则
  for (const rule of rules.soft_deny) {
    if (matchRule(rule.pattern, toolName, toolInput)) {
      return {
        decision: { behavior: 'need_confirmation', reason: rule.description },
        source: 'rule',
        matchedRule: rule.pattern
      }
    }
  }

  // 4. 默认allow
  return {
    decision: { behavior: 'allow', reason: '默认允许' },
    source: 'mode'
  }
}

// ============================================================================
// LLM分类器（需要集成LLM）
// ============================================================================

/**
 * 分类器结果
 */
export interface ClassifierResult {
  behavior: 'allow' | 'deny' | 'need_confirmation'
  decisionReason: {
    type: 'classifier' | 'rule' | 'mode' | 'hook'
    reason?: string
  }
}

/**
 * LLM分类器提示
 */
const CLASSIFIER_SYSTEM_PROMPT = `You are an expert reviewer of auto mode classifier rules for tool permissions.
For each tool call, evaluate:
1. **Safety**: Is this tool call safe to execute automatically?
2. **Reversibility**: Can this action be easily undone if needed?
3. **Scope**: Does this affect only local resources or external systems?
4. **Intent**: Is the user's intent clear from the context?

Consider:
- Read operations are generally safe
- Write operations should be scrutinized
- Deletions and destructive operations require confirmation
- Financial transactions always require confirmation
- System-level changes require confirmation`

/**
 * 构建分类器输入
 */
function buildClassifierInput(
  toolName: string,
  toolInput: Record<string, unknown>,
  context: ToolUseContext
): string {
  return `Tool: ${toolName}
Input: ${JSON.stringify(toolInput, null, 2)}
Session: ${context.sessionId}
Timestamp: ${new Date(context.timestamp).toISOString()}
${context.agentId ? `Agent: ${context.agentId}` : ''}
${context.messageId ? `Message: ${context.messageId}` : ''}`
}

/**
 * 解析分类器输出
 */
function parseClassifierOutput(output: string): ClassifierResult {
  const lower = output.toLowerCase()
  
  if (lower.includes('"allow"') || lower.includes('allow') && !lower.includes('deny')) {
    return {
      behavior: 'allow',
      decisionReason: { type: 'classifier', reason: output }
    }
  }
  
  if (lower.includes('"deny"') || (lower.includes('deny') && !lower.includes('allow'))) {
    return {
      behavior: 'deny',
      decisionReason: { type: 'classifier', reason: output }
    }
  }
  
  // 默认need_confirmation
  return {
    behavior: 'need_confirmation',
    decisionReason: { type: 'classifier', reason: output }
  }
}

/**
 * LLM分类器接口（需要外部LLM实现）
 */
export interface LLMClassifier {
  classify(
    toolName: string,
    toolInput: Record<string, unknown>,
    context: ToolUseContext
  ): Promise<ClassifierResult>
}

/**
 * 创建基于规则的分类器
 */
export function createRuleBasedClassifier(): LLMClassifier {
  return {
    async classify(toolName, toolInput, context) {
      const result = evaluateToolCall(toolName, toolInput, context)
      return {
        behavior: result.decision.behavior,
        decisionReason: {
          type: result.source,
          reason: result.decision.reason
        }
      }
    }
  }
}

// ============================================================================
// Auto Mode 配置
// ============================================================================

export interface AutoModeConfig {
  enabled: boolean
  rules: {
    allow: AutoModeRule[]
    soft_deny: AutoModeRule[]
    environment: AutoModeRule[]
  }
  useClassifier: boolean
  classifierModel?: string
}

const defaultConfig: AutoModeConfig = {
  enabled: false, // 默认关闭
  rules: {
    allow: DEFAULT_ALLOW_RULES,
    soft_deny: DEFAULT_SOFT_DENY_RULES,
    environment: DEFAULT_ENVIRONMENT_RULES
  },
  useClassifier: false,
  classifierModel: 'claude-sonnet-4-6'
}

let currentConfig: AutoModeConfig = { ...defaultConfig }

// ============================================================================
// Auto Mode 核心
// ============================================================================

/**
 * Auto Mode 类
 */
export class AutoMode {
  private config: AutoModeConfig
  private classifier: LLMClassifier

  constructor(config?: Partial<AutoModeConfig>) {
    this.config = { ...defaultConfig, ...config }
    this.classifier = createRuleBasedClassifier()
  }

  /**
   * 更新配置
   */
  updateConfig(updates: Partial<AutoModeConfig>): void {
    this.config = { ...this.config, ...updates }
  }

  /**
   * 获取配置
   */
  getConfig(): AutoModeConfig {
    return { ...this.config }
  }

  /**
   * 检查是否启用
   */
  isEnabled(): boolean {
    return this.config.enabled
  }

  /**
   * 请求权限
   */
  async requestPermission(
    toolName: string,
    toolInput: Record<string, unknown>,
    context: ToolUseContext
  ): Promise<PermissionRequestResult> {
    // 如果禁用，返回need_confirmation
    if (!this.config.enabled) {
      return {
        decision: { behavior: 'need_confirmation', reason: 'Auto Mode已禁用' },
        source: 'mode'
      }
    }

    // 如果启用LLM分类器
    if (this.config.useClassifier) {
      try {
        const result = await this.classifier.classify(toolName, toolInput, context)
        return {
          decision: { behavior: result.behavior, reason: result.decisionReason.reason },
          source: result.decisionReason.type,
          reasoning: result.decisionReason.reason
        }
      } catch (error) {
        // 分类器失败，回退到规则
        console.error('Classifier failed, falling back to rules:', error)
      }
    }

    // 使用规则评估
    return evaluateToolCall(toolName, toolInput, context, this.config.rules)
  }

  /**
   * 添加规则
   */
  addRule(rule: AutoModeRule): void {
    if (rule.type === 'allow') {
      this.config.rules.allow.push(rule)
    } else if (rule.type === 'soft_deny') {
      this.config.rules.soft_deny.push(rule)
    } else if (rule.type === 'environment') {
      this.config.rules.environment.push(rule)
    }
  }

  /**
   * 移除规则
   */
  removeRule(pattern: string): boolean {
    const rules = this.config.rules as Record<RuleType, AutoModeRule[]>
    for (const type of ['allow', 'soft_deny', 'environment'] as RuleType[]) {
      const index = rules[type].findIndex(r => r.pattern === pattern)
      if (index >= 0) {
        rules[type].splice(index, 1)
        return true
      }
    }
    return false
  }

  /**
   * 获取所有规则
   */
  getRules(): AutoModeConfig['rules'] {
    return {
      allow: [...this.config.rules.allow],
      soft_deny: [...this.config.rules.soft_deny],
      environment: [...this.config.rules.environment]
    }
  }

  /**
   * 重置为默认规则
   */
  resetRules(): void {
    this.config.rules = {
      allow: [...DEFAULT_ALLOW_RULES],
      soft_deny: [...DEFAULT_SOFT_DENY_RULES],
      environment: [...DEFAULT_ENVIRONMENT_RULES]
    }
  }

  /**
   * 导出规则
   */
  exportRules(): string {
    return JSON.stringify(this.config.rules, null, 2)
  }

  /**
   * 导入规则
   */
  importRules(json: string): boolean {
    try {
      const rules = JSON.parse(json)
      if (rules.allow && rules.soft_deny && rules.environment) {
        this.config.rules = rules
        return true
      }
      return false
    } catch {
      return false
    }
  }
}

// ============================================================================
// 全局实例
// ============================================================================

let globalAutoMode: AutoMode | null = null

/**
 * 获取全局AutoMode实例
 */
export function getAutoMode(): AutoMode {
  if (!globalAutoMode) {
    globalAutoMode = new AutoMode()
  }
  return globalAutoMode
}

/**
 * 初始化AutoMode
 */
export function initializeAutoMode(config?: Partial<AutoModeConfig>): AutoMode {
  globalAutoMode = new AutoMode(config)
  return globalAutoMode
}

/**
 * 启用AutoMode
 */
export function enableAutoMode(): void {
  getAutoMode().updateConfig({ enabled: true })
}

/**
 * 禁用AutoMode
 */
export function disableAutoMode(): void {
  getAutoMode().updateConfig({ enabled: false })
}

/**
 * 快速权限检查
 */
export async function checkPermission(
  toolName: string,
  toolInput: Record<string, unknown>,
  context: ToolUseContext
): Promise<PermissionRequestResult> {
  return getAutoMode().requestPermission(toolName, toolInput, context)
}

// ============================================================================
// 规则评审（LLM）
// ============================================================================

/**
 * 评审规则
 */
export async function critiqueRules(
  rules: AutoModeConfig['rules'],
  llm: LLMClassifier
): Promise<{
  issues: string[]
  suggestions: string[]
}> {
  const issues: string[] = []
  const suggestions: string[] = []

  // 检查重复规则
  const allPatterns = [
    ...rules.allow.map(r => r.pattern),
    ...rules.soft_deny.map(r => r.pattern),
    ...rules.environment.map(r => r.pattern)
  ]
  const duplicates = allPatterns.filter((p, i) => allPatterns.indexOf(p) !== i)
  if (duplicates.length > 0) {
    issues.push(`发现重复规则: ${duplicates.join(', ')}`)
  }

  // 检查冲突规则
  for (const allow of rules.allow) {
    for (const deny of rules.soft_deny) {
      if (allow.pattern === deny.pattern) {
        issues.push(`规则冲突: ${allow.pattern} 同时在allow和soft_deny中`)
      }
    }
  }

  // 检查过于宽泛的规则
  for (const rule of [...rules.allow, ...rules.soft_deny, ...rules.environment]) {
    if (rule.pattern === '*' || rule.pattern === '.*') {
      issues.push(`规则过于宽泛: ${rule.pattern}`)
      suggestions.push(`考虑为 ${rule.pattern} 添加更具体的条件`)
    }
  }

  // 建议添加的规则
  if (!rules.soft_deny.some(r => r.pattern.includes('delete'))) {
    suggestions.push('建议添加删除操作的确认规则')
  }
  if (!rules.environment.some(r => r.pattern.includes('sudo'))) {
    suggestions.push('建议添加sudo权限的确认规则')
  }

  return { issues, suggestions }
}

// ============================================================================
// 工具
// ============================================================================

/**
 * 创建权限检查工具函数
 */
export function createPermissionChecker(autoMode?: AutoMode) {
  const mode = autoMode || getAutoMode()
  
  return async function check(
    toolName: string,
    toolInput: Record<string, unknown>,
    context: ToolUseContext
  ): Promise<boolean> {
    const result = await mode.requestPermission(toolName, toolInput, context)
    return result.decision.behavior === 'allow'
  }
}

/**
 * 判断是否需要确认
 */
export function needsConfirmation(result: PermissionRequestResult): boolean {
  return result.decision.behavior === 'need_confirmation'
}

/**
 * 判断是否允许
 */
export function isAllowed(result: PermissionRequestResult): boolean {
  return result.decision.behavior === 'allow'
}

/**
 * 判断是否拒绝
 */
export function isDenied(result: PermissionRequestResult): boolean {
  return result.decision.behavior === 'deny'
}
