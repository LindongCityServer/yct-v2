# 地图空间、线网与路线规划架构

更新时间：2026-08-01

本文档记录雨城通 v2 地图空间模型、正规道路图、交通运营状态、站内空间、POI、路线规划与地图渲染的目标边界。它是后续实现与评审的专项依据；总需求只保留摘要，事件契约实现后仍以 `packages/contracts/src/events.ts` 为源码真相。

## 1. 本轮目标

- 允许尚未正式开通的线路、站点进入审核后的内部数据目录，使物料工作台可以提前制作物料。
- 普通地图、搜索和路线规划默认不暴露未开通线路或站点，避免误导用户。
- 把当前基于稀疏道路端点的近似轨迹升级为具有稳定拓扑的正规道路图。
- 为道路、步行通道、站内通道和跨高度连接建立方向、通行方式与高度语义。
- 为地图几何引入 `worldId`、Y 坐标和地图级默认 Y，同时兼容现有 X/Z 二维数据。
- 支持地铁站放大后的站体、通道、出入口编号、线路色半透明填充和分级标注。
- 改善路线候选的硬过滤、等价方案合并、支配淘汰和交通方式覆盖。
- 先增加只基于可连通旧中心线的打车预览，正规道路图达到验收条件后再升级为正式出租车导航。
- 在点、线、面几何编辑器中支持使用或追加当前绑定服务器玩家的位置。
- 把行政区划从普通区域 POI 中拆出，建立独立层级与边界模型。

## 2. 已确定的架构原则

### 2.1 数据职责分离

- `MapGeometry` 只描述空间形状，不承载运营状态、路由权限或显示颜色。
- 道路、步行路和站内通道是网络要素，不再仅依赖 POI 分类推断路由行为。
- 交通数据的审核发布状态与实际运营状态相互独立。
- 地图样式独立于几何保存，通过语义类型、线路绑定和缩放级别生成最终样式。
- 行政区划是独立领域实体，不继续复用区域 POI 的父子关系与详情行为。
- 业务 Workflow 只修改本领域聚合并发布事件；读取模型、路由图、搜索索引、物料目录和缓存由监听器更新。

### 2.2 几何不等于拓扑

- 两条线在 X/Z 平面相交，不代表它们可以互相通行。
- 同一有效 Y 的道路也只有在共享显式 `RoadNode` 时才能连通。
- 不同有效 Y 的道路默认不连通，只能通过匝道、楼梯、电梯、扶梯等显式连接边跨层。
- 自动算法可以生成“建议路口”，但管理员确认前不得进入正式路由图。
- 旧 `MultiPoint` 道路只能作为迁移来源和视觉参考；正规道路必须保存有序中心线。

## 3. 建议的空间模型

第一阶段采用带版本的兼容模型，旧二维 `MapGeometry` 继续可读，新写入的正规网络使用对象坐标，避免 `[x, z, y]` 或 `[x, y, z]` 的顺序歧义。

```ts
export interface WorldPosition {
  worldId: string;
  x: number;
  z: number;
  y?: number;
}

export interface MapSpatialReference {
  mapId: string;
  worldId: string;
  worldName: string;
  defaultY: number;
  verticalTolerance: number;
  defaultDrivingSpeedKmh: number;
}
```

规则：

- `effectiveY = position.y ?? spatialReference.defaultY`。
- 未填写 `y` 表示继承默认值，不在写入时强行回填，避免修改默认 Y 后遗留无法识别的旧值。
- UI 使用“高度（Y）”或“默认高度（Y）”，不把 Minecraft Y 宣称为真实海拔。
- `worldId` 参与坐标相等、空间索引、道路吸附、缓存键和路线端点判断。
- 旧 X/Z 数据迁移到管理员指定的默认 `worldId`，并继承该地图的 `defaultY`。
- 当前主地图使用内部稳定 ID `lindong-overworld`、显示名“主世界”、默认 Y `64` 和道路默认限速 `60 km/h`。这些值由后台地图空间设置维护，不从外部页面标题动态派生。
- 2026-08-01 核验的两个 uNmINeD 属性文件都只提供可变的 `worldName`：实时地图为“`[EDU] test的拷贝`”，静态地图为“临东市服务器”，均未提供稳定 `worldId` 或维度字段。

