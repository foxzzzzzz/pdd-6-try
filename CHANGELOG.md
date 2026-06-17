# CHANGELOG

## v0.2.0 (2026-06-17) — 评价操作自动化 + 模板管理

### 新增
- 好评自动回复：Playwright 按钮查找 + 文本框填写 + 提交
- 差评举报：关键词匹配话术分类 + 自动举报流程
- 互动动态处理：负面词检测 + 自动隐藏
- 模板管理 API：回复/举报模板 CRUD，`store_id` 区分全局/店铺专属
- 5 条默认回复模板 + 4 条默认举报模板 (seed)
- 7 步流水线：登录 + 4 数据采集 + 3 写操作
- 17 单元测试 (全部通过)
- 26 选择器验证 (全部通过)
- E2E Dry-Run：19/19 指标采集，评价/互动按钮可用性确认

### 修复
- `page.evaluate` 改用模板字符串绕过 tsx `__name` 注入
- 数值提取从标签文本之后开始，避免匹配标签内数字

### 已知限制
- 评价操作仅 Dry-Run，未实际提交（待真实环境测试）
- AI 语义判断未接入 (Phase 3)

## v0.1.0 (2026-06-16) — 项目骨架 + 数据采集引擎

### 新增
- Monorepo 项目结构 (pnpm workspace + 5 子包)
- 核心包 `@pdd-inspector/core`: 9 表 Drizzle ORM Schema + SQLite (sql.js WASM)
- 服务端 `@pdd-inspector/server`: Fastify API + BullMQ 队列管理
  - 店铺 CRUD API
  - 巡店触发 API (单店 + 全部)
  - 巡店记录查询 API
  - 队列状态 API
- Worker `@pdd-inspector/worker`: Playwright 浏览器自动化引擎
  - Cookie/Storage 持久化
  - 登录态检测 + 自动续期
  - 四维数据采集 (店铺健康度/消费者体验/退款/申诉)
  - 失败重试 + 截图留证
- 调度器 `@pdd-inspector/scheduler`: BullMQ 定时任务
- 前端 `@pdd-inspector/web`: Vite + React + Tailwind (占位)
- Docker Compose (Redis)
- AI Provider 抽象接口 (待 Phase 3 实现)
- 完整的设计文档

### 技术栈
- Playwright · Fastify · BullMQ · SQLite(sql.js) · Drizzle ORM
- React + Vite + Tailwind + ECharts (前端基础)
- TypeScript 全栈 · pnpm Monorepo

### 已知限制
- 数据采集选择器为占位符, 需根据真实 PDD 后台页面更新
- AI 功能尚未实现 (Phase 3)
- Web 仪表盘未实现 (Phase 4)
- 单 Worker 模式, 未上规模化并行 (Phase 5)

### 测试覆盖
- 待补充: docs/test-reports/phase-1-test.md
