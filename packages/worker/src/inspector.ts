import { BrowserManager } from './browser';
import { getDb, saveDb, schema, MetricsSnapshot } from '@pdd-inspector/core';
import { eq, and } from 'drizzle-orm';
import { collectStoreMetrics } from './collectors/metrics';
import { collectExperienceMetrics } from './collectors/experience';
import { collectRefundMetrics } from './collectors/refunds';
import { collectAppealMetrics } from './collectors/appeals';
import { replyToGoodReviews, reportBadReviews } from './actions/reviews';
import { handleInteractions } from './actions/interactions';

export interface InspectionConfig {
  headless: boolean;
  screenshotOnError: boolean;
  enableReply: boolean;
  enableReport: boolean;
  enableHideInteractions: boolean;
}

const DEFAULT_CONFIG: InspectionConfig = {
  headless: true,
  screenshotOnError: true,
  enableReply: true,
  enableReport: true,
  enableHideInteractions: true,
};

/** 默认好评回复模板 */
const DEFAULT_REPLY_TEMPLATE = '感谢亲的支持和喜爱！我们会继续努力提供优质的商品和服务，祝亲购物愉快！';

/** 简单的负面关键词判断（AI Phase 3 会替换为语义判断） */
function defaultInteractionJudge(content: string): { shouldHide: boolean; reason: string } {
  const negativeWords = ['差', '烂', '垃圾', '骗', '假', '投诉', '退款', '退货', '不好', '太差', '失望'];
  const found = negativeWords.filter((w) => content.includes(w));
  return {
    shouldHide: found.length > 0,
    reason: found.length > 0 ? `包含负面词: ${found.join(', ')}` : '正常',
  };
}

/** 默认举报话术匹配（AI Phase 3 会替换） */
function defaultReportTemplate(review: { content: string; stars: number }): string {
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
  config: InspectionConfig = DEFAULT_CONFIG,
): Promise<{ success: boolean; completionRate: number; errors: string[] }> {
  const db = await getDb();
  const errors: string[] = [];
  const totalSteps = 7; // 4 data + 3 actions (reply, report, hide)
  let completedSteps = 0;

  // Update inspection record: running
  db.update(schema.inspectionRecords)
    .set({ status: 'running', startTime: new Date().toISOString() })
    .where(eq(schema.inspectionRecords.storeId, storeId))
    .run();

  const browser = new BrowserManager();
  const startTime = Date.now();

  try {
    // ======== PHASE 1: LOGIN ========
    const store = db.select().from(schema.stores).where(eq(schema.stores.id, storeId)).get();
    if (!store) {
      throw new Error(`Store ${storeId} not found`);
    }

    await browser.init(config.headless);
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
    console.log(`[${storeName}] Starting data collection...`);

    // Step 1: Store health metrics
    const healthMetrics = await collectStoreMetrics(browser, storeId);
    completedSteps++;
    console.log(`[${storeName}] Store health collected`);

    // Step 2: Consumer experience
    const expMetrics = await collectExperienceMetrics(browser, storeId);
    completedSteps++;
    console.log(`[${storeName}] Consumer experience collected`);

    // Step 3: Refund data
    const refundMetrics = await collectRefundMetrics(browser, storeId);
    completedSteps++;
    console.log(`[${storeName}] Refund data collected`);

    // Step 4: Appeal data
    const appealMetrics = await collectAppealMetrics(browser, storeId);
    completedSteps++;
    console.log(`[${storeName}] Appeal data collected`);

    // ======== PHASE 2.5: REVIEW ACTIONS ========
    let reviewResult = { details: [], replied: 0, reported: 0, skipped: 0, failed: 0 };
    let interactionResult = { details: [], hidden: 0, ignored: 0, skipped: 0 };

    // Step 5: Reply to good reviews
    if (config.enableReply) {
      try {
        reviewResult = await replyToGoodReviews(browser, storeId, DEFAULT_REPLY_TEMPLATE);
        console.log(`[${storeName}] Reviews: ${reviewResult.replied} replied, ${reviewResult.skipped} skipped`);
      } catch (err) {
        errors.push(`Reply failed: ${err}`);
      }
    }
    completedSteps++;

    // Step 6: Report bad reviews
    if (config.enableReport) {
      try {
        const reportResult = await reportBadReviews(browser, storeId, defaultReportTemplate);
        reviewResult.reported = reportResult.reported;
        reviewResult.skipped += reportResult.skipped;
        reviewResult.failed += reportResult.failed;
        reviewResult.details.push(...reportResult.details);
        console.log(`[${storeName}] Reports: ${reportResult.reported} reported, ${reportResult.skipped} skipped`);
      } catch (err) {
        errors.push(`Report failed: ${err}`);
      }
    }
    completedSteps++;

    // Step 7: Handle bad interactions
    if (config.enableHideInteractions) {
      try {
        interactionResult = await handleInteractions(browser, storeId, defaultInteractionJudge);
        console.log(`[${storeName}] Interactions: ${interactionResult.hidden} hidden, ${interactionResult.ignored} ignored`);
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

    // Get inspection record ID
    const record = db
      .select()
      .from(schema.inspectionRecords)
      .where(eq(schema.inspectionRecords.storeId, storeId))
      .orderBy(eq(schema.inspectionRecords.date, date))
      .get();

    // Save metrics
    db.insert(schema.storeMetrics)
      .values({
        ...mergedMetrics,
        inspectionId: record?.id || null,
        severity: 'normal',
      })
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

    db.update(schema.inspectionRecords)
      .set({
        status: completionRate === 1 ? 'completed' : 'partial',
        endTime: new Date().toISOString(),
        duration,
        completionRate,
      })
      .where(eq(schema.inspectionRecords.storeId, storeId))
      .run();

    saveDb();
    console.log(`[${storeName}] Inspection complete: ${completionRate * 100}% in ${duration}s`);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    errors.push(errMsg);
    console.error(`[${storeName}] Inspection error:`, errMsg);

    if (config.screenshotOnError) {
      try {
        await browser.takeScreenshot(storeId, 'error');
      } catch { /* ignore screenshot errors */ }
    }

    // Mark as failed
    db.update(schema.inspectionRecords)
      .set({
        status: 'failed',
        endTime: new Date().toISOString(),
        duration: Math.floor((Date.now() - startTime) / 1000),
        completionRate: completedSteps / totalSteps,
      })
      .where(eq(schema.inspectionRecords.storeId, storeId))
      .run();
    saveDb();
  } finally {
    await browser.close();
  }

  return { success: errors.length === 0, completionRate, errors };
}
