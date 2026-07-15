# 后台链路完善目标与实施计划

更新时间：2026-07-15

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

本轮继续收后台日常维护体验，按以下顺序落地。原则上旧有数据、新投稿、新草稿和已发布实体都要进入同一个 `admin-content-list` 主列表语义，不能再用单独的旧数据调试列表割裂管理员的操作面：

1. 旧有线路、班次和 POI 不再在后台用独立旧数据列表呈现，而是合并进各自最主要的 `admin-content-list`。它们和新项目一样显示标题、来源、状态、摘要和操作按钮；筛选器额外提供“旧有数据”状态，便于只看导入自旧站的数据。
2. 服务入口后台支持修改或删除已经公开的自定义服务入口和系统默认入口。默认入口修改使用同 ID 本地覆盖，删除使用归档墓碑，不直接改写运行时内置常量；所有修改和删除继续记录事件。
3. POI 编辑界面支持维护图片：管理员可以替换图片 URL 或清空图片；图片局部审核状态仍保留，后续再扩展多图、对象存储和安全扫描。
4. 线路编辑弹窗改成更图形化的分段编辑体验，参考本轮附图：顶部按“基本信息 / 路线 / 班次”切换，基本信息集中维护交通方式、标识色、票价、订票链接和运营方；路线页维护折线/沿路、站点顺序、方向和途径点；班次页维护首末班车与班次条目。
5. 线路实体继续支持自定义站间路径：每一段站间路径可选择直线或沿道路走行，并允许设置一至多个途径点。单向站继续放在 stop 级元数据中，后台需明确展示和说明“某站只服务上行或下行”如何录入，而不是把它伪装成两条重复线路。
6. `transit-line-order-preview` 不再只展示前几站文字摘要，改成小地图预览，直接呈现站点顺序、缺坐标站点和自定义站间路径。
7. 加载旧有线路时，先按站点类别在既有同名标记点中查找绑定：例如公交站优先匹配公交/站点类标记，轨交优先匹配轨交/站点类标记；命中后回填 `boundPoiMarkerId`、`boundPoiLabel` 和世界坐标。
8. 修正 `admin-poi-coordinate-picker-grid` 对应的小地图瓦片偏移：瓦片层和 SVG 矢量层必须共享同一 viewBox 尺寸和缩放方式。
9. 清理后台界面中影响深色模式可读性的硬编码黑色或过深颜色，优先改为设计变量或 `color-mix`。

### 1.2 本轮实现边界

这轮先补“可维护性”和“操作面”两个最痛的缺口，不在同一轮内强行做完以下大项：

1. 不引入新的跨模块直接调用，继续沿用 `Route -> workflow -> store -> event` 的事件驱动边界。
2. 线路后台提供独立可视化地图编辑器，支持折线/沿路预览、道路吸附、站点与途径点工具、三种插入模式和节点列表维护；轨迹拖拽与方向子线路治理仍留在后续。
3. 不把所有旧有地图标记点一次性改造成完整新版 POI；本轮先让旧有 POI 进入主列表、能筛选、能查看并参与图片/基础字段维护，正式父子关系、多语言和版本化治理留到后续。
4. 服务入口的公开后修改采用“直接更新公开入口并记录事件”的轻量模式。默认入口通过覆盖记录维护，可删除但不物理删除内置定义；后续若需要更强治理，再引入公开入口变更草稿、恢复默认入口动作和二次审核。

### 1.3 2026-07-14 本轮修正准则

本轮把上轮“版本工作台”继续向“业务实体工作台”收敛。旧数据导入只作为一种批量添加线路、班次或 POI 项目的来源，不能让旧项目长期停留在次级列表或只读参考态；管理员在后台看到的核心对象应始终是线路、班次、站点和 POI 本身。

