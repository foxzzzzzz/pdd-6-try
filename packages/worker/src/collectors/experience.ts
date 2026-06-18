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
    const pageHtml = await page.content();
    Object.assign(metrics, parseExperienceMetricsText(pageText));
    mergeDefined(metrics, parseExperienceMetricsHtml(pageHtml));

    await browser.takeScreenshot(storeId, 'experience');
  } catch (err) {
    console.error(`Experience metrics error for ${storeId}:`, err);
  }
  return metrics;
}

export function parseExperienceMetricsText(text: string): Partial<MetricsSnapshot> {
  return {
    expBasic: extractScore(text, '消费者服务体验分'),
    expServiceBasic: extractScore(text, '基础服务体验分'),
    expAttitude: extractScore(text, '服务态度体验分'),
    expProduct: extractScore(text, '商品服务体验分'),
    expShipping: extractScore(text, '发货服务体验分'),
    expLogistics: extractScore(text, '物流服务体验分'),
    expIndustryRankRange: extractIndustryRankRange(text),
    expBasicChange: extractChange(text, '消费者服务体验分'),
    expServiceBasicChange: extractChange(text, '基础服务体验分'),
    expAttitudeChange: extractChange(text, '服务态度体验分'),
    expProductChange: extractChange(text, '商品服务体验分'),
    expShippingChange: extractChange(text, '发货服务体验分'),
    expLogisticsChange: extractChange(text, '物流服务体验分'),
  };
}

export function parseExperienceMetricsHtml(html: string): Partial<MetricsSnapshot> {
  return {
    expBasicChange: extractSignedChangeFromHtml(html, '消费者服务体验分'),
    expServiceBasicChange: extractSignedChangeFromHtml(html, '基础服务体验分'),
    expAttitudeChange: extractSignedChangeFromHtml(html, '服务态度体验分'),
    expProductChange: extractSignedChangeFromHtml(html, '商品服务体验分'),
    expShippingChange: extractSignedChangeFromHtml(html, '发货服务体验分'),
    expLogisticsChange: extractSignedChangeFromHtml(html, '物流服务体验分'),
  };
}

function mergeDefined(target: Partial<MetricsSnapshot>, source: Partial<MetricsSnapshot>): void {
  for (const [key, value] of Object.entries(source)) {
    if (value != null) {
      (target as Record<string, unknown>)[key] = value;
    }
  }
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

function extractChange(text: string, label: string): number | null {
  const idx = findLastIndex(text, label);
  if (idx === -1) return null;
  const sub = text.substring(idx + label.length, idx + label.length + 160);
  const m = sub.match(/较前7日\s*([↑↓+-]|上升|下降)?\s*(\d+\.?\d*)\s*%/);
  if (!m) return null;

  const signToken = m[1] || '';
  if (!signToken) return null;
  const value = parseFloat(m[2]) / 100;
  if (signToken === '↓' || signToken === '-' || signToken === '下降') return -value;
  return value;
}

function extractSignedChangeFromHtml(html: string, label: string): number | null {
  let idx = html.indexOf(label);
  while (idx !== -1) {
    const sub = html.substring(idx, idx + 4000);
    const m = sub.match(/arrow-(up|down)_filled[\s\S]*?>(\d+\.?\d*)\s*%/);
    if (m) {
      const value = parseFloat(m[2]) / 100;
      return m[1] === 'down' ? -value : value;
    }
    idx = html.indexOf(label, idx + label.length);
  }
  return null;
}

function extractIndustryRankRange(text: string): string | null {
  const m = text.match(/本店铺体验分在同行排名\s*(\d+%\s*[-~至]\s*\d+%)/);
  return m ? m[1].replace(/\s+/g, '') : null;
}

function findLastIndex(text: string, label: string): number {
  let idx = -1;
  let searchFrom = 0;
  while (true) {
    const pos = text.indexOf(label, searchFrom);
    if (pos === -1) break;
    idx = pos;
    searchFrom = pos + 1;
  }
  return idx;
}
