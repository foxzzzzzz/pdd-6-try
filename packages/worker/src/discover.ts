/**
 * PDD 后台页面采集 v5 — 修复侧边栏深层导航
 *
 * 变更: 放弃 Playwright 选择器点击，改用 page.evaluate 直接操作 DOM
 *
 * 申诉页面说明:
 *   订单申诉   → 店铺管理 → 订单申诉   (日常巡店关注)
 *   售后申诉   → 商家权益保护 → 售后申诉 (售后场景)
 *   异常单申诉 → 商家权益保护 → 异常单申诉 (异常订单)
 */

import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const OUTPUT_DIR = path.resolve('./data/page-discovery');
const COOKIE_FILE = path.resolve('./data/discovery-cookie.json');

// 本次只采集之前失败的页面
const TARGETS = [
  { name: '种草动态', section: '店铺管理' },
  { name: '订单申诉', section: '店铺管理' },
  { name: '售后申诉', section: '商家权益保护' },
  { name: '异常单申诉', section: '商家权益保护' },
];

async function discover() {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  console.log('=== PDD 页面采集 v5 ===\n');

  const browser = await chromium.launch({
    headless: false,
    args: ['--disable-blink-features=AutomationControlled'],
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'zh-CN',
  });

  if (fs.existsSync(COOKIE_FILE)) {
    try {
      const cookies = JSON.parse(fs.readFileSync(COOKIE_FILE, 'utf-8'));
      await context.addCookies(cookies);
    } catch { /* */ }
  }

  const page = await context.newPage();

  // Login
  console.log('📱 打开 PDD 商家后台...');
  await page.goto('https://mms.pinduoduo.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);

  if (page.url().includes('login') || page.url().includes('passport')) {
    console.log('🔐 请扫码登录（120 秒）...');
    try {
      await page.waitForURL(
        (url) => !url.toString().includes('login') && !url.toString().includes('passport'),
        { timeout: 120000 },
      );
    } catch {
      console.log('⏰ 登录超时');
      await browser.close();
      process.exit(1);
    }
  }
  console.log('✅ 已登录');

  const cookies = await context.cookies();
  fs.writeFileSync(COOKIE_FILE, JSON.stringify(cookies, null, 2));
  await page.waitForTimeout(3000);

  // ======== NAVIGATE ========
  for (const t of TARGETS) {
    console.log(`\n--- ${t.name} (${t.section}) ---`);

    // 菜单默认已展开，直接点击子项即可
    const clicked = await clickByText(page, t.name);
    if (clicked) {
      console.log(`  ✅ ${t.name} 已点击`);
      await page.waitForTimeout(2500);
      await savePage(page, t.name);
    } else {
      console.log(`  ❌ 未找到 ${t.name}`);
      // Save current page for debugging
      await savePage(page, `${t.name}-FAILED`);
    }
    await page.waitForTimeout(500);
  }

  console.log('\n=== 采集完成 ===');
  await browser.close();
}

/**
 * 在页面中查找包含 exactText 的元素并点击
 * 核心：用 page.evaluate 遍历 DOM 找到精确匹配的文本节点，逐层向上找可点击元素
 */
async function clickByText(page: any, exactText: string): Promise<boolean> {
  const result = await page.evaluate((text: string) => {
    // Walk through all text-containing elements
    const allElements = document.querySelectorAll(
      'a, span, div, li, button, [class*="menu"], [class*="nav"], [class*="item"], [class*="title"]',
    );

    for (const el of allElements) {
      // Check if this element's OWN text (not children) matches exactly
      // We use childNodes to check direct text content
      const ownText = Array.from(el.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent?.trim())
        .join('');

      // Also check if element has a single text child
      const allText = (el as HTMLElement).innerText?.trim() || '';

      if (ownText === text || allText === text) {
        // Found exact match — now try to click it
        const htmlEl = el as HTMLElement;

        // Scroll into view
        htmlEl.scrollIntoView({ block: 'center', behavior: 'instant' });

        // Try to find a clickable ancestor (or self)
        let clickTarget: HTMLElement = htmlEl;
        let depth = 0;
        while (clickTarget && depth < 5) {
          const tag = clickTarget.tagName.toLowerCase();
          const hasHref = clickTarget.hasAttribute('href');
          const isClickable = tag === 'a' || tag === 'button' || hasHref ||
            clickTarget.onclick !== null ||
            clickTarget.getAttribute('role') === 'button' ||
            clickTarget.style.cursor === 'pointer';

          if (isClickable) break;
          clickTarget = clickTarget.parentElement as HTMLElement;
          depth++;
        }

        // Click it
        clickTarget.click();

        // Return useful debug info
        return {
          found: true,
          tag: htmlEl.tagName,
          clickTag: clickTarget.tagName,
          className: htmlEl.className?.substring(0, 50) || '',
          boundingTop: htmlEl.getBoundingClientRect().top,
        };
      }
    }

    return { found: false };
  }, exactText);

  if (result.found) {
    console.log(`    [${result.tag}→${result.clickTag} top=${Math.round(result.boundingTop)}]`);
    return true;
  }
  return false;
}

async function savePage(page: any, name: string) {
  const url = page.url();
  const title = await page.title();
  const safeName = name.replace(/[<>:"/\\|?*]/g, '-').substring(0, 40);

  // Screenshot
  const ssPath = path.join(OUTPUT_DIR, `${safeName}.png`);
  await page.screenshot({ path: ssPath, fullPage: false });
  console.log(`  📸 ${ssPath}`);

  // Extract main content (exclude sidebar)
  const text = await page.evaluate(() => {
    const main = document.querySelector(
      'main, [class*="main-content"], [class*="content-wrap"], [class*="page-content"], .ant-layout-content',
    );
    return (main as HTMLElement)?.innerText?.substring(0, 6000)
      || document.body.innerText?.substring(0, 6000)
      || '';
  });

  const txtPath = path.join(OUTPUT_DIR, `${safeName}.txt`);
  fs.writeFileSync(txtPath, `URL: ${url}\nTitle: ${title}\n\n${text}`);
}

discover().catch((err) => {
  console.error('采集失败:', err);
  process.exit(1);
});