## 4. 正规道路图

```ts
export type TravelMode = 'walk' | 'drive' | 'bus' | 'coach';
export type EdgeDirection = 'both' | 'forward' | 'reverse';

export interface RoadNode {
  id: string;
  position: WorldPosition;
  kind: 'junction' | 'terminus' | 'ramp' | 'entrance' | 'crossing';
}

export interface RoadSegment {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  geometry: WorldPosition[];
  direction: EdgeDirection;
  allowedModes: TravelMode[];
  roadClass: string;
  speedLimit?: number;
}

export interface TurnRestriction {
  fromSegmentId: string;
  viaNodeId: string;
  toSegmentId: string;
  rule: 'forbidden' | 'only';
}
```

### 4.1 验收门槛

- 每条道路有稳定 ID、有序中心线、明确起终节点和默认双向属性。
- 路口通过共享节点建立，不再使用固定距离自动连通正式路由图。
- 旧道路第一次导入时按中心线处理，并默认不存在桥梁、隧道和匝道；系统把平面几何交点推断为可通行路口，同时保留“推断来源/待复核”状态，管理员可以改为不连通、跨层或匝道。
- 经管理员更正为桥梁、隧道或高架关系后，即使道路投影相交也不会误连。
- 匝道可以用不同 Y 的起终节点表达，并可设置单向和准入方式。
- 旧道路默认允许 `walk`、`taxi`、`bus`，三者共享道路拓扑但使用不同成本 Profile；人行通道、楼梯和站内区域不会被出租车或公交使用。
- POI 接入道路使用显式接入边或绑定道路，不静默吸附到无关道路。
- 道路投影允许多个 POI/站点共享。投影和站点接入边不写入公共道路图，不能被其它路线当作可穿越的道路捷径。
- 公交车辆在相邻站点之间必须 100% 使用允许公交通行的道路边；站牌到道路的距离属于乘客接驳，任一站段道路不连通时不得回退为公交直线。
- 正式路线中的每一段都能追溯到已发布的 Segment 或 Connector。
- 路网不完整时返回不可达或明确的估算结果，不把直线回退标记为沿路导航。

### 4.2 当前算法的过渡处理

- 停用“相距 100 格即自动补连接边”作为正式寻路依据。
- 自动发现的线段交点默认形成“待复核”的推断路口。对旧数据允许在后台配置的 `junctionSnapTolerance` 内，把真实道路端点吸附到另一条道路的线段；仅保留非近似平行、候选明显最接近且无歧义的端点候选，不能把任意邻近道路自动补成连接边。
- 当前客户端构图仍有 1,200 节点保护阈值。正式导入大规模旧道路时必须在后端离线预处理并按空间分区读取，不能通过移除阈值把全量 O(n²) 线段相交检测转嫁给浏览器。
- 地点接入道路与路口吸附使用不同规则：地点几何中心到道路的距离只生成显式的步行接驳段，不能改变道路拓扑；大面积 POI 应维护出入口/接驳点，避免从几何中心穿过建筑物。出租车和公交车辆段不得使用地点接驳段。
- 增加调试图层区分 `road`、`junction`、`access`、`vertical_connector` 和 `fallback`。
- 记录 `onNetworkDistance / totalDistance`，用于发现直线接入或回退占比异常，但不把该比率当成拓扑正确性的替代品。

## 5. 步行路、通道与站内空间

“通道/步行路”建模为可渲染、可寻路的线性网络要素，并允许关联所属 POI 或车站。

```ts
export interface PedestrianSegment {
  id: string;
  parentPlaceId?: string;
  fromNodeId: string;
  toNodeId: string;
  geometry: WorldPosition[];
  direction: EdgeDirection;
  connectorKind?: 'corridor' | 'ramp' | 'stairs' | 'escalator' | 'elevator';
  accessible: boolean;
  styleBinding?: MapStyleBinding;
}
```

站内路线目标是“地铁出口标记点 -> 通道 -> 站厅 -> 站台/换乘点”的显式连通图。普通出入口与地铁出入口分开：普通出入口描述建筑准入；地铁出入口必须具有 `stationId`、`ref`、通行方向和所属楼层。

## 6. 站体平面显示与可选 2.5D

