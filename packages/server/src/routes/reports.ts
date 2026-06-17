/**
 * 周报/月报 API — 聚合分析
 */
import { FastifyInstance } from 'fastify';
import { getDb, schema } from '@pdd-inspector/core';
import { desc, and } from 'drizzle-orm';

export async function reportRoutes(app: FastifyInstance) {
  // 周报：最近 7 天汇总
  app.get('/api/reports/weekly', async () => {
    const db = await getDb();
    const stores = db.select().from(schema.stores).all();
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];

    const result = [];
    for (const store of stores) {
      const metrics = db
        .select()
        .from(schema.storeMetrics)
        .where(and(
          // drizzle doesn't support complex where easily, use order+limit
        ))
        .orderBy(desc(schema.storeMetrics.date))
        .all()
        .filter((m) => m.storeId === store.id && m.date >= sevenDaysAgo);

      if (metrics.length === 0) continue;

      const latest = metrics[0];
      const inspections = metrics.length;

      // Calculate trends
      const ratingTrend = calcTrend(metrics.map((m) => m.rating).filter(Boolean) as number[]);
      const defectTrend = calcTrend(metrics.map((m) => m.defectRate).filter(Boolean) as number[]);

      // Count issues
      const issues = db.select().from(schema.issues).all()
        .filter((i) => i.storeId === store.id && i.createdAt && i.createdAt >= sevenDaysAgo);

      result.push({
        storeId: store.id,
        storeName: store.name,
        inspections,
        latestRating: latest.rating,
        ratingTrend: ratingTrend > 0 ? '↑' : ratingTrend < 0 ? '↓' : '→',
        latestDefectRate: latest.defectRate ? (latest.defectRate * 100).toFixed(1) + '%' : null,
        defectTrend: defectTrend > 0 ? '↑(恶化)' : defectTrend < 0 ? '↓(改善)' : '→',
        latestExpBasic: latest.expBasic,
        issueCount: issues.length,
        resolvedIssues: issues.filter((i) => i.rectificationStatus === 'resolved' || i.rectificationStatus === 'closed').length,
        severity: latest.severity || 'normal',
      });
    }

    const summary = {
      period: `${sevenDaysAgo} ~ ${new Date().toISOString().split('T')[0]}`,
      totalStores: result.length,
      anomalyStores: result.filter((r) => r.severity !== 'normal').length,
      avgRating: result.reduce((s, r) => s + (r.latestRating || 0), 0) / (result.length || 1),
      totalIssues: result.reduce((s, r) => s + r.issueCount, 0),
    };

    return { summary, stores: result };
  });

  // 月报：最近 30 天汇总
  app.get('/api/reports/monthly', async () => {
    const db = await getDb();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
    const stores = db.select().from(schema.stores).all();
    const allMetrics = db.select().from(schema.storeMetrics).orderBy(desc(schema.storeMetrics.date)).all();

    const result = [];
    for (const store of stores) {
      const storeMetrics = allMetrics.filter((m) => m.storeId === store.id && m.date >= thirtyDaysAgo);
      if (storeMetrics.length === 0) continue;
      const weeks = splitByWeek(storeMetrics);

      result.push({
        storeId: store.id,
        storeName: store.name,
        dataPoints: storeMetrics.length,
        avgRating: avg(storeMetrics.map((m) => m.rating).filter(Boolean) as number[]),
        avgDefectRate: avg(storeMetrics.map((m) => m.defectRate).filter(Boolean) as number[]),
        weeklyTrend: weeks.map((w) => ({
          week: `${w[0]?.date || '?'} ~ ${w[w.length - 1]?.date || '?'}`,
          avgRating: avg(w.map((m) => m.rating).filter(Boolean) as number[]),
          avgDefectRate: avg(w.map((m) => m.defectRate).filter(Boolean) as number[]),
        })),
      });
    }

    return {
      period: `${thirtyDaysAgo} ~ ${new Date().toISOString().split('T')[0]}`,
      stores: result,
    };
  });
}

function calcTrend(values: number[]): number {
  if (values.length < 2) return 0;
  return values[0] - values[values.length - 1];
}

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function splitByWeek(metrics: any[]): any[][] {
  const weeks: any[][] = [];
  let current: any[] = [];
  for (const m of metrics) {
    if (current.length >= 7) { weeks.push(current); current = []; }
    current.push(m);
  }
  if (current.length > 0) weeks.push(current);
  return weeks;
}
