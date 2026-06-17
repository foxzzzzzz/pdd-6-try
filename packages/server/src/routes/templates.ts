/**
 * 模板管理 API — 回复话术 & 举报话术
 * 支持全局模板(store_id=NULL) + 店铺专属模板(store_id=指定店铺)
 */
import { FastifyInstance } from 'fastify';
import { getDb, saveDb, schema } from '@pdd-inspector/core';
import { eq, isNull, and, or } from 'drizzle-orm';

export async function templateRoutes(app: FastifyInstance) {
  // ==================== 回复模板 ====================

  // 列表（支持按店铺筛选：?storeId=1 或 ?global=true）
  app.get<{ Querystring: { storeId?: string; global?: string } }>('/api/reply-templates', async (req) => {
    const db = await getDb();
    let query = db.select().from(schema.replyTemplates);

    if (req.query.global === 'true') {
      query = query.where(isNull(schema.replyTemplates.storeId)) as typeof query;
    } else if (req.query.storeId) {
      const sid = parseInt(req.query.storeId);
      query = query.where(
        or(isNull(schema.replyTemplates.storeId), eq(schema.replyTemplates.storeId, sid)),
      ) as typeof query;
    }

    return query.all();
  });

  // 创建
  app.post<{ Body: { name: string; scene?: string; content: string; variables?: string; storeId?: number } }>(
    '/api/reply-templates',
    async (req) => {
      const db = await getDb();
      const result = db
        .insert(schema.replyTemplates)
        .values({
          name: req.body.name,
          scene: req.body.scene || null,
          content: req.body.content,
          variables: req.body.variables || null,
          storeId: req.body.storeId || null,
          enabled: 1,
        })
        .returning()
        .get();
      saveDb(db);
      return result;
    },
  );

  // 更新
  app.put<{ Params: { id: string }; Body: { name?: string; scene?: string; content?: string; variables?: string; enabled?: number; storeId?: number } }>(
    '/api/reply-templates/:id',
    async (req) => {
      const db = await getDb();
      const update: Record<string, unknown> = { updatedAt: new Date().toISOString() };
      if (req.body.name !== undefined) update.name = req.body.name;
      if (req.body.scene !== undefined) update.scene = req.body.scene;
      if (req.body.content !== undefined) update.content = req.body.content;
      if (req.body.variables !== undefined) update.variables = req.body.variables;
      if (req.body.enabled !== undefined) update.enabled = req.body.enabled;
      if (req.body.storeId !== undefined) update.storeId = req.body.storeId;

      const result = db
        .update(schema.replyTemplates)
        .set(update)
        .where(eq(schema.replyTemplates.id, parseInt(req.params.id)))
        .returning()
        .get();
      saveDb(db);
      return result;
    },
  );

  // 删除
  app.delete<{ Params: { id: string } }>('/api/reply-templates/:id', async (req) => {
    const db = await getDb();
    db.delete(schema.replyTemplates).where(eq(schema.replyTemplates.id, parseInt(req.params.id))).run();
    saveDb(db);
    return { success: true };
  });

  // ==================== 举报模板 ====================

  app.get<{ Querystring: { storeId?: string; global?: string } }>('/api/report-templates', async (req) => {
    const db = await getDb();
    let query = db.select().from(schema.reportTemplates);

    if (req.query.global === 'true') {
      query = query.where(isNull(schema.reportTemplates.storeId)) as typeof query;
    } else if (req.query.storeId) {
      const sid = parseInt(req.query.storeId);
      query = query.where(
        or(isNull(schema.reportTemplates.storeId), eq(schema.reportTemplates.storeId, sid)),
      ) as typeof query;
    }

    return query.all();
  });

  app.post<{ Body: { name: string; reportType?: string; content: string; storeId?: number } }>(
    '/api/report-templates',
    async (req) => {
      const db = await getDb();
      const result = db
        .insert(schema.reportTemplates)
        .values({
          name: req.body.name,
          reportType: req.body.reportType || null,
          content: req.body.content,
          storeId: req.body.storeId || null,
          enabled: 1,
        })
        .returning()
        .get();
      saveDb(db);
      return result;
    },
  );

  app.put<{ Params: { id: string }; Body: { name?: string; reportType?: string; content?: string; enabled?: number; storeId?: number } }>(
    '/api/report-templates/:id',
    async (req) => {
      const db = await getDb();
      const update: Record<string, unknown> = { updatedAt: new Date().toISOString() };
      if (req.body.name !== undefined) update.name = req.body.name;
      if (req.body.reportType !== undefined) update.reportType = req.body.reportType;
      if (req.body.content !== undefined) update.content = req.body.content;
      if (req.body.enabled !== undefined) update.enabled = req.body.enabled;
      if (req.body.storeId !== undefined) update.storeId = req.body.storeId;

      const result = db
        .update(schema.reportTemplates)
        .set(update)
        .where(eq(schema.reportTemplates.id, parseInt(req.params.id)))
        .returning()
        .get();
      saveDb(db);
      return result;
    },
  );

  app.delete<{ Params: { id: string } }>('/api/report-templates/:id', async (req) => {
    const db = await getDb();
    db.delete(schema.reportTemplates).where(eq(schema.reportTemplates.id, parseInt(req.params.id))).run();
    saveDb(db);
    return { success: true };
  });
}
