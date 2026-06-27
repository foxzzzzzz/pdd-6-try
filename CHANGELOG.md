# CHANGELOG

## Unreleased

### 新增
- 多店铺登录绑定闭环：新增 `pdd-login-bind` 独立队列、`/api/stores/:id/login-bind` 接口和 Worker 登录绑定消费者；店铺配置页支持按 `operatorId + storeId` 触发“登录绑定 / 重新登录 / 测试登录态”，成功后保存到 `operator_store_sessions` 和店铺状态，未完成绑定的店铺不能直接巡店。
- 浏览器运行策略按低风险运营辅助模式收敛：默认 `headless=false`、默认使用系统 Chrome channel、固定 `1920x1080` 窗口；移除硬编码 UA 和 `--disable-blink-features=AutomationControlled`，并为 `operatorId + storeId` 启用 persistent `userDataDir` 与 `.profile.lock`，避免同一浏览器 profile 被并发打开。
- 新增系统 Chrome 环境检查：`/api/system/browser` 会检测当前机器是否安装 Google Chrome；Dashboard 缺 Chrome 时展示红色提醒并禁用“一键巡店”，后端触发巡店和 Worker 启动浏览器前也会阻止执行，避免静默回退到 bundled Chromium。
- 写操作路径新增统一拟人化交互 helper：回复、举报、互动隐藏的按钮点击和文本填写会通过 `humanClick/humanFill/humanPause` 加入点击前后随机停顿，减少固定毫秒级连续操作；只读采集仍保持直接打开页面读取。
- 多店巡店错峰入队：`/api/inspect-all` 和 scheduler 现在按可配置 pacing 计划为批量巡店 job 设置 delay，默认以 90 分钟目标窗口、1-5 分钟相邻入队间隔、2 分钟/店估算；API 返回 `pacing.expectedFinishBeforeTarget`，用于判断 40 店上午 8:00 开始是否有望在 9:30 前完成。
- P6 规则复核机制落地：新增 `rule_reviews` 表、`/api/rule-reviews/status` 查询和更新接口、Dashboard 规则复核过期提醒；默认内置评价管理、举报/隐藏、账号安全、自动化工具限制和相关协议 5 类月度复核项，规则未通过或过期时举报/隐藏 real-run 会被 Worker 暂停，巡店阶段只保留候选生成和人工审批。
- P5 选择器和页面变更监控落地：新增 `selector_health_events` 表、只读 `pnpm test:selector-health` smoke test、`/api/selector-health/status` 查询接口和 Dashboard 页面采集健康提醒；Worker 会按最近 selector 健康事件对综合星级、消费者体验、售后、评价数据、评价管理和互动模块做模块级降级，写操作 real-run 在 `reviews/interactions` selector degraded 时强制暂停。
- P4 账号和权限治理落地：新增 `operators`、`operator_store_sessions` 和 `risk_events.operator_id`，巡店与真实写操作支持按 `operatorId + storeId` 隔离 Playwright `storageState/profileKey`；审批台确认/跳过必须填写运营 ID，action worker 使用对应绑定登录态执行并回写审计；运营绑定风险事件优先暂停对应 session，不直接牵连整个店铺；新增 `/api/operator-sessions` 只读查询接口，详细边界见 `docs/action-approval-risk-control.md`。
- P1 写操作风控闭环落地候选/审批/单条执行能力：`ActionSafety` 支持审批要求、每日限额和执行审计字段；举报/互动隐藏默认生成 `pending_approval` 候选；新增 `/api/action-candidates` 查询、确认执行和跳过接口，确认后创建 `pdd-action` 单条执行任务，由 Worker 只执行该候选动作并回写结果；Web 新增 `/actions/review` 审批台；详细边界见 `docs/action-approval-risk-control.md`。
- 写操作节奏和熔断规则落地到代码默认行为：action worker 并发强制不超过 1，真实写操作前后按动作类型加入随机间隔（好评回复默认 8-20 秒，举报/隐藏默认 20-60 秒，支持环境变量覆盖），登录验证/操作频繁/安全验证/权限不足会触发店铺 `pending_login` 或 `paused` 状态，避免自动连续重试。
- P2 全局节流与真实工作节奏落地：巡店 worker 并发默认/上限收敛为 1，读巡店和写操作保持 `pdd-inspection`/`pdd-action` 分队列，巡店 job 默认不连续重试；Playwright 登录态改用原生 `storageState` 恢复 cookies 与 localStorage/origins，并在 action 执行后刷新店铺登录态，减少频繁重新登录。
- P3 风控哨兵模块落地：新增 `risk_events` 表、Worker 风控事件记录、截图/HTML 证据保存、店铺级/全局写操作熔断、`/api/risk/status` 查询接口和 Dashboard 风控提醒；支持识别登录、安全验证、操作频繁、权限不足、处罚/违规/账号安全提醒、写操作失败升高和多店同类异常。
- Web 新增完整日报总览页 `/reports/daily`：支持日期选择、归档/动态生成状态展示、总体摘要、关注店铺、建议事项和店铺明细；Dashboard 日报摘要卡改为整卡跳转到日报页，不再只打开 API JSON。
- `docs/spec.md` 同步需求边界：当前阶段优先对齐需求A，需求B仅保留商品体检、店铺违规和商品推广的后续数据模型/UI设计预留。
- 自定义 favicon：蓝盾+放大镜+绿色勾 SVG 图标，替换默认 Vite 图标。