1. 旧有线路、班次和 POI 必须和新申请项目使用同一套主列表语义：可选中、可批量操作、可进入编辑或审核动作。筛选器可以保留“旧有数据/导入数据”维度，但来源不能决定它是否是一等对象。
2. 线路/班次审批粒度从“整个导入版本”下沉到“线路/班次条目”。版本或导入批次只承担批量导入、来源追踪和回滚快照职责；提交审核、通过、驳回和发布动作优先围绕具体线路或班次进行。
3. 线路编辑弹窗的线路页采用更接近图形编辑器的布局：顶部保留“基本信息 / 线路 / 班次”选项卡，线路页需要显式提供“添加站点”“添加标记点/途径点”等按钮，不能让用户只能编辑既有节点。
4. 线路后台中一个站点可以绑定多个 POI。推荐数据结构是 `boundPoiRefs: Array<{ markerId: string; label: string; categoryId?: string }>`，旧的 `boundPoiMarkerId` / `boundPoiLabel` 作为兼容字段读取，保存时应归一到数组。
5. 审计事件页面从内容后台独立出来，作为 `/admin/audit-events` 子页面；`/admin` 首页提供入口。内容后台只保留业务内容操作，不再承担横向审计入口。
6. 桌面端 `admin-content-actions` 需要允许换行、分组和横向空间释放，避免按钮区把标题、筛选或状态标签挤压到不可读。
7. 地图页 `map-marker-list-item` 的 `muted` 文案改为距离信息：优先显示到选定地点的距离，没有选定地点时显示到当前地图中心的距离。

#### 为什么旧项目难融合

旧项目之所以容易和新申请项目割裂，根因不是“旧数据天然特殊”，而是当前模型把导入版本、旧来源标记和业务实体混在一起：线路/班次以 revision 为审批对象，POI 里旧 marker 又通过独立覆盖表维护。这样会导致三个常见问题：

1. UI 列表为了避免误操作旧数据，把旧项目排除在多选和批量动作之外。
2. 状态机只认识 revision 的状态，无法表达“这一个旧线路已修正并提交审核”。
3. 旧数据缺少新版投稿的完整字段，例如图片审核、分类 Profile、绑定 POI 等，前端只能降级为只读。

本轮的修正方向是把旧来源降级为 `sourceKind`，把审批、选择、批量操作和编辑能力放回业务实体本身。导入批次只负责“从哪里来、一次导入了什么、如何回滚”，不再决定项目在后台里的地位。

### 1.4 2026-07-14 后台首页与交通后台重构方案

本轮不再继续修补“版本工作台”外观，而是把交通后台的页面模型、编辑模型和审批模型统一改成业务实体主线。改造必须满足以下验收标准：

实施状态：已完成。公开线路和班次读取也已改为聚合条目级 `published` 状态，避免只改后台按钮、前台仍依赖整版发布的伪下沉。

1. `/admin` 首页在主标题与后台入口之间增加概览模块，概览展示可直接从现有后台数据源读取的关键数量和待处理状态；不得使用模拟统计。
2. 桌面端把 `.service-entry-grid.admin-home-grid` 移到与 `aside.rail` 同类的固定侧栏位置，但去掉侧栏背景、背景滤镜和描边；移动端仍保持当前普通网格布局和阅读顺序。
3. “交通方式”和“可排班服务”合并为一个“服务配置”页签。两类配置除现有修改能力外，还必须支持新增和删除；新增、更新、删除都通过各自 workflow 持久化并发布领域事件。
4. “线路列表”和“班次列表”只展示线路或班次实体。导入版本不再作为列表切换器、审批容器或批量操作单位，只在实体的来源信息中保留批次号、导入时间等追溯字段。
5. 线路与班次的提交、通过、驳回、发布、归档全部按条目执行。列表筛选只围绕实体状态、交通方式/服务类型、来源和关键词展开；批量操作等价于逐条执行同一状态迁移。
6. `.admin-content-item.transit-entity-row` 必须允许内容和操作区自然增高、换行，任何桌面宽度下都不能裁掉编辑或删除按钮。
7. 线路编辑器只保留线路级运行方式，不允许在站间段落中切换折线/沿路。运行方式默认由交通方式决定：公交、客运默认沿路，其余默认折线；管理员仍可在线路级覆盖。
8. “添加站点”只在 `.transit-line-editor-stations` 尾部追加空站点行，不弹出输入框；空行可直接选择站点、方向和绑定位置/多个 POI。
9. 原 `.transit-line-editor-station-index` 移除。站点行中的位置按钮就是坐标/POI 编辑入口，不再保留语义重复的“插入站点”按钮。
10. “添加途径点”在同一有序节点列表尾部追加途径点编辑行。途径点行包含一组坐标输入、方向下拉和移动/删除操作；不再使用难以理解的独立 `.transit-line-segment-editor`。
11. 线路编辑器与坐标/POI 选择器必须形成正确的弹窗层级：打开子窗口时，子窗口可交互且不被父弹窗遮挡。
12. 线路“班次”页签增加运营日期规则输入框。发车时刻支持每行一个单独时刻或班次表达式：`HH:mm + HH:mm * N`；例如 `06:30 + 00:05 * 5` 展开为 `06:30、06:35、06:40、06:45、06:50、06:55`。保存时保留结构化规则或可逆原文，公开读取侧不能依赖临时 UI 解析。

