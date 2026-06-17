import { FastifyInstance } from 'fastify';
import { getDb, saveDb, schema } from '@pdd-inspector/core';
import { eq } from 'drizzle-orm';
import { sanitizeStore } from '../store-response';

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
    saveDb();
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
    saveDb();
    return sanitizeStore(result);
  });

  // Delete store
  app.delete<{ Params: { id: string } }>('/api/stores/:id', async (req) => {
    const db = await getDb();
    db.delete(schema.stores)
      .where(eq(schema.stores.id, parseInt(req.params.id)))
      .run();
    saveDb();
    return { success: true };
  });
}
