import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import { drizzle, SQLJsDatabase } from 'drizzle-orm/sql-js';
import * as schema from './schema';
import * as fs from 'fs';
import * as path from 'path';

let db: SQLJsDatabase<typeof schema> | null = null;
let sqlDb: SqlJsDatabase | null = null;

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

// Mutex — prevents concurrent DB access from corrupting sql.js singleton
let dbLock: Promise<void> = Promise.resolve();

function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const prev = dbLock;
  let release: () => void;
  dbLock = new Promise<void>(resolve => { release = resolve; });
  return prev.then(fn).finally(() => release!());
}

export async function getDb(): Promise<SQLJsDatabase<typeof schema>> {
  return withLock(async () => {
    if (!initPromise) initPromise = initSqlJs();
    const SQL = await initPromise;

    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    // Create a new instance WITHOUT closing the old one
    // (old instance might still be in use by a long-running operation)
    let newSqlDb: SqlJsDatabase;
    if (fs.existsSync(DB_PATH)) {
      const buffer = fs.readFileSync(DB_PATH);
      newSqlDb = new SQL.Database(buffer);
    } else {
      newSqlDb = new SQL.Database();
    }

    // Keep reference for saveDb() — last writer wins
    sqlDb = newSqlDb;
    db = drizzle(newSqlDb, { schema });
    return db;
  });
}

export function saveDb(): void {
  if (!sqlDb) return;
  const data = sqlDb.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
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
