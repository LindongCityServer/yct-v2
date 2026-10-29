# 统计与功能度量方案

更新时间：2026-10-29

本文定义雨城通 v2（YCT）与 ldpass 共用的功能度量体系：统计什么、怎么采、存在哪、怎么算、在哪看。首期目标是回答"有多少人在用、哪些功能被用、用得成不成功"，不做通用 BI。

## 1. 目标与边界

### 1.1 要回答的问题

| 层次 | 问题                   | 首期指标                         |
| ---- | ---------------------- | -------------------------------- |
| 规模 | 有没有人用             | DAU / WAU、会话数                |
| 采用 | 哪些功能被用、用得多深 | 功能渗透率、人均会话深度         |
| 效果 | 用了之后成功了吗       | 任务成功率、错误率、审核积压时长 |

### 1.2 明确不做

- 不做页面热图、会话录屏、广告归因。
- 不做实时大屏，指标按自然日聚合，允许 T+1。
- 不采集用户输入内容：电报纸正文、投稿正文、搜索词原文（只存归一化后的哈希或词频，见 6.4）。
- 不替代现有审计体系。物料预览/下载审计（`apps/web/app/api/admin/audit-events/route.ts`）继续独立存在，统计侧只引用其计数。

## 2. 现状盘点

### 2.1 已有能力

| 能力            | 位置                                            | 说明                                                                      |
| --------------- | ----------------------------------------------- | ------------------------------------------------------------------------- |
| 领域事件契约    | `packages/contracts/src/events.ts`              | 150+ 事件，覆盖投稿、审核、发布、购票、乘车码、材料导出、电报纸等业务节点 |
| 事件总线        | `packages/event-bus/src/index.ts`               | 进程内 `InMemoryEventBus`，订阅即扩展                                     |
| 事件落库        | `apps/web/lib/app-event-bus.ts`                 | `emitAppEvent` 先入 outbox 再分发                                         |
| outbox 存储     | `apps/web/lib/event-outbox-store.ts`            | JSON 快照，`queued/dispatched/failed` 状态，支持重放                      |
| 后台查询        | `apps/web/app/api/admin/audit-events/route.ts`  | 按类型、实体、操作者、关键词检索                                          |
| 后台概览        | `apps/web/components/admin-home-overview.tsx`   | 只有待审核数量，无使用量                                                  |
| ldpass 对应能力 | `ldpass/packages/database/prisma/schema.prisma` | `OutboxEvent`、`AuditLog` 表；后台同样只有待办计数                        |

### 2.2 三个必须先解决的硬伤

| 问题                 | 现状                                               | 影响                                     | 处理方式                                                      |
| -------------------- | -------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------- |
| 无身份维度           | `createYctEvent` 把 `profileId` 写死为 `'default'` | UV、留存、渗透率、漏斗全部无法计算       | 引入 `client_id` / `session_id` / `user_id` 三元组，见第 5 节 |
| 看不到"想做但没做成" | 领域事件只在成功路径产生                           | 搜索无结果、路线规划放弃、导出失败无记录 | 新增前端行为事件，见 6.3                                      |
| 存储不适合分析       | outbox 每次写入全量重写 JSON 文件                  | 事件量上去后写入成本呈二次增长           | 分析事件走独立存储，不复用 outbox，见第 7 节                  |

## 3. 总体架构

```text
                     YCT                                    ldpass
        ┌──────────────────────────┐          ┌──────────────────────────┐
        │ 前端 SDK                  │          │ 前端 SDK                  │
        │ 服务端事件监听器           │          │ 服务端事件监听器           │
        └────────────┬─────────────┘          └────────────┬─────────────┘
                     │ 批量上报 / 直接写入                    │
        ┌────────────▼─────────────┐          ┌────────────▼─────────────┐
        │ analytics.db (SQLite WAL) │          │ analytics.db (SQLite WAL) │
        └────────────┬─────────────┘          └────────────┬─────────────┘
                     │ 单实例日聚合                          │ 单实例日聚合
        ┌────────────▼─────────────┐          ┌────────────▼─────────────┐
        │ metrics-daily.json        │          │ metrics-daily.json        │
        └────────────┬─────────────┘          └────────────┬─────────────┘
                     │                                      │
        ┌────────────▼─────────────┐          ┌────────────▼─────────────┐
        │ YCT 后台「数据概览」       │          │ ldpass 后台「本项目」      │
        └──────────────────────────┘          └────────────┬─────────────┘
                                                           │ 只读对方日聚合
                                              ┌────────────▼─────────────┐
                                              │ ldpass「跨项目总览」       │
                                              └──────────────────────────┘
```

