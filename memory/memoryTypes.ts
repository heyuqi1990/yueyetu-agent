/**
 * Memory System v2.0 - Memory Types
 * 
 * 四种记忆类型分类系统
 * 参考: Claude Code memoryTypes.ts
 */

export const MEMORY_TYPES = [
  'user',      // 用户信息：角色、目标、偏好
  'feedback',  // 反馈：纠正和确认
  'project',   // 项目：目标、进度、bug
  'reference'  // 参考：外部系统指针
] as const

export type MemoryType = (typeof MEMORY_TYPES)[number]

/**
 * 解析前置元数据中的type字段
 */
export function parseMemoryType(raw: unknown): MemoryType | undefined {
  if (typeof raw !== 'string') return undefined
  return MEMORY_TYPES.find(t => t === raw)
}

/**
 * 检查是否为有效的记忆类型
 */
export function isValidMemoryType(type: string): type is MemoryType {
  return MEMORY_TYPES.includes(type as MemoryType)
}

/**
 * 获取记忆类型的中文描述
 */
export function getMemoryTypeDescription(type: MemoryType): string {
  const descriptions: Record<MemoryType, string> = {
    user: '用户信息：包含用户的角色、目标、职责和知识',
    feedback: '反馈指导：用户给出的工作方式指导，包括要避免和要保持的做法',
    project: '项目信息：项目状态、目标、 initiatives、bug或事件',
    reference: '参考指针：外部系统中信息的存储位置'
  }
  return descriptions[type]
}

/**
 * 获取记忆类型的保存时机
 */
export function getMemoryTypeWhenToSave(type: MemoryType): string {
  const whenToSave: Record<MemoryType, string> = {
    user: '当了解到用户的角色、偏好、职责或知识时',
    feedback: '当用户纠正你的方法("不是这样")或确认非显而易见的做法有效时',
    project: '当了解到谁在做什么、为什么、或截止日期时',
    reference: '当了解到外部系统中的资源及其用途时'
  }
  return whenToSave[type]
}

/**
 * 获取记忆类型的作用域
 */
export function getMemoryTypeScope(type: MemoryType): 'private' | 'team' | 'either' {
  const scopes: Record<MemoryType, 'private' | 'team' | 'either'> = {
    user: 'private',      // 用户记忆永远是私有的
    feedback: 'either',   // 反馈可以是团队或私人的
    project: 'either',    // 项目可以是团队或私人的
    reference: 'team'    // 参考通常是团队的
  }
  return scopes[type]
}
