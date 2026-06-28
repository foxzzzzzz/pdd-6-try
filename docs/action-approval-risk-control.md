# 写操作审批与风控提醒设计

> 日期：2026-06-21  
> 状态：设计记录，供后续实现前 review  
> 范围：评价回复、差评举报、互动隐藏，以及后续可能扩展的其它真实写操作

## 背景

当前项目已经可以完成店铺健康度、评价、互动等巡店采集，并具备 `dry-run / real-run`、审计日志和截图等基础能力。考虑到拼多多商家后台写操作存在平台风控风险，评价回复、差评举报和互动隐藏都应作为写操作纳入统一风控闭环；其中差评举报和互动隐藏不建议在巡店过程中直接自动执行。

推荐定位是：系统先完成采集、AI/规则判断和候选建议生成，再由运营在 Web 端确认后触发真实执行。这样保留效率提升，同时把高风险写操作纳入人工可控、可审计、可熔断的闭环。

## 设计原则

1. **读写分离**
   - 巡店采集、指标分析、AI/规则判断可以自动完成。
   - 评价回复、差评举报、互动隐藏等真实写操作必须进入统一候选、审计和执行链路。

2. **默认不自动执行高风险动作**
   - 系统默认 `dry-run`，只生成候选建议和审计记录。
   - AI/规则默认只产出候选建议，不直接提交平台写操作。
   - 好评回复：可作为低风险动作小规模自动执行，但必须受限额、审计和熔断约束。
   - 差评举报：先审批后执行。
   - 互动隐藏：先审批后执行。

3. **提醒要高效**
   - 运营每天上午集中巡店，Web 首页必须一眼看到待处理数量。
   - 多店铺场景下应提供集中审批入口，避免运营逐店查找。

4. **证据必须完整**
   - 每条待确认动作都应关联原始文本、AI/规则理由、建议动作、截图、执行结果和失败原因。

## P1 写操作风控闭环

P1 的目标是先把所有写操作纳入“候选建议 → 人工确认或策略放行 → real-run 执行 → 审计回写”的统一闭环。重点不是提升自动执行比例，而是降低误操作、批量异常和风控扩散风险。

### 当前实现状态（2026-06-21）

已落地：

- `ActionSafety` 支持审批要求、已审批标记、每日限额和执行审计字段。
- 举报和互动隐藏默认需要审批；即使真实写操作开关未开启，巡店也会生成 `pending_approval` 候选动作。
- 好评回复仍可按低风险策略配置自动 real-run，但受 `real-run`、动作开关、审批配置和每日限额 gate 约束。
- 服务端新增 `/api/action-candidates` 候选动作查询接口，以及确认执行、跳过接口；确认后会创建 `pdd-action` 单条执行任务，并将候选状态更新为 `queued`。
- Worker 新增 `pdd-action` 专用消费者，按候选 ID 加载一条 `review_actions` 或 `interaction_actions` 记录，只执行该候选对应的回复、举报或隐藏动作。
- Web 新增 `/actions/review` 最小审批台，可筛选待确认动作、查看文本/建议/截图并确认放行或跳过。
- `review_actions` 和 `interaction_actions` 扩展 `approvedAt/operatorId/executedAt` 等审计字段。

待继续落地：

- Dashboard 顶部提醒条和侧栏动态角标。
- 按真实执行结果回填 `resultScreenshotPath` 独立字段。

### 写操作分级

| 动作 | 默认策略 | 是否允许自动执行 | 说明 |
| --- | --- | --- | --- |
| 4-5 星好评回复 | 生成回复候选，可按低风险策略自动执行 | 允许，小规模放开 | 必须限制每店每日数量，并记录话术、截图、结果和失败原因 |
| 1-3 星差评举报 | 生成举报候选，进入审批台 | 不允许默认自动执行 | 运营确认后才创建 real-run job |
| 负面互动隐藏 | 生成隐藏候选，进入审批台 | 不允许默认自动执行 | 运营确认后才点击行级【隐藏评论】 |

### 默认模式

生产默认行为应保持：

