import { BrowserManager } from '../browser';
import { MetricsSnapshot } from '@pdd-inspector/core';

/**
 * Collect consumer experience scores from PDD merchant backend.
 *
 * NOTE: CSS selectors are PLACEHOLDERS. Update after inspecting
 * the actual PDD consumer experience page.
 */
export async function collectExperienceMetrics(
  browser: BrowserManager,
  storeId: number,
): Promise<Partial<MetricsSnapshot>> {
  const page = browser.getPage();
  const metrics: Partial<MetricsSnapshot> = {};

  try {
    // Navigate to consumer experience page
    await browser.navigateWithRetry('https://mms.pinduoduo.com/mall/experience');

    // Extract scores
    metrics.expBasic = parseScore(await browser.extractText('.basic-score .value, [data-type="basic"] .num'));
    metrics.expShipping = parseScore(await browser.extractText('.shipping-score .value, [data-type="shipping"] .num'));
    metrics.expProduct = parseScore(await browser.extractText('.product-score .value, [data-type="product"] .num'));
    metrics.expLogistics = parseScore(
      await browser.extractText('.logistics-score .value, [data-type="logistics"] .num'),
    );

    await browser.takeScreenshot(storeId, 'experience-collected');
  } catch (err) {
    console.error(`Failed to collect experience metrics for store ${storeId}:`, err);
  }

  return metrics;
}

function parseScore(text: string | null): number | null {
  if (!text) return null;
  const num = parseFloat(text.replace(/[^0-9.]/g, ''));
  return isNaN(num) ? null : num;
}
