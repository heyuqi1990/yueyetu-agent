# 记忆系统 v2.0 升级方案

> 基于 Claude Code 源码深度分析
> 参考版本: 2026-04-05

---

## 一、现有架构回顾

### 当前OpenClaw四层记忆
| 层级 | 功能 | 实现 |
|------|------|------|
| **SOUL** | 人格内核 | SOUL.md |
| **TOOLS** | Skills | 动态加载 |
| **USER** | 用户记忆 | MEMORY.md |
| **Session** | 实时上下文 | 内存级 |

### Claude Code记忆系统对比
| 模块 | Claude Code | OpenClaw当前 |
|------|-------------|---------------|
| 记忆类型 | 4种(user/feedback/project/reference) | 无分类 |
| 索引方式 | MEMORY.md入口+独立文件 | 单一MEMORY.md |
| 提取方式 | Forked Agent自动提取 | 手动写入 |
| 会话记忆 | SessionMemory自动维护 | 无 |
| 压缩机制 | Micro Compact + SM Compact | Pre-Compaction |
| 权限控制 | 细粒度工具权限 | 无 |

---

## 二、v2.0 升级架构

### 2.1 四种记忆类型

```typescript
// 记忆类型定义
const MEMORY_TYPES = [
  'user',      // 用户信息：角色、目标、偏好
  'feedback',  // 反馈：纠正和确认
  'project',   // 项目：目标、bug、进度
  'reference'  // 参考：外部系统指针
] as const
```

#### 记忆类型详解

| 类型 | 描述 | 保存时机 | 示例 |
|------|------|----------|------|
| **user** | 用户角色、目标、职责 | 学习到用户信息时 | `用户是A股交易者，模式是龙头战法` |
| **feedback** | 工作方式指导 | 用户纠正或确认时 | `不要用专业术语，要用通俗语言` |
| **project** | 项目状态、目标 | 了解项目进展时 | `项目目标是5月前上线` |
| **reference** | 外部资源指针 | 发现外部资源时 | `财务数据在notion的X页面` |

### 2.2 双层索引结构

```
memory/
├── MEMORY.md          # 索引文件（入口）
├── user/              # 用户记忆
│   ├── trading_style.md
│   └── preferences.md
├── feedback/         # 反馈记忆
│   └── response_format.md
├── project/           # 项目记忆
│   └── current_task.md
└── reference/        # 参考记忆
    └── external_docs.md
```

#### MEMORY.md 格式
```markdown
# 记忆索引

## 用户 (user)
- [交易风格](user/trading_style.md) - 短线龙头模式
- [沟通偏好](user/preferences.md) - 喜欢简洁回复

## 反馈 (feedback)
- [回复格式](feedback/response_format.md) - 简洁有力

## 项目 (project)
- [当前任务](project/current_task.md) - 完善记忆系统

## 参考 (reference)
- [外部文档](reference/external_docs.md) - API文档位置
```

### 2.3 前置元数据格式

```markdown
---
name: trading_style
description: 短线龙头模式交易者
type: user
---

# 交易风格

用户是A股职业交易者，采用：
1. 短线龙头模式
2. 强势股狠杀后反弹
3. 反弹二波

**Why**: 这是其核心策略
**How to apply**: 分析时优先从这些角度
```

### 2.4 记忆不保存内容

```
❌ 不保存：
- 代码模式（可从源码派生）
- Git历史（用git命令）
- 已修复的bug（代码已更新）
- CLAUDE.md中已有的内容
- 临时状态、当前对话上下文

✅ 每次保存前检查：
- 是否已存在重复记忆？
- 是否可以从其他来源派生？
- 是否值得长期保存？
```

---

## 三、自动提取机制

### 3.1 Forked Agent模式

```typescript
// 原理：fork主对话，在后台提取记忆
// 优势：共享prompt cache，节省token

async function runExtraction(context) {
  // 1. 检查主agent是否已写入记忆
  if (hasMemoryWritesSince(context.messages, lastUuid)) {
    return  // 跳过，主agent已处理
  }
  
  // 2. 构建提取提示
  const prompt = buildExtractPrompt(newMessageCount, existingMemories)
  
  // 3. 运行forked agent
  const result = await runForkedAgent({
    promptMessages: [createUserMessage({ content: prompt })],
    canUseTool: createMemoryFileCanUseTool(), // 权限控制
    maxTurns: 5,  // 限制turns防止无限循环
  })
  
  // 4. 更新cursor
  lastMemoryMessageUuid = messages.at(-1).uuid
}
```

### 3.2 触发条件