原则：

1. **数据分治**：谁的业务数据谁存，不跨进程写同一个库。
2. **产物汇总**：跨项目只交换日聚合 JSON，不互相查原始事件。
3. **故障隔离**：任一项目的看板不依赖对方在线。

## 4. 度量模型

### 4.1 首期五个指标

| 指标         | 定义                     | 计算口径                                                                     | 数据来源                  |
| ------------ | ------------------------ | ---------------------------------------------------------------------------- | ------------------------- |
| DAU          | 当日活跃用户数           | 当日至少产生 1 个非系统事件的去重 `client_id`；登录用户额外按 `user_id` 去重 | 事件表                    |
| 功能渗透率   | 某功能被多少活跃用户使用 | 周期内使用该功能的去重用户数 ÷ 同期活跃用户数                                | `feature.used` + 活跃口径 |
| 任务成功率   | 链路成功完成的比例       | 周期内 `*_succeeded` 事件数 ÷ `*_started` 事件数（按链路分别计算）           | 链路事件对                |
| 错误率       | 会话中出现错误的比例     | 周期内含 `error.client` 的会话数 ÷ 总会话数                                  | `error.client`            |
| 审核积压时长 | 从提交到审核完成的时间   | 周期内完成审核的记录，`reviewed_at - submitted_at` 的 P50 与 P90             | 领域事件时间差            |

### 4.2 口径约定

- **时区**：统一按 `Asia/Shanghai` 自然日切分，不按浏览器本地时间。
- **活跃**：排除 `actor.type = 'system' | 'admin' | 'adapter'` 的事件，避免后台任务抬高活跃数。
- **功能清单**：固定枚举，不允许前端自行拼字符串；未知功能落入 `unknown` 并单独告警。
- **比率分子分母**：同一链路必须同周期、同维度口径，禁止跨周期混算。
- **展示精度**：比率保留一位小数，人数取整；样本量低于 30 的比率标注"样本不足"。

### 4.3 首期功能枚举

| 领域     | 功能标识                                                              | 说明                               |
| -------- | --------------------------------------------------------------------- | ---------------------------------- |
| 地图     | `map.browse` / `map.poi_view` / `map.search` / `map.route_plan`       | 浏览、点位详情、附近搜索、路线估算 |
| 出行     | `travel.line_query` / `travel.schedule_query` / `travel.journey_plan` | 线路、班次、行程规划               |
| 票务     | `ticket.order` / `ticket.checkin`                                     | 下单、检票                         |
| 乘车码   | `ridecode.session`                                                    | 乘车码会话                         |
| 物料     | `material.preview` / `material.export` / `material.import`            | 预览、导出、导入线网               |
| 内容     | `content.view`                                                        | 运营内容浏览                       |
| 服务入口 | `service.open`                                                        | 常用入口点击                       |
| 电报纸   | `telegraph.print` / `telegraph.download`                              | 打印、下载素材                     |
| 投稿     | `poi.submit` / `poi.image_upload`                                     | 点位投稿                           |
| 设置     | `settings.locale` / `settings.push`                                   | 语言、推送开关                     |

## 5. 身份体系

### 5.1 三类标识

| 标识         | 生成方式                                                    | 生命周期         | 用途                         |
| ------------ | ----------------------------------------------------------- | ---------------- | ---------------------------- |
| `client_id`  | 服务端首次访问下发 cookie（`yct_cid`），同时写 localStorage | 长期（1 年滚动） | 匿名 UV、留存                |
| `session_id` | 30 分钟无事件后重建                                         | 一次访问         | 会话数、会话深度、错误率分母 |
| `user_id`    | 登录后取 `ldpassUserId`                                     | 跟随账号         | 登录用户口径、跨项目关联     |

### 5.2 合并规则

