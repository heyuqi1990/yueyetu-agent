/**
 * Memory System v2.0 - System Prompt Fragments
 * 
 * 记忆系统提示模板片段
 * 参考: Claude Code memoryTypes.ts TYPES_SECTION
 */

/**
 * 记忆类型说明（用于系统提示）
 */
export const TYPES_SECTION: readonly string[] = [
  '## Types of memory',
  '',
  'There are several discrete types of memory that you can store in your memory system:',
  '',
  '<types>',
  '<type>',
  '    <name>user</name>',
  '    <description>Contain information about the user\'s role, goals, responsibilities, and knowledge. Great user memories help you tailor your future behavior to the user\'s preferences and perspective.</description>',
  '    <when_to_save>When you learn any details about the user\'s role, preferences, responsibilities, or knowledge</when_to_save>',
  '    <how_to_use>When your work should be informed by the user\'s profile or perspective.</how_to_use>',
  '    <examples>',
  "    user: I'm a stock trader focusing on A-share market",
  '    assistant: [saves user memory: user is a professional A-share trader, focuses on short-term leading stocks and rebound strategies]',
  '    </examples>',
  '</type>',
  '<type>',
  '    <name>feedback</name>',
  '    <description>Guidance the user has given you about how to approach work — both what to avoid and what to keep doing.</description>',
  '    <when_to_save>Any time the user corrects your approach or confirms a non-obvious approach worked.</when_to_save>',
  '    <how_to_use>Let these memories guide your behavior so that the user does not need to offer the same guidance twice.</how_to_use>',
  '    <body_structure>Lead with the rule itself, then a **Why:** line and a **How to apply:** line.</body_structure>',
  '    <examples>',
  "    user: don't use professional jargon, explain in plain Chinese",
  '    assistant: [saves feedback memory: user prefers plain language explanations, no professional jargon]',
  '    </examples>',
  '</type>',
  '<type>',
  '    <name>project</name>',
  '    <description>Information that you learn about ongoing work, goals, initiatives, bugs, or incidents within the project.</description>',
  '    <when_to_save>When you learn who is doing what, why, or by when.</when_to_save>',
  '    <how_to_use>Use these memories to more fully understand the details and nuance behind the user\'s request.</how_to_use>',
  '    <body_structure>Lead with the fact or decision, then a **Why:** line and a **How to apply:** line.</body_structure>',
  '    <examples>',
  "    user: we're working on the memory system upgrade",
  '    assistant: [saves project memory: current project is memory system v2.0, goal is to implement automatic memory extraction]',
  '    </examples>',
  '</type>',
  '<type>',
  '    <name>reference</name>',
  '    <description>Stores pointers to where information can be found in external systems.</description>',
  '    <when_to_save>When you learn about resources in external systems and their purpose.</when_to_save>',
  '    <how_to_use>When the user references an external system or information that may be in an external system.</how_to_use>',
  '    <examples>',
  '    user: check the configuration file at ~/.openclaw/openclaw.json',
  '    assistant: [saves reference memory: OpenClaw config file is at ~/.openclaw/openclaw.json]',
  '    </examples>',
  '</type>',
  '</types>',
  '',
]

/**
 * 不应保存的内容（用于系统提示）
 */
export const WHAT_NOT_TO_SAVE_SECTION: readonly string[] = [
  '## What NOT to save in memory',
  '',
  '- Code patterns, conventions, architecture — these can be derived by reading the current project state.',
  '- Git history or who-changed-what — use `git log` / `git blame` instead.',
  '- Debugging solutions or fix recipes — the fix is in the code.',
  '- Anything already documented in SOUL.md or AGENTS.md.',
  '- Ephemeral task details: in-progress work, temporary state, current conversation context.',
  '',
  'These exclusions apply even when the user explicitly asks you to save.',
]

/**
 * 何时访问记忆（用于系统提示）
 */
export const WHEN_TO_ACCESS_SECTION: readonly string[] = [
  '## When to access memories',
  '- When memories seem relevant, or the user references prior-conversation work.',
  '- You MUST access memory when the user explicitly asks you to check, recall, or remember.',
  '- If the user says to *ignore* or *not use* memory: proceed as if MEMORY.md were empty.',
  '- Memory records can become stale. Verify that the memory is still correct before acting on it.',
]

/**
 * 信任记忆（用于系统提示）
 */
export const TRUSTING_RECALL_SECTION: readonly string[] = [
  '## Before recommending from memory',
  '',
  'A memory that names a specific file, function, or setting is a claim that it existed *when the memory was written*. It may have been changed. Before recommending:',
  '',
  '- If the memory names a file path: check the file exists.',
  '- If the memory names a function or flag: grep for it.',
  '- If the user is about to act on your recommendation, verify first.',
  '',
  '"The memory says X exists" is not the same as "X exists now."',
]

/**
 * 前置元数据格式示例
 */
export const MEMORY_FRONTMATTER_EXAMPLE: readonly string[] = [
  '```markdown',
  '---',
  'name: {{memory name}}',
  'description: {{one-line description — used to decide relevance}}',
  'type: {{user, feedback, project, or reference}}',
  '---',
  '',
  '{{memory content}}',
  '```',
]
