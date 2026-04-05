/**
 * 月野兔 Orchestrator v3.5 - 统一协调器
 * 
 * 打通所有模块，形成完整的AI记忆与安全系统
 * v3.5: 集成Skills能力，整合所有功能
 */

// ============================================================================
// 导入所有模块
// ============================================================================

import * as state from './state'
import * as signal from './signal'
import * as autoMode from './autoMode'
import * as taskFramework from './taskFramework'
import * as sessionCron from './sessionCron'
import * as updateDoctor from './updateDoctor'
import * as skillRegistry from './skillRegistry'
import * as forkedAgent from './forkedAgent'
import * as extractMemories from './extractMemories'
import * as sessionMemory from './sessionMemoryEnhanced'
import * as autoDream from './autoDream'
import * as growthBook from './growthBook'
import * as toolSandbox from './toolSandbox'
import * as hookSystem from './hookSystem'
import * as multiAgent from './multiAgent'
import * as mcpBrowser from './mcpBrowser'
import * as skillsIntegration from './skillsIntegration'

// ============================================================================
// 类型定义
// ============================================================================

export interface 月野兔Config {
  version: string
  enabled: {
    memory: boolean
    autoDream: boolean
    autoExtract: boolean
    forkedAgent: boolean
    toolSandbox: boolean
    growthBook: boolean
    hooks: boolean
    multiAgent: boolean
    mcpBrowser: boolean
    skills: boolean
  }
  modules: {
    [key: string]: boolean
  }
}

export interface 月野兔Status {
  running: boolean
  uptime: number
  modules: { [key: string]: boolean }
  stats: {
    memories: number
    sessions: number
    extractions: number
    dreams: number
    agents: number
    skills: number
  }
}

// ============================================================================
// 全局协调器
// ============================================================================

class 月野兔Orchestrator {
  private initialized = false
  private startTime = 0
  private config: 月野兔Config

  constructor() {
    this.config = {
      version: '3.5',
      enabled: {
        memory: true,
        autoDream: true,
        autoExtract: true,
        forkedAgent: true,
        toolSandbox: true,
        growthBook: true,
        hooks: true,
        multiAgent: true,
        mcpBrowser: true,
        skills: true
      },
      modules: {}
    }
  }

  /**
   * 初始化所有模块
   */
  async initialize(): Promise<void> {
    if (this.initialized) return
    
    console.log('[月野兔] 🚀 初始化V3.5中...')
    this.startTime = Date.now()

    // 1. 初始化State
    state.initializeState()
    console.log('[月野兔] ✅ State初始化')

    // 2. 初始化Tool Sandbox
    toolSandbox.initializeSandbox()
    console.log('[月野兔] ✅ ToolSandbox初始化')

    // 3. 初始化Session Memory
    await sessionMemory.initializeSessionMemory()
    console.log('[月野兔] ✅ SessionMemory初始化')

    // 4. 注册GrowthBook内置实验
    growthBook.registerBuiltInExperiments()
    console.log('[月野兔] ✅ GrowthBook初始化')

    // 5. 初始化AutoDream
    autoDream.startIdleMonitor()
    autoDream.startDreamScheduler()
    console.log('[月野兔] ✅ AutoDream启动')

    // 6. 启动Task轮询
    taskFramework.startTaskPolling(1000)
    console.log('[月野兔] ✅ TaskFramework启动')

    // 7. 初始化Hook系统
    await hookSystem.initializeHookSystem()
    console.log('[月野兔] ✅ HookSystem初始化')

    // 8. 注册Multi-Agent
    multiAgent.registerDefaultAgents()
    console.log('[月野兔] ✅ MultiAgent初始化')

    // 9. 初始化Skills系统
    await skillsIntegration.initializeSkills()
    console.log('[月野兔] ✅ Skills系统初始化')

    // 10. 设置模块间协调信号
    this.setupSignals()

    this.initialized = true
    signal.systemInitialized.emit()

    console.log('[月野兔] 🎉 月野兔V3.5初始化完成！')
  }

  /**
   * 设置模块间信号协调
   */
  private setupSignals(): void {
    // Session Memory → ExtractMemories
    sessionMemory.onEntryAdded((entry) => {
      if (this.config.enabled.autoExtract) {
        extractMemories.recordMessage()
      }
    })

    // ExtractMemories → Session Memory
    extractMemories.onMemoryExtracted((memory) => {
      console.log(`[月野兔] 📝 新记忆: ${memory.name}`)
    })

    // AutoDream → ExtractMemories
    autoDream.onDreamCompleted((result) => {
      if (result.insights.length > 0) {
        console.log(`[月野兔] 💡 反思生成${result.insights.length}个洞察`)
      }
    })

    // GrowthBook → ToolSandbox
    growthBook.onFeatureUpdated((key, value) => {
      if (key.startsWith('sandbox.')) {
        const toolName = key.replace('sandbox.', '')
        if (value === 'denied') {
          toolSandbox.denyTool(toolName)
        } else if (value === 'allowed') {
          toolSandbox.allowTool(toolName)
        }
      }
    })

    // ForkedAgent → State
    forkedAgent.onAgentCompleted((id, result) => {
      state.recordExtraction(id, result.duration)
    })

    // TaskFramework → State
    taskFramework.onTaskCompleted((task, duration) => {
      state.incrementSessionMessageCount()
    })

    // ToolSandbox → AutoMode
    toolSandbox.onToolDenied((tool, reason) => {
      console.log(`[月野兔] 🛡️ 工具拒绝: ${tool} - ${reason}`)
    })
  }