### 优化
- Web 前端 UI 全面升级：引入 `lucide-react` SVG 图标库替代全部 Emoji 图标；统一 slate/emerald/amber/red 语义色板；所有交互元素添加 focus ring 和 150ms 过渡动画；卡片 hover 阴影和 border 过渡；加载态使用 spinner 替代空白文本；消费者体验指标新增 6 项卡片式展示；店铺状态使用彩色圆点+文字标签；表单输入框统一 focus 样式。
- 指标数值格式化统一：所有小数指标保留 2 位小数，百分比类指标统一展示 `%` 后缀（评价得分排名、3分钟回复率、劣质率等）。
- 趋势变化颜色语义修正：上升 → 红色，下降 → 绿色。
- 代码全量 review 通过：141 项测试全部通过，所有 import 路径正确，DB 连接含 mutex + 文件锁 + 版本冲突检测，无严重 bug。
- 日报建议事项/关注店铺/摘要列：异常指标按行拆分，数值和关键词（未达标、异常、百分比）红色高亮；概览文本去冗余，关注理由改为计数量。
- 日报归档支持代码版本感知：`REPORT_CODE_VERSION` 纳入 sourceHash，逻辑变更时旧归档自动失效重新生成。
- 部署脚本增强：`deploy-windows.ps1` 自动安装 pnpm、4 级 Redis fallback、Docker 超时检测，`start-windows.ps1` 启动时自检 Redis；脚本语法自测 `test-scripts.ps1` 16 项全通过。
- 店铺配置：`PDD 店铺 ID` 改为 `店铺标识`，附带填写提示。

### 修复
- 单店详情页按需求A重排为“综合体验星级 / 售后数据 / 评价数据 & 客服数据 / 消费者体验指标”四个模块；修复百分比类字段展示缩放，补齐领航员未达标项下一星级标准展示。
- 综合体验星级采集改为识别真实星级卡片结构，提取 `店铺综合体验星级` 和 `较前1天` 星级变化，避免被顶部说明文案或重复标签干扰导致星级为空或误取。
- 评价数据模块补充展示 `店铺评价分排名` 的 `较前一天` 变化值；客服数据页正式接入巡店主链路，新增采集、入库和展示 `3分钟人工回复率`、`平均人工响应时长`。
- 指标趋势展示补齐：服务端按近 30 条巡店指标输出售后 4 核心指标（纠纷退款率、平台介入率、品质退款率、平均退款时长）和评价指标（店铺评价分排名、评价条数）的 `上升/下降/平稳` 结论；单店详情页展示趋势结论，并补齐消费者体验 6 项的平台 +/- 百分比展示。
- 领航员未达标项结构化：综合体验星级页新增表格行解析，按维度、考核指标、店铺表现、是否达标和下一星级标准生成 `pilotUnmetItems` JSON 快照入库；单店详情页展示未达标项明细，规则异常检测同步输出领航员未达标预警。
- 评价回复/举报严格限制为最近 72 小时内的新评价：评价行解析新增发布时间提取，回复和举报执行前统一校验 72 小时时间窗口；超过窗口、未来时间或缺失发布时间的候选仅记录为 skipped，不会进入真实写操作，降低历史评价被误回复/误举报风险。
- 评价数据页正式接入巡店指标主链路：新增 `/sycm/goods_quality/comment` 生产采集器，采集 `店铺评价分排名`、排名变化、近 30 天评价数和评价数变化；字段写入 `store_metrics` 并在单店详情页展示，旧库迁移同步补齐对应列。

