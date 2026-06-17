import { sanitizeStore } from '../store-response';

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

console.log('\n📋 测试: 店铺响应脱敏');

const store = {
  id: 1,
  name: '测试店铺',
  pddStoreId: 'pdd-1',
  cookie: '{"secret":true}',
  storageState: '{"cookies":[]}',
  status: 'active',
};

const sanitized = sanitizeStore(store);

assert('店铺响应不包含 cookie', !('cookie' in sanitized));
assert('店铺响应不包含 storageState', !('storageState' in sanitized));
assert('店铺基础字段保持返回', sanitized.name === '测试店铺' && sanitized.status === 'active');

const totalTests = passed + failed;
console.log(`结果: ${passed}/${totalTests} 通过`);

if (failed > 0) process.exit(1);
