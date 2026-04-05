/**
 * GrowthBook v2.3 - AB测试与特征开关系统
 * 
 * 源自Claude Code的GrowthBook设计
 * 支持特征开关、AB测试、实验分组
 */

import { createSignal } from './signal'

// ============================================================================
// 类型定义
// ============================================================================

export interface FeatureValue {
  value: any
  source: 'default' | 'override' | 'experiment'
  reason?: string
}

export interface Feature {
  key: string
  defaultValue: any
  description?: string
  tags?: string[]
  enabled?: boolean
}

export interface Experiment {
  key: string
  variations: { [key: string]: any }  // variation -> value
  weights?: { [key: string]: number } // variation -> weight
  status: 'draft' | 'running' | 'paused' | 'completed'
  bucketAttribute?: string            // 分桶属性，默认userId
  ranges?: [number, number][]         // 各variation的bucket范围
  coverage?: number                   // 覆盖比例 0-1
  force?: { [key: string]: any }      // 强制值
}

export interface ExperimentResult {
  experimentKey: string
  variation: string
  value: any
  bucket: number
  inExperiment: boolean
}

export interface UserAttributes {
  [key: string]: string | number | boolean
}

// ============================================================================
// 存储
// ============================================================================

const features = new Map<string, Feature>()
const experiments = new Map<string, Experiment>()
const overrides = new Map<string, any>()
const experimentAssignments = new Map<string, ExperimentResult>()

// 信号
const featureUpdated = createSignal<[key: string, value: any]>()
const experimentStarted = createSignal<[key: string]>()
const experimentCompleted = createSignal<[key: string, result: ExperimentResult]>()
const experimentOverridden = createSignal<[key: string, variation: string]>()

// ============================================================================
// 特性管理
// ============================================================================

/**
 * 注册特性
 */
export function registerFeature(feature: Feature): void {
  features.set(feature.key, feature)
}

/**
 * 批量注册特性
 */
export function registerFeatures(newFeatures: Feature[]): void {
  for (const feature of newFeatures) {
    registerFeature(feature)
  }
}

/**
 * 获取特性
 */
export function getFeature(key: string): Feature | undefined {
  return features.get(key)
}

/**
 * 获取所有特性
 */
export function getAllFeatures(): Feature[] {
  return Array.from(features.values())
}

/**
 * 获取特性值
 */
export function getFeatureValue(
  key: string, 
  userAttributes?: UserAttributes,
  defaultValue?: any
): FeatureValue {
  // 1. 检查覆盖
  if (overrides.has(key)) {
    return {
      value: overrides.get(key),
      source: 'override',
      reason: 'User override'
    }
  }

  // 2. 检查特性是否存在
  const feature = features.get(key)
  if (!feature) {
    return {
      value: defaultValue ?? null,
      source: 'default',
      reason: 'Feature not found'
    }
  }

  // 3. 检查实验
  const experiment = experiments.get(key)
  if (experiment && experiment.status === 'running' && userAttributes) {
    const result = getExperimentValue(key, userAttributes)
    if (result.inExperiment) {
      return {
        value: result.value,
        source: 'experiment',
        reason: `Experiment: ${result.variation}`
      }
    }
  }

  // 4. 返回默认值
  return {
    value: feature.defaultValue,
    source: 'default',
    reason: 'Default value'
  }
}

/**
 * 设置特性覆盖
 */
export function setFeatureOverride(key: string, value: any): void {
  overrides.set(key, value)
  featureUpdated.emit(key, value)
}

/**
 * 移除特性覆盖
 */
export function removeFeatureOverride(key: string): boolean {
  const result = overrides.delete(key)
  if (result) {
    const feature = features.get(key)
    if (feature) {
      featureUpdated.emit(key, feature.defaultValue)
    }
  }
  return result
}

/**
 * 清除所有覆盖
 */
export function clearAllOverrides(): void {
  overrides.clear()
}

// ============================================================================
// 实验管理
// ============================================================================

/**
 * 注册实验
 */
export function registerExperiment(experiment: Experiment): void {
  experiments.set(experiment.key, experiment)
}

/**
 * 批量注册实验
 */
export function registerExperiments(newExperiments: Experiment[]): void {
  for (const exp of newExperiments) {
    registerExperiment(exp)
  }
}

/**
 * 获取实验
 */
export function getExperiment(key: string): Experiment | undefined {
  return experiments.get(key)
}

/**
 * 获取所有实验
 */
export function getAllExperiments(): Experiment[] {
  return Array.from(experiments.values())
}

/**
 * 启动实验
 */
export function startExperiment(key: string): boolean {
  const exp = experiments.get(key)
  if (!exp) return false
  exp.status = 'running'
  experimentStarted.emit(key)
  return true
}

/**
 * 暂停实验
 */
export function pauseExperiment(key: string): boolean {
  const exp = experiments.get(key)
  if (!exp) return false
  exp.status = 'paused'
  return true
}

/**
 * 完成实验
 */
export function completeExperiment(key: string): boolean {
  const exp = experiments.get(key)
  if (!exp) return false
  exp.status = 'completed'
  return true
}

/**
 * 获取实验值
 */
