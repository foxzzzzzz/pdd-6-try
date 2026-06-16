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

  // 消费者体验分
  expBasic: real('exp_basic'),                            // 基础分
  expShipping: real('exp_shipping'),                      // 发货分
  expProduct: real('exp_product'),                        // 商品分
  expLogistics: real('exp_logistics'),                    // 物流分

  // 订单退款
  refundDuration: real('refund_duration'),                // 退款时长 (小时)
  refundRate: real('refund_rate'),                        // 退款率
  disputeRate: real('dispute_rate'),                      // 纠纷率

  // 订单申诉
  appealCount: integer('appeal_count'),                   // 申诉数量
  appealSuccessRate: real('appeal_success_rate'),         // 申诉成功率

  // 异常标记
  anomalyFlags: text('anomaly_flags'),                    // AI 异常标记 (JSON)
  severity: text('severity'),                             // normal | warning | critical

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
  aiConfidence: real('ai_confidence'),                    // AI 置信度
  status: text('status').notNull().default('pending'),    // pending | success | failed | skipped
  screenshotPath: text('screenshot_path'),                // 截图路径
  errorMessage: text('error_message'),                    // 失败原因
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
  aiConfidence: real('ai_confidence'),                    // AI 置信度
  action: text('action').notNull(),                       // hide | ignore
  status: text('status').notNull().default('pending'),    // pending | success | failed | skipped
  errorMessage: text('error_message'),
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
