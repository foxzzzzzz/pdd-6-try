/**
 * 初始化默认模板数据
 */
import { getDb, saveDb, closeDb } from './connection';
import * as schema from './schema';

async function seed() {
  console.log('Seeding default templates...');
  const db = await getDb();

  // 默认好评回复模板（全局）
  const replyTemplates = [
    { name: '通用感谢', scene: '通用好评', content: '感谢亲的支持和喜爱！我们会继续努力提供优质的商品和服务，祝亲购物愉快！', variables: null },
    { name: '口味好评', scene: '食品口味', content: '感谢亲对{product}口味的认可！我们坚持严选好食材，每一份都用心制作，期待您的再次光临~', variables: '{"product":"商品名称"}' },
    { name: '物流好评', scene: '物流快', content: '感谢亲的耐心等待！我们一直努力提升发货速度，能让您满意我们很开心~', variables: null },
    { name: '复购感谢', scene: '回头客', content: '感谢亲的再次支持！老顾客是我们最大的动力，我们会一如既往地保证品质~', variables: null },
    { name: '性价比好评', scene: '性价比', content: '感谢亲的认可！我们坚持薄利多销，让每位顾客都能买到实惠好物~', variables: null },
  ];

  // Only seed if tables are empty
  const existingReplies = db.select().from(schema.replyTemplates).all();
  if (existingReplies.length === 0) {
    for (const t of replyTemplates) {
      db.insert(schema.replyTemplates).values({
        name: t.name, scene: t.scene, content: t.content,
        variables: t.variables, storeId: null, enabled: 1,
      }).run();
    }
  }

  const reportTemplates = [
    { name: '广告举报', reportType: '广告', content: '该评价内容为广告信息，包含诱导添加联系方式的内容，违反了平台评价规范，请平台核实处理。' },
    { name: '不文明用语', reportType: '恶意', content: '该评价包含不文明用语/人身攻击，不符合平台评价规范，请平台核实处理。' },
    { name: '不实评价', reportType: '不实', content: '该评价内容与商品实际情况不符，请平台核实处理。' },
    { name: '竞品恶意', reportType: '竞品', content: '该评价疑似竞品恶意差评，评价内容不客观，请平台核实处理。' },
  ];

  const existingReports = db.select().from(schema.reportTemplates).all();
  if (existingReports.length === 0) {
    for (const t of reportTemplates) {
      db.insert(schema.reportTemplates).values({
        name: t.name, reportType: t.reportType, content: t.content,
        storeId: null, enabled: 1,
      }).run();
    }
  }

  saveDb(db);
  console.log('Seed complete.');

  // Verify
  const replyCount = db.select().from(schema.replyTemplates).all().length;
  const reportCount = db.select().from(schema.reportTemplates).all().length;
  console.log(`  Reply templates: ${replyCount}`);
  console.log(`  Report templates: ${reportCount}`);

  await closeDb();
}

seed().catch((err) => { console.error('Seed failed:', err); process.exit(1); });
