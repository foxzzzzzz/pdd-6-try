import { FastifyInstance } from 'fastify';
import { getDb, saveDb } from '@pdd-inspector/core';
import { sql } from 'drizzle-orm';

type RiskEventRow = {
  id: number;
  storeId: number | null;
  storeName: string | null;
  scope: string;
  eventType: string;
  severity: string;
  message: string;
  actionType: string | null;
  sourceType: string | null;
  sourceId: string | null;
  screenshotPath: string | null;
  htmlPath: string | null;
  status: string;
  createdAt: string | null;
};

export async function riskRoutes(app: FastifyInstance) {
  app.get('/api/risk/status', async () => {
    const db = await getDb();
    ensureRiskEventTable(db);
    const events = listActiveEvents(db);
    const summary = summarizeRiskEvents(events);
    return {
      globalWritePaused: summary.globalWritePaused,
      globalReasons: summary.globalReasons,
      pausedStoreIds: summary.pausedStoreIds,
      activeEvents: events,
    };
  });

  app.post<{ Params: { id: string } }>('/api/risk/events/:id/resolve', async (req) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) throw { statusCode: 400, message: 'Invalid risk event id' };
    const db = await getDb();
    ensureRiskEventTable(db);
    db.run(sql.raw(`
      UPDATE risk_events
      SET status = 'resolved',
          resolved_at = ${quote(new Date().toISOString())}
      WHERE id = ${id}
    `));
    saveDb(db);
    return { ok: true, id, status: 'resolved' };
  });
}

function listActiveEvents(db: any): RiskEventRow[] {
  return db.all(sql.raw(`
    SELECT
      re.id,
      re.store_id AS storeId,
      s.name AS storeName,
      re.scope,
      re.event_type AS eventType,
      re.severity,
      re.message,
      re.action_type AS actionType,
      re.source_type AS sourceType,
      re.source_id AS sourceId,
      re.screenshot_path AS screenshotPath,
      re.html_path AS htmlPath,
      re.status,
      re.created_at AS createdAt
    FROM risk_events re
    LEFT JOIN stores s ON s.id = re.store_id
    WHERE re.status = 'active'
    ORDER BY re.created_at DESC, re.id DESC
    LIMIT 50
  `));
}

function summarizeRiskEvents(events: RiskEventRow[]) {
  const pausedStoreIds = new Set<number>();
  const globalReasons: string[] = [];
  const eventsByType = new Map<string, Set<number>>();
  const actionFailuresByStore = new Map<number, number>();

  for (const event of events) {
    if (event.scope === 'global') {
      globalReasons.push(`global:${event.eventType}`);
      continue;
    }
    if (event.storeId == null) continue;
    if (event.eventType !== 'action_failure') pausedStoreIds.add(event.storeId);
    if (event.eventType === 'action_failure') {
      actionFailuresByStore.set(event.storeId, (actionFailuresByStore.get(event.storeId) || 0) + 1);
    }
    if (!eventsByType.has(event.eventType)) eventsByType.set(event.eventType, new Set());
    eventsByType.get(event.eventType)!.add(event.storeId);
  }

  for (const [storeId, count] of actionFailuresByStore) {
    if (count >= 3) pausedStoreIds.add(storeId);
  }
  for (const [eventType, storeIds] of eventsByType) {
    if (storeIds.size >= 2 && ['security', 'rate_limit', 'permission'].includes(eventType)) {
      globalReasons.push(`multi-store:${eventType}`);
    }
  }

  return {
    globalWritePaused: globalReasons.length > 0,
    globalReasons,
    pausedStoreIds: Array.from(pausedStoreIds).sort((a, b) => a - b),
  };
}

function ensureRiskEventTable(db: any) {
  db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS risk_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER REFERENCES stores(id),
      scope TEXT NOT NULL DEFAULT 'store',
      event_type TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'warning',
      message TEXT NOT NULL,
      action_type TEXT,
      source_type TEXT,
      source_id TEXT,
      screenshot_path TEXT,
      html_path TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now')),
      resolved_at TEXT
    )
  `));
}

function quote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}
