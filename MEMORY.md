# MEMORY.md - 长期记忆库

> ⚠️ 注意: 详细记忆已迁移到 `./memory/` 目录
> 本文件作为主索引，完整记忆请查看 `./memory/MEMORY.md`

## 用户信息
- **姓名**: 鑫鑫淼
- **职业**: A股职业交易者
- **平台**: 飞书 (Feishu)
- **时区**: Asia/Shanghai (GMT+8)
- **语言**: 中文

## 月野兔V3.0 状态
- **状态**: ✅ 正式运行
- **版本**: v3.0
- **日期**: 2026-04-05
- **位置**: `./memory/`

### 13个核心模块
| 模块 | 文件 | 功能 |
|------|------|------|
| Signal | signal.ts | 事件信号机制 |
| State | state.ts | 全局状态管理 |
| AutoMode | autoMode.ts | LLM权限分类器 |
| TaskFramework | taskFramework.ts | 任务生命周期 |
| SessionCron | sessionCron.ts | 定时任务调度 |
| UpdateDoctor | updateDoctor.ts | 系统诊断更新 |
| SkillRegistry | skillRegistry.ts | Skill优先级覆盖 |
| ForkedAgent | forkedAgent.ts | 后台异步任务 |
| ExtractMemories | extractMemories.ts | 记忆自动提取 |
| SessionMemory | sessionMemoryEnhanced.ts | 会话持久化 |
| AutoDream | autoDream.ts | 自动反思 |
| GrowthBook | growthBook.ts | AB测试 |
| ToolSandbox | toolSandbox.ts | 工具沙箱 |
| **Orchestrator** | orchestrator.ts | **统一协调器** |

### 三层防护
1. **记忆层** - 四种类型分类、自动提取、会话持久化
2. **验证层** - 去重检查、Trust Level、记忆验证
3. **执行层** - 沙箱隔离、权限分类、路径过滤

## 核心记忆架构

### 用户AI记忆系统架构（来自用户提供的架构图）

用户正在构建一个完整的AI记忆系统，包含四层架构：

#### ① 实时写入层（Real-time Write Layer）
- **功能**: memory buffers（记忆缓冲区）、cron jobs（定时任务）
- **说明**: 实时捕捉和写入短期记忆

#### ② 定时处理层（Scheduled Processing Layer）
- **功能**: 定时任务如 memory snapshots（记忆快照）
- **说明**: 定期将短期记忆转化为长期记忆

#### ③ 召回与检索层（Recall & Retrieval Layer）
- **功能**: memory search（记忆搜索）、Qdrant（向量数据库）
- **说明**: 高效检索已存储的记忆

#### ④ 知识图谱层（Knowledge Graph Layer）
- **功能**: entity profiles（实体画像）、confidence metrics（置信度指标）
- **说明**: 结构化知识管理和置信度评估

## 用户偏好与习惯
- 喜欢用中文沟通
- 使用飞书平台
- 注重长期记忆系统的建立
- 对AI系统架构和记忆系统设计有浓厚兴趣

## 技术环境
- OpenClaw 运行在 Linux 服务器
- 使用MiniMax-M2.7模型
- 工作空间：/home/openclaw/.openclaw/workspace

## OpenClaw核心知识（来自橙皮书）

### 关键数据
- GitHub Stars: 278,932（全球第一，超越React）
- 支持渠道: 20+
- 内置Skills: 55个
- ClawHub Skills: 13,729个（但50%+是垃圾/恶意）

### 三层架构
- Gateway（中央控制）→ Node（设备执行）→ Channel（消息渠道）

### 四层记忆系统
- SOUL（永久不可变人格）→ TOOLS（Skills按需加载）→ USER（持久化语义记忆）→ Session（实时上下文）

### 安全警示 ⚠️
1. CVE-2026-25253 RCE漏洞（CVSS 8.8/10）- 已修复
2. ClawHavoc供应链攻击 - ClawHub约20%的Skills是恶意的
3. Prompt injection没有完全解决方案
4. Gateway认证必须设置（v2026.3.7强制要求）