- 同一 `client_id` 登录后，历史匿名事件**不回溯改写**，但后续查询按 `user_id` 归并展示，避免"登录当天 UV 翻倍"。
- 跨项目只通过 `user_id` 关联；未登录用户不做跨项目合并。
- 两个项目已确认同级：`yct.shangxiaoguan.top` 与 `ldpass.shangxiaoguan.top`。`client_id` 统一写入父域 cookie，实现跨子域共享：

  ```text
  Set-Cookie: shxg_cid=<uuid>; Domain=.shangxiaoguan.top; Path=/; Max-Age=31536000; Secure; SameSite=Lax
  ```

  - cookie 名使用中性前缀（如 `shxg_cid`），不要用 `__Host-` 前缀，该前缀禁止指定 Domain。
  - `localStorage` 按 origin 隔离，两个子域不共享，只作为 cookie 不可用时的本地兜底。
  - 读取顺序：cookie → localStorage → 新生成并双写。

- `profileId` 保留字段但不再写死 `'default'`，取值优先级：`user_id` → `client_id` → `'anonymous'`。

### 5.3 与现有代码的关系

`createYctEvent`（`apps/web/lib/app-event-bus.ts`）需要新增身份上下文参数。为避免改动全部调用方，建议在事件总线外层做一次"身份注入"：`emitAppEvent` 从请求上下文中解析三元组并补齐，业务 Service 不用感知。这与现有"Service 只管业务、副作用靠监听"的约定一致。

## 6. 事件规范

### 6.1 公共字段

所有分析事件必须携带：

| 字段             | 类型                | 说明                               |
| ---------------- | ------------------- | ---------------------------------- |
| `event_id`       | string              | 客户端 UUID，用于幂等去重          |
| `event_name`     | string              | 见 6.2 命名规则                    |
| `schema_version` | number              | 规范版本，首期 `1`                 |
| `project`        | `'yct' \| 'ldpass'` | 来源项目                           |
| `env`            | string              | `production` / `staging` / `local` |
| `occurred_at`    | ISO string          | 客户端时间                         |
| `received_at`    | ISO string          | 服务端接收时间，切天以此为准       |
| `client_id`      | string              | 见第 5 节                          |
| `session_id`     | string              | 见第 5 节                          |
| `user_id`        | string?             | 登录后填充                         |
| `route`          | string              | 页面路径，去除查询参数中的敏感值   |
| `locale`         | string              | 当前语言                           |
| `embed_host`     | string?             | `fluentos` / `kjos` / 空           |
| `release`        | string              | 构建版本号                         |
| `properties`     | object              | 事件私有字段                       |

### 6.2 命名规则

- 格式：`{domain}.{object}.{action}`，全小写 snake_case，例如 `material.export.succeeded`。
- `action` 用固定词表：`started` / `succeeded` / `failed` / `viewed` / `used` / `clicked`。
- 禁止在事件名里拼业务 ID；ID 放 `properties`。

### 6.3 事件来源划分

| 来源                   | 产生方式                              | 覆盖范围                                             |
| ---------------------- | ------------------------------------- | ---------------------------------------------------- |
| 领域事件（已有）       | 复用 `YctEventType`，由分析监听器转换 | 审核、发布、订单、乘车码授权、材料导出请求等成功路径 |
| 前端行为事件（新增）   | SDK 上报                              | 页面浏览、功能入口点击、搜索、计划放弃、客户端异常   |
| 服务端指标事件（新增） | API 中间件                            | 接口耗时、5xx、限流命中                              |

新增事件首期清单：

| 事件名                    | 触发点               | 关键属性                          |
| ------------------------- | -------------------- | --------------------------------- |
| `app.session.started`     | 会话建立             | `embed_host`, `locale`            |
| `page.viewed`             | 路由变化             | `route`, `referrer_kind`          |
| `feature.used`            | 功能入口被实际使用   | `feature`, `surface`              |
| `map.search.performed`    | 搜索执行             | `keyword_length`, `result_count`  |
| `map.route.failed`        | 路线估算无结果或报错 | `reason`                          |
| `material.export.started` | 点击导出             | `template_id`, `source_kind`      |
| `error.client`            | 全局异常捕获         | `kind`, `message_digest`, `route` |
| `error.api`               | 接口失败             | `endpoint`, `status`              |

领域事件到分析事件的映射，首期只做以下六组，其余按需增加：

