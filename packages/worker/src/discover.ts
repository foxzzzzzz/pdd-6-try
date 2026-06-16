/**
 * PDD 后台页面结构采集 v4 — 精准导航
 *
 * 根据 v3 发现的侧边栏结构，直接导航到目标页面
 *
 * 侧边栏路径映射:
 *   评价管理   → 商品管理 → 评价管理
 *   互动动态   → 店铺管理 → 种草动态
 *   店铺健康度 → 服务数据 → 综合体验星级(tab)
 *   消费者体验 → 售后管理 → 消费者体验
 *   售后退款   → 售后管理 → 售后工作台
 *   申诉中心   → 商家权益保护 → 售后申诉
 *   数据中心   → 数据中心板块
 */

import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const OUTPUT_DIR = path.resolve('./data/page-discovery');
const COOKIE_FILE = path.resolve('./data/discovery-cookie.json');

// 精准导航: {name, section(分组), item(子菜单项), url(已知URL)}
const TARGETS: { name: string; section: string; item: string; url?: string }[] = [
  // 之前已成功采集的页面略过，仅采集缺失的 2 个
  { name: 'fix-01-种草动态', section: '店铺管理', item: '种草动态' },
  { name: 'fix-02-售后申诉', section: '商家权益保护', item: '售后申诉' },
];

// 服务数据页面下的 tab 页（需要额外点击）
const SERVICE_TABS = [
  '综合体验星级',
  '消费者体验指标',
  '商品领航员',
  '售后数据',
  '评价数据',
  '客服数据',
];

