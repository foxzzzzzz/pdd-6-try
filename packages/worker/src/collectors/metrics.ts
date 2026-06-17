/**
 * 店铺健康度采集 — 综合体验星级页面 /sycm/goods_quality/pilot_mall
 *
 * 策略: 浏览器取文本，Node.js 解析
 */
import { BrowserManager } from '../browser';
import { MetricsSnapshot } from '@pdd-inspector/core';

export async function collectStoreMetrics(
  browser: BrowserManager,
  storeId: number,
): Promise<Partial<MetricsSnapshot>> {
  const page = browser.getPage();
  const metrics: Partial<MetricsSnapshot> = {};

  try {
    await browser.navigateWithRetry('https://mms.pinduoduo.com/sycm/goods_quality/pilot_mall');
    await page.waitForTimeout(3000);

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
    rating: extractNumber(text, '店铺综合体验星级'),
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
    dsrDesc: extractDsrScore(text, '描述相符'),
    dsrService: extractDsrScore(text, '服务态度'),
    dsrLogistics: extractDsrScore(text, '物流服务'),
  };
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
