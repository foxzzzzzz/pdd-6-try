/**
 * 售后/退款数据采集
 * URL: /aftersales/aftersale_list
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

    // 消费者服务体验分 (售后工作台也展示)
    const expText = await extractTextNear(page, '消费者服务体验分');
    if (expText) {
      const m = expText.match(/(\d+\.?\d*)\s*\/\s*5/);
      if (m) metrics.refundDuration = parseFloat(m[1]); // 复用字段，体验分总览
    }

    // 退款率/纠纷率 — 从售后数据区域提取
    const refundData = await page.evaluate(() => {
      const result: Record<string, string> = {};
      // Find all number-value pairs
      const texts = document.body.innerText?.split('\n').filter(Boolean) || [];
      const keyPairs = [
        '24小时内将逾期订单数', '24小时内待商家举证',
        '24小时内平台同意退款', '24小时内将逾期工单数',
        '投诉预警', '待处理即将逾期', '待商家处理',
        '待举证即将逾期', '待商家举证', '买家催处理',
      ];
      for (const key of keyPairs) {
        const idx = texts.findIndex((t) => t.includes(key));
        if (idx >= 0) {
          result[key] = texts[idx];
        }
      }
      return result;
    });

    await browser.takeScreenshot(storeId, 'refunds');
  } catch (err) {
    console.error(`Refund metrics error for ${storeId}:`, err);
  }

  return metrics;
}

async function extractTextNear(page: any, label: string): Promise<string | null> {
  return page.evaluate((labelText: string) => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node: Text | null;
    while ((node = walker.nextNode() as Text | null)) {
      if (node.textContent?.trim() === labelText) {
        const parent = node.parentElement;
        if (parent) return (parent as HTMLElement).innerText?.trim() || null;
      }
    }
    return null;
  }, label);
}
