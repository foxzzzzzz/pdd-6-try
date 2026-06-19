import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// ============================================================
// 1. stores — 店铺基本信息 & 登录凭证
// ============================================================
export const stores = sqliteTable('stores', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),                          // 店铺名称
  pddStoreId: text('pdd_store_id').notNull().unique(),   // PDD 店铺ID
  cookie: text('cookie'),                                 // 登录 Cookie (JSON)
  storageState: text('storage_state'),                    // Playwright storageState (JSON)
  status: text('status').notNull().default('active'),     // active | paused | pending_login
  owner: text('owner'),                                   // 负责人
  factory: text('factory'),                               // 关联工厂
  aiConfig: text('ai_config'),                            // AI 配置 (JSON): {provider, model}
  createdAt: text('created_at').default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`),
});

// ============================================================
// 2. inspection_records — 每次巡店的完整记录
// ============================================================
export const inspectionRecords = sqliteTable('inspection_records', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  storeId: integer('store_id').references(() => stores.id).notNull(),
  date: text('date').notNull(),                           // 巡店日期 YYYY-MM-DD
  status: text('status').notNull().default('pending'),    // pending | running | completed | failed | partial
  startTime: text('start_time'),
  endTime: text('end_time'),
  duration: integer('duration'),                          // 耗时 (秒)
  workerId: text('worker_id'),                            // Worker 编号
  completionRate: real('completion_rate'),                // 完成率 0-1
  summary: text('summary'),                               // AI 生成的巡店摘要
  createdAt: text('created_at').default(sql`(datetime('now'))`),
});

// ============================================================
// 3. store_metrics — 每日指标快照 (核心表)
// ============================================================
export const storeMetrics = sqliteTable('store_metrics', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  storeId: integer('store_id').references(() => stores.id).notNull(),
  inspectionId: integer('inspection_id').references(() => inspectionRecords.id),
  date: text('date').notNull(),                           // 数据日期

  // 店铺健康度
  rating: real('rating'),                                 // 店铺星级 (如 4.82)
  ratingChange: real('rating_change'),                    // 星级变化
  defectRate: real('defect_rate'),                        // 劣质率
  defectRateChange: real('defect_rate_change'),

  // DSR 三项
  dsrDesc: real('dsr_desc'),                              // 描述相符
  dsrService: real('dsr_service'),                        // 服务态度
  dsrLogistics: real('dsr_logistics'),                    // 物流服务
  dsrRankChange: text('dsr_rank_change'),                 // 排名变化

  // 综合体验星级/领航员考核指标
  pilotIndustryRank: real('pilot_industry_rank'),         // 领航员综合分行业排名
  platformHelpRate: real('platform_help_rate'),           // 平台求助率
  threeMinuteReplyRate: real('three_minute_reply_rate'),  // 3分钟人工回复率
  inTransitRefundDuration: real('in_transit_refund_duration'), // 在途订单退款时长
  returnRefundDuration: real('return_refund_duration'),   // 退货签收后平均退款时长
  reviewScoreRank: real('review_score_rank'),             // 用户评价得分排名
  positiveReviewRate: real('positive_review_rate'),       // 积极评论率
  groupToSignDuration: real('group_to_sign_duration'),    // 成团-签收时效
  logisticsViolationRate: real('logistics_violation_rate'), // 物流综合违规处理率
  storeActivityRate: real('store_activity_rate'),         // 店铺活跃度
  experiencePlanStatus: text('experience_plan_status'),   // 消费者体验提升计划状态

  // 消费者体验分
  expBasic: real('exp_basic'),                            // 消费者服务体验总分
  expServiceBasic: real('exp_service_basic'),             // 基础服务体验分
  expAttitude: real('exp_attitude'),                      // 服务态度分
  expShipping: real('exp_shipping'),                      // 发货分
  expProduct: real('exp_product'),                        // 商品分
  expLogistics: real('exp_logistics'),                    // 物流分
  expIndustryRankRange: text('exp_industry_rank_range'),  // 同行排名区间
  expBasicChange: real('exp_basic_change'),               // 消费者服务体验总分变化
  expServiceBasicChange: real('exp_service_basic_change'), // 基础服务体验分变化
  expAttitudeChange: real('exp_attitude_change'),         // 服务态度体验分变化
  expShippingChange: real('exp_shipping_change'),         // 发货服务体验分变化
  expProductChange: real('exp_product_change'),           // 商品服务体验分变化
  expLogisticsChange: real('exp_logistics_change'),       // 物流服务体验分变化

  // 订单退款
  refundDuration: real('refund_duration'),                // 退款时长 (小时)
  refundRate: real('refund_rate'),                        // 退款率
  disputeRate: real('dispute_rate'),                      // 纠纷率
  disputeRefundCount: integer('dispute_refund_count'),    // 纠纷退款数
  disputeRefundRate: real('dispute_refund_rate'),         // 纠纷退款率
  interventionOrderCount: integer('intervention_order_count'), // 介入订单数
  platformInterventionRate: real('platform_intervention_rate'), // 平台介入率
  qualityRefundRate: real('quality_refund_rate'),         // 品质退款率
  averageRefundDuration: real('average_refund_duration'), // 平均退款时长 (小时)
  successfulRefundOrderCount: integer('successful_refund_order_count'), // 成功退款订单数
  successfulRefundAmount: real('successful_refund_amount'), // 成功退款金额
  successfulRefundRate: real('successful_refund_rate'),   // 成功退款率
  returnRefundAutoDuration: real('return_refund_auto_duration'), // 退货退款自主完结时长
  refundAutoDuration: real('refund_auto_duration'),       // 退款自主完结时长

  // 订单申诉
  appealCount: integer('appeal_count'),                   // 申诉数量
  appealSuccessRate: real('appeal_success_rate'),         // 申诉成功率

  // 异常标记
  anomalyFlags: text('anomaly_flags'),                    // AI 异常标记 (JSON)
  severity: text('severity'),                             // normal | warning | critical
  commentScoreRank: real('comment_score_rank'),
  commentScoreRankChange: real('comment_score_rank_change'),
  commentCount: integer('comment_count'),
  commentCountChange: real('comment_count_change'),

  createdAt: text('created_at').default(sql`(datetime('now'))`),
});

// ============================================================
// 4. review_actions — 评价操作明细
// ============================================================
export const reviewActions = sqliteTable('review_actions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  storeId: integer('store_id').references(() => stores.id).notNull(),
  inspectionId: integer('inspection_id').references(() => inspectionRecords.id),
  reviewId: text('review_id'),                            // PDD 评价ID
  reviewContent: text('review_content'),                  // 评价原文
  reviewStars: integer('review_stars'),                   // 评价星级
  actionType: text('action_type').notNull(),              // reply | report
  actionContent: text('action_content'),                  // 操作内容 (回复/举报话术)
  templateId: integer('template_id'),                     // 使用的话术模板ID
  status: text('status').notNull().default('pending'),    // pending | success | failed | skipped
  actionMode: text('action_mode'),                        // dry-run | real-run
  aiConfidence: real('ai_confidence'),                    // AI 置信度
  screenshotPath: text('screenshot_path'),                // 截图路径
  errorMessage: text('error_message'),                    // 失败原因
  submittedAt: text('submitted_at'),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
});

// ============================================================
// 5. interaction_actions — 互动动态处理记录
// ============================================================
export const interactionActions = sqliteTable('interaction_actions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  storeId: integer('store_id').references(() => stores.id).notNull(),
  inspectionId: integer('inspection_id').references(() => inspectionRecords.id),
  interactionId: text('interaction_id'),                  // PDD 动态ID
  contentSummary: text('content_summary'),                // 内容摘要
  aiJudgment: text('ai_judgment'),                        // AI 判定: negative | neutral | positive
  action: text('action').notNull(),                       // hide | ignore
  aiConfidence: real('ai_confidence'),                    // AI 置信度
  status: text('status').notNull().default('pending'),    // pending | success | failed | skipped
  actionMode: text('action_mode'),                        // dry-run | real-run
  screenshotPath: text('screenshot_path'),
  errorMessage: text('error_message'),
  submittedAt: text('submitted_at'),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
});

// ============================================================
// 6. reply_templates — 回复话术模板库
// ============================================================
export const replyTemplates = sqliteTable('reply_templates', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),                           // 模板名称
  scene: text('scene'),                                   // 适用场景
  content: text('content').notNull(),                     // 模板内容 (支持变量: {nickname} {product})
  variables: text('variables'),                           // 变量定义 (JSON)
  storeId: integer('store_id').references(() => stores.id), // NULL=全局共用, 非NULL=店铺专属
  enabled: integer('enabled').notNull().default(1),       // 0=禁用 1=启用
  usageCount: integer('usage_count').default(0),          // 使用次数
  createdAt: text('created_at').default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`),
});

