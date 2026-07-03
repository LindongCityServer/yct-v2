# 统一班次与票务平台

更新时间：2026-07-02

本文档记录“客运、轮渡、航班的班次、票务通过统一平台解决，并重写查询和订票系统”的产品与工程边界。旧站 `/ltcx/` 只作为交互深度和数据迁移参考，不继续沿用纯前端本地订单、清空 `localStorage` 或本地条形码代表真实票券的实现方式。

## 1. 产品边界

- 统一平台覆盖客运、轮渡、航班，后续可扩展地方铁路、公交快线或其他可排班交通方式。
- 用户侧统一提供班次查询、日期切换、站点筛选、票价展示、订单确认、票券展示、退票、历史订单和出行提醒联动。
- 管理侧统一提供班次导入、班次发布预览、票价/票种配置、库存或余票配置、停运提醒、订单查询、异常处理和审计。
- `ldpass` 负责账号身份、卡包/票券凭证、操作链接、核销或乘车码承载；YCT 负责出行场景、班次、订单、提醒和状态展示。
- 第一阶段不能把“可查询班次”包装成“可真实购票”；真实购票上线前，按钮文案应明确为“待接入”或“参考旧版入口”。

## 2. 工业界常见拆法

大型项目通常不会让页面直接操作票券系统，而是拆成以下组件：

- `ScheduleService`：管理班次服务、班次实例、发布版本和停运信息。
- `FareService`：管理票种、票价、优惠和适用区间。
- `InventoryService`：管理余票、占座、占座过期释放；如果没有真实座位，也要抽象为可售容量。
- `OrderService`：创建订单、取消订单、确认出票；只负责订单状态，不直接发 Push 或改 `ldpass`。
- `TicketService`：创建本地票券记录，关联 `ldpassPassId`、`actionLinkId` 或 `redemptionRequestId`。
- `LdpassTicketAdapter`：调用 `ldpass` Provider API、操作链接或后续专用接口。
- `EventBus` + `Transactional Outbox`：订单、出票、退票、核销等状态变更通过事件驱动通知、审计、缓存刷新和 `ldpass` 同步。

## 3. 核心数据模型

```ts
export type TicketableServiceKind = 'coach' | 'ferry' | 'flight' | 'railway' | 'custom';

export interface ScheduleService {
  id: string;
  kind: TicketableServiceKind;
  name: string;
  operatorIds: string[];
  originStationId?: string;
  destinationStationId?: string;
  status: 'draft' | 'published' | 'suspended' | 'archived';
}

export interface TripInstance {
  id: string;
  scheduleServiceId: string;
  departureStationId: string;
  arrivalStationId: string;
  departureAt: string;
  arrivalAt?: string;
  status: 'scheduled' | 'boarding' | 'departed' | 'arrived' | 'cancelled';
}

export interface FareProduct {
  id: string;
  scheduleServiceId: string;
  name: string;
  price: number;
  currency: 'CNY' | 'SERVER_CREDIT' | 'CUSTOM';
  rules: Record<string, unknown>;
}

export interface TicketOrder {
  id: string;
  userId: string;
  ldpassUserId: string;
  tripInstanceId: string;
  fareProductId: string;
  status:
    | 'draft'
    | 'pending_issue'
    | 'issued'
    | 'checked_in'
    | 'completed'
    | 'cancelled'
    | 'refund_requested'
    | 'refunded';
}
```

说明：

- 航班不强行塞进现有地图 `TransitLine`；在票务平台里先作为 `TicketableServiceKind`，需要地图化时再另行建模。
- 客运旧 `ltcx/route.txt` 可以导入为 `ScheduleService` + 多个 `TripInstance`，不要只聚合成线路后丢掉班次粒度。
- 轮渡和航班即使第一阶段没有数据，也要共享同一套查询与订单接口，避免后续再造一套页面。
- 统一班次/票务的服务语义色不能混用：客运大巴默认黄绿色，轮渡默认青蓝色，航班默认蓝紫色；当前已提供 `TravelScheduleServiceProfile` 本地仓储和后台 API，后续接入数据库后继续保留不同服务器覆盖默认值的能力。

