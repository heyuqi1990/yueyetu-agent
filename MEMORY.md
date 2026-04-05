# MEMORY.md - 长期记忆库

## 用户信息
- **ID**: ou_9f7135d548ad8e7d6286b840a3c8541b
- **平台**: 飞书 (Feishu)
- **时区**: Asia/Shanghai (GMT+8)
- **语言**: 中文

## 核心记忆架构（2026-04-05建立）

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

### 重要标识
- ~~**抖音号**: Dawn178~~ （已删除，不需要记录）

## 用户偏好与习惯
- 喜欢用中文沟通
- 使用飞书平台
- 对AI系统架构和记忆系统设计有浓厚兴趣
- 使用OpenClaw作为AI助手

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

### 成本控制深层策略（橙皮书）
- **Token消耗**：可能是普通聊天的几十到上百倍
- **三级Fallback**：Sonnet → Haiku → DeepSeek，可降成本80-95%
- **预算上限**：必须设置maxCostPerDay/maxTokensPerDay
- **真实案例**：一觉醒来$1,100账单（Agent循环推理）

### 蓝皮书核心案例（20个赚钱案例精选）
1. **Polymarket套利**：单账户累计$1.7M，单周最高$115K
2. **ClawWork项目**：11小时完成$15,000项目
3. **AI服务代理**：50+项目累计$600K，利润率90%+
4. **内容营销矩阵**：月入$3,200，API成本仅$30/月
5. **个人知识库SaaS**：月收入$3,600

### 蓝皮书安全警示
1. **ClawHavoc供应链攻击**：SOUL.md被污染，安全边界失效
2. **CVE-2026-25253**：RCE漏洞，CVSS 8.8/10
3. **Prompt injection**：无法完全解决，保持警惕
4. **创始人Peter忠告**：「This is all vibe code」

### 蓝皮书多Agent系统
- 三种架构：并行（任务分解）、顺序（流水线）、层级（主从协调）
- 每Agent独立workspace + 工具权限隔离
- 绑定规则：peer > guildId > teamId > accountId > channel > default
- 通信机制：共享内存 + 摘要传递（避免上下文爆炸）

### 蓝皮书Skills开发规范
- 技能目录：skills/name/（name只允许小写字母、数字、连字符）
- 唯一必需文件：SKILL.md（YAML frontmatter + 使用说明）
- 渐进式披露：启动时只加载name和description，激活时加载完整内容
- 发布流程：openclaw skill validate → openclaw skill publish

### Skills三层优先级（橙皮书）
```
最高：<workspace>/skills/  (项目级，覆盖内置)
中：~/.openclaw/skills/    (用户级全局生效)
最低：bundled skills        (内置55个)
```

### 蓝皮书10大行业方案
1. 内容创作（自媒体内容工厂）
2. 法律（智能法律助手）
3. 电商（全链路电商Agent）
4. 教育（个性化AI教师）
5. 金融（量化投资辅助）
6. 人力资源（AI招聘助手）
7. 医疗健康（健康管理）
8. 房产（AI置业顾问）
9. 制造业（供应链管理）
10. 政务（政务服务AI）

### 蓝皮书OpenClaw+Claude Code黄金组合
- 定位：OpenClaw管生活/业务，Claude Code管代码
- 协作方式：CLI后端机制 + 共享文件系统
- 加速比：8-15倍（代码任务）

## 自我升级记录

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

### 升级原则
- 安全第一：外部代码执行前必须确认
- 成本意识：简洁回答，避免循环推理
- 持续学习：每次深度阅读后更新自我

## 对话历史摘要
- 2026-04-05: 首次对话，完成了OpenClaw配置、MiniMax-M2.7模型切换、Gateway启动等设置
- 用户分享了AI记忆系统架构图，期待建立长期记忆系统
- 深度阅读橙皮书，完成第一次自我升级
- 深度阅读蓝皮书，完成第二次v1.1版本升级（新增SOUL安全模板、HEARTBEAT模板、赚钱案例）