| 领域事件                                         | 分析事件                        | 说明       |
| ------------------------------------------------ | ------------------------------- | ---------- |
| `TicketOrderCreated`                             | `ticket.order.started`          | 下单发起   |
| `TicketIssued`                                   | `ticket.order.succeeded`        | 出票成功   |
| `TicketOrderCancelled` / `TicketRefundCompleted` | `ticket.order.failed`           | 失败或退票 |
| `MaterialExportRequested`                        | `material.export.started`       | 导出请求   |
| `MaterialPreviewGenerated`                       | `material.preview.succeeded`    | 预览成功   |
| `PoiSubmitted` / `PoiReviewed`                   | `poi.submit.*` / `poi.review.*` | 投稿与审核 |

### 6.4 隐私红线

禁止采集：

- 电报纸正文、收件人姓名与地址、中文电码内容。
- 玩家精确坐标；如需位置特征，只保留区域 ID 或降低到两位小数。
- 完整 IP；只保留现有属地字段。
- 密码、token、cookie、授权链接。
- 搜索关键词原文；只保留长度、结果数，或对关键词做不可逆摘要。

## 7. 存储选型

### 7.1 结论

线上为单机多进程、Node 22+，选 **SQLite（WAL 模式）**，文件放在 `.yct-data/analytics/analytics.db`，通过 `runtime-config` 新增 `analyticsStorePath` 配置。

理由：

| 方案             | 多进程安全     | 分析查询          | 依赖                 |
| ---------------- | -------------- | ----------------- | -------------------- |
| 复用 outbox JSON | 否（全量重写） | 否（无索引）      | 无                   |
| 进程分片 JSONL   | 是             | 差（全量扫描）    | 无                   |
| SQLite WAL       | 是（多读单写） | 好（索引 + 聚合） | Node 22.5+ 或 Prisma |
| PostgreSQL       | 是             | 最好              | 需额外服务           |

ldpass 已经在生产使用 Prisma + SQLite（`ldpass/packages/database/prisma/schema.prisma`），这条路在宝塔单机环境已被验证。

### 7.2 Node 能力验证

`node:sqlite` 自 Node 22.5 提供，部分 22.x 版本仍需 `--experimental-sqlite` 标志。上线前在服务器执行：

```powershell
node -e "const { DatabaseSync } = require('node:sqlite'); console.log('ok')"
```

- 输出 `ok`：使用内置 `node:sqlite`，零依赖。
- 报错或需要标志：回退到 Prisma（与 ldpass 一致），只改存储实现，聚合与展示层不变。

因此存储层必须先定义接口 `AnalyticsStore`，实现可替换：

```ts
export interface AnalyticsStore {
  append(events: AnalyticsEvent[]): Promise<void>;
  queryDailyMetrics(day: string): Promise<DailyMetrics | null>;
  saveDailyMetrics(metrics: DailyMetrics): Promise<void>;
  purgeBefore(day: string): Promise<number>;
}
```

### 7.3 表结构

```sql
CREATE TABLE analytics_event (
  event_id      TEXT PRIMARY KEY,
  event_name    TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  project       TEXT NOT NULL,
  env           TEXT NOT NULL,
  occurred_at   TEXT NOT NULL,
  received_at   TEXT NOT NULL,
  day           TEXT NOT NULL,           -- Asia/Shanghai 自然日 YYYY-MM-DD
  client_id     TEXT NOT NULL,
  session_id    TEXT NOT NULL,
  user_id       TEXT,
  route         TEXT,
  locale        TEXT,
  embed_host    TEXT,
  release       TEXT,
  properties    TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_event_day_name ON analytics_event(day, event_name);
CREATE INDEX idx_event_client_day ON analytics_event(day, client_id);
CREATE INDEX idx_event_session ON analytics_event(session_id);

CREATE TABLE analytics_metric_daily (
  day        TEXT NOT NULL,
  metric     TEXT NOT NULL,
  dimension  TEXT NOT NULL DEFAULT '',
  value      REAL NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (day, metric, dimension)
);
```

### 7.4 并发写入与批处理

当前线上为单进程（见第 14 节），仍按可并发场景配置，避免后续扩容返工。

- 开启 `PRAGMA journal_mode=WAL`、`PRAGMA busy_timeout=5000`、`PRAGMA synchronous=NORMAL`。
- 写入按批次（100 条或 1 秒）合并为单事务，降低锁竞争。
- 冲突重试采用指数退避，最多 3 次；失败事件写本地兜底队列，下次启动补传。
- 定时清理任务只在聚合脚本中执行，不在请求路径触发。

