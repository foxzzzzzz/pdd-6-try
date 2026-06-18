import { FastifyInstance } from 'fastify';
import { getDb, schema } from '@pdd-inspector/core';
import { buildDailyReport, buildMonthlyReport, buildWeeklyReport } from '../report-service';

export async function reportRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { date?: string } }>('/api/reports/daily', async (req) => {
    const dataset = await loadReportDataset();
    const date = req.query.date || todayDate();
    return buildDailyReport({ date, ...dataset });
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

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}