#### 页面主线

```text
/admin/transit
  服务配置：交通方式 + 可排班服务（新增 / 修改 / 删除）
  线路列表：线路实体（筛选 / 多选 / 新增 / 编辑 / 删除 / 条目审批）
  班次列表：班次实体（筛选 / 多选 / 新增 / 编辑 / 删除 / 条目审批）

导入批次 / revision
  仅作为批量添加来源、追溯元数据和底层兼容存储
  不作为管理员的主导航、列表切换器或审批单位
```

#### 线路编辑节点模型

线路顺序不再由“站点数组 + 站间段编辑器”两套 UI 表达，而是统一成有序节点编辑体验：

```ts
type TransitLineEditorNode =
  | {
      kind: 'station';
      stationSourceId: string;
      direction: 'both' | 'up' | 'down';
    }
  | {
      kind: 'waypoint';
      x?: number;
      z?: number;
      direction: 'both' | 'up' | 'down';
    };
```

底层若暂时仍使用 `stationSourceIds` 与 `segmentPaths`，workflow 必须负责在统一编辑节点与兼容存储之间转换，不能把转换复杂度暴露给管理员。

#### 本轮关键事件

```ts
interface TransitModeProfileCreatedPayload {
  profile: TransitModeProfile;
  createdBy: string;
  createdAt: string;
}

interface TransitModeProfileDeletedPayload {
  profile: TransitModeProfile;
  deletedBy: string;
  deletedAt: string;
}

interface TravelScheduleServiceProfileCreatedPayload {
  profile: TravelScheduleServiceProfile;
  createdBy: string;
  createdAt: string;
}

interface TravelScheduleServiceProfileDeletedPayload {
  profile: TravelScheduleServiceProfile;
  deletedBy: string;
  deletedAt: string;
}

interface TransitDataRevisionLineCreatedPayload {
  datasetId: string;
  revisionId: string;
  lineSourceId: string;
  lineName: string;
  mode: TransportMode;
  stationCount: number;
  createdBy: string;
  createdAt: string;
}

interface TransitDataRevisionLineDeletedPayload {
  datasetId: string;
  revisionId: string;
  lineSourceId: string;
  lineName: string;
  stationCount: number;
  deletedBy: string;
  deletedAt: string;
}

interface TravelScheduleTripCreatedPayload {
  scheduleServiceId: string;
  revisionId: string;
  tripInstanceId: string;
  serviceKind: TicketableServiceKind;
  lineName: string;
  createdBy: string;
  createdAt: string;
}

interface TravelScheduleTripDeletedPayload {
  scheduleServiceId: string;
  revisionId: string;
  tripInstanceId: string;
  serviceKind: TicketableServiceKind;
  lineName: string;
  deletedBy: string;
  deletedAt: string;
}
```

高频风险点有三类：第一，删除仍被实现成直接数组过滤，导致事件审计和已发布引用丢失；第二，UI 看似按条目审批，实际仍偷偷修改整个 revision 状态；第三，发车规则只在 textarea 中展开成若干时刻，保存后无法还原规则。实现时必须分别以软删除/归档事件、独立条目状态、可逆规则字段规避。

