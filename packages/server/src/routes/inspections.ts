import { FastifyInstance } from 'fastify';
import { getDb, schema } from '@pdd-inspector/core';
import { eq, desc, and } from 'drizzle-orm';
import { addInspectionJob, getInspectionQueue } from '../queue';

export async function inspectionRoutes(app: FastifyInstance) {
  // Trigger inspection for a store
  app.post<{ Params: { id: string } }>('/api/stores/:id/inspect', async (req) => {
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

    const date = new Date().toISOString().split('T')[0];

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
    const job = await addInspectionJob(store.id, store.name, date);

    return {
      inspectionId: record.id,
      jobId: job.id,
      storeId: store.id,
      status: 'pending',
      message: `Inspection queued for ${store.name}`,
    };
  });

  // Trigger inspection for ALL active stores
  app.post('/api/inspect-all', async () => {
    const db = await getDb();
    const activeStores = db
      .select()
      .from(schema.stores)
      .where(eq(schema.stores.status, 'active'))
      .all();

    if (activeStores.length === 0) {
      throw { statusCode: 400, message: 'No active stores found' };
    }

    const date = new Date().toISOString().split('T')[0];
    const results = [];

    for (const store of activeStores) {
      const record = db
        .insert(schema.inspectionRecords)
        .values({
          storeId: store.id,
          date,
          status: 'pending',
        })
        .returning()
        .get();

      const job = await addInspectionJob(store.id, store.name, date);

      results.push({
        storeId: store.id,
        storeName: store.name,
        inspectionId: record.id,
        jobId: job.id,
      });
    }

    return {
      totalStores: activeStores.length,
      date,
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

      return query
        .orderBy(desc(schema.inspectionRecords.createdAt))
        .limit(req.query.limit ? parseInt(req.query.limit) : 50)
        .all();
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
