/**
 * 问题管理 API — CRUD + 工厂分享链接 + Excel 导出
 */
import { FastifyInstance } from 'fastify';
import { getDb, saveDb, schema, todayShanghaiDate } from '@pdd-inspector/core';
import { eq, desc } from 'drizzle-orm';
import * as crypto from 'crypto';

export async function issueRoutes(app: FastifyInstance) {
  // ========== CRUD ==========

  // 列表（支持按店铺/工厂/状态筛选）
  app.get<{ Querystring: { storeId?: string; factory?: string; status?: string; severity?: string } }>(
    '/api/issues',
    async (req) => {
      const db = await getDb();
      let issues = db.select().from(schema.issues).orderBy(desc(schema.issues.createdAt)).all();

      if (req.query.storeId) issues = issues.filter((i) => i.storeId === Number(req.query.storeId));
      if (req.query.factory) issues = issues.filter((i) => i.factory === req.query.factory);
      if (req.query.status) issues = issues.filter((i) => i.rectificationStatus === req.query.status);
      if (req.query.severity) issues = issues.filter((i) => i.severity === req.query.severity);

      // Attach store name
      const stores = db.select().from(schema.stores).all();
      return issues.map((i) => ({
        ...i,
        storeName: stores.find((s) => s.id === i.storeId)?.name || 'Unknown',
      }));
    },
  );

  // 创建
  app.post<{ Body: { storeId: number; type: string; severity?: string; description: string; factory?: string } }>(
    '/api/issues',
    async (req) => {
      const db = await getDb();
      const shareToken = crypto.randomBytes(12).toString('hex');
      const result = db
        .insert(schema.issues)
        .values({
          storeId: req.body.storeId,
          type: req.body.type,
          severity: req.body.severity || 'medium',
          description: req.body.description,
          factory: req.body.factory || null,
          shareToken,
          rectificationStatus: 'pending',
        })
        .returning()
        .get();
      saveDb(db);
      return { ...result, shareUrl: `/factory/${shareToken}` };
    },
  );

  // 更新（运营端）
  app.put<{ Params: { id: string }; Body: { description?: string; severity?: string; rectificationStatus?: string; handler?: string } }>(
    '/api/issues/:id',
    async (req) => {
      const db = await getDb();
      const update: Record<string, unknown> = { updatedAt: new Date().toISOString() };
      if (req.body.description) update.description = req.body.description;
      if (req.body.severity) update.severity = req.body.severity;
      if (req.body.rectificationStatus) update.rectificationStatus = req.body.rectificationStatus;
      if (req.body.handler) update.handler = req.body.handler;
      const result = db.update(schema.issues).set(update).where(eq(schema.issues.id, parseInt(req.params.id))).returning().get();
      saveDb(db);
      return result;
    },
  );

  // 删除
  app.delete<{ Params: { id: string } }>('/api/issues/:id', async (req) => {
    const db = await getDb();
    db.delete(schema.issues).where(eq(schema.issues.id, parseInt(req.params.id))).run();
    saveDb(db);
    return { success: true };
  });

  // ========== 工厂协作 ==========

  // 通过 shareToken 访问问题
  app.get<{ Params: { token: string } }>('/api/factory/issues/:token', async (req) => {
    const db = await getDb();
    const issue = db.select().from(schema.issues).where(eq(schema.issues.shareToken, req.params.token)).get();
    if (!issue) throw { statusCode: 404, message: 'Issue not found or link expired' };
    const store = db.select().from(schema.stores).where(eq(schema.stores.id, issue.storeId)).get();
    return { ...issue, storeName: store?.name || 'Unknown' };
  });

  // 工厂更新整改状态
  app.put<{ Params: { token: string }; Body: { factoryFeedback?: string; rectificationStatus?: string } }>(
    '/api/factory/issues/:token',
    async (req) => {
      const db = await getDb();
      const issue = db.select().from(schema.issues).where(eq(schema.issues.shareToken, req.params.token)).get();
      if (!issue) throw { statusCode: 404, message: 'Issue not found' };

      const update: Record<string, unknown> = { updatedAt: new Date().toISOString() };
      if (req.body.factoryFeedback) update.factoryFeedback = req.body.factoryFeedback;
      if (req.body.rectificationStatus) update.rectificationStatus = req.body.rectificationStatus;

      db.update(schema.issues).set(update).where(eq(schema.issues.id, issue.id)).run();
      saveDb(db);
      return { success: true };
    },
  );

  // ========== Excel 导出 ==========

  app.get<{ Querystring: { factory?: string; storeId?: string } }>('/api/issues/export', async (req, reply) => {
    const db = await getDb();
    let issues = db.select().from(schema.issues).orderBy(desc(schema.issues.createdAt)).all();
    if (req.query.factory) issues = issues.filter((i) => i.factory === req.query.factory);
    if (req.query.storeId) issues = issues.filter((i) => i.storeId === Number(req.query.storeId));

    const stores = db.select().from(schema.stores).all();

    // Generate CSV (Excel-compatible)
    const header = '问题ID,店铺,类型,严重程度,描述,工厂,工厂反馈,整改状态,处理人,创建时间,分享链接';
    const rows = issues.map((i) => {
      const storeName = stores.find((s) => s.id === i.storeId)?.name || '';
      return [
        i.id, storeName, i.type, i.severity,
        `"${(i.description || '').replace(/"/g, '""')}"`,
        i.factory || '', (i.factoryFeedback || '').replace(/"/g, '""'),
        i.rectificationStatus, i.handler || '',
        i.createdAt, i.shareToken ? `/factory/${i.shareToken}` : '',
      ].join(',');
    });

    const csv = [header, ...rows].join('\n');
    reply.header('Content-Type', 'text/csv; charset=utf-8');
    reply.header('Content-Disposition', `attachment; filename=issues-${todayShanghaiDate()}.csv`);
    return csv;
  });
}
