/**
 * 店铺健康度采集 — 综合体验星级页面 /sycm/goods_quality/pilot_mall
 *
 * 策略: 浏览器取文本，Node.js 解析
 */
import { BrowserManager } from '../browser';
import { MetricsSnapshot, PilotUnmetItem } from '@pdd-inspector/core';

export async function collectStoreMetrics(
  browser: BrowserManager,
  storeId: number,
): Promise<Partial<MetricsSnapshot>> {
  const page = browser.getPage();
  const metrics: Partial<MetricsSnapshot> = {};

  try {
    await browser.navigateWithRetry('https://mms.pinduoduo.com/sycm/goods_quality/pilot_mall');
    const pageText: string = await page.evaluate('document.body.innerText || ""');
    Object.assign(metrics, parseStoreMetricsText(pageText));

    await browser.takeScreenshot(storeId, 'metrics');
  } catch (err) {
    console.error(`Store metrics error for ${storeId}:`, err);
  }
  return metrics;
}

export function parseStoreMetricsText(text: string): Partial<MetricsSnapshot> {
  return {
    rating: extractStoreRating(text),
    ratingChange: extractStoreRatingChange(text),
    defectRate: extractPercentAsDecimal(text, '严重劣质率'),
    dsrRankChange: extractText(text, '领航员综合分行业排名'),
    pilotIndustryRank: extractPercentAsDecimal(text, '领航员综合分行业排名'),
    platformHelpRate: extractPercentAsDecimal(text, '近30天平台求助率'),
    threeMinuteReplyRate: extractPercentAsDecimal(text, '近30天3分钟人工回复率'),
    inTransitRefundDuration: extractNumber(text, '近30天在途订单退款时长'),
    returnRefundDuration: extractNumber(text, '近30天商家签收消费者退货订单后的平均退款时长'),
    reviewScoreRank: extractPercentAsDecimal(text, '近90天用户评价得分排名'),
    positiveReviewRate: extractPercentAsDecimal(text, '近30天积极评论率'),
    groupToSignDuration: extractNumber(text, '近30天成团-签收时效'),
    logisticsViolationRate: extractPercentAsDecimal(text, '近30天物流综合违规处理率'),
    storeActivityRate: extractPercentAsDecimal(text, '近30天店铺活跃度'),
    experiencePlanStatus: extractExperiencePlanStatus(text),
    pilotUnmetItems: serializePilotUnmetItems(parsePilotUnmetItems(text)),
    dsrDesc: extractDsrScore(text, '描述相符'),
    dsrService: extractDsrScore(text, '服务态度'),
    dsrLogistics: extractDsrScore(text, '物流服务'),
  };
}

export function parsePilotUnmetItems(text: string): PilotUnmetItem[] {
  const dimensions = ['售后服务', '商品品质', '物流服务'];
  const metricLabelsByDimension: Record<string, string[]> = {
    售后服务: [
      '近30天平台求助率',
      '近30天3分钟人工回复率',
      '近30天在途订单退款时长',
      '近30天商家签收消费者退货订单后的平均退款时长',
    ],
    商品品质: [
      '近90天用户评价得分排名',
      '近30天积极评论率',
      '近30天严重劣质率',
    ],
    物流服务: [
      '近30天成团-签收时效',
      '近30天物流综合违规处理率',
    ],
  };

  const normalized = text.replace(/\s+/g, ' ').trim();
  const rows: PilotUnmetItem[] = [];

  for (let i = 0; i < dimensions.length; i++) {
    const dimension = dimensions[i];
    const start = normalized.indexOf(dimension);
    if (start === -1) continue;
    const nextStarts = dimensions
      .slice(i + 1)
      .map((nextDimension) => normalized.indexOf(nextDimension, start + dimension.length))
      .filter((idx) => idx !== -1);
    const end = nextStarts.length > 0 ? Math.min(...nextStarts) : normalized.length;
    const segment = normalized.slice(start + dimension.length, end);
    const labels = metricLabelsByDimension[dimension] || [];

    for (let labelIndex = 0; labelIndex < labels.length; labelIndex++) {
      const metric = labels[labelIndex];
      const metricStart = segment.indexOf(metric);
      if (metricStart === -1) continue;
      const nextMetricStarts = labels
        .slice(labelIndex + 1)
        .map((nextMetric) => segment.indexOf(nextMetric, metricStart + metric.length))
        .filter((idx) => idx !== -1);
      const metricEnd = nextMetricStarts.length > 0 ? Math.min(...nextMetricStarts) : segment.length;
      const metricSegment = segment.slice(metricStart + metric.length, metricEnd).trim();
      const statusMatch = metricSegment.match(/(已达标|未达标)(?:\(([^)]*)\)|（([^）]*)）)?/);
      if (!statusMatch || statusMatch[1] !== '未达标') continue;
      const currentValue = metricSegment.slice(0, statusMatch.index).trim().split(/\s+/)[0] || '';
      rows.push({
        dimension,
        metric,
        currentValue,
        isMet: false,
        nextLevelStandard: statusMatch[2] || statusMatch[3] || null,
      });
    }
  }

  return rows;
}

