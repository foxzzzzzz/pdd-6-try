/**
 * AI Provider 抽象接口 — 不绑定单一模型
 *
 * 三级配置:
 *   全局默认 (.env) → 店铺覆盖 (stores.ai_config) → 任务指定 (代码中按介入点)
 */

// ---- Provider Configuration ----
export type AIProviderName = 'claude' | 'openai' | 'deepseek' | 'local';

export interface AIProviderConfig {
  provider: AIProviderName;
  model: string;
  apiKey: string;
  baseUrl?: string;
  maxTokens?: number;
  temperature?: number;
}

// ---- Intervention Point 1 & 2: 评价分类 ----
export interface ReviewClassification {
  /** 评价类型: 好评(正常/口味/物流/性价比) | 差评(广告/不文明/不实/竞品/其他) */
  category: string;
  /** 推荐使用的模板名称 */
  recommendedTemplate: string;
  /** 推荐的回复/举报话术 */
  suggestedContent: string;
  /** 置信度 0-1 */
  confidence: number;
  /** 是否应该操作 (false = 不确定, 标记人工) */
  shouldAct: boolean;
}

// ---- Intervention Point 3: 互动动态判断 ----
export interface SentimentJudgment {
  /** negative | neutral | positive */
  sentiment: 'negative' | 'neutral' | 'positive';
  /** 置信度 0-1 */
  confidence: number;
  /** 是否应隐藏 */
  shouldHide: boolean;
  /** 判断理由 */
  reason: string;
}

// ---- Intervention Point 4: 指标异常检测 ----
export interface AnomalyDetection {
  isAnomaly: boolean;
  /** normal | warning | critical */
  severity: 'normal' | 'warning' | 'critical';
  /** 异常指标列表 */
  flags: string[];
  /** 人类可读的异常说明 */
  description: string;
}

// ---- Intervention Point 5: 日报摘要 ----
export interface DailySummary {
  /** 总体情况概述 */
  overview: string;
  /** 需要关注的店铺列表 */
  attentionStores: { name: string; reason: string }[];
  /** 关键趋势 */
  trends: string;
  /** 建议行动 */
  recommendations: string[];
}

// ---- Provider Interface ----
export interface AIProvider {
  name: AIProviderName;

  /** 接入点1&2: 评价分类 + 话术推荐 */
  classifyReview(
    reviewContent: string,
    reviewStars: number,
    availableTemplates: { name: string; content: string }[],
  ): Promise<ReviewClassification>;

  /** 接入点3: 互动动态负面判断 */
  judgeInteraction(content: string): Promise<SentimentJudgment>;

  /** 接入点4: 指标异常检测 */
  detectAnomalies(
    current: Record<string, number | null>,
    historical: Record<string, number | null>[],
  ): Promise<AnomalyDetection>;

  /** 接入点5: 日报摘要 */
  generateSummary(data: {
    storeName: string;
    metrics: Record<string, string | null>;
    reviewCount: number;
    reportCount: number;
    hideCount: number;
  }[]): Promise<DailySummary>;
}

// ---- Utility ----

/** 从环境变量和店铺配置构建 AI 配置 */
export function buildAIConfig(
  envProvider?: string,
  envModel?: string,
  envApiKey?: string,
  storeOverride?: string | null, // JSON from stores.ai_config
  taskModel?: string,
): AIProviderConfig {
  // Parse store override
  let storeConfig: Partial<AIProviderConfig> = {};
  if (storeOverride) {
    try { storeConfig = JSON.parse(storeOverride); } catch { /* ignore */ }
  }

  return {
    provider: (storeConfig.provider || envProvider || 'claude') as AIProviderName,
    model: taskModel || storeConfig.model || envModel || 'claude-sonnet-4-6',
    apiKey: storeConfig.apiKey || envApiKey || '',
    baseUrl: storeConfig.baseUrl,
    temperature: storeConfig.temperature ?? 0.3,
    maxTokens: 1024,
  };
}
