import { sql } from 'drizzle-orm';
import { quoteSqlString, saveDb, type AppDb } from '@pdd-inspector/core';
import { BrowserManager } from './browser';
import { decideStoreStatusForRiskSignal, detectRiskControlSignal, RiskControlKind } from './action-risk-control';
import { markOperatorStoreSessionStatus, normalizeOperatorId } from './operator-session';

export type RiskEventType = RiskControlKind | 'action_failure';
export type RiskEventSeverity = 'warning' | 'critical';

export interface RiskEventLike {
  storeId: number | null;
  operatorId?: string | null;
  eventType: string;
  status: string;
}

export interface RiskSummary {
  activeEvents: RiskEventLike[];
  globalWritePaused: boolean;
  globalReasons: string[];
  pausedStoreIds: number[];
}

export interface RiskSentinelEventInput {
  storeId: number | null;
  eventType: RiskEventType;
  message: string;
  operatorId?: string | null;
  actionType?: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
  browser?: BrowserManager | null;
}

export function summarizeRiskEvents(events: RiskEventLike[]): RiskSummary {
  const active = events.filter((event) => event.status === 'active');
  const pausedStoreIds = new Set<number>();
  const globalReasons: string[] = [];
  const eventsByType = new Map<string, Set<number>>();
  const actionFailuresByStore = new Map<number, number>();

  for (const event of active) {
    if (event.storeId != null) {
      if (event.eventType !== 'action_failure' && !event.operatorId) pausedStoreIds.add(event.storeId);
      if (event.eventType === 'action_failure') {
        actionFailuresByStore.set(event.storeId, (actionFailuresByStore.get(event.storeId) || 0) + 1);
      }
      if (!event.operatorId) {
        if (!eventsByType.has(event.eventType)) eventsByType.set(event.eventType, new Set());
        eventsByType.get(event.eventType)!.add(event.storeId);
      }
    }
    if (event.storeId == null && event.eventType !== 'action_failure') {
      globalReasons.push(`global:${event.eventType}`);
    }
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
    activeEvents: active,
    globalWritePaused: globalReasons.length > 0,
    globalReasons,
    pausedStoreIds: Array.from(pausedStoreIds).sort((a, b) => a - b),
  };
}

export function resolveRiskEventType(message: string): RiskEventType | null {
  return detectRiskControlSignal(message)?.kind || null;
}

export function isGlobalWritePaused(db: AppDb): boolean {
  ensureRiskEventTable(db);
  const events = db.all(sql.raw(`
    SELECT store_id AS storeId, event_type AS eventType, status
    , operator_id AS operatorId
    FROM risk_events
    WHERE status = 'active'
  `)) as RiskEventLike[];
  return summarizeRiskEvents(events).globalWritePaused;
}

export async function recordRiskEvent(db: AppDb, input: RiskSentinelEventInput): Promise<void> {
  ensureRiskEventTable(db);
  const severity: RiskEventSeverity = input.eventType === 'login' || input.eventType === 'action_failure' ? 'warning' : 'critical';
  const timestamp = new Date().toISOString();
  const operatorId = normalizeOperatorId(input.operatorId);
  const screenshotPath = input.browser ? await input.browser.takeScreenshot(input.storeId || 0, `risk-${input.eventType}`).catch(() => null) : null;
  const htmlPath = input.browser ? await input.browser.savePageHtml(input.storeId || 0, `risk-${input.eventType}`).catch(() => null) : null;

  db.run(sql.raw(`
    INSERT INTO risk_events (
      store_id, operator_id, scope, event_type, severity, message, action_type, source_type,
      source_id, screenshot_path, html_path, status, created_at
    ) VALUES (
      ${input.storeId == null ? 'NULL' : input.storeId},
      ${operatorId ? quoteSqlString(operatorId) : 'NULL'},
      ${quoteSqlString(input.storeId == null ? 'global' : 'store')},
      ${quoteSqlString(input.eventType)},
      ${quoteSqlString(severity)},
      ${quoteSqlString(input.message)},
      ${input.actionType ? quoteSqlString(input.actionType) : 'NULL'},
      ${input.sourceType ? quoteSqlString(input.sourceType) : 'NULL'},
      ${input.sourceId ? quoteSqlString(input.sourceId) : 'NULL'},
      ${screenshotPath ? quoteSqlString(screenshotPath) : 'NULL'},
      ${htmlPath ? quoteSqlString(htmlPath) : 'NULL'},
      'active',
      ${quoteSqlString(timestamp)}
    )
  `));

  if (input.storeId != null && operatorId && input.eventType !== 'action_failure') {
    markOperatorStoreSessionStatus(db, operatorId, input.storeId, input.eventType === 'login' ? 'pending_login' : 'paused');
  } else if (input.storeId != null && input.eventType !== 'action_failure') {
    const storeStatus = decideStoreStatusForRiskSignal(input.eventType);
    db.run(sql.raw(`
      UPDATE stores
      SET status = ${quoteSqlString(storeStatus)},
          updated_at = ${quoteSqlString(timestamp)}
      WHERE id = ${input.storeId}
    `));
  }

  const summary = summarizeRiskEvents(db.all(sql.raw(`
    SELECT store_id AS storeId, operator_id AS operatorId, event_type AS eventType, status
    FROM risk_events
    WHERE status = 'active'
  `)) as RiskEventLike[]);
  for (const storeId of summary.pausedStoreIds) {
    db.run(sql.raw(`
      UPDATE stores
      SET status = 'paused',
          updated_at = ${quoteSqlString(timestamp)}
      WHERE id = ${storeId}
    `));
  }
  if (summary.globalWritePaused && !hasActiveGlobalWritePause(db)) {
    db.run(sql.raw(`
      INSERT INTO risk_events (
        store_id, scope, event_type, severity, message, status, created_at
      ) VALUES (
        NULL,
        'global',
        'security',
        'critical',
        ${quoteSqlString(`Global write operations paused: ${summary.globalReasons.join(', ')}`)},
        'active',
        ${quoteSqlString(timestamp)}
      )
    `));
  }

  saveDb(db);
}

export function ensureRiskEventTable(db: AppDb): void {
  db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS risk_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER REFERENCES stores(id),
      scope TEXT NOT NULL DEFAULT 'store',
      event_type TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'warning',
      message TEXT NOT NULL,
      operator_id TEXT,
      action_type TEXT,
      source_type TEXT,
      source_id TEXT,
      screenshot_path TEXT,
      html_path TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      resolved_at TEXT
    )
  `));
  try {
    db.run(sql.raw(`ALTER TABLE risk_events ADD COLUMN operator_id TEXT`));
  } catch {
    // Column already exists.
  }
}

function hasActiveGlobalWritePause(db: AppDb): boolean {
  return Boolean(db.get(sql.raw(`
    SELECT id
    FROM risk_events
    WHERE scope = 'global' AND status = 'active'
    LIMIT 1
  `)));
}
