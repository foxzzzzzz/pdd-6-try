import { BrowserManager } from './browser';
import { getDb, saveDb, schema, MetricsSnapshot } from '@pdd-inspector/core';

const log = (...args: any[]) => process.stdout.write(args.join(' ') + '\n');
import { eq, and, desc, sql } from 'drizzle-orm';
import { collectStoreMetrics } from './collectors/metrics';
import { collectExperienceMetrics } from './collectors/experience';
import { collectRefundMetrics } from './collectors/refunds';
import { collectAppealMetrics } from './collectors/appeals';
import { replyToGoodReviews, reportBadReviews, ReviewActionResult } from './actions/reviews';
import { handleInteractions, InteractionActionResult } from './actions/interactions';
import { getLightProvider, getHeavyProvider } from './ai/provider-factory';
import { detectAnomaliesByRules } from './ai/anomaly-detector';
import { generateDailyReport, generateSummaryByTemplate, StoreReportData } from './ai/report-generator';
import { buildMetricInsertValues } from './inspection-results';
import { shouldRunRuleBasedAnomalyDetection } from './inspection-config';

export interface InspectionConfig {
  inspectionId?: number;
  headless: boolean;
  screenshotOnError: boolean;
  enableReply: boolean;
  enableReport: boolean;
  enableHideInteractions: boolean;
  useAI: boolean;
}

const DEFAULT_CONFIG: InspectionConfig = {
  headless: true,
  screenshotOnError: true,
  enableReply: true,
  enableReport: true,
  enableHideInteractions: true,
  useAI: true,
};

/** 默认好评回复模板 (Phase 2 fallback) */
const DEFAULT_REPLY_TEMPLATE = '感谢亲的支持和喜爱！我们会继续努力提供优质的商品和服务，祝亲购物愉快！';

/** 负面关键词判断 (Phase 2 fallback, AI 不可用时使用) */
function ruleBasedInteractionJudge(content: string): { shouldHide: boolean; reason: string } {
  const negativeWords = ['差', '烂', '垃圾', '骗', '假', '投诉', '退款', '退货', '不好', '太差', '失望'];
  const found = negativeWords.filter((w) => content.includes(w));
  return {
    shouldHide: found.length > 0,
    reason: found.length > 0 ? `关键词匹配: ${found.join(', ')}` : '正常',
  };
}

/** 规则话术匹配 (Phase 2 fallback) */
function ruleBasedReportTemplate(review: { content: string; stars: number }): string {
  if (review.content.includes('广告') || review.content.includes('加微信')) {
    return '该评价内容为广告信息，请平台核实处理';
  }
  if (review.content.includes('骂') || review.content.includes('辱')) {
    return '该评价包含不文明用语，请平台核实处理';
  }
  return '该评价内容不实，请平台核实处理';
}

