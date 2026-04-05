# Memory System v2.0

> 基于 Claude Code 源码的 OpenClaw 记忆系统升级方案

## 架构概览

```
memory/
├── index.ts              # 核心模块
├── memoryTypes.ts        # 记忆类型定义
├── memoryScan.ts         # 记忆扫描工具
├── MEMORY_SYSTEM_PROMPT.md # 提示模板片段
├── MEMORY.md             # 索引入口
├── memory/               # 记忆文件存储
│   ├── user/
│   ├── feedback/
│   ├── project/
│   └── reference/
└── README.md            # 本文件
```

## 四种记忆类型

| 类型 | 说明 | 保存时机 |
|------|------|----------|
| **user** | 用户信息 | 了解到用户角色、偏好时 |
| **feedback** | 工作反馈 | 用户纠正或确认时 |
| **project** | 项目信息 | 了解项目进展时 |
| **reference** | 参考指针 | 发现外部资源时 |

## 核心API

```typescript
import { 
  saveMemory,      // 保存新记忆
  readMemory,      // 读取记忆
  updateMemory,    // 更新记忆
  deleteMemory,    // 删除记忆
  getAllMemories, // 获取所有记忆
  getMemoriesByType, // 按类型获取
  scanMemoryFiles, // 扫描记忆目录
} from './memory'
```

## 前置元数据格式

```markdown
---
name: memory_name
description: 一句话描述
type: user|feedback|project|reference
---

记忆内容
```

## 索引格式 (MEMORY.md)

```markdown
# Memory Index

## User
- [名称](user/file.md) — 描述

## Feedback
- [名称](feedback/file.md) — 描述
```

## 设计原则

1. **分类清晰**: 四种类型各有明确的保存时机
2. **索引与内容分离**: MEMORY.md只做索引入口
3. **去重检查**: 保存前检查是否已存在
4. **渐进式披露**: 按需加载记忆内容

## 参考源码

- Claude Code `memdir/memoryTypes.ts`
- Claude Code `memdir/memoryScan.ts`
- Claude Code `services/extractMemories/`
