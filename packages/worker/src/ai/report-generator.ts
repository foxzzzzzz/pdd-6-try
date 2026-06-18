import type { AnomalyDetection, DailySummary } from '@pdd-inspector/core';
import { getHeavyProvider } from './provider-factory';

export interface StoreReportData {
  storeName: string;
  metrics: Record<string, string | null>;
  reviewCount: number;
  reportCount: number;
  hideCount: number;
  anomaly?: AnomalyDetection | null;
  severity?: string | null;
}

export function generateSummaryByTemplate(data: StoreReportData[]): DailySummary {
  const totalStores = data.length;
  const anomalyStores = data.filter((store) => store.anomaly?.isAnomaly);
  const warningStores = data.filter((store) => store.severity === 'warning' || store.severity === 'critical');
  const totalReplied = data.reduce((sum, store) => sum + store.reviewCount, 0);
  const totalReported = data.reduce((sum, store) => sum + store.reportCount, 0);
  const totalHidden = data.reduce((sum, store) => sum + store.hideCount, 0);

  const overview = [
    `今日共巡店${totalStores}家，${anomalyStores.length > 0 ? `${anomalyStores.length}家存在异常` : '全部正常'}`,
    `自动回复好评${totalReplied}条，举报差评${totalReported}条，处理互动${totalHidden}条。`,
  ].join('；');

  const attentionStores = warningStores.map((store) => ({
    name: store.storeName,
    reason: store.anomaly?.description || store.severity || '指标异常',
  }));

  const recommendations: string[] = [];
  if (totalReported > 5) recommendations.push('今日差评举报较多，建议复盘商品质量和评价来源。');
  if (anomalyStores.length > 0) recommendations.push(`请人工复核${anomalyStores.length}家异常店铺的详细指标。`);
  if (totalStores > 0 && anomalyStores.length === 0) recommendations.push('整体运行稳定，继续关注星级、体验分、售后核心指标变化。');

  return {
    overview,
    attentionStores,
    trends: anomalyStores.length === 0 ? '各项指标暂无明显异常波动。' : `${anomalyStores.length}家店铺需要关注。`,
    recommendations,
  };
}

export function formatDailySummaryForInspection(summary: DailySummary): string {
  const parts = [summary.overview];
  if (summary.trends) parts.push(`趋势：${summary.trends}`);
  if (summary.attentionStores.length > 0) {
    parts.push(`关注：${summary.attentionStores.map((store) => `${store.name}(${store.reason})`).join('；')}`);
  }
  if (summary.recommendations.length > 0) {
    parts.push(`建议：${summary.recommendations.join('；')}`);
  }
  return parts.filter(Boolean).join(' ');
}

export async function generateDailyReport(
  data: StoreReportData[],
  storeAiConfig?: string | null,
  useAI = true,
): Promise<DailySummary> {
  const templateResult = generateSummaryByTemplate(data);

  if (!useAI || data.length === 0) return templateResult;

  try {
    const provider = getHeavyProvider(storeAiConfig);
    const aiResult = await provider.generateSummary(data.map((store) => ({
      storeName: store.storeName,
      metrics: store.metrics,
      reviewCount: store.reviewCount,
      reportCount: store.reportCount,
      hideCount: store.hideCount,
    })));

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