不在第一阶段实现可旋转真 3D 或任意多面体编辑器。附图中的地铁站采用平面站体、通道和出入口覆盖，不对地铁站执行高度挤出。

- 站体由一个 `StationComplex` 聚合站厅、站台、通道、出入口和连接器。
- 每个站内空间部件保存楼层、有效 Y、二维轮廓和语义类型，用于楼层过滤与步行拓扑，不用于站体挤出。
- `ExtrudedPolygon` / `MultiExtrudedPolygon` 仅作为其他立体 POI 的可选 2.5D 表达，不新增 `Cube` 作为 POI 分类。
- 几何与样式分离；颜色可以是固定色，也可以绑定一条或多条交通线路。
- 地铁站放大后按 `minZoom` 展示半透明站体和通道；更高缩放再展示出入口编号、设施与站内路径。
- 出入口、站名、线路徽标参与统一碰撞避让和优先级排序，不能仅依赖 DOM 自然覆盖。
- 多线路换乘站的不同空间部件可分别绑定线路色，不能只给整个站点一个颜色。
- 同一线路允许同时包含已运营区段和规划区段。已运营区段使用线路色实线；规划区段必须同时通过颜色与虚实线型形成冗余区分，不能只依赖颜色表达状态。
- 2.5D 挤出只在“路网”和“交通”等非卫星图模式提供，并设置独立显示开关；切回卫星模式时强制使用平面覆盖，避免挤出物遮挡真实瓦片。

## 7. 运营状态与可见性

当前契约使用三种可落地状态：

```ts
export type TransitOperationStatus = 'operating' | 'planned' | 'closed';
```

- 审核状态回答“这份数据是否可信并允许下游使用”。
- 运营状态回答“设施或服务当前是否对乘客开放”。
- 线路、线路区段、车站和线路停靠关系均可保存运营状态。区段和停靠关系的显式值优先于线路或车站默认值，以支持同一线路分段开通。
- 物料工作台读取已审核发布的数据，并允许使用 `planned` 线路/站点制作预览物料；`closed` 仍可在管理与历史视图中维护。
- 普通地图是否展示 `planned` 线路区段和站点，跟随对应交通方式的 `TransitModeProfile.showPlannedSegments`；`closed` 不进入普通地图。
- 路线规划只使用 `operating` 且已公开、可通行的实体。

规划区段使用统一固定样式，不为每种交通方式配置规划色或虚线类型：

```ts
export interface TransitModeProfile {
  showPlannedSegments: boolean;
}
```

- 已运营区段始终使用线路自身颜色和实线样式。
- 规划区段统一使用地图语义灰色和虚线；线路自身颜色可以用于徽标或详情关联，但线路本体不得继续使用运营线路色实线。
- 规划区段可见时，其规划站点采用同一状态样式，并在详情中明确标识“规划中”。
- `showPlannedSegments` 只影响普通地图读取模型，不影响管理员预览和物料工作台，也不改变路线规划准入。

推荐状态流转：

```text
planned -> operating -> closed
```

审核修订仍使用现有 `draft -> pending_review -> approved -> published` 流程，两套状态不得合并。

## 8. 路线候选治理

候选处理顺序固定为：

1. 生成所有结构有效的直达和换乘候选。
2. 按已允许交通方式、运营状态和无障碍要求做硬过滤。
3. 过滤总步行距离、单段接驳距离、换乘步行距离、换乘次数、总时间和绕行比超限方案。
4. 按语义等价键合并同质线路。
5. 删除在时间、步行、换乘和费用上全面更差的被支配方案。
6. 为每个已选且存在有效结果的主要交通方式保留至少一个候选。
7. 用稳定评分填满剩余名额，再按用户选择的排序方式展示。

等价方案的建议键包含：交通方式序列、上下车站、换乘站、接入路径、站序、时间分桶和费用指纹。仅线路名称或编号不同、其余完全一致的线路合并为一个卡片，内部保留 `alternativeLineIds`；未来存在真实发车时间后，发车时间不同的服务不能错误合并。

“已选交通方式”定义为允许路线使用的方式。单选某方式时，所有公共交通结果必须包含该方式；多选时不要求每条路线包含全部方式，但结果集应尽量覆盖每个有可用候选的方式，并展示无结果原因。

## 9. 打车路线

