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

    const data = JSON.parse(await page.evaluate(`(function () {
      var text = document.body.innerText || '';
      function find(label) {
        var idx = text.indexOf(label);
        if (idx === -1) return '';
        var start = idx + label.length;
        var sub = text.substring(start, start + 80);
        var matches = sub.match(/(\\d+\\.?\\d*%?)/g);
        if (!matches) return '';
        for (var i = 0; i < matches.length; i++) {
          var val = matches[i];
          if (val === '2026' || val === '2025' || val === '2024') continue;
          if (val.length >= 4 && val.indexOf('.') === -1) continue;
          return val;
        }
        return matches[0] || '';
      }
      return JSON.stringify({
        star: find('店铺综合体验星级'),
        defectRate: find('严重劣质率'),
        rank: find('领航员综合分行业排名'),
        reviewRank: find('近90天用户评价得分排名'),
        replyRate: find('近30天3分钟人工回复率'),
        shipTime: find('近30天成团-签收时效'),
      });
    })()`));

    if (data.star) { var sm = data.star.match(/(\d+\.?\d*)/); if (sm) metrics.rating = parseFloat(sm[1]); }
    if (data.defectRate) { var dm = data.defectRate.match(/(\d+\.?\d*)/); if (dm) metrics.defectRate = parseFloat(dm[1]) / (data.defectRate.includes('%') ? 100 : 1); }
    if (data.rank) metrics.dsrRankChange = data.rank;
    if (data.reviewRank) metrics.dsrDesc = parseOrNull(data.reviewRank);
    if (data.replyRate) metrics.dsrService = parseOrNull(data.replyRate);
    if (data.shipTime) metrics.dsrLogistics = parseOrNull(data.shipTime);

    await browser.takeScreenshot(storeId, 'metrics');
  } catch (err) {
    console.error(`Store metrics error for ${storeId}:`, err);
  }
  return metrics;
}

function parseOrNull(s: string): number | null { var m = s.match(/(\d+\.?\d*)/); return m ? parseFloat(m[1]) : null; }
