# YCT Event Schema

更新时间：2026-07-14

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

| 事件                                         | 触发节点                      | 主要用途                                                                                                                                                                                                                                        |
| -------------------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ContentDraftUpdated`                        | 内容草稿保存或驳回后重开编辑  | 编辑器回填、审计、缓存刷新；当前后台重新载入草稿或驳回内容并保存时会发布该事件                                                                                                                                                                  |
| `ContentSubmitted`                           | 内容修订提交审核              | 审核待办、站内通知                                                                                                                                                                                                                              |
| `ContentReviewed`                            | 管理员审核内容                | 通知投稿者、记录审计                                                                                                                                                                                                                            |
| `ContentPublished`                           | 内容版本发布                  | 刷新首页、搜索索引、缓存                                                                                                                                                                                                                        |
| `ContentArchived`                            | 内容被归档或下线              | 从公开入口撤下、刷新首页与搜索缓存、记录审计                                                                                                                                                                                                    |
| `ContentAssetImported`                       | 内容素材从旧清单或适配器导入  | 素材审核待办、来源追踪、审计                                                                                                                                                                                                                    |
| `ContentAssetUploaded`                       | 管理员上传内容素材            | 素材审核待办、去重、来源追踪、审计                                                                                                                                                                                                              |
| `ContentAssetReviewed`                       | 管理员审核内容素材            | 内容发布校验、通知投稿者、记录审计                                                                                                                                                                                                              |
| `PoiSubmissionImageUploaded`                 | 用户上传 POI 投稿图片         | POI 审核资料、图片来源追踪和审计；当前只记录生成的图片 URL、MIME、大小和哈希，不代表图片已公开审核通过                                                                                                                                          |
| `PoiSubmitted`                               | 用户或管理员新增 POI 投稿     | POI 审核待办；payload 包含真实几何、父地点、绑定区域、营业时间、地址道路绑定和设施条目，管理员新增同样进入统一审核生命周期                                                                                                                      |
| `PoiSubmissionUpdated`                       | 管理员修正 POI 投稿资料       | 审核前资料修正、管理员审计和搜索预览刷新；允许修正点、道路等几何、父地点、绑定区域、营业时间、地址道路绑定和设施条目                                                                                                                            |
| `PoiSubmissionImageReviewed`                 | 管理员审核 POI 投稿图片       | 图片局部审核状态、公开发布校验和管理员审计；当前支持图片可用、图片不合格和重置审核状态                                                                                                                                                          |
| `PoiReviewed`                                | 管理员审核 POI                | 地图数据发布、通知投稿者                                                                                                                                                                                                                        |
| `PoiPublished`                               | 已审核 POI 发布为公开标记     | 地图标记缓存刷新、搜索索引、通知投稿者；父地点、绑定区域、营业时间、地址道路绑定和设施条目随公开快照发布                                                                                                                                        |
| `PoiConflictDecisionUpdated`                 | 管理员标记 POI 冲突提示       | 重复/相近地点审核状态、管理员审计和后续合并队列；当前支持忽略、待合并和重置三种判断                                                                                                                                                             |
| `PoiCategoryProfileUpdated`                  | 管理员更新 POI 分类和图标配置 | 分类缓存刷新、地图投稿表单刷新、搜索索引和管理员审计；当前第一版写入本地分类覆盖配置并支持一类多图标文件名管理                                                                                                                                  |
| `PoiCategoryIconUploaded`                    | 管理员上传 POI 分类图标       | 图标来源追踪、分类配置引用和管理员审计；当前文件默认落盘到 `runtime-assets/poi-icons` 并通过 `/api/map/poi-icons/<file>` 读取                                                                                                                   |
| `PoiCategoryIconDeleted`                     | 管理员删除 POI 分类图标       | 图标资源清理、分类配置引用清理和管理员审计；当前只允许删除后台上传的运行时图标，删除前会阻止分类失去最后一个可用图标                                                                                                                            |
| `TransitDataRevisionImported`                | 旧站或适配器数据导入为快照    | 校验报告、审计、导入历史                                                                                                                                                                                                                        |
| `TransitDataRevisionSubmitted`               | 线路/站点/班次数据提交        | 交通数据审核和预览                                                                                                                                                                                                                              |
| `TransitDataRevisionReviewed`                | 管理员审核交通数据版本        | 通知提交者、记录审计                                                                                                                                                                                                                            |
| `TransitDataRevisionPublished`               | 交通数据版本发布或恢复        | 地图图层、搜索、路线规划缓存刷新；当前发布或恢复已被替换版本时会清理交通概览与地图线路标记进程内缓存                                                                                                                                            |
| `TransitDataRevisionArchived`                | 交通数据版本归档              | 管理员审计和待办清理；当前禁止直接归档正在发布中的版本，需要先恢复或发布另一个版本                                                                                                                                                              |
| `TransitDataRevisionStationUpdated`          | 管理员修正交通版本站点坐标    | 站点坐标审核、路线规划候选刷新和管理员审计；当前只允许修正已导入、校验失败、待审核或已驳回版本中的站点 X/Z 坐标，并会重跑版本校验                                                                                                               |
| `TransitDataRevisionStationCreated`          | 地图编辑器随线路新增站点      | 站点索引、地图标记和管理员审计；和线路修改处于同一次版本写入中，每个新站点独立发出事件                                                                                                                                                          |
| `TransitDataRevisionLineUpdated`             | 管理员保存已有线路            | 地图线路图层、路线规划缓存、搜索索引和管理员审计；可视化编辑器保存时包含运行方式、节点序列和沿路分段                                                                                                                                            |
| `TransitDataRevisionLineCreated`             | 管理员新增线路                | 地图线路图层、路线规划候选和管理员审计                                                                                                                                                                                                          |
| `TransitDataRevisionLineDeleted`             | 管理员删除线路                | 地图线路图层、路线规划缓存、搜索索引和管理员审计                                                                                                                                                                                                |
| `TransitModeProfileUpdated`                  | 地图/线路交通方式配置更新     | 线路颜色、图标、排序缓存刷新和管理员审计                                                                                                                                                                                                        |
| `TileProviderSelected`                       | 地图瓦片源被选择              | 记录混合内容降级或管理员覆盖                                                                                                                                                                                                                    |
| `TripReminderScheduled`                      | 行程提醒创建或同步到账号      | 定时任务、Web Push；登录用户同步待提醒记录到服务端时会发布该事件，payload 携带 `reminderId`、`remindAt`、`title`、`source` 和 `userId`                                                                                                          |
| `TripReminderDeleted`                        | 账号侧行程提醒副本被删除      | 取消后续提醒、刷新账号历史；当前用于撤销旧站 `orders` 同步同意后删除账号侧 `legacy_order` 提醒副本                                                                                                                                              |
| `PushPreferenceUpdated`                      | 用户更新通知偏好              | 推送订阅和免打扰策略刷新；当前登录用户在账号页修改通知偏好时会写入服务端偏好仓储并发布该事件                                                                                                                                                    |
| `PushDeviceSubscribed`                       | 用户登记浏览器 Push 设备订阅  | 服务端 Push 发送器刷新设备列表；当前登录用户开启通知且浏览器订阅成功时会发布该事件                                                                                                                                                              |
| `PushDeviceSubscriptionRevoked`              | 用户撤销浏览器 Push 设备订阅  | 服务端 Push 发送器停止向该 endpoint 投递；当前登录用户关闭通知或撤销设备订阅时会发布该事件                                                                                                                                                      |
| `PushDeliveryQueued`                         | Push 投递记录进入队列         | 送达审计、内部定时任务处理；当前行程提醒同步到账号后会按用户通知偏好和活跃设备订阅生成投递记录                                                                                                                                                  |
| `PushDeliveryCompleted`                      | Push 投递发送成功或失败       | 送达审计、失败回写和失效订阅清理；当前由内部接口 `/api/internal/notifications/process` 处理到期投递后发布                                                                                                                                       |
| `OfflinePackageRequested`                    | 用户请求自定义矩形离线包      | 离线包生成、体积检查；当前登录用户保存或刷新自定义范围时会写入服务端请求记录并发布该事件，真实生成流程后续由监听器承接                                                                                                                          |
| `OfflinePackageRequestDeleted`               | 用户删除自定义矩形离线包请求  | 取消待生成任务、刷新账号侧离线范围列表；当前用于账号页删除离线范围时清理服务端请求记录                                                                                                                                                          |
| `LdpassThemeScheduleSynced`                  | 同步到 ldpass 主题计划        | 前端强调色刷新                                                                                                                                                                                                                                  |
| `LocalePreferenceUpdated`                    | 用户语言偏好更新              | 账号偏好同步、前端缓存刷新；`locale` 可为 `system`，`resolvedLocale` 才是实际语言                                                                                                                                                               |
| `TranslationCatalogPublished`                | 固定界面文案目录发布          | UI 文案缓存刷新、构建或运行时翻译目录索引刷新                                                                                                                                                                                                   |
| `EntityTranslationUpdated`                   | 业务实体译名或别名更新        | 地图、线路、服务入口、运营内容的搜索索引刷新和管理员审计；不得由机器翻译直接发布公开译名                                                                                                                                                        |
| `MapFavoritesUpdated`                        | 用户地图收藏列表更新          | 账号侧收藏同步、搜索/推荐缓存刷新和审计；payload 只包含 markerId，不复制地点快照                                                                                                                                                                |
| `OperationsStrongReminderRulesUpdated`       | 首页强提醒规则整体更新        | 首页强提醒面板刷新、推送编排候选刷新和管理员审计；当前首页强提醒第一版每次保存规则集时会发布该事件，并由通知监听器刷新 `operations` 类型 Push 投递记录                                                                                          |
| `OperationsReminderDeliveryRefreshRequested` | 请求重算运营提醒投递          | 触发 `operations` 类型 Push 投递重算、排障和后台测试；当前 `/admin/operations` 的“重算投递”按钮、内部公告源同步任务、被首页强提醒规则引用的运营内容发布/归档事件，以及内部任务对“定时发布内容到点可见 / 过期不可见”的可见性同步，都会发布该事件 |
| `TravelScheduleRevisionImported`             | 当前统一班次来源导入为版本    | 班次数据治理、来源追踪和管理员审计；当前后台会把真实 `/api/travel/schedules` 结果写入本地班次版本仓储                                                                                                                                           |
| `TravelScheduleRevisionSubmitted`            | 统一班次版本提交审核          | 班次数据审核待办和管理员审计                                                                                                                                                                                                                    |
| `TravelScheduleRevisionReviewed`             | 管理员审核统一班次版本        | 记录审核结论、驳回原因和后续通知                                                                                                                                                                                                                |
| `TravelScheduleRevisionArchived`             | 统一班次版本归档              | 管理员审计和待办清理；当前禁止直接归档正在发布中的版本，需要先恢复或发布另一个版本                                                                                                                                                              |
| `TravelSchedulePublished`                    | 统一班次版本发布或恢复        | 班次查询缓存、搜索索引、管理员审计；当前公开查询已优先读取已发布快照，没有发布版本时回退实时来源，发布或恢复后会清理进程内查询缓存                                                                                                              |
| `TravelScheduleServiceProfileUpdated`        | 可排班服务配置更新            | 客运大巴、轮渡、航班等统一班次服务的颜色、图标、排序缓存刷新和管理员审计                                                                                                                                                                        |
| `TicketInventoryHeld`                        | 票务库存或可售容量被占用      | 占座超时、订单草稿刷新                                                                                                                                                                                                                          |
| `TicketInventoryHoldExpired`                 | 库存占用超时释放              | 订单取消、库存释放、通知刷新                                                                                                                                                                                                                    |
| `TicketOrderCreated`                         | 出行订单创建                  | 票券发行、行程状态联动                                                                                                                                                                                                                          |
| `TicketOrderCancelled`                       | 出行订单取消                  | 库存释放、计数徽标刷新、审计                                                                                                                                                                                                                    |
| `TicketIssued`                               | 本地票券发行成功              | `ldpass` 票券/操作链接同步、Push                                                                                                                                                                                                                |
| `TicketRedemptionLinked`                     | 订单关联 ldpass 核销/操作链接 | 检票状态同步                                                                                                                                                                                                                                    |
| `TicketCheckedIn`                            | 票券检票成功                  | 行程状态更新、Push、审计                                                                                                                                                                                                                        |
| `TicketRefundRequested`                      | 退票申请创建                  | 人工处理、库存策略、`ldpass` 同步                                                                                                                                                                                                               |
| `TicketRefundCompleted`                      | 退票完成                      | 订单历史、票券状态和计数徽标刷新                                                                                                                                                                                                                |
| `LdpassTicketStatusSynced`                   | 同步到 ldpass 票券/核销状态   | 订单、提醒、徽标刷新                                                                                                                                                                                                                            |
| `AdminInitialized`                           | 命令行初始化首位超级管理员    | 安全审计                                                                                                                                                                                                                                        |

## 3. 地图与线路编辑 Payload

```ts
export interface PoiSubmittedPayload {
  poiId: string;
  revisionId?: string;
  title?: string;
  categoryId: string;
  description?: string;
  href?: string;
  imageUrl?: string;
  geometry: MapGeometry;
  parentMarkerId?: string;
  boundRegionMarkerIds?: string[];
  openingHours?: string;
  address?: string;
  addressRoadMarkerId?: string;
  facilities?: Array<{
    symbolIcon: string;
    description: string;
  }>;
}

