/**
 * PDD 后台页面结构采集脚本
 *
 * 用途: 登录后自动遍历各个后台页面，保存截图和 HTML 结构，
 *       用于分析页面 DOM 结构，更新 CSS 选择器。
 *
 * 使用方式:
 *   npx tsx packages/worker/src/discover.ts
 *
 * 流程:
 *   1. 打开浏览器 → PDD 登录页
 *   2. 等待你手动扫码/验证码登录（最多 2 分钟）
 *   3. 自动遍历:
 *      - 评价管理页
 *      - 店铺评分/DSR 页
 *      - 消费者体验页
 *      - 售后/退款页
 *      - 申诉中心
 *      - 互动动态页
 *   4. 每页保存: 截图(.png) + HTML(.html) + 文本内容(.txt)
 *   5. 保存 Cookie 到文件
 */

import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const OUTPUT_DIR = path.resolve('./data/page-discovery');
const COOKIE_FILE = path.resolve('./data/discovery-cookie.json');

// 要采集的页面列表
const PAGES_TO_DISCOVER: { name: string; url: string }[] = [
  { name: '01-home', url: 'https://mms.pinduoduo.com/' },
  { name: '02-reviews', url: 'https://mms.pinduoduo.com/goods/reviews/list' },
  { name: '03-interactions', url: 'https://mms.pinduoduo.com/social/interaction' },
  { name: '04-store-score', url: 'https://mms.pinduoduo.com/mall/score' },
  { name: '05-dsr', url: 'https://mms.pinduoduo.com/mall/dsr' },
  { name: '06-experience', url: 'https://mms.pinduoduo.com/mall/experience' },
  { name: '07-refund', url: 'https://mms.pinduoduo.com/after-sales/refund' },
  { name: '08-appeal', url: 'https://mms.pinduoduo.com/appeal/center' },
  { name: '09-data-center', url: 'https://mms.pinduoduo.com/data/center' },
];

async function discover() {
  // Ensure output directory
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  console.log('=== PDD 后台页面结构采集工具 ===\n');

  const browser = await chromium.launch({
    headless: false, // 必须可见，让你扫码登录
    args: ['--disable-blink-features=AutomationControlled'],
  });

  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'zh-CN',
  });

  // Try to load existing cookies
  if (fs.existsSync(COOKIE_FILE)) {
    try {
      const cookies = JSON.parse(fs.readFileSync(COOKIE_FILE, 'utf-8'));
      await context.addCookies(cookies);
      console.log('已加载保存的 Cookie');
    } catch {
      console.log('Cookie 文件无效，将重新登录');
    }
  }

  const page = await context.newPage();

  // ======== STEP 1: LOGIN ========
  console.log('\n📱 正在打开 PDD 商家登录页...');
  await page.goto('https://mms.pinduoduo.com/', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });

  // Check if already logged in
  await page.waitForTimeout(3000);
  const currentUrl = page.url();

  if (currentUrl.includes('login') || currentUrl.includes('passport')) {
    console.log('\n🔐 需要登录 — 请在浏览器中扫码或输入验证码');
    console.log('   等待你完成登录...（最多 120 秒）\n');

    try {
      // Wait for login to complete (URL changes away from login page)
      await page.waitForURL(
        (url) => !url.toString().includes('login') && !url.toString().includes('passport'),
        { timeout: 120000 },
      );
      console.log('✅ 登录成功！');
    } catch {
      console.log('⏰ 登录超时，请重试');
      await browser.close();
      process.exit(1);
    }
  } else {
    console.log('✅ Cookie 有效，已登录');
  }

  // Save cookies after login
  const cookies = await context.cookies();
  fs.writeFileSync(COOKIE_FILE, JSON.stringify(cookies, null, 2));
  console.log(`💾 Cookie 已保存到: ${COOKIE_FILE}`);

  // Wait a moment for the page to fully load
  await page.waitForTimeout(2000);

  // ======== STEP 2: DISCOVER PAGES ========
  for (const { name, url } of PAGES_TO_DISCOVER) {
    console.log(`\n📄 正在采集: ${name} → ${url}`);

    try {
      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      });

      // Wait for content to render
      await page.waitForTimeout(3000);

      // Check if we got redirected to login (session expired)
      const currentUrl = page.url();
      if (currentUrl.includes('login') || currentUrl.includes('passport')) {
        console.log(`  ⚠️ 会话过期，需要重新登录`);
        break;
      }

      // Check if page loaded properly (not 404 or blank)
      const title = await page.title();
      console.log(`  页面标题: "${title}"`);

      // Save screenshot
      const screenshotPath = path.join(OUTPUT_DIR, `${name}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.log(`  📸 截图: ${screenshotPath}`);

      // Save HTML source (first 50KB)
      const html = await page.content();
      const htmlPath = path.join(OUTPUT_DIR, `${name}.html`);
      fs.writeFileSync(htmlPath, html.substring(0, 50000));
      console.log(`  📝 HTML: ${htmlPath} (${Math.min(html.length, 50000)} bytes)`);

      // Save text content (extract readable text)
      const textContent = await page.evaluate(() => {
        // Get all visible text, organized by section
        const sections: string[] = [];

        // Find all tables
        document.querySelectorAll('table, [class*="table"], [class*="list"]').forEach((el, i) => {
          const text = (el as HTMLElement).innerText?.trim();
          if (text && text.length > 5) {
            sections.push(`--- Table ${i + 1} ---\n${text}`);
          }
        });

        // Find all key-value pairs (spans with numbers)
        const numbers: string[] = [];
        document
          .querySelectorAll('[class*="value"], [class*="score"], [class*="rate"], [class*="num"], [class*="count"]')
          .forEach((el) => {
            const text = (el as HTMLElement).innerText?.trim();
            if (text) numbers.push(text);
          });

        if (numbers.length > 0) {
          sections.push(`--- Numbers/Values ---\n${numbers.join('\n')}`);
        }

        // Get main content area text
        const mainContent = document.querySelector('main, [class*="content"], [class*="main"], .ant-layout-content');
        if (mainContent) {
          const text = (mainContent as HTMLElement).innerText?.trim();
          if (text) {
            sections.push(`--- Main Content ---\n${text.substring(0, 3000)}`);
          }
        }

        return sections.join('\n\n') || document.body.innerText?.substring(0, 3000) || '(empty page)';
      });

      const textPath = path.join(OUTPUT_DIR, `${name}.txt`);
      fs.writeFileSync(textPath, textContent);
      console.log(`  📄 文本: ${textPath} (${textContent.length} chars)`);

      // Print key findings
      const dataPoints = textContent.match(/[0-9]+(\.[0-9]+)?%?/g) || [];
      if (dataPoints.length > 0) {
        console.log(`  🔢 发现数值: ${dataPoints.slice(0, 10).join(', ')}`);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.log(`  ❌ 错误: ${errMsg}`);
    }

    // Small delay between pages
    await page.waitForTimeout(1000);
  }

  // ======== DONE ========
  console.log('\n=== 采集完成 ===');
  console.log(`所有文件保存在: ${OUTPUT_DIR}`);
  console.log(`Cookie 保存在: ${COOKIE_FILE}`);
  console.log('\n请将 screenshots 目录下的截图分享给我，我会据此更新选择器。');

  await browser.close();
}

discover().catch((err) => {
  console.error('采集失败:', err);
  process.exit(1);
});
