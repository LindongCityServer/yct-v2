# YCT Event Schema

更新时间：2026-07-03

本文档记录雨城通 v2 第一阶段的领域事件。后端业务 Service 只负责本模块校验和写库，成功后发布事件；通知、Push、缓存失效、搜索索引、`ldpass` 同步等副作用由监听器处理。

类型源码位置：`packages/contracts/src/events.ts`。

## 1. 基础结构

```ts
export interface YctDomainEvent<TType extends string, TPayload> {
  eventId: string;
  type: TType;
  occurredAt: string;
  profileId: string;
  actor: {
    type: 'anonymous' | 'user' | 'admin' | 'system' | 'adapter';
    id?: string;
  };
  payload: TPayload;
}
```

## 2. 事件清单

| 事件                                  | 触发节点                      | 主要用途                                                                                                               |
| ------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `ContentSubmitted`                    | 内容修订提交审核              | 审核待办、站内通知                                                                                                     |
| `ContentReviewed`                     | 管理员审核内容                | 通知投稿者、记录审计                                                                                                   |
| `ContentPublished`                    | 内容版本发布                  | 刷新首页、搜索索引、缓存                                                                                               |
| `ContentAssetImported`                | 内容素材从旧清单或适配器导入  | 素材审核待办、来源追踪、审计                                                                                           |
| `ContentAssetUploaded`                | 管理员上传内容素材            | 素材审核待办、去重、来源追踪、审计                                                                                     |
| `ContentAssetReviewed`                | 管理员审核内容素材            | 内容发布校验、通知投稿者、记录审计                                                                                     |
| `PoiSubmitted`                        | 用户提交公开 POI              | POI 审核待办                                                                                                           |
| `PoiReviewed`                         | 管理员审核 POI                | 地图数据发布、通知投稿者                                                                                               |
| `PoiPublished`                        | 已审核 POI 发布为公开标记     | 地图标记缓存刷新、搜索索引、通知投稿者                                                                                 |
| `TransitDataRevisionImported`         | 旧站或适配器数据导入为快照    | 校验报告、审计、导入历史                                                                                               |
| `TransitDataRevisionSubmitted`        | 线路/站点/班次数据提交        | 交通数据审核和预览                                                                                                     |
| `TransitDataRevisionReviewed`         | 管理员审核交通数据版本        | 通知提交者、记录审计                                                                                                   |
| `TransitDataRevisionPublished`        | 交通数据版本发布              | 地图图层、搜索、路线规划缓存刷新                                                                                       |
| `TransitModeProfileUpdated`           | 地图/线路交通方式配置更新     | 线路颜色、图标、排序缓存刷新和管理员审计                                                                               |
| `TileProviderSelected`                | 地图瓦片源被选择              | 记录混合内容降级或管理员覆盖                                                                                           |
| `TripReminderScheduled`               | 行程提醒创建                  | 定时任务、Web Push；payload 需要携带 `reminderId`、`remindAt`，可选携带 `title`、`source`、`userId` 或 `localDeviceId` |
| `PushPreferenceUpdated`               | 用户更新通知偏好              | 推送订阅和免打扰策略刷新                                                                                               |
| `OfflinePackageRequested`             | 用户请求自定义矩形离线包      | 离线包生成、体积检查；当前前端已具备本地范围管理，服务端接入后需要用该事件承接真实生成流程                             |
| `LdpassThemeScheduleSynced`           | 同步到 ldpass 主题计划        | 前端强调色刷新                                                                                                         |
| `TravelSchedulePublished`             | 统一班次版本发布              | 班次查询缓存、搜索索引、管理员审计                                                                                     |
| `TravelScheduleServiceProfileUpdated` | 可排班服务配置更新            | 客运大巴、轮渡、航班等统一班次服务的颜色、图标、排序缓存刷新和管理员审计                                               |
| `TicketInventoryHeld`                 | 票务库存或可售容量被占用      | 占座超时、订单草稿刷新                                                                                                 |
| `TicketInventoryHoldExpired`          | 库存占用超时释放              | 订单取消、库存释放、通知刷新                                                                                           |
| `TicketOrderCreated`                  | 出行订单创建                  | 票券发行、行程状态联动                                                                                                 |
| `TicketOrderCancelled`                | 出行订单取消                  | 库存释放、计数徽标刷新、审计                                                                                           |
| `TicketIssued`                        | 本地票券发行成功              | `ldpass` 票券/操作链接同步、Push                                                                                       |
| `TicketRedemptionLinked`              | 订单关联 ldpass 核销/操作链接 | 检票状态同步                                                                                                           |
| `TicketCheckedIn`                     | 票券检票成功                  | 行程状态更新、Push、审计                                                                                               |
| `TicketRefundRequested`               | 退票申请创建                  | 人工处理、库存策略、`ldpass` 同步                                                                                      |
| `TicketRefundCompleted`               | 退票完成                      | 订单历史、票券状态和计数徽标刷新                                                                                       |
| `LdpassTicketStatusSynced`            | 同步到 ldpass 票券/核销状态   | 订单、提醒、徽标刷新                                                                                                   |
| `AdminInitialized`                    | 命令行初始化首位超级管理员    | 安全审计                                                                                                               |

## 3. 投递要求

- 单机 MVP 可以先用 `InMemoryEventBus`。
- 公开数据发布、Push、Webhook、票务同步必须进入 Transactional Outbox。
- 事件处理器必须幂等，不能假设只投递一次。
- 事件 Payload 只放业务键和必要快照，不放密码、密钥、完整 Cookie 或私有运维信息。
- 客运、轮渡、航班统一查询订票平台的详细事件边界见 `docs/TRAVEL_TICKETING_PLATFORM.md`，契约源码见 `packages/contracts/src/events.ts`。

## 4. 状态机与校验

- 内容修订、素材审核和 POI 投稿的状态转换由 `@yct/domain` 的纯函数维护。
- Markdown、素材上传、地图几何、瓦片模板、POI 分类和旧数据导入批次由 `@yct/schemas` 做运行时校验。
- API 或 Service 在写库前必须先通过 schema 校验；写库成功后再发布领域事件。
