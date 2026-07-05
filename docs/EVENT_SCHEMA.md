# YCT Event Schema

更新时间：2026-07-05

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

| 事件                                  | 触发节点                      | 主要用途                                                                                                                               |
| ------------------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `ContentSubmitted`                    | 内容修订提交审核              | 审核待办、站内通知                                                                                                                     |
| `ContentReviewed`                     | 管理员审核内容                | 通知投稿者、记录审计                                                                                                                   |
| `ContentPublished`                    | 内容版本发布                  | 刷新首页、搜索索引、缓存                                                                                                               |
| `ContentAssetImported`                | 内容素材从旧清单或适配器导入  | 素材审核待办、来源追踪、审计                                                                                                           |
| `ContentAssetUploaded`                | 管理员上传内容素材            | 素材审核待办、去重、来源追踪、审计                                                                                                     |
| `ContentAssetReviewed`                | 管理员审核内容素材            | 内容发布校验、通知投稿者、记录审计                                                                                                     |
| `PoiSubmissionImageUploaded`          | 用户上传 POI 投稿图片         | POI 审核资料、图片来源追踪和审计；当前只记录生成的图片 URL、MIME、大小和哈希，不代表图片已公开审核通过                                 |
| `PoiSubmitted`                        | 用户提交公开 POI              | POI 审核待办                                                                                                                           |
| `PoiReviewed`                         | 管理员审核 POI                | 地图数据发布、通知投稿者                                                                                                               |
| `PoiPublished`                        | 已审核 POI 发布为公开标记     | 地图标记缓存刷新、搜索索引、通知投稿者                                                                                                 |
| `TransitDataRevisionImported`         | 旧站或适配器数据导入为快照    | 校验报告、审计、导入历史                                                                                                               |
| `TransitDataRevisionSubmitted`        | 线路/站点/班次数据提交        | 交通数据审核和预览                                                                                                                     |
| `TransitDataRevisionReviewed`         | 管理员审核交通数据版本        | 通知提交者、记录审计                                                                                                                   |
| `TransitDataRevisionPublished`        | 交通数据版本发布              | 地图图层、搜索、路线规划缓存刷新                                                                                                       |
| `TransitModeProfileUpdated`           | 地图/线路交通方式配置更新     | 线路颜色、图标、排序缓存刷新和管理员审计                                                                                               |
| `TileProviderSelected`                | 地图瓦片源被选择              | 记录混合内容降级或管理员覆盖                                                                                                           |
| `TripReminderScheduled`               | 行程提醒创建或同步到账号      | 定时任务、Web Push；登录用户同步待提醒记录到服务端时会发布该事件，payload 携带 `reminderId`、`remindAt`、`title`、`source` 和 `userId` |
| `TripReminderDeleted`                 | 账号侧行程提醒副本被删除      | 取消后续提醒、刷新账号历史；当前用于撤销旧站 `orders` 同步同意后删除账号侧 `legacy_order` 提醒副本                                     |
| `PushPreferenceUpdated`               | 用户更新通知偏好              | 推送订阅和免打扰策略刷新；当前登录用户在账号页修改通知偏好时会写入服务端偏好仓储并发布该事件                                           |
| `PushDeviceSubscribed`                | 用户登记浏览器 Push 设备订阅  | 服务端 Push 发送器刷新设备列表；当前登录用户开启通知且浏览器订阅成功时会发布该事件                                                     |
| `PushDeviceSubscriptionRevoked`       | 用户撤销浏览器 Push 设备订阅  | 服务端 Push 发送器停止向该 endpoint 投递；当前登录用户关闭通知或撤销设备订阅时会发布该事件                                             |
| `PushDeliveryQueued`                  | Push 投递记录进入队列         | 送达审计、内部定时任务处理；当前行程提醒同步到账号后会按用户通知偏好和活跃设备订阅生成投递记录                                         |
| `PushDeliveryCompleted`               | Push 投递发送成功或失败       | 送达审计、失败回写和失效订阅清理；当前由内部接口 `/api/internal/notifications/process` 处理到期投递后发布                              |
| `OfflinePackageRequested`             | 用户请求自定义矩形离线包      | 离线包生成、体积检查；当前登录用户保存或刷新自定义范围时会写入服务端请求记录并发布该事件，真实生成流程后续由监听器承接                 |
| `OfflinePackageRequestDeleted`        | 用户删除自定义矩形离线包请求  | 取消待生成任务、刷新账号侧离线范围列表；当前用于账号页删除离线范围时清理服务端请求记录                                                 |
| `LdpassThemeScheduleSynced`           | 同步到 ldpass 主题计划        | 前端强调色刷新                                                                                                                         |
| `LocalePreferenceUpdated`             | 用户语言偏好更新              | 账号偏好同步、前端缓存刷新；`locale` 可为 `system`，`resolvedLocale` 才是实际语言                                                       |
| `TranslationCatalogPublished`         | 固定界面文案目录发布          | UI 文案缓存刷新、构建或运行时翻译目录索引刷新                                                                                           |
| `EntityTranslationUpdated`            | 业务实体译名或别名更新        | 地图、线路、服务入口、运营内容的搜索索引刷新和管理员审计；不得由机器翻译直接发布公开译名                                               |
| `TravelSchedulePublished`             | 统一班次版本发布              | 班次查询缓存、搜索索引、管理员审计                                                                                                     |
| `TravelScheduleServiceProfileUpdated` | 可排班服务配置更新            | 客运大巴、轮渡、航班等统一班次服务的颜色、图标、排序缓存刷新和管理员审计                                                               |
| `TicketInventoryHeld`                 | 票务库存或可售容量被占用      | 占座超时、订单草稿刷新                                                                                                                 |
| `TicketInventoryHoldExpired`          | 库存占用超时释放              | 订单取消、库存释放、通知刷新                                                                                                           |
| `TicketOrderCreated`                  | 出行订单创建                  | 票券发行、行程状态联动                                                                                                                 |
| `TicketOrderCancelled`                | 出行订单取消                  | 库存释放、计数徽标刷新、审计                                                                                                           |
| `TicketIssued`                        | 本地票券发行成功              | `ldpass` 票券/操作链接同步、Push                                                                                                       |
| `TicketRedemptionLinked`              | 订单关联 ldpass 核销/操作链接 | 检票状态同步                                                                                                                           |
| `TicketCheckedIn`                     | 票券检票成功                  | 行程状态更新、Push、审计                                                                                                               |
| `TicketRefundRequested`               | 退票申请创建                  | 人工处理、库存策略、`ldpass` 同步                                                                                                      |
| `TicketRefundCompleted`               | 退票完成                      | 订单历史、票券状态和计数徽标刷新                                                                                                       |
| `LdpassTicketStatusSynced`            | 同步到 ldpass 票券/核销状态   | 订单、提醒、徽标刷新                                                                                                                   |
| `AdminInitialized`                    | 命令行初始化首位超级管理员    | 安全审计                                                                                                                               |

