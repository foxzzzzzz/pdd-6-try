/**
 * 消费者体验指标采集
 * URL: /sycm/goods_quality/help
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

    // 消费者服务体验分 (总分)
    const totalText = await extractMetric(page, '消费者服务体验分');
    if (totalText) {
      const m = totalText.match(/(\d+\.?\d*)\s*\/\s*5/);
      if (m) metrics.expBasic = parseFloat(m[1]);
    }

    // 各项分子
    metrics.expProduct = await extractSubScore(page, '商品服务体验分');
    metrics.expShipping = await extractSubScore(page, '发货服务体验分');
    metrics.expLogistics = await extractSubScore(page, '物流服务体验分');

    // 服务态度 + 基础服务
    const serviceScore = await extractSubScore(page, '服务态度体验分');
    const basicScore = await extractSubScore(page, '基础服务体验分');

    await browser.takeScreenshot(storeId, 'experience');
  } catch (err) {
    console.error(`Experience metrics error for ${storeId}:`, err);
  }

  return metrics;
}

/** 提取带标签的数值 */
async function extractMetric(page: any, label: string): Promise<string | null> {
  return page.evaluate((labelText: string) => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node: Text | null;
    while ((node = walker.nextNode() as Text | null)) {
      const text = node.textContent?.trim() || '';
      if (text === labelText || text.startsWith(labelText)) {
        // Get parent chain text context
        let parent = node.parentElement;
        for (let i = 0; i < 5 && parent; i++) {
          const full = (parent as HTMLElement).innerText?.trim() || '';
          if (full.length > labelText.length + 3 && /\d/.test(full)) {
            return full;
          }
          parent = parent.parentElement;
        }
      }
    }
    return null;
  }, label);
}

/** 提取子分数 */
async function extractSubScore(page: any, label: string): Promise<number | null> {
  const text = await extractMetric(page, label);
  if (text) {
    const m = text.match(/(\d+\.?\d*)\s*分?/);
    if (m) return parseFloat(m[1]);
  }
  return null;
}
