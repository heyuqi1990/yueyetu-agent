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
// 信号系统（signal.ts）
// ============================================================================

export {
  createSignal,
  createOneTimeSignal,
  createDebouncedSignal,
  isSignal,
  sessionSwitched,
  memoryExtracted,
  memorySaved,
  memoryDeleted,
  compactionStarted,
  compactionCompleted,
  systemInitialized,
  errorOccurred,
  configUpdated,
  SignalManager,
  globalSignalManager,
  type Signal
} from './signal'

// ============================================================================
// 状态管理（state.ts）
// ============================================================================

export {
  initializeState,
  getState,
  isInitialized,
  getSessionId,
  getSessionMessageCount,
  incrementSessionMessageCount,
  getTotalMemories,
  getMemoryCountByType,
  getTotalTokens,
  getExtractionStats,
  getCompactionStats,
  getInvokedSkills,
  isSkillInvoked,
  setMemoryStats,
  setTotalTokens,
  recordExtraction,
  recordCompaction,
  addSessionCronTask,
  removeSessionCronTask,
  getSessionCronTasks,
  addInvokedSkill,
  setBetaModeLatched,
  getBetaModeLatched,
  updateExtractConfig,
  updateSessionConfig,
  getConfig,
  onStateChange,
  watch,
  resetState,
  createNewSession,
  type ModelUsage,
  type SessionCronTask,
  type InvokedSkillInfo,
  type MemorySystemState
} from './state'

// ============================================================================
// Auto Mode（autoMode.ts）
// ============================================================================

export {
  AutoMode,
  getAutoMode,
  initializeAutoMode,
  enableAutoMode,
  disableAutoMode,
  checkPermission,
  critiqueRules,
  createPermissionChecker,
  needsConfirmation,
  isAllowed,
  isDenied,
  type PermissionDecision,
  type ToolUseContext,
  type AutoModeRule,
  type AutoModeConfig,
  type PermissionRequestResult,
  type ClassifierResult,
  type LLMClassifier
} from './autoMode'

// ============================================================================
// Task Framework（taskFramework.ts）
// ============================================================================

export {
  registerTask,
  updateTaskState,
  completeTask,
  failTask,
  killTask,
  notifyTask,
  getTask,
  getAllTasks,
  getRunningTasks,
  getTerminalTasks,
  isInGracePeriod,
  shouldEvict,
  addTaskOutput,
  getTaskOutput,
  getTaskOutputDelta,
  clearTaskOutput,
  pollTasks,
  startTaskPolling,
  stopTaskPolling,
  generateTaskAttachments,
  onTaskStarted,
  onTaskCompleted,
  onTaskFailed,
  onTaskKilled,
  onTaskEvicted,
  onTaskOutput,
  onTaskStatusChanged,
  generateTaskId,
  getTaskStats,
  resetAllTasks,
  removeTask,
  isTerminalStatus,
  getTaskDuration,
  formatTask,
  PANEL_GRACE_MS,
  type TaskStatus,
  type TaskType,
  type Task,
  type TaskAttachment,
  type TaskStateChange,
  type RegisterTaskOptions,
  type TaskOutput
} from './taskFramework'

// ============================================================================
// Session Cron（sessionCron.ts）
// ============================================================================

export {
  registerCronTask,
  removeCronTask,
  enableCronTask,
  pauseCronTask,
  updateCronTask,
  startCronScheduler,
  stopCronScheduler,
  isCronSchedulerRunning,
  getAllCronTasks,
  getRunningCronTasks,
  getPendingCronTasks,
  getCronTask,
  getUpcomingCronTasks,
  getCronTaskStats,
  everyMinutes,
  hourly,
  daily,
  weekly,
  once,
  parseCron,
  isValidCron,
  getNextRunTime,
  formatNextRun,
  describeCron,
  exportCronTasks,
  importCronTasks,
  clearAllCronTasks,
  type CronTaskConfig,
  type CronTaskInstance,
  type CronExecutionResult,
  type CronTaskEvent
} from './sessionCron'

// ============================================================================
// 常量
// ============================================================================

// ============================================================================
// Update & Doctor（updateDoctor.ts）
// ============================================================================

export {
  detectInstallationType,
  getCurrentVersion,
  getLatestVersion,
  runDiagnostics,
  formatDiagnostics,
  checkForUpdate,
  performUpdate,
  generateFixCommands,
  diagnosticsCompleted,
  updateAvailable,
  type InstallationType,
  type DiagnosticCheck,
  type DiagnosticResult,
  type UpdateResult
} from './updateDoctor'

// ============================================================================
// Skill Registry（skillRegistry.ts）
// ============================================================================

export {
  scanAndRegisterSkills,
  registerSkill,
  unregisterSkill,
  addOverride,
  removeOverride,
  disableSkill,
  enableSkill,
  getEnabledSkills,
  getAllSkills,
  getSkill,
  getDisabledSkills,
  getSkillsBySource,
  getOverride,
  getAllOverrides,
  getSkillsGrouped,
  getEffectiveSkill,
  exportOverrides,
  importOverrides,
  clearAllOverrides,
  searchSkills,
  onRegistryChanged,
  createDisableOverride,
  createPriorityOverride,
  formatSkill,
  formatGroupedSkills,
  type SkillSource,
  type SkillOverride,
  type SkillDefinition,
  type SkillRegistryData,
  type SkillGroup
} from './skillRegistry'

// ============================================================================
// Forked Agent（forkedAgent.ts）
// ============================================================================

