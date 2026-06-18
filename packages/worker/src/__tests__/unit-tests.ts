/**
 * Phase 2 单元测试 — 非浏览器逻辑
 *
 * 测试: 话术匹配 / 负面判断 / 数据提取
 * 运行: pnpm --filter @pdd-inspector/worker exec tsx src/__tests__/unit-tests.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  createInspectionJobData,
  createSchedulerJobData,
  INSPECTION_QUEUE,
  SCHEDULER_QUEUE,
} from '@pdd-inspector/core';
import { shouldRunRuleBasedAnomalyDetection } from '../inspection-config';
import { buildMetricInsertValues } from '../inspection-results';
import { parseStoreMetricsText } from '../collectors/metrics';
import { parseRefundMetricsText } from '../collectors/refunds';
import { parseExperienceMetricsHtml, parseExperienceMetricsText } from '../collectors/experience';
import { buildActionAudit, canSubmitAction, resolveActionSafety } from '../action-safety';
import { parseReviewBodyRowText, parseReviewRowText } from '../actions/reviews';
import { isWithinLast7Days, parseInteractionRowText } from '../actions/interactions';

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

function nearlyEqual(actual: number | null | undefined, expected: number): boolean {
  return actual != null && Math.abs(actual - expected) < 0.000001;
}

// ========== Test 0: Inspection persistence helpers ==========
console.log('\n📋 测试: 巡店记录关联与异常落库');

const jobData = createInspectionJobData(12, '测试店铺', '2026-06-17', 99);
assert('队列任务携带 inspectionId', jobData.inspectionId === 99);

const schedulerJobData = createSchedulerJobData();
assert('调度任务使用独立队列', SCHEDULER_QUEUE !== INSPECTION_QUEUE);
assert('调度任务不伪造店铺 ID', !('storeId' in schedulerJobData));
assert('关闭 AI 时仍运行规则异常检测', shouldRunRuleBasedAnomalyDetection({ useAI: false }));
assert('开启 AI 时仍运行规则异常检测', shouldRunRuleBasedAnomalyDetection({ useAI: true }));

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
    pilotIndustryRank: null,
    platformHelpRate: null,
    threeMinuteReplyRate: null,
    inTransitRefundDuration: null,
    returnRefundDuration: null,
    reviewScoreRank: null,
    positiveReviewRate: null,
    groupToSignDuration: null,
    logisticsViolationRate: null,
    storeActivityRate: null,
    experiencePlanStatus: null,
    expBasic: null,
    expServiceBasic: null,
    expAttitude: null,
    expShipping: null,
    expProduct: null,
    expLogistics: null,
    expIndustryRankRange: null,
    expBasicChange: null,
    expServiceBasicChange: null,
    expAttitudeChange: null,
    expShippingChange: null,
    expProductChange: null,
    expLogisticsChange: null,
    refundDuration: null,
    refundRate: null,
    disputeRate: null,
    disputeRefundCount: null,
    disputeRefundRate: null,
    interventionOrderCount: null,
    platformInterventionRate: null,
    qualityRefundRate: null,
    averageRefundDuration: null,
    successfulRefundOrderCount: null,
    successfulRefundAmount: null,
    successfulRefundRate: null,
    returnRefundAutoDuration: null,
    refundAutoDuration: null,
    appealCount: null,
    appealSuccessRate: null,
  },
  99,
  { isAnomaly: true, severity: 'warning', flags: ['defectRate'], description: 'defect rate high' },
);
assert('异常指标写入 warning 等级', metricValues.severity === 'warning');
assert('异常 flags 序列化写入', metricValues.anomalyFlags === '["defectRate"]');

const defaultSafety = resolveActionSafety({});
assert('写操作默认 dry-run', defaultSafety.mode === 'dry-run');
assert('写操作默认不提交回复', !canSubmitAction(defaultSafety, 'reply'));
assert('写操作默认不提交举报', !canSubmitAction(defaultSafety, 'report'));
assert('写操作默认不提交隐藏', !canSubmitAction(defaultSafety, 'hide'));

const enabledButDryRun = resolveActionSafety({ enableReply: true, enableReport: true, enableHideInteractions: true });
assert('开关开启但 dry-run 仍不提交回复', !canSubmitAction(enabledButDryRun, 'reply'));
assert('开关开启但 dry-run 仍不提交举报', !canSubmitAction(enabledButDryRun, 'report'));
assert('开关开启但 dry-run 仍不提交隐藏', !canSubmitAction(enabledButDryRun, 'hide'));

const realRunSafety = resolveActionSafety({
  mode: 'real-run',
  enableReply: true,
  enableReport: true,
  enableHideInteractions: true,
  maxActions: 1,
});
assert('real-run 且开关开启才提交回复', canSubmitAction(realRunSafety, 'reply'));
assert('real-run 且开关开启才提交举报', canSubmitAction(realRunSafety, 'report'));
assert('real-run 且开关开启才提交隐藏', canSubmitAction(realRunSafety, 'hide'));
assert('real-run 支持限制最大写操作数', realRunSafety.maxActions === 1);

const realRunFromInspectionConfig = resolveActionSafety({
  actionMode: 'real-run',
  enableReply: true,
} as Parameters<typeof resolveActionSafety>[0]);
assert('inspection config actionMode=real-run enables reply', canSubmitAction(realRunFromInspectionConfig, 'reply'));

const dryRunAudit = buildActionAudit(defaultSafety, 'would reply', { screenshotPath: 'a.png' });
assert('dry-run 审计状态为 skipped', dryRunAudit.status === 'skipped');
assert('dry-run 审计记录 actionMode', dryRunAudit.actionMode === 'dry-run');
assert('dry-run 审计记录截图路径', dryRunAudit.screenshotPath === 'a.png');

const realRunAudit = buildActionAudit(realRunSafety, 'submitted', { submitted: true, screenshotPath: 'b.png' });
assert('real-run 提交审计状态为 success', realRunAudit.status === 'success');
assert('real-run 提交审计记录 submittedAt', typeof realRunAudit.submittedAt === 'string' && realRunAudit.submittedAt.length > 0);

const reviewRow = parseReviewRowText(`用户评价分： ★★★★★    被点赞数：0    互动数：0
该用户觉得商品很好，给出了5星好评
2026-06-17 16:59:53
订单编号：260606-674035218750803
查看订单
举报
回复/互动`);
assert('评价回复只从评价行提取星级', reviewRow?.stars === 5);
assert('评价回复只从评价行提取内容', reviewRow?.content === '该用户觉得商品很好，给出了5星好评');
assert('评价回复只从评价行提取订单标识', reviewRow?.id === '260606674035218750803');

const nonReviewPanel = parseReviewRowText(`近90日评价数 608
今日评价数 0
回复/互动`);
assert('非评价行不进入回复候选', nonReviewPanel === null);

const reviewBodyRow = parseReviewBodyRowText(`该用户觉得商品较好
2026-06-17 16:59:53
订单编号：260606-674035218750803
买家昵称：麟***
盐焗翅中五香卤味鸭翅中
ID: 962105416031
查看订单
举报
回复/互动`);
assert('评价内容行提取4星较好评价', reviewBodyRow?.stars === 4);
assert('评价内容行绑定订单标识', reviewBodyRow?.id === '260606674035218750803');

const fiveStarBodyRow = parseReviewBodyRowText(`该用户觉得商品很好，给出了5星好评
2026-06-17 16:21:09
订单编号：260614-284289943142096
回复/互动`);
assert('评价内容行提取5星好评', fiveStarBodyRow?.stars === 5);

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

const interactionNow = new Date('2026-06-18T22:30:00+08:00');
const recentInteraction = parseInteractionRowText(`小黑哥
这么多添加剂吓死宝宝了
2026-06-17 23:41
回复
隐藏评论
查看详情`, 'interaction-test', interactionNow);
assert('互动隐藏候选提取评论内容', recentInteraction?.content === '这么多添加剂吓死宝宝了');
assert('互动隐藏候选识别近7日', recentInteraction?.withinLast7Days === true);
assert('近7日边界判断为 true', isWithinLast7Days('2026-06-12 22:30', interactionNow));

const oldInteraction = parseInteractionRowText(`周文明
[大爱]味道超好
2026-06-01 20:46
回复
隐藏评论
查看详情`, 'interaction-old', interactionNow);
assert('超过7日互动候选会被跳过', oldInteraction?.withinLast7Days === false);

const alreadyHiddenInteraction = parseInteractionRowText(`小黑哥
这么多添加剂吓死宝宝了
2026-06-17 23:41
回复
公开评论
查看详情`, 'interaction-hidden', interactionNow);
assert('已隐藏评论不进入隐藏候选', alreadyHiddenInteraction === null);

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

const misleadingStoreMetrics = parseStoreMetricsText(
  '店铺综合体验星级4.5 近90天用户评价得分排名12.60% 近30天3分钟人工回复率52.17% 近30天成团-签收时效2.45 领航员综合分行业排名36%',
);
assert('不把评价得分排名误写为 DSR 描述分', misleadingStoreMetrics.dsrDesc == null);
assert('不把3分钟回复率误写为 DSR 服务分', misleadingStoreMetrics.dsrService == null);
assert('不把签收时效误写为 DSR 物流分', misleadingStoreMetrics.dsrLogistics == null);

const pilotMallMetrics = parseStoreMetricsText(
  '领航员综合分行业排名 36% 售后服务 近30天平台求助率 2.46% 已达标 近30天3分钟人工回复率 52.17% 未达标 近30天在途订单退款时长 0.02小时 已达标 近30天商家签收消费者退货订单后的平均退款时长 0.67小时 已达标 商品品质 近90天用户评价得分排名 12.60% 未达标 近30天积极评论率 94.12% 未达标 近30天严重劣质率 0.08% 已达标 物流服务 近30天成团-签收时效 2.45天 已达标 近30天物流综合违规处理率 0.83% 已达标 店铺活跃 近30天店铺活跃度 36% 未达标 特色服务 消费者体验提升计划开通状态 未开通去开通 未达标',
);
assert('提取领航员行业排名', nearlyEqual(pilotMallMetrics.pilotIndustryRank, 0.36));
assert('提取平台求助率', nearlyEqual(pilotMallMetrics.platformHelpRate, 0.0246));
assert('提取3分钟人工回复率', nearlyEqual(pilotMallMetrics.threeMinuteReplyRate, 0.5217));
assert('提取在途订单退款时长', pilotMallMetrics.inTransitRefundDuration === 0.02);
assert('提取退货签收后平均退款时长', pilotMallMetrics.returnRefundDuration === 0.67);
assert('提取用户评价得分排名', nearlyEqual(pilotMallMetrics.reviewScoreRank, 0.126));
assert('提取积极评论率', nearlyEqual(pilotMallMetrics.positiveReviewRate, 0.9412));
assert('提取成团签收时效', pilotMallMetrics.groupToSignDuration === 2.45);
assert('提取物流综合违规处理率', nearlyEqual(pilotMallMetrics.logisticsViolationRate, 0.0083));
assert('提取店铺活跃度', nearlyEqual(pilotMallMetrics.storeActivityRate, 0.36));
assert('带百分号的劣质率按小数落库', nearlyEqual(pilotMallMetrics.defectRate, 0.0008));
assert('提取消费者体验提升计划状态', pilotMallMetrics.experiencePlanStatus === '未开通');

const experienceMetrics = parseExperienceMetricsText(
  '消费者服务体验分 1.8 / 5.0 较前7日 ↓ 17.10% 本店铺体验分在同行排名60%-70% 服务态度体验分 0.1 分 较前7日 ↑ 8.83% 基础服务体验分 1.9 分 较前7日 ↓ 43.23% 商品服务体验分 1.8 分 较前7日 ↓ 0.60% 发货服务体验分 2.4 分 较前7日 ↑ 12.82% 物流服务体验分 3.4 分 较前7日 ↑ 3.64%',
);
assert('提取消费者体验总分', experienceMetrics.expBasic === 1.8);
assert('提取基础服务体验分', experienceMetrics.expServiceBasic === 1.9);
assert('提取服务态度体验分', experienceMetrics.expAttitude === 0.1);
assert('提取商品服务体验分', experienceMetrics.expProduct === 1.8);
assert('提取发货服务体验分', experienceMetrics.expShipping === 2.4);
assert('提取物流服务体验分', experienceMetrics.expLogistics === 3.4);
assert('提取消费者体验同行排名区间', experienceMetrics.expIndustryRankRange === '60%-70%');
assert('提取消费者体验总分变化', nearlyEqual(experienceMetrics.expBasicChange, -0.171));
assert('提取服务态度体验分变化', nearlyEqual(experienceMetrics.expAttitudeChange, 0.0883));
assert('提取基础服务体验分变化', nearlyEqual(experienceMetrics.expServiceBasicChange, -0.4323));
assert('提取商品服务体验分变化', nearlyEqual(experienceMetrics.expProductChange, -0.006));
assert('提取发货服务体验分变化', nearlyEqual(experienceMetrics.expShippingChange, 0.1282));
assert('提取物流服务体验分变化', nearlyEqual(experienceMetrics.expLogisticsChange, 0.0364));

const unsignedExperienceMetrics = parseExperienceMetricsText('消费者服务体验分 1.8 / 5.0 较前7日17.10%');
assert('无箭头变化率不猜方向', unsignedExperienceMetrics.expBasicChange == null);

const experienceHtmlMetrics = parseExperienceMetricsHtml(`
  <section>
    <div>消费者服务体验分</div><span class="arrow-down_filled"></span><span>17.10%</span>
    <div>服务态度体验分</div><span class="arrow-up_filled"></span><span>3.83%</span>
    <div>基础服务体验分</div><span class="arrow-down_filled"></span><span>43.23%</span>
    <div>商品服务体验分</div><span class="arrow-down_filled"></span><span>0.60%</span>
    <div>发货服务体验分</div><span class="arrow-up_filled"></span><span>12.82%</span>
    <div>物流服务体验分</div><span class="arrow-up_filled"></span><span>3.64%</span>
  </section>
`);
assert('从 HTML 箭头提取消费者体验总分变化', nearlyEqual(experienceHtmlMetrics.expBasicChange, -0.171));
assert('从 HTML 箭头提取服务态度变化', nearlyEqual(experienceHtmlMetrics.expAttitudeChange, 0.0383));
assert('从 HTML 箭头提取基础服务变化', nearlyEqual(experienceHtmlMetrics.expServiceBasicChange, -0.4323));
assert('从 HTML 箭头提取商品服务变化', nearlyEqual(experienceHtmlMetrics.expProductChange, -0.006));
assert('从 HTML 箭头提取发货服务变化', nearlyEqual(experienceHtmlMetrics.expShippingChange, 0.1282));
assert('从 HTML 箭头提取物流服务变化', nearlyEqual(experienceHtmlMetrics.expLogisticsChange, 0.0364));

const attitudeExperienceText = parseStoreMetricsText('服务态度体验分 0.1 分 物流服务体验分 3.4 分');
assert('不把服务态度体验分误写为 DSR 服务分', attitudeExperienceText.dsrService == null);
assert('不把物流服务体验分误写为 DSR 物流分', attitudeExperienceText.dsrLogistics == null);

const realStoreMetrics = parseStoreMetricsText(
  '店铺综合体验星级4.6 严重劣质率0.08% 描述相符4.7 服务态度4.8 物流服务4.6 领航员综合分行业排名35%',
);
assert('提取真实 DSR 描述相符分', realStoreMetrics.dsrDesc === 4.7);
assert('提取真实 DSR 服务态度分', realStoreMetrics.dsrService === 4.8);
assert('提取真实 DSR 物流服务分', realStoreMetrics.dsrLogistics === 4.6);

const refundMetrics = parseRefundMetricsText(
  '待商家处理6 纠纷退款数 0 纠纷退款率 0.40% 介入订单数 1 平台介入率 0.65% 品质退款率 3.20% 平均退款时长 12.5小时 成功退款订单数 2 成功退款金额 99.50元 成功退款率 13.70% 退货退款自主完结时长 29.57小时 退款自主完结时长 0.00小时',
);
assert('不把待商家处理数量误写为退款时长', refundMetrics.refundDuration === 12.5);
assert('提取成功退款率为小数', nearlyEqual(refundMetrics.refundRate, 0.137));
assert('提取纠纷率为小数', nearlyEqual(refundMetrics.disputeRate, 0.004));
assert('提取纠纷退款数', refundMetrics.disputeRefundCount === 0);
assert('提取介入订单数', refundMetrics.interventionOrderCount === 1);
assert('提取平台介入率', nearlyEqual(refundMetrics.platformInterventionRate, 0.0065));
assert('提取品质退款率', nearlyEqual(refundMetrics.qualityRefundRate, 0.032));
assert('提取成功退款订单数', refundMetrics.successfulRefundOrderCount === 2);
assert('提取成功退款金额', refundMetrics.successfulRefundAmount === 99.5);
assert('提取退货退款自主完结时长', refundMetrics.returnRefundAutoDuration === 29.57);
assert('提取退款自主完结时长', refundMetrics.refundAutoDuration === 0);

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