- Worker 默认 `WORKER_ACTION_MODE=dry-run`。
- 未显式开启动作开关时，不提交任何平台写操作。
- AI/规则只生成候选建议，包括建议动作、理由、话术或举报理由。
- 候选建议必须写入 DB，供 Web 审批台展示。
- real-run 只能处理已放行或已审批的候选动作。

### 人工确认路径

举报和隐藏的标准路径：

```text
巡店发现候选
→ AI/规则判断
→ 写入 pending_approval
→ Dashboard/审批台提醒运营
→ 运营查看文本、截图、理由和建议动作
→ 运营确认放行或跳过
→ 创建单条 real-run job
→ Worker 执行
→ 回写 success / failed / skipped
```

好评回复的低风险自动路径：

```text
巡店发现 4-5 星未回复评价
→ AI/规则生成回复候选
→ 校验时间窗口、店铺限额、全局限额、熔断状态
→ 满足条件时自动 real-run
→ 不满足条件时进入 pending_approval 或 skipped
```

### real-run 审计字段

每次真实执行必须至少记录：

| 字段 | 说明 |
| --- | --- |
| operatorId | 确认或触发执行的运营身份；系统自动放行时记录 system |
| storeId | 店铺 ID |
| actionType | reply / report / hide |
| sourceType | review / interaction |
| sourceId | 评价或互动唯一标识 |
| actionMode | dry-run / real-run |
| approvedAt | 人工确认时间，自动放行可为空或记录策略放行时间 |
| executedAt | Worker 实际提交时间 |
| screenshotPath | 执行前或候选截图 |
| resultScreenshotPath | 执行结果截图 |
| status | success / failed / skipped |
| failureReason | 失败原因 |

### 每店每日限制

建议先设置保守默认值，后续根据真实运营反馈再调整。

| 动作 | 默认上限建议 | 处理方式 |
| --- | --- | --- |
| 好评回复 | 每店每日 20 条 | 超过后进入待审批或 skipped |
| 差评举报 | 每店每日 5 条 | 必须人工审批，超过后禁止 real-run |
| 互动隐藏 | 每店每日 5 条 | 必须人工审批，超过后禁止 real-run |

全局还应设置同类动作总上限，避免多店铺同一时段集中执行。

### 审批台展示要求

Web 审批台每条候选动作必须展示：

- 店铺名称
- 动作类型
- 原始评价/互动内容
- 星级、时间、商品或订单信息
- AI/规则判断结果
- 建议动作
- 建议话术、举报理由或隐藏原因
- 截图缩略图和大图
- 当前状态和失败原因
- 操作按钮：确认执行、跳过、查看详情

### P1 验收标准

P1 完成时应满足：

1. 回复、举报、隐藏都被统一识别为写操作。
2. 默认 dry-run 下不会提交任何真实平台写操作。
3. AI/规则会生成候选建议并入库。
4. 举报和隐藏必须经运营审批后才 real-run。
5. 好评回复只有在低风险策略、限额和熔断校验通过时才可自动 real-run。
6. 每次 real-run 都有操作人、店铺、动作、时间、截图、结果和失败原因。
7. 每店每日动作上限生效。
8. Web 能展示待确认动作数量和候选详情。

## 推荐交互

### 1. Dashboard 顶部提醒

巡店完成后，Dashboard 顶部展示“待确认动作”提醒条。

示例：

```text
今日有 5 条写操作建议待确认：差评举报 3 条，互动隐藏 2 条，其中高风险 2 条。
```

提醒条应支持直接进入审批台。

### 2. 侧栏角标

侧栏新增“待确认动作”入口，并展示红点/数量角标。

示例：

```text
待确认动作 5
```

角标只统计 `pending_approval` 状态的候选动作。

### 3. 独立审批台

建议新增页面：

```text
/actions/review
```

审批台是运营处理写操作建议的主入口。推荐支持以下筛选：

- 全部
- 差评举报
- 互动隐藏
- 高风险
- 待确认
- 已确认
- 已跳过
- 执行失败

