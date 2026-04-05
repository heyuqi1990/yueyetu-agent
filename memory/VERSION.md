# 月野兔 V3.0

> AI记忆与安全系统 — 永不失忆 · 防止幻想

## 版本历史

| 版本 | 日期 | 描述 |
|------|------|------|
| v1.0 | 2026-04-05 | 基础记忆系统 |
| v2.0 | 2026-04-05 | Claude Code源码升级，Phase 1-4 |
| v2.1 | 2026-04-05 | 统一核心引擎 |
| v2.2 | 2026-04-05 | Phase 1: Signal/State/AutoMode |
| | | Phase 2: TaskFramework/SessionCron |
| | | Phase 3: UpdateDoctor/SkillRegistry |
| v2.3 | 2026-04-05 | High: ForkedAgent/ExtractMemories/SessionMemoryEnhanced |
| | | Low: AutoDream |
| | | Medium: GrowthBook/ToolSandbox |
| **v3.0** | 2026-04-05 | **月野兔Orchestrator统一协调器** |

## 架构图

```
┌─────────────────────────────────────────────────────────────┐
│                    月野兔 V3.0 Orchestrator                 │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │   Signal    │◄──►│   State    │◄──►│  AutoMode   │     │
│  │  事件信号   │    │  全局状态   │    │  权限分类   │     │
│  └─────────────┘    └─────────────┘    └─────────────┘     │
│         │                  │                  │             │
│         ▼                  ▼                  ▼             │
│  ┌─────────────────────────────────────────────┐           │
│  │              Memory System                    │           │
│  │  SessionMemory ──► ExtractMemories ──► 长期记忆 │           │
│  └─────────────────────────────────────────────┘           │
│                              │                              │
│                              ▼                              │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │ ForkedAgent │    │  AutoDream  │    │  GrowthBook │     │
│  │  后台任务   │    │   自动反思  │    │   AB测试    │     │
│  └─────────────┘    └─────────────┘    └─────────────┘     │
│                                                              │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │TaskFramework│    │SessionCron  │    │ToolSandbox  │     │
│  │  任务框架   │    │  定时任务   │    │  沙箱隔离   │     │
│  └─────────────┘    └─────────────┘    └─────────────┘     │
│                                                              │
└─────────────────────────────────────────────────────────────┘

三层防护:
┌─────────────────────────────────────────────────────────────┐
│ 记忆层 │ 四种类型分类 · 自动提取 · 会话持久化               │
├─────────────────────────────────────────────────────────────┤
│ 验证层 │ 去重检查 · Trust Level · 记忆验证                  │
├─────────────────────────────────────────────────────────────┤
│ 执行层 │ 沙箱隔离 · 权限分类 · 路径过滤                     │
└─────────────────────────────────────────────────────────────┘
```

## 核心模块

### Phase 1 - 基础模块
- `signal.ts` - 轻量级事件信号机制
- `state.ts` - 全局状态管理
- `autoMode.ts` - LLM权限分类器

### Phase 2 - 任务调度
- `taskFramework.ts` - 任务生命周期管理
- `sessionCron.ts` - 会话级定时任务

### Phase 3 - 系统工具
- `updateDoctor.ts` - 自动更新与诊断
- `skillRegistry.ts` - Skill优先级覆盖机制

### Phase 4 - 高级功能
- `forkedAgent.ts` - 后台异步Agent执行
- `extractMemories.ts` - 记忆自动提取
- `sessionMemoryEnhanced.ts` - 会话级记忆持久化
- `autoDream.ts` - 自动反思机制
- `growthBook.ts` - AB测试与特征开关
- `toolSandbox.ts` - 工具沙箱隔离

### v3.0 - 协调器
- `orchestrator.ts` - 统一协调器，打通所有模块

## 使用示例

```typescript
import { initialize, addMemory, dream, runInBackground } from './memory'

// 初始化
await initialize()

// 添加记忆
await addMemory('用户今天问了股票代码', 'user', { important: true })

// 后台任务
await runInBackground('分析今日大盘走势', { timeout: 60000 })

// 触发反思
await dream({ force: true })
```

## 防护特性

- ✅ **永不失忆** - SessionMemory持久化 + 自动提取
- ✅ **防止幻想** - ToolSandbox路径过滤 + 记忆验证
- ✅ **主动反思** - AutoDream空闲时自动思考
- ✅ **持续优化** - GrowthBook AB测试

---

*月野兔 V3.0 - 让AI真正可靠*
