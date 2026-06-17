/**
 * Phase 2 单元测试 — 非浏览器逻辑
 *
 * 测试: 话术匹配 / 负面判断 / 数据提取
 * 运行: pnpm --filter @pdd-inspector/worker exec tsx src/__tests__/unit-tests.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { createInspectionJobData } from '@pdd-inspector/core';
import { buildMetricInsertValues } from '../inspection-results';

const REPORT_FILE = path.resolve(process.cwd(), '../../docs/test-reports/phase-2-unit-test.md');

let passed = 0;
let failed = 0;
const results: string[] = [];

function assert(description: string, condition: boolean, detail = '') {
  if (condition) {
    passed++;
    results.push(`| ${description} | ✅ | ${detail} |`);
    console.log(`  ✅ ${description}`);
  } else {
    failed++;
    results.push(`| ${description} | ❌ | ${detail} |`);
    console.log(`  ❌ ${description}: ${detail}`);
  }
}

// ========== Test 0: Inspection persistence helpers ==========
console.log('\n📋 测试: 巡店记录关联与异常落库');

const jobData = createInspectionJobData(12, '测试店铺', '2026-06-17', 99);
assert('队列任务携带 inspectionId', jobData.inspectionId === 99);

const metricValues = buildMetricInsertValues(
  {
    storeId: 12,
    date: '2026-06-17',
    rating: 4.1,
    ratingChange: null,
    defectRate: 0.06,
    defectRateChange: null,
    dsrDesc: null,
    dsrService: null,
    dsrLogistics: null,
    dsrRankChange: null,
    expBasic: null,
    expShipping: null,
    expProduct: null,
    expLogistics: null,
    refundDuration: null,
    refundRate: null,
    disputeRate: null,
    appealCount: null,
    appealSuccessRate: null,
  },
  99,
  { isAnomaly: true, severity: 'warning', flags: ['defectRate'], description: 'defect rate high' },
);
assert('异常指标写入 warning 等级', metricValues.severity === 'warning');
assert('异常 flags 序列化写入', metricValues.anomalyFlags === '["defectRate"]');

// ========== Test 1: 负面关键词判断 ==========
console.log('\n📋 测试: 互动动态负面判断');

function judgeInteraction(content: string): { shouldHide: boolean; reason: string } {
  const negativeWords = ['差', '烂', '垃圾', '骗', '假', '投诉', '退款', '退货', '不好', '太差', '失望'];
  const found = negativeWords.filter((w) => content.includes(w));
  return {
    shouldHide: found.length > 0,
    reason: found.length > 0 ? `包含负面词: ${found.join(', ')}` : '正常',
  };
}

assert('识别"太差了"为负面', judgeInteraction('这个商品太差了，不推荐').shouldHide, 'shouldHide=true');
assert('识别"垃圾"为负面', judgeInteraction('垃圾产品，千万别买').shouldHide, 'shouldHide=true');
assert('识别"好评"为正常', !judgeInteraction('很好用的产品，好评').shouldHide, 'shouldHide=false');
assert('识别"还不错"为正常', !judgeInteraction('还不错，可以购买').shouldHide, 'shouldHide=false');
assert('识别"质量差"为负面', judgeInteraction('质量差，不建议').shouldHide, '应该检测到"差"');

// ========== Test 2: 举报话术匹配 ==========
console.log('\n📋 测试: 举报话术匹配');

function matchReportTemplate(content: string, stars: number): string {
  if (content.includes('广告') || content.includes('加微信') || content.includes('加V')) {
    return '该评价内容为广告信息，请平台核实处理';
  }
  if (content.includes('骂') || content.includes('辱') || content.includes('脏话')) {
    return '该评价包含不文明用语，请平台核实处理';
  }
  if (content.includes('假') && (content.includes('货') || content.includes('冒牌'))) {
    return '该评价指控售假，内容不实，请平台核实处理';
  }
  return '该评价内容不实，请平台核实处理';
}

assert('广告识别', matchReportTemplate('加微信 abc123 有优惠', 1).includes('广告'), '匹配广告话术');
assert('辱骂识别', matchReportTemplate('卖家是骗子，骂死他', 1).includes('不文明'), '匹配辱骂话术');
assert('假货识别', matchReportTemplate('这是假货假的，冒牌', 1).includes('售假'), '匹配假货话术');
assert('默认话术', matchReportTemplate('一般般吧', 2).includes('内容不实'), '回退默认话术');

// ========== Test 3: 数据提取 ==========
console.log('\n📋 测试: 数值提取');

function extractNumber(text: string, label: string): number | null {
  const idx = text.indexOf(label);
  if (idx === -1) return null;
  const sub = text.substring(idx + label.length, idx + label.length + 50);
  const m = sub.match(/(\d+\.?\d*)/);
  return m ? parseFloat(m[1]) : null;
}

assert('提取星级 4.5', extractNumber('店铺综合体验星级4.5星', '店铺综合体验星级') === 4.5);
assert('提取劣质率 0.08', extractNumber('严重劣质率0.08%已达标', '严重劣质率') === 0.08);
assert('提取排名 35%', extractNumber('领航员综合分行业排名35%', '领航员综合分行业排名') === 35);
assert('提取评分 1.8', extractNumber('消费者服务体验分1.8/5.0', '消费者服务体验分') === 1.8);
assert('标签不存在返回 null', extractNumber('没有这个指标', '不存在的标签') === null);

// ========== Test 4: 好评回复模板变量填充 ==========
console.log('\n📋 测试: 模板变量');

function fillTemplate(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
  }
  return result;
}

assert(
  '变量填充-昵称',
  fillTemplate('感谢{name}的支持！', { name: '张三' }) === '感谢张三的支持！',
);
assert(
  '变量填充-商品名',
  fillTemplate('{product}品质有保障', { product: '鸭翅' }) === '鸭翅品质有保障',
);
assert(
  '多变量填充',
  fillTemplate('{name}您好，{product}已发货', { name: '李四', product: '零食' }) === '李四您好，零食已发货',
);

// ========== Generate Report ==========
const totalTests = passed + failed;
const report = `# Phase 2 单元测试报告

**日期**: ${new Date().toISOString().split('T')[0]}
**版本**: v0.2.0
**结果**: ${passed}/${totalTests} 通过 (${Math.round(passed / totalTests * 100)}%)

## 测试结果

| 测试项 | 结果 | 详情 |
|--------|------|------|
${results.join('\n')}

## 汇总
- ✅ 通过: ${passed}
- ❌ 失败: ${failed}
- 📊 通过率: ${Math.round(passed / totalTests * 100)}%
`;

fs.writeFileSync(REPORT_FILE, report);
console.log(`\n\n📄 报告: ${REPORT_FILE}`);
console.log(`结果: ${passed}/${totalTests} 通过`);

if (failed > 0) process.exit(1);
