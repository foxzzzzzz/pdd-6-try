import { FastifyInstance } from 'fastify';
import { getDb } from '@pdd-inspector/core';
import { sql } from 'drizzle-orm';

type SelectorHealthRow = {
  id: number;
  moduleKey: string;
  moduleName: string;
  status: string;
  failureRate: number;
  totalChecks: number;
  failedChecks: number;
  screenshotPath: string | null;
  htmlPath: string | null;
  details: string | null;
  createdAt: string | null;
};

export async function selectorHealthRoutes(app: FastifyInstance) {
  app.get('/api/selector-health/status', async () => {
    const db = await getDb();
    ensureSelectorHealthTable(db);
    const rows = listLatestHealthByModule(db);
    const degraded = rows.filter((row) => row.status === 'degraded');
    return {
      degradedCount: degraded.length,
      degradedModules: degraded.map((row) => row.moduleKey),
      modules: rows.map((row) => ({
        ...row,
        details: parseDetails(row.details),
      })),
    };
  });
}

function listLatestHealthByModule(db: any): SelectorHealthRow[] {
  return db.all(sql.raw(`
    SELECT
      seh.id,
      seh.module_key AS moduleKey,
      seh.module_name AS moduleName,
      seh.status,
      seh.failure_rate AS failureRate,
      seh.total_checks AS totalChecks,
      seh.failed_checks AS failedChecks,
      seh.screenshot_path AS screenshotPath,
      seh.html_path AS htmlPath,
      seh.details,
      seh.created_at AS createdAt
    FROM selector_health_events seh
    INNER JOIN (
      SELECT module_key, MAX(id) AS id
      FROM selector_health_events
      GROUP BY module_key
    ) latest ON latest.id = seh.id
    ORDER BY seh.created_at DESC, seh.id DESC
  `));
}

function ensureSelectorHealthTable(db: any): void {
  db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS selector_health_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      module_key TEXT NOT NULL,
      module_name TEXT NOT NULL,
      status TEXT NOT NULL,
      failure_rate REAL NOT NULL,
      total_checks INTEGER NOT NULL,
      failed_checks INTEGER NOT NULL,
      screenshot_path TEXT,
      html_path TEXT,
      details TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `));
}

function parseDetails(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
