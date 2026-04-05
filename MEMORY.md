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

## 自我升级记录

### 第一次升级 (2026-04-05)
根据橙皮书深度学习后执行：
- ✅ SOUL.md：新增安全意识和成本意识模块
- ✅ AGENTS.md：新增OpenClaw哲学、安全准则、成本控制章节
- ✅ MEMORY.md：补充OpenClaw核心知识体系

### 升级原则
- 安全第一：外部代码执行前必须确认
- 成本意识：简洁回答，避免循环推理
- 持续学习：每次深度阅读后更新自我

## 对话历史摘要
- 2026-04-05: 首次对话，完成了OpenClaw配置、MiniMax-M2.7模型切换、Gateway启动等设置
- 用户分享了AI记忆系统架构图，期待建立长期记忆系统
- 深度阅读橙皮书，完成第一次自我升级
