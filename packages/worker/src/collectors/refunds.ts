import { BrowserManager } from '../browser';
import { MetricsSnapshot } from '@pdd-inspector/core';

/**
 * Collect order refund metrics from PDD merchant backend.
 *
 * NOTE: CSS selectors are PLACEHOLDERS.
 */
export async function collectRefundMetrics(
  browser: BrowserManager,
  storeId: number,
): Promise<Partial<MetricsSnapshot>> {
  const page = browser.getPage();
  const metrics: Partial<MetricsSnapshot> = {};

  try {
    // Navigate to after-sales / refund page
    await browser.navigateWithRetry('https://mms.pinduoduo.com/after-sales/refund');

    // Refund duration (hours)
    const durationText = await browser.extractText('.refund-duration .value, .avg-duration .num, [data-type="duration"]');
    if (durationText) {
      metrics.refundDuration = parseFloat(durationText.replace(/[^0-9.]/g, ''));
    }

    // Refund rate
    const rateText = await browser.extractText('.refund-rate .value, .rate-value, [data-type="refund-rate"]');
    if (rateText) {
      metrics.refundRate = parseFloat(rateText.replace('%', '')) / 100;
    }

    // Dispute rate
    const disputeText = await browser.extractText('.dispute-rate .value, [data-type="dispute-rate"]');
    if (disputeText) {
      metrics.disputeRate = parseFloat(disputeText.replace('%', '')) / 100;
    }

    await browser.takeScreenshot(storeId, 'refunds-collected');
  } catch (err) {
    console.error(`Failed to collect refund metrics for store ${storeId}:`, err);
  }

  return metrics;
}
