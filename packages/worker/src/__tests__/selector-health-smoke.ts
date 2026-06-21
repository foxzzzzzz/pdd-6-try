import { getDb } from '@pdd-inspector/core';
import { chromium, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { buildBrowserRuntimeOptions } from '../browser';
import { evaluateSelectorHealth, recordSelectorHealthEvent, SelectorCheckResult, SelectorModuleKey } from '../selector-health';

const COOKIE_FILE = path.resolve('./data/discovery-cookie.json');
const OUTPUT_DIR = path.resolve('./data/selector-health');
const REPORT_FILE = path.resolve('../../docs/test-reports/selector-health-smoke.md');

type Target = {
  moduleKey: SelectorModuleKey;
  moduleName: string;
  url: string;
  requiredText: string[];
};

const TARGETS: Target[] = [
  {
    moduleKey: 'pilot_mall',
    moduleName: '综合体验星级',
    url: 'https://mms.pinduoduo.com/sycm/goods_quality/pilot_mall',
    requiredText: ['服务数据', '店铺综合体验星级', '维度指标表现明细', '领航员综合分行业排名'],
  },
  {
    moduleKey: 'experience',
    moduleName: '消费者体验指标',
    url: 'https://mms.pinduoduo.com/sycm/goods_quality/help',
    requiredText: ['消费者服务体验分', '基础服务体验分', '商品服务体验分', '物流服务体验分'],
  },
  {
    moduleKey: 'refunds',
    moduleName: '售后数据',
    url: 'https://mms.pinduoduo.com/sycm/goods_quality/detail',
    requiredText: ['纠纷退款率', '平台介入率', '品质退款率', '平均退款时长'],
  },
  {
    moduleKey: 'comment',
    moduleName: '评价数据',
    url: 'https://mms.pinduoduo.com/sycm/goods_quality/comment',
    requiredText: ['店铺评价分排名', '评价数', '积极评论率'],
  },
  {
    moduleKey: 'reviews',
    moduleName: '评价管理',
    url: 'https://mms.pinduoduo.com/goods/evaluation/index?msfrom=mms_sidenav',
    requiredText: ['评价管理', '评价详情', '回复/互动', '举报'],
  },
  {
    moduleKey: 'interactions',
    moduleName: '评价互动',
    url: 'https://mms.pinduoduo.com/goods/evaluation/index?msfrom=mms_sidenav',
    requiredText: ['评价管理', '查看全部互动'],
  },
];

async function main() {
  ensureDir(OUTPUT_DIR);
  ensureDir(path.dirname(REPORT_FILE));
  const db = await getDb();
  const runtime = buildBrowserRuntimeOptions({ headless: process.env.SELECTOR_HEALTH_HEADLESS === 'true' });
  const browser = await chromium.launch({
    headless: runtime.headless,
    args: runtime.args,
    ...(runtime.channel ? { channel: runtime.channel } : {}),
  });
  const context = await browser.newContext(runtime.contextOptions);

  if (fs.existsSync(COOKIE_FILE)) {
    try {
      await context.addCookies(JSON.parse(fs.readFileSync(COOKIE_FILE, 'utf-8')));
    } catch {
      // Ignore stale cookie cache.
    }
  }

  const page = await context.newPage();
  const rows: string[] = [];
  try {
    await login(page);
    fs.writeFileSync(COOKIE_FILE, JSON.stringify(await context.cookies(), null, 2), 'utf-8');

    for (const target of TARGETS) {
      console.log(`Smoke checking ${target.moduleName}: ${target.url}`);
      await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3000);

      const text = await page.evaluate(() => document.body.innerText || '');
      const checks: SelectorCheckResult[] = target.requiredText.map((label) => ({
        name: label,
        ok: text.includes(label),
        detail: text.includes(label) ? 'found' : 'missing',
      }));
      const evaluation = evaluateSelectorHealth(target.moduleKey, target.moduleName, checks);
      const basename = `${target.moduleKey}-${Date.now()}`;
      const screenshotPath = path.join(OUTPUT_DIR, `${basename}.png`);
      const htmlPath = path.join(OUTPUT_DIR, `${basename}.html`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      fs.writeFileSync(htmlPath, await page.content(), 'utf-8');
      recordSelectorHealthEvent(db, { ...evaluation, screenshotPath, htmlPath });

      for (const check of checks) {
        rows.push(`| ${target.moduleName} | ${check.name} | ${check.ok ? 'OK' : 'FAIL'} | ${check.detail || ''} |`);
      }
      console.log(`  ${evaluation.status}: ${evaluation.failedChecks}/${evaluation.totalChecks} failed`);
    }
  } finally {
    await browser.close();
  }

  fs.writeFileSync(REPORT_FILE, buildReport(rows), 'utf-8');
  console.log(`Report: ${REPORT_FILE}`);
}

async function login(page: Page) {
  await page.goto('https://mms.pinduoduo.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);
  if (!page.url().includes('login') && !page.url().includes('passport')) return;
  console.log('Login required. Please complete login in the opened browser within 120 seconds.');
  await page.waitForURL(
    (url) => !url.toString().includes('login') && !url.toString().includes('passport'),
    { timeout: 120000 },
  );
}

function buildReport(rows: string[]): string {
  return [
    '# Selector Health Smoke Test',
    '',
    `**时间**: ${new Date().toISOString()}`,
    '',
    '| 模块 | 检查项 | 结果 | 详情 |',
    '| --- | --- | --- | --- |',
    ...rows,
    '',
    '说明：该脚本只读访问页面，保存截图/HTML，并写入 selector_health_events 供 Dashboard 和 Worker 降级判断使用。',
    '',
  ].join('\n');
}

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
