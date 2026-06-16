# CHANGELOG

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