打车第一版可以作为显式标注局限的预览能力启用；只有正规道路图通过验收后才能称为正式出租车导航。除道路方向外，至少需要：

- 出租车准入、道路等级、速度或时间成本。
- 禁止转向和仅允许转向规则。
- 跨高度匝道和不同世界隔离。
- 起终点车辆接入点、停车点和末段步行。
- 与步行、公交沿路几何分离的 Routing Profile。

第一版默认道路限速为 `60 km/h`，但不把限速当作全程恒速；缺少分段时间时按道路里程、默认速度和路口延误估算。停车点表示出租车结束并转为末段步行的位置，第一版不强制维护专用停车点，可以在目标附近的可通行道路接入点结束。转向限制表示禁止左转、禁止掉头或只允许指定转向；第一版默认没有限制，后台模型预留后再逐步补录。

在正规道路拓扑尚未成立时，打车入口只返回当前中心线图确实可达的候选；出租车车辆段只能使用道路，首尾道路外距离必须显示为步行接驳。不可达时不得用直线伪造出租车结果。

出租车计价默认规则为：起步价 9 元含 3 km；3-15 km 每满一个 450 m 计价步长加 1 元；15 km 以上部分加收 20% 返空费。起步价、距离、计价步长、返空费阈值、比例和计收范围均由后台维护。

## 9.1 路线成本与计费

- 公交和出租车分别维护默认速度及每路口延误，不能直接使用道路限速作为全程平均速度。
- 线路相邻站段允许后台维护 `travelMinutes`；优先级为人工区间用时、旧数据 `travelTime`、里程与路口延误估算。
- 公交、轮渡默认票价、轨道里程阶梯和出租车规则统一由地图空间设置维护。
- 连续地铁/有轨电车以站点为节点建立独立计费图，同一对站票价取图上的最短里程；实际乘车方案绕路不增加票价。
- 路线列表支持按时间、步行、换乘次数和票价排序；等价候选合并后仍保留可乘线路 ID。

## 9.2 安全框与自动取景

- 地图滚轮和加减按钮以安全框中心为缩放锚点，双指缩放继续以双指中点为直接操控锚点。
- 路线首次生成或切换候选时执行完整自动取景。
- 安全框边界变化时，只有用户尚未手动缩放才再次自动取景，并且不得放大当前倍率。
- 展开路线步骤详情只改变安全框，不应把规划路线几何中心强行放大到可视区域。

## 10. 玩家当前位置写入几何

- 玩家位置接口只允许选择当前登录账号已绑定且已验证的服务器玩家。
- 写入前检查 `isCurrentAccount`、`presence` 和 `observedAt`，过期或离线位置不能无提示写入。
- 点几何执行“使用当前位置”；多点和线执行“追加当前位置”。
- 多边形追加到当前活动环并保持闭合点同步；矩形使用“用当前位置设置角点/扩展边界”，不伪装成普通点序追加。
- 写入的是点击时的位置快照，不建立持续跟随玩家的动态绑定。
- 领域事件只在几何保存成功后发布；按钮点击属于客户端瞬时动作，不进入持久化 Outbox。

## 11. 行政区划

```ts
export interface AdministrativeArea {
  id: string;
  code: string;
  name: string;
  level: string;
  parentAreaId?: string;
  boundary: MapGeometry;
  labelPositionPoiId?: string;
  labelPosition?: [number, number]; // 仅兼容旧固定坐标
  maxZoom?: number;
}
```

行政区划需要独立层级、稳定代码、父区域、边界版本和标签锚点。标签默认复用区域 POI 的“区域内尽量靠近几何中心”布局算法，也可通过 `labelPositionPoiId` 跟随某个 POI 的代表位置；`labelPosition` 只兼容旧固定坐标。未设置 `maxZoom` 的旧数据按共享常量 `ADMINISTRATIVE_AREA_DEFAULT_MAX_ZOOM`（当前为 `0`）处理，避免在街区级缩放中持续占用标签空间。POI 所属行政区可通过空间计算生成读取模型，并允许管理员覆盖；不能继续把 `boundRegionMarkerIds` 当作行政区真相。

## 12. 动态编号图标

