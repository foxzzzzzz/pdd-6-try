import { saveDb } from '@pdd-inspector/core';
import { sql } from 'drizzle-orm';

export type OperatorSessionStatus = 'active' | 'pending_login' | 'paused';

export interface OperatorStoreSession {
  operatorId: string;
  storeId: number;
  profileKey: string;
  storageState: string | null;
  status: OperatorSessionStatus;
  lastLoginAt: string | null;
  lastUsedAt: string | null;
}

export function normalizeOperatorId(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function buildOperatorSessionProfileKey(operatorId: string, storeId: number): string {
  return `${normalizeOperatorId(operatorId) || 'unknown'}:store-${storeId}`;
}

export function ensureOperatorSessionTables(db: any): void {
  db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS operators (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `));
  db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS operator_store_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      operator_id TEXT NOT NULL,
      store_id INTEGER NOT NULL REFERENCES stores(id),
      profile_key TEXT NOT NULL,
      storage_state TEXT,
      status TEXT NOT NULL DEFAULT 'pending_login',
      last_login_at TEXT,
      last_used_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(operator_id, store_id)
    )
  `));
}

export function getOperatorStoreSession(db: any, operatorId: string | null, storeId: number): OperatorStoreSession | null {
  const normalized = normalizeOperatorId(operatorId);
  if (!normalized) return null;
  ensureOperatorRecord(db, normalized);
  ensureOperatorSessionTables(db);

  const existing = db.get(sql.raw(`
    SELECT
      operator_id AS operatorId,
      store_id AS storeId,
      profile_key AS profileKey,
      storage_state AS storageState,
      status,
      last_login_at AS lastLoginAt,
      last_used_at AS lastUsedAt
    FROM operator_store_sessions
    WHERE operator_id = ${quote(normalized)} AND store_id = ${storeId}
  `)) as OperatorStoreSession | undefined;
  if (existing) return existing;

  const now = new Date().toISOString();
  const profileKey = buildOperatorSessionProfileKey(normalized, storeId);
  db.run(sql.raw(`
    INSERT INTO operator_store_sessions (
      operator_id, store_id, profile_key, status, created_at, updated_at
    ) VALUES (
      ${quote(normalized)}, ${storeId}, ${quote(profileKey)}, 'pending_login', ${quote(now)}, ${quote(now)}
    )
  `));
  saveDb(db);

  return {
    operatorId: normalized,
    storeId,
    profileKey,
    storageState: null,
    status: 'pending_login',
    lastLoginAt: null,
    lastUsedAt: null,
  };
}

export function resolveOperatorStorageState(
  db: any,
  operatorId: string | null,
  storeId: number,
  fallbackStorageState: string | null,
): string | null {
  const session = getOperatorStoreSession(db, operatorId, storeId);
  return session?.storageState || fallbackStorageState;
}

export function saveOperatorStoreSession(
  db: any,
  operatorId: string | null,
  storeId: number,
  storageState: string,
  status: OperatorSessionStatus = 'active',
): void {
  const normalized = normalizeOperatorId(operatorId);
  if (!normalized) return;
  ensureOperatorRecord(db, normalized);
  ensureOperatorSessionTables(db);

  const now = new Date().toISOString();
  const profileKey = buildOperatorSessionProfileKey(normalized, storeId);
  db.run(sql.raw(`
    INSERT INTO operator_store_sessions (
      operator_id, store_id, profile_key, storage_state, status, last_login_at, last_used_at, created_at, updated_at
    ) VALUES (
      ${quote(normalized)}, ${storeId}, ${quote(profileKey)}, ${quote(storageState)}, ${quote(status)},
      ${quote(now)}, ${quote(now)}, ${quote(now)}, ${quote(now)}
    )
    ON CONFLICT(operator_id, store_id) DO UPDATE SET
      profile_key = excluded.profile_key,
      storage_state = excluded.storage_state,
      status = excluded.status,
      last_login_at = excluded.last_login_at,
      last_used_at = excluded.last_used_at,
      updated_at = excluded.updated_at
  `));
}

export function markOperatorStoreSessionStatus(
  db: any,
  operatorId: string | null,
  storeId: number,
  status: OperatorSessionStatus,
): void {
  const normalized = normalizeOperatorId(operatorId);
  if (!normalized) return;
  getOperatorStoreSession(db, normalized, storeId);
  const now = new Date().toISOString();
  db.run(sql.raw(`
    UPDATE operator_store_sessions
    SET status = ${quote(status)},
        last_used_at = ${quote(now)},
        updated_at = ${quote(now)}
    WHERE operator_id = ${quote(normalized)} AND store_id = ${storeId}
  `));
}

function ensureOperatorRecord(db: any, operatorId: string): void {
  ensureOperatorSessionTables(db);
  const now = new Date().toISOString();
  db.run(sql.raw(`
    INSERT INTO operators (id, name, status, created_at, updated_at)
    VALUES (${quote(operatorId)}, ${quote(operatorId)}, 'active', ${quote(now)}, ${quote(now)})
    ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at
  `));
}

function quote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}
