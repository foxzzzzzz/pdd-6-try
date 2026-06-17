/**
 * 消费者体验指标采集
 */
import { BrowserManager } from '../browser';
import { MetricsSnapshot } from '@pdd-inspector/core';

export async function collectExperienceMetrics(
  browser: BrowserManager,
  storeId: number,
): Promise<Partial<MetricsSnapshot>> {
  const page = browser.getPage();
  const metrics: Partial<MetricsSnapshot> = {};

  try {
    await browser.navigateWithRetry('https://mms.pinduoduo.com/sycm/goods_quality/help');
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
        total: ex('消费者服务体验分'),
        product: ex('商品服务体验分'),
        shipping: ex('发货服务体验分'),
        logistics: ex('物流服务体验分'),
        attitude: ex('服务态度体验分'),
        basic: ex('基础服务体验分'),
      };
    });

    metrics.expBasic = parseOrNull(data.total);
    metrics.expProduct = parseOrNull(data.product);
    metrics.expShipping = parseOrNull(data.shipping);
    metrics.expLogistics = parseOrNull(data.logistics);

    await browser.takeScreenshot(storeId, 'experience');
  } catch (err) {
    console.error(`Experience metrics error for ${storeId}:`, err);
  }

  return metrics;
}

function parseOrNull(s: string): number | null {
  return s ? parseFloat(s) : null;
}
