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

    const expScores = await page.evaluate(() => {
      const text = document.body.innerText || '';
      const extract = (label: string) => {
        const idx = text.indexOf(label);
        if (idx === -1) return null;
        const m = text.substring(idx, idx + 50).match(/(\d+\.?\d*)/);
        return m ? m[1] : null;
      };
      return {
        '总分': extract('消费者服务体验分'),
        '商品服务': extract('商品服务体验分'),
        '发货服务': extract('发货服务体验分'),
        '物流服务': extract('物流服务体验分'),
        '服务态度': extract('服务态度体验分'),
        '基础服务': extract('基础服务体验分'),
      };
    });

    for (const [k, v] of Object.entries(expScores)) {
      report.metrics[`体验分-${k}`] = { value: v, status: v ? 'ok' : 'warn' };
      console.log(`  ${v ? '✅' : '⚠️'} 体验分-${k}: ${v || '未采集到'}`);
    }
    await page.screenshot({ path: path.join(OUTPUT_DIR, '02-消费者体验.png'), fullPage: true });
    console.log();

    // ======== STEP 3: 售后工作台 ========
    console.log('━━━ STEP 3: 售后工作台 ━━━');
    await navigateTo(page, 'https://mms.pinduoduo.com/aftersales/aftersale_list?msfrom=mms_sidenav');

    const aftersaleData = await page.evaluate(() => {
      const text = document.body.innerText || '';
      const extract = (label: string) => {
        const idx = text.indexOf(label);
        if (idx === -1) return null;
        const m = text.substring(idx, idx + 50).match(/(\d+\.?\d*)/);
        return m ? m[1] : null;
      };
      return {
        '体验总分': extract('消费者服务体验分'),
        '投诉预警': extract('投诉预警'),
        '待处理即将逾期': extract('待处理即将逾期'),
        '待商家处理': extract('待商家处理'),
      };
    });

    for (const [k, v] of Object.entries(aftersaleData)) {
      report.metrics[`售后-${k}`] = { value: v, status: v ? 'ok' : 'warn' };
      console.log(`  ${v ? '✅' : '⚠️'} 售后-${k}: ${v || '0'}`);
    }
    await page.screenshot({ path: path.join(OUTPUT_DIR, '03-售后工作台.png'), fullPage: true });
    console.log();

    // ======== STEP 4: 申诉中心 ========
    console.log('━━━ STEP 4: 申诉中心 ━━━');
    await navigateTo(page, 'https://mms.pinduoduo.com/orders/appeals?msfrom=mms_sidenav');

    const appealData = await page.evaluate(() => {
      const text = document.body.innerText || '';
      const totalMatch = text.match(/共有\s*(\d+)\s*条/);
      const passedMatch = text.match(/全部通过/g);
      const rejectedMatch = text.match(/全部驳回/g);
      return {
        total: totalMatch ? totalMatch[1] : '0',
        passed: passedMatch ? String(passedMatch.length) : '0',
        rejected: rejectedMatch ? String(rejectedMatch.length) : '0',
      };
    });

    report.metrics['申诉总数'] = { value: appealData.total, status: 'ok' };
    report.metrics['申诉通过'] = { value: appealData.passed, status: 'ok' };
    report.metrics['申诉驳回'] = { value: appealData.rejected, status: 'ok' };
    console.log(`  ✅ 申诉总数: ${appealData.total}  |  通过: ${appealData.passed}  |  驳回: ${appealData.rejected}\n`);
    await page.screenshot({ path: path.join(OUTPUT_DIR, '04-申诉中心.png'), fullPage: true });

    // ======== STEP 5: 评价管理 (DRY RUN — 不实际提交) ========
    console.log('━━━ STEP 5: 评价管理 (扫描模式) ━━━');
    await navigateTo(page, 'https://mms.pinduoduo.com/goods/evaluation/index?msfrom=mms_sidenav');

    const reviewScan = await page.evaluate(() => {
      const text = document.body.innerText || '';
      const result = { total: 0, good: 0, bad: 0, goodSample: '', badSample: '' };

      // Count reviews
      const totalMatch = text.match(/近90日评价数\s*(\d+)/);
      result.total = totalMatch ? parseInt(totalMatch[1]) : 0;

      // Check for star ratings in the review list
      const starPatterns = text.match(/([1-5])星/g);
      if (starPatterns) {
        for (const s of starPatterns) {
          const star = parseInt(s[0]);
          if (star >= 4) result.good++;
          else result.bad++;
        }
      }

      // Get sample review content
      const lines = text.split('\n');
      const reviewStart = lines.findIndex((l) => l.includes('评价列表'));
      if (reviewStart >= 0) {
        for (let i = reviewStart; i < Math.min(lines.length, reviewStart + 20); i++) {
          if (lines[i].length > 15 && !lines[i].includes('评价') && !lines[i].includes('筛选')) {
            if (!result.goodSample) result.goodSample = lines[i].substring(0, 80);
            else if (!result.badSample) result.badSample = lines[i].substring(0, 80);
          }
        }
      }

      return result;
    });

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

    const interactionScan = await page.evaluate(() => {
      const posts: { content: string; action: string }[] = [];
      const negativeWords = ['差', '烂', '垃圾', '骗', '假', '投诉', '退款', '退货', '不好', '太差', '失望'];

      // Find post rows
      const rows = document.querySelectorAll('tr, [class*="item"], [class*="card"], [class*="row"]');
      rows.forEach((row) => {
        const text = (row as HTMLElement).innerText?.trim() || '';
        if (text.length > 20 && !text.includes('曝光量') && !text.includes('动态类型') && !text.includes('一键发布')) {
          const found = negativeWords.filter((w) => text.includes(w));
          posts.push({
            content: text.substring(0, 120),
            action: found.length > 0 ? `⚠️ 将隐藏 (负面词: ${found.join(',')})` : '✅ 保留',
          });
        }
      });
      return posts;
    });

    report.interactions.posts = interactionScan;
    report.interactions.total = interactionScan.length;
    report.interactions.wouldHide = interactionScan.filter((p) => p.action.includes('将隐藏')).length;

    console.log(`  动态总数: ${interactionScan.length}`);
    console.log(`  将隐藏: ${report.interactions.wouldHide}  |  将保留: ${interactionScan.length - report.interactions.wouldHide}`);
    for (const post of interactionScan.slice(0, 5)) {
      console.log(`  ${post.action}`);
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
    console.log(`\n指标采集: ${okMetrics}/${totalMetrics} | 评价操作(模拟): ${report.reviews.wouldReply + report.reviews.wouldReport} 条 | 互动处理(模拟): ${report.interactions.wouldHide} 条`);
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
  return page.evaluate((labelText: string) => {
    const text = document.body.innerText || '';
    const idx = text.indexOf(labelText);
    if (idx === -1) return null;
    const sub = text.substring(idx, idx + 80);
    const m = sub.match(/(\d+\.?\d*%?)/);
    return m ? m[1] : null;
  }, label);
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
  lines.push(`- 好评(将回复): ${r.reviews.wouldReply} 条`);
  lines.push(`- 差评(将举报): ${r.reviews.wouldReport} 条`);
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
