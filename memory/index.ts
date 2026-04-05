/**
 * Memory System v2.1 - Unified API
 * 
 * 统一的记忆系统导出接口
 * 整合所有Phase模块，实现记忆永不丢失
 */

// ============================================================================
// 核心引擎（v2.ts）
// ============================================================================

export {
  // 核心功能
  initialize,
  saveMemory,
  updateMemory,
  deleteMemory,
  readMemory,
  scanAllMemories,
  getMemoriesByType,
  
  // 提取与压缩
  checkShouldExtract,
  executeExtraction,
  executeCompaction,
  
  // 备份与恢复
  restoreBackup,
  
  // 状态管理
  getSystemStatus,
  resetSystem,
  configure,
  
  // 类型
  type MemoryHeader,
  type MemoryContent,
  type MemoryEntry
} from './v2'

// ============================================================================
// 记忆类型（memoryTypes.ts）
// ============================================================================

export {
  MEMORY_TYPES,
  parseMemoryType,
  type MemoryType
} from './memoryTypes'

import { MEMORY_TYPES, parseMemoryType, type MemoryType } from './memoryTypes'

// ============================================================================
// 提取提示（extractPrompt.ts）
// ============================================================================

export {
  buildExtractPrompt,
  buildAccessPrompt,
  buildExplicitSavePrompt,
  buildForgetPrompt
} from './extractPrompt'

// ============================================================================
// 自动提取（autoExtract.ts）
// ============================================================================

export {
  shouldExtract,
  markExtractionComplete,
  createExtractionResult,
  createExtractionError,
  getStats,
  resetStats,
  setExtractConfig,
  getExtractConfig,
  type ExtractConfig,
  type ExtractionResult,
  type ExtractionStats
} from './autoExtract'

// ============================================================================
// Session记忆（sessionMemory.ts）
// ============================================================================

export {
  shouldExtractMemory,
  setupSessionMemoryFile,
  getSessionMemoryTemplate,
  buildSessionMemoryUpdatePrompt,
  createSessionMemoryToolCheckerForUpdate,
  getSessionMemoryPath,
  getSessionMemoryDir,
  setSessionMemoryConfig,
  getSessionMemoryConfig,
  resetSessionMemory,
  markInitialized,
  isSessionMemoryInitialized,
  recordExtractionTokenCount,
  setLastExtractionMessageId,
  getLastExtractionMessageId,
  type SessionMemoryConfig
} from './sessionMemory'

// ============================================================================
// 压缩（compact.ts）
// ============================================================================

export {
  setMemoryCompactConfig,
  getMemoryCompactConfig,
  calculateMessagesToKeepIndex,
  createCompactBoundaryMessage,
  buildPostCompactMessages,
  truncateSessionMemoryForCompact,
  createCompactionResultFromSessionMemory,
  isCompactBoundaryMessage,
  type MemoryCompactConfig,
  type CompactionResult
} from './compact'

// ============================================================================
// 去重（dedup.ts）
// ============================================================================

export {
  checkDuplicate,
  checkDuplicateWithScan,
  generateDuplicateAdvice,
  scanAllMemoryEntries,
  type MemoryEntry as DedupMemoryEntry,
  type SimilarityResult
} from './dedup'

// ============================================================================
// 验证（verify.ts）
// ============================================================================

export {
  validateFrontmatter,
  verifyFileExists,
  verifyReferencedPaths,
  checkStaleness,
  assessTrustLevel,
  buildVerificationReport,
  getPostVerificationAdvice,
  type VerificationResult,
  type VerificationIssue,
  type TrustLevel
} from './verify'

// ============================================================================
// Token优化（tokenOptimizer.ts）
// ============================================================================

export {
  estimateTokens,
  analyzeMemoryTokens,
  generateOptimizationSuggestions,
  applyOptimization,
  calculateCompressionRate,
  getMemorySizeCategory,
  getSizeCategoryDescription,
  batchAnalyzeMemories,
  getTokenBudgetAdvice,
  type TokenStats,
  type OptimizationSuggestion,
  type MemorySizeCategory
} from './tokenOptimizer'

// ============================================================================
// 工具权限（toolPermissions.ts）
// ============================================================================

export {
  createStandardMemoryToolChecker,
  createSessionMemoryToolChecker,
  canWriteMemory,
  isReadOnlyPath,
  type PermissionDecision
} from './toolPermissions'

// ============================================================================
// 扫描（memoryScan.ts）
// ============================================================================

export {
  scanMemoryFiles,
  formatMemoryManifest,
  groupMemoriesByType,
  findDuplicateMemories,
  type MemoryHeader as ScanMemoryHeader
} from './memoryScan'

// ============================================================================
// 常量
// ============================================================================

export const VERSION = '2.1'
export const MEMORY_DIR = '~/.openclaw/memory'
export const BACKUP_DIR = 'backups'