async function discover() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  console.log('=== PDD 后台页面精准采集 v4 ===\n');

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
    console.log('🔐 请扫码登录（120 秒）...');
    try {
      await page.waitForURL(
        (url) => !url.toString().includes('login') && !url.toString().includes('passport'),
        { timeout: 120000 },
      );
      console.log('✅ 登录成功！');
    } catch {
      console.log('⏰ 超时');
      await browser.close();
      process.exit(1);
    }
  }

  const cookies = await context.cookies();
  fs.writeFileSync(COOKIE_FILE, JSON.stringify(cookies, null, 2));
  await page.waitForTimeout(3000);

  // ======== NAVIGATE TO EACH TARGET ========
  for (const target of TARGETS) {
    console.log(`\n📄 ${target.name}: ${target.section} → ${target.item}`);

    try {
      const success = await navigateToItem(page, target.section, target.item);
      if (success) {
        await page.waitForTimeout(2000);
        await savePageFull(page, target.name);
      } else {
        console.log('  ❌ 导航失败');
        await savePageFull(page, `${target.name}-FAILED`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  ❌ ${msg.substring(0, 60)}`);
    }
    await page.waitForTimeout(800);
  }

  // ======== SERVICE DATA TABS ========
  console.log('\n📄 进入服务数据 → 采集各 tab 页...');
  const svcOk = await navigateToItem(page, '数据中心', '服务数据');
  if (svcOk) {
    await page.waitForTimeout(2000);
    await savePageFull(page, '08-服务数据-main');

    for (const tab of SERVICE_TABS) {
      console.log(`  📑 Tab: ${tab}`);
      try {
        const clicked = await clickTab(page, tab);
        if (clicked) {
          await page.waitForTimeout(2000);
          await savePageFull(page, `08b-服务数据-${tab}`);
        }
      } catch (err) {
        console.log(`    ❌ ${String(err).substring(0, 40)}`);
      }
      await page.waitForTimeout(500);
    }
  }

  console.log('\n=== 采集完成 ===');
  console.log(`输出: ${OUTPUT_DIR}`);
  await browser.close();
}

/**
 * 在侧边栏中：先展开分组(section)，再点击子菜单项(item)
 */
async function navigateToItem(page: any, section: string, item: string): Promise<boolean> {
  // Step 1: Try clicking the section header to expand it
  const sectionClicked = await clickSidebarText(page, section);
  if (sectionClicked) {
    console.log(`  📂 点击分组: ${section}`);
    await page.waitForTimeout(800);
  } else {
    console.log(`  ⚠️ 分组未找到或不可点击: ${section}，尝试直接点击子项`);
  }

  // Step 2: Try clicking the sub-item (multiple attempts)
  for (let attempt = 0; attempt < 3; attempt++) {
    const itemClicked = await clickSidebarText(page, item);
    if (itemClicked) {
      console.log(`  ✅ 点击菜单: ${item}`);
      return true;
    }
    // Scroll sidebar to reveal more items and retry
    if (attempt < 2) {
      await page.evaluate(() => {
        const nav = document.querySelector('nav, aside, [class*="sidebar"], [class*="menu"]');
        if (nav) nav.scrollBy(0, 200);
      });
      await page.waitForTimeout(500);
    }
  }

  console.log(`  ❌ 菜单项未找到: ${item}`);
  return false;
}

/**
 * 在侧边栏中查找并点击包含指定文本的元素
 */
async function clickSidebarText(page: any, text: string): Promise<boolean> {
  // First, try to scroll the sidebar to find the text
  const sidebarSelectors = [
    'nav', 'aside', '[class*="sidebar"]', '[class*="menu"]',
    '[class*="sider"]', '[class*="nav"]',
  ];

  // Find the sidebar and scroll through it
  for (const sidebarSel of sidebarSelectors) {
    try {
      const sidebar = await page.$(sidebarSel);
      if (!sidebar) continue;

      // Scroll the sidebar all the way down to reveal all items
      await sidebar.evaluate((el: HTMLElement) => {
        el.scrollTop = 0;
        el.scrollTo(0, el.scrollHeight);
      });
      await page.waitForTimeout(300);
      await sidebar.evaluate((el: HTMLElement) => el.scrollTo(0, 0));
      await page.waitForTimeout(300);
    } catch { /* continue */ }
  }

  // Now search for the element with matching text
  const selectors = [
    'nav a', 'aside a', '[class*="sidebar"] a', '[class*="menu"] a',
    '[class*="sider"] a', '[class*="nav"] a',
    'nav span', 'aside span', '[class*="menu"] span',
    '[class*="sider"] span', 'nav li', 'aside li', '[class*="menu"] li',
  ];

  for (const sel of selectors) {
    try {
      const elements = await page.$$(sel);
      for (const el of elements) {
        const elText = (await el.innerText())?.trim();
        if (elText === text) {
          // Check visibility and scroll if needed
          const isVisible = await el.evaluate((e: HTMLElement) => {
            const rect = e.getBoundingClientRect();
            return rect.top >= 0 && rect.bottom <= window.innerHeight;
          });

          if (!isVisible) {
            // Scroll the parent container
            await el.evaluate((e: HTMLElement) => {
              e.scrollIntoView({ block: 'center', behavior: 'instant' });
            });
            await page.waitForTimeout(300);
          }

          await el.click({ timeout: 3000 });
          await page.waitForTimeout(800);
          return true;
        }
      }
    } catch { /* continue */ }
  }

  return false;
}

/**
 * 点击页面内的 tab 标签
 */
async function clickTab(page: any, tabName: string): Promise<boolean> {
  const tabSelectors = [
    '[class*="tab"]',
    '[role="tab"]',
    '[class*="ant-tabs-tab"]',
    '.tab-item',
    '[class*="tabs"] > *',
  ];

  for (const sel of tabSelectors) {
    try {
      const tabs = await page.$$(sel);
      for (const tab of tabs) {
        const text = (await tab.innerText())?.trim();
        if (text === tabName) {
          await tab.click({ timeout: 3000 });
          return true;
        }
      }
    } catch { /* continue */ }
  }

  return false;
}

/**
 * 保存页面信息（只保存主内容区，排除侧边栏）
 */
async function savePageFull(page: any, name: string) {
  const url = page.url();
  const title = await page.title();

  // Screenshot
  const ssPath = path.join(OUTPUT_DIR, `${name}.png`);
  await page.screenshot({ path: ssPath, fullPage: false });
  console.log(`  📸 ${ssPath}`);

  // Extract main content area text (exclude sidebar)
  const contentText = await page.evaluate(() => {
    // Try to get main content only
    const main = document.querySelector(
      'main, [class*="main-content"], [class*="content-wrap"], [class*="page-content"], .ant-layout-content, [class*="body"]',
    );
    if (main) return (main as HTMLElement).innerText?.substring(0, 8000) || '';

    // Fallback: get body text without nav/aside
    const body = document.body.cloneNode(true) as HTMLElement;
    body.querySelectorAll('nav, aside, [class*="sidebar"], [class*="sider"]').forEach((el) => el.remove());
    return body.innerText?.substring(0, 8000) || '';
  });

  const txtPath = path.join(OUTPUT_DIR, `${name}.txt`);
  fs.writeFileSync(txtPath, `URL: ${url}\nTitle: ${title}\n\n${contentText}`);

  // Save HTML (main content area, limited size)
  const htmlPath = path.join(OUTPUT_DIR, `${name}.html`);
  const html = await page.content();
  fs.writeFileSync(htmlPath, html.substring(0, 80000));
}

discover().catch((err) => {
  console.error('采集失败:', err);
  process.exit(1);
});
