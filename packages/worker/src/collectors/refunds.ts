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

    const data = JSON.parse(await page.evaluate(`(function () {
      var text = document.body.innerText || '';
      function ex(label) {
        var idx = text.indexOf(label);
        if (idx === -1) return '';
        var start = idx + label.length;
        var sub = text.substring(start, start + 80);
        var ms = sub.match(/(\\d+\\.?\\d*)/g);
        if (!ms) return '';
        for (var i = 0; i < ms.length; i++) {
          var v = ms[i];
          if (v === '2026' || v === '2025' || v === '2024') continue;
          if (v.length >= 4 && v.indexOf('.') === -1) continue;
          return v;
        }
        return ms[0];
      }
      return JSON.stringify({
        expScore: ex('消费者服务体验分'),
        complaintWarn: ex('投诉预警'),
        overdueSoon: ex('待处理即将逾期'),
        pendingMerchant: ex('待商家处理'),
      });
    })()`));

    if (data.expScore) metrics.refundDuration = parseFloat(data.expScore);

    await browser.takeScreenshot(storeId, 'refunds');
  } catch (err) {
    console.error(`Refund metrics error for ${storeId}:`, err);
  }
  return metrics;
}