- 地铁出入口、道路编号和高速公路编号使用模板化矢量符号，不为每个编号保存一张静态图片。
- 数据保存 `symbolKind`、`ref`、颜色和可选样式变体，渲染器负责组合底板与文本。
- 默认视觉规范为：地铁出入口白底、灰边、灰字；省道编号琥珀色底、黑边、黑字；高速公路编号保留绿色底和白边，并在文字与上方白边之间显示 `#fff900` 横条，`G` 开头的高速编号使用红色横条。
- 道路/高速公路标记若存在短格式编号（例如 `S2`、`G25`）或显式 `dynamicSymbol`，在道路标签锚点的合适位置显示编号标识，而不是只显示普通文字；过长或无法确认的名称继续使用原文字/PNG 回退。
- 地图端直接渲染 SVG；物料导出端复用字体测量和 SVG/位图转换能力。
- 动态结果需要尽量完全复刻旧 PNG 的轮廓、颜色、描边、字号和留白。用户提供的 SVG 优先作为底板、专用字形或视觉基准，不把文件名继续当作业务分类依据。
- 文本必须限制字符集、长度并做自动缩放，确保编号不会溢出图标边界。

## 13. 事件契约与实现状态

```ts
export interface RoadNetworkRevisionPublishedPayload {
  revisionId: string;
  mapId: string;
  worldIds: string[];
  defaultYByWorld: Record<string, number>;
  publishedAt: string;
}

export interface RoutingGraphRebuiltPayload {
  revisionId: string;
  profile: 'walk' | 'drive' | 'transit';
  nodeCount: number;
  edgeCount: number;
  rebuiltAt: string;
}

export interface TransitOperationStatusChangedPayload {
  entityKind: 'line' | 'segment' | 'station' | 'stop';
  entityId: string;
  previousStatus: TransitOperationStatus;
  nextStatus: TransitOperationStatus;
  effectiveAt: string;
  changedBy: string;
}

export interface StationLayoutPublishedPayload {
  stationId: string;
  revisionId: string;
  levelIds: string[];
  publishedAt: string;
}

export interface AdministrativeAreaPublishedPayload {
  areaId: string;
  revisionId: string;
  parentAreaId?: string;
  publishedAt: string;
}

export interface PoiGeometryUpdatedFromPlayerPositionPayload {
  poiId: string;
  playerName: string;
  observedAt: string;
  position: WorldPosition;
  updatedBy: string;
  updatedAt: string;
}
```

上面的道路图、站内布局事件是后续正式道路实体化时的扩展契约；当前已经落地并由 `packages/contracts/src/events.ts` 注册的空间相关事件包括：

- `PoiSubmitted` / `PoiSubmissionUpdated`：携带 `spatial`，包括 world、默认高度、道路方向、通行方式、连接器、样式、立体体积和动态编号。
- `TransitDataRevisionStationUpdated`：携带站点 X/Y/Z 以及运营状态变化。
- `MapSpatialProfileUpdated`：携带 `defaultY`、`verticalTolerance`、道路成本和票价配置。
- `AdministrativeAreaCreated`、`AdministrativeAreaUpdated`、`AdministrativeAreaPublished`、`AdministrativeAreaArchived`：携带独立行政区划聚合，而不是区域 POI。

推荐监听关系：

- `RoadNetworkRevisionPublished` -> 构建各 Routing Profile、刷新道路图层、失效路线缓存。
- `TransitOperationStatusChanged` -> 更新公开交通读取模型、路线准入索引和物料目录。
- `StationLayoutPublished` -> 更新站内图层、站内路径图和地图样式缓存。
- `AdministrativeAreaPublished` -> 更新独立行政区图层、空间归属索引和搜索索引；行政区划不进入 POI 搜索和道路路由。
- POI 几何更新事件 -> 更新地图读取模型和 POI 道路接入索引。

## 14. 实施顺序

### 阶段 A：当前路线止损

- 移除正式寻路中的 100 格自动连接边。
- 区分正式道路、接入边和直线回退。
- 增加接入距离限制、候选硬过滤、等价合并和交通方式保底。
- 保持现有二维数据可用，不在此阶段一次性迁移所有 POI。

### 阶段 B：空间契约与道路 MVP

- 引入 `WorldPosition`、空间参考、道路节点/线段/转向限制 schema。
- 选择一个小区域录入真实道路中心线和路口，完成从编辑、审核、发布到路由图构建的闭环。
- 验证成功后再迁移其他道路，禁止未经 MVP 验证的大批量机械改写。