```typescript
// 基于token阈值触发
const shouldExtract = (
  hasMetTokenThreshold() && 
  (hasMetToolCallThreshold() || !hasToolCallsInLastTurn())
)

// 阈值配置
const config = {
  minTokensToInit: 1000,      // 初始化阈值
  minTokensBetweenUpdate: 500,  // 更新间隔
  toolCallsBetweenUpdates: 10  // 工具调用间隔
}
```

### 3.3 工具权限控制

```typescript
// 只允许操作记忆文件
function createMemoryFileCanUseTool(memoryDir: string): CanUseToolFn {
  return async (tool, input) => {
    // 允许：Read/Grep/Glob
    if (isReadTool(tool)) return allow()
    
    // 允许：只读bash命令
    if (tool === BASH && isReadOnly(cmd)) return allow()
    
    // 允许：memoryDir下的Edit/Write
    if (isEditWriteTool(tool) && isInMemoryDir(input.path)) {
      return allow()
    }
    
    return deny('only memory operations allowed')
  }
}
```

---

## 四、Session记忆模块

### 4.1 功能说明

Session Memory在会话期间持续维护一个markdown文件，记录：
- 对话摘要
- 关键决策
- 未完成任务
- 重要上下文

### 4.2 触发机制

```typescript
// 三重阈值触发
const shouldExtract = 
  (tokens > minTokens && toolCalls > minToolCalls) ||
  (tokens > minTokens && lastTurnHasNoToolCalls)

// 防止在工具调用中间提取（避免孤立tool_result）
if (hasToolCallsInLastAssistantTurn(messages)) {
  return false  // 等待对话自然停顿
}
```

### 4.3 与Compaction的集成

```typescript
// Session Memory用于Compaction时的摘要
async function trySessionMemoryCompaction(messages) {
  const sessionMemory = await getSessionMemoryContent()
  if (!sessionMemory) return null
  
  // 计算需要保留的消息
  const startIndex = calculateMessagesToKeepIndex(messages)
  
  // 用SessionMemory替代传统摘要
  return createCompactionResult({
    summary: sessionMemory,
    messagesToKeep: messages.slice(startIndex)
  })
}
```

---

## 五、信任与验证机制

### 5.1 记忆漂移警示

```markdown
## 记忆可能过时

记忆记录会随时间变旧。使用记忆时：
- 验证记忆中的事实是否仍然正确
- 如果记忆与当前状态冲突，以当前状态为准
- 更新或删除过时记忆
```

### 5.2 推荐前验证

```markdown
## 推荐前验证

记忆提到"X文件存在"：
- 先检查文件是否真的存在
- 再推荐用户使用

记忆推荐"用Y方法"：
- 先验证Y方法是否仍适用
- 再执行推荐
```

---

## 六、实施计划

### Phase 1: 基础架构 (v2.0.1)
- [ ] 定义MEMORY_TYPES常量
- [ ] 创建memory/目录结构
- [ ] 实现基础的scanMemoryFiles
- [ ] 修改MEMORY.md为索引格式

### Phase 2: 自动提取 (v2.0.2)
- [ ] 实现extractMemories提示模板
- [ ] 实现forked extraction机制
- [ ] 实现工具权限控制
- [ ] 添加触发阈值配置

### Phase 3: Session记忆 (v2.0.3)
- [ ] 实现SessionMemory模块
- [ ] 实现阈值触发逻辑
- [ ] 与compaction集成

### Phase 4: 优化 (v2.0.4)
- [ ] 实现记忆去重检查
- [ ] 添加记忆验证机制
- [ ] 优化token使用
- [ ] 添加用户提示

---

## 七、关键源码参考

| 模块 | 文件 | 核心函数 |
|------|------|----------|
| 记忆类型 | `memdir/memoryTypes.ts` | `MEMORY_TYPES`, `parseMemoryType` |
| 记忆扫描 | `memdir/memoryScan.ts` | `scanMemoryFiles`, `formatMemoryManifest` |
| 提取提示 | `extractMemories/prompts.ts` | `buildExtractAutoOnlyPrompt` |
| 提取器 | `extractMemories/extractMemories.ts` | `executeExtractMemories` |
| 会话记忆 | `SessionMemory/sessionMemory.ts` | `shouldExtractMemory` |
| 压缩集成 | `compact/sessionMemoryCompact.ts` | `trySessionMemoryCompaction` |

---

## 八、与现有系统的集成

### 8.1 保留SOUL.md
SOUL.md作为不可变人格定义保留，不纳入记忆类型系统

### 8.2 USER.md迁移
USER.md内容迁移到memory/user/目录，作为user类型记忆

### 8.3 每日日志
memory/YYYY-MM-DD.md保持作为append-only日志，与新系统共存

### 8.4 向后兼容
- 现有MEMORY.md在v2.0第一阶段作为索引入口
- 历史记忆文件逐步迁移到分类目录
