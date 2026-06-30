import { BrowserManager } from './browser';
import { getDb, saveDb, schema, MetricsSnapshot, quoteSqlString, type AppDb } from '@pdd-inspector/core';

const log = (...args: any[]) => { try { process.stdout.write(args.join(' ') + '\n'); } catch { /* ignore */ } };
import { eq, and, desc, sql } from 'drizzle-orm';
import { collectStoreMetrics } from './collectors/metrics';
import { collectExperienceMetrics } from './collectors/experience';
import { collectRefundMetrics } from './collectors/refunds';
import { collectAppealMetrics } from './collectors/appeals';
import { collectCommentMetrics } from './collectors/comments';
import { collectCustomerMetrics } from './collectors/customer';
import { replyToGoodReviews, reportBadReviews, ReviewActionResult } from './actions/reviews';
import { handleInteractions, InteractionActionResult } from './actions/interactions';
import { getLightProvider, getHeavyProvider } from './ai/provider-factory';
import { detectAnomaliesByRules } from './ai/anomaly-detector';
import { createInteractionJudge, createReportTemplateResolver } from './ai/action-decisions';
import { formatDailySummaryForInspection, generateDailyReport, StoreReportData } from './ai/report-generator';
import { buildMetricInsertValues } from './inspection-results';
import { shouldRunRuleBasedAnomalyDetection } from './inspection-config';
import { ActionMode, resolveActionSafety } from './action-safety';
import { recordRiskEvent } from './risk-sentinel';
import { getOperatorStoreSession, normalizeOperatorId, saveOperatorStoreSession } from './operator-session';
import { isModuleDegraded, SelectorModuleKey } from './selector-health';
import { getRuleReviewBlockReason } from './rule-review';

export interface InspectionConfig {
  inspectionId?: number;
  operatorId?: string | null;
  headless: boolean;
  screenshotOnError: boolean;
  enableReply: boolean;
  enableReport: boolean;
  enableHideInteractions: boolean;
  enableAppealMetrics: boolean;
  useAI: boolean;
  actionMode: ActionMode;
  actionLimit: number | null;
  replyDailyLimit?: number | null;
  reportDailyLimit?: number | null;
  hideDailyLimit?: number | null;
  replyApprovalRequired?: boolean;
  reportApprovalRequired?: boolean;
  hideApprovalRequired?: boolean;
}

