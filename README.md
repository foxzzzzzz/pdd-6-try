# PDD Inspector

拼多多商家后台巡店辅助系统。项目目标是在固定办公环境下，帮助运营完成多店铺日常巡店、店铺健康度采集、评价/互动候选处理、日报归档和风险提醒。

系统定位是“运营辅助”，不是绕过平台风控的批量机器人。读操作可以自动巡店采集；回复、举报、隐藏等写操作默认进入 dry-run 或人工审批链路，真实执行必须受限额、审计、截图和风控熔断约束。

## 核心能力

- 多店铺巡店：按店铺状态和错峰计划入队，默认串行执行，避免集中并发打开后台页面。
- 固定账号绑定：以 `operatorId + storeId` 绑定独立浏览器 profile 和登录态，支持登录绑定、重新登录、登录态测试。
- 店铺健康度采集：综合体验星级、领航员行业排名和未达标项、售后核心指标、评价数据、消费者体验指标。
- 评价管理：最近 72 小时内新评价生成回复/举报候选；4-5 星可低风险回复，1-3 星举报默认审批后执行。
- 互动隐藏：进入【评价管理】-【查看全部互动】，按近 30 天页面筛选，并仅处理近 7 日内负面互动候选。
- AI/规则闭环：AI 可用于评价分类、互动判断和日报摘要；AI 不可用时自动回退模板和规则。
- 日报归档：巡店完成后生成单店摘要和多店日报，支持 API 和 Web 页面展示。
- 风控哨兵：识别登录异常、安全验证、操作频繁、权限不足、页面结构变化和写操作失败升高，触发店铺级或全局写操作熔断。

## 技术方案

### Monorepo 结构

```text
packages/
  core       数据模型、sql.js 持久化、队列类型、通用配置
  server     Fastify API、静态前端托管、BullMQ 入队
  worker     Playwright 采集/写操作执行、AI/规则处理、风控哨兵
  scheduler  定时巡店任务
  web        React + Vite + Tailwind Web 控制台
```

### 核心技术栈

- TypeScript + pnpm workspace
- Fastify 作为 HTTP API 和生产静态 Web 托管
- React 19 + React Router + Tailwind CSS + ECharts
- BullMQ + Redis 作为巡店、写操作、登录绑定任务队列
- Playwright 控制真实 Chrome 浏览器
- SQLite(sql.js WASM) + Drizzle ORM，数据库文件默认保存在 `data/pdd-inspector.db`
- AI Provider 抽象，支持 Claude / OpenAI / DeepSeek / local 回退

### 队列设计

- `pdd-inspection`：巡店读操作队列。
- `pdd-action`：审批后的单条真实写操作队列。
- `pdd-login-bind`：登录绑定队列，只负责打开可见 Chrome 等待人工登录并保存登录态。
- `pdd-scheduler`：定时巡店调度队列。

读操作、写操作、登录绑定分队列执行，避免登录窗口、数据采集和真实写操作互相抢状态。

### 浏览器与风控策略

- 默认 `headless=false`，使用系统安装的 Google Chrome。
- 固定窗口大小 `1920x1080`。
- 不硬编码 UA，不启用反指纹或绕检测参数。
- 每个 `operatorId + storeId` 使用固定 persistent profile，默认目录为 `data/browser-profiles`。
- 同一 profile 使用 `.profile.lock` 互斥，避免并发打开同一登录态。
- 不自动处理二维码、短信、滑块或安全验证。
- 写操作默认 dry-run；举报和互动隐藏默认人工审批后单条执行。

## 跨平台部署

### 基础要求