export function getExperimentValue(
  key: string, 
  userAttributes: UserAttributes
): ExperimentResult {
  const exp = experiments.get(key)
  
  if (!exp || exp.status !== 'running') {
    return {
      experimentKey: key,
      variation: 'control',
      value: exp?.variations?.['control'] ?? null,
      bucket: 0,
      inExperiment: false
    }
  }

  // 检查force
  if (exp.force) {
    for (const [variation, value] of Object.entries(exp.force)) {
      return {
        experimentKey: key,
        variation,
        value,
        bucket: -1,
        inExperiment: true
      }
    }
  }

  // 计算bucket
  const bucketAttribute = exp.bucketAttribute || 'userId'
  const userId = String(userAttributes[bucketAttribute] || Math.random())
  const bucket = hashForBucket(userId, key)

  // 检查coverage
  if (exp.coverage !== undefined && bucket > exp.coverage) {
    return {
      experimentKey: key,
      variation: 'control',
      value: exp.variations['control'],
      bucket,
      inExperiment: false
    }
  }

  // 计算variation
  const variations = Object.keys(exp.variations)
  const variation = selectVariation(bucket, variations, exp.weights, exp.ranges)

  return {
    experimentKey: key,
    variation,
    value: exp.variations[variation],
    bucket,
    inExperiment: true
  }
}

// ============================================================================
// 工具函数
// ============================================================================

/**
 * 简单hash函数
 */
function hashForBucket(value: string, namespace: string): number {
  let hash = 0
  const str = namespace + ':' + value
  
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  
  return Math.abs(hash % 10000) / 10000  // 0-1
}

/**
 * 选择variation
 */
function selectVariation(
  bucket: number,
  variations: string[],
  weights?: { [key: string]: number },
  ranges?: [number, number][]
): string {
  // 如果有预定义ranges，使用ranges
  if (ranges && ranges.length === variations.length) {
    for (let i = 0; i < ranges.length; i++) {
      if (bucket >= ranges[i][0] && bucket < ranges[i][1]) {
        return variations[i]
      }
    }
  }

  // 否则按权重分配
  if (weights) {
    let cumulative = 0
    for (const variation of variations) {
      cumulative += weights[variation] || 0
      if (bucket < cumulative) {
        return variation
      }
    }
  }

  // 默认第一个
  return variations[0]
}

// ============================================================================
// 内置实验
// ============================================================================

/**
 * 注册内置实验
 */
export function registerBuiltInExperiments(): void {
  // 记忆提取实验
  registerExperiment({
    key: 'memory-extraction-strategy',
    variations: {
      control: 'threshold-based',
      variant_a: 'auto-dream',
      variant_b: 'hybrid'
    },
    weights: { control: 0.5, variant_a: 0.25, variant_b: 0.25 },
    status: 'running',
    bucketAttribute: 'userId',
    coverage: 1.0
  })

  // 摘要策略实验
  registerExperiment({
    key: 'summarization-strategy',
    variations: {
      control: 'full',
      variant_a: 'compact',
      variant_b: 'smart'
    },
    weights: { control: 0.34, variant_a: 0.33, variant_b: 0.33 },
    status: 'running',
    bucketAttribute: 'userId',
    coverage: 0.5
  })
}

// ============================================================================
// 订阅
// ============================================================================

export function onFeatureUpdated(callback: (key: string, value: any) => void): () => void {
  return featureUpdated.subscribe((key, value) => callback(key, value))
}

export function onExperimentStarted(callback: (key: string) => void): () => void {
  return experimentStarted.subscribe(callback)
}

export function onExperimentCompleted(callback: (key: string, result: ExperimentResult) => void): () => void {
  return experimentCompleted.subscribe(callback)
}

export function onExperimentOverridden(callback: (key: string, variation: string) => void): () => void {
  return experimentOverridden.subscribe(callback)
}

// ============================================================================
// 导入/导出
// ============================================================================

export function exportExperiments(): string {
  return JSON.stringify(Array.from(experiments.values()), null, 2)
}

export function exportFeatures(): string {
  return JSON.stringify(Array.from(features.values()), null, 2)
}

export function importExperiments(json: string): number {
  try {
    const exps = JSON.parse(json)
    let count = 0
    for (const exp of exps) {
      if (exp.key) {
        registerExperiment(exp)
        count++
      }
    }
    return count
  } catch {
    return 0
  }
}

export function importFeatures(json: string): number {
  try {
    const feats = JSON.parse(json)
    let count = 0
    for (const feat of feats) {
      if (feat.key) {
        registerFeature(feat)
        count++
      }
    }
    return count
  } catch {
    return 0
  }
}

// ============================================================================
// 工具
// ============================================================================

export function isFeatureEnabled(key: string, userAttributes?: UserAttributes): boolean {
  const result = getFeatureValue(key, userAttributes)
  return result.value === true || result.value === 'enabled'
}

export function getFeatureSource(key: string): string {
  const feature = features.get(key)
  if (!feature) return 'unknown'
  if (overrides.has(key)) return 'override'
  if (experiments.has(key) && experiments.get(key)?.status === 'running') return 'experiment'
  return 'default'
}
