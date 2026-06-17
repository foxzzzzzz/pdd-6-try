/**
 * 售后/退款数据采集
 */
import { BrowserManager } from '../browser';
import { MetricsSnapshot } from '@pdd-inspector/core';

export async function collectRefundMetrics(
  browser: BrowserManager,
  storeId: number,
): Promise<Partial<MetricsSnapshot>> {
  const page = browser.getPage();
  const metrics: Partial<MetricsSnapshot> = {};

  try {
    await browser.navigateWithRetry('https://mms.pinduoduo.com/aftersales/aftersale_list?msfrom=mms_sidenav');
    await page.waitForTimeout(3000);

    const data = await page.evaluate(function () {
      var text = document.body.innerText || '';
      function ex(label: string): string {
        var idx = text.indexOf(label);
        if (idx === -1) return '';
        var sub = text.substring(idx, idx + 60);
        var m = sub.match(/(\d+\.?\d*)/);
        return m ? m[1] : '';
      }
      return {
        expScore: ex('消费者服务体验分'),
        complaintWarn: ex('投诉预警'),
        overdueSoon: ex('待处理即将逾期'),
        pendingMerchant: ex('待商家处理'),
      };
    });

    metrics.refundDuration = parseOrNull(data.expScore);

    await browser.takeScreenshot(storeId, 'refunds');
  } catch (err) {
    console.error(`Refund metrics error for ${storeId}:`, err);
  }

  return metrics;
}

function parseOrNull(s: string): number | null {
  return s ? parseFloat(s) : null;
}
