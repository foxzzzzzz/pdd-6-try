/**
 * Metrics-only dry-run collector.
 *
 * Read-only pages:
 * - 服务数据 / 综合体验星级
 * - 服务数据 / 消费者体验指标
 * - 服务数据 / 售后数据
 * - 服务数据 / 评价数据
 * - 服务数据 / 客服数据
 *
 * Default mode uses Playwright to collect live backend text/screenshots.
 * Pass --from-snapshots to parse existing page-discovery text files.
 * Pass --from-output to rebuild report from existing data/metrics-dryrun files.
 */
import { chromium, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { parseStoreMetricsText } from '../collectors/metrics';
import { parseExperienceMetricsHtml, parseExperienceMetricsText } from '../collectors/experience';
import { parseRefundMetricsText } from '../collectors/refunds';
import { parseCustomerMetricsText } from '../collectors/customer';
import { buildBrowserRuntimeOptions } from '../browser';

const COOKIE_FILE = path.resolve('./data/discovery-cookie.json');
const OUTPUT_DIR = path.resolve('./data/metrics-dryrun');
const REPORT_FILE = path.resolve('../../docs/test-reports/metrics-only-dryrun.md');

type MetricValue = number | string | null | undefined;

type Target = {
  key: string;
  name: string;
  url: string;
  snapshotFile: string;
  labels: string[];
  parse?: (text: string) => Record<string, MetricValue>;
};

type PageResult = {
  name: string;
  url: string;
  textFile: string;
  screenshotFile?: string;
  metrics: Record<string, MetricValue>;
  labelHits: Record<string, string | null>;
};

const TARGETS: Target[] = [
  {
    key: 'pilot-mall',
    name: '综合体验星级',
    url: 'https://mms.pinduoduo.com/sycm/goods_quality/pilot_mall',
    snapshotFile: '08b-服务数据-综合体验星级.txt',
    parse: parseStoreMetricsText as (text: string) => Record<string, MetricValue>,
    labels: [
      '店铺综合体验星级',
      '领航员综合分行业排名',
      '近30天平台求助率',
      '近30天3分钟人工回复率',
      '近30天在途订单退款时长',
      '近30天商家签收消费者退货订单后的平均退款时长',
      '近90天用户评价得分排名',
      '近30天积极评论率',
      '近30天严重劣质率',
      '近30天成团-签收时效',
      '近30天物流综合违规处理率',
      '近30天店铺活跃度',
      '消费者体验提升计划开通状态',
    ],
  },
  {
    key: 'experience',
    name: '消费者体验指标',
    url: 'https://mms.pinduoduo.com/sycm/goods_quality/help',
    snapshotFile: '08b-服务数据-消费者体验指标.txt',
    parse: parseExperienceMetricsText as (text: string) => Record<string, MetricValue>,
    labels: [
      '消费者服务体验分',
      '本店铺体验分在同行排名',
      '服务态度体验分',
      '基础服务体验分',
      '商品服务体验分',
      '发货服务体验分',
      '物流服务体验分',
    ],
  },
  {
    key: 'refunds',
    name: '售后数据',
    url: 'https://mms.pinduoduo.com/sycm/goods_quality/detail',
    snapshotFile: '08b-服务数据-售后数据.txt',
    parse: parseRefundMetricsText as (text: string) => Record<string, MetricValue>,
    labels: [
      '纠纷退款数',
      '纠纷退款率',
      '介入订单数',
      '平台介入率',
      '品质退款率',
      '平均退款时长',
      '成功退款订单数',
      '成功退款金额',
      '成功退款率',
      '退货退款自主完结时长',
      '退款自主完结时长',
    ],
  },
  {
    key: 'comment',
    name: '评价数据',
    url: 'https://mms.pinduoduo.com/sycm/goods_quality/comment',
    snapshotFile: '08b-服务数据-评价数据.txt',
    parse: parseCommentMetricsText,
    labels: [
      '近30天评价总览',
      '店铺评价分排名',
      '较前一天',
      '积极评论率',
      '差评',
      '中评',
      '评价数',
    ],
  },
  {
    key: 'customer',
    name: '客服数据',
    url: 'https://mms.pinduoduo.com/sycm/goods_quality/customer',
    snapshotFile: '08b-服务数据-客服数据.txt',
    parse: parseCustomerMetricsText as (text: string) => Record<string, MetricValue>,
    labels: [
      '3分钟人工回复率',
      '平均人工响应时长',
      '客服满意度',
      '咨询量',
      '回复率',
      '消费者服务体验分',
    ],
  },
];

async function main() {
  ensureDir(OUTPUT_DIR);
  ensureDir(path.dirname(REPORT_FILE));

  const fromSnapshots = process.argv.includes('--from-snapshots');
  const fromOutput = process.argv.includes('--from-output');
  const results = fromOutput
    ? collectFromOutput()
    : fromSnapshots ? collectFromSnapshots() : await collectWithPlaywright();

  const jsonFile = path.join(OUTPUT_DIR, 'metrics-only-report.json');
  fs.writeFileSync(jsonFile, JSON.stringify({
    generatedAt: new Date().toISOString(),
    mode: fromOutput ? 'output' : fromSnapshots ? 'snapshots' : 'playwright',
    results,
  }, null, 2), 'utf-8');

  fs.writeFileSync(REPORT_FILE, buildMarkdown(results, fromSnapshots, fromOutput, jsonFile), 'utf-8');
  console.log(`Report: ${REPORT_FILE}`);
  console.log(`JSON: ${jsonFile}`);
  console.log(`Raw pages: ${OUTPUT_DIR}`);
}

async function collectWithPlaywright(): Promise<PageResult[]> {
  console.log('Metrics-only dry-run: Playwright live collection');
  const runtime = buildBrowserRuntimeOptions({ headless: false });
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
      // Ignore corrupt cookie cache; login flow below will refresh it.
    }
  }

  const page = await context.newPage();
  try {
    await login(page);
    fs.writeFileSync(COOKIE_FILE, JSON.stringify(await context.cookies(), null, 2), 'utf-8');

    const results: PageResult[] = [];
    for (const target of TARGETS) {
      console.log(`Collecting ${target.name}: ${target.url}`);
      await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3000);
      results.push(await captureTarget(page, target));
    }
    return results;
  } finally {
    await browser.close();
  }
}

