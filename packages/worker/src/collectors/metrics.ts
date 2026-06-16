import { BrowserManager } from '../browser';
import { MetricsSnapshot } from '@pdd-inspector/core';

/**
 * Collect store health metrics from PDD merchant backend.
 *
 * NOTE: CSS selectors below are PLACEHOLDERS. They MUST be updated
 * after inspecting the actual PDD merchant backend pages.
 *
 * - 店铺评分页: usually /mall/score or /data/score
 * - 数据中心: usually /data/center
 */
export async function collectStoreMetrics(
  browser: BrowserManager,
  storeId: number,
): Promise<Partial<MetricsSnapshot>> {
  const page = browser.getPage();
  const metrics: Partial<MetricsSnapshot> = {};

  try {
    // Navigate to store rating/data page
    await browser.navigateWithRetry('https://mms.pinduoduo.com/mall/score');

    // Extract store rating
    // PLACEHOLDER: update selector based on actual page
    const ratingText = await browser.extractText('[data-testid="store-rating"], .rating-value, .score-num');
    if (ratingText) {
      metrics.rating = parseFloat(ratingText);
    }

    // Extract defect rate
    const defectText = await browser.extractText('[data-testid="defect-rate"], .defect-rate, .quality-rate');
    if (defectText) {
      metrics.defectRate = parseFloat(defectText.replace('%', '')) / 100;
    }

    // Navigate to DSR page
    await browser.navigateWithRetry('https://mms.pinduoduo.com/mall/dsr');

    // Extract DSR scores
    metrics.dsrDesc = parseFloatOrNull(await browser.extractText('.dsr-desc .score, [data-type="desc"] .value'));
    metrics.dsrService = parseFloatOrNull(await browser.extractText('.dsr-service .score, [data-type="service"] .value'));
    metrics.dsrLogistics = parseFloatOrNull(
      await browser.extractText('.dsr-logistics .score, [data-type="logistics"] .value'),
    );

    await browser.takeScreenshot(storeId, 'metrics-collected');
  } catch (err) {
    console.error(`Failed to collect store metrics for store ${storeId}:`, err);
  }

  return metrics;
}

function parseFloatOrNull(text: string | null): number | null {
  if (!text) return null;
  const num = parseFloat(text.replace(/[^0-9.]/g, ''));
  return isNaN(num) ? null : num;
}
