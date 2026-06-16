/**
 * PDD 后台页面结构采集脚本 v3
 *
 * 策略：登录后点击侧边栏菜单，逐一发现所有功能页面
 * PDD 是 SPA 应用，URL 无法硬编码猜测，必须通过 UI 导航
 *
 * 使用: pnpm discover
 */

import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const OUTPUT_DIR = path.resolve('./data/page-discovery');
const COOKIE_FILE = path.resolve('./data/discovery-cookie.json');

async function discover() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  console.log('=== PDD 后台页面结构采集工具 v3 ===\n');
  console.log('策略：登录 → 点击侧边栏菜单 → 逐个页面截图\n');

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

  if (fs.existsSync(COOKIE_FILE)) {
    try {
      const cookies = JSON.parse(fs.readFileSync(COOKIE_FILE, 'utf-8'));
      await context.addCookies(cookies);
      console.log('已加载 Cookie');
    } catch { /* ignore */ }
  }

  const page = await context.newPage();

  // ======== LOGIN ========
  console.log('📱 打开 PDD 商家后台...');
  await page.goto('https://mms.pinduoduo.com/', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  await page.waitForTimeout(3000);

  if (page.url().includes('login') || page.url().includes('passport')) {
    console.log('🔐 请扫码登录（等 120 秒）...');
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
    console.log('✅ Cookie 有效');
  }

  const cookies = await context.cookies();
  fs.writeFileSync(COOKIE_FILE, JSON.stringify(cookies, null, 2));
  await page.waitForTimeout(3000);

  // ======== PHASE 1: 抓取首页数据 ========
  console.log('\n📄 保存首页...');
  await savePage(page, '01-home');
  const homeUrl = page.url();
  console.log(`  首页 URL: ${homeUrl}`);

  // ======== PHASE 2: 发现侧边栏一级菜单 ========
  console.log('\n📋 === 发现侧边栏菜单结构 ===');

  // 找侧边栏：尝试多种选择器
  const sidebarSel = await findSidebar(page);
  if (!sidebarSel) {
    console.log('❌ 找不到侧边栏，保存首页源码供分析');
    const html = await page.content();
    fs.writeFileSync(path.join(OUTPUT_DIR, 'home-full-source.html'), html);
    await browser.close();
    return;
  }

  // 获取一级菜单项
  const topMenus = await page.$$eval(
    `${sidebarSel} > * > *:first-child, ${sidebarSel} [class*="menu-item"]:not([class*="sub"])`,
    (els) =>
      els.map((el) => ({
        text: (el as HTMLElement).innerText?.trim().split('\n')[0] || '',
        className: (el as HTMLElement).className || '',
        tagName: (el as HTMLElement).tagName,
      })),
  );

  console.log(`发现 ${topMenus.length} 个一级菜单项:`);
  topMenus.forEach((m) => console.log(`  · ${m.text}`));

  // 给用户确认 — 是否要我开始逐一点击？
  console.log('\n⚠️  即将自动逐一点击菜单项来采集各页面');
  console.log('   每个页面停留 3 秒，整个过程约 1-2 分钟');
  console.log('   请勿操作鼠标键盘...\n');

  await page.waitForTimeout(2000);

  // ======== PHASE 3: 逐一点击每个菜单项 ========
  let pageIndex = 2;

  // 关键菜单关键词 -> 重点关注的页面
  const IMPORTANT_KEYWORDS = [
    '评价', '评分', '体验', '售后', '退款', '申诉',
    '数据', '动态', '互动', '商品', '订单', '物流',
    'DSR', '星级', '店铺', '客服',
  ];

  // 展开所有一级菜单，收集所有子菜单项
  console.log('\n📋 展开所有菜单...');

  // 先点击每个一级菜单展开
  const menuItems = await page.$$(
    `${sidebarSel} [class*="menu-item"], ${sidebarSel} li, ${sidebarSel} [class*="nav-item"]`,
  );

  // 限制数量，防止无限展开
  const maxItems = Math.min(menuItems.length, 30);

  for (let i = 0; i < maxItems; i++) {
    try {
      const item = menuItems[i];
      const text = (await item.innerText())?.trim().split('\n')[0]?.substring(0, 40) || '';

      // Skip empty, header, or non-navigable items
      if (!text || text.includes('客户端') || text.includes('跨境')) continue;

      console.log(`\n📄 [${pageIndex}] 点击: ${text}`);

      // Scroll into view and click
      await item.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);

      // 获取点击前的URL
      const urlBefore = page.url();

      try {
        await item.click({ timeout: 5000 });
      } catch {
        // Try clicking the inner element
        try {
          const inner = await item.$('a, span, div');
          if (inner) await inner.click({ timeout: 3000 });
        } catch {
          console.log('  ⚠️ 无法点击，跳过');
          continue;
        }
      }

      await page.waitForTimeout(2500);

      // Check if URL changed
      const urlAfter = page.url();
      const urlChanged = urlBefore !== urlAfter;

      const safeName = `page-${String(pageIndex).padStart(2, '0')}-${sanitize(text)}`;
      console.log(`  URL: ${urlAfter}${urlChanged ? ' ✅' : ' (未变化，可能是展开/折叠)'}`);

      await savePage(page, safeName);

      // Check for new sub-menu items after expanding
      if (!urlChanged) {
        // This was a parent menu — check for newly visible sub-items
        // (handled in next iteration since they're now visible)
      }

      pageIndex++;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.log(`  ❌ ${errMsg.substring(0, 50)}`);
    }

    await page.waitForTimeout(500);
  }

  // ======== DONE ========
  console.log(`\n=== 完成 ===`);
  console.log(`共采集 ${pageIndex - 1} 个页面`);
  console.log(`输出: ${OUTPUT_DIR}`);
  console.log(`Cookie: ${COOKIE_FILE}`);

  await browser.close();
}

async function findSidebar(page: any): Promise<string | null> {
  const candidates = [
    'nav',
    'aside',
    '[class*="sidebar"]',
    '[class*="side-menu"]',
    '[class*="sider"]',
    '[class*="nav-menu"]',
    '[class*="left-menu"]',
    '.ant-layout-sider',
    '[class*="menu-wrap"]',
    '[class*="menu-container"]',
  ];

  for (const sel of candidates) {
    try {
      const el = await page.$(sel);
      if (el) {
        const text = (await el.innerText()) || '';
        if (text.length > 20) {
          console.log(`  侧边栏: "${sel}" (${text.length} chars)`);
          return sel;
        }
      }
    } catch { /* continue */ }
  }

  return null;
}

async function savePage(page: any, name: string) {
  const title = await page.title();
  const url = page.url();

  // Screenshot
  const ssPath = path.join(OUTPUT_DIR, `${name}.png`);
  await page.screenshot({ path: ssPath, fullPage: false });
  console.log(`  📸 ${ssPath}`);

  // URL record
  const infoPath = path.join(OUTPUT_DIR, `${name}.txt`);
  const bodyText = await page.evaluate(() => document.body.innerText?.substring(0, 3000) || '');
  fs.writeFileSync(infoPath, `URL: ${url}\nTitle: ${title}\n\n${bodyText}`);
}

function sanitize(text: string): string {
  return text
    .replace(/[<>:"/\\|?*\n\r]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 25);
}

discover().catch((err) => {
  console.error('采集失败:', err);
  process.exit(1);
});
