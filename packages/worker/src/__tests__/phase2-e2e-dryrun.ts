/**
 * Phase 2 端到端 Dry-Run 验证脚本
 *
 * 完整巡店流程但不实际提交任何写操作：
 *  1. 登录 → 2. 数据采集 → 3. 评价扫描 → 4. 互动扫描 → 5. 生成报告
 *
 * 运行: pnpm --filter @pdd-inspector/worker exec tsx src/__tests__/phase2-e2e-dryrun.ts
 */

import { chromium, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { buildBrowserRuntimeOptions } from '../browser';

const COOKIE_FILE = path.resolve('./data/discovery-cookie.json');
const OUTPUT_DIR = path.resolve('./data/e2e-dryrun');
const REPORT_FILE = path.resolve('../../docs/test-reports/phase-2-e2e-report.md');

// ============================================================
// Types
// ============================================================
interface DryRunReport {
  timestamp: string;
  store: string;
  login: { success: boolean; message: string };
  metrics: Record<string, { value: string | null; status: 'ok' | 'warn' | 'fail' }>;
  reviews: { total: number; good: number; bad: number; wouldReply: number; wouldReport: number };
  interactions: { total: number; wouldHide: number; posts: { content: string; action: string }[] };
  errors: string[];
}

// ============================================================
// Main
// ============================================================
async function dryRun() {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const report: DryRunReport = {
    timestamp: new Date().toISOString(),
    store: '',
    login: { success: false, message: '' },
    metrics: {},
    reviews: { total: 0, good: 0, bad: 0, wouldReply: 0, wouldReport: 0 },
    interactions: { total: 0, wouldHide: 0, posts: [] },
    errors: [],
  };

  console.log('╔══════════════════════════════════════════╗');
  console.log('║  Phase 2 E2E Dry-Run 验证              ║');
  console.log('║  读操作: 真实采集  |  写操作: 仅扫描    ║');
  console.log('╚══════════════════════════════════════════╝\n');

  const runtime = buildBrowserRuntimeOptions({ headless: false });
  const browser = await chromium.launch({
    headless: runtime.headless,
    args: runtime.args,
    ...(runtime.channel ? { channel: runtime.channel } : {}),
  });
  const context = await browser.newContext(runtime.contextOptions);

  if (fs.existsSync(COOKIE_FILE)) {
    try {
      const cookies = JSON.parse(fs.readFileSync(COOKIE_FILE, 'utf-8'));
      await context.addCookies(cookies);
    } catch { /* */ }
  }

  const page = await context.newPage();

  try {
    // ======== STEP 0: LOGIN ========
    console.log('━━━ STEP 0: 登录 ━━━');
    await page.goto('https://mms.pinduoduo.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    if (page.url().includes('login') || page.url().includes('passport')) {
      console.log('🔐 请扫码登录 (120s)...');
      try {
        await page.waitForURL((url) => !url.toString().includes('login'), { timeout: 120000 });
        console.log('✅ 登录成功\n');
        report.login = { success: true, message: '扫码登录成功' };
      } catch {
        console.log('❌ 登录超时\n');
        report.login = { success: false, message: '登录超时' };
        return;
      }
    } else {
      console.log('✅ Cookie 有效，已登录\n');
      report.login = { success: true, message: 'Cookie 有效自动登录' };
    }

    const cookies = await context.cookies();
    fs.writeFileSync(COOKIE_FILE, JSON.stringify(cookies, null, 2));

    // 获取店铺名
    report.store = await page.evaluate(() => {
      const el = document.querySelector('[class*="shop-name"], [class*="store-name"]');
      return (el as HTMLElement)?.innerText?.trim() || '未知店铺';
    });
    console.log(`🏪 店铺: ${report.store}\n`);

    // ======== STEP 1: 店铺健康度 ========
    console.log('━━━ STEP 1: 店铺健康度 (综合体验星级) ━━━');
    await navigateTo(page, 'https://mms.pinduoduo.com/sycm/goods_quality/pilot_mall');

    report.metrics['店铺星级'] = { value: await extractNear(page, '店铺综合体验星级'), status: 'ok' };
    report.metrics['劣质率'] = { value: await extractNear(page, '严重劣质率'), status: 'ok' };
    report.metrics['行业排名'] = { value: await extractNear(page, '领航员综合分行业排名'), status: 'ok' };
    report.metrics['评价得分排名'] = { value: await extractNear(page, '近90天用户评价得分排名'), status: 'ok' };
    report.metrics['3分钟回复率'] = { value: await extractNear(page, '近30天3分钟人工回复率'), status: 'ok' };
    report.metrics['成团签收时效'] = { value: await extractNear(page, '近30天成团-签收时效'), status: 'ok' };

    for (const [k, v] of Object.entries(report.metrics)) {
      const icon = v.value ? '✅' : '⚠️';
      console.log(`  ${icon} ${k}: ${v.value || '未采集到'}`);
      if (!v.value) v.status = 'warn';
    }
    await page.screenshot({ path: path.join(OUTPUT_DIR, '01-综合体验星级.png'), fullPage: true });
    console.log();

    // ======== STEP 2: 消费者体验 ========
    console.log('━━━ STEP 2: 消费者体验指标 ━━━');
    await navigateTo(page, 'https://mms.pinduoduo.com/sycm/goods_quality/help');

    const expScores = await page.evaluate(`(function () {
      var text = document.body.innerText || '';
      function ex(label) {
        var idx = text.indexOf(label);
        if (idx === -1) return null;
        // Skip past the label and any date line, find the score before "/5" or "分"
        var sub = text.substring(idx, idx + 100);
        var scoreMatch = sub.match(/(\\d+\\.?\\d*)\\s*\\/\\s*5/);
        if (scoreMatch && parseFloat(scoreMatch[1]) <= 5) return scoreMatch[1];
        // Fallback: find a small number near "分" that isn't a year
        var m = sub.match(/(\\d+\\.?\\d*)\\s*分/);
        if (m && parseFloat(m[1]) <= 5 && m[1].length < 4) return m[1];
        return null;
      }
      return JSON.stringify({
        total: ex('消费者服务体验分'),
        product: ex('商品服务体验分'),
        shipping: ex('发货服务体验分'),
        logistics: ex('物流服务体验分'),
        attitude: ex('服务态度体验分'),
        basic: ex('基础服务体验分'),
      });
    })()`);
    const expParsed = JSON.parse(expScores);

    for (const [k, v] of Object.entries(expParsed)) {
      report.metrics[`体验分-${k}`] = { value: String(v ?? ''), status: v ? 'ok' : 'warn' };
      console.log(`  ${v ? '✅' : '⚠️'} 体验分-${k}: ${v || '未采集到'}`);
    }
    await page.screenshot({ path: path.join(OUTPUT_DIR, '02-消费者体验.png'), fullPage: true });
    console.log();

    // ======== STEP 3: 售后工作台 ========
    console.log('━━━ STEP 3: 售后工作台 ━━━');
    await navigateTo(page, 'https://mms.pinduoduo.com/aftersales/aftersale_list?msfrom=mms_sidenav');

    const aftersaleData = JSON.parse(await page.evaluate(`(function () {
      var text = document.body.innerText || '';
      function ex(label) {
        var idx = text.indexOf(label);
        if (idx === -1) return null;
        var start = idx + label.length;
        var sub = text.substring(start, start + 80);
        var ms = sub.match(/(\\d+\\.?\\d*)/g);
        if (!ms) return null;
        for (var i = 0; i < ms.length; i++) {
          var v = ms[i];
          if (v === '2026' || v === '2025') continue;
          if (v.length >= 4 && v.indexOf('.') === -1) continue;
          return v;
        }
        return ms[0];
      }
      return JSON.stringify({
        expScore: ex('消费者服务体验分'),
        complaintWarn: ex('投诉预警'),
        overdueSoon: ex('待处理即将逾期'),
        pendingMerchant: ex('待商家处理'),
      });
    })()`));

    var asLabels: Record<string, string> = { expScore: '体验总分', complaintWarn: '投诉预警', overdueSoon: '待处理即将逾期', pendingMerchant: '待商家处理' };
    for (const [k, v] of Object.entries(aftersaleData)) {
      report.metrics[`售后-${asLabels[k] || k}`] = { value: String(v ?? ''), status: v ? 'ok' : 'warn' };
      console.log(`  ${v ? '✅' : '⚠️'} 售后-${asLabels[k] || k}: ${v || '0'}`);
    }
    await page.screenshot({ path: path.join(OUTPUT_DIR, '03-售后工作台.png'), fullPage: true });
    console.log();

    // ======== STEP 4: 申诉中心 ========
    console.log('━━━ STEP 4: 申诉中心 ━━━');
    await navigateTo(page, 'https://mms.pinduoduo.com/orders/appeals?msfrom=mms_sidenav');

    const appealData = JSON.parse(await page.evaluate(`(function () {
      var text = document.body.innerText || '';
      var totalMatch = text.match(/共有\\s*(\\d+)\\s*条/);
      var passedMatch = text.match(/全部通过/g);
      var rejectedMatch = text.match(/全部驳回/g);
      return JSON.stringify({
        total: totalMatch ? totalMatch[1] : '0',
        passed: passedMatch ? String(passedMatch.length) : '0',
        rejected: rejectedMatch ? String(rejectedMatch.length) : '0',
      });
    })()`));

    report.metrics['申诉总数'] = { value: appealData.total, status: 'ok' };
    report.metrics['申诉通过'] = { value: appealData.passed, status: 'ok' };
    report.metrics['申诉驳回'] = { value: appealData.rejected, status: 'ok' };
    console.log(`  ✅ 申诉总数: ${appealData.total}  |  通过: ${appealData.passed}  |  驳回: ${appealData.rejected}\n`);
    await page.screenshot({ path: path.join(OUTPUT_DIR, '04-申诉中心.png'), fullPage: true });

    // ======== STEP 5: 评价管理 (DRY RUN — 不实际提交) ========
    console.log('━━━ STEP 5: 评价管理 (扫描模式) ━━━');
    await navigateTo(page, 'https://mms.pinduoduo.com/goods/evaluation/index?msfrom=mms_sidenav');

    const reviewScan = JSON.parse(await page.evaluate(`(function () {
      var text = document.body.innerText || '';
      var result = { total: 0, good: 0, bad: 0, goodSample: '', badSample: '' };
      var totalMatch = text.match(/近90日评价数\\s*(\\d+)/);
      result.total = totalMatch ? parseInt(totalMatch[1]) : 0;
      var starPatterns = text.match(/([1-5])星/g);
      if (starPatterns) {
        for (var i = 0; i < starPatterns.length; i++) {
          var star = parseInt(starPatterns[i][0]);
          if (star >= 4) result.good++;
          else result.bad++;
        }
      }
      var lines = text.split('\\n');
      var reviewStart = -1;
      for (var i = 0; i < lines.length; i++) {
        if (lines[i].indexOf('评价列表') !== -1) { reviewStart = i; break; }
      }
      if (reviewStart >= 0) {
        for (var i = reviewStart; i < Math.min(lines.length, reviewStart + 20); i++) {
          if (lines[i].length > 15 && lines[i].indexOf('评价') === -1 && lines[i].indexOf('筛选') === -1) {
            if (!result.goodSample) result.goodSample = lines[i].substring(0, 80);
            else if (!result.badSample) result.badSample = lines[i].substring(0, 80);
          }
        }
      }
      return JSON.stringify(result);
    })()`));

    report.reviews = reviewScan;
    console.log(`  评价总数(~90日): ${reviewScan.total}`);
    console.log(`  好评(4-5星): ${reviewScan.good}  差评(1-3星): ${reviewScan.bad}`);
    console.log(`  将回复好评: ${reviewScan.good}  将举报差评: ${reviewScan.bad}`);
    console.log(`  评价样本: "${reviewScan.goodSample?.substring(0, 50)}..."`);

    // Check if reply/report buttons exist
    const replyBtn = await page.$('button:has-text("回复"), span:has-text("回复"), a:has-text("回复")');
    const reportBtn = await page.$('button:has-text("举报"), span:has-text("举报"), a:has-text("举报")');
    console.log(`  回复按钮: ${replyBtn ? '✅ 可用' : '⚠️ 未找到'}  |  举报按钮: ${reportBtn ? '✅ 可用' : '⚠️ 未找到'}`);

    await page.screenshot({ path: path.join(OUTPUT_DIR, '05-评价管理.png'), fullPage: true });
    console.log();

    // ======== STEP 6: 种草动态 (DRY RUN) ========
    console.log('━━━ STEP 6: 种草动态 (扫描模式) ━━━');
    await navigateTo(page, 'https://mms.pinduoduo.com/mall-feed/home?msfrom=mms_sidenav');

    const interactionScan = JSON.parse(await page.evaluate(`(function () {
      var posts = [];
      var negativeWords = ['差', '烂', '垃圾', '骗', '假', '投诉', '退款', '退货', '不好', '太差', '失望'];
      // Only look inside main content area — exclude nav/aside/sidebar
      var main = document.querySelector('main, [class*="content-wrap"], [class*="page-content"], [class*="main-content"], .ant-layout-content');
      var container = main || document.body;
      var rows = container.querySelectorAll('tr');
      for (var i = 0; i < rows.length; i++) {
        var text = rows[i].innerText ? rows[i].innerText.trim() : '';
        // Must contain video/dynamic content keywords or be an actual post row
        if (text.length > 30 && text.indexOf('曝光量') === -1 && text.indexOf('动态类型') === -1 && text.indexOf('一键发布') === -1 && text.indexOf('客户端') === -1 && text.indexOf('签约入驻') === -1 && text.indexOf('TEMU') === -1) {
          var found = [];
          for (var j = 0; j < negativeWords.length; j++) {
            if (text.indexOf(negativeWords[j]) !== -1) found.push(negativeWords[j]);
          }
          posts.push({
            content: text.substring(0, 120),
            action: found.length > 0 ? 'HIDE:' + found.join(',') : 'KEEP',
          });
        }
      }
      return JSON.stringify(posts);
    })()`));

    report.interactions.posts = interactionScan;
    report.interactions.total = interactionScan.length;
    report.interactions.wouldHide = interactionScan.filter(function (p: any) { return p.action.startsWith('HIDE'); }).length;

    console.log(`  动态总数: ${interactionScan.length}`);
    console.log(`  将隐藏: ${report.interactions.wouldHide}  |  将保留: ${interactionScan.length - report.interactions.wouldHide}`);
    for (var _k = 0; _k < Math.min(interactionScan.length, 5); _k++) {
      var p = interactionScan[_k];
      console.log(`  ${p.action.startsWith('HIDE') ? '⚠️ 将隐藏' : '✅ 保留'}: ${(p.content || '').substring(0, 60)}`);
    }
    if (interactionScan.length > 5) console.log(`  ... 共 ${interactionScan.length} 条`);

    await page.screenshot({ path: path.join(OUTPUT_DIR, '06-种草动态.png'), fullPage: true });

    // ======== GENERATE REPORT ========
    console.log('\n╔══════════════════════════════════════════╗');
    console.log('║  Dry-Run 验证完成 — 生成报告           ║');
    console.log('╚══════════════════════════════════════════╝');

    const totalMetrics = Object.keys(report.metrics).length;
    const okMetrics = Object.values(report.metrics).filter((m) => m.status === 'ok').length;

    const markdown = generateMarkdown(report, okMetrics, totalMetrics);
    fs.writeFileSync(REPORT_FILE, markdown);
    console.log(`\n📄 报告: ${REPORT_FILE}`);
    console.log(`📸 截图: ${OUTPUT_DIR}`);
    console.log(`\n指标采集: ${okMetrics}/${totalMetrics} | 评价操作(模拟): 回复${report.reviews.good}条 + 举报${report.reviews.bad}条 | 互动处理(模拟): 隐藏${report.interactions.wouldHide}条`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('❌', msg);
    report.errors.push(msg);
  } finally {
    await browser.close();
  }
}

// ============================================================
// Helpers
// ============================================================
async function navigateTo(page: Page, url: string) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(2500);
}

async function extractNear(page: Page, label: string): Promise<string | null> {
  return page.evaluate(`(function () {
    var text = document.body.innerText || '';
    var idx = text.indexOf('${label.replace(/'/g, "\\'")}');
    if (idx === -1) return null;
    // Start AFTER the label text (skip label's own numbers like "近90天")
    var start = idx + ${label.length};
    var sub = text.substring(start, start + 80);
    var matches = sub.match(/(\\d+\\.?\\d*%?)/g);
    if (!matches) return null;
    for (var i = 0; i < matches.length; i++) {
      var val = matches[i];
      if (val === '2026' || val === '2025' || val === '2024') continue;
      if (val.length >= 4 && val.indexOf('.') === -1) continue;
      return val;
    }
    return matches[0];
  })()`);
}

function generateMarkdown(r: DryRunReport, ok: number, total: number): string {
  const lines = [
    `# Phase 2 E2E Dry-Run 报告`,
    '',
    `**时间**: ${r.timestamp}`,
    `**店铺**: ${r.store}`,
    `**登录**: ${r.login.success ? '✅ ' + r.login.message : '❌ ' + r.login.message}`,
    '',
    '## 1. 数据采集',
    '',
    '| 指标 | 数值 | 状态 |',
    '|------|------|------|',
  ];

  for (const [k, v] of Object.entries(r.metrics)) {
    lines.push(`| ${k} | ${v.value || '-'} | ${v.status === 'ok' ? '✅' : '⚠️'} |`);
  }

  lines.push('', `**采集率**: ${ok}/${total} (${Math.round(ok / total * 100)}%)`, '');

  lines.push('## 2. 评价管理 (模拟)');
  lines.push('');
  lines.push(`- 评价总数(~90日): ${r.reviews.total}`);
  lines.push(`- 好评(将回复): ${r.reviews.good} 条`);
  lines.push(`- 差评(将举报): ${r.reviews.bad} 条`);
  lines.push('');

  lines.push('## 3. 互动动态 (模拟)');
  lines.push('');
  lines.push(`- 动态总数: ${r.interactions.total}`);
  lines.push(`- 将隐藏: ${r.interactions.wouldHide} 条`);
  lines.push(`- 将保留: ${r.interactions.total - r.interactions.wouldHide} 条`);
  lines.push('');

  if (r.interactions.posts.length > 0) {
    lines.push('| 内容 | 操作 |');
    lines.push('|------|------|');
    for (const p of r.interactions.posts.slice(0, 10)) {
      lines.push(`| ${p.content.substring(0, 60)}... | ${p.action} |`);
    }
    lines.push('');
  }

  if (r.errors.length > 0) {
    lines.push('## ⚠️ 错误');
    for (const e of r.errors) lines.push(`- ${e}`);
    lines.push('');
  }

  lines.push('---');
  lines.push('*Dry-Run 模式: 所有写操作仅扫描未实际执行*');

  return lines.join('\n');
}

dryRun().catch(console.error);