  /**
   * 执行工具调用（经过沙箱检查）
   */
  async executeTool(
    toolName: string,
    args: any
  ): Promise<{ success: boolean; result?: any; error?: string }> {
    // 1. Tool Sandbox检查
    if (this.config.enabled.toolSandbox) {
      const check = toolSandbox.canExecuteTool(toolName, args)
      
      if (!check.allowed) {
        toolSandbox.recordToolCall(toolName, args, {
          success: false,
          error: check.reason,
          duration: 0,
          sandboxed: true,
          policyApplied: check.policy as any
        })
        return { success: false, error: check.reason }
      }

      if (check.requiresConfirmation) {
        // 可以在这里实现确认逻辑
        console.log(`[月野兔] ⚠️ 需要确认: ${toolName}`)
      }
    }

    // 2. GrowthBook检查
    if (this.config.enabled.growthBook) {
      const featureKey = `tool.${toolName}`
      const featureValue = growthBook.getFeatureValue(featureKey)
      
      if (featureValue.value === 'disabled') {
        return { success: false, error: `Feature ${toolName} is disabled` }
      }
    }

    // 3. 记录调用
    toolSandbox.recordToolCall(toolName, args)

    // 4. 执行工具（这里需要根据实际工具调用）
    return { success: true, result: null }
  }

  /**
   * 添加记忆
   */
  async addMemory(
    content: string,
    type: 'user' | 'feedback' | 'project' | 'reference',
    options?: { important?: boolean; tags?: string[] }
  ): Promise<void> {
    // 1. 添加到Session Memory
    await sessionMemory.addSessionEntry(content, type as any, {
      important: options?.important,
      tags: options?.tags
    })

    // 2. 如果是重要内容，立即触发提取
    if (options?.important) {
      const entries = sessionMemory.getSessionEntries()
      const messages = entries.map(e => ({
        role: e.type as any,
        content: e.content,
        timestamp: e.timestamp,
        tokenCount: e.tokens
      }))
      
      await extractMemories.triggerManualExtraction(messages as any)
    }
  }

  /**
   * 触发反思
   */
  async dream(force = false): Promise<autoDream.DreamResult> {
    return await autoDream.dream({ force })
  }

  /**
   * 执行后台任务
   */
  async runInBackground(
    prompt: string,
    options?: { name?: string; timeout?: number }
  ): Promise<forkedAgent.ForkedAgentResult> {
    return await forkedAgent.runForkedAgent(prompt, {
      name: options?.name,
      timeout: options?.timeout
    })
  }

  /**
   * 获取系统状态
   */
  getStatus(): 月野兔Status {
    return {
      running: this.initialized,
      uptime: this.initialized ? Date.now() - this.startTime : 0,
      modules: {
        state: state.isInitialized(),
        sessionMemory: true,
        autoDream: autoDream.getDreamState().isDreaming,
        toolSandbox: toolSandbox.isSandboxEnabled(),
        growthBook: true,
        forkedAgent: forkedAgent.getForkedAgentStats().running > 0,
        hooks: true,
        multiAgent: true,
        mcpBrowser: true,
        skills: true
      },
      stats: {
        memories: state.getTotalMemories(),
        sessions: 1,
        extractions: state.getExtractionStats().count,
        dreams: autoDream.getDreamStats().dreamCount,
        agents: forkedAgent.getForkedAgentStats().running,
        skills: skillsIntegration.getSkillsStats().total
      }
    }
  }

  /**
   * 更新配置
   */
  updateConfig(updates: Partial<月野兔Config>): void {
    this.config = { ...this.config, ...updates }
  }

  /**
   * 获取配置
   */
  getConfig(): 月野兔Config {
    return { ...this.config }
  }
}

// ============================================================================
// 全局实例
// ============================================================================

export const 月野兔 = new 月野兔Orchestrator()

// ============================================================================
// 便捷函数
// ============================================================================

export async function initialize(): Promise<void> {
  await 月野兔.initialize()
}

export function getStatus(): 月野兔Status {
  return 月野兔.getStatus()
}

export async function addMemory(
  content: string,
  type: 'user' | 'feedback' | 'project' | 'reference',
  options?: { important?: boolean; tags?: string[] }
): Promise<void> {
  await 月野兔.addMemory(content, type, options)
}

export async function dream(force = false): Promise<autoDream.DreamResult> {
  return await 月野兔.dream(force)
}

export async function runInBackground(
  prompt: string,
  options?: { name?: string; timeout?: number }
): Promise<forkedAgent.ForkedAgentResult> {
  return await 月野兔.runInBackground(prompt, options)
}

// 导出所有模块
export * from './state'
export * from './signal'
export * from './autoMode'
export * from './taskFramework'
export * from './sessionCron'
export * from './updateDoctor'
export * from './skillRegistry'
export * from './forkedAgent'
export * from './extractMemories'
export * from './sessionMemoryEnhanced'
export * from './autoDream'
export * from './growthBook'
export * from './toolSandbox'
