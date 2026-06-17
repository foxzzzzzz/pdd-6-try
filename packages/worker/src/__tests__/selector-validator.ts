/**
 * Phase 2 选择器验证脚本 — 使用字符串 evaluate 避免 __name 问题
 */
import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const COOKIE_FILE = path.resolve('./data/discovery-cookie.json');
const REPORT_FILE = path.resolve(process.cwd(), '../../docs/test-reports/phase-2-selector-test.md');

interface TestCase { name: string; url: string; checks: SelectorCheck[]; }
interface SelectorCheck { description: string; type: 'text' | 'element' | 'value'; target: string; }

const TEST_CASES: TestCase[] = [
  {
    name: '评价管理页',
    url: 'https://mms.pinduoduo.com/goods/evaluation/index?msfrom=mms_sidenav',
    checks: [
      { description: '页面标题', type: 'text', target: '评价管理' },
      { description: '评价列表区域', type: 'text', target: '评价列表' },
      { description: '筛选器-评价时间', type: 'text', target: '评价时间' },
      { description: '筛选器-评价标签', type: 'text', target: '评价标签' },
      { description: '店铺评价分排名', type: 'value', target: '店铺评价分排名' },
      { description: '近90日评价数', type: 'value', target: '近90日评价数' },
      { description: '回复按钮存在', type: 'element', target: '回复' },
      { description: '举报按钮存在', type: 'element', target: '举报' },
    ],
  },
  {
    name: '综合体验星级',
    url: 'https://mms.pinduoduo.com/sycm/goods_quality/pilot_mall',
    checks: [
      { description: '页面标题', type: 'text', target: '服务数据' },
      { description: '店铺综合体验星级', type: 'value', target: '店铺综合体验星级' },
      { description: '星级数值', type: 'text', target: '星' },
      { description: '维度指标表现明细表', type: 'text', target: '维度指标表现明细' },
      { description: '领航员综合分排名', type: 'text', target: '领航员综合分行业排名' },
      { description: '近30天严重劣质率', type: 'text', target: '严重劣质率' },
    ],
  },
  {
    name: '消费者体验指标',
    url: 'https://mms.pinduoduo.com/sycm/goods_quality/help',
    checks: [
      { description: '消费者服务体验分', type: 'value', target: '消费者服务体验分' },
      { description: '商品服务体验分', type: 'value', target: '商品服务体验分' },
      { description: '发货服务体验分', type: 'value', target: '发货服务体验分' },
      { description: '物流服务体验分', type: 'value', target: '物流服务体验分' },
    ],
  },
  {
    name: '售后工作台',
    url: 'https://mms.pinduoduo.com/aftersales/aftersale_list?msfrom=mms_sidenav',
    checks: [
      { description: '消费者服务体验分', type: 'value', target: '消费者服务体验分' },
      { description: '售后单查询', type: 'text', target: '售后单查询' },
      { description: '售后数据区域', type: 'text', target: '售后数据' },
    ],
  },
  {
    name: '申诉中心',
    url: 'https://mms.pinduoduo.com/orders/appeals?msfrom=mms_sidenav',
    checks: [
      { description: '订单申诉标题', type: 'text', target: '订单申诉' },
      { description: '申诉记录列表', type: 'text', target: '申诉记录' },
      { description: '异常单申诉入口', type: 'text', target: '异常单申诉' },
    ],
  },
  {
    name: '种草动态',
    url: 'https://mms.pinduoduo.com/mall-feed/home?msfrom=mms_sidenav',
    checks: [
      { description: '种草动态标题', type: 'text', target: '种草动态' },
      { description: '动态列表', type: 'text', target: '我发布的动态' },
      { description: '操作按钮存在', type: 'element', target: '查看详情' },
    ],
  },
];

async function runTests() {
  console.log('=== Phase 2 选择器验证测试 ===\n');
  const results: string[] = [];
  var passed = 0;
  var failed = 0;

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 }, locale: 'zh-CN',
  });

  if (fs.existsSync(COOKIE_FILE)) {
    try { const c = JSON.parse(fs.readFileSync(COOKIE_FILE, 'utf-8')); await context.addCookies(c); } catch { /* */ }
  }
  const page = await context.newPage();

  await page.goto('https://mms.pinduoduo.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);
  if (page.url().includes('login')) {
    console.log('🔐 请扫码登录...');
    try { await page.waitForURL(function (url) { return !url.toString().includes('login'); }, { timeout: 120000 }); } catch { console.log('⏰ 超时'); await browser.close(); return; }
  }
  const cookies = await context.cookies();
  fs.writeFileSync(COOKIE_FILE, JSON.stringify(cookies, null, 2));

  for (var _t = 0; _t < TEST_CASES.length; _t++) {
    var tc = TEST_CASES[_t];
    console.log(`\n📄 ${tc.name}\n   URL: ${tc.url}`);
    try { await page.goto(tc.url, { waitUntil: 'domcontentloaded', timeout: 20000 }); await page.waitForTimeout(3000); } catch { failed += tc.checks.length; continue; }

    for (var _c = 0; _c < tc.checks.length; _c++) {
      var check = tc.checks[_c];
      var ok = false;
      var detail = '';
      try {
        if (check.type === 'text') {
          var txt = await page.evaluate(`(function () { return document.body.innerText || ''; })()`);
          ok = txt.indexOf(check.target) !== -1;
          detail = ok ? '找到文本' : '未找到文本';
        } else if (check.type === 'element') {
          var el = await page.$(`button:has-text("${check.target}"), a:has-text("${check.target}"), span:has-text("${check.target}")`);
          ok = el !== null;
          detail = ok ? '元素存在' : '元素不存在';
        } else if (check.type === 'value') {
          var val = await page.evaluate(`(function () {
            var text = document.body.innerText || '';
            var idx = text.indexOf('${check.target}');
            if (idx === -1) return '';
            var sub = text.substring(idx, idx + 80);
            var ms = sub.match(/(\\d+\\.?\\d*)/g);
            if (!ms) return '';
            for (var i = 0; i < ms.length; i++) {
              var v = ms[i];
              if (v === '2026' || v === '2025') continue;
              if (v.length >= 4 && v.indexOf('.') === -1) continue;
              return v;
            }
            return ms[0] || '';
          })()`);
          ok = val !== '';
          detail = ok ? `找到数值: ${val}` : '未找到数值';
        }
      } catch { detail = '检查异常'; }

      var status = ok ? '✅' : '❌';
      console.log(`   ${status} ${check.description}: ${detail}`);
      results.push(`| ${tc.name} | ${check.description} | ${status} | ${detail} |`);
      if (ok) passed++; else failed++;
    }
  }
  await browser.close();

  var total = passed + failed;
  var report = `# Phase 2 选择器验证测试报告\n\n**日期**: ${new Date().toISOString().split('T')[0]}\n**版本**: v0.2.0\n**结果**: ${passed}/${total} (${Math.round(passed / total * 100)}%)\n\n| 页面 | 检查项 | 结果 | 详情 |\n|------|--------|------|------|\n${results.join('\n')}\n\n## 汇总\n- ✅ 通过: ${passed}\n- ❌ 失败: ${failed}\n`;
  fs.writeFileSync(REPORT_FILE, report);
  console.log(`\n📄 报告: ${REPORT_FILE}\n结果: ${passed}/${total} 通过`);
}

runTests().catch(console.error);