### 1.5 2026-07-15 地图与后台交互修正清单

1. 新增线路在完成当前表单校验和创建后可直接进入地图编辑；线路弹窗中的站点坐标子窗口必须处于更高层级。
2. 地图线路聚合必须优先使用完整 `routeNodes`，沿路模式无已解析 `segmentPaths` 时不得丢弃站间途径点。
3. 可视化线路编辑器与 map 路线规划共享道路分类和坐标排序语义；道路图按线段交点拆分，并只从道路端点建立受控近邻连接。
4. 可视化线路编辑器提供追加、反向追加、就近三种插入模式。左键或触屏点按按模式插入；右键或长按按模式删除，长按提供可用时的震动反馈。
5. 线路编辑快捷键为 `V/S/R` 切换拖移、站点、途径点工具，`[/]/\` 切换反向追加、追加、就近模式，`Shift` 仅临时反转吸附状态；表单输入聚焦时不得抢占快捷键。
6. 路线结果态的覆盖层优先级固定为“分段起终点与道路名称 > 当前交互对象 > 普通 POI”。每个分段边界必须显示标记和标签，经过的短道路段也不能因长度阈值隐藏路名。
7. 线性、面性 POI 复用既有瓦片投影和审核地图预览，提供地图追加节点与撤销末节点；不显示站点工具，数值编辑器继续作为精确编辑入口。
8. `embedded-map-location-picker` 的瓦片层和 SVG 层使用同一百分比缩放；POI 主列表固定选择列和内容列，区域绑定区提高可用高度。
9. 系统默认服务入口采用覆盖记录实现编辑，采用归档墓碑实现删除。公开读取按 ID 合并默认值与本地覆盖，不能产生重复入口。
10. `/admin` 桌面入口统一使用 `.service-entry.admin-home-entry`；地图页图标按钮与路线规划头部按钮共享尺寸、背景、颜色和交互状态。

## 2. 链路状态矩阵

| 链路     | 当前状态             | 已具备能力                                                                                                                                                                                                               | 主要缺口                                                                                                         |
| -------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| 内容后台 | 可用审核台增强版     | 草稿创建/编辑、提交、审核、驳回理由、发布确认、发布快照历史、差异摘要、即时/定时发布、归档确认、批量提交/归档、素材上传/导入/审核、旧专题转换预览、首页强提醒规则和投递预览、卡片级正文/素材审核提示、编辑期局部检查提示 | 已提交内容的继续编辑链路仍需补齐；更细的正文质量规则、首页位视觉规范校验和逐字段 diff 仍可继续增强               |
| POI 后台 | 可用审核工作台增强版 | 投稿、管理员修正资料和同类型几何、审核、发布、图片局部审核、冲突决策、分类/Profile/图标维护、发布前阻塞检查、批量通过/驳回/发布、按“投稿审核 / 分类图标”分段的后台主线布局                                               | 单分类上下文编辑体验需补齐；仍缺真实瓦片地图编辑器、道路/站点叠加、父子 POI 和代表点治理、多图素材流、多语言资料 |
| 线路后台 | 条目审核工作台增强版 | 旧交通数据批量导入、线路级筛选/多选/审批/发布/归档、新增/编辑/删除、站点多 POI 绑定、统一站点/途径点节点编辑、线路级折线/沿路模式、地图预览、公开端聚合已发布线路条目、交通方式 Profile 增删改                           | 仍缺独立站点新增、道路吸附算法、方向子线路治理、站点合并/拆分治理和已发布修改的独立草稿副本                      |
| 班次后台 | 条目审核工作台增强版 | 当前真实班次快照批量导入、班次级筛选/多选/审批/发布/归档、新增/编辑/删除、运营日期规则、公开端聚合已发布班次条目、可排班服务 Profile 增删改                                                                              | 仍缺批量字段编辑、完整班次日历/有效期模型、票务库存联动校验、来源失败时的后台告警和已发布修改的独立草稿副本      |

### 2.1 代码证据入口

- 内容后台：`apps/web/components/admin-operations-panel.tsx`、`apps/web/lib/content-workflow.ts`、`apps/web/lib/content-store.ts`、`apps/web/app/api/admin/operations/contents/**`
- POI 后台：`apps/web/components/admin-poi-panel.tsx`、`apps/web/lib/poi-submission-workflow.ts`、`apps/web/lib/poi-submission-store.ts`、`apps/web/app/api/admin/map/**`
- 线路后台：`apps/web/components/admin-transit-panel.tsx`、`apps/web/lib/transit-data-workflow.ts`、`apps/web/lib/transit-data-store.ts`、`apps/web/app/api/admin/transit/datasets/**`
- 班次后台：`apps/web/components/admin-transit-panel.tsx`、`apps/web/lib/travel-schedule-revision-workflow.ts`、`apps/web/lib/travel-schedule-revision-store.ts`、`apps/web/app/api/admin/travel/schedule-revisions/**`
- 横向审计链路：`apps/web/lib/event-outbox-store.ts`、`apps/web/app/api/admin/audit-events/route.ts`、`packages/contracts/src/events.ts`

### 2.2 后台二级页布局原则

线路/班次后台这轮确认的 UI 主线如下：

1. 分段控制只切“线路列表 / 班次列表 / 服务配置”三个业务工作区，不用状态或导入批次充当导航。
2. 线路和班次页直接铺业务实体主列表；状态、交通方式/服务类型和关键词只过滤条目。
3. 导入批次不提供切换器，只在条目的“来源批次”元数据中用于审计追溯和底层 API 定位。
4. 新增、编辑、删除、提交、通过、驳回、发布和归档全部围绕线路或班次条目执行；批量操作是同一条目状态迁移的批量调用。
5. “服务配置”同时展示交通方式和可排班服务，两类配置都支持添加、修改和删除，保存时发布集合更新及增删领域事件。

当前代码已按这套思路把 `apps/web/components/admin-transit-panel.tsx` 调整为实体工作台；公开读取分别由 `published-transit-read-model.ts` 和 `published-travel-schedule-read-model.ts` 聚合已发布条目。

## 3. 核心状态机

内容与 POI 是人工创建或投稿型链路：

```ts
draft -> pending_review -> approved -> published -> archived
draft -> archived
pending_review -> rejected -> draft
pending_review -> archived
approved -> archived
```

线路与班次条目采用独立审批状态机：

```ts
imported -> pending_review -> approved -> published
imported -> archived
pending_review -> rejected -> pending_review
approved -> archived
published -> archived // 删除已发布条目时写入 tombstone
```

revision 仍保留旧的导入、校验和整版回滚状态机，仅作为兼容存储和来源批次，不再驱动主列表或日常审批。

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

interface ServiceEntryUpdatedPayload {
  serviceEntryId: string;
  updatedBy: string;
  updatedAt: string;
  changedFields: Array<
    'title' | 'description' | 'categoryId' | 'icon' | 'href' | 'openMode' | 'sortOrder'
  >;
}

interface ServiceEntryArchivedPayload {
  serviceEntryId: string;
  previousStatus: 'draft' | 'pending_review' | 'approved' | 'published' | 'rejected';
  archivedBy: string;
  archivedAt: string;
}

interface PoiSubmissionUpdatedPayload {
  poiId: string;
  updatedBy: string;
  updatedAt: string;
  changedFields: Array<
    'title' | 'categoryId' | 'iconFileName' | 'description' | 'href' | 'imageUrl' | 'geometry'
  >;
}

interface LegacyMapMarkerUpdatedPayload {
  markerId: string;
  updatedBy: string;
  updatedAt: string;
  changedFields: Array<
    'label' | 'categoryId' | 'iconFileName' | 'description' | 'href' | 'imageUrl' | 'geometry'
  >;
}

interface LegacyMapMarkerArchivedPayload {
  markerId: string;
  archivedBy: string;
  archivedAt: string;
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