export {
  runForkedAgent,
  runForkedAgentWithProcess,
  killForkedAgent,
  getForkedAgent,
  getRunningForkedAgents,
  getQueueLength,
  killAllForkedAgents,
  getForkedAgentStats,
  onAgentStarted,
  onAgentCompleted,
  onAgentFailed,
  onAgentKilled,
  onAgentOutput,
  onQueueChanged,
  type ForkedAgentResult,
  type ForkedAgentOptions,
  type ForkedAgentInstance
} from './forkedAgent'

// ============================================================================
// Extract Memories（extractMemories.ts）
// ============================================================================

export {
  extractMemories,
  triggerManualExtraction,
  triggerAutoExtraction,
  shouldTriggerExtraction,
  getExtractionRules,
  addExtractionRule,
  updateExtractionRule,
  removeExtractionRule,
  resetExtractionRules,
  enableExtractionRule,
  getExtractMemoryStats,
  recordMessage,
  recordToolCall,
  onExtractionStarted,
  onExtractionCompleted,
  onExtractionFailed,
  onMemoryExtracted,
  onRuleMatched,
  type ExtractionContext,
  type TruncatedMessage,
  type ExtractionTrigger,
  type ExtractionRule,
  type ExtractionResult,
  type SavedMemory,
  type ExtractTriggerConfig
} from './extractMemories'

// ============================================================================
// Session Memory Enhanced（sessionMemoryEnhanced.ts）
// ============================================================================

export {
  initializeSessionMemory,
  addSessionEntry,
  removeSessionEntry,
  getSessionEntries,
  getSessionEntriesByType,
  getImportantEntries,
  searchSessionEntries,
  createSnapshot,
  saveSession,
  saveSessionTo,
  loadSessionFrom,
  addPendingExtraction,
  getPendingExtractions,
  clearPendingExtractions,
  markExtracted,
  updateSummary,
  getSummary,
  generateAutoSummary,
  getSessionMetadata,
  getSessionStats,
  getSessionMemoryConfig,
  updateSessionMemoryConfig,
  hasUnsavedChanges,
  clearSession,
  getCurrentSessionId,
  onEntryAdded,
  onEntryRemoved,
  onSessionLoaded,
  onSessionSaved,
  onSnapshotCreated,
  onSummaryUpdated,
  onMemoryOverflow,
  type SessionMemoryEntry,
  type SessionMemoryMetadata,
  type SessionSnapshot,
  type SessionMemoryConfig
} from './sessionMemoryEnhanced'

// ============================================================================
// AutoDream（autoDream.ts）
// ============================================================================

export {
  dream,
  startDreamScheduler,
  stopDreamScheduler,
  startIdleMonitor,
  stopIdleMonitor,
  touch,
  getIdleTimeMs,
  isIdle,
  canDream,
  saveInsightAsMemory,
  getDreamConfig,
  updateDreamConfig,
  enableDream,
  disableDream,
  getDreamState,
  resetDreamState,
  getDreamStats,
  formatLastDream,
  onDreamStarted,
  onDreamCompleted,
  onDreamFailed,
  onInsightGenerated,
  onIdleEntered,
  onIdleExited,
  type DreamConfig,
  type DreamResult,
  type DreamInsight,
  type DreamState
} from './autoDream'

// ============================================================================
// GrowthBook（growthBook.ts）
// ============================================================================

export {
  registerFeature,
  registerFeatures,
  getFeature,
  getAllFeatures,
  getFeatureValue,
  setFeatureOverride,
  removeFeatureOverride,
  clearAllOverrides,
  registerExperiment,
  registerExperiments,
  getExperiment,
  getAllExperiments,
  startExperiment,
  pauseExperiment,
  completeExperiment,
  getExperimentValue,
  registerBuiltInExperiments,
  exportExperiments,
  exportFeatures,
  importExperiments,
  importFeatures,
  isFeatureEnabled,
  getFeatureSource,
  onFeatureUpdated,
  onExperimentStarted,
  onExperimentCompleted,
  onExperimentOverridden,
  type FeatureValue,
  type Feature,
  type Experiment,
  type ExperimentResult,
  type UserAttributes
} from './growthBook'

// ============================================================================
// Tool Sandbox（toolSandbox.ts）
// ============================================================================

export {
  initializeSandbox,
  getToolPermission,
  setToolPermission,
  setToolPermissions,
  resetToDefaultPermissions,
  allowTool,
  denyTool,
  checkRateLimit,
  isPathAllowed,
  isDomainAllowed,
  canExecuteTool,
  recordToolCall,
  getCallHistory,
  getToolStats,
  getSandboxConfig,
  updateSandboxConfig,
  enableSandbox,
  disableSandbox,
  isSandboxEnabled,
  getDeniedTools,
  getConfirmationRequiredTools,
  clearCallHistory,
  formatSandboxStatus,
  onToolAllowed,
  onToolDenied,
  onToolRateLimited,
  onPolicyChanged,
  onSandboxViolation,
  type ToolCategory,
  type ToolPermission,
  type SandboxConfig,
  type ToolCallResult,
  type RateLimitEntry,
  type ToolCall
} from './toolSandbox'

// ============================================================================
// 月野兔 Orchestrator v3.0（orchestrator.ts）
// ============================================================================

export {
  月野兔,
  initialize,
  getStatus,
  addMemory,
  dream,
  runInBackground,
  type 月野兔Config,
  type 月野兔Status
} from './orchestrator'

// ============================================================================
// 常量
// ============================================================================

export const VERSION = '3.0'
export const MEMORY_DIR = '~/.openclaw/memory'
export const BACKUP_DIR = 'backups'