## 8. 聚合任务

### 8.1 执行方式

**本地开发**：`pnpm analytics:aggregate`，直接运行 `scripts/aggregate-analytics.ts`。

**生产环境**：两个项目都只部署 standalone 产物，仓库里的 `scripts/` 与 `packages/` 不存在，因此聚合入口放在应用内，由计划任务通过内部令牌触发：

```powershell
Invoke-RestMethod -Method Post `
  -Uri http://127.0.0.1:3300/api/internal/analytics/aggregate `
  -Headers @{ Authorization = "Bearer $env:YCT_INTERNAL_TASK_TOKEN" } `
  -ContentType "application/json" `
  -Body '{"days":3,"purge":true}'
```

也可使用 `scripts/run-web-analytics-aggregate.ps1`（`pnpm web:analytics:aggregate`）。任务**不跟随 Web 进程启动**，每天由系统计划任务触发一次，避免与请求路径争抢写入。

### 8.2 幂等设计

聚合结果以 `(day, metric, dimension)` 为主键做 `INSERT OR REPLACE`，重复执行只覆盖不累加，因此不需要分布式锁。这是优先于加锁的方案。

### 8.3 补算与保留

- 每次聚合默认重算最近 3 天，覆盖延迟上报。
- 原始事件保留 90 天，超期按 `day` 批量删除；日聚合指标永久保留。
- 清理前先确认对应日期的聚合结果已生成，否则跳过并在日志中告警。

## 9. 采集接入

### 9.1 前端 SDK

`apps/web/lib/analytics-client.ts`，职责：

- 生成并持久化 `client_id`、维护 `session_id`。
- 队列 + 批量上报（阈值 20 条或 5 秒），页面隐藏时用 `sendBeacon` 冲刷。
- 失败重试使用同一 `event_id`，由服务端幂等去重。
- 开发环境默认不发送，避免污染生产数据；通过 `env` 字段区分。
- 全局捕获 `error` 与 `unhandledrejection`，转成 `error.client`。

### 9.2 采集接口

`apps/web/app/api/analytics/collect/route.ts`：

- `POST` 接收批量事件，单次上限 100 条、单条 `properties` 上限 2KB。
- 校验：`event_name` 在白名单内、字段类型合法、`occurred_at` 与 `received_at` 偏差超过 7 天的丢弃。
- 全局限流，超限返回 429，客户端保留队列稍后重试。
- 不要求登录；携带 cookie 时解析 `user_id`。

### 9.3 服务端监听器

`apps/web/lib/analytics-listeners.ts`：

- 订阅第 6.3 节映射表中的领域事件，转换为分析事件写入 `AnalyticsStore`。
- 转换失败不得影响主业务：监听器内部捕获异常并记录，禁止向上抛出（现有 `dispatchAppEvent` 会把监听器异常标记为 outbox 失败，需在监听器内自行兜底）。
- 与业务 Service 无直接引用，符合事件驱动约定。

## 10. 看板

### 10.1 YCT 后台「数据概览」

位置：现有后台首页概览下方新增区块，复用 `admin-home-overview` 的卡片风格。

内容：

1. 指标卡：DAU、会话数、任务成功率、错误率、审核 P50 时长。
2. 趋势：近 30 天 DAU 折线。
3. 功能渗透率表：功能名、周活跃用户、渗透率、环比。
4. 异常提示：错误率超过阈值时高亮。

### 10.2 ldpass 侧

- 「本项目」视图：与 YCT 同构，展示 ldpass 自身的登录、卡包、乘车码指标。
- 「跨项目总览」：只读两边的 `metrics-daily.json`，展示同一 `user_id` 在两个项目的活跃对比。

### 10.3 接口

```text
GET /api/admin/analytics/overview?days=30
GET /api/admin/analytics/features?days=7
```

均需管理员权限，复用 `requireYctAdmin`。

## 11. 实施分期

| 阶段 | 内容                                                                                 | 验收标准                                                             |
| ---- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| P0   | 身份三元组、存储接口与 SQLite 实现、采集接口、服务端监听器、YCT 数据概览（5 个指标） | 后台能看到昨日真实 DAU 与功能渗透率；`event_id` 重复提交不产生重复行 |
| P1   | 前端行为事件全量接入（搜索、路线、导出、客户端错误）、漏斗、告警阈值                 | 材料导出漏斗能算出每一步转化率；错误率异常能在看板看到               |
| P2   | ldpass 接入同一规范、跨项目总览、留存曲线                                            | 两个项目看板同时可用；总览能按 `user_id` 关联                        |

## 12. 风险与踩坑清单

| 风险                    | 表现                              | 规避                                    |
| ----------------------- | --------------------------------- | --------------------------------------- |
| 复用 outbox 存分析事件  | 站点事件延迟随数据量增长          | 分析事件独立库，禁止写入 outbox         |
| 匿名 ID 每次刷新重建    | UV 虚高数倍                       | 服务端 cookie + localStorage 双写       |
| React StrictMode 双执行 | 页面浏览重复，漏斗转化率超过 100% | `event_id` 幂等 + 开发环境禁用          |
| 按浏览器时间切天        | 跨零点会话被切碎、时区错乱        | 统一用 `received_at` 与 `Asia/Shanghai` |
| 多进程各自跑聚合        | 指标翻倍或不一致                  | 聚合独立脚本 + 幂等覆盖                 |
| 把接口 200 当业务成功   | 导出返回 200 但产物为空仍算成功   | 成功事件由业务侧确认产物后发出          |
| 无保留期治理            | 数据库无限增长                    | 90 天滚动清理，清理前校验聚合           |
| 事件膨胀                | 高频事件淹没关键事件              | 高频事件可采样，关键业务事件永不采样    |

## 13. 核心测试用例

| 用例           | 断言                                                        |
| -------------- | ----------------------------------------------------------- |
| 幂等写入       | 同一 `event_id` 提交 3 次，表内仅 1 行                      |
| 时区边界       | `23:59` 与 `00:01` 的事件分属不同自然日，会话不被错误切断   |
| 匿名转登录     | 同一 `client_id` 登录后，DAU 不重复计数，`user_id` 正确回填 |
| 弱网重试       | 断网 3 次后恢复，事件不丢不重                               |
| 聚合幂等       | 同一天聚合执行 3 次，结果完全一致                           |
| 保留期清理     | 90 天前事件被删除，对应日聚合保留且数值不变                 |
| 多进程并发     | 两个进程同时写入 1000 条，无丢失，`event_id` 无重复         |
| 监听器故障隔离 | 分析监听器抛错时，业务事件仍正常分发                        |
| 采样保护       | 关键业务事件在采样配置下仍 100% 落库                        |

## 14. 待确认事项

1. ~~ldpass 正式域名~~ 已确认：`ldpass.shangxiaoguan.top`，与 YCT 同级，按 5.2 节使用父域 cookie 共享 `client_id`。
2. ~~服务器是否多进程运行~~ 已确认（2026-10-29，Windows Server 2022）：

   - `pm2 jlist` 为空，`pm2` 服务为 Stopped，PM2 未托管任何应用，不存在 cluster。
   - 两个项目各只有一个 `node.exe`：YCT v2 为 `apps/web/server.js`（监听 3300），ldpass 为 `deploy-start.mjs`（监听 3200）。
   - 运行时为 `C:\node-v24\node.exe`，`node:sqlite` 无需实验标志即可使用。
   - 结论：按单进程配置，仍开启 WAL 以支持后续扩容。

   复核方式：

   ```powershell
   Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
     Select-Object ProcessId, ParentProcessId, CommandLine | Format-List
   ```

3. ~~YCT v2 的监听端口与对外域名~~ 已确认：v2 监听 3300，对外为 `yct.shangxiaoguan.top`。旧站 `gtr/server.js` 仍在 3000 运行，仅作为遗留数据源：

   - 统计 SDK 只部署在 `apps/web`，gtr 与 `legacy-wordpress-api` 不加载 v2 前端，不计入统计。
   - gtr 若存在用户可见页面，其访问量另立口径，不并入 v2 的 DAU。
   - P0 需核对服务器上的 `YCT_PUBLIC_SITE_URL` 为 `https://yct.shangxiaoguan.top`，否则上报地址与 cookie 域会出错。

4. 是否需要保留匿名用户 90 天以上的留存分析。
