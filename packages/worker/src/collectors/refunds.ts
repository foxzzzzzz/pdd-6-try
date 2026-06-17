/**
 * 售后/退款数据采集 — /aftersales/aftersale_list
 *
 * 主要采集: 消费者服务体验分(售后视角)、投诉预警数、
 * 待处理售后单数、纠纷退款相关数据
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
        complaintWarn: ex('投诉预警'),
        overdueSoon: ex('待处理即将逾期'),
        pendingMerchant: ex('待商家处理'),
        needProof: ex('待商家举证'),
        buyerUrge: ex('买家催处理'),
        disputeCount: ex('纠纷退款'),
      });
    })()`));

    // 售后等待处理数量 — 用于衡量退款压力
    if (data.pendingMerchant) metrics.refundDuration = parseFloat(data.pendingMerchant);

    // 纠纷退款数 — 用于衡量纠纷率
    if (data.disputeCount) metrics.disputeRate = parseFloat(data.disputeCount);

    await browser.takeScreenshot(storeId, 'refunds');
  } catch (err) {
    console.error(`Refund metrics error for ${storeId}:`, err);
  }
  return metrics;
}