## 3. 投递要求

- 单机 MVP 可以先用 `InMemoryEventBus`。
- 当前行程提醒投递已使用应用级共享内存事件总线连接 `TripReminderScheduled` 和通知投递监听器，投递记录持久化到 `.yct-data/push-delivery-store.json`。这解决单进程开发环境的监听器解耦，但不替代正式数据库 Outbox。
- 当前工程已新增 `.yct-data/event-outbox-store.json` 作为单机开发阶段的本地事件 Outbox；业务 workflow 发布事件时先写 Outbox，再交给共享内存事件总线分发。受 `YCT_INTERNAL_TASK_TOKEN` 保护的 `/api/internal/events/process` 可重放 `queued` / `failed` 事件，用于开发期恢复失败监听器和审计验证；它仍不替代数据库事务内 Outbox。
- 内部 Push 投递任务处理到期队列前，会按用户和通知类型检查最小投递间隔；触发限频时把投递延后到下一次允许时间，并记录 `push_rate_limited`。
- 公开数据发布、Push、Webhook、票务同步必须进入 Transactional Outbox。
- 事件处理器必须幂等，不能假设只投递一次。
- 事件 Payload 只放业务键和必要快照，不放密码、密钥、完整 Cookie 或私有运维信息。
- 客运、轮渡、航班统一查询订票平台的详细事件边界见 `docs/TRAVEL_TICKETING_PLATFORM.md`，契约源码见 `packages/contracts/src/events.ts`。

## 4. 状态机与校验

- 内容修订、素材审核和 POI 投稿的状态转换由 `@yct/domain` 的纯函数维护。
- Markdown、素材上传、地图几何、瓦片模板、POI 分类和旧数据导入批次由 `@yct/schemas` 做运行时校验。
- API 或 Service 在写库前必须先通过 schema 校验；写库成功后再发布领域事件。