function collectFromSnapshots(): PageResult[] {
  console.log('Metrics-only dry-run: parsing existing snapshots');
  const snapshotDir = path.resolve('./data/page-discovery');
  return TARGETS.map((target) => {
    const sourceFile = path.join(snapshotDir, target.snapshotFile);
    const htmlFile = sourceFile.replace(/\.txt$/, '.html');
    const html = fs.existsSync(htmlFile) ? fs.readFileSync(htmlFile, 'utf-8') : '';
    const text = fs.existsSync(sourceFile)
      ? fs.readFileSync(sourceFile, 'utf-8')
      : extractVisibleTextFromHtml(html);
    return writePageResult(target, target.url, text, html);
  });
}

function collectFromOutput(): PageResult[] {
  console.log('Metrics-only dry-run: rebuilding report from existing output');
  return TARGETS.map((target) => {
    const textFile = path.join(OUTPUT_DIR, `${target.key}.txt`);
    const htmlFile = path.join(OUTPUT_DIR, `${target.key}.html`);
    const html = fs.existsSync(htmlFile) ? fs.readFileSync(htmlFile, 'utf-8') : '';
    const text = html ? extractVisibleTextFromHtml(html) : fs.existsSync(textFile) ? fs.readFileSync(textFile, 'utf-8') : '';
    const result = writePageResult(target, target.url, text, html);
    const screenshotFile = path.join(OUTPUT_DIR, `${target.key}.png`);
    if (fs.existsSync(screenshotFile)) result.screenshotFile = screenshotFile;
    return result;
  });
}