### 阶段 C：交通状态和物料可见性

- 为线路、线路区段、车站和停靠关系增加运营状态。
- 分离物料工作台、管理员预览、普通地图和路线规划读取模型。
- 为交通方式配置是否显示规划区段；规划区段统一使用灰色虚线。
- 增加状态变化事件和缓存监听器。

### 阶段 D：站内 2.5D 与通道

- 建立站体、楼层、空间部件、通道和跨高度连接器。
- 实现线路色样式绑定、半透明填充、出入口动态编号和缩放分级显示。
- 把站内网络接入步行路线。

### 阶段 E：打车与行政区划

- 补齐出租车 Profile、转向规则、停车接驳和验收路线。
- 建立行政区划独立后台、版本和地图图层。

### 当前落地边界（2026-08-01）

- 主地图默认空间配置为 `worldId=lindong-overworld`、默认 Y=64，均可在 `/admin/map-settings` 维护；旧道路按中心线、默认双向、默认允许步行/出租车/公交/客车迁移。
- 运行时旧道路图已取消邻近末端的无条件直连；只使用平面交点、受限端点吸附和显式跨层连接。独立的线路物料图、线路编辑器和公共地图图共享高度、方向与公交/客车通行过滤。
- `pedestrian-path` 作为独立线性 POI 类别，只默认允许步行；`ordinary-entrance` 与 `exit-*` 分别表示普通出入口和地铁出入口。
- POI 支持半透明填充/描边、线路色绑定、挤出矩形/多矩形/多边形体积和动态编号；2.5D 只在非卫星图层提供开关，地铁站不执行挤出。动态编号显式配置优先，旧 PNG 仍作为无法安全推导时的回退；要做到像素级复刻需要提供旧 PNG 与字形 SVG 作为视觉基准。
- 区域几何标记默认只显示填充/标签，不显示边框；选中或聚焦时恢复高亮描边，保证日常地图不被大量区域轮廓压满。
- 行政区划已有独立公共图层和管理员 CRUD/发布流程，支持父级链校验和缩放范围；它不会被当作普通区域 POI 或可寻路道路。

## 15. 核心验证用例

- 两条道路在 X/Z 相交但 Y 不同，路线不得换路。
- 两条同 Y 道路相交但没有共享路口节点，路线不得换路。
- 单向道路反向不可达，双向道路两个方向均可达。
- 匝道连接不同 Y 后，允许的交通方式可以跨层，其他方式不可跨层。
- POI 绑定指定道路后，不得被吸附到更近但无关的道路。
- 路网不连通时返回不可达或显式估算，不生成长距离伪连接。
- 多个仅线路编号不同的同质方案合并，并保留所有可乘线路。
- 被选交通方式有有效候选时，最终结果集中至少保留一个该方式方案。
- 未开通线路可在物料工作台使用，但不进入普通地图搜索与路线规划。
- 同一线路的已运营区段显示为线路色实线，规划区段统一显示为灰色虚线；关闭某交通方式的规划显示后只隐藏该方式的规划区段。
- 离线或过期玩家位置不能追加到几何；有效当前位置按几何类型正确写入。
- 站内出口到站厅、站台的路径只能通过已声明通道和跨层连接器。
- 行政区边界更新后空间归属读取模型可重建，原始 POI 不被直接改写。

## 16. 已拍板结论与后续输入

- 当前主世界使用内部稳定 ID `lindong-overworld`，默认 Y 为 `64`，后台允许修改显示名、默认 Y 和道路默认限速。
- 第一阶段不做可旋转真 3D。地铁站使用平面站体覆盖；其他立体 POI 的 2.5D 挤出仅用于非卫星模式并提供开关。
- 旧道路默认作为中心线导入，平面交点默认推断为待复核路口；默认不存在桥梁、隧道和匝道，管理员在后台更正推断结果。
- 道路默认限速为 `60 km/h`，第一版不强制停车点且默认没有转向限制。
- 动态编号图标尽量完全复刻旧 PNG，后续需要收集代表性 PNG 以及可用的底板、数字和字母 SVG。
- 规划区段统一使用灰色虚线，是否显示跟随各交通方式的 `showPlannedSegments` 设置；已运营区段继续使用线路色实线。