function serializePilotUnmetItems(items: PilotUnmetItem[]): string | null {
  return items.length > 0 ? JSON.stringify(items) : null;
}

function extractNumber(text: string, label: string): number | null {
  const idx = text.indexOf(label);
  if (idx === -1) return null;
  const sub = text.substring(idx + label.length, idx + label.length + 50);
  const m = sub.match(/(\d+\.?\d*)/);
  if (!m) return null;
  const v = parseFloat(m[1]);
  if (v === 2026 || v === 2025 || v === 2024) return null;
  if (m[1].length >= 4 && !m[1].includes('.')) return null;
  return v;
}

function extractPercentAsDecimal(text: string, label: string): number | null {
  const idx = text.indexOf(label);
  if (idx === -1) return null;
  const sub = text.substring(idx + label.length, idx + label.length + 50);
  const m = sub.match(/(\d+\.?\d*)\s*(%?)/);
  if (!m) return null;
  const v = parseFloat(m[1]);
  if (m[2] === '%') return v / 100;
  return v > 1 ? v / 100 : v;
}

function extractStoreRating(text: string): number | null {
  for (const segment of labeledSegments(text, '店铺综合体验星级', 240)) {
    if (!segment.includes('较前1天') && !segment.includes('统计时间')) continue;
    const m = segment.match(/统计时间[\s\S]{0,40}?(\d+\.?\d*)\s*星/) ?? segment.match(/(\d+\.?\d*)\s*星/);
    if (!m) continue;
    const value = parseFloat(m[1]);
    if (value > 0 && value <= 5) return value;
  }
  return extractNumber(text, '店铺综合体验星级');
}

function extractStoreRatingChange(text: string): number | null {
  for (const segment of labeledSegments(text, '店铺综合体验星级', 240)) {
    if (!segment.includes('较前1天')) continue;
    const m = segment.match(/较前1天\s*([↑↓⬆⬇+-])?\s*(\d+\.?\d*)\s*([↑↓⬆⬇+-])?/);
    if (!m) continue;
    const value = parseFloat(m[2]);
    const sign = `${m[1] || ''}${m[3] || ''}`;
    return /[↓⬇-]/.test(sign) ? -value : value;
  }
  return null;
}

function labeledSegments(text: string, label: string, length: number): string[] {
  const segments: string[] = [];
  let idx = text.indexOf(label);
  while (idx !== -1) {
    segments.push(text.substring(idx + label.length, idx + label.length + length));
    idx = text.indexOf(label, idx + label.length);
  }
  return segments;
}

function extractText(text: string, label: string): string | null {
  const idx = text.indexOf(label);
  if (idx === -1) return null;
  const sub = text.substring(idx + label.length, idx + label.length + 20).trim();
  return sub.split('\n')[0]?.trim() || sub;
}

function extractDsrScore(text: string, label: string): number | null {
  const idx = text.indexOf(label);
  if (idx === -1) return null;
  const sub = text.substring(idx + label.length, idx + label.length + 80);
  if (sub.trimStart().startsWith('体验分')) return null;
  const m = sub.match(/(\d+\.?\d*)\s*(?:分|\/\s*5)?/);
  if (!m) return null;
  const value = parseFloat(m[1]);
  return value > 0 && value <= 5 ? value : null;
}

function extractExperiencePlanStatus(text: string): string | null {
  const label = '消费者体验提升计划开通状态';
  const idx = text.indexOf(label);
  if (idx === -1) return null;
  const sub = text.substring(idx + label.length, idx + label.length + 80);
  if (sub.includes('未开通')) return '未开通';
  if (sub.includes('已开通')) return '已开通';
  return null;
}
