/**
 * PDD 后台页面结构采集脚本 v2
 *
 * 改进：不再硬编码 URL，而是登录后从侧边栏提取真实菜单链接
 *
 * 使用: pnpm discover
 */

import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const OUTPUT_DIR = path.resolve('./data/page-discovery');
const COOKIE_FILE = path.resolve('./data/discovery-cookie.json');

// 菜单关键词 → 对应的页面名称
const KEY_PAGES = [
  '评价', '评分', '体验', '售后', '退款', '申诉',
  '数据', 'DSR', '动态', '互动', '物流', '商品',
];

async function discover() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  console.log('=== PDD 后台页面结构采集工具 v2 ===\n');
  console.log('策略：登录 → 提取侧边栏真实菜单 → 逐个访问并截图\n');

  const browser = await chromium.launch({
    headless: false,
    args: ['--disable-blink-features=AutomationControlled'],
  });

  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'zh-CN',
  });

  // Load existing cookies
  if (fs.existsSync(COOKIE_FILE)) {
    try {
      const cookies = JSON.parse(fs.readFileSync(COOKIE_FILE, 'utf-8'));
      await context.addCookies(cookies);
      console.log('已加载 Cookie');
    } catch { /* ignore */ }
  }

  const page = await context.newPage();

  // Listen for console errors
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log(`  [console] ${msg.text().substring(0, 100)}`);
  });

  // ======== LOGIN ========
  console.log('\n📱 打开 PDD 商家后台...');
  await page.goto('https://mms.pinduoduo.com/', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  await page.waitForTimeout(3000);

  const currentUrl = page.url();
  if (currentUrl.includes('login') || currentUrl.includes('passport')) {
    console.log('🔐 请扫码登录（等待 120 秒）...');
    try {
      await page.waitForURL(
        (url) => !url.toString().includes('login') && !url.toString().includes('passport'),
        { timeout: 120000 },
      );
      console.log('✅ 登录成功！');
    } catch {
      console.log('⏰ 登录超时');
      await browser.close();
      process.exit(1);
    }
  } else {
    console.log('✅ Cookie 有效，已登录');
  }

  // Save cookies
  const cookies = await context.cookies();
  fs.writeFileSync(COOKIE_FILE, JSON.stringify(cookies, null, 2));
  console.log(`💾 Cookie 已保存`);

  await page.waitForTimeout(3000);

  // ======== EXTRACT SIDEBAR MENU ========
  console.log('\n📋 正在提取侧边栏菜单...');

  // Try common sidebar selectors
  const sidebarSelectors = [
    '.sidebar', '.side-menu', '.nav-menu', '.ant-menu',
    '[class*="sidebar"]', '[class*="side-menu"]', '[class*="nav"]',
    'aside', 'nav', '.menu-container', '[class*="menu"]',
  ];

  let menuLinks: { text: string; href: string }[] = [];

  for (const selector of sidebarSelectors) {
    try {
      const links = await page.$$eval(`${selector} a[href]`, (els) =>
        els.map((el) => ({
          text: (el as HTMLElement).innerText?.trim().replace(/\s+/g, ' ') || '',
          href: (el as HTMLAnchorElement).href || '',
        })),
      );
      if (links.length > 0) {
        menuLinks = links.filter((l) => l.text && l.href);
        console.log(`  通过 "${selector}" 找到 ${menuLinks.length} 个菜单项`);
        break;
      }
    } catch { /* selector not found */ }
  }

  // Fallback: get ALL links on the page
  if (menuLinks.length === 0) {
    console.log('  侧边栏选择器未匹配，尝试提取页面所有链接...');
    const allLinks = await page.$$eval('a[href]', (els) =>
      els.map((el) => ({
        text: (el as HTMLElement).innerText?.trim().replace(/\s+/g, ' ') || '',
        href: (el as HTMLAnchorElement).href || '',
      })),
    );
    menuLinks = allLinks.filter(
      (l) => l.text.length > 1 && l.text.length < 50 && !l.href.includes('login'),
    );
    console.log(`  找到 ${menuLinks.length} 个有效链接`);
  }

  // Save the extracted menu for reference
  const menuText = menuLinks.map((l) => `  [${l.text}] → ${l.href}`).join('\n');
  console.log('\n--- 发现的菜单链接 ---');
  console.log(menuText);
  fs.writeFileSync(path.join(OUTPUT_DIR, '00-menu-links.txt'), menuText);

  // ======== STEP 1: Save home page ========
  console.log('\n📄 保存首页...');
  await savePageInfo(page, '01-home');
  await page.waitForTimeout(1000);

  // ======== STEP 2: Navigate via menu links ========
  let pageIndex = 2;
  const visited = new Set<string>();

  for (const link of menuLinks) {
    if (visited.has(link.href)) continue;
    visited.add(link.href);

    const safeName = `page-${String(pageIndex).padStart(2, '0')}-${sanitizeFilename(link.text)}`;
    console.log(`\n📄 [${pageIndex}] 访问: ${link.text} → ${link.href}`);

    try {
      // Click the link (more natural than goto, handles SPA navigation)
      await page.goto(link.href, {
        waitUntil: 'domcontentloaded',
        timeout: 15000,
      });
      await page.waitForTimeout(3000);

      // Check if still on a valid page (not redirected to login)
      const newUrl = page.url();
      if (newUrl.includes('login') || newUrl.includes('passport')) {
        console.log('  ⚠️ 会话过期，停止采集');
        break;
      }

      // Check if page loaded meaningfully
      const bodyText = await page.evaluate(() => document.body.innerText?.substring(0, 200) || '');
      if (bodyText.length < 10) {
        console.log('  ⚠️ 页面内容过少，可能加载失败');
      }

      await savePageInfo(page, safeName);
      pageIndex++;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.log(`  ❌ 失败: ${errMsg}`);
    }

    await page.waitForTimeout(800);
  }

  // ======== DONE ========
  console.log(`\n=== 完成：共采集 ${pageIndex - 1} 个页面 ===`);
  console.log(`输出目录: ${OUTPUT_DIR}`);
  console.log(`Cookie: ${COOKIE_FILE}`);
  await browser.close();
}

async function savePageInfo(page: any, name: string) {
  const title = await page.title();
  console.log(`  标题: "${title}"`);

  // Screenshot
  const ssPath = path.join(OUTPUT_DIR, `${name}.png`);
  await page.screenshot({ path: ssPath, fullPage: true });
  console.log(`  📸 ${ssPath}`);

  // HTML (first 80KB)
  const html = await page.content();
  const htmlPath = path.join(OUTPUT_DIR, `${name}.html`);
  fs.writeFileSync(htmlPath, html.substring(0, 80000));
  console.log(`  📝 ${htmlPath}`);

  // Visible text
  const text = await page.evaluate(() => {
    const main = document.querySelector('main, [class*="content"], [class*="main"]');
    return (main as HTMLElement)?.innerText?.substring(0, 5000)
      || document.body.innerText?.substring(0, 5000)
      || '';
  });
  const textPath = path.join(OUTPUT_DIR, `${name}.txt`);
  fs.writeFileSync(textPath, text);
  console.log(`  📄 ${textPath}`);
}

function sanitizeFilename(text: string): string {
  return text
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 30);
}

discover().catch((err) => {
  console.error('采集失败:', err);
  process.exit(1);
});
