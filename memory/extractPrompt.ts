/**
 * Memory System v2.0 - Extract Prompt Builder
 * 
 * 记忆提取提示生成器
 * 参考: Claude Code extractMemories/prompts.ts
 */

import { 
  TYPES_SECTION, 
  WHAT_NOT_TO_SAVE_SECTION,
  WHEN_TO_ACCESS_SECTION,
  TRUSTING_RECALL_SECTION,
  MEMORY_FRONTMATTER_EXAMPLE
} from './MEMORY_SYSTEM_PROMPT'

/**
 * 构建提取提示
 */
export function buildExtractPrompt(
  newMessageCount: number,
  existingMemories: string,
  options?: {
    skipIndex?: boolean
    memoryDir?: string
  }
): string {
  const skipIndex = options?.skipIndex ?? false
  const memoryDir = options?.memoryDir ?? './memory'

  const opener = buildOpener(newMessageCount, existingMemories)
  const typesSection = TYPES_SECTION.join('\n')
  const whatNotToSave = WHAT_NOT_TO_SAVE_SECTION.join('\n')
  const howToSave = buildHowToSaveSection(skipIndex, memoryDir)

  return [
    opener,
    '',
    typesSection,
    '',
    whatNotToSave,
    '',
    howToSave,
  ].join('\n')
}

/**
 * 构建开场白
 */
function buildOpener(newMessageCount: number, existingMemories: string): string {
  const existingSection = existingMemories.length > 0
    ? `\n\n## Existing memory files\n\n${existingMemories}\n\nCheck this list before writing — update an existing file rather than creating a duplicate.`
    : ''

  return [
    `You are now acting as the memory extraction subagent. Analyze the most recent ~${newMessageCount} messages above and use them to update your persistent memory systems.`,
    '',
    `Available tools: Read, Grep, Glob, and Edit/Write for paths inside the memory directory only.`,
    '',
    `You have a limited turn budget. The efficient strategy is: turn 1 — issue all Read calls in parallel for every file you might update; turn 2 — issue all Edit/Write calls in parallel. Do not interleave reads and writes across multiple turns.`,
    '',
    `You MUST only use content from the last ~${newMessageCount} messages to update your persistent memories. Do not waste any turns attempting to investigate or verify that content further — no grepping source files, no reading code to confirm a pattern exists.` + existingSection,
  ].join('\n')
}

/**
 * 构建如何保存部分
 */
function buildHowToSaveSection(skipIndex: boolean, memoryDir: string): string {
  const frontmatterExample = MEMORY_FRONTMATTER_EXAMPLE.join('\n')

  if (skipIndex) {
    return [
      '## How to save memories',
      '',
      'Write each memory to its own file (e.g., `user_role.md`, `feedback_testing.md`) using this frontmatter format:',
      '',
      frontmatterExample,
      '',
      '- Organize memory semantically by topic, not chronologically',
      '- Update or remove memories that turn out to be wrong or outdated',
      '- Do not write duplicate memories. First check if there is an existing memory you can update before writing a new one.',
    ].join('\n')
  }

  return [
    '## How to save memories',
    '',
    'Saving a memory is a two-step process:',
    '',
    '**Step 1** — write the memory to its own file (e.g., `user_role.md`, `feedback_testing.md`) using this frontmatter format:',
    '',
    frontmatterExample,
    '',
    '**Step 2** — add a pointer to that file in `MEMORY.md`. `MEMORY.md` is an index, not a memory — each entry should be one line, under ~150 characters: `- [Title](file.md) — one-line hook`. It has no frontmatter. Never write memory content directly into `MEMORY.md`.',
    '',
    '- `MEMORY.md` is always loaded into your system prompt — lines after 200 will be truncated, so keep the index concise',
    '- Organize memory semantically by topic, not chronologically',
    '- Update or remove memories that turn out to be wrong or outdated',
    '- Do not write duplicate memories. First check if there is an existing memory you can update before writing a new one.',
  ].join('\n')
}

/**
 * 构建访问提示
 */
export function buildAccessPrompt(): string {
  return [
    WHEN_TO_ACCESS_SECTION.join('\n'),
    '',
    TRUSTING_RECALL_SECTION.join('\n'),
  ].join('\n')
}

/**
 * 构建保存提示（用于用户明确要求保存时）
 */
export function buildExplicitSavePrompt(memoryType?: string): string {
  const typeHint = memoryType 
    ? `\n\nThe user requested to save as type: ${memoryType}`
    : ''

  return [
    `The user has explicitly asked you to save something to memory.${typeHint}`,
    '',
    'Save it immediately using the appropriate memory type.',
    '',
    'Use this frontmatter format:',
    MEMORY_FRONTMATTER_EXAMPLE.join('\n'),
  ].join('\n')
}

/**
 * 构建忘记提示（用于用户要求忘记时）
 */
export function buildForgetPrompt(): string {
  return [
    'The user has explicitly asked you to forget something.',
    '',
    'Find and remove the relevant entry from MEMORY.md and the corresponding memory file.',
    '',
    'Do not write any new memories — only remove.',
  ].join('\n')
}
