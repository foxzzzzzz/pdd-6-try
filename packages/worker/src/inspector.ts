import { BrowserManager } from './browser';
import { getDb, saveDb, schema, MetricsSnapshot } from '@pdd-inspector/core';
import { eq } from 'drizzle-orm';
import { collectStoreMetrics } from './collectors/metrics';
import { collectExperienceMetrics } from './collectors/experience';
import { collectRefundMetrics } from './collectors/refunds';
import { collectAppealMetrics } from './collectors/appeals';

export interface InspectionConfig {
  headless: boolean;
  screenshotOnError: boolean;
}

const DEFAULT_CONFIG: InspectionConfig = {
  headless: true,
  screenshotOnError: true,
};

export async function inspectStore(
  storeId: number,
  storeName: string,
  date: string,
  config: InspectionConfig = DEFAULT_CONFIG,
): Promise<{ success: boolean; completionRate: number; errors: string[] }> {
  const db = await getDb();
  const errors: string[] = [];
  let completionRate = 0;
  const totalSteps = 4; // 4 data collection steps in Phase 1
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
