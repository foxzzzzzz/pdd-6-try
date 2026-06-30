import { FastifyInstance } from 'fastify';
import { createInspectionStaggerPlan, getBrowserEnvironmentStatus, getDb, saveDb, schema, todayShanghaiDate } from '@pdd-inspector/core';
import { eq, desc, and } from 'drizzle-orm';
import { addInspectionJob, getInspectionQueue } from '../queue';
import { mergeInspectionMetrics } from '../inspection-summary';

export async function inspectionRoutes(app: FastifyInstance) {
  // Trigger inspection for a store
  app.post<{ Params: { id: string }; Body: { operatorId?: string } }>('/api/stores/:id/inspect', async (req) => {
    ensureBrowserReady();
    const db = await getDb();
    const store = db
      .select()
      .from(schema.stores)
      .where(eq(schema.stores.id, parseInt(req.params.id)))
      .get();

    if (!store) {
      throw { statusCode: 404, message: 'Store not found' };
    }

    if (store.status !== 'active') {
      throw { statusCode: 400, message: `Store is not active (status: ${store.status})` };
    }

    const date = todayShanghaiDate();

    // Create inspection record
    const record = db
      .insert(schema.inspectionRecords)
      .values({
        storeId: store.id,
        date,
        status: 'pending',
      })
      .returning()
      .get();

    // Add to queue
    const operatorId = resolveInspectionOperatorId(req.body?.operatorId, store.owner);
    const job = await addInspectionJob(store.id, store.name, date, record.id, operatorId);
    saveDb(db);

    return {
      inspectionId: record.id,
      jobId: job.id,
      storeId: store.id,
      operatorId,
      status: 'pending',
      message: `Inspection queued for ${store.name}`,
    };
  });

  // Trigger inspection for ALL active stores
  app.post<{ Body: { operatorId?: string } }>('/api/inspect-all', async (req) => {
    ensureBrowserReady();
    const db = await getDb();
    const activeStores = db
      .select()
      .from(schema.stores)
      .where(eq(schema.stores.status, 'active'))
      .all();

    if (activeStores.length === 0) {
      throw { statusCode: 400, message: 'No active stores found' };
    }

    const date = todayShanghaiDate();
    const results = [];
    const staggerPlan = createInspectionStaggerPlan(activeStores.length, getInspectionStaggerConfig());

    for (const [index, store] of activeStores.entries()) {
      const record = db
        .insert(schema.inspectionRecords)
        .values({
          storeId: store.id,
          date,
          status: 'pending',
        })
        .returning()
        .get();

      const operatorId = resolveInspectionOperatorId(req.body?.operatorId, store.owner);
      const delayMs = staggerPlan.delaysMs[index] || 0;
      const job = await addInspectionJob(store.id, store.name, date, record.id, operatorId, delayMs);

      results.push({
        storeId: store.id,
        storeName: store.name,
        operatorId,
        inspectionId: record.id,
        jobId: job.id,
        delayMs,
      });
    }
    saveDb(db);

    return {
      totalStores: activeStores.length,
      date,
      pacing: {
        intervalMs: staggerPlan.intervalMs,
        estimatedStoreDurationMs: staggerPlan.estimatedStoreDurationMs,
        estimatedTotalMs: staggerPlan.estimatedTotalMs,
        targetWindowMs: staggerPlan.targetWindowMs,
        expectedFinishBeforeTarget: staggerPlan.expectedFinishBeforeTarget,
      },
      inspections: results,
    };
  });

  // Get inspection records
  app.get<{ Querystring: { storeId?: string; date?: string; limit?: string } }>(
    '/api/inspections',
    async (req) => {
      const db = await getDb();
      let query = db.select().from(schema.inspectionRecords);

      const conditions = [];
      if (req.query.storeId) {
        conditions.push(eq(schema.inspectionRecords.storeId, parseInt(req.query.storeId)));
      }
      if (req.query.date) {
        conditions.push(eq(schema.inspectionRecords.date, req.query.date));
      }
      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as typeof query;
      }

      const inspections = query
        .orderBy(desc(schema.inspectionRecords.createdAt))
        .limit(req.query.limit ? parseInt(req.query.limit) : 50)
        .all();

      const inspectionIds = new Set(inspections.map((inspection) => inspection.id));
      const metrics = db
        .select()
        .from(schema.storeMetrics)
        .all()
        .filter((metric) => metric.inspectionId != null && inspectionIds.has(metric.inspectionId));

      return mergeInspectionMetrics(inspections, metrics);
    },
  );

  // Get single inspection with details
  app.get<{ Params: { id: string } }>('/api/inspections/:id', async (req) => {
    const db = await getDb();
    const inspection = db
      .select()
      .from(schema.inspectionRecords)
      .where(eq(schema.inspectionRecords.id, parseInt(req.params.id)))
      .get();

    if (!inspection) {
      throw { statusCode: 404, message: 'Inspection not found' };
    }

    // Get associated data
    const metrics = db
      .select()
      .from(schema.storeMetrics)
      .where(eq(schema.storeMetrics.inspectionId, inspection.id))
      .get();

    const reviewActions = db
      .select()
      .from(schema.reviewActions)
      .where(eq(schema.reviewActions.inspectionId, inspection.id))
      .all();

    const interactionActions = db
      .select()
      .from(schema.interactionActions)
      .where(eq(schema.interactionActions.inspectionId, inspection.id))
      .all();

    const issues = db
      .select()
      .from(schema.issues)
      .where(eq(schema.issues.inspectionId, inspection.id))
      .all();

    return {
      ...inspection,
      metrics,
      reviewActions,
      interactionActions,
      issues,
    };
  });

  // Get queue status
  app.get('/api/queue/status', async () => {
    const queue = getInspectionQueue();
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
    ]);

    return { waiting, active, completed, failed, delayed };
  });
}

function resolveInspectionOperatorId(input?: string | null, storeOwner?: string | null): string {
  return input?.trim() || storeOwner?.trim() || process.env.DEFAULT_OPERATOR_ID || 'system';
}

function getInspectionStaggerConfig() {
  return {
    targetWindowMinutes: parsePositiveNumber(process.env.INSPECTION_STAGGER_TARGET_MINUTES, 90),
    minDelayMs: parsePositiveNumber(process.env.INSPECTION_STAGGER_MIN_DELAY_MS, 60_000),
    maxDelayMs: parsePositiveNumber(process.env.INSPECTION_STAGGER_MAX_DELAY_MS, 300_000),
    estimatedStoreDurationMs: parsePositiveNumber(process.env.INSPECTION_ESTIMATED_STORE_DURATION_MS, 120_000),
  };
}

function parsePositiveNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function ensureBrowserReady(): void {
  const browserStatus = getBrowserEnvironmentStatus();
  if (!browserStatus.ok) {
    throw { statusCode: 409, message: browserStatus.message };
  }
}
