/**
 * Memory System v2.0 - Tool Permissions
 * 
 * 记忆提取工具权限控制
 * 参考: Claude Code extractMemories/extractMemories.ts createAutoMemCanUseTool
 */

/**
 * 工具类型
 */
type ToolName = 'Read' | 'Edit' | 'Write' | 'Bash' | 'Grep' | 'Glob' | 'Other'

/**
 * 工具调用输入
 */
interface ToolInput {
  command?: string
  file_path?: string
  path?: string
  pattern?: string
  [key: string]: unknown
}

/**
 * 权限决策
 */
export interface PermissionDecision {
  behavior: 'allow' | 'deny'
  message?: string
  reason?: string
}

/**
 * 只读bash命令列表
 */
const READONLY_BASH_COMMANDS = new Set([
  'ls', 'find', 'grep', 'cat', 'stat', 'wc', 'head', 'tail', 
  'pwd', 'cd', 'dir', 'echo', 'which', 'whoami', 'date', 'cal',
  'df', 'du', 'free', 'uname', 'hostname', 'arch'
])

/**
 * 检查bash命令是否为只读
 */
function isReadOnlyBashCommand(command: string): boolean {
  // 提取第一个单词（命令）
  const cmd = command.trim().split(/\s+/)[0]?.toLowerCase()
  
  // 检查是否有危险的管道或重定向
  if (command.includes('|') || command.includes('>') || command.includes(';')) {
    // 如果有管道或重定向，检查所有部分
    const parts = command.split(/[|;]/)
    return parts.every(part => {
      const baseCmd = part.trim().split(/\s+/)[0]?.toLowerCase()
      return READONLY_BASH_COMMANDS.has(baseCmd)
    })
  }
  
  return cmd ? READONLY_BASH_COMMANDS.has(cmd) : false
}

/**
 * 识别工具名称
 */
function identifyTool(tool: { name?: string; type?: string }): ToolName {
  if (!tool.name) return 'Other'
  
  const name = tool.name.toLowerCase()
  
  if (name.includes('read') || name.includes('file_read')) return 'Read'
  if (name.includes('edit') || name.includes('file_edit')) return 'Edit'
  if (name.includes('write') || name.includes('file_write')) return 'Write'
  if (name.includes('bash') || name.includes('shell') || name.includes('exec')) return 'Bash'
  if (name.includes('grep')) return 'Grep'
  if (name.includes('glob')) return 'Glob'
  
  return 'Other'
}

/**
 * 创建记忆文件工具权限检查器
 */
export function createMemoryFileCanUseTool(
  memoryDir: string,
  options?: {
    allowBash?: boolean
    allowEdit?: boolean
    allowDelete?: boolean
  }
): (tool: { name?: string; inputSchema?: unknown }, input: ToolInput) => PermissionDecision {
  const allowBash = options?.allowBash ?? true
  const allowEdit = options?.allowEdit ?? true
  const allowDelete = options?.allowDelete ?? false

  return (
    tool: { name?: string; inputSchema?: unknown },
    input: ToolInput
  ): PermissionDecision => {
    const toolName = identifyTool(tool)

    // 允许 Read/Grep/Glob
    if (toolName === 'Read' || toolName === 'Grep' || toolName === 'Glob') {
      return { behavior: 'allow' }
    }

    // 允许只读Bash命令
    if (toolName === 'Bash') {
      if (!allowBash) {
        return {
          behavior: 'deny',
          message: 'Bash commands are not permitted in this context',
          reason: 'bash_disabled'
        }
      }

      const command = typeof input.command === 'string' ? input.command : ''
      if (isReadOnlyBashCommand(command)) {
        return { behavior: 'allow' }
      }

      return {
        behavior: 'deny',
        message: 'Only read-only shell commands are permitted (ls, find, grep, cat, stat, wc, head, tail, and similar)',
        reason: 'bash_not_readonly'
      }
    }

    // 允许 Edit/Write（仅限记忆目录）
    if (toolName === 'Edit' || toolName === 'Write') {
      if (!allowEdit) {
        return {
          behavior: 'deny',
          message: 'File editing is not permitted in this context',
          reason: 'edit_disabled'
        }
      }

      const filePath = input.file_path || input.path
      if (typeof filePath !== 'string') {
        return {
          behavior: 'deny',
          message: 'Invalid file path',
          reason: 'invalid_path'
        }
      }

      // 检查是否在记忆目录
      if (!filePath.startsWith(memoryDir)) {
        return {
          behavior: 'deny',
          message: `Only files inside ${memoryDir} are allowed`,
          reason: 'path_outside_memory'
        }
      }

      // 检查是否为.md文件
      if (!filePath.endsWith('.md')) {
        return {
          behavior: 'deny',
          message: 'Only .md files are allowed',
          reason: 'not_markdown'
        }
      }

      return { behavior: 'allow' }
    }

    // 拒绝其他工具
    return {
      behavior: 'deny',
      message: `Tool ${toolName} is not permitted in this context`,
      reason: 'tool_not_allowed'
    }
  }
}

/**
 * 创建标准的记忆提取权限检查器
 */
export function createStandardMemoryToolChecker(memoryDir: string): 
  (tool: { name?: string; inputSchema?: unknown }, input: ToolInput) => PermissionDecision {
  return createMemoryFileCanUseTool(memoryDir, {
    allowBash: true,
    allowEdit: true,
    allowDelete: false
  })
}

/**
 * 创建会话记忆权限检查器
 */
export function createSessionMemoryToolChecker(sessionMemoryPath: string): 
  (tool: { name?: string; inputSchema?: unknown }, input: ToolInput) => PermissionDecision {
  return (
    tool: { name?: string; inputSchema?: unknown },
    input: ToolInput
  ): PermissionDecision => {
    const toolName = identifyTool(tool)

    // 只允许Edit
    if (toolName === 'Edit') {
      const filePath = input.file_path || input.path
      if (typeof filePath === 'string' && filePath === sessionMemoryPath) {
        return { behavior: 'allow' }
      }
      return {
        behavior: 'deny',
        message: `Only Edit on ${sessionMemoryPath} is allowed`,
        reason: 'path_mismatch'
      }
    }

    return {
      behavior: 'deny',
      message: `Only Edit is permitted, and only on ${sessionMemoryPath}`,
      reason: 'tool_not_allowed'
    }
  }
}

/**
 * 检查是否有写入权限
 */
export function canWriteMemory(
  filePath: string,
  memoryDir: string
): boolean {
  return (
    filePath.startsWith(memoryDir) &&
    filePath.endsWith('.md')
  )
}

/**
 * 检查是否为只读路径
 */
export function isReadOnlyPath(path: string, memoryDir: string): boolean {
  return path.startsWith(memoryDir)
}
