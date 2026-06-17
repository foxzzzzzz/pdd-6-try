/**
 * 消费者体验指标采集 — /sycm/goods_quality/help
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

    const data = JSON.parse(await page.evaluate(`(function () {
      var text = document.body.innerText || '';
      function ex(label) {
        var idx = text.indexOf(label);
        if (idx === -1) return null;
        var sub = text.substring(idx + label.length, idx + label.length + 100);
        // Look for score before "/5" pattern
        var m = sub.match(/(\\d+\\.?\\d*)\\s*\\/\\s*5/);
        if (m && parseFloat(m[1]) <= 5) return m[1];
        // Look for score before "分"
        var n = sub.match(/(\\d+\\.?\\d*)\\s*分/);
        if (n && parseFloat(n[1]) <= 5 && n[1].length < 4) return n[1];
        return null;
      }
      return JSON.stringify({
        total: ex('消费者服务体验分'),
        product: ex('商品服务体验分'),
        shipping: ex('发货服务体验分'),
        logistics: ex('物流服务体验分'),
        attitude: ex('服务态度体验分'),
        basic: ex('基础服务体验分'),
      });
    })()`));

    if (data.total) metrics.expBasic = parseFloat(data.total);
    if (data.product) metrics.expProduct = parseFloat(data.product);
    if (data.shipping) metrics.expShipping = parseFloat(data.shipping);
    if (data.logistics) metrics.expLogistics = parseFloat(data.logistics);

    await browser.takeScreenshot(storeId, 'experience');
  } catch (err) {
    console.error(`Experience metrics error for ${storeId}:`, err);
  }
  return metrics;
}
