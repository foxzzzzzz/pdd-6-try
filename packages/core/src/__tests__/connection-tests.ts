import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { sql } from 'drizzle-orm';

let passed = 0;
let failed = 0;

function assert(description: string, condition: boolean, detail = '') {
  if (condition) {
    passed++;
    console.log(`  ✅ ${description}`);
  } else {
    failed++;
    console.log(`  ❌ ${description}: ${detail}`);
  }
}

async function main() {
  console.log('\n📋 测试: sql.js 连接实例保存');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdd-core-db-'));
  process.env.DATABASE_PATH = path.join(tmpDir, 'test.db');

  const { getDb, saveDb, closeDb } = await import('../db/connection');

  const db1 = await getDb();
  db1.run(sql`CREATE TABLE kv (value TEXT NOT NULL)`);
  db1.run(sql`INSERT INTO kv (value) VALUES ('from-db1')`);

  const db2 = await getDb();
  db2.run(sql`CREATE TABLE kv (value TEXT NOT NULL)`);
  db2.run(sql`INSERT INTO kv (value) VALUES ('from-db2')`);

  saveDb(db1);

  const reloaded = await getDb();
  const rows = reloaded.all<{ value: string }>(sql`SELECT value FROM kv`);

  assert('saveDb(db) 保存调用方传入的 DB 实例', rows.length === 1 && rows[0].value === 'from-db1', JSON.stringify(rows));

  const staleDb = await getDb();
  staleDb.run(sql`CREATE TABLE stale_check (value TEXT NOT NULL)`);
  staleDb.run(sql`INSERT INTO stale_check (value) VALUES ('stale')`);

  const currentDb = await getDb();
  currentDb.run(sql`CREATE TABLE stale_check (value TEXT NOT NULL)`);
  currentDb.run(sql`INSERT INTO stale_check (value) VALUES ('current')`);
  saveDb(currentDb);

  let conflictDetected = false;
  try {
    saveDb(staleDb);
  } catch {
    conflictDetected = true;
  }

  assert('saveDb(db) 拒绝覆盖已被其它实例更新的 DB 文件', conflictDetected);

  await closeDb();

  const totalTests = passed + failed;
  console.log(`结果: ${passed}/${totalTests} 通过`);

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
