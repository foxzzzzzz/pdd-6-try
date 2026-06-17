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

    metrics.rating = extractNumber(pageText, '店铺综合体验星级');
    metrics.defectRate = extractPercentAsDecimal(pageText, '严重劣质率');
    metrics.dsrRankChange = extractText(pageText, '领航员综合分行业排名');
    metrics.dsrDesc = extractNumber(pageText, '近90天用户评价得分排名');
    metrics.dsrService = extractNumber(pageText, '近30天3分钟人工回复率');
    metrics.dsrLogistics = extractNumber(pageText, '近30天成团-签收时效');

    await browser.takeScreenshot(storeId, 'metrics');
  } catch (err) {
    console.error(`Store metrics error for ${storeId}:`, err);
  }
  return metrics;
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
  const m = sub.match(/(\d+\.?\d*)%?/);
  if (!m) return null;
  const v = parseFloat(m[1]);
  return v > 1 ? v / 100 : v;
}

function extractText(text: string, label: string): string | null {
  const idx = text.indexOf(label);
  if (idx === -1) return null;
  const sub = text.substring(idx + label.length, idx + label.length + 20).trim();
  return sub.split('\n')[0]?.trim() || sub;
}
