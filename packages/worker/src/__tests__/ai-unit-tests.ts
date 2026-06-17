/**
 * Phase 3 AI 单元测试
 *
 * 测试: Provider 接口 / 规则引擎 / 异常检测 / 日报模板
 * 运行: pnpm --filter @pdd-inspector/worker exec tsx src/__tests__/ai-unit-tests.ts
 */

import * as fs from 'fs';
import * as path from 'path';

import { buildAIConfig } from '@pdd-inspector/core';
import { detectAnomaliesByRules } from '../ai/anomaly-detector';
import { generateSummaryByTemplate } from '../ai/report-generator';
import { clearProviderCache } from '../ai/provider-factory';

const REPORT_FILE = path.resolve(process.cwd(), '../../docs/test-reports/phase-3-unit-test.md');

let passed = 0;
let failed = 0;
const results: string[] = [];

function assert(description: string, condition: boolean, detail = '') {
  if (condition) { passed++; results.push(`| ${description} | ✅ | ${detail} |`); }
  else { failed++; results.push(`| ${description} | ❌ | ${detail} |`); console.log(`  ❌ ${description}: ${detail}`); }
}

// ========== Test 1: AI Config Builder ==========
console.log('\n📋 AI 配置构建');
clearProviderCache();

const config1 = buildAIConfig('claude', 'claude-sonnet-4-6', 'sk-test', null, undefined);
assert('全局配置默认值', config1.provider === 'claude' && config1.model === 'claude-sonnet-4-6');

const config2 = buildAIConfig('claude', 'claude-sonnet-4-6', 'sk-test', '{"provider":"deepseek","model":"deepseek-chat"}', undefined);
assert('店铺级覆盖', config2.provider === 'deepseek' && config2.model === 'deepseek-chat');

const config3 = buildAIConfig('claude', 'claude-sonnet-4-6', 'sk-test', null, 'claude-haiku-4-5');
assert('任务级覆盖', config3.model === 'claude-haiku-4-5');

// ========== Test 2: Anomaly Detection (Rule Engine) ==========
console.log('\n📋 异常检测 (规则引擎)');

// Normal case
const norm = detectAnomaliesByRules(
  { rating: 4.5, defectRate: 0.0008, expBasic: 1.8, refundRate: 0.01 },
  [{ rating: 4.5, defectRate: 0.0007, expBasic: 1.9, refundRate: 0.01 }],
);
assert('正常店铺无异常', !norm.isAnomaly && norm.severity === 'normal');

// Rating drop
const drop = detectAnomaliesByRules(
  { rating: 4.1, defectRate: 0.0008, expBasic: 1.8, refundRate: 0.01 },
  [{ rating: 4.5, defectRate: 0.0007, expBasic: 1.9, refundRate: 0.01 }],
);
assert('评分下降检测', drop.isAnomaly && drop.flags.some((f) => f.includes('星级')), drop.flags.join('; '));

// High defect rate
const defect = detectAnomaliesByRules(
  { rating: 4.5, defectRate: 0.06, expBasic: 1.8, refundRate: 0.01 },
  [{ rating: 4.5, defectRate: 0.005, expBasic: 1.9, refundRate: 0.01 }],
);
assert('高劣质率检测', defect.isAnomaly && defect.severity === 'warning', defect.flags.join('; '));

// Multi-anomaly → critical
const multi = detectAnomaliesByRules(
  { rating: 4.0, defectRate: 0.07, expBasic: 1.0, refundRate: 0.15 },
  [{ rating: 4.6, defectRate: 0.005, expBasic: 2.5, refundRate: 0.02 }],
);
assert('多异常→critical', multi.severity === 'critical' && multi.flags.length >= 3, `${multi.flags.length} flags`);

// Empty history
const empty = detectAnomaliesByRules(
  { rating: 4.5, defectRate: 0.01, expBasic: 1.8, refundRate: 0.01 },
  [],
);
assert('无历史数据', !empty.isAnomaly, '无对比基准，不应误报');

// ========== Test 3: Report Generation (Template) ==========
console.log('\n📋 日报生成 (模板引擎)');

const report = generateSummaryByTemplate([
  { storeName: '正常店A', metrics: {}, reviewCount: 5, reportCount: 1, hideCount: 0, severity: 'normal' },
  { storeName: '预警店B', metrics: {}, reviewCount: 3, reportCount: 8, hideCount: 2, severity: 'warning', anomaly: { isAnomaly: true, severity: 'warning', flags: ['评分下降'], description: '评分下降0.15' } },
]);

assert('日报总览非空', report.overview.length > 0);
assert('关注列表包含预警店', report.attentionStores.some((s) => s.name === '预警店B'));
assert('推荐建议非空', report.recommendations.length > 0);
assert('趋势分析非空', report.trends.length > 0);

// All normal
const allNorm = generateSummaryByTemplate([
  { storeName: 'A', metrics: {}, reviewCount: 3, reportCount: 0, hideCount: 0, severity: 'normal' },
  { storeName: 'B', metrics: {}, reviewCount: 5, reportCount: 1, hideCount: 0, severity: 'normal' },
]);
assert('全部正常无关注', allNorm.attentionStores.length === 0);

// ========== Test 4: Provider Factory (without API key) ==========
console.log('\n📋 Provider 工厂');

try {
  // This should throw without API key
  const { getLightProvider } = require('../ai/provider-factory');
  const originalKey = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    getLightProvider();
    assert('无 API Key 应抛异常', false);
  } catch (e: any) {
    assert('无 API Key 正确抛异常', true, e.message?.substring(0, 50));
  }
  if (originalKey) process.env.ANTHROPIC_API_KEY = originalKey;
} catch { /* module load error expected */ }

// ========== Generate Report ==========
const totalTests = passed + failed;
const report_md = [
  '# Phase 3 AI 单元测试报告',
  '',
  `**日期**: ${new Date().toISOString().split('T')[0]}`,
  `**版本**: v0.3.0`,
  `**结果**: ${passed}/${totalTests} (${Math.round(passed / totalTests * 100)}%)`,
  '',
  '| 测试项 | 结果 | 详情 |',
  '|--------|------|------|',
  ...results,
  '',
  `## 汇总\n- ✅ 通过: ${passed}\n- ❌ 失败: ${failed}`,
].join('\n');

fs.writeFileSync(REPORT_FILE, report_md);
console.log(`\n📄 报告: ${REPORT_FILE}\n${passed}/${totalTests} 通过`);
if (failed > 0) process.exit(1);