// ============================================================
// 7. report_templates — 举报话术模板库
// ============================================================
export const reportTemplates = sqliteTable('report_templates', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),                           // 模板名称
  reportType: text('report_type'),                        // 举报类型: 广告 | 恶意 | 不实 | 竞品 | 其他
  content: text('content').notNull(),                     // 话术内容
  storeId: integer('store_id').references(() => stores.id), // NULL=全局共用, 非NULL=店铺专属
  enabled: integer('enabled').notNull().default(1),
  usageCount: integer('usage_count').default(0),
  successCount: integer('success_count').default(0),      // 举报成功次数
  createdAt: text('created_at').default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`),
});

// ============================================================
// 8. issues — 问题记录 & 复盘
// ============================================================
export const issues = sqliteTable('issues', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  storeId: integer('store_id').references(() => stores.id).notNull(),
  inspectionId: integer('inspection_id').references(() => inspectionRecords.id),
  type: text('type').notNull(),                           // 问题类型: quality | logistics | service | review | other
  severity: text('severity').notNull().default('medium'), // low | medium | high | critical
  description: text('description').notNull(),             // 问题描述
  factory: text('factory'),                               // 关联工厂
  factoryFeedback: text('factory_feedback'),              // 工厂反馈
  rectificationStatus: text('rectification_status').default('pending'), // pending | in_progress | resolved | closed
  handler: text('handler'),                               // 处理人
  shareToken: text('share_token'),                        // 工厂分享链接 token
  createdAt: text('created_at').default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`),
});

// ============================================================
// 9. users — 团队用户账户
// ============================================================
export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull().default('operator'),       // admin | operator | factory
  storeIds: text('store_ids'),                            // 关联店铺ID列表 (JSON)
  factoryIds: text('factory_ids'),                        // 关联工厂列表 (JSON)
  enabled: integer('enabled').notNull().default(1),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
});

// ============================================================
// 10. daily_reports - daily report snapshots for archive/review
// ============================================================
export const dailyReports = sqliteTable('daily_reports', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  date: text('date').notNull().unique(),
  status: text('status').notNull().default('generated'),  // generated | reviewed | published
  summary: text('summary').notNull(),                     // JSON: report summary
  stores: text('stores').notNull(),                       // JSON: store rows
  sourceHash: text('source_hash'),
  generatedAt: text('generated_at').notNull(),
  reviewedAt: text('reviewed_at'),
  publishedAt: text('published_at'),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`),
});
