import { saveDb } from '@pdd-inspector/core';
import { sql } from 'drizzle-orm';

export type SelectorHealthStatus = 'healthy' | 'degraded';
export type SelectorModuleKey =
  | 'pilot_mall'
  | 'experience'
  | 'refunds'
  | 'comment'
  | 'customer'
  | 'reviews'
  | 'interactions';

export interface SelectorCheckResult {
  name: string;
  ok: boolean;
  detail?: string | null;
}

export interface SelectorHealthEventLike {
  moduleKey: string;
  status: string;
  createdAt?: string | null;
}

export interface SelectorHealthEvaluation {
  moduleKey: SelectorModuleKey | string;
  moduleName: string;
  status: SelectorHealthStatus;
  totalChecks: number;
  failedChecks: number;
  failureRate: number;
  checks: SelectorCheckResult[];
}

const DEFAULT_FAILURE_THRESHOLD = 0.3;

export function evaluateSelectorHealth(
  moduleKey: SelectorModuleKey | string,
  moduleName: string,
  checks: SelectorCheckResult[],
  failureThreshold = DEFAULT_FAILURE_THRESHOLD,
): SelectorHealthEvaluation {
  const totalChecks = checks.length;
  const failedChecks = checks.filter((check) => !check.ok).length;
  const failureRate = totalChecks === 0 ? 1 : failedChecks / totalChecks;
  return {
    moduleKey,
    moduleName,
    status: failureRate >= failureThreshold ? 'degraded' : 'healthy',
    totalChecks,
    failedChecks,
    failureRate,
    checks,
  };
}

export function isModuleDegradedFromEvents(events: SelectorHealthEventLike[], moduleKey: string): boolean {
  const latest = events
    .filter((event) => event.moduleKey === moduleKey)
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))[0];
  return latest?.status === 'degraded';
}

export function shouldBlockWriteActionForSelectorHealth(
  moduleKey: 'reviews' | 'interactions',
  events: SelectorHealthEventLike[],
): boolean {
  return isModuleDegradedFromEvents(events, moduleKey);
}

export function ensureSelectorHealthTable(db: any): void {
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

export function recordSelectorHealthEvent(
  db: any,
  event: SelectorHealthEvaluation & { screenshotPath?: string | null; htmlPath?: string | null },
): void {
  ensureSelectorHealthTable(db);
  const createdAt = new Date().toISOString();
  db.run(sql.raw(`
    INSERT INTO selector_health_events (
      module_key, module_name, status, failure_rate, total_checks, failed_checks,
      screenshot_path, html_path, details, created_at
    ) VALUES (
      ${quote(event.moduleKey)},
      ${quote(event.moduleName)},
      ${quote(event.status)},
      ${event.failureRate},
      ${event.totalChecks},
      ${event.failedChecks},
      ${event.screenshotPath ? quote(event.screenshotPath) : 'NULL'},
      ${event.htmlPath ? quote(event.htmlPath) : 'NULL'},
      ${quote(JSON.stringify(event.checks))},
      ${quote(createdAt)}
    )
  `));
  saveDb(db);
}

export function listRecentSelectorHealthEvents(db: any, maxAgeHours = 24): SelectorHealthEventLike[] {
  ensureSelectorHealthTable(db);
  const since = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000).toISOString();
  return db.all(sql.raw(`
    SELECT module_key AS moduleKey, status, created_at AS createdAt
    FROM selector_health_events
    WHERE created_at >= ${quote(since)}
    ORDER BY created_at DESC, id DESC
  `));
}

export function isModuleDegraded(db: any, moduleKey: SelectorModuleKey | string, maxAgeHours = 24): boolean {
  return isModuleDegradedFromEvents(listRecentSelectorHealthEvents(db, maxAgeHours), moduleKey);
}

function quote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}