列表字段建议：

| 字段 | 说明 |
| --- | --- |
| 店铺 | 候选动作所属店铺 |
| 类型 | 差评举报 / 互动隐藏 / 好评回复 |
| 内容摘要 | 评价或互动文本摘要 |
| 时间 | 评价或互动发布时间 |
| AI/规则判断 | 分类、风险等级、置信度 |
| 建议动作 | 举报 / 隐藏评论 / 跳过 |
| 截图 | 缩略图，点击后查看大图 |
| 操作 | 确认执行 / 跳过 / 查看详情 |

### 4. 单店详情提醒

单店详情页展示该店铺的待确认动作面板。

适合运营按店铺复核时使用。面板不替代审批台，只作为单店上下文补充。

### 5. 截图查看

每条候选动作必须展示截图。

推荐交互：

- 列表展示截图缩略图。
- 点击后右侧抽屉展示大图。
- 抽屉中同时展示解析出的文本、星级、商品/订单信息、AI/规则理由和建议动作。
- 提供“打开原始页面”按钮，方便运营必要时回到拼多多后台人工复核。

## 状态流转

推荐状态机：

```text
detected
→ pending_approval
→ approved
→ queued
→ running
→ success / failed

pending_approval
→ skipped

failed
→ pending_approval / skipped
```

状态含义：

| 状态 | 含义 |
| --- | --- |
| detected | 巡店阶段识别到候选动作 |
| pending_approval | 等待运营确认 |
| approved | 运营已确认，等待创建执行任务 |
| queued | 已进入真实执行队列 |
| running | Worker 正在执行 |
| success | 执行成功 |
| failed | 执行失败，需要展示失败原因和截图 |
| skipped | 运营跳过或系统规则跳过 |

## 数据流

```text
巡店采集
→ AI/规则判断
→ 生成 action_candidates
→ Web 提醒运营
→ 运营确认或跳过
→ 创建 real-run action job
→ Worker 执行
→ 保存截图、结果、失败原因
→ Web 更新状态
```

## 候选动作字段建议

建议新增或扩展候选动作模型，核心字段如下：

| 字段 | 说明 |
| --- | --- |
| id | 候选动作 ID |
| storeId | 店铺 ID |
| inspectionId | 巡店记录 ID |
| sourceType | review / interaction |
| sourceId | 评价或互动唯一标识 |
| actionType | reply / report / hide |
| riskLevel | low / medium / high |
| confidence | AI/规则置信度 |
| contentSummary | 内容摘要 |
| rawText | 原始文本 |
| reason | AI/规则判断理由 |
| suggestedPayload | 建议话术、举报理由或隐藏原因 |
| screenshotPath | 候选动作截图 |
| originalUrl | 原始页面地址 |
| status | 状态机状态 |
| approvedBy | 确认人 |
| approvedAt | 确认时间 |
| executedAt | 执行时间 |
| resultScreenshotPath | 执行结果截图 |
| failureReason | 失败原因 |

## 提醒效率优先级

1. **Dashboard 顶部提醒条**
   - 适合每天上午打开系统后的第一眼提醒。

2. **侧栏角标**
   - 适合持续提示还有多少待确认项。

3. **独立审批台**
   - 适合多店铺集中处理，是最高效的主入口。

4. **单店详情面板**
   - 适合按店铺复核。

5. **企业微信/飞书通知**
   - 后续可扩展，只推高风险或超时未处理项，避免通知噪音。

## 执行限制

真实执行前应校验：

- `WORKER_ACTION_MODE=real-run`
- 对应动作开关已开启，例如 `WORKER_ENABLE_REPORT=true` 或 `WORKER_ENABLE_HIDE=true`
- 候选动作状态为 `approved`
- 候选动作仍在有效时间窗口内
- 店铺未处于风控熔断状态
- 当日店铺/动作类型未超过上限

## 真实验收待办

当前代码已完成候选审批、单条 `pdd-action` 入队和 Worker 单条执行闭环，但真实平台写操作仍需后续人工选择低风险样本进行验收。

