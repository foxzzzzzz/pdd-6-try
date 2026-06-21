import { FastifyInstance } from 'fastify';
import { getBrowserEnvironmentStatus, getDb, saveDb, schema } from '@pdd-inspector/core';
import { eq } from 'drizzle-orm';
import { sanitizeStore } from '../store-response';
import { addLoginBindJob } from '../queue';

export async function storeRoutes(app: FastifyInstance) {
  // List all stores
  app.get('/api/stores', async () => {
    const db = await getDb();
    return db.select().from(schema.stores).all().map(sanitizeStore);
  });

  // Get single store
  app.get<{ Params: { id: string } }>('/api/stores/:id', async (req) => {
    const db = await getDb();
    const store = db
      .select()
      .from(schema.stores)
      .where(eq(schema.stores.id, parseInt(req.params.id)))
      .get();
    if (!store) {
      throw { statusCode: 404, message: 'Store not found' };
    }
    return sanitizeStore(store);
  });

  // Create store
  app.post<{
    Body: {
      name: string;
      pddStoreId: string;
      owner?: string;
      factory?: string;
    };
  }>('/api/stores', async (req) => {
    const db = await getDb();
    const result = db
      .insert(schema.stores)
      .values({
        name: req.body.name,
        pddStoreId: req.body.pddStoreId,
        owner: req.body.owner || null,
        factory: req.body.factory || null,
        status: 'pending_login',
      })
      .returning()
      .get();
    saveDb(db);
    return sanitizeStore(result);
  });

  // Update store
  app.put<{
    Params: { id: string };
    Body: {
      name?: string;
      owner?: string;
      factory?: string;
      status?: string;
      cookie?: string;
      storageState?: string;
    };
  }>('/api/stores/:id', async (req) => {
    const db = await getDb();
    const result = db
      .update(schema.stores)
      .set({ ...req.body, updatedAt: new Date().toISOString() })
      .where(eq(schema.stores.id, parseInt(req.params.id)))
      .returning()
      .get();
    saveDb(db);
    return sanitizeStore(result);
  });

  app.post<{
    Params: { id: string };
    Body: { operatorId?: string };
  }>('/api/stores/:id/login-bind', async (req) => {
    const browserStatus = getBrowserEnvironmentStatus();
    if (!browserStatus.ok) {
      throw { statusCode: 503, message: browserStatus.message };
    }

    const db = await getDb();
    const store = db
      .select()
      .from(schema.stores)
      .where(eq(schema.stores.id, parseInt(req.params.id)))
      .get();
    if (!store) {
      throw { statusCode: 404, message: 'Store not found' };
    }

    const operatorId = resolveOperatorId(req.body?.operatorId, store.owner);
    if (!operatorId) {
      throw { statusCode: 400, message: '请先填写运营 ID，再进行登录绑定' };
    }

    const job = await addLoginBindJob(store.id, store.name, operatorId);
    db.update(schema.stores)
      .set({ status: 'pending_login', updatedAt: new Date().toISOString() })
      .where(eq(schema.stores.id, store.id))
      .run();
    saveDb(db);

    return {
      ok: true,
      storeId: store.id,
      operatorId,
      jobId: job.id,
      message: '已触发登录绑定，请在打开的浏览器中完成登录',
    };
  });

  // Delete store
  app.delete<{ Params: { id: string } }>('/api/stores/:id', async (req) => {
    const db = await getDb();
    db.delete(schema.stores)
      .where(eq(schema.stores.id, parseInt(req.params.id)))
      .run();
    saveDb(db);
    return { success: true };
  });
}

function resolveOperatorId(input?: string | null, storeOwner?: string | null): string | null {
  return input?.trim() || storeOwner?.trim() || process.env.DEFAULT_OPERATOR_ID?.trim() || null;
}