async function login(page: Page) {
  await page.goto('https://mms.pinduoduo.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);

  if (!page.url().includes('login') && !page.url().includes('passport')) return;

  console.log('Login required. Please scan/complete login in the opened browser within 120 seconds.');
  await page.waitForURL(
    (url) => !url.toString().includes('login') && !url.toString().includes('passport'),
    { timeout: 120000 },
  );
}

async function captureTarget(page: Page, target: Target): Promise<PageResult> {
  const text = await page.evaluate(() => document.body.innerText || '');
  const html = await page.content();
  const result = writePageResult(target, page.url(), text, html);

  const screenshotFile = path.join(OUTPUT_DIR, `${target.key}.png`);
  await page.screenshot({ path: screenshotFile, fullPage: true });
  result.screenshotFile = screenshotFile;

  const htmlFile = path.join(OUTPUT_DIR, `${target.key}.html`);
  fs.writeFileSync(htmlFile, html, 'utf-8');

  return result;
}

function writePageResult(target: Target, url: string, text: string, html = ''): PageResult {
  const textFile = path.join(OUTPUT_DIR, `${target.key}.txt`);
  fs.writeFileSync(textFile, `URL: ${url}\n\n${text}`, 'utf-8');

  const metrics = target.parse ? target.parse(text) : {};
  if (target.key === 'experience') {
    Object.assign(metrics, parseExperienceMetricsHtml(html));
  }

  return {
    name: target.name,
    url,
    textFile,
    metrics,
    labelHits: Object.fromEntries(target.labels.map((label) => [label, extractNear(text, label)])),
  };
}

function extractNear(text: string, label: string): string | null {
  const idx = text.indexOf(label);
  if (idx === -1) return null;
  return text
    .substring(idx + label.length, idx + label.length + 80)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || null;
}

function parseCommentMetricsText(text: string): Record<string, MetricValue> {
  return {
    commentScoreRank: extractPercentAsDecimal(text, '店铺评价分排名'),
    commentScoreRankChange: extractPercentAsDecimal(text, '较前一天'),
  };
}

function extractPercentAsDecimal(text: string, label: string): number | null {
  const idx = text.indexOf(label);
  if (idx === -1) return null;
  const sub = text.substring(idx + label.length, idx + label.length + 80);
  const m = sub.match(/(\d+\.?\d*)\s*%/);
  return m ? parseFloat(m[1]) / 100 : null;
}

function extractVisibleTextFromHtml(html: string): string {
  if (!html) return '';
  return decodeHtmlEntities(html)
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function buildMarkdown(results: PageResult[], fromSnapshots: boolean, fromOutput: boolean, jsonFile: string): string {
  const lines = [
    '# Metrics-only Dry-Run 报告',
    '',
    `**时间**: ${new Date().toISOString()}`,
    `**模式**: ${fromOutput ? '已有真实采集文件重建' : fromSnapshots ? '本地快照解析' : 'Playwright 实时只读采集'}`,
    `**JSON**: ${jsonFile}`,
    '',
    '## 结构化指标',
    '',
  ];

  for (const result of results) {
    lines.push(`### ${result.name}`, '');
    lines.push(`- URL: ${result.url}`);
    lines.push(`- 原始文本: ${result.textFile}`);
    if (result.screenshotFile) lines.push(`- 截图: ${result.screenshotFile}`);
    lines.push('');

    if (Object.keys(result.metrics).length > 0) {
      lines.push('| 字段 | 值 |');
      lines.push('|------|----|');
      for (const [key, value] of Object.entries(result.metrics)) {
        lines.push(`| ${key} | ${formatValue(value)} |`);
      }
      lines.push('');
    }

    lines.push('| 标签 | 附近文本 |');
    lines.push('|------|----------|');
    for (const [label, value] of Object.entries(result.labelHits)) {
      lines.push(`| ${label} | ${value ? escapeMarkdown(value) : '-'} |`);
    }
    lines.push('');
  }

  lines.push('## 关注项');
  lines.push('');
  lines.push('- `refundDuration` 来自售后数据页的 `平均退款时长`。');
  lines.push('- `refundRate` 当前映射售后数据页的 `成功退款率`，如后续页面出现更贴近“整体退款率”的标签，需要再调整。');
  lines.push('- `disputeRate` 来自售后数据页的 `纠纷退款率`。');
  lines.push('- 售后数据页红框内重点指标已单独提取：纠纷退款数/率、介入订单数、平台介入率、品质退款率、平均退款时长、成功退款订单数/金额/率、退货退款自主完结时长、退款自主完结时长。');
  lines.push('- 评价数据页与客服数据页已接入正式指标表：店铺评价分排名、评价条数、3分钟人工回复率、平均人工响应时长。');

  return lines.join('\n');
}

function formatValue(value: MetricValue): string {
  if (value == null) return '-';
  return String(value);
}

function escapeMarkdown(value: string): string {
  return value.replace(/\|/g, '\\|');
}

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
