/**
 * 店铺健康度采集 — 综合体验星级页面
 * URL: /sycm/goods_quality/pilot_mall
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
    // 导航到服务数据 → 综合体验星级 tab
    await browser.navigateWithRetry('https://mms.pinduoduo.com/sycm/goods_quality/pilot_mall');
    await page.waitForTimeout(3000);

    // 店铺综合体验星级 (e.g. "4.5 星")
    const starText = await extractByLabel(page, '店铺综合体验星级');
    if (starText) {
      const m = starText.match(/(\d+\.?\d*)/);
      if (m) metrics.rating = parseFloat(m[1]);
    }

    // 较前1天变化
    const changeText = await extractByLabel(page, '较前1天');
    if (changeText) {
      const m = changeText.match(/([+-]?\d+\.?\d*)/);
      if (m) metrics.ratingChange = parseFloat(m[1]);
    }

    // 近30天严重劣质率
    const defectText = await extractByLabel(page, '近30天严重劣质率');
    if (defectText) {
      const m = defectText.match(/(\d+\.?\d*)%?/);
      if (m) metrics.defectRate = parseFloat(m[1]) / (defectText.includes('%') ? 100 : 1);
    }

    // DSR 维度: 从"维度指标表现明细"表格提取
    const dsrData = await extractTableData(page);
    metrics.dsrDesc = dsrData['近90天用户评价得分排名'];
    metrics.dsrService = dsrData['近30天3分钟人工回复率'];
    metrics.dsrLogistics = dsrData['近30天成团-签收时效'];

    // 排名
    const rankText = await extractByLabel(page, '领航员综合分行业排名');
    if (rankText) {
      metrics.dsrRankChange = rankText;
    }

    await browser.takeScreenshot(storeId, 'metrics');
  } catch (err) {
    console.error(`Store metrics error for ${storeId}:`, err);
  }

  return metrics;
}

/** 在页面中查找包含 label 文本的元素，返回其后的数值文本 */
async function extractByLabel(page: any, label: string): Promise<string | null> {
  return page.evaluate((labelText: string) => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node: Text | null;
    while ((node = walker.nextNode() as Text | null)) {
      const text = node.textContent?.trim() || '';
      if (text.includes(labelText)) {
        // Get the parent element's full text
        const parentText = (node.parentElement as HTMLElement)?.innerText?.trim() || '';
        return parentText;
      }
    }
    return null;
  }, label);
}

/** 提取考核指标表格数据 */
async function extractTableData(page: any): Promise<Record<string, number | null>> {
  return page.evaluate(() => {
    const result: Record<string, number | null> = {};
    const rows = document.querySelectorAll('tr, [class*="row"], [class*="table"] tr');
    rows.forEach((row) => {
      const cells = Array.from(row.querySelectorAll('td, th, [class*="cell"]'));
      const texts = cells.map((c) => (c as HTMLElement).innerText?.trim() || '');
      // Find metric name + value pairs
      for (let i = 0; i < texts.length - 1; i++) {
        const name = texts[i];
        const valMatch = texts[i + 1]?.match(/(\d+\.?\d*)%?/);
        if (valMatch && name.length > 2) {
          const val = parseFloat(valMatch[1]);
          result[name] = texts[i + 1]?.includes('%') ? val / 100 : val;
        }
      }
    });
    return result;
  });
}