## 4. 事件清单

核心 Service 写库成功后只发事件，副作用由监听器处理。

| 事件                         | 触发节点             | 典型监听器                        |
| ---------------------------- | -------------------- | --------------------------------- |
| `TravelSchedulePublished`    | 班次版本发布         | 缓存刷新、搜索索引、管理员审计    |
| `TicketInventoryHeld`        | 用户占用余票/座位    | 占座超时任务、订单草稿刷新        |
| `TicketInventoryHoldExpired` | 占座超时释放         | 订单取消、Push 或站内提醒         |
| `TicketOrderCreated`         | 订单创建             | 出票监听器、行程提醒联动、审计    |
| `TicketOrderCancelled`       | 订单取消             | 库存释放、徽标刷新、审计          |
| `TicketIssued`               | 本地出票成功         | `ldpass` 同步、票券展示、Push     |
| `TicketRedemptionLinked`     | 关联核销或操作链接   | 检票状态同步、订单详情刷新        |
| `TicketCheckedIn`            | 检票成功             | 行程状态更新、Push、审计          |
| `TicketRefundRequested`      | 用户或管理员申请退票 | 人工处理、库存策略、`ldpass` 同步 |
| `TicketRefundCompleted`      | 退票完成             | 票券状态同步、订单历史刷新        |
| `LdpassTicketStatusSynced`   | 外部票券状态回写     | 本地订单校正、异常处理            |

已同步到契约源码：`packages/contracts/src/events.ts`。

## 4.1 契约源码进展

- `packages/contracts/src/domain.ts` 已补充 `TravelFareProduct`、`TicketInventoryPool`、`TicketInventoryHold`、`TicketOrder`、`TicketRecord`、`TicketRefundRequest` 以及对应状态枚举。
- `packages/schemas/src/ticketing.ts` 已补充同名运行时校验 schema，并通过 `@yct/schemas` 导出，供后续票务 Repository、API 和导入器复用。
- 已新增第一版票务可售性预检：`/api/travel/schedules` 会在每个真实班次上返回 `ticketing` 状态，`/api/travel/ticketing/availability?tripInstanceId=...` 可单独查询某个班次的新票务状态。
- 预检读取 `.yct-data/ticketing-catalog-store.json` 中真实配置的 `TravelFareProduct` 与 `TicketInventoryPool`；没有配置时只返回“票种未配置 / 库存未配置 / 旧版参考可用”等不可售状态，不生成默认票种或模拟库存。
- 已新增第一版订单草稿入口：`GET /api/travel/ticketing/orders` 可列出当前登录用户的订单草稿和库存占用；`POST /api/travel/ticketing/orders` 需要真实 `ldpass` Active 用户，会按真实班次、真实票种和真实库存池创建 `draft` 订单与 15 分钟库存占用，并发出 `TicketInventoryHeld` 与 `TicketOrderCreated` 事件；`POST /api/travel/ticketing/orders/:orderId/cancel` 只允许取消当前用户自己的 `draft` / `pending_issue` 订单，取消后释放对应占用并发出 `TicketOrderCancelled`。没有真实票种或库存配置时返回 409，不落库、不发事件。
- 当前仍未创建真实票券、核销记录或退票记录；这些契约、预检和草稿订单入口只用于约束后续实现，避免查询页把可查询班次误包装成可购票。

## 5. 状态机

订单主线：

```text
Draft
  -> PendingIssue
  -> Issued
  -> CheckedIn
  -> Completed

Draft -> Cancelled
PendingIssue -> Cancelled
Issued -> RefundRequested -> Refunded
Issued -> Expired
CheckedIn -> ManualReview 或 Completed
```

占座主线：

```text
Held -> Confirmed
Held -> Expired -> Released
Held -> Cancelled -> Released
```

班次主线：

```text
DraftRevision
  -> PendingPreview
  -> Published
  -> Superseded

Published -> Suspended
Published -> CancelledTripInstance
```

## 6. 第一阶段实现顺序

