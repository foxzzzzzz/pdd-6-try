/**
 * 日报生成器 — 介入点 5
 *
 * 双模式: AI 摘要 (优先) + 模板生成 (兜底)
 */
import type { DailySummary, AnomalyDetection } from '@pdd-inspector/core';
import { getHeavyProvider } from './provider-factory';

export interface StoreReportData {
  storeName: string;
  metrics: Record<string, string | null>;
  reviewCount: number;
  reportCount: number;
  hideCount: number;
  anomaly?: AnomalyDetection;
  severity?: string;
}

/**
 * 模板生成 (不依赖 AI，保证始终有输出)
 */
export function generateSummaryByTemplate(data: StoreReportData[]): DailySummary {
  const totalStores = data.length;
  const anomalyStores = data.filter((d) => d.anomaly?.isAnomaly);
  const warningStores = data.filter((d) => d.severity === 'warning' || d.severity === 'critical');
  const totalReplied = data.reduce((s, d) => s + d.reviewCount, 0);
  const totalReported = data.reduce((s, d) => s + d.reportCount, 0);
  const totalHidden = data.reduce((s, d) => s + d.hideCount, 0);

  const overview = [
    `今日共巡店${totalStores}家，${anomalyStores.length > 0 ? `其中${anomalyStores.length}家存在异常` : '全部正常'}。`,
    `自动回复好评${totalReplied}条，举报差评${totalReported}条，处理互动动态${totalHidden}条。`,
  ].join('');

  const attentionStores = warningStores.map((s) => ({
    name: s.storeName,
    reason: s.anomaly?.description || s.severity || '指标异常',
  }));

  const recommendations: string[] = [];
  if (totalReported > 5) recommendations.push('今日差评举报较多，建议关注商品质量');
  if (anomalyStores.length > 0) recommendations.push(`请人工复核${anomalyStores.length}家异常店铺的详细数据`);
  if (totalStores > 10 && anomalyStores.length === 0) recommendations.push('整体运营平稳，可关注周报趋势变化');

  return {
    overview,
    attentionStores,
    trends: anomalyStores.length === 0 ? '各项指标稳定，无显著波动' : `${anomalyStores.length}家店铺需关注`,
    recommendations,
  };
}

/**
 * AI 增强日报生成
 * @param useAI 是否使用 AI (默认 true，失败时自动回退模板)
 */
export async function generateDailyReport(
  data: StoreReportData[],
  storeAiConfig?: string | null,
  useAI = true,
): Promise<DailySummary> {
  // 先跑模板生成（保证有兜底）
  const templateResult = generateSummaryByTemplate(data);

  // 如果不用 AI 或数据太少，直接返回模板结果
  if (!useAI || data.length === 0) return templateResult;

  try {
    const provider = getHeavyProvider(storeAiConfig);
    const aiResult = await provider.generateSummary(data.map((d) => ({
      storeName: d.storeName,
      metrics: d.metrics,
      reviewCount: d.reviewCount,
      reportCount: d.reportCount,
      hideCount: d.hideCount,
    })));

    // 合并 AI 结果和模板结果（AI 优先，模板兜底）
    return {
      overview: aiResult.overview || templateResult.overview,
      attentionStores: aiResult.attentionStores.length > 0
        ? aiResult.attentionStores
        : templateResult.attentionStores,
      trends: aiResult.trends || templateResult.trends,
      recommendations: aiResult.recommendations.length > 0
        ? aiResult.recommendations
        : templateResult.recommendations,
    };
  } catch (err) {
    console.warn('AI report generation failed, using template fallback:', err);
    return templateResult;
  }
}
