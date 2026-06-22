import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import { drizzle, SQLJsDatabase } from 'drizzle-orm/sql-js';
import * as schema from './schema';
import * as fs from 'fs';
import * as path from 'path';

export type AppDb = SQLJsDatabase<typeof schema>;

let db: AppDb | null = null;
let sqlDb: SqlJsDatabase | null = null;
type DbMetadata = {
  sqlDb: SqlJsDatabase;
  fileSignature: string;
};

let dbMetadata: DbMetadata | null = null;
const metadataByDrizzleDb = new WeakMap<AppDb, DbMetadata>();

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
const DB_LOCK_PATH = `${DB_PATH}.lock`;

let initPromise: ReturnType<typeof initSqlJs> | null = null;

// Mutex — prevents concurrent DB access from corrupting sql.js singleton
let dbLock: Promise<void> = Promise.resolve();

function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const prev = dbLock;
  let release: () => void;
  dbLock = new Promise<void>(resolve => { release = resolve; });
  return prev.then(fn).finally(() => release!());
}

function waitForLockRetry() {
  const buffer = new SharedArrayBuffer(4);
  Atomics.wait(new Int32Array(buffer), 0, 0, 50);
}

function withFileLock<T>(fn: () => T): T {
  const start = Date.now();
  let fd: number | null = null;

  while (fd == null) {
    try {
      fd = fs.openSync(DB_LOCK_PATH, 'wx');
      fs.writeFileSync(fd, `${process.pid}\n${new Date().toISOString()}`);
    } catch (err) {
      const code = err instanceof Error && 'code' in err ? (err as NodeJS.ErrnoException).code : undefined;
      if (code !== 'EEXIST') throw err;
      if (Date.now() - start > 10000) {
        throw new Error(`Timed out waiting for database lock: ${DB_LOCK_PATH}`);
      }
      waitForLockRetry();
    }
  }

  try {
    return fn();
  } finally {
    fs.closeSync(fd);
    try {
      fs.unlinkSync(DB_LOCK_PATH);
    } catch {
      // Ignore cleanup races from stale lock recovery in future migrations.
    }
  }
}

function getDbFileSignature(): string {
  if (!fs.existsSync(DB_PATH)) return 'missing';
  const stat = fs.statSync(DB_PATH);
  return `${stat.mtimeMs}:${stat.size}`;
}

export async function getDb(): Promise<AppDb> {
  return withLock(async () => {
    if (!initPromise) initPromise = initSqlJs();
    const SQL = await initPromise;

    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    // Create a new instance WITHOUT closing the old one
    // (old instance might still be in use by a long-running operation)
    const fileSignature = getDbFileSignature();
    let newSqlDb: SqlJsDatabase;
    if (fs.existsSync(DB_PATH)) {
      const buffer = fs.readFileSync(DB_PATH);
      newSqlDb = new SQL.Database(buffer);
    } else {
      newSqlDb = new SQL.Database();
    }

    // Keep the latest reference for legacy saveDb(), but also remember the
    // exact sql.js database behind each Drizzle wrapper for explicit saves.
    sqlDb = newSqlDb;
    db = drizzle(newSqlDb, { schema });
    dbMetadata = { sqlDb: newSqlDb, fileSignature };
    metadataByDrizzleDb.set(db, dbMetadata);
    return db;
  });
}

export function saveDb(targetDb?: AppDb): void {
  const metadata = targetDb ? metadataByDrizzleDb.get(targetDb) : dbMetadata;
  if (!metadata) return;

  withFileLock(() => {
    const currentSignature = getDbFileSignature();
    if (currentSignature !== metadata.fileSignature) {
      throw new Error(
        `Database changed on disk since it was loaded; refusing to overwrite ${DB_PATH}`,
      );
    }

    const data = metadata.sqlDb.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
    metadata.fileSignature = getDbFileSignature();
  });
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