const DEFAULT_CONFIG: InspectionConfig = {
  headless: false,
  screenshotOnError: true,
  enableReply: false,
  enableReport: false,
  enableHideInteractions: false,
  enableAppealMetrics: false,
  useAI: true,
  actionMode: 'dry-run',
  actionLimit: null,
  replyDailyLimit: 20,
  reportDailyLimit: 5,
  hideDailyLimit: 5,
  replyApprovalRequired: false,
  reportApprovalRequired: true,
  hideApprovalRequired: true,
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
  const operatorId = normalizeOperatorId(resolvedConfig.operatorId);
  const db = await getDb();
  const reportRuleReviewBlock = getRuleReviewBlockReason(db, 'report');
  const hideRuleReviewBlock = getRuleReviewBlockReason(db, 'hide');
  const actionSafety = resolveActionSafety({
    ...resolvedConfig,
    maxActions: resolvedConfig.actionLimit,
    replyApprovalRequired: resolvedConfig.replyApprovalRequired,
    reportApprovalRequired: resolvedConfig.reportApprovalRequired || Boolean(reportRuleReviewBlock),
    hideApprovalRequired: resolvedConfig.hideApprovalRequired || Boolean(hideRuleReviewBlock),
    enableReport: reportRuleReviewBlock ? false : resolvedConfig.enableReport,
    enableHideInteractions: hideRuleReviewBlock ? false : resolvedConfig.enableHideInteractions,
    dailyLimits: {
      reply: resolvedConfig.replyDailyLimit ?? null,
      report: resolvedConfig.reportDailyLimit ?? null,
      hide: resolvedConfig.hideDailyLimit ?? null,
    },
    dailyUsage: getDailyActionUsage(db, storeId, date),
  });
  log(`[${storeName}] Action safety: mode=${actionSafety.mode} limit=${actionSafety.maxActions ?? 'none'} reply=${actionSafety.enableReply} report=${actionSafety.enableReport} hide=${actionSafety.enableHideInteractions}`);
  const errors: string[] = [];
  const totalSteps = resolvedConfig.enableAppealMetrics ? 9 : 8; // data + 3 action scan steps
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

  async function ensureNoSecurityChallenge(phase: string): Promise<void> {
    if (!(await browser.hasSecurityChallenge())) return;

    const message = `Security challenge detected during ${phase}; patrol paused for manual handling`;
    await recordRiskEvent(db, {
      storeId,
      operatorId,
      eventType: 'security',
      message,
      browser,
    });
    db.update(schema.stores)
      .set({ status: 'paused', updatedAt: new Date().toISOString() })
      .where(eq(schema.stores.id, storeId))
      .run();
    saveDb(db);

    if (resolvedConfig.headless) {
      throw new Error(message);
    }

    const waitMs = resolveSecurityChallengeWaitMs();
    log(`[${storeName}] Security challenge detected during ${phase}; waiting ${Math.round(waitMs / 1000)}s for manual handling`);
    if (!(await browser.waitForSecurityChallengeCleared(waitMs))) {
      throw new Error(`${message}; manual handling timed out`);
    }

    const refreshedStorageState = await browser.saveStorageState();
    saveOperatorStoreSession(db, operatorId, storeId, refreshedStorageState, 'active');
    db.update(schema.stores)
      .set({ storageState: refreshedStorageState, status: 'active', updatedAt: new Date().toISOString() })
      .where(eq(schema.stores.id, storeId))
      .run();
    db.run(sql.raw(`
      UPDATE risk_events
      SET status = 'resolved',
          resolved_at = ${quoteSqlString(new Date().toISOString())}
      WHERE store_id = ${storeId}
        AND event_type = 'security'
        AND status = 'active'
    `));
    saveDb(db);
    log(`[${storeName}] Security challenge cleared; login state refreshed`);
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

    const operatorSession = getOperatorStoreSession(db, operatorId, storeId);
    await browser.init({ headless: resolvedConfig.headless, profileKey: operatorSession?.profileKey });
    const storageState = operatorSession?.storageState || store.storageState;
    const loggedIn = await browser.login(storeId, storageState);

    if (!loggedIn) {
      const loginMessage = 'Login required - manual intervention needed';
      await recordRiskEvent(db, {
        storeId,
        operatorId,
        eventType: 'login',
        message: loginMessage,
        browser,
      });

      errors.push(loginMessage);
      updateInspectionRecord({
        status: 'failed',
        endTime: new Date().toISOString(),
        duration: Math.floor((Date.now() - startTime) / 1000),
        completionRate: 0,
      });
      saveDb(db);
      return { success: false, completionRate: 0, errors };
    }

    // Save fresh storage state
    const newStorageState = await browser.saveStorageState();
    saveOperatorStoreSession(db, operatorId, storeId, newStorageState, 'active');
    db.update(schema.stores)
      .set({ storageState: newStorageState, status: 'active', updatedAt: new Date().toISOString() })
      .where(eq(schema.stores.id, storeId))
      .run();
    await ensureNoSecurityChallenge('login');

    // ======== PHASE 2: DATA COLLECTION ========
    log(`[${storeName}] Starting data collection...`);
    await browser.pauseBeforeFirstReadPage();

    // Step 1: Store health metrics
    const healthMetrics = shouldSkipModule(db, 'pilot_mall', storeName)
      ? {}
      : await collectStoreMetrics(browser, storeId);
    await ensureNoSecurityChallenge('store health collection');
    if (Object.keys(healthMetrics).length > 0) {
      completedSteps++;
      log(`[${storeName}] Store health collected`);
    }

    // Step 2: Consumer experience
    await browser.pauseBetweenReadModules();
    const expMetrics = shouldSkipModule(db, 'experience', storeName)
      ? {}
      : await collectExperienceMetrics(browser, storeId);
    await ensureNoSecurityChallenge('consumer experience collection');
    if (Object.keys(expMetrics).length > 0) {
      completedSteps++;
      log(`[${storeName}] Consumer experience collected`);
    }

    // Step 3: Refund data
    await browser.pauseBetweenReadModules();
    const refundMetrics = shouldSkipModule(db, 'refunds', storeName)
      ? {}
      : await collectRefundMetrics(browser, storeId);
    await ensureNoSecurityChallenge('refund collection');
    if (Object.keys(refundMetrics).length > 0) {
      completedSteps++;
      log(`[${storeName}] Refund data collected`);
    }

    // Step 4: Appeal data (optional legacy metric)
    await browser.pauseBetweenReadModules();
    const appealMetrics = resolvedConfig.enableAppealMetrics
      ? await collectAppealMetrics(browser, storeId)
      : {};
    await ensureNoSecurityChallenge('appeal collection');
    if (resolvedConfig.enableAppealMetrics) {
      completedSteps++;
      log(`[${storeName}] Appeal data collected`);
    } else {
      log(`[${storeName}] Appeal data skipped`);
    }

    // Step 5: Comment data
    await browser.pauseBetweenReadModules();
    const commentMetrics = shouldSkipModule(db, 'comment', storeName)
      ? {}
      : await collectCommentMetrics(browser, storeId);
    await ensureNoSecurityChallenge('comment collection');
    if (Object.keys(commentMetrics).length > 0) {
      completedSteps++;
      log(`[${storeName}] Comment data collected`);
    }

    // Step 6: Customer service data
    await browser.pauseBetweenReadModules();
    const customerMetrics = shouldSkipModule(db, 'customer', storeName)
      ? {}
      : await collectCustomerMetrics(browser, storeId);
    await ensureNoSecurityChallenge('customer service collection');
    if (Object.keys(customerMetrics).length > 0) {
      completedSteps++;
      log(`[${storeName}] Customer service data collected`);
    }

    // ======== PHASE 2.5: REVIEW ACTIONS ========
    let reviewResult: ReviewActionResult = { details: [], replied: 0, reported: 0, skipped: 0, failed: 0 };
    let interactionResult: InteractionActionResult = { details: [], hidden: 0, ignored: 0, skipped: 0 };

    // Step 5: Reply to good reviews
    const reviewSelectorsDegraded = shouldSkipModule(db, 'reviews', storeName);
    if (resolvedConfig.enableReply && !reviewSelectorsDegraded) {
      try {
        await browser.pauseBetweenReadModules();
        reviewResult = await replyToGoodReviews(browser, storeId, DEFAULT_REPLY_TEMPLATE, actionSafety);
        await ensureNoSecurityChallenge('good review reply scan');
        log(`[${storeName}] Reviews: ${reviewResult.replied} replied, ${reviewResult.skipped} skipped`);
      } catch (err) {
        if (isSecurityChallengeError(err)) throw err;
        errors.push(`Reply failed: ${err}`);
      }
    }
    if (!reviewSelectorsDegraded) completedSteps++;

    // Step 6: Report bad reviews
    if ((resolvedConfig.enableReport || actionSafety.approvalRequired.report) && !reviewSelectorsDegraded) {
      try {
        // AI 介入点 1&2: 尝试用 AI 匹配话术
        var reportTemplateFn: (review: { content: string; stars: number }) => string | Promise<string> = ruleBasedReportTemplate;
        if (resolvedConfig.useAI) {
          try {
            var aiProvider = getLightProvider(store.aiConfig);
            reportTemplateFn = createReportTemplateResolver(aiProvider, ruleBasedReportTemplate);
          } catch { /* AI not available, use rules */ }
        }
        await browser.pauseBetweenReadModules();
        const reportResult = await reportBadReviews(browser, storeId, reportTemplateFn, actionSafety);
        await ensureNoSecurityChallenge('bad review report scan');
        reviewResult.reported = reportResult.reported;
        reviewResult.skipped += reportResult.skipped;
        reviewResult.failed += reportResult.failed;
        reviewResult.details.push(...reportResult.details);
        log(`[${storeName}] Reports: ${reportResult.reported} reported, ${reportResult.skipped} skipped`);
      } catch (err) {
        if (isSecurityChallengeError(err)) throw err;
        errors.push(`Report failed: ${err}`);
      }
    }
    if (!reviewSelectorsDegraded) completedSteps++;

    // Step 7: Handle bad interactions (介入点 3)
    var interactionJudgeFn: (content: string) => { shouldHide: boolean; reason: string } | Promise<{ shouldHide: boolean; reason: string }> = ruleBasedInteractionJudge;
    if (resolvedConfig.useAI) {
      try {
        var aiHeavy = getHeavyProvider(store.aiConfig);
        interactionJudgeFn = createInteractionJudge(aiHeavy, ruleBasedInteractionJudge);
      } catch { /* AI not available, use rules */ }
    }
    const interactionSelectorsDegraded = shouldSkipModule(db, 'interactions', storeName);
    if ((resolvedConfig.enableHideInteractions || actionSafety.approvalRequired.hide) && !interactionSelectorsDegraded) {
      try {
        await browser.pauseBetweenReadModules();
        interactionResult = await handleInteractions(browser, storeId, interactionJudgeFn, actionSafety);
        await ensureNoSecurityChallenge('interaction scan');
        log(`[${storeName}] Interactions: ${interactionResult.hidden} hidden, ${interactionResult.ignored} ignored`);
      } catch (err) {
        if (isSecurityChallengeError(err)) throw err;
        errors.push(`Interactions failed: ${err}`);
      }
    }
    if (!interactionSelectorsDegraded) completedSteps++;

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
      pilotUnmetItems: null,
      commentScoreRank: null,
      commentScoreRankChange: null,
      commentCount: null,
      commentCountChange: null,
      customerThreeMinuteReplyRate: null,
      customerAvgResponseMinutes: null,
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
      ...healthMetrics,
      ...expMetrics,
      ...refundMetrics,
      ...appealMetrics,
      ...commentMetrics,
      ...customerMetrics,
    };

    // Calculate change rates from previous inspection
    const prevMetrics = db
      .select().from(schema.storeMetrics)
      .where(eq(schema.storeMetrics.storeId, storeId))
      .orderBy(desc(schema.storeMetrics.date))
      .limit(2).all()
      .filter((m) => m.date !== date)
      .slice(0, 1);

    if (prevMetrics.length > 0) {
      var pm = prevMetrics[0];
      if (mergedMetrics.ratingChange == null && mergedMetrics.rating != null && pm.rating != null) {
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

        const currentNums: Record<string, unknown> = {
          rating: mergedMetrics.rating,
          defectRate: mergedMetrics.defectRate,
          expBasic: mergedMetrics.expBasic,
          refundRate: mergedMetrics.refundRate,
          pilotUnmetItems: mergedMetrics.pilotUnmetItems,
        };

        const historyNums = historicalMetrics.map((m) => ({
          rating: m.rating,
          defectRate: m.defectRate,
          expBasic: m.expBasic,
          refundRate: m.refundRate,
          pilotUnmetItems: m.pilotUnmetItems,
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
    const existingReviewActions = listExistingReviewActionKeys(db);
    for (const detail of reviewResult.details) {
      if (!shouldInsertReviewActionDetail(existingReviewActions, storeId, detail)) continue;
      db.insert(schema.reviewActions)
        .values({
          storeId,
          inspectionId: record?.id || null,
          reviewId: detail.reviewId,
          reviewContent: detail.reviewContent,
          reviewStars: detail.reviewStars,
          reviewCreatedAt: detail.reviewCreatedAt || null,
          actionType: detail.actionType,
          actionContent: detail.actionContent,
          status: detail.status,
          actionMode: detail.actionMode || actionSafety.mode,
          screenshotPath: detail.screenshotPath || null,
          errorMessage: detail.errorMessage || null,
          submittedAt: detail.submittedAt || null,
          executedAt: detail.executedAt || null,
          approvedAt: detail.approvedAt || null,
          operatorId: detail.operatorId || operatorId || null,
        })
        .run();
      existingReviewActions.push({
        storeId,
        reviewId: detail.reviewId,
        actionType: detail.actionType,
        status: detail.status,
      });
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
          actionMode: detail.actionMode || actionSafety.mode,
          screenshotPath: detail.screenshotPath || null,
          errorMessage: detail.errorMessage || null,
          submittedAt: detail.submittedAt || null,
          executedAt: detail.executedAt || null,
          approvedAt: detail.approvedAt || null,
          operatorId: detail.operatorId || operatorId || null,
        })
        .run();
    }

    let summary: string | undefined;
    try {
      const reportData: StoreReportData = {
        storeName,
        metrics: Object.fromEntries(
          Object.entries(mergedMetrics).map(([key, value]) => [key, value == null ? null : String(value)]),
        ),
        reviewCount: reviewResult.replied,
        reportCount: reviewResult.reported,
        hideCount: interactionResult.hidden,
        anomaly: anomalyResult,
        severity: anomalyResult?.severity || 'normal',
      };
      const dailySummary = await generateDailyReport([reportData], store.aiConfig, resolvedConfig.useAI);
      summary = formatDailySummaryForInspection(dailySummary);
    } catch (err) {
      log('[ERROR]', `[${storeName}] Summary generation failed:`, err);
    }

    // ======== COMPLETE ========
    const duration = Math.floor((Date.now() - startTime) / 1000);
    completionRate = completedSteps / totalSteps;

    updateInspectionRecord({
      status: completionRate === 1 ? 'completed' : 'partial',
      endTime: new Date().toISOString(),
      duration,
      completionRate,
      ...(summary ? { summary } : {}),
    });

    saveDb(db);
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
    saveDb(db);
  } finally {
    await browser.close();
  }

  return { success: errors.length === 0, completionRate, errors };
}

type ExistingReviewActionKey = {
  storeId: number;
  reviewId: string | null;
  actionType: string;
  status: string;
};

export function shouldInsertReviewActionDetail(
  existing: ExistingReviewActionKey[],
  storeId: number,
  detail: { reviewId?: string | null; actionType: string; status: string },
): boolean {
  if (!detail.reviewId) return true;
  return !existing.some((row) =>
    row.storeId === storeId
    && row.reviewId === detail.reviewId
    && row.actionType === detail.actionType
    && isDuplicateBlockingReviewActionStatus(row.status),
  );
}

function listExistingReviewActionKeys(db: AppDb): ExistingReviewActionKey[] {
  return db.all(sql.raw(`
    SELECT store_id AS storeId, review_id AS reviewId, action_type AS actionType, status
    FROM review_actions
    WHERE review_id IS NOT NULL
      AND status IN ('pending_approval', 'approved', 'queued', 'running', 'skipped', 'success')
  `)) as ExistingReviewActionKey[];
}

function isDuplicateBlockingReviewActionStatus(status: string): boolean {
  return ['pending_approval', 'approved', 'queued', 'running', 'skipped', 'success'].includes(status);
}

function shouldSkipModule(db: Awaited<ReturnType<typeof getDb>>, moduleKey: SelectorModuleKey, storeName: string): boolean {
  if (!isModuleDegraded(db, moduleKey)) return false;
  log(`[${storeName}] Selector health degraded, skipping module: ${moduleKey}`);
  return true;
}

function getDailyActionUsage(db: Awaited<ReturnType<typeof getDb>>, storeId: number, date: string) {
  const dayPattern = `${date}%`;
  const reply = countActionRows(db, 'review_actions', storeId, dayPattern, "action_type = 'reply'");
  const report = countActionRows(db, 'review_actions', storeId, dayPattern, "action_type = 'report'");
  const hide = countActionRows(db, 'interaction_actions', storeId, dayPattern, "action = 'hide'");
  return { reply, report, hide };
}

function countActionRows(
  db: Awaited<ReturnType<typeof getDb>>,
  table: 'review_actions' | 'interaction_actions',
  storeId: number,
  dayPattern: string,
  actionWhere: string,
): number {
  const row = db.get(sql.raw(`
    SELECT COUNT(*) AS count
    FROM ${table}
    WHERE store_id = ${storeId}
      AND ${actionWhere}
      AND status = 'success'
      AND submitted_at LIKE '${dayPattern.replace(/'/g, "''")}'
  `)) as { count?: number } | undefined;
  return Number(row?.count || 0);
}

function resolveSecurityChallengeWaitMs(): number {
  const value = Number(process.env.WORKER_SECURITY_CHALLENGE_WAIT_MS);
  return Number.isFinite(value) && value >= 0 ? value : 180000;
}

function isSecurityChallengeError(err: unknown): boolean {
  return err instanceof Error && err.message.includes('Security challenge detected');
}
