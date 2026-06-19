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
    commentCount: extractInteger(text, '近30天评价数') ?? extractInteger(text, '评价数'),
    commentCountChange: extractSignedPercentAfterLabel(text, '近30天评价数') ?? extractSignedPercentAfterLabel(text, '评价数'),
  };
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
  const m = changeText.match(/([↑⬆+]|[↓⬇-])?\s*(\d+\.?\d*)\s*%/);
  if (!m) return null;
  const sign = m[1] && /[↓⬇-]/.test(m[1]) ? -1 : 1;
  return sign * parseFloat(m[2]) / 100;
}
