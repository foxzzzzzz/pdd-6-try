import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import { drizzle, SQLJsDatabase } from 'drizzle-orm/sql-js';
import * as schema from './schema';
import * as fs from 'fs';
import * as path from 'path';

let db: SQLJsDatabase<typeof schema> | null = null;
let sqlDb: SqlJsDatabase | null = null;

/** Find workspace root by looking for pnpm-workspace.yaml */
function findWorkspaceRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

const WORKSPACE_ROOT = findWorkspaceRoot();
const DB_PATH = process.env.DATABASE_PATH
  ? path.resolve(WORKSPACE_ROOT, process.env.DATABASE_PATH)
  : path.join(WORKSPACE_ROOT, 'data', 'pdd-inspector.db');

let initPromise: Promise<typeof import('sql.js')> | null = null;

export async function getDb(): Promise<SQLJsDatabase<typeof schema>> {
  // Reload from disk every time to support multi-process access
  if (!initPromise) {
    initPromise = initSqlJs();
  }
  const SQL = await initPromise;

  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Always load fresh from disk
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    if (sqlDb) sqlDb.close();
    sqlDb = new SQL.Database(buffer);
  } else {
    if (sqlDb) sqlDb.close();
    sqlDb = new SQL.Database();
  }

  db = drizzle(sqlDb, { schema });
  return db;
}

export function saveDb(): void {
  if (!sqlDb) return;
  const data = sqlDb.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

export async function reloadDb(): Promise<void> {
  db = null;
  await getDb();
}

export async function closeDb(): Promise<void> {
  if (sqlDb) {
    saveDb();
    sqlDb.close();
    sqlDb = null;
    db = null;
  }
}

export { schema };