### 成本控制 💰
- Token消耗是普通聊天的几十到上百倍
- 三级Fallback链：Sonnet → Haiku → DeepSeek可降低成本80-95%
- 必须设置预算限额

### 推荐模型方案
| 场景 | 首选 | 备选 | 心跳 |
|------|------|------|------|
| 复杂任务 | Claude Sonnet 4.6 | — | — |
| 日常对话 | DeepSeek-V3 ($0.14/M) | GLM-5 | GLM-4.7-Flash(免费) |
| 代码任务 | MiniMax-M2.7 | Qwen3-Coder | — |
| 复杂推理 | DeepSeek-R1 | o3 | — |
| 长文档 | Gemini 3.1 Pro (1M上下文) | DeepSeek-V4 | — |

### 橙皮书核心架构（深度理解）
**三层架构**：Gateway(控制平面) → Node(设备执行) → Channel(消息渠道)
**四层记忆**：SOUL(永久) → TOOLS(按需) → USER(持久化) → Session(实时)
**设计哲学**：4个核心工具(Read/Write/Edit/Bash)、CLI连接世界、自我扩展
**反MCP立场**：「MCP是垃圾，不能scale，CLI才是终极接口」

## 自我升级记录

### v2.1 (2026-04-05) - 记忆系统正式运行
- ✅ 贯通Phase 1-4
- ✅ 统一核心引擎v2.ts
- ✅ 记忆永不丢失保障
- ✅ 用户画像建立
- ✅ 记忆系统正式投入运行

### 第一次升级 (2026-04-05) - 橙皮书
根据橙皮书深度学习后执行：
- ✅ SOUL.md：新增安全意识和成本意识模块
- ✅ AGENTS.md：新增OpenClaw哲学、安全准则、成本控制章节
- ✅ MEMORY.md：补充OpenClaw核心知识体系

### 第二次升级 v1.1 (2026-04-05) - 蓝皮书
根据蓝皮书深度学习后执行：
- ✅ SOUL.md：新增SOUL.md安全模板和怀疑信号识别
- ✅ AGENTS.md：新增HEARTBEAT.md模板、SOUL.md安全边界、推荐心跳模型
- ✅ MEMORY.md：新增推荐模型方案（复杂推理/长文档）、蓝皮书20个赚钱案例、安全警示

### 第三次升级 v1.2 (2026-04-05) - 蓝皮书查漏补缺
根据蓝皮书深度阅读查漏补缺：
- ✅ AGENTS.md：新增强烈推荐做法（渐进权限/测试沙盒/ROI记录）、反模式7条、50条踩坑精选
- ✅ MEMORY.md：新增多Agent系统架构、Skills开发规范、10大行业方案、OpenClaw+Claude Code组合

### 第四次升级 v1.3 (2026-04-05) - 橙皮书深度理解
再次深度阅读橙皮书，深刻理解OpenClaw使用机制：
- ✅ MEMORY.md：新增核心架构(Gateway-Node-Channel)、设计哲学(4工具/CLI/自我扩展)、安全深层理解、成本控制深层策略、Skills三层优先级

## 对话历史摘要
- 2026-04-05: 首次对话，完成了OpenClaw配置、MiniMax-M2.7模型切换、Gateway启动等设置
- 用户分享了AI记忆系统架构图，期待建立长期记忆系统
- 深度阅读橙皮书，完成第一次自我升级
- 深度阅读蓝皮书，完成第二次v1.1版本升级（新增SOUL安全模板、HEARTBEAT模板、赚钱案例）
- 深度阅读蓝皮书查漏，完成v1.2升级
- 再次深度阅读橙皮书，完成v1.3升级
- 阅读Claude Code源码升级包，深度分析记忆系统设计
- 完成记忆系统v2.0升级（Phase 1-4）
- **完成记忆系统v2.1升级，贯通Phase 1-4，正式运行**
- 用户身份确认：鑫鑫淼，A股职业交易者
