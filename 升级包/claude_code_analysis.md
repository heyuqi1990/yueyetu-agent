# Claude Code 源码分析报告

> 分析基于 Claude Code 3月31日泄露版源码，仅供 OpenClaw 参考学习
> 
> 分析时间：2026-04-03

---

## 目录

1. [src/src/cli/handlers/agents.ts](#1-cliagents---多agent管理) — Agent 发现与配置机制
2. [src/src/cli/handlers/autoMode.ts](#2-cliautomode---自动化执行模式) — 自动模式分类器
3. [src/src/tasks.ts](#3-srctasks---任务抽象层) — 任务类型注册表
4. [src/src/bootstrap/state.ts](#4-srcbootstrapstate---全局状态管理) — 运行时状态管理
5. [src/src/cli/structuredIO.ts](#5-srcclistructuredio---结构化输入输出) — SDK 协议通信
6. [src/src/cli/remoteIO.ts](#6-srccliremoteio---远程通信模式) — 远程会话传输层
7. [src/src/cli/update.ts](#7-srccliupdate---自我更新机制) — 自动化更新
8. [src/src/server/directConnectManager.ts](#8-srcserverdirectconnectmanager---直连会话管理) — 直连 WebSocket 管理
9. [src/src/utils/task/framework.ts](#9-srcutilstaskframework---任务框架) — 任务生命周期管理
10. [src/src/utils/signal.ts](#10-srcutilssignal---轻量信号机制) — 事件信号系统
11. [Top10 可落地改进清单](#top10-可落地改进清单)

---

## 1. src/src/cli/handlers/agents.ts - 多Agent管理

**文件路径**: `src/src/cli/handlers/agents.ts`  
**行数**: ~80行  
**标签**: 🟡 需要适配

### 核心设计思想

Claude Code 采用**目录扫描 + 配置合并**的 Agent 发现机制：

1. 从工作目录扫描 `.claude/agents/` 目录
2. 支持 `agentSourceGroups` 分组（plugin/marketplace/builtin/user）
3. 支持 Agent 覆盖（`overriddenBy`）实现配置优先级
4. 动态合并用户设置与系统默认

### 具体实现机制

```typescript
// 核心类型
export type ResolvedAgent = {
  agentType: string
  source: string
  memory?: string
  overriddenBy?: string
}

// Agent 发现入口
export async function agentsHandler(): Promise<void> {
  const cwd = getCwd()
  const { allAgents } = await getAgentDefinitionsWithOverrides(cwd)
  const activeAgents = getActiveAgentsFromList(allAgents)
  const resolvedAgents = resolveAgentOverrides(allAgents, activeAgents)
  
  // 按 source 分组展示
  for (const { label, source } of AGENT_SOURCE_GROUPS) {
    const groupAgents = resolvedAgents
      .filter(a => a.source === source)
      .sort(compareAgentsByName)
    // ...格式化输出
  }
}
```

### 关键代码片段

```typescript
function formatAgent(agent: ResolvedAgent): string {
  const model = resolveAgentModelDisplay(agent)
  const parts = [agent.agentType]
  if (model) {
    parts.push(model)
  }
  if (agent.memory) {
    parts.push(`${agent.memory} memory`)
  }
  return parts.join(' · ')
}
```

### 对 OpenClaw 的借鉴意义

- **可直接借鉴**: Agent 配置的目录扫描机制
- **需要适配**: OpenClaw 的 skill 系统已有类似能力，但缺乏分组和优先级覆盖

### 可落地改进

- 在 OpenClaw 中实现 skill 的覆盖/优先级机制
- 支持 skill 按来源（builtin/plugin/external）分组展示

---

## 2. src/src/cli/handlers/autoMode.ts - 自动化执行模式

**文件路径**: `src/src/cli/handlers/autoMode.ts`  
**行数**: ~200行  
**标签**: 🟢 可直接借鉴

### 核心设计思想

Claude Code 的 **Auto Mode** 是一个 AI 分类器驱动的**自动审批系统**：

- 使用 LLM 作为分类器判断工具调用是否自动批准
- 规则分三类：`allow`（自动批准）/ `soft_deny`（需确认）/ `environment`（环境上下文）
- 支持用户自定义规则，覆盖默认规则
- 提供规则 critiques 功能（AI 评审用户规则）

### 具体实现机制

```typescript
// autoMode 默认规则处理器
export function autoModeDefaultsHandler(): void {
  writeRules(getDefaultExternalAutoModeRules())
}

// 有效配置处理器（用户配置 + 外部默认）
export function autoModeConfigHandler(): void {
  const config = getAutoModeConfig()
  const defaults = getDefaultExternalAutoModeRules()
  writeRules({
    allow: config?.allow?.length ? config.allow : defaults.allow,
    soft_deny: config?.soft_deny?.length ? config.soft_deny : defaults.soft_deny,
    environment: config?.environment?.length ? config.environment : defaults.environment,
  })
}

// AI 评审规则实现
export async function autoModeCritiqueHandler(options: { model?: string }): Promise<void> {
  // 1. 获取用户自定义规则
  // 2. 获取默认规则
  // 3. 调用 sideQuery 用 LLM 评审
  // 4. 输出评审结果
}
```

### 关键代码片段

```typescript
const CRITIQUE_SYSTEM_PROMPT =
  'You are an expert reviewer of auto mode classifier rules for Claude Code.\n' +
  // ... 详细的评审标准
  'For each rule, evaluate:\n' +
  '1. **Clarity**: Is the rule unambiguous?\n' +
  '2. **Completeness**: Are there gaps?\n' +
  '3. **Conflicts**: Do any rules conflict?\n' +
  '4. **Actionability**: Is it specific enough for the classifier to act on?\n'
```

### Auto Mode 分类器（yoloClassifier.ts）

```typescript
// 核心分类函数签名
export async function runYoloClassifier(
  tool: Tool,
  input: Record<string, unknown>,
  toolUseContext: ToolUseContext,
): Promise<YoloClassifierResult>

// 分类结果类型
export type YoloClassifierResult = {
  behavior: 'allow' | 'deny' | 'need_confirmation'
  decisionReason?: {
    type: 'classifier' | 'rule' | 'mode' | 'hook'
    reason?: string
  }
}
```

### 对 OpenClaw 的借鉴意义

- **可直接借鉴**: Auto Mode 的三层规则结构（allow/soft_deny/environment）
- **可直接借鉴**: 基于 LLM 的规则 critiques 功能
- **需要适配**: OpenClaw 目前使用简单的规则引擎，可升级为 LLM 分类器

### 可落地改进

1. 为 OpenClaw 实现 Auto Mode 权限分类器
2. 支持 `autoMode.{allow, soft_deny, environment}` 配置
3. 添加 `/auto-mode critique` 命令评审用户规则

---

## 3. src/src/tasks.ts - 任务抽象层

**文件路径**: `src/src/tasks.ts`  
**行数**: ~50行  
**标签**: 🟢 可直接借鉴

### 核心设计思想

Claude Code 采用**任务类型注册表模式**：

- 所有任务类型通过 `getAllTasks()` 集中注册
- 通过 `feature()` 标志实现条件编译（可选任务）
- `getTaskByType()` 实现按类型查找

### 具体实现机制

```typescript
// Task 类型接口（极简）
export type Task = {
  name: string
  type: TaskType
  kill(taskId: string, setAppState: SetAppState): Promise<void>
}

// 任务注册表
export function getAllTasks(): Task[] {
  const tasks: Task[] = [
    LocalShellTask,
    LocalAgentTask,
    RemoteAgentTask,
    DreamTask,
  ]
  if (LocalWorkflowTask) tasks.push(LocalWorkflowTask)
  if (MonitorMcpTask) tasks.push(MonitorMcpTask)
  return tasks
}

export function getTaskByType(type: TaskType): Task | undefined {
  return getAllTasks().find(t => t.type === type)
}
```

### 任务类型定义（Task.ts）

```typescript
export type TaskType =
  | 'local_bash'
  | 'local_agent'
  | 'remote_agent'
  | 'in_process_teammate'
  | 'local_workflow'
  | 'monitor_mcp'
  | 'dream'

export type TaskStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'killed'

// 任务 ID 生成（安全随机）
export function generateTaskId(type: TaskType): string {
  const prefix = TASK_ID_PREFIXES[type] ?? 'x'
  const bytes = randomBytes(8)
  // 36^8 ≈ 2.8万亿组合，防暴力攻击
  return prefix + Array.from(bytes, b => TASK_ID_ALPHABET[b % 36]).join('')
}
```

### 对 OpenClaw 的借鉴意义

- **可直接借鉴**: 任务注册表模式
- **可直接借鉴**: TaskStatus 状态机
- **可直接借鉴**: 安全的任务 ID 生成（防符号链接攻击）

### 可落地改进

1. OpenClaw 可统一任务抽象，支持更多任务类型（cron/notification/agent）
2. 参考 `generateTaskId` 改进 ID 生成安全性

---

## 4. src/src/bootstrap/state.ts - 全局状态管理

**文件路径**: `src/src/bootstrap/state.ts`  
**行数**: ~700行  
**标签**: 🟡 需要适配

### 核心设计思想

Claude Code 采用**单例全局状态 + 访问器函数**模式：

- 单一 `STATE` 对象存储所有运行时状态
- 通过 `getXXX()`/`setXXX()` 函数访问状态（而不是直接导出 STATE）
- 状态初始化在 `getInitialState()` 集中完成
- 支持状态重置（`resetStateForTests()`）

### State 结构设计

```typescript
type State = {
  // 基础信息
  originalCwd: string
  projectRoot: string
  sessionId: SessionId
  parentSessionId: SessionId | undefined
  
  // 成本与用量
  totalCostUSD: number
  modelUsage: { [modelName: string]: ModelUsage }
  
  // 会话管理
  sessionCreatedTeams: Set<string>
  sessionCronTasks: SessionCronTask[]
  invokedSkills: Map<string, InvokedSkillInfo>
  
  // Beta 功能标志（latch 模式）
  afkModeHeaderLatched: boolean | null
  fastModeHeaderLatched: boolean | null
  
  // ... 70+ 字段
}
```

### 关键设计模式

#### 1. Beta Header Latch（一次性开关）

```typescript
// 一旦某个 beta 特性激活，整个会话保持开启
export function setAfkModeHeaderLatched(v: boolean): void {
  STATE.afkModeHeaderLatched = v
}
// 防止频繁切换导致 prompt cache 失效
```

#### 2. SessionCronTask（会话级定时任务）

```typescript
export type SessionCronTask = {
  id: string
  cron: string
  prompt: string
  createdAt: number
  recurring?: boolean
  agentId?: string  // 关联到特定 agent
}
```

#### 3. InvokedSkills（跨 compaction 保留）

```typescript
export function addInvokedSkill(
  skillName: string,
  skillPath: string,
  content: string,
  agentId: string | null = null,
): void {
  const key = `${agentId ?? ''}:${skillName}`
  STATE.invokedSkills.set(key, { skillName, skillPath, content, ... })
}
```

#### 4. 滑动窗口防抖（scroll drain）

```typescript
let scrollDraining = false
let scrollDrainTimer: ReturnType<typeof setTimeout> | undefined
const SCROLL_DRAIN_IDLE_MS = 150

export function markScrollActivity(): void {
  scrollDraining = true
  clearTimeout(scrollDrainTimer)
  scrollDrainTimer = setTimeout(() => {
    scrollDraining = false
  }, SCROLL_DRAIN_IDLE_MS)
}

export async function waitForScrollIdle(): Promise<void> {
  while (scrollDraining) {
    await new Promise(r => setTimeout(r, SCROLL_DRAIN_IDLE_MS))
  }
}
```

### 对 OpenClaw 的借鉴意义

- **可直接借鉴**: 全局状态 + 访问器函数模式
- **可直接借鉴**: Beta 功能 latch 设计
- **需要适配**: OpenClaw 目前使用分散的状态管理，需要集中化

### 可落地改进

1. 设计统一的 State 接口，集中管理 OpenClaw 运行时状态
2. 实现 `sessionCronTasks` 类似功能
3. 借鉴 scroll drain 模式优化 UI 渲染性能

---

## 5. src/src/cli/structuredIO.ts - 结构化输入输出

**文件路径**: `src/src/cli/structuredIO.ts`  
**行数**: ~500行  
**标签**: 🟢 可直接借鉴（精简版）

### 核心设计思想

Claude Code 的 `StructuredIO` 是 **SDK 协议的核心实现**：

- 基于 NDJSON（newline-delimited JSON）的结构化通信
- 支持 `control_request`/`control_response` 双向握手
- 权限请求通过 Promise.race 实现 hook 和 SDK 的竞速
- 重复响应检测防止重复处理

### 消息类型

```typescript
type StdinMessage =
  | { type: 'user'; message: SDKUserMessage }
  | { type: 'control_request'; request: SDKControlRequest }
  | { type: 'assistant'; ... }
  | { type: 'system'; ... }

type SDKControlRequest =
  | { subtype: 'can_use_tool'; tool_name: string; ... }
  | { subtype: 'hook_callback'; callback_id: string; ... }
  | { subtype: 'elicitation'; ... }
  | { subtype: 'mcp_message'; ... }
```

### 权限请求竞速机制

```typescript
createCanUseTool(
  onPermissionPrompt?: (details: RequiresActionDetails) => void,
): CanUseToolFn {
  return async (tool, input, toolUseContext, ...) => {
    // 1. 先检查本地规则
    const mainPermissionResult = await hasPermissionsToUseTool(...)
    if (mainPermissionResult.behavior === 'allow') return mainPermissionResult

    // 2. Hook 和 SDK 权限请求并发竞速
    const hookPromise = executePermissionRequestHooksForSDK(...).then(...)
    const sdkPromise = this.sendRequest({ subtype: 'can_use_tool', ... })

    // 3. 谁先返回谁赢
    const winner = await Promise.race([hookPromise, sdkPromise])
    
    if (winner.source === 'hook') {
      // Hook 赢了，取消 SDK 请求
      sdkPromise.catch(() => {})
      return winner.decision
    }
    return permissionPromptToolResultToPermissionDecision(winner.result, ...)
  }
}
```

### 重复响应防护

```typescript
// MAX_RESOLVED_TOOL_USE_IDS = 1000，防止内存泄漏
private readonly resolvedToolUseIds = new Set<string>()

private trackResolvedToolUseId(request: SDKControlRequest): void {
  if (request.request.subtype === 'can_use_tool') {
    this.resolvedToolUseIds.add(request.request.tool_use_id)
    if (this.resolvedToolUseIds.size > MAX_RESOLVED_TOOL_USE_IDS) {
      // FIFO 淘汰
      const first = this.resolvedToolUseIds.values().next().value
      this.resolvedToolUseIds.delete(first)
    }
  }
}
```

### 对 OpenClaw 的借鉴意义

- **可直接借鉴**: NDJSON 通信格式
- **可直接借鉴**: 权限请求竞速模式
- **可直接借鉴**: 重复响应防护机制

### 可落地改进

1. OpenClaw 可实现精简版 StructuredIO 支持 MCP 协议
2. 实现 `control_request`/`control_response` 握手机制
3. 添加重复消息防护

---

## 6. src/src/cli/remoteIO.ts - 远程通信模式

**文件路径**: `src/src/cli/remoteIO.ts`  
**行数**: ~200行  
**标签**: 🟡 需要适配

### 核心设计思想

`RemoteIO` 扩展 `StructuredIO`，支持**远程 SDK 会话**：

- 支持多种传输层：WebSocket、SSE+POST（CCR v2）、Hybrid
- 动态 token 刷新机制
- 心跳保活（keepalive）
- 内部事件持久化

### 传输层选择

```typescript
// transportUtils.ts
export function getTransportForUrl(
  url: URL,
  headers: Record<string, string>,
  sessionId?: string,
  refreshHeaders?: () => Record<string, string>,
): Transport {
  if (isEnvTruthy(process.env.CLAUDE_CODE_USE_CCR_V2)) {
    // v2: SSE 读取 + POST 写入
    return new SSETransport(sseUrl, headers, sessionId, refreshHeaders)
  }
  if (isEnvTruthy(process.env.CLAUDE_CODE_POST_FOR_SESSION_INGRESS_V2)) {
    // Hybrid: WS 读取 + POST 写入
    return new HybridTransport(url, headers, sessionId, refreshHeaders)
  }
  // 默认: WebSocket 双向
  return new WebSocketTransport(url, headers, sessionId, refreshHeaders)
}
```

### 动态 Token 刷新

```typescript
const refreshHeaders = (): Record<string, string> => {
  const h: Record<string, string> = {}
  const freshToken = getSessionIngressAuthToken()
  if (freshToken) {
    h['Authorization'] = `Bearer ${freshToken}`
  }
  return h
}
// 传输层在重连时调用 refreshHeaders 获取最新 token
```

### 心跳保活

```typescript
const keepAliveIntervalMs = getPollIntervalConfig().session_keepalive_interval_v2_ms
if (this.isBridge && keepAliveIntervalMs > 0) {
  this.keepAliveTimer = setInterval(() => {
    void this.write({ type: 'keep_alive' })
  }, keepAliveIntervalMs)
  this.keepAliveTimer.unref?.()
}
```

### 对 OpenClaw 的借鉴意义

- **可直接借鉴**: 传输层抽象（Transport 接口）
- **可直接借鉴**: 心跳保活机制
- **需要适配**: OpenClaw 的远程通信需求不同

### 可落地改进

1. 设计统一的 Transport 接口支持多协议
2. 实现心跳机制保持连接活跃

---

## 7. src/src/cli/update.ts - 自我更新机制

**文件路径**: `src/src/cli/update.ts`  
**行数**: ~350行  
**标签**: 🟢 可直接借鉴

### 核心设计思想

Claude Code 的更新系统非常完善：

- 支持多种安装方式检测（npm-local/npm-global/native/homebrew/winget/apk）
- 自动诊断安装冲突
- 锁定文件防止并发更新
- 回退机制

### 安装类型检测

```typescript
type InstallationType =
  | 'npm-local'
  | 'npm-global'
  | 'native'
  | 'homebrew'
  | 'winget'
  | 'apk'
  | 'development'
  | 'unknown'

// 诊断检查
const diagnostic = await getDoctorDiagnostic()

// 检测多安装冲突
if (diagnostic.multipleInstallations.length > 1) {
  writeToStdout(chalk.yellow('Warning: Multiple installations found'))
  for (const install of diagnostic.multipleInstallations) {
    writeToStdout(`- ${install.type} at ${install.path}`)
  }
}
```

### 更新流程

```typescript
export async function update() {
  // 1. 检测安装类型
  // 2. 检查是否开发构建
  // 3. 根据安装类型选择更新方式
  // 4. 执行更新
  // 5. 重新生成补全缓存
}

async function updateNative(): Promise<void> {
  const result = await installLatestNative(channel, true)
  
  if (result.lockFailed) {
    // 另一个进程正在更新
    writeToStdout(chalk.yellow('Another Claude process is currently running...'))
    return
  }
  
  if (result.latestVersion === MACRO.VERSION) {
    writeToStdout(chalk.green('Claude Code is up to date'))
  } else {
    writeToStdout(chalk.green(`Updated to ${result.latestVersion}`))
    await regenerateCompletionCache()
  }
}
```

### 对 OpenClaw 的借鉴意义

- **可直接借鉴**: 安装类型检测机制
- **可直接借鉴**: 诊断警告系统
- **可直接借鉴**: 锁定文件防并发

### 可落地改进

1. OpenClaw 实现自动更新检测和安装
2. 添加 `openclaw doctor` 诊断命令
3. 实现多安装路径冲突检测

---

## 8. src/src/server/directConnectManager.ts - 直连会话管理

**文件路径**: `src/src/server/directConnectManager.ts`  
**行数**: ~180行  
**标签**: 🟢 可直接借鉴（精简版）

### 核心设计思想

`DirectConnectSessionManager` 管理**直连 SDK 会话**的 WebSocket 生命周期：

- 简单的 WebSocket 客户端封装
- 消息类型过滤（只转发需要的消息）
- 权限请求回调处理
- 中断信号支持

### 连接管理

```typescript
export class DirectConnectSessionManager {
  private ws: WebSocket | null = null

  connect(): void {
    const headers: Record<string, string> = {}
    if (this.config.authToken) {
      headers['authorization'] = `Bearer ${this.config.authToken}`
    }
    
    this.ws = new WebSocket(this.config.wsUrl, { headers })
    
    this.ws.addEventListener('open', () => {
      this.callbacks.onConnected?.()
    })
    
    this.ws.addEventListener('message', event => {
      const lines = data.split('\n').filter(l => l.trim())
      for (const line of lines) {
        const parsed = jsonParse(line)
        if (parsed.type === 'control_request') {
          // 权限请求
          this.callbacks.onPermissionRequest(parsed.request, parsed.request_id)
        } else {
          // 转发其他消息
          this.callbacks.onMessage(parsed)
        }
      }
    })
  }
}
```

### 消息发送

```typescript
sendMessage(content: RemoteMessageContent): boolean {
  if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
    return false
  }
  // 必须匹配 SDK 格式
  const message = jsonStringify({
    type: 'user',
    message: { role: 'user', content },
    parent_tool_use_id: null,
    session_id: '',
  })
  this.ws.send(message)
  return true
}

sendInterrupt(): void {
  // 发送中断请求取消当前操作
  const request = jsonStringify({
    type: 'control_request',
    request_id: crypto.randomUUID(),
    request: { subtype: 'interrupt' },
  })
  this.ws.send(request)
}
```

### 对 OpenClaw 的借鉴意义

- **可直接借鉴**: WebSocket 封装模式
- **可直接借鉴**: 中断信号机制
- **可直接借鉴**: 消息类型过滤

### 可落地改进

1. OpenClaw 可实现 WebSocket 直连支持
2. 实现 `interrupt` 机制取消正在执行的任务
3. 添加消息过滤减少不必要的处理

---

## 9. src/src/utils/task/framework.ts - 任务框架

**文件路径**: `src/src/utils/task/framework.ts`  
**行数**: ~250行  
**标签**: 🟢 可直接借鉴

### 核心设计思想

任务框架是 Claude Code 的**任务生命周期管理中心**：

- 统一的 `registerTask`/`updateTaskState` 接口
- 任务输出增量读取（避免重复）
- 终端状态自动驱逐（GC）
- 轮询驱动的事件生成

### 任务注册

```typescript
export function registerTask(task: TaskState, setAppState: SetAppState): void {
  let isReplacement = false
  setAppState(prev => {
    const existing = prev.tasks[task.id]
    isReplacement = existing !== undefined
    // 保留 UI 状态（retain/messages/diskLoaded）
    const merged = existing && 'retain' in existing ? {
      ...task,
      retain: existing.retain,
      startTime: existing.startTime,
      messages: existing.messages,
      diskLoaded: existing.diskLoaded,
    } : task
    return { ...prev, tasks: { ...prev.tasks, [task.id]: merged } }
  })
  
  if (!isReplacement) {
    // 发送 SDK 事件
    enqueueSdkEvent({ type: 'system', subtype: 'task_started', ... })
  }
}
```

### 增量输出读取

```typescript
export async function generateTaskAttachments(state: AppState): Promise<{
  attachments: TaskAttachment[]
  updatedTaskOffsets: Record<string, number>
  evictedTaskIds: string[]
}> {
  for (const taskState of Object.values(tasks)) {
    if (taskState.status === 'running') {
      // 只读取增量
      const delta = await getTaskOutputDelta(
        taskState.id,
        taskState.outputOffset,  // 从上次位置继续
      )
      if (delta.content) {
        updatedTaskOffsets[taskState.id] = delta.newOffset
      }
    }
    
    // 终端状态自动驱逐
    if (isTerminalTaskStatus(taskState.status) && taskState.notified) {
      evictedTaskIds.push(taskState.id)
    }
  }
}
```

### 面板宽限期

```typescript
// 'local_agent' 任务有 30 秒宽限期
export const PANEL_GRACE_MS = 30_000

// 在驱逐检查中
if ('retain' in task && (task.evictAfter ?? Infinity) > Date.now()) {
  return prev  // 还在宽限期内，不驱逐
}
```

### 对 OpenClaw 的借鉴意义

- **可直接借鉴**: 任务状态机
- **可直接借鉴**: 增量输出读取
- **可直接借鉴**: 终端状态 GC

### 可落地改进

1. 为 OpenClaw 任务实现增量输出
2. 实现任务面板宽限期机制
3. 添加终端任务自动 GC

---

## 10. src/src/utils/signal.ts - 轻量信号机制

**文件路径**: `src/src/utils/signal.ts`  
**行数**: ~50行  
**标签**: 🟢 可直接借鉴

### 核心设计思想

Claude Code 实现了一个极简的**事件信号系统**：

- 替代重复的 `Set<listener>` + `subscribe()`/`notify()` 模式
- 用于"发生了什么"而非"当前值是什么"的场景
- 返回取消订阅函数

### 实现

```typescript
export type Signal<Args extends unknown[] = []> = {
  subscribe: (listener: (...args: Args) => void) => () => void
  emit: (...args: Args) => void
  clear: () => void
}

export function createSignal<Args extends unknown[] = []>(): Signal<Args> {
  const listeners = new Set<(...args: Args) => void>()
  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)  // 返回取消订阅
    },
    emit(...args) {
      for (const listener of listeners) listener(...args)
    },
    clear() {
      listeners.clear()
    },
  }
}
```

### 使用示例

```typescript
// state.ts
const sessionSwitched = createSignal<[id: SessionId]>()
export const onSessionSwitch = sessionSwitched.subscribe

export function switchSession(sessionId: SessionId): void {
  STATE.sessionId = sessionId
  sessionSwitched.emit(sessionId)
}

// 其他模块
const unsubscribe = onSessionSwitch((sessionId) => {
  // 收到会话切换通知
})
// 稍后取消订阅
unsubscribe()
```

### 对 OpenClaw 的借鉴意义

- **可直接借鉴**: 信号模式替代简单的发布-订阅
- **可直接借鉴**: 用于会话切换等一次性事件

### 可落地改进

1. 在 OpenClaw 中用 `createSignal` 替代手写的发布-订阅
2. 用于会话切换、模式切换等事件通知

---

## Top10 可落地改进清单

| 优先级 | 改进项 | 来源模块 | 预期收益 | 难度 |
|--------|--------|----------|----------|------|
| 1 | **实现 Auto Mode 权限分类器** | autoMode.ts | 自动化权限审批，减少人工干预 | 中 |
| 2 | **统一状态管理 State 接口** | bootstrap/state.ts | 集中化状态访问，便于维护 | 中 |
| 3 | **实现轻量信号系统** | utils/signal.ts | 简化事件通知代码 | 低 |
| 4 | **任务增量输出读取** | utils/task/framework.ts | 减少重复输出传输 | 中 |
| 5 | **实现自动更新检测** | cli/update.ts | 提升用户体验 | 中 |
| 6 | **添加诊断命令 `openclaw doctor`** | cli/update.ts | 快速定位问题 | 低 |
| 7 | **实现 WebSocket 直连** | server/directConnectManager.ts | 支持远程 SDK | 高 |
| 8 | **实现 interrupt 中断机制** | server/directConnectManager.ts | 支持取消正在执行的任务 | 中 |
| 9 | **滚动窗口防抖优化** | bootstrap/state.ts | 提升 UI 渲染性能 | 低 |
| 10 | **Terminal 任务自动 GC** | utils/task/framework.ts | 释放内存，避免泄漏 | 低 |

---

## 附录：关键代码路径速查

| 功能 | 文件路径 | 关键函数 |
|------|----------|----------|
| Agent 发现 | `cli/handlers/agents.ts` | `agentsHandler()` |
| Auto Mode | `cli/handlers/autoMode.ts` | `autoModeCritiqueHandler()` |
| 任务注册 | `tasks.ts` | `getAllTasks()`, `getTaskByType()` |
| 状态管理 | `bootstrap/state.ts` | `STATE`, `getXXX()`, `setXXX()` |
| SDK 通信 | `cli/structuredIO.ts` | `StructuredIO`, `createCanUseTool()` |
| 远程传输 | `cli/remoteIO.ts` | `RemoteIO`, `getTransportForUrl()` |
| 自动更新 | `cli/update.ts` | `update()` |
| 直连管理 | `server/directConnectManager.ts` | `DirectConnectSessionManager` |
| 任务框架 | `utils/task/framework.ts` | `registerTask()`, `pollTasks()` |
| 信号系统 | `utils/signal.ts` | `createSignal()` |

---

*报告完成 | 分析深度：架构设计 > 核心实现 > 可落地性评估*
