import { FastifyInstance } from 'fastify';
import { getDb } from '@pdd-inspector/core';
import { sql } from 'drizzle-orm';

export async function operatorSessionRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { operatorId?: string; storeId?: string } }>('/api/operator-sessions', async (req) => {
    const db = await getDb();
    ensureOperatorSessionTables(db);
    const where: string[] = [];
    const operatorId = req.query.operatorId?.trim();
    const storeId = req.query.storeId ? parseInt(req.query.storeId, 10) : null;
    if (operatorId) where.push(`oss.operator_id = ${quote(operatorId)}`);
    if (storeId != null && Number.isFinite(storeId)) where.push(`oss.store_id = ${storeId}`);

    return db.all(sql.raw(`
      SELECT
        oss.id,
        oss.operator_id AS operatorId,
        COALESCE(o.name, oss.operator_id) AS operatorName,
        oss.store_id AS storeId,
        s.name AS storeName,
        oss.profile_key AS profileKey,
        oss.status,
        oss.last_login_at AS lastLoginAt,
        oss.last_used_at AS lastUsedAt,
        oss.updated_at AS updatedAt
      FROM operator_store_sessions oss
      LEFT JOIN operators o ON o.id = oss.operator_id
      LEFT JOIN stores s ON s.id = oss.store_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY oss.updated_at DESC, oss.id DESC
      LIMIT 200
    `));
  });
}

function ensureOperatorSessionTables(db: any): void {
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

function quote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}
