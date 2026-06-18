import { FastifyInstance } from 'fastify';
import { eq, sql } from 'drizzle-orm';
import { getDb, saveDb, schema } from '@pdd-inspector/core';
import {
  buildDailyReport,
  buildMonthlyReport,
  buildWeeklyReport,
  canMaterializeDailyReport,
  parseMaterializedDailyReport,
  serializeDailyReport,
} from '../report-service';

export async function reportRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { date?: string } }>('/api/reports/daily', async (req) => {
    const db = await getDb();
    ensureDailyReportsTable(db);
    const dataset = await loadReportDataset();
    const date = req.query.date || todayDate();
    const generated = buildDailyReport({ date, ...dataset });
    const existing = db.select().from(schema.dailyReports).where(eq(schema.dailyReports.date, date)).get();

    if (existing) {
      if (existing.status !== 'generated' || existing.sourceHash === generated.materialized?.sourceHash) {
        return parseMaterializedDailyReport(existing);
      }

      const snapshot = serializeDailyReport(date, generated);
      db.update(schema.dailyReports)
        .set({
          summary: snapshot.summary,
          stores: snapshot.stores,
          sourceHash: snapshot.sourceHash,
          generatedAt: snapshot.generatedAt,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(schema.dailyReports.date, date))
        .run();
      saveDb(db);
      return parseMaterializedDailyReport(db.select().from(schema.dailyReports).where(eq(schema.dailyReports.date, date)).get()!);
    }

    if (!canMaterializeDailyReport({ date, ...dataset })) return generated;

    const snapshot = serializeDailyReport(date, generated);
    db.insert(schema.dailyReports).values(snapshot).run();
    saveDb(db);
    return parseMaterializedDailyReport(db.select().from(schema.dailyReports).where(eq(schema.dailyReports.date, date)).get()!);
  });

  app.get('/api/reports/weekly', async () => {
    const dataset = await loadReportDataset();
    return buildWeeklyReport({ today: todayDate(), ...dataset });
  });

  app.get('/api/reports/monthly', async () => {
    const dataset = await loadReportDataset();
    return buildMonthlyReport({ today: todayDate(), ...dataset });
  });
}

async function loadReportDataset() {
  const db = await getDb();
  const [stores, inspections, metrics, issues] = [
    db.select().from(schema.stores).all(),
    db.select().from(schema.inspectionRecords).all(),
    db.select().from(schema.storeMetrics).all(),
    db.select().from(schema.issues).all(),
  ];

  return { stores, inspections, metrics, issues };
}

function ensureDailyReportsTable(db: Awaited<ReturnType<typeof getDb>>) {
  db.run(sql`
    CREATE TABLE IF NOT EXISTS daily_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'generated',
      summary TEXT NOT NULL,
      stores TEXT NOT NULL,
      source_hash TEXT,
      generated_at TEXT NOT NULL,
      reviewed_at TEXT,
      published_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}