待验收项：

1. 准备 1 条 `pending_approval` 好评回复候选，确认审批台点击“确认执行”后进入 `queued`。
2. 启动 action worker，设置 `WORKER_ACTION_CONCURRENCY=1`，并确认只消费 `pdd-action` 队列。
3. 执行 1 条真实好评回复，确认状态流为 `queued -> running -> success`。
4. 验证原始候选行回写 `submittedAt/executedAt/operatorId/screenshotPath`。
5. 验证失败场景可回写 `failed/errorMessage/screenshotPath`，且不会自动连续重试。
6. 差评举报和互动隐藏先只做 dry-run/审批流验证；真实执行需运营再次确认样本后单条验收。

验收结果待实测后补充：

| 日期 | 店铺 | 动作 | 候选 ID | 执行人 | 结果 | 备注 |
| --- | --- | --- | --- | --- | --- | --- |
| 待补充 | 待补充 | 待补充 | 待补充 | 待补充 | 待补充 | 待补充 |

## 操作节奏与间隔

操作间隔和一定随机性是需要的，但它的目标不是“绕过平台检测”，而是让系统行为贴近你们真实的低频人工巡店节奏，避免连续秒级提交、异常重试和多店并发写操作这类明显不合理特征。

## P2 全局节流与真实工作节奏

当前实现状态（2026-06-21）：

- 读巡店 worker 并发默认和上限均为 `1`；即使配置 `WORKER_CONCURRENCY=3`，代码也会夹到 `1`。
- 写操作 action worker 并发默认和上限均为 `1`。
- 同一进程内最多形成 1 个读巡店浏览器会话 + 1 个写操作浏览器会话，符合“最多 1-2 个活跃浏览器会话”的保守策略。
- 读操作和写操作已拆分为 `pdd-inspection` 与 `pdd-action` 两条队列；审批后的写操作只进入 `pdd-action`，不会和巡店采集混跑。
- 批量巡店入队支持错峰 delay，`/api/inspect-all` 和定时 scheduler 共用同一套计算逻辑，避免 30+ 店铺同时进入 waiting。
- 默认错峰参数：`INSPECTION_STAGGER_TARGET_MINUTES=90`、`INSPECTION_STAGGER_MIN_DELAY_MS=60000`、`INSPECTION_STAGGER_MAX_DELAY_MS=300000`、`INSPECTION_ESTIMATED_STORE_DURATION_MS=120000`。
- 40 家店按默认估算约 2 分钟/店时，预估可在 90 分钟目标窗口内完成；如果真实平均耗时超过约 2 分 15 秒，串行巡店本身会超出 9:30，系统会在 pacing 预估中标记 `expectedFinishBeforeTarget=false`。
- 写操作 job 默认 `attempts=1`，失败后不连续重试。
- 巡店 job 默认 `attempts=1`，可通过 `INSPECTION_JOB_ATTEMPTS` 和 `INSPECTION_JOB_BACKOFF_MS` 小心调整。
- Playwright 登录态改为原生 `storageState` 恢复，包含 cookies 和 localStorage/origins；巡店和 action 执行后都会刷新店铺 `storageState`，减少频繁重新登录。
- 浏览器默认使用可见模式 `headless=false`，只有显式 `WORKER_HEADLESS=true` 时才启用 headless。
- 浏览器默认使用系统 Chrome channel；生产环境要求当前机器安装 Google Chrome。`/api/system/browser` 会返回 Chrome 可用状态，Dashboard 缺 Chrome 时展示提醒并禁用“一键巡店”，后端触发巡店和 Worker 启动浏览器前也会阻止执行。
- `PLAYWRIGHT_CHROME_CHANNEL=chromium` 仅作为开发/测试回退，不作为生产默认策略。
- 浏览器固定窗口尺寸 `--window-size=1920,1080` 和 `viewport=1920x1080`，不再硬编码 UA，也不再使用 `--disable-blink-features=AutomationControlled`。
- 默认不再传入 `--no-sandbox` 或 `--disable-setuid-sandbox`；仅保留 `BROWSER_DISABLE_SANDBOX=true` 作为明确的本地调试兜底，不作为生产默认策略。
- 对有 `operatorId + storeId` 绑定的巡店和 action 执行，默认使用 persistent `userDataDir`，目录由 `profileKey` 稳定映射生成；同一 profile 打开前会创建 `.profile.lock`，关闭时释放，超过 `BROWSER_PROFILE_LOCK_STALE_MS` 的陈旧锁可自动清理。
- 只读巡店采集也按真实运营节奏降速：首个数据页前默认等待 `8-20s`，每次直接 URL 导航前等待 `3-8s`、导航后等待 `5-12s`，模块之间等待 `6-15s`；分别可通过 `WORKER_READ_FIRST_PAGE_DELAY_MS`、`WORKER_READ_NAV_BEFORE_DELAY_MS`、`WORKER_READ_NAV_AFTER_DELAY_MS`、`WORKER_READ_MODULE_GAP_MS` 调整。

