/**
 * 评价数据采集 - /sycm/goods_quality/comment
 */
import { BrowserManager } from '../browser';
import { MetricsSnapshot } from '@pdd-inspector/core';

export async function collectCommentMetrics(
  browser: BrowserManager,
  storeId: number,
): Promise<Partial<MetricsSnapshot>> {
  const page = browser.getPage();
  const metrics: Partial<MetricsSnapshot> = {};

  try {
    await browser.navigateWithRetry('https://mms.pinduoduo.com/sycm/goods_quality/comment');
    await page.waitForTimeout(3000);

    const pageText: string = await page.evaluate('document.body.innerText || ""');
    Object.assign(metrics, parseCommentMetricsText(pageText));

    await browser.takeScreenshot(storeId, 'comments');
  } catch (err) {
    console.error(`Comment metrics error for ${storeId}:`, err);
  }
  return metrics;
}

export function parseCommentMetricsText(text: string): Partial<MetricsSnapshot> {
  return {
    commentScoreRank: extractPercentAsDecimal(text, '店铺评价分排名'),
    commentScoreRankChange: extractSignedPercentAfterLabel(text, '店铺评价分排名'),
    commentCount: extractFirstInteger(text, ['评价条数', '近30天评价数', '近90天评价数', '评价数']),
    commentCountChange: extractFirstSignedPercentAfterLabel(text, ['评价条数', '近30天评价数', '近90天评价数', '评价数']),
  };
}

function extractFirstInteger(text: string, labels: string[]): number | null {
  for (const label of labels) {
    const value = extractInteger(text, label);
    if (value != null) return value;
  }
  return null;
}

function extractFirstSignedPercentAfterLabel(text: string, labels: string[]): number | null {
  for (const label of labels) {
    const value = extractSignedPercentAfterLabel(text, label);
    if (value != null) return value;
  }
  return null;
}

function extractInteger(text: string, label: string): number | null {
  const idx = text.indexOf(label);
  if (idx === -1) return null;
  const sub = text.substring(idx + label.length, idx + label.length + 50);
  const m = sub.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

function extractPercentAsDecimal(text: string, label: string): number | null {
  const idx = text.indexOf(label);
  if (idx === -1) return null;
  const sub = text.substring(idx + label.length, idx + label.length + 50);
  const m = sub.match(/(\d+\.?\d*)\s*%/);
  return m ? parseFloat(m[1]) / 100 : null;
}

function extractSignedPercentAfterLabel(text: string, label: string): number | null {
  const idx = text.indexOf(label);
  if (idx === -1) return null;
  const sub = text.substring(idx + label.length, idx + label.length + 120);
  const changeIdx = sub.indexOf('较前');
  if (changeIdx === -1) return null;
  const changeText = sub.substring(changeIdx, changeIdx + 60);
  const m = changeText.match(/([↑⬆+]|[↓⬇-])?\s*(\d+\.?\d*)\s*%\s*([↑⬆+]|[↓⬇-])?/);
  if (!m) return null;
  const value = parseFloat(m[2]) / 100;
  const signToken = m[1] || m[3] || '';
  if (!signToken) return value === 0 ? 0 : null;
  const sign = /[↓⬇-]/.test(signToken) ? -1 : 1;
  return sign * value;
}
