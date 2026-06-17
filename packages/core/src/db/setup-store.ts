/**
 * 快速设置脚本：清理旧数据 + 导入真实店铺 Cookie
 * 运行: npx tsx packages/core/src/db/setup-store.ts
 */
import { getDb, saveDb, closeDb } from './connection';
import * as fs from 'fs';
import * as path from 'path';
import * as schema from './schema';
import { eq } from 'drizzle-orm';

async function setup() {
  const db = await getDb();
  console.log('=== 店铺快速设置 ===\n');

  // 1. Clean old test stores
  const oldStores = db.select().from(schema.stores).all();
  for (const s of oldStores) {
    console.log(`  清理: [${s.id}] ${s.name}`);
    db.delete(schema.stores).where(eq(schema.stores.id, s.id)).run();
  }
  if (oldStores.length > 0) console.log(`  已清理 ${oldStores.length} 条旧记录\n`);

  // 2. Read discovery cookie
  const cookiePath = path.resolve(process.cwd(), 'packages/worker/data/discovery-cookie.json');
  if (!fs.existsSync(cookiePath)) {
    console.log('❌ 未找到 Cookie: ' + cookiePath);
    console.log('   请先运行 pnpm discover 登录 PDD 后台');
    await closeDb();
    return;
  }

  const cookies = JSON.parse(fs.readFileSync(cookiePath, 'utf-8'));
  const storageState = JSON.stringify({ cookies, origins: [] });

  // 3. Create real store
  const result = db.insert(schema.stores).values({
    name: '颜卤公零食专营店',
    pddStoreId: 'yanlugong',
    storageState: storageState,
    cookie: JSON.stringify(cookies),
    status: 'active',
    owner: '默认运营',
    factory: '默认工厂',
  }).returning().get();

  saveDb();
  console.log(`✅ 店铺已创建`);
  console.log(`   名称: ${result.name}`);
  console.log(`   状态: ${result.status}`);
  console.log(`   Cookie: ${cookies.length} 条`);

  // 4. Verify
  const count = db.select().from(schema.stores).all().length;
  const replyCount = db.select().from(schema.replyTemplates).all().length;
  const reportCount = db.select().from(schema.reportTemplates).all().length;
  console.log(`\n📊 数据概览:`);
  console.log(`   店铺: ${count} | 回复模板: ${replyCount} | 举报模板: ${reportCount}`);

  await closeDb();
}

setup().catch((err) => { console.error('❌', err); process.exit(1); });