仍需后续实测/观察：

- 如果未来部署多个 worker 进程，需要增加跨进程的 Redis 全局浏览器会话 semaphore，避免多个进程各自启动 1-2 个浏览器后叠加超限。
- 如果未来部署多个 worker 进程，仍需观察 profile lock 命中情况；同一运营-店铺 profile 被占用时会暂停当前任务，避免两个浏览器同时打开同一 profile。

建议默认策略：

- 同一时间最多 1 个 action worker 执行真实写操作；代码会将 `WORKER_ACTION_CONCURRENCY` 强制夹到最大 `1`。
- 同一店铺内写操作串行执行，不和读指标采集混在同一批高并发任务里。
- 每次真实写操作前后加入短间隔：好评回复默认 8-20 秒；举报/隐藏默认 20-60 秒。
- 不做固定秒数循环，使用小范围随机抖动；可通过 `ACTION_DELAY_REPLY_MS`、`ACTION_DELAY_REPORT_MS`、`ACTION_DELAY_HIDE_MS` 覆盖毫秒范围，例如 `10000-25000`。
- 每店每日写操作数量受限；举报和隐藏继续保持人工审批，不做无人值守批量执行。
- 写操作失败后不连续重试；失败进入审批台展示原因，由运营判断是否手动处理。
- 出现登录验证、操作频繁、安全验证、权限不足时，action executor 会将店铺标记为 `pending_login` 或 `paused`，暂停该店后续自动写操作。
- 上午集中巡店是正常业务节奏，多店巡店通过错峰入队 + 串行 worker 执行；若要从 8:00 到 9:30 完成 40 家店，需要持续观察真实平均巡店耗时是否低于约 2 分 15 秒/店。

## P3 风控哨兵模块

当前实现状态（2026-06-21）：

- 新增 `risk_events` 风控事件表，统一记录登录、二维码/短信/滑块/安全验证、权限不足、操作频繁、处罚/违规/账号安全提醒和写操作失败升高等事件。
- Worker 新增 `risk-sentinel`：巡店登录失败、action 执行失败、平台风控文案命中时，会写入风控事件并保存截图和 HTML。
- 巡店主流程会在登录后和关键采集/写操作扫描步骤后检测滑块/验证码/安全验证文案；命中后先暂停当前店铺并保存截图/HTML，非 headless 模式会等待运营手动处理，处理消失后刷新 `operatorId + storeId` 登录态并继续当前巡店，超时则停止该店铺巡店。
- 店铺级熔断：登录类事件将店铺标记为 `pending_login`；安全验证、操作频繁、权限不足等事件将店铺标记为 `paused`。
- 写操作失败率升高：同店铺累计 3 条 active `action_failure` 后，哨兵会暂停该店铺。
- 全局写熔断：多店连续出现同类 `security/rate_limit/permission` active 事件后，哨兵会创建 global 风控事件；action worker 执行前会检查全局写熔断，命中则不再执行真实写操作。
- Server 新增 `/api/risk/status`，返回 active 风控事件、受影响店铺和全局写熔断状态；`/api/risk/events/:id/resolve` 可将事件标记为已处理。
- Dashboard 顶部展示“全局写操作已熔断 / 存在店铺风控事件”提醒，列出最近 active 事件，提示运营人工接管。