export interface PoiSubmissionUpdatedPayload {
  poiId: string;
  updatedBy: string;
  updatedAt: string;
  changedFields: Array<
    | 'title'
    | 'categoryId'
    | 'iconFileName'
    | 'description'
    | 'href'
    | 'imageUrl'
    | 'geometry'
    | 'parentMarkerId'
    | 'boundRegionMarkerIds'
    | 'openingHours'
    | 'address'
    | 'addressRoadMarkerId'
    | 'facilities'
  >;
}

export interface TransitDataRevisionStationCreatedPayload {
  datasetId: string;
  revisionId: string;
  stationSourceId: string;
  stationName: string;
  x: number;
  z: number;
  boundPoiMarkerId?: string;
  createdBy: string;
  createdAt: string;
}

export interface TransitDataRevisionLineUpdatedPayload {
  datasetId: string;
  revisionId: string;
  lineSourceId: string;
  lineName: string;
  updatedBy: string;
  updatedAt: string;
  changedFields: Array<
    | 'mode'
    | 'name'
    | 'color'
    | 'routeMode'
    | 'routeNodes'
    | 'stationSourceIds'
    | 'stops'
    | 'segmentPaths'
    | 'operator'
    | 'fare'
    | 'firstLastBus'
    | 'departureTimes'
    | 'departureRules'
    | 'operatingDateRule'
    | 'bookingUrl'
  >;
  stationCountBefore: number;
  stationCountAfter: number;
}
```

可视化编辑器中的新站点使用请求内临时引用 `draft:<clientId>`。Workflow 必须先生成正式 `stationSourceId`，再原子替换线路节点、站点序列和分段路径中的临时引用；写入成功后才发布站点与线路事件。监听器不得依赖 `draft:<clientId>`。

POI 的 `addressRoadMarkerId` 是默认道路接入约束。地图路线规划器只能把该 POI 投影到对应道路的实际线段上；绑定道路缺失时必须返回无道路接入点，不能静默改投到其他道路。设施条目中的 `symbolIcon` 使用受 schema 约束的 Material Symbol 标识符，`description` 保存对用户可见的文字说明。

## 4. 投递要求

- 单机 MVP 可以先用 `InMemoryEventBus`。
- 当前行程提醒投递已使用应用级共享内存事件总线连接 `TripReminderScheduled` 和通知投递监听器，投递记录持久化到 `.yct-data/push-delivery-store.json`。这解决单进程开发环境的监听器解耦，但不替代正式数据库 Outbox。
- 当前工程已新增 `.yct-data/event-outbox-store.json` 作为单机开发阶段的本地事件 Outbox；业务 workflow 发布事件时先写 Outbox，再交给共享内存事件总线分发。受 `YCT_INTERNAL_TASK_TOKEN` 保护的 `/api/internal/events/process` 可重放 `queued` / `failed` 事件，用于开发期恢复失败监听器和审计验证；它仍不替代数据库事务内 Outbox。
- 交通版本、线路、站点和交通方式配置变更后的概览/线路标记缓存失效由 `transit-cache-invalidation-listeners.ts` 订阅领域事件完成，交通 workflow 不直接调用缓存模块；Outbox 重放入口会先注册该监听器。
- 内部 Push 投递任务处理到期队列前，会按用户和通知类型检查最小投递间隔；触发限频时把投递延后到下一次允许时间，并记录 `push_rate_limited`。
- 公开数据发布、Push、Webhook、票务同步必须进入 Transactional Outbox。
- 事件处理器必须幂等，不能假设只投递一次。
- 事件 Payload 只放业务键和必要快照，不放密码、密钥、完整 Cookie 或私有运维信息。
- 客运、轮渡、航班统一查询订票平台的详细事件边界见 `docs/TRAVEL_TICKETING_PLATFORM.md`，契约源码见 `packages/contracts/src/events.ts`。

## 5. 状态机与校验

- 内容修订、素材审核和 POI 投稿的状态转换由 `@yct/domain` 的纯函数维护。
- Markdown、素材上传、地图几何、瓦片模板、POI 分类和旧数据导入批次由 `@yct/schemas` 做运行时校验。
- API 或 Service 在写库前必须先通过 schema 校验；写库成功后再发布领域事件。
