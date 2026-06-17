import * as fs from 'fs';
import * as path from 'path';

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

function countSaveDbCalls(file: string) {
  const source = fs.readFileSync(path.resolve(process.cwd(), 'src/routes', file), 'utf8');
  return (source.match(/\bsaveDb\(\)/g) ?? []).length;
}

console.log('\n📋 测试: Server 写接口持久化契约');

assert('店铺新增/更新/删除后持久化', countSaveDbCalls('stores.ts') >= 3);
assert('巡店触发创建记录后持久化', countSaveDbCalls('inspections.ts') >= 2);
assert('模板新增/更新/删除后持久化', countSaveDbCalls('templates.ts') >= 6);

const totalTests = passed + failed;
console.log(`结果: ${passed}/${totalTests} 通过`);

if (failed > 0) process.exit(1);