当前边界：

- “通知运营人工接管”当前先以 Dashboard 风控提醒实现；企业微信/飞书/短信等外部通知后续作为 P3.1 扩展。
- 跨 worker 进程的全局 semaphore 和更细的失败率时间窗口可继续增强；当前先基于 active 风控事件做保守熔断。

## 风控熔断

以下情况应暂停店铺级写操作：

- 登录页跳出
- 二维码、短信、滑块、安全验证出现
- 权限不足
- 页面提示操作频繁
- 写操作失败率异常升高
- 后台出现处罚、违规或账号安全提醒

以下情况应暂停全局写操作：

- 多店连续出现同类安全验证
- 多店连续出现操作频繁提示
- 平台页面结构大面积变化
- Worker 执行结果无法确认成功或失败

熔断后必须：

- 保存截图和 HTML。
- Dashboard 展示风控状态。
- 通知运营人工接管。
- 禁止自动重试真实写操作。

## P4 账号和权限治理

### 多店铺登录绑定闭环（2026-06-21）

当前多店铺巡店不做账号密码自动输入，也不做跨店铺自动切号；系统通过“运营 ID + 店铺 ID”固定绑定一个 persistent browser profile，让运营在可见 Chrome 中完成一次人工登录，后续巡店复用该登录态。

已落地：

- 新增 `pdd-login-bind` 独立队列，登录绑定和巡店、写操作分队列执行。
- 新增 `/api/stores/:id/login-bind`，由店铺配置页触发绑定、重新登录或登录态测试。
- Worker 新增 login-bind 消费者，并发固定为 1，只打开可见 Chrome 等待人工登录，不采集数据、不执行写操作。
- 登录成功后写回 `operator_store_sessions.storage_state/status/last_login_at`，同时将店铺状态更新为 `active`。
- 登录未完成或超时时，将对应运营-店铺 session 保持为 `pending_login`，记录风控登录事件和截图/HTML 证据。
- 店铺配置页要求填写运营 ID，展示 profileKey、session 状态和最近使用时间；未绑定店铺禁用单店巡店按钮。

默认交互：

1. 运营在【店铺配置】新增店铺，填写店铺名、PDD 店铺 ID、运营 ID。
2. 点击【登录绑定】，系统入队 `pdd-login-bind`，Worker 打开固定 profile 的可见 Chrome。
3. 运营在浏览器中扫码或完成平台要求的登录验证。
4. 登录成功后店铺变为“已绑定”，后续【巡店】和【一键巡店】只处理 `active` 店铺。
5. 如果平台要求重新登录，点击【重新登录】或【测试登录态】刷新同一个运营-店铺绑定。

边界：

- 不跨运营、跨店铺混用 profile。
- 不自动处理二维码、短信、滑块或安全验证。
- 不在登录绑定任务中执行采集或写操作。
- 登录异常只暂停相关运营-店铺绑定；无运营身份的旧流程才沿用店铺级 `pending_login/paused`。

当前实现状态（2026-06-21）：

- 新增 `operators` 表，用于记录运营身份；当前先以运营 ID 作为最小身份标识，后续可接入正式登录用户体系。
- 新增 `operator_store_sessions` 表，将 `operatorId + storeId` 固定绑定到一个 `profileKey` 和一份 Playwright `storageState`，避免不同运营或不同店铺混用同一登录态。
- 巡店 job 支持携带 `operatorId`。Worker 登录时优先读取 `operator_store_sessions.storage_state`，没有绑定态时才 fallback 到店铺级 `stores.storage_state`；登录成功后同时刷新当前运营-店铺绑定。
- 审批台确认/跳过写操作时必须填写 `operatorId`，Server 不再默认写成 `operator`；`pdd-action` 单条执行 job 会带上真实 `operatorId`。
- action worker 执行真实写操作时使用 `operatorId + storeId` 的绑定登录态，并在执行后刷新该绑定的 `storageState`。
- `risk_events` 新增 `operator_id`。带 `operatorId` 的登录、安全验证、操作频繁、权限不足等风险事件，优先暂停对应 `operator_store_sessions`，不直接暂停整个店铺，避免牵连同店铺下其他运营。
- 新增 `/api/operator-sessions` 只读接口，可查看运营、店铺、`profileKey`、session 状态、最近登录和最近使用时间，便于后续做账号/profile 绑定配置页。

