# 后台链路完善目标与实施计划

更新时间：2026-07-13

本文档基于当前代码走查整理，覆盖内容后台、POI 后台、线路后台、班次后台四条链路。评估范围主要包括 `apps/web/components/*admin*panel.tsx`、`apps/web/lib/*workflow.ts`、`apps/web/lib/*store.ts`、`apps/web/app/api/admin/**`、`packages/domain/src/*state.ts`、`packages/contracts/src/events.ts`。

## 1. 总体结论

当前项目已经形成较清晰的后台架构：API Route 负责鉴权和参数入口，workflow 负责状态机与业务规则，store 负责本地持久化，workflow 成功后通过 `publishDomainEvent` 写入事件。四条链路都不是空白状态，核心差距集中在“后台操作效率、发布前风险确认、可视化编辑器、审计回溯、批量治理”。

工业界标准做法通常会把这类后台拆成五层：

1. Review Queue：统一的待办队列，支持状态、类型、风险等级、负责人、关键词过滤。
2. Revision Workflow：草稿或导入版本进入审核，再发布为公开快照。
3. Domain Event + Outbox：状态变更只发事件，搜索索引、缓存刷新、通知、审计日志都做监听器。
4. Preview & Diff：发布前必须能看当前版本与线上版本差异。
5. Risk Gate：发布、恢复、归档、覆盖线上数据等高风险操作要求确认，后续再接 PIN 或二次授权。

当前项目已经具备第 2、3 层的主体，第 1、4 层在四条链路上都已有第一版落地，第 5 层在 POI、线路、班次相对更完整，内容后台与统一审计视图也已经补到可用第一版。

### 1.1 2026-07-13 本轮明确修复目标

本轮继续收后台日常维护体验，按以下顺序落地：

1. 线路与班次后台以“线路 / 班次实体”为最小审批和维护对象：版本仍作为导入快照、差异对比和发布容器，但主列表必须完整展示线路、班次实体，并在实体行上呈现所属版本、版本状态和可执行动作，避免管理员只能围绕版本做判断。
2. 线路实体支持自定义站间路径：每一段站间路径可选择直线或沿道路走行，并允许设置一至多个途径点。单向站继续放在 stop 级元数据中，后台需明确展示和说明“某站只服务上行或下行”如何录入，而不是把它伪装成两条重复线路。
3. `transit-line-order-preview` 不再只展示前几站文字摘要，改成小地图预览，直接呈现站点顺序、缺坐标站点和自定义站间路径。
4. 加载旧有线路时，先按站点类别在既有同名标记点中查找绑定：例如公交站优先匹配公交/站点类标记，轨交优先匹配轨交/站点类标记；命中后回填 `boundPoiMarkerId`、`boundPoiLabel` 和世界坐标。
5. 服务入口后台支持修改或删除已经公开的自定义服务入口；系统默认入口仍只读，防止误删。
6. POI 后台列表除了投稿，也要加载旧有地图标记点，管理员可以在同一后台看到“旧标记点”和“新投稿 / 已发布 POI”的关系。
7. 修正 `admin-poi-coordinate-picker-grid` 对应的小地图瓦片偏移：瓦片层和 SVG 矢量层必须共享同一 viewBox 尺寸和缩放方式。
8. 清理后台界面中影响深色模式可读性的硬编码黑色或过深颜色，优先改为设计变量或 `color-mix`。

### 1.2 本轮实现边界

这轮先补“可维护性”和“操作面”两个最痛的缺口，不在同一轮内强行做完以下大项：

1. 不引入新的跨模块直接调用，继续沿用 `Route -> workflow -> store -> event` 的事件驱动边界。
2. 不把线路/班次后台一次性升级成完整 GIS 编辑器；本轮只落直线/沿道路/途径点的结构化表达和预览，道路吸附算法、轨迹拖拽、方向子线路治理仍留在后续。
3. 不把旧有地图标记点改造成可直接编辑的正式 POI；本轮先让 POI 后台能读、筛、看旧标记点，并用于冲突判断和旧站点绑定。
4. 服务入口的公开后修改采用“直接更新公开入口并记录事件”的轻量模式；后续若需要更强治理，再引入公开入口变更草稿和二次审核。

## 2. 链路状态矩阵

