/**
 * 消费者体验指标采集 — /sycm/goods_quality/help
 *
 * 策略: 浏览器只负责取文本，Node.js 负责解析（可调试、可单元测试）
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

    // 只取纯文本，解析逻辑放 Node.js 侧
    const pageText: string = await page.evaluate('document.body.innerText || ""');

    metrics.expBasic = extractScore(pageText, '消费者服务体验分');
    metrics.expProduct = extractScore(pageText, '商品服务体验分');
    metrics.expShipping = extractScore(pageText, '发货服务体验分');
    metrics.expLogistics = extractScore(pageText, '物流服务体验分');

    await browser.takeScreenshot(storeId, 'experience');
  } catch (err) {
    console.error(`Experience metrics error for ${storeId}:`, err);
  }
  return metrics;
}

/** 从页面文本中提取"标签 → /5"格式的分数 */
function extractScore(text: string, label: string): number | null {
  // 找到标签最后出现的位置（页面有重复标签，分数通常在后面）
  let idx = -1;
  let searchFrom = 0;
  while (true) {
    const pos = text.indexOf(label, searchFrom);
    if (pos === -1) break;
    idx = pos;
    searchFrom = pos + 1;
  }
  if (idx === -1) return null;

  // 取标签后 150 个字符
  const sub = text.substring(idx + label.length, idx + label.length + 150);

  // 模式1: "1.8 / 5" 或 "1.8/5"
  let m = sub.match(/(\d+\.?\d*)\s*\/\s*5/);
  if (m && parseFloat(m[1]) <= 5) return parseFloat(m[1]);

  // 模式2: "1.8分"
  m = sub.match(/(\d+\.?\d*)\s*分/);
  if (m && parseFloat(m[1]) <= 5 && m[1].length < 4) return parseFloat(m[1]);

  return null;
}