默认治理规则：

- 每个运营使用自己的拼多多子账号。
- 每个运营-店铺组合拥有固定 `profileKey`、独立 `storageState` 和独立 persistent browser profile。
- 后台读数据巡店可 fallback 到店铺 owner 或 `system`，但真实写操作必须由审批台传入明确 `operatorId`。
- 登录异常只暂停相关运营-店铺绑定；未绑定运营身份的老流程才沿用店铺级 `pending_login/paused`。
- 写操作审计继续记录 `operatorId/storeId/actionType/sourceId/screenshot/result/errorMessage`。

当前边界：

- 还没有完整的 Web 账号管理页；目前审批台提供运营 ID 输入，后端提供只读绑定查询接口。
- 当前已默认启用磁盘级 persistent browser profile，并使用 `.profile.lock` 做同 profile 互斥；profile 数据目录默认在 `data/browser-profiles`，不要提交到 git。
- 正式用户登录体系接入后，应把审批台手输 `operatorId` 改为从登录态读取，避免人工填错。

## P5 选择器和页面变更监控

当前实现状态（2026-06-21）：

- 新增 `selector_health_events` 表，记录模块、检查项总数、失败数、失败率、截图路径、HTML 路径和详细检查结果。
- 新增只读 smoke test：`pnpm test:selector-health`。脚本只访问关键页面，不做回复、举报、隐藏等写操作；每个页面保存截图和 HTML，并写入健康事件。
- 新增 `/api/selector-health/status`，返回每个模块最近一次 selector 健康状态和 degraded 模块列表。
- Dashboard 顶部新增“页面采集健康异常”提醒，展示 degraded 模块、失败率和最近检查时间。
- Worker 巡店前会读取最近 24 小时 selector 健康事件；如果某模块最近状态为 `degraded`，只跳过对应模块，不影响其它模块。
- action worker 执行真实写操作前会检查 `reviews/interactions` selector 健康状态；如果 degraded，即使候选已审批，也不会点击页面执行 real-run。

默认模块映射：

| 模块 | 页面 | 降级影响 |
| --- | --- | --- |
| `pilot_mall` | 服务数据 / 综合体验星级 | 跳过综合星级、领航员明细采集 |
| `experience` | 服务数据 / 消费者体验指标 | 跳过消费者体验分采集 |
| `refunds` | 服务数据 / 售后数据 | 跳过售后核心指标采集 |
| `comment` | 服务数据 / 评价数据 | 跳过评价数据采集 |
| `reviews` | 商品管理 / 评价管理 | 跳过评价回复/举报候选生成，并阻止对应 real-run |
| `interactions` | 评价管理 / 查看全部互动 | 跳过互动隐藏候选生成，并阻止对应 real-run |

默认阈值：

- 单模块检查项失败率 `>= 30%` 判定为 `degraded`。
- Worker 默认只参考最近 24 小时的健康事件；没有健康事件时不主动降级。
- 降级是模块级，不是全局级；售后页异常不会影响评价页或消费者体验页。

日常操作建议：

1. 每天正式巡店前先跑 `pnpm test:selector-health`。
2. 如果 Dashboard 出现页面采集健康异常，先查看 smoke 报告、截图和 HTML。
3. 确认是页面结构变化后，维护对应 selector 或解析逻辑。
4. 修复后重新跑 `pnpm test:selector-health`，健康状态恢复后 Worker 会自动恢复对应模块。

当前边界：