| 链路     | 当前状态             | 已具备能力                                                                                                                                                                                                                                                         | 主要缺口                                                                                                                                 |
| -------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 内容后台 | 可用审核台增强版     | 草稿创建/编辑、提交、审核、驳回理由、发布确认、发布快照历史、差异摘要、即时/定时发布、归档确认、批量提交/归档、素材上传/导入/审核、旧专题转换预览、首页强提醒规则和投递预览、卡片级正文/素材审核提示、编辑期局部检查提示                                           | 已提交内容的继续编辑链路仍需补齐；更细的正文质量规则、首页位视觉规范校验和逐字段 diff 仍可继续增强                                       |
| POI 后台 | 可用审核工作台增强版 | 投稿、管理员修正资料和同类型几何、审核、发布、图片局部审核、冲突决策、分类/Profile/图标维护、发布前阻塞检查、批量通过/驳回/发布、按“投稿审核 / 分类图标”分段的后台主线布局                                                                                         | 单分类上下文编辑体验需补齐；仍缺真实瓦片地图编辑器、道路/站点叠加、父子 POI 和代表点治理、多图素材流、多语言资料                         |
| 线路后台 | 当前版本工作台第一版 | 旧交通数据导入、校验摘要、提交、审核、发布、恢复、归档、站点坐标修正、站点绑定现有 POI、站点地图点选、线路站点序列编辑、线路/站点几何预览、瓦片底图叠加预览、当前发布版本差异摘要、交通方式 Profile、二级页默认直接展示所选版本下的线路/站点子项并通过下拉切换版本 | 仍缺自主新增/删除线路、版本容器与线路最小操作面解耦、独立轨迹点编辑、方向子线路管理、道路吸附、站点合并/拆分治理                         |
| 班次后台 | 当前版本工作台第一版 | 当前真实统一班次快照导入、校验、单班次人工修正、提交、审核、发布、恢复、归档、公开 API 优先读取已发布快照并回退实时源、二级页默认直接展示所选版本下的服务摘要和班次明细并通过下拉切换版本                                                                          | 仍缺自主新增/删除班次、版本容器与班次最小操作面解耦、批量班次编辑、班次日历/有效期模型、票务库存联动校验、来源失败时的后台告警与回滚指引 |

### 2.1 代码证据入口

- 内容后台：`apps/web/components/admin-operations-panel.tsx`、`apps/web/lib/content-workflow.ts`、`apps/web/lib/content-store.ts`、`apps/web/app/api/admin/operations/contents/**`
- POI 后台：`apps/web/components/admin-poi-panel.tsx`、`apps/web/lib/poi-submission-workflow.ts`、`apps/web/lib/poi-submission-store.ts`、`apps/web/app/api/admin/map/**`
- 线路后台：`apps/web/components/admin-transit-panel.tsx`、`apps/web/lib/transit-data-workflow.ts`、`apps/web/lib/transit-data-store.ts`、`apps/web/app/api/admin/transit/datasets/**`
- 班次后台：`apps/web/components/admin-transit-panel.tsx`、`apps/web/lib/travel-schedule-revision-workflow.ts`、`apps/web/lib/travel-schedule-revision-store.ts`、`apps/web/app/api/admin/travel/schedule-revisions/**`
- 横向审计链路：`apps/web/lib/event-outbox-store.ts`、`apps/web/app/api/admin/operations/audit-events/route.ts`、`packages/contracts/src/events.ts`

### 2.2 后台二级页布局原则

线路/班次后台这轮确认的 UI 主线如下：

1. 分段控制只用于切“业务系列”，例如“线路版本 / 班次版本 / 交通方式 / 可排班服务”，而不是拿来切“已发布 / 待审核 / 已归档”这类状态。
2. 进入某个系列后，主视图优先展示“当前选中版本”的子项工作区，也就是线路、站点、班次、服务摘要这些真正需要操作的对象。
3. 版本本身不再铺成一整页长列表，而是作为顶部工具区里的版本切换器；状态、交通方式、服务类型、关键词用于缩小切换范围。
4. 版本继续承担“导入快照、差异对比、发布容器”的职责，但线路/班次自身要能在工作区里直接新增、编辑、删除，不能只停留在版本级提交/发布动作。
5. 提交、通过、驳回、发布、恢复、归档仍然保留在当前版本工作区右侧动作列；坐标修正、站点序列修正、单班次修正继续通过弹窗进入，后续再逐步扩展到线路/班次新增和删除弹窗。

当前代码已按这套思路把 `apps/web/components/admin-transit-panel.tsx` 调整为“筛选工具 + 版本下拉 + 当前版本详情工作台”的结构，不再让版本列表抢占二级页主区域。

## 3. 核心状态机

内容与 POI 是人工创建或投稿型链路：

```ts
draft -> pending_review -> approved -> published -> archived
draft -> archived
pending_review -> rejected -> draft
pending_review -> archived
approved -> archived
```

线路与班次是导入版本型链路：

```ts
imported -> pending_review -> approved -> published -> superseded -> archived
imported -> archived
validation_failed -> archived
pending_review -> rejected -> pending_review
approved -> archived
published -> archived
```

大白话拆解如下：