### 修复
- 日报闭环从纯动态聚合升级为可落库归档：新增 `daily_reports` 表，`/api/reports/daily` 优先返回已归档日报；当所有 active 店铺当天巡店进入终态后自动生成/刷新 generated 快照，reviewed/published 版本保留历史内容，支持后续人工审核发布和历史版本对比。
- 互动隐藏链路改为真实拼多多【评价管理 / 查看全部互动】页面：页面筛选使用平台支持的“近30天内”，代码层仅处理近7日内且行内存在“隐藏评论”的公开互动；新增只读 `test:interactions` dry-run 报告，记录页面入口、时间窗口、行级按钮绑定和 AI/规则判断，避免继续误用“种草动态/删除动态”页面。

### 修复
- Worker AI Provider 新增 DeepSeek OpenAI-compatible 适配，并按 `AI_PROVIDER` 选择对应 API key，避免配置 `deepseek` 时误用旧 `ANTHROPIC_API_KEY`；已用根目录 `.env` 的 `deepseek-v4-pro` 做真实 `classifyReview` smoke test 通过。
- Worker 运行时自动向上查找 workspace 根目录并加载根 `.env`，避免 `pnpm --filter @pdd-inspector/worker ...` 误读 `packages/worker/.env` 的旧配置；provider factory 直接调用和 worker 启动均复用同一加载逻辑。
- AI 分类正式接入写操作主链路：差评举报话术选择改为调用 `classifyReview()`，互动隐藏判断改为调用 `judgeInteraction()`，AI 低置信或不可用时自动回退规则引擎；动作函数支持异步 AI 决策，同时保留 dry-run/real-run 安全开关、审计日志和截图记录。
- 报表聚合接口整理为 `report-service`：日报/周报/月报统一以巡店记录和指标快照聚合，日报保留失败/部分完成巡店，日期统计改为明确区间避免历史报表串入未来问题；消除 `reports.ts` 中循环全表查询、空 `where(and())` 和临时每 7 条切分周趋势的写法，周/月报改为一次预取数据后按店铺、日期和自然周聚合。
- AI/日报闭环落地最小可用路径：Worker 巡店完成后基于本店指标、写操作统计和规则异常结果生成 `inspection.summary`，AI 可用时增强摘要、不可用时自动回退模板且不阻塞主流程；新增 `/api/reports/daily` 并让周报/月报返回可读聚合摘要，Dashboard 展示日/周/月报摘要，单店详情展示最新巡店摘要；补充摘要格式化与报表聚合测试。
- 写操作生产安全闭环：Worker 默认进入 `dry-run` 且回复/举报/隐藏默认关闭，只有显式 `WORKER_ACTION_MODE=real-run` 并开启对应 `WORKER_ENABLE_*` 时才会真实提交；回复/举报/隐藏审计记录补充 `actionMode`、截图路径、失败原因和真实提交时间。
- 评价回复真实写入链路适配拼多多“快捷回复”弹窗：按评价行绑定 `回复/互动`，进入弹窗后填充 textarea 并点击弹窗内“回复”；已用 `WORKER_ACTION_MODE=real-run`、`WORKER_ENABLE_REPLY=true`、`WORKER_ACTION_LIMIT=1` 验证真实好评回复成功提交 1 条，其余候选按上限跳过。
- 消费者体验指标正式巡店采集补齐 HTML 箭头方向解析，`expBasicChange`、`expServiceBasicChange`、`expAttitudeChange`、`expProductChange`、`expShippingChange`、`expLogisticsChange` 不再因 `innerText` 丢失方向而写入 `null`；metrics dry-run 同步复用正式解析函数。
- Worker 在非 headless 模式遇到拼多多登录页时支持等待人工扫码/登录后继续巡店；登录仍未完成时同步将巡店记录标记为失败，避免记录长期停留在 running。Web 总览页和店铺配置页新增店铺状态定时刷新，避免后端已恢复 active 但页面仍显示“待登录”。
- 售后数据页补齐“整体情况”重点指标采集与展示：新增纠纷退款数/率、介入订单数、平台介入率、品质退款率、平均退款时长、成功退款订单数/金额/率、退货退款自主完结时长、退款自主完结时长；保留 `refundDuration/refundRate/disputeRate` 作为兼容映射。
- 根据真实拼多多商家后台 dry-run 回归确认指标口径：综合体验星级页的“评价得分排名 / 3 分钟回复率 / 成团-签收时效”不再写入传统 DSR；消费者体验页已采集总分、基础服务、服务态度、商品、发货、物流 6 项及 HTML 箭头方向变化；售后数据页已采集平均退款时长、成功退款率和纠纷退款率。
- Worker 指标采集校正综合体验星级、DSR、消费者体验与售后字段语义：新增领航员行业排名、平台求助率、3 分钟回复率、评价得分排名、积极评论率、签收时效、物流违规率、店铺活跃度等综合体验星级考核字段；传统 DSR 三项仅在真实 DSR 标签出现时写入；补充消费者体验分同行排名、基础服务/服务态度体验分及各体验分较前 7 日变化，并改从售后数据页解析平均退款时长、成功退款率和纠纷退款率。
- Worker 新增只读指标采集 dry-run 脚本，聚焦综合体验星级、消费者体验指标、售后数据、评价数据和客服数据，并输出原始文本、截图、JSON 与 Markdown 报告用于真实页面回归。
- Worker 日志输出在 stdout 写入失败时不再中断巡店进程，降低 Windows/pnpm 管道异常导致 Worker 崩溃的风险。
- sql.js 持久化改为按调用方 DB 实例保存，并在写盘时增加文件锁和磁盘版本冲突检测，避免多次 `getDb()` 或多进程写入时静默覆盖其它实例的更新。
- Worker 去除异常检测阶段的 `useAI || true` 硬编码条件，明确规则异常检测不依赖 AI 且始终运行，避免配置语义误读。
- 店铺 API 响应统一脱敏 `cookie` 和 `storageState`，避免前端列表、详情、创建或更新响应泄露登录凭证。
- 店铺新增/更新/删除和巡店触发接口在写入 sql.js 后立即调用 `saveDb()`，避免进程退出后丢失店铺配置或巡店记录；模板写接口已验证具备持久化调用。
- `/api/inspections` 列表接口返回巡店记录时同步附带指标快照和异常等级，Dashboard/单店详情可直接展示最新指标和预警状态。
- Scheduler 改用独立调度队列承载 repeatable job，巡店队列只接收真实店铺任务，避免 Worker 消费 `storeId=0` 的占位任务。
- 巡店队列任务携带 `inspectionId`，Worker 按巡店记录精确更新状态与写入明细，并在指标入库前持久化异常等级和 flags，避免同店多次巡店串单或 Dashboard 读不到异常。
- 恢复 monorepo 全量构建：补齐 Node/sql.js 类型、统一 Drizzle 版本、为 server/worker/scheduler 显式声明 Drizzle 依赖，并避免 BullMQ 直接接收 ioredis 实例导致的类型冲突。

### 优化
- Web 趋势图改用 ECharts core 按需加载折线图组件，移除生产构建中的 1MB+ 图表 chunk 警告并降低图表懒加载体积。

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
