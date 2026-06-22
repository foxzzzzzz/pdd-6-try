# Phase 2 单元测试报告

**日期**: 2026-06-22
**版本**: v0.2.0
**结果**: 175/175 通过 (100%)

## 测试结果

| 测试项 | 结果 | 详情 |
|--------|------|------|
| review row extracts createdAt | ✅ |  |
| review body row extracts createdAt | ✅ |  |
| review timestamp parses as CST | ✅ |  |
| review exactly inside 72 hour window is actionable | ✅ |  |
| review older than 72 hours is skipped | ✅ |  |
| review without parseable time is skipped | ✅ |  |
| comment page extracts score rank | ✅ |  |
| comment page extracts signed score rank change | ✅ |  |
| comment page extracts comment count | ✅ |  |
| comment page extracts signed comment count change | ✅ |  |
| pilot unmet parser keeps only unmet rows | ✅ |  |
| pilot unmet parser extracts dimension | ✅ |  |
| pilot unmet parser extracts metric | ✅ |  |
| pilot unmet parser extracts current value | ✅ |  |
| pilot unmet parser extracts target | ✅ |  |
| pilot unmet items produce anomaly warning | ✅ |  |
| pilot unmet anomaly flag includes target | ✅ |  |
| 队列任务携带 inspectionId | ✅ |  |
| 巡店任务携带归一化 operatorId | ✅ |  |
| 空运营 ID 不进入巡店任务 | ✅ |  |
| 运营 ID 会 trim 并拒绝空值 | ✅ |  |
| 运营店铺 profileKey 固定绑定 | ✅ |  |
| selector 健康检查低失败率保持 healthy | ✅ |  |
| selector 健康检查失败率达到阈值进入 degraded | ✅ |  |
| 模块降级判断使用最近 selector 健康事件 | ✅ |  |
| 健康模块不触发降级 | ✅ |  |
| 写操作 selector 降级时阻止 real-run | ✅ |  |
| 规则复核未过期不阻止高风险写操作 | ✅ |  |
| 规则复核过期会阻止高风险写操作 | ✅ |  |
| 缺少规则复核记录会阻止举报和隐藏 real-run | ✅ |  |
| 好评回复不依赖举报隐藏规则复核 | ✅ |  |
| SQL quote helper escapes single quotes | ✅ |  |
| 调度任务使用独立队列 | ✅ |  |
| 调度任务不伪造店铺 ID | ✅ |  |
| 40 店默认错峰预估可在 90 分钟窗口内完成 | ✅ |  |
| 40 店错峰间隔控制在 1-5 分钟之间 | ✅ |  |
| 串行巡店耗时超窗时错峰计划会暴露风险 | ✅ |  |
| 单店巡店不增加错峰 delay | ✅ |  |
| 审批动作使用独立队列 | ✅ |  |
| 审批动作任务携带单条候选动作 | ✅ |  |
| 登录绑定任务使用独立队列 | ✅ |  |
| 登录绑定任务携带归一化运营 ID | ✅ |  |
| 关闭 AI 时仍运行规则异常检测 | ✅ |  |
| 开启 AI 时仍运行规则异常检测 | ✅ |  |
| 异常指标写入 warning 等级 | ✅ |  |
| 异常 flags 序列化写入 | ✅ |  |
| 写操作默认 dry-run | ✅ |  |
| 写操作默认不提交回复 | ✅ |  |
| 写操作默认不提交举报 | ✅ |  |
| 写操作默认不提交隐藏 | ✅ |  |
| 开关开启但 dry-run 仍不提交回复 | ✅ |  |
| 开关开启但 dry-run 仍不提交举报 | ✅ |  |
| 开关开启但 dry-run 仍不提交隐藏 | ✅ |  |
| real-run 且开关开启才提交回复 | ✅ |  |
| real-run 举报默认需要审批不直接提交 | ✅ |  |
| real-run 隐藏默认需要审批不直接提交 | ✅ |  |
| real-run 支持限制最大写操作数 | ✅ |  |
| 举报审批通过后可以提交 | ✅ |  |
| 隐藏审批通过后可以提交 | ✅ |  |
| 好评回复达到每日上限后不提交 | ✅ |  |
| 真实写操作 worker 并发强制不超过 1 | ✅ |  |
| 真实写操作 worker 并发最小为 1 | ✅ |  |
| 巡店读操作 worker 并发默认强制不超过 1 | ✅ |  |
| 巡店读操作 worker 并发最小为 1 | ✅ |  |
| 好评回复默认间隔为 8-20 秒 | ✅ |  |
| 举报默认间隔为 20-60 秒 | ✅ |  |
| 互动隐藏默认间隔为 20-60 秒 | ✅ |  |
| 自定义间隔支持毫秒范围 | ✅ |  |
| 识别登录验证类风控信号 | ✅ |  |
| 识别操作频繁类风控信号 | ✅ |  |
| 识别处罚/账号安全类风控信号 | ✅ |  |
| 登录类风控将店铺标记为 pending_login | ✅ |  |
| 安全/频繁类风控将店铺标记为 paused | ✅ |  |
| 多店连续同类风控触发全局写熔断 | ✅ |  |
| 单店写操作失败率升高触发店铺熔断 | ✅ |  |
| 浏览器登录态恢复包含 localStorage origins | ✅ |  |
| 非法浏览器登录态返回 undefined | ✅ |  |
| 浏览器默认使用可见模式 | ✅ |  |
| 浏览器默认使用系统 Chrome channel | ✅ |  |
| 浏览器启动参数不隐藏 AutomationControlled | ✅ |  |
| 浏览器默认固定真实窗口大小 | ✅ |  |
| 浏览器默认不硬编码 userAgent | ✅ |  |
| 运营店铺 profile 目录稳定且不混用原始分隔符 | ✅ |  |
| 默认系统 Chrome 缺失时浏览器环境不可用 | ✅ |  |
| 显式 chromium 可跳过系统 Chrome 检查 | ✅ |  |
| 拟人化点击等待范围可配置且带随机抖动 | ✅ |  |
| 拟人化等待会修正非法范围 | ✅ |  |
| inspection config actionMode=real-run enables reply | ✅ |  |
| dry-run 审计状态为 skipped | ✅ |  |
| dry-run 审计记录 actionMode | ✅ |  |
| dry-run 审计记录截图路径 | ✅ |  |
| 需要审批的候选动作状态为 pending_approval | ✅ |  |
| real-run 提交审计状态为 success | ✅ |  |
| real-run 提交审计记录 submittedAt | ✅ |  |
| real-run 提交审计记录 executedAt | ✅ |  |
| 评价回复只从评价行提取星级 | ✅ |  |
| 评价回复只从评价行提取内容 | ✅ |  |
| 评价回复只从评价行提取订单标识 | ✅ |  |
| 非评价行不进入回复候选 | ✅ |  |
| 评价内容行提取4星较好评价 | ✅ |  |
| 评价内容行绑定订单标识 | ✅ |  |
| 评价内容行提取5星好评 | ✅ |  |
| 识别"太差了"为负面 | ✅ | shouldHide=true |
| 识别"垃圾"为负面 | ✅ | shouldHide=true |
| 识别"好评"为正常 | ✅ | shouldHide=false |
| 识别"还不错"为正常 | ✅ | shouldHide=false |
| 识别"质量差"为负面 | ✅ | 应该检测到"差" |
| 互动隐藏候选提取评论内容 | ✅ |  |
| 互动隐藏候选识别近7日 | ✅ |  |
| 近7日边界判断为 true | ✅ |  |
| 超过7日互动候选会被跳过 | ✅ |  |
| 已隐藏评论不进入隐藏候选 | ✅ |  |
| 广告识别 | ✅ | 匹配广告话术 |
| 辱骂识别 | ✅ | 匹配辱骂话术 |
| 假货识别 | ✅ | 匹配假货话术 |
| 默认话术 | ✅ | 回退默认话术 |
| 提取星级 4.5 | ✅ |  |
| 提取劣质率 0.08 | ✅ |  |
| 提取排名 35% | ✅ |  |
| 提取评分 1.8 | ✅ |  |
| 标签不存在返回 null | ✅ |  |
| 不把评价得分排名误写为 DSR 描述分 | ✅ |  |
| 不把3分钟回复率误写为 DSR 服务分 | ✅ |  |
| 不把签收时效误写为 DSR 物流分 | ✅ |  |
| 提取领航员行业排名 | ✅ |  |
| 提取平台求助率 | ✅ |  |
| 提取3分钟人工回复率 | ✅ |  |
| 提取在途订单退款时长 | ✅ |  |
| 提取退货签收后平均退款时长 | ✅ |  |
| 提取用户评价得分排名 | ✅ |  |
| 提取积极评论率 | ✅ |  |
| 提取成团签收时效 | ✅ |  |
| 提取物流综合违规处理率 | ✅ |  |
| 提取店铺活跃度 | ✅ |  |
| 带百分号的劣质率按小数落库 | ✅ |  |
| 提取消费者体验提升计划状态 | ✅ |  |
| 提取消费者体验总分 | ✅ |  |
| 提取基础服务体验分 | ✅ |  |
| 提取服务态度体验分 | ✅ |  |
| 提取商品服务体验分 | ✅ |  |
| 提取发货服务体验分 | ✅ |  |
| 提取物流服务体验分 | ✅ |  |
| 提取消费者体验同行排名区间 | ✅ |  |
| 提取消费者体验总分变化 | ✅ |  |
| 提取服务态度体验分变化 | ✅ |  |
| 提取基础服务体验分变化 | ✅ |  |
| 提取商品服务体验分变化 | ✅ |  |
| 提取发货服务体验分变化 | ✅ |  |
| 提取物流服务体验分变化 | ✅ |  |
| 无箭头变化率不猜方向 | ✅ |  |
| 从 HTML 箭头提取消费者体验总分变化 | ✅ |  |
| 从 HTML 箭头提取服务态度变化 | ✅ |  |
| 从 HTML 箭头提取基础服务变化 | ✅ |  |
| 从 HTML 箭头提取商品服务变化 | ✅ |  |
| 从 HTML 箭头提取发货服务变化 | ✅ |  |
| 从 HTML 箭头提取物流服务变化 | ✅ |  |
| 不把服务态度体验分误写为 DSR 服务分 | ✅ |  |
| 不把物流服务体验分误写为 DSR 物流分 | ✅ |  |
| 提取真实 DSR 描述相符分 | ✅ |  |
| 提取真实 DSR 服务态度分 | ✅ |  |
| 提取真实 DSR 物流服务分 | ✅ |  |
| 不把待商家处理数量误写为退款时长 | ✅ |  |
| 提取成功退款率为小数 | ✅ |  |
| 提取纠纷率为小数 | ✅ |  |
| 提取纠纷退款数 | ✅ |  |
| 提取介入订单数 | ✅ |  |
| 提取平台介入率 | ✅ |  |
| 提取品质退款率 | ✅ |  |
| 提取成功退款订单数 | ✅ |  |
| 提取成功退款金额 | ✅ |  |
| 提取退货退款自主完结时长 | ✅ |  |
| 提取退款自主完结时长 | ✅ |  |
| 变量填充-昵称 | ✅ |  |
| 变量填充-商品名 | ✅ |  |
| 多变量填充 | ✅ |  |

## 汇总
- ✅ 通过: 175
- ❌ 失败: 0
- 📊 通过率: 100%