1. 先重写查询层：把旧客运 `ltcx` 文本导入为结构化 `ScheduleService`、`TripInstance`、站点、检票口、票价和停运提醒。
2. 再做统一查询页面：同一套筛选器支持客运、轮渡、航班；无数据的交通方式显示“暂未接入”，不做假数据。
3. 再做订单草稿和本地历史：匿名用户只能保存本地查询历史和提醒，不能创建真实私有订单。
4. 登录后接入订单服务：只允许 `ldpass` 用户创建订单，旧本地订单经用户确认后迁移为历史参考。
5. 最后接 `ldpass` 票券/核销：出票、退票、检票、冲正都必须有幂等键和审计记录。

当前进展：步骤 1 和步骤 2 已完成第一版工程实现，入口为 `/travel/schedules` 与 `/api/travel/schedules`。它读取旧客运真实班次，展示班次号、站点、检票口、票价和运营方；同时读取 `YCT_FLIGHT_DATA_URL` 的航班文本数据，仅保留“临东金桦”起飞/经停/到达及“临东航空”航班，展示航班号、起降时间、运行日、值机/到达位置、票价、承运方和机型。统一查询已支持服务日期筛选：航班等带 `operatingDays` 的数据按日期对应星期过滤，旧客运缺少运行日字段时继续展示，不假设运行规则。页面和 API 也支持经过车站、起点和终点筛选；起终点同时存在时按班次站点序列判断方向，不把反向不存在的结果当作可达。轮渡仍作为未接入服务展示。步骤 3 已完成浏览器本地班次记录的第一版：保存到 `yct.travelScheduleHistory.v1`，用于回查和提醒联动；并已新增只读票务可售性预检，用于把“可查询班次”“旧版参考入口”和“新版票务可售条件”分开展示。步骤 4 已推进第一版后端入口：登录用户在真实票务目录存在时可创建草稿订单和库存占用；当前尚未创建真实票券、核销记录或退票记录。

## 7. 高频踩坑点

- 把旧版本地订单当真实订单迁移，会造成用户以为已有可核销票券。旧订单只能迁移为历史记录或提醒来源。
- 占座不用过期释放会导致库存被永久占满；即使第一版没有真实座位，也要设计占用过期。
- `ldpass` 回调或轮询可能重复到达，出票、退票、核销必须用幂等键。
- 多实例部署时只用内存事件会漏通知；真实票务必须使用 Transactional Outbox。
- 退票后只改 YCT 订单、不撤销 `ldpass` 凭证，会留下可被继续展示或核销的旧票。
- 班次导入如果只按线路聚合，会丢失发车时间、检票口、票价和停运粒度。

## 8. 核心测试用例

- 客运旧文本导入后，同一线路的多个发车时间能保留为多个 `TripInstance`。
- 查询指定服务日期时，带 `operatingDays` 的航班只展示当日运行班次；旧客运缺少运行日字段时不被错误筛空。
- 查询指定起点和终点时，只有站点序列中起点不晚于终点的班次会返回；反向行程必须有独立班次或方向数据支撑。
- 查询同一日期、起终点和交通方式时，停运班次不会被展示为可购票。
- 占座创建后到期自动释放，订单进入取消状态。
- 重复收到同一个 `ldpass` 出票或核销回调，不会重复出票或重复检票。
- 退票完成后，本地订单、`ldpass` 票券、行程提醒和计数徽标状态一致。
- 匿名用户不能创建真实订单；登录用户旧本地订单迁移必须经过确认。
- 客运、轮渡、航班共用同一查询接口，新增交通方式不需要复制页面逻辑。

## 9. 待拍板问题

- 是否需要真实库存或座位号，还是只做可售容量。
- 是否存在支付、积分或服务器权益扣减；如果存在，需要确认对账和退款规则。
- 乘客信息是否需要实名、联系方式或服务器角色绑定。
- `ldpass` 票券采用 Provider 票券接口、操作链接、核销 API，还是新增专用接口。
- 管理员是否允许手动改签、强制退票、冲正核销；哪些操作需要 PIN 或二次确认。
- 轮渡和航班的初始数据来源：后台录入、旧数据导入，还是抓取特定 API 生成快照。
