import { BrowserManager } from '../browser';
import { MetricsSnapshot } from '@pdd-inspector/core';

/**
 * Collect appeal/投诉 metrics from PDD merchant backend.
 *
 * NOTE: CSS selectors are PLACEHOLDERS.
 */
export async function collectAppealMetrics(
  browser: BrowserManager,
  storeId: number,
): Promise<Partial<MetricsSnapshot>> {
  const page = browser.getPage();
  const metrics: Partial<MetricsSnapshot> = {};

  try {
    // Navigate to appeal center
    await browser.navigateWithRetry('https://mms.pinduoduo.com/appeal/center');

    // Appeal count
    const countText = await browser.extractText('.appeal-count .value, .total-count, [data-type="appeal-count"]');
    if (countText) {
      metrics.appealCount = parseInt(countText.replace(/[^0-9]/g, ''), 10);
    }

    // Appeal success rate
    const successText = await browser.extractText(
      '.appeal-success .value, .success-rate, [data-type="appeal-success"]',
    );
    if (successText) {
      metrics.appealSuccessRate = parseFloat(successText.replace('%', '')) / 100;
    }

    await browser.takeScreenshot(storeId, 'appeals-collected');
  } catch (err) {
    console.error(`Failed to collect appeal metrics for store ${storeId}:`, err);
  }

  return metrics;
}