- Node.js >= 20（[下载](https://nodejs.org/)）
- pnpm（部署脚本会自动安装，无需手动操作）
- Redis 7+（部署脚本通过 Docker Compose 自动启动）
- Google Chrome（[下载](https://www.google.com/chrome/)）
- Windows 10/11、macOS、Linux 均可运行

> 新机器克隆后直接运行部署脚本即可：`.\scripts\deploy-windows.ps1`（或对应平台的脚本）。脚本会自动处理 Node.js 版本检查、pnpm 安装、依赖安装、数据库迁移、默认数据 seed 和项目构建。

### 自动化脚本

项目提供按平台拆分的部署和启动脚本：

| 平台 | 一次性部署 | 日常启动 |
| --- | --- | --- |
| Windows PowerShell | `.\scripts\deploy-windows.ps1` | `.\scripts\start-windows.ps1` |
| macOS | `./scripts/deploy-macos.sh` | `./scripts/start-macos.sh` |
| Linux | `./scripts/deploy-linux.sh` | `./scripts/start-linux.sh` |

部署脚本会执行：

1. 检查 Node.js 20+ 和 pnpm。
2. 不存在 `.env` 时，从 `.env.example` 复制一份。
3. 如检测到 Docker，启动 `docker compose up -d redis`。
4. 执行 `pnpm install`。
5. 执行数据库迁移和默认数据 seed。
6. 执行 `pnpm build`。

启动脚本会启动 Server 和 Worker。需要定时巡店时加调度参数：

```powershell
.\scripts\start-windows.ps1 -WithScheduler
```

```bash
./scripts/start-macos.sh --with-scheduler
./scripts/start-linux.sh --with-scheduler
```

可选参数：

- Windows 部署：`-SkipRedis`、`-SkipSeed`
- macOS/Linux 部署：`--skip-redis`、`--skip-seed`

### Redis

推荐使用 Docker Compose：

```bash
docker compose up -d redis
```

也可以使用本机 Redis，只要 `.env` 中的 `REDIS_HOST` 和 `REDIS_PORT` 指向正确地址。

### Windows PowerShell

推荐使用自动化脚本：

```powershell
.\scripts\deploy-windows.ps1
.\scripts\start-windows.ps1
```

手工部署命令如下：

```powershell
pnpm install
Copy-Item .env.example .env
docker compose up -d redis
pnpm db:migrate
pnpm db:seed
pnpm build
pnpm --filter @pdd-inspector/server run start
```

另开一个 PowerShell 启动 Worker：

```powershell
pnpm --filter @pdd-inspector/worker run start
```

需要定时巡店时，再启动 Scheduler：

```powershell
pnpm --filter @pdd-inspector/scheduler run start
```

### macOS / Linux

macOS 推荐：

```bash
chmod +x scripts/deploy-macos.sh scripts/start-macos.sh
./scripts/deploy-macos.sh
./scripts/start-macos.sh
```

Linux 推荐：

```bash
chmod +x scripts/deploy-linux.sh scripts/start-linux.sh
./scripts/deploy-linux.sh
./scripts/start-linux.sh
```

手工部署命令如下：

```bash
pnpm install
cp .env.example .env
docker compose up -d redis
pnpm db:migrate
pnpm db:seed
pnpm build
pnpm --filter @pdd-inspector/server run start
```

另开一个终端启动 Worker：

```bash
pnpm --filter @pdd-inspector/worker run start
```

需要定时巡店时，再启动 Scheduler：

```bash
pnpm --filter @pdd-inspector/scheduler run start
```

## 配置说明

复制 `.env.example` 为 `.env` 后按环境调整。

### 基础配置

```env
REDIS_HOST=localhost
REDIS_PORT=6379
DATABASE_PATH=./data/pdd-inspector.db
PORT=3000
HOST=0.0.0.0
```

### AI 配置

```env
AI_PROVIDER=deepseek
AI_LIGHT_MODEL=deepseek-v4-pro
AI_HEAVY_MODEL=deepseek-v4-pro
DEEPSEEK_API_KEY=sk-xxx
```

可选 Provider：`claude`、`openai`、`deepseek`、`local`。AI 不可用时，主流程会回退到规则和模板。

### Worker 与写操作配置

```env
WORKER_HEADLESS=false
WORKER_CONCURRENCY=1
WORKER_ACTION_CONCURRENCY=1
WORKER_ACTION_MODE=dry-run
WORKER_ACTION_LIMIT=1
WORKER_ENABLE_REPLY=false
WORKER_ENABLE_REPORT=false
WORKER_ENABLE_HIDE_INTERACTIONS=false
WORKER_ENABLE_AI=false
ACTION_DAILY_LIMIT_REPLY=20
ACTION_DAILY_LIMIT_REPORT=5
ACTION_DAILY_LIMIT_HIDE=5
ACTION_DELAY_REPLY_MS=8000-20000
ACTION_DELAY_REPORT_MS=20000-60000
ACTION_DELAY_HIDE_MS=20000-60000
BROWSER_PROFILE_ROOT=./data/browser-profiles
BROWSER_PROFILE_LOCK_STALE_MS=7200000
DEFAULT_OPERATOR_ID=
```

生产默认建议：

- `WORKER_ACTION_MODE=dry-run`
- 真实写操作前先在 Web 审批台确认候选内容、截图和理由。
- 好评回复可以小规模放开；举报和互动隐藏保持审批后单条执行。

## 启动方式

### 开发模式

开发模式会同时启动各 package 的 dev 脚本：

```bash
pnpm dev
```

常用访问地址：

- Web 开发入口：`http://127.0.0.1:5173`
- API / 生产静态入口：`http://localhost:3000`

Vite 开发入口会把 `/api` 代理到 `localhost:3000`。

### 生产/本机运行模式

先构建前端和各 package：

```bash
pnpm build
```

启动 Server：

```bash
pnpm --filter @pdd-inspector/server run start
```

启动 Worker：

```bash
pnpm --filter @pdd-inspector/worker run start
```

访问：

```text
http://localhost:3000
```

生产模式下，Server 会托管 `packages/web/dist`，所以【店铺配置】等页面从 `http://localhost:3000/stores` 访问。

## 首次使用流程

1. 启动 Redis、Server、Worker。
2. 打开 `http://localhost:3000/stores`。
3. 在【店铺配置】新增店铺，填写店铺名、PDD 店铺 ID、运营 ID。
4. 点击【登录绑定】，Worker 会打开可见 Chrome。
5. 运营在 Chrome 中扫码或完成平台登录验证。
6. 登录成功后店铺状态变为“已绑定”。
7. 点击单店【巡店】或 Dashboard 的【一键巡店】开始采集。
8. 巡店完成后查看店铺详情、日报、风控状态和写操作审批台。

## 常用命令

```bash
pnpm test
pnpm test:selectors
pnpm test:selector-health
pnpm --filter @pdd-inspector/worker run test:metrics
pnpm --filter @pdd-inspector/worker run test:interactions
pnpm --filter @pdd-inspector/worker run test:ai
pnpm build
```

说明：

- `test:selector-health` 是只读 smoke test，用于检查页面结构和关键 selector 是否仍可用。
- `test:metrics` 是只读指标采集 dry-run，可用于真实页面回归确认。
- `test:interactions` 是互动隐藏 dry-run，不会执行真实隐藏。

## 数据与目录

默认本地数据目录：

```text
data/
  pdd-inspector.db       sql.js SQLite 数据文件
  browser-profiles/      operatorId + storeId 绑定的 Chrome profile
  screenshots/           巡店、风控、写操作截图和 HTML 证据
  metrics-dryrun/        指标 dry-run 原始页面和报告
```

这些数据都属于本机运行态，不应提交到 git。

## 关键安全边界

- 不使用代理池、反指纹、CDP 隐藏或验证码自动处理。
- 不自动跨账号切号，不托管拼多多账号密码。
- 不在登录绑定任务中执行采集或写操作。
- 不在 selector 降级、规则复核过期、登录异常、安全验证、操作频繁或权限不足时继续真实写操作。
- 写操作必须保留操作人、店铺、动作、时间、截图、结果和失败原因。

更详细的风控设计见 [docs/action-approval-risk-control.md](docs/action-approval-risk-control.md)。

## 需求与变更记录

- 设计需求：[docs/spec.md](docs/spec.md)
- 变更记录：[CHANGELOG.md](CHANGELOG.md)
- 测试报告：[docs/test-reports](docs/test-reports)
