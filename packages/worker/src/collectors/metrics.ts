/**
 * 店铺健康度采集 — 综合体验星级页面
 */
import { BrowserManager } from '../browser';
import { MetricsSnapshot } from '@pdd-inspector/core';

export async function collectStoreMetrics(
  browser: BrowserManager,
  storeId: number,
): Promise<Partial<MetricsSnapshot>> {
  const page = browser.getPage();
  const metrics: Partial<MetricsSnapshot> = {};

  try {
    await browser.navigateWithRetry('https://mms.pinduoduo.com/sycm/goods_quality/pilot_mall');
    await page.waitForTimeout(3000);

    const data = await page.evaluate(function () {
      var text = document.body.innerText || '';
      var result: Record<string, string> = {};

      function find(label: string): string {
        var idx = text.indexOf(label);
        if (idx === -1) return '';
        var sub = text.substring(idx, idx + 80);
        var m = sub.match(/(\d+\.?\d*%?)/);
        return m ? m[1] : '';
      }

      result['star'] = find('店铺综合体验星级');
      result['defectRate'] = find('严重劣质率');
      result['rank'] = find('领航员综合分行业排名');
      result['reviewRank'] = find('近90天用户评价得分排名');
      result['replyRate'] = find('近30天3分钟人工回复率');
      result['shipTime'] = find('近30天成团-签收时效');
      result['activity'] = find('近30天店铺活跃度');
      result['positiveRate'] = find('近30天积极评论率');
      result['helpRate'] = find('近30天平台求助率');
      result['refundTime'] = find('近30天在途订单退款时长');
      result['signRefund'] = find('签收消费者退货订单后的平均退款时长');

      return result;
    });

    if (data['star']) {
      const m = data['star'].match(/(\d+\.?\d*)/);
      if (m) metrics.rating = parseFloat(m[1]);
    }
    if (data['defectRate']) {
      const m = data['defectRate'].match(/(\d+\.?\d*)/);
      if (m) metrics.defectRate = parseFloat(m[1]) / (data['defectRate'].includes('%') ? 100 : 1);
    }
    metrics.dsrRankChange = data['rank'] || null;

    // DSR dimensions
    if (data['reviewRank']) metrics.dsrDesc = parseFloatOrNull(data['reviewRank']);
    if (data['replyRate']) metrics.dsrService = parseFloatOrNull(data['replyRate']);
    if (data['shipTime']) metrics.dsrLogistics = parseFloatOrNull(data['shipTime']);

    await browser.takeScreenshot(storeId, 'metrics');
  } catch (err) {
    console.error(`Store metrics error for ${storeId}:`, err);
  }

  return metrics;
}

function parseFloatOrNull(s: string): number | null {
  const m = s.match(/(\d+\.?\d*)/);
  return m ? parseFloat(m[1]) : null;
}