```ts
function handleAdminAction(entity, action) {
  assertAdmin();
  assertTransitionAllowed(entity.status, action.nextStatus);
  assertPublishGuards(entity, action);

  const updated = store.update(entity.id, action);
  eventBus.emit(action.eventName, buildPayload(updated));

  return updated;
}
```

## 4. Event Schema

现有 `packages/contracts/src/events.ts` 已覆盖大部分事件，后续所有完善都应继续围绕以下事件边界扩展，避免 Service 之间互相 import。

```ts
interface ContentSubmittedPayload {
  contentId: string;
  revisionId: string;
  title: string;
  categoryId: string;
}

interface ContentReviewedPayload {
  contentId: string;
  revisionId: string;
  decision: 'approved' | 'rejected';
  reviewerId: string;
  reason?: string;
}

interface ContentPublishedPayload {
  contentId: string;
  revisionId: string;
  publishedAt: string;
}

interface PoiReviewedPayload {
  poiId: string;
  revisionId?: string;
  decision: 'approved' | 'rejected';
  reviewerId: string;
  reason?: string;
}

interface PoiPublishedPayload {
  poiId: string;
  categoryId: string;
  geometry: MapGeometry;
  publishedAt: string;
}

interface TransitDataRevisionPublishedPayload {
  datasetId: string;
  revisionId: string;
  publishedAt: string;
  restoredFromStatus?: 'superseded';
}

interface TransitDataRevisionStationUpdatedPayload {
  datasetId: string;
  revisionId: string;
  stationSourceId: string;
  previousCoordinate?: { x?: number; z?: number };
  nextCoordinate: { x: number; z: number };
}

interface TravelSchedulePublishedPayload {
  scheduleServiceId: string;
  revisionId: string;
  publishedAt: string;
  tripInstanceCount: number;
  restoredFromStatus?: 'superseded';
}
```

建议新增或补强的事件：

```ts
interface ContentPublishPreviewGeneratedPayload {
  contentId: string;
  revisionId: string;
  generatedBy: string;
  generatedAt: string;
  assetCount: number;
  warningCount: number;
}

interface PoiRelationUpdatedPayload {
  parentPoiId: string;
  childPoiId: string;
  relation: 'entrance' | 'exit' | 'facility' | 'building' | 'representative';
  updatedBy: string;
  updatedAt: string;
}

interface TransitLineGeometryUpdatedPayload {
  datasetId: string;
  revisionId: string;
  lineSourceId: string;
  directionId?: string;
  pointCount: number;
  updatedBy: string;
  updatedAt: string;
}

interface TravelScheduleTripEditedPayload {
  scheduleServiceId: string;
  revisionId: string;
  tripInstanceId: string;
  changedFields: Array<'departureTime' | 'arrivalTime' | 'stationNames' | 'serviceKind'>;
  updatedBy: string;
  updatedAt: string;
}
```

## 5. 完善目标

### P0：统一后台审核效率

- 内容后台已补状态、分类、关键词筛选、待审核/可发布/定时发布/已过期总览、批量提交审核、批量归档、发布快照历史、发布差异摘要、卡片级正文/素材审核提示和编辑期局部检查提示；后续继续补更细的正文质量规则。
- POI、线路、班次保持现有筛选与差异摘要能力，不再退回纯调试列表；POI 后台已补批量通过、批量驳回和批量发布第一版。
- 线路、班次后台二级页已从“版本卡片列表”收口为“当前版本工作台”：默认直接显示所选版本的线路/站点或服务/班次子项，版本通过顶部下拉切换。
- 统一后台审计视图已支持按状态、事件类型、实体、操作者、关键词筛选，可直接追踪内容、POI、线路、班次四条链路的事件出站情况。
- 所有发布按钮最终都要有发布前确认和风险摘要。
- 归档、恢复、覆盖线上版本要记录事件，并能在后台看到操作者与时间。

