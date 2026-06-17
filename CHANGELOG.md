# CHANGELOG

## Unreleased

### 修复
- 恢复 monorepo 全量构建：补齐 Node/sql.js 类型、统一 Drizzle 版本、为 server/worker/scheduler 显式声明 Drizzle 依赖，并避免 BullMQ 直接接收 ioredis 实例导致的类型冲突。

## v1.0.0 (2026-06-17) — 🎉 全功能交付

### Phase 5: 规模化 + 工厂协作
- 问题管理 API：CRUD + 多维度筛选 + CSV 导出
- 工厂协作：share token 分享链接，无需登录即可查看/反馈
- 周报/月报 API：7/30 天聚合 + 趋势计算
- Dashboard 快捷入口：周报 / 月报 / 问题导出

### 项目全貌 (v0.1.0 → v1.0.0)
P1: 骨架+采集 → P2: 评价操作 → P3: AI增强 → P4: Web仪表盘 → P5: 工厂协作

## v0.4.0 (2026-06-17) — Web 仪表盘

### 新增
- Dashboard 总览页：三色分级 + 一键巡店 + 店铺状态卡片
- 单店详情页：指标网格 + ECharts 趋势图 + 巡店记录表
- 模板管理页：回复/举报模板 CRUD + 全局/店铺专属标记
- 店铺配置页：添加/编辑/删除 + 单店触发巡店
- 侧边栏导航 + API Client 全覆盖

### 技术栈
- React 19 + React Router 7 + Tailwind CSS
- ECharts 动态加载 (lazy import)
- 构建输出: 1.3MB (gzip 430KB)

## v0.3.0 (2026-06-17) — AI 增强：Provider 抽象层 + 异常检测 + 日报生成

### 新增
- AIProvider 接口：5 个方法覆盖全部介入点
- ClaudeProvider：Anthropic API 集成 (classify/judge/detect/generate)
- Provider 工厂：三级配置 (全局→店铺→任务)，模型可切换
- 规则引擎异常检测：4 条检测规则 + 严重程度分级（不依赖 AI）
- 模板引擎日报生成：总览 + 关注列表 + 趋势 + 建议（不依赖 AI）
- AI 就绪 Hook：评价分类/互动判断/日报摘要接口已预留
- 14 AI 单元测试 + 17 Phase 2 回归 = 31 测试全部通过

### 设计特性
- AI 配置三级：`.env` 默认 → `stores.ai_config` 店铺覆盖 → 代码任务指定
- 轻量/重量模型分离：Haiku 做分类匹配，Sonnet 做语义判断和摘要
- 全兜底：AI 不可用时规则引擎/模板引擎自动接替

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