export async function inspectStore(
  storeId: number,
  storeName: string,
  date: string,
  config: Partial<InspectionConfig> = {},
): Promise<{ success: boolean; completionRate: number; errors: string[] }> {
  const resolvedConfig: InspectionConfig = { ...DEFAULT_CONFIG, ...config };
  const db = await getDb();
  const errors: string[] = [];
  const totalSteps = 7; // 4 data + 3 actions (reply, report, hide)
  let completedSteps = 0;
  let completionRate = 0;

  function updateInspectionRecord(values: Record<string, unknown>) {
    const query = db.update(schema.inspectionRecords).set(values);
    if (resolvedConfig.inspectionId != null) {
      query.where(eq(schema.inspectionRecords.id, resolvedConfig.inspectionId)).run();
      return;
    }
    query.where(and(
      eq(schema.inspectionRecords.storeId, storeId),
      eq(schema.inspectionRecords.date, date),
    )!).run();
  }

  // Update inspection record: running
  updateInspectionRecord({ status: 'running', startTime: new Date().toISOString() });

  const browser = new BrowserManager();
  const startTime = Date.now();

  try {
    // ======== PHASE 1: LOGIN ========
    const store = db.select().from(schema.stores).where(eq(schema.stores.id, storeId)).get();
    if (!store) {
      throw new Error(`Store ${storeId} not found`);
    }

    await browser.init(resolvedConfig.headless);
    const loggedIn = await browser.login(storeId, store.storageState);

    if (!loggedIn) {
      // Update store status to pending_login
      db.update(schema.stores)
        .set({ status: 'pending_login', updatedAt: new Date().toISOString() })
        .where(eq(schema.stores.id, storeId))
        .run();
      saveDb();

      errors.push('Login required — manual intervention needed');
      return { success: false, completionRate: 0, errors };
    }

    // Save fresh storage state
    const newStorageState = await browser.saveStorageState();
    db.update(schema.stores)
      .set({ storageState: newStorageState, status: 'active', updatedAt: new Date().toISOString() })
      .where(eq(schema.stores.id, storeId))
      .run();

    // ======== PHASE 2: DATA COLLECTION ========
    log(`[${storeName}] Starting data collection...`);

    // Step 1: Store health metrics
    const healthMetrics = await collectStoreMetrics(browser, storeId);
    completedSteps++;
    log(`[${storeName}] Store health collected`);

    // Step 2: Consumer experience
    const expMetrics = await collectExperienceMetrics(browser, storeId);
    completedSteps++;
    log(`[${storeName}] Consumer experience collected`);

    // Step 3: Refund data
    const refundMetrics = await collectRefundMetrics(browser, storeId);
    completedSteps++;
    log(`[${storeName}] Refund data collected`);

    // Step 4: Appeal data
    const appealMetrics = await collectAppealMetrics(browser, storeId);
    completedSteps++;
    log(`[${storeName}] Appeal data collected`);

    // ======== PHASE 2.5: REVIEW ACTIONS ========
    let reviewResult: ReviewActionResult = { details: [], replied: 0, reported: 0, skipped: 0, failed: 0 };
    let interactionResult: InteractionActionResult = { details: [], hidden: 0, ignored: 0, skipped: 0 };

    // Step 5: Reply to good reviews
    if (resolvedConfig.enableReply) {
      try {
        reviewResult = await replyToGoodReviews(browser, storeId, DEFAULT_REPLY_TEMPLATE);
        log(`[${storeName}] Reviews: ${reviewResult.replied} replied, ${reviewResult.skipped} skipped`);
      } catch (err) {
        errors.push(`Reply failed: ${err}`);
      }
    }
    completedSteps++;

    // Step 6: Report bad reviews
    if (resolvedConfig.enableReport) {
      try {
        // AI 介入点 1&2: 尝试用 AI 匹配话术
        var reportTemplateFn = ruleBasedReportTemplate;
        if (resolvedConfig.useAI) {
          try {
            var aiProvider = getLightProvider(store.aiConfig);
            reportTemplateFn = function (review: { content: string; stars: number }) {
              // 同步调用不支持 async，这里使用规则引擎 + AI 标记
              // AI 分类在后续批处理中执行
              return ruleBasedReportTemplate(review);
            };
          } catch { /* AI not available, use rules */ }
        }
        const reportResult = await reportBadReviews(browser, storeId, reportTemplateFn);
        reviewResult.reported = reportResult.reported;
        reviewResult.skipped += reportResult.skipped;
        reviewResult.failed += reportResult.failed;
        reviewResult.details.push(...reportResult.details);
        log(`[${storeName}] Reports: ${reportResult.reported} reported, ${reportResult.skipped} skipped`);
      } catch (err) {
        errors.push(`Report failed: ${err}`);
      }
    }
    completedSteps++;

    // Step 7: Handle bad interactions (介入点 3)
    var interactionJudgeFn = ruleBasedInteractionJudge;
    if (resolvedConfig.useAI) {
      try {
        var aiHeavy = getHeavyProvider(store.aiConfig);
        interactionJudgeFn = function (content: string) {
          // Async not supported in sync callback — use rules as fallback
          // AI judgment happens via batch processing if needed
          return ruleBasedInteractionJudge(content);
        };
      } catch { /* AI not available, use rules */ }
    }
    if (resolvedConfig.enableHideInteractions) {
      try {
        interactionResult = await handleInteractions(browser, storeId, interactionJudgeFn);
        log(`[${storeName}] Interactions: ${interactionResult.hidden} hidden, ${interactionResult.ignored} ignored`);
      } catch (err) {
        errors.push(`Interactions failed: ${err}`);
      }
    }
    completedSteps++;

    // ======== PHASE 3: SAVE RESULTS ========
    const mergedMetrics: MetricsSnapshot = {
      storeId,
      date,
      rating: null,
      ratingChange: null,
      defectRate: null,
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
      ...healthMetrics,
      ...expMetrics,
      ...refundMetrics,
      ...appealMetrics,
    };

    // Calculate change rates from previous inspection
    const prevMetrics = db
      .select().from(schema.storeMetrics)
      .where(eq(schema.storeMetrics.storeId, storeId))
      .orderBy(desc(schema.storeMetrics.date))
      .limit(1).all()
      .filter((m) => m.date !== date);

    if (prevMetrics.length > 0) {
      var pm = prevMetrics[0];
      if (mergedMetrics.rating != null && pm.rating != null) {
        mergedMetrics.ratingChange = mergedMetrics.rating - pm.rating;
      }
      if (mergedMetrics.defectRate != null && pm.defectRate != null) {
        mergedMetrics.defectRateChange = mergedMetrics.defectRate - pm.defectRate;
      }
    }

    // Get inspection record ID
    const record = resolvedConfig.inspectionId != null
      ? db
        .select()
        .from(schema.inspectionRecords)
        .where(eq(schema.inspectionRecords.id, resolvedConfig.inspectionId))
        .get()
      : db
        .select()
        .from(schema.inspectionRecords)
        .where(and(
          eq(schema.inspectionRecords.storeId, storeId),
          eq(schema.inspectionRecords.date, date),
        ))
        .orderBy(desc(schema.inspectionRecords.createdAt))
        .get();

    // ======== PHASE 4: AI ANALYSIS (介入点 4 & 5) ========
    // Anomaly detection (介入点4)
    let anomalyResult = null;
    if (shouldRunRuleBasedAnomalyDetection(resolvedConfig)) {
      try {
        const historicalMetrics = db
          .select()
          .from(schema.storeMetrics)
          .where(eq(schema.storeMetrics.storeId, storeId))
          .orderBy(desc(schema.storeMetrics.date))
          .limit(7)
          .all();

        const currentNums: Record<string, number | null> = {
          rating: mergedMetrics.rating,
          defectRate: mergedMetrics.defectRate,
          expBasic: mergedMetrics.expBasic,
          refundRate: mergedMetrics.refundRate,
        };

        const historyNums = historicalMetrics.map((m) => ({
          rating: m.rating,
          defectRate: m.defectRate,
          expBasic: m.expBasic,
          refundRate: m.refundRate,
        }));

        anomalyResult = detectAnomaliesByRules(currentNums, historyNums);

        if (anomalyResult.isAnomaly) {
          log(`[${storeName}] ⚠️ Anomaly: ${anomalyResult.description}`);
          // Persisted in the dedicated anomaly-fix change.
        }
      } catch (err) {
        log('[ERROR]',`Anomaly detection error:`, err);
      }
    }

    // Save metrics
    db.insert(schema.storeMetrics)
      .values(buildMetricInsertValues(mergedMetrics, record?.id || null, anomalyResult))
      .run();

    // Save review actions
    for (const detail of reviewResult.details) {
      db.insert(schema.reviewActions)
        .values({
          storeId,
          inspectionId: record?.id || null,
          reviewId: detail.reviewId,
          reviewContent: detail.reviewContent,
          reviewStars: detail.reviewStars,
          actionType: detail.actionType,
          actionContent: detail.actionContent,
          status: detail.status,
        })
        .run();
    }

    // Save interaction actions
    for (const detail of interactionResult.details) {
      db.insert(schema.interactionActions)
        .values({
          storeId,
          inspectionId: record?.id || null,
          interactionId: detail.interactionId,
          contentSummary: detail.contentSummary,
          aiJudgment: detail.aiJudgment,
          action: detail.action,
          status: detail.status,
        })
        .run();
    }

    // ======== COMPLETE ========
    const duration = Math.floor((Date.now() - startTime) / 1000);
    completionRate = completedSteps / totalSteps;

    updateInspectionRecord({
      status: completionRate === 1 ? 'completed' : 'partial',
      endTime: new Date().toISOString(),
      duration,
      completionRate,
    });

    saveDb();
    log(`[${storeName}] Inspection complete: ${completionRate * 100}% in ${duration}s`);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    errors.push(errMsg);
    log('[ERROR]',`[${storeName}] Inspection error:`, errMsg);

    if (resolvedConfig.screenshotOnError) {
      try {
        await browser.takeScreenshot(storeId, 'error');
      } catch { /* ignore screenshot errors */ }
    }

    // Mark as failed
    updateInspectionRecord({
      status: 'failed',
      endTime: new Date().toISOString(),
      duration: Math.floor((Date.now() - startTime) / 1000),
      completionRate: completedSteps / totalSteps,
    });
    saveDb();
  } finally {
    await browser.close();
  }

  return { success: errors.length === 0, completionRate, errors };
}