本轮已实现：内容后台内容记录区新增筛选、待办总览、筛选空态、发布确认摘要、发布快照历史、发布差异摘要、驳回理由弹窗、归档确认弹窗、多选、批量提交审核、批量归档，以及卡片级正文/素材审核提示、编辑期局部检查提示与空白正文提交/发布保护；统一后台审计视图在原有 Outbox 列表基础上补齐状态、事件类型、实体、操作者、关键词筛选链路；POI 后台新增多选、批量通过、批量驳回、批量发布第一版；线路后台新增基于站点坐标的线路/站点几何预览、可用瓦片底图叠加、线路站点序列编辑、站点绑定现有 POI 和站点地图点选，以及“版本切换器 + 当前版本子项工作区”第一版；班次后台新增服务摘要、班次明细搜索/人工修正，以及“版本切换器 + 当前版本班次工作区”第一版。相关文件包括 `apps/web/components/admin-operations-panel.tsx`、`apps/web/components/admin-poi-panel.tsx`、`apps/web/components/admin-transit-panel.tsx`、`apps/web/lib/content-store.ts`、`apps/web/lib/content-workflow.ts`、`apps/web/lib/transit-data-workflow.ts`、`apps/web/lib/travel-schedule-revision-workflow.ts`、`apps/web/app/api/admin/operations/audit-events/route.ts`、`apps/web/app/api/admin/transit/datasets/[revisionId]/lines/[lineSourceId]/route.ts`、`apps/web/app/api/admin/transit/datasets/[revisionId]/stations/[stationSourceId]/route.ts`、`apps/web/app/api/admin/travel/schedule-revisions/[revisionId]/trips/[tripInstanceId]/route.ts`、`apps/web/lib/event-outbox-store.ts`、`packages/contracts/src/events.ts`、`packages/schemas/src/common.ts`、`packages/schemas/src/transit.ts` 和 `apps/web/app/globals.css`。

### P1：发布前 Preview & Diff

- 内容：正文预览、素材审核状态、首页重点位、有效期、定时发布时间统一成发布前摘要。
- POI：把现有 SVG 预览升级为真实地图底图，叠加公开 POI、道路、站点、冲突候选。
- 线路：发布前展示线路、站点、坐标、缺失项、相比线上版本的增删改摘要。
- 班次：发布前展示服务类型、班次数、站点选项、来源文件、与线上版本差异。

### P2：数据治理与可回滚

- 引入更细管理员权限：内容、POI、交通数据、班次、服务入口分域授权。
- 高风险操作接入 PIN 或二次授权。
- 补全多语言字段治理，避免地点、线路、站点、内容标题后续国际化返工。
- 逐步从本地 JSON store 迁移到数据库表 + Outbox，但保持 workflow 与事件契约不变。

## 6. 高频踩坑点

- 多实例写 JSON store：两个实例同时发布版本时，可能互相覆盖。后续上数据库前，至少要保证原子写入和发布版本互斥。
- 事件与状态不一致：先发事件再写 store 会导致监听器读到旧状态。当前应坚持先落库、后发事件。
- 发布缓存未清：班次发布后如果不清查询缓存，用户会继续看到旧快照。当前 `travel-schedules` 已有清理逻辑，后续线路/POI 搜索索引也要同样处理。
- 审核通过不等于可发布：素材未审核、POI 冲突未处理、线路校验有 error、班次来源不完整时都应该拦发布。
- 恢复旧版本没有差异提示：管理员可能把已废弃站点或过期班次重新上线。恢复必须和发布一样走确认摘要。

一个典型事故是：后台把“审核通过”直接绑定“发布”，某条 POI 图片后来被投诉侵权，但系统没有图片局部状态，也没有发布事件记录，最后只能全量下线地点。当前项目已经把 POI 图片审核拆出来，后续内容素材、班次来源、线路几何也应保持这种局部治理能力。

## 7. 测试建议

不强制本轮补测试，但后续要验证健壮性时，优先覆盖这些 Test Case：

1. 状态机拒绝非法流转：例如内容 `draft -> published`、线路 `validation_failed -> published`。
2. 发布保护：内容包含未通过素材、POI 有待合并冲突、线路有 validation error、班次有 validation error 时必须失败。
3. 原子发布：发布新线路/班次版本后，旧 `published` 必须变为 `superseded`，且只能存在一个当前发布版本。
4. 恢复版本：只有 `superseded` 且无错误的版本可以恢复，恢复后缓存清理事件或方法必须触发。
5. 后台筛选：状态、分类、关键词组合过滤后，列表数量和空态一致。
6. 事件投递：每个成功 workflow 动作都写入正确事件，失败动作不能写事件。

## 8. 下一步实施顺序

1. 内容后台：继续从“局部审核提示”推进到更细的正文质量规则、首页位视觉规范校验，并在发布历史积累后优化逐字段 diff。
2. POI 后台：批量审核已补第一版，下一步把 SVG 审核预览抽象成可复用地图审核组件，再接瓦片和道路/站点参考层。
3. 线路后台：当前版本工作台、线路/站点几何预览、瓦片底图叠加和站点序列编辑已有第一版，后续接独立轨迹点编辑、方向子线路管理和道路吸附。
4. 班次后台：当前版本工作台、班次明细搜索和单班次人工修正已有第一版，后续补批量编辑、服务类型修正和班次日历/有效期模型。
5. 横向治理：统一后台审计视图的类型/实体/操作者筛选已补齐，下一步改做时间范围、事件聚合统计、失败重试和按实体跳转详情。
