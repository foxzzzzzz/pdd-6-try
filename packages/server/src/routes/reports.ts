/**
 * 周报/月报 API — 聚合分析
 */
import { FastifyInstance } from 'fastify';
import { getDb, schema } from '@pdd-inspector/core';
import { desc, and } from 'drizzle-orm';
import { buildReportSummary } from '../report-summary';

export async function reportRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { date?: string } }>('/api/reports/daily', async (req) => {
    const db = await getDb();
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const stores = db.select().from(schema.stores).all();
    const allInspections = db.select().from(schema.inspectionRecords).orderBy(desc(schema.inspectionRecords.createdAt)).all();

    const result = [];
    for (const store of stores) {
      const latest = db
        .select()
        .from(schema.storeMetrics)
        .orderBy(desc(schema.storeMetrics.createdAt))
        .all()
        .find((metric) => metric.storeId === store.id && metric.date === date);
      if (!latest) continue;

      const latestInspection = allInspections.find((inspection) => (
        inspection.storeId === store.id
        && inspection.date === date
        && inspection.summary
      ));
      const issues = db.select().from(schema.issues).all()
        .filter((issue) => issue.storeId === store.id && issue.createdAt && issue.createdAt >= date);

      result.push({
        storeId: store.id,
        storeName: store.name,
        inspections: allInspections.filter((inspection) => inspection.storeId === store.id && inspection.date === date).length,
        latestRating: latest.rating,
        latestDefectRate: latest.defectRate,
        latestExpBasic: latest.expBasic,
        latestInspectionSummary: latestInspection?.summary || null,
        issueCount: issues.length,
        severity: latest.severity || 'normal',
      });
    }

    const summary = {
      period: date,
      totalStores: result.length,
      anomalyStores: result.filter((store) => store.severity !== 'normal').length,
      totalIssues: result.reduce((sum, store) => sum + store.issueCount, 0),
      generated: buildReportSummary(date, result),
    };

    return { summary, stores: result };
  });

  // 周报：最近 7 天汇总
  app.get('/api/reports/weekly', async () => {
    const db = await getDb();
    const stores = db.select().from(schema.stores).all();
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
    const today = new Date().toISOString().split('T')[0];
    const allInspections = db.select().from(schema.inspectionRecords).orderBy(desc(schema.inspectionRecords.createdAt)).all();

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
      const latestInspection = allInspections.find((inspection) => (
        inspection.storeId === store.id
        && inspection.date >= sevenDaysAgo
        && inspection.summary
      ));

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
        latestInspectionSummary: latestInspection?.summary || null,
        issueCount: issues.length,
        resolvedIssues: issues.filter((i) => i.rectificationStatus === 'resolved' || i.rectificationStatus === 'closed').length,
        severity: latest.severity || 'normal',
      });
    }

    const period = `${sevenDaysAgo} ~ ${today}`;
    const summary = {
      period,
      totalStores: result.length,
      anomalyStores: result.filter((r) => r.severity !== 'normal').length,
      avgRating: result.reduce((s, r) => s + (r.latestRating || 0), 0) / (result.length || 1),
      totalIssues: result.reduce((s, r) => s + r.issueCount, 0),
      generated: buildReportSummary(period, result),
    };

    return { summary, stores: result };
  });

  // 月报：最近 30 天汇总
  app.get('/api/reports/monthly', async () => {
    const db = await getDb();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
    const today = new Date().toISOString().split('T')[0];
    const stores = db.select().from(schema.stores).all();
    const allMetrics = db.select().from(schema.storeMetrics).orderBy(desc(schema.storeMetrics.date)).all();
    const allInspections = db.select().from(schema.inspectionRecords).orderBy(desc(schema.inspectionRecords.createdAt)).all();

    const result = [];
    for (const store of stores) {
      const storeMetrics = allMetrics.filter((m) => m.storeId === store.id && m.date >= thirtyDaysAgo);
      if (storeMetrics.length === 0) continue;
      const weeks = splitByWeek(storeMetrics);
      const latest = storeMetrics[0];
      const latestInspection = allInspections.find((inspection) => (
        inspection.storeId === store.id
        && inspection.date >= thirtyDaysAgo
        && inspection.summary
      ));

      result.push({
        storeId: store.id,
        storeName: store.name,
        dataPoints: storeMetrics.length,
        latestRating: latest.rating,
        latestExpBasic: latest.expBasic,
        latestDefectRate: latest.defectRate,
        latestInspectionSummary: latestInspection?.summary || null,
        severity: latest.severity || 'normal',
        issueCount: db.select().from(schema.issues).all()
          .filter((i) => i.storeId === store.id && i.createdAt && i.createdAt >= thirtyDaysAgo).length,
        avgRating: avg(storeMetrics.map((m) => m.rating).filter(Boolean) as number[]),
        avgDefectRate: avg(storeMetrics.map((m) => m.defectRate).filter(Boolean) as number[]),
        weeklyTrend: weeks.map((w) => ({
          week: `${w[0]?.date || '?'} ~ ${w[w.length - 1]?.date || '?'}`,
          avgRating: avg(w.map((m) => m.rating).filter(Boolean) as number[]),
          avgDefectRate: avg(w.map((m) => m.defectRate).filter(Boolean) as number[]),
        })),
      });
    }

    const period = `${thirtyDaysAgo} ~ ${today}`;
    return {
      period,
      summary: buildReportSummary(period, result),
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