- 当前还没有 Web selector 配置维护页，先以只读 smoke test + Dashboard 提醒 + Worker 降级闭环为主。
- HTML/截图保留策略目前依赖本地 `data/selector-health` 目录，后续可增加保留天数和异常长期归档。
- 当前检测以关键文本和按钮存在性为主，后续可扩展到字段解析值范围、表格行级绑定和按钮点击前 dry-run 验证。

## P6 规则复核机制

当前实现状态（2026-06-21）：

- 新增 `rule_reviews` 表，记录规则类别、状态、最近复核时间、下次复核时间、结论、证据路径和责任人。
- 新增 `/api/rule-reviews/status` 查询接口，Dashboard 顶部展示“规则复核已过期”提醒。
- 新增 `/api/rule-reviews/:category` 更新接口，运营完成人工复核后可写入状态、结论、证据路径和下次复核时间。
- action worker 执行真实 `report/hide` 前会检查规则复核状态；只要任一高风险规则未通过或已过期，就暂停本次 real-run。
- 巡店阶段如果规则复核过期，举报/隐藏会继续生成候选，但强制保持审批/非直接提交状态，不做无人值守 real-run。

每月复核清单：

| 类别 | category | 复核内容 | 影响模块 |
| --- | --- | --- | --- |
| 评价管理规则 | `review_management` | 评价回复、举报入口、互动入口、近 72 小时评价处理边界 | 评价回复、差评举报、互动隐藏 |
| 举报/隐藏规则 | `report_hide` | 差评举报话术、举报理由、隐藏评论适用边界、是否需要人工确认 | 差评举报、互动隐藏 |
| 商家后台账号安全规则 | `account_security` | 子账号权限、登录验证、操作频繁、安全提醒、处罚提示 | 全部写操作 |
| 自动化工具/第三方工具限制 | `automation_tools` | 平台对自动化、批量操作、第三方工具的限制说明 | 全部自动化流程 |
| 店铺推广/客服/评价相关协议 | `service_agreements` | 评价、客服、推广相关协议变化；相似回复、批量处理边界 | 回复、举报、隐藏、后续推广模块 |

复核记录要求：

- 责任人：完成复核的运营或管理员。
- 证据：后台截图、协议链接、规则中心截图或内部复核记录路径。
- 结论：`继续执行 / 调整策略 / 暂停模块`。
- 下次复核时间：默认 30 天后；平台明显规则变化时应立即复核并更新。

默认安全策略：

- `status !== approved` 视为不可通过。
- `nextReviewAt` 为空或早于当前时间，视为过期。
- 规则复核过期时，好评回复不直接受阻，但差评举报和互动隐藏 real-run 必须暂停。
- 系统只做提醒、记录和拦截，不自动解释平台规则；规则含义仍由运营人工确认。

## MVP 实现建议

第一阶段只做最小闭环：

1. 巡店后生成 `pending_approval` 候选动作。
2. Dashboard 展示待确认数量。
3. 新增 `/actions/review` 审批台。
4. 审批台展示文本、截图、AI/规则理由和建议动作。
5. 支持“确认放行”和“跳过”。
6. 确认后创建单条 real-run job。
7. Worker 执行后写回状态、截图和失败原因。

第二阶段再补：

- 批量确认低风险项。
- 快捷键处理。
- 企业微信/飞书通知。
- SLA 超时提醒。
- 误判反馈反哺规则和 AI prompt。

## 不建议做的事

- 不自动绕过验证码、短信、滑块或安全验证。
- 不使用代理池、反指纹或 CDP 隐藏方案。
- 不对差评举报、互动隐藏做无人值守批量执行。
- 不在失败后连续重试真实写操作。

## 后续 review 重点

实现前需要确认：

1. 候选动作是否单独建表，还是复用现有 action 表增加审批状态。
2. 审批台是否需要登录和操作人身份。
3. 店铺级、动作级每日上限的默认值。
4. 好评回复是否进入审批台，还是保留现有低风险 real-run 策略。
5. 企业微信/飞书通知是否作为第一阶段范围。
