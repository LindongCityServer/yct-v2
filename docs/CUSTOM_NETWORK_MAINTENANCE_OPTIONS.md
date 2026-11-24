# 自定义线网维护与 OpenMap 导入：四个方案（讨论稿）

> 状态：讨论稿，未排期。2026-11-23 已回填决策：单用户单线网、拓扑只读、出口走 T2 填模板库空位、结构供动态导览（楼层条后续做）。
> 日期：2026-11-23
> 范围：用户上传的自定义线网（当前仅 RMP）的维护界面、车站结构/出口、运营单位与标志、OpenMap 工程/OM 包导入
> 不在本稿范围：官方线网后台的编辑能力本身、物料模板全部改版、QQ 机器人侧改动

---

## 0. 结论先行

1. **现状不是一个“维护界面”，而是一个“补名对话框”**：线路只能填主/副名，车站只能给**未命名站**填主/副名，拓扑完全只读，没有车站详情、没有出口、没有运营单位、没有标志。
2. 现有数据模型是**为 RMP 量身定做的快照**（`format: 'rmp'` 是字面量），不是“线网文档”。直接往上加字段，会在第三次扩展（OpenMap、车站结构、运营单位）时变成一锅补丁。
3. 给出四个方案：
   - **A 补丁层扩展**：最小改动，1–2 周可上线，但天花板很低；
   - **B 线网资料中心**（推荐）：源文件 / 规范图 / 资料层三层文档 + 独立维护工作台；
   - **C 并入官方线网域**：复用后台车站详情模型与 UI，但坐标、身份、权限三处对不上；
   - **D OpenMap 原生托管**：保真度最高，但要引入第二个渲染器与 JS 沙箱。
4. **推荐 B，但按已定决策瘦身**：不做多线网列表、不做几何编辑器；工程量集中到“资料层 + 出口 → 导视牌 + 重导入合并 + 源文件留存”。分期见 §7.3。
5. **已定决策（2026-11-23）**：一个用户一个线网；拓扑不允许在线微调；车站出口走 T2（填模板库出口模板的空位）；车站结构供后续“旧版动态线路图 → 动态导览工作台”使用，动态导览确定要做楼层条（S2），但排期在后。
6. 这三条决策砍掉了“多线网”和“几何编辑”两块，但也把两件事抬成了硬要求：**出口必须能进模板**（否则资料没人用）、**重新导入必须能合并**（单线网没有“另存一份”的退路）。

---

## 0.1 决策带来的范围变化

| 已定决策               | 砍掉/推迟                                     | 抬高为硬要求                                            |
| ---------------------- | --------------------------------------------- | ------------------------------------------------------- |
| 单用户单线网           | 线网列表、配额、多项目切换（P3 以后再谈）     | 导入历史、回滚、导出备份：单线网一旦覆盖就没有退路      |
| 拓扑不允许在线微调     | 几何编辑器、拖拽挪站、折点编辑                | 导入是拓扑的唯一入口；重导入合并必须可靠                |
| 出口走 T2 填模板库空位 | 独立出口牌模板、新的 `exitList` 元素类型      | 出口字段要够模板生成用；出口编号要按自然序/方位填入空位 |
| 结构供后续动态导览     | 结构剖面图、站层图渲染（P3 随动态导览一起做） | 结构字段要能支撑“文字资料卡 + 楼层条”两种形态           |

因此 P1 的验收标准不再是“资料能存”，而是“**选一个站，模板库里的出口模板能自动填上正确出口；重新导入同一份工程，已填资料还在**”。

---

## 1. 现状：为什么“维护界面”不够用

### 1.1 当前链路（一句话版）

RMP JSON → 浏览器端 `parseRmpTransitNetworkProject()` → `MaterialTransitNetworkSnapshot` → `POST /api/materials/transit-network-projects` → 单个 JSON 文件 → 物料工作台消费。

证据：

- 解析入口：`apps/web/lib/rmp-transit-network.ts:76-128`；上限 v77 / 5MB / 2,000 节点 / 4,000 边（`:9-10`、`:87-101`）。
- 快照 schema：`packages/schemas/src/materials.ts:479-517`；更新 schema 只允许 `lineNames` / `stationNames` 两类字段（`:524-543`）。
- 存储：`apps/web/lib/material-transit-network-project-store.ts`，单 JSON 文件全量重写，仅进程内 Promise 队列串行化。
- **每用户只有一个项目**：`apps/web/lib/material-transit-network-project-workflow.ts:39-47` 取 `listForUser()[0]` 并复用其 `id`，重新导入等于覆盖。

### 1.2 维护界面真实能力

| 能力                                  | 现状                                                       | 证据                                                             |
| ------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------- |
| 线路名                                | 弹窗，逐线填「主名称 / 副名称」                            | `apps/web/components/transit-network-source-control.tsx:782-872` |
| 车站名                                | 弹窗，**只列 `names` 为空的站**，逐站填「主站名 / 副站名」 | 同文件 `:143-147`、`:874-967`                                    |
| 车站结构（地下/高架、站台形式、楼层） | 无                                                         | —                                                                |
| 出口（编号/楼层/方位/状态/说明）      | 无                                                         | —                                                                |
| 运营单位（中英文名、外链）            | 无；物料侧 `operator` 被写死为空串                         | `apps/web/lib/material-transit-source.ts:675`                    |
| 运营单位标志 / 线路徽标               | 无                                                         | —                                                                |
| 批量导入/导出（CSV/JSON）             | 无                                                         | —                                                                |
| 搜索、筛选、完整度、撤销              | 无                                                         | —                                                                |
| 重新导入时保留已填资料                | 无（整份覆盖）                                             | workflow `:39-47`                                                |

站名数组 `names` 最多 8 项，但 UI 只使用下标 0（主名）和 1（副名）；物料侧缺英文时用拼音兜底（`apps/web/lib/material-transit-source.ts:405-409`、`:649-650`）。所以“中英文名”实际上是“主名 + 副名”的一种用法，不是真正的多语言模型。

### 1.3 五个结构性问题

1. **模型绑死来源**：`format: 'rmp'` 是字面量，OpenMap 工程没有合法落点；`version` 的语义也按 RMP 解释。
2. **没有“车站实体”**：车站只是图上的一个 node，名称之外没有任何挂载点；出口/结构要么塞进 node（污染几何），要么另建一张永远对不齐的表。
3. **没有身份与来源留存**：不存原始文件、不算内容摘要、节点 ID 直接来自 RMP 的 `stn_xxx`；用户回 RMP 改一次图再导入，已填资料无法合并。
4. **单体 JSON 存储**：所有项目塞进一个文件、全量重写；加标志图片会把 JSON 撑爆，导入历史也没有地方放。单线网是产品决策，但存储仍要按项目分目录。
5. **UI 是“补名”而不是“编辑”**：没有列表、没有搜索、没有详情页、没有“先跳过以后再来”的恢复路径；新用户面对 200 个匿名站只能一屏一屏翻。

---

## 2. 目标、原则与非目标

### 2.1 用户任务（按发生顺序）

1. **导入**：把自己的 RMP / OpenMap 线网丢进来，立刻能用。
2. **补全**：补站名、英文名、车站结构、出口、运营单位与标志。
3. **出图**：物料工作台选线/选站，生成导视牌、线路图。
4. **回头改**：过几天回来继续补；换设备/重新登录能看到。
5. **重新导入**：在 RMP / OpenMap 里改了图，重新导入后**资料不丢**。
6. **带走**：导出自己的资料（JSON/CSV），不被平台锁死。

### 2.2 设计原则

1. **拓扑只读、资料可编辑**：几何以外部工具为准，平台不承担“在线改图”；这样责任边界清晰，也避免与 RMP/OpenMap 互相覆盖。
2. **源文件留存 + 可重导入合并**：原始文件、摘要、导入历史必须存；合并时“只增不删、冲突让用户选”。
3. **渐进披露、不阻塞出图**：任何资料字段都可为空；缺字段时物料侧走现有兜底，不弹“请先补全”。
4. **字段语义对齐官方线网**：车站结构/出口尽量复用 `transitStationDetailUpdateSchema` 的字段名和枚举，未来“发布到官方线网”是映射而不是重写。
5. **资产与文档分离**：图片走内容寻址的独立存储，JSON 里只放引用。
6. **兼容现有渲染层**：物料侧继续消费 `MaterialTransitNetworkSnapshot`，新模型通过一个纯函数投影过去，避免一次性改几十处消费点。

### 2.3 非目标（至少 v1 不做）

- 在线编辑拓扑（挪站、连线、改折点）。
- 与 OpenMap 双向无损往返（先做“能读进来”，不承诺“能写回去”）。
- 公共线网市场/社区共享（先把私有维护做顺）。
- 车站结构剖面图、3D、实时客流等重资产能力。

---

## 3. 方案 A：补丁层扩展

### 3.1 做法

保留现有 `MaterialTransitNetworkSnapshot`，在快照旁边加一个可选的“资料层”，仍然一次 PATCH 保存：

```ts
// packages/schemas/src/materials.ts（示意）
const snapshotSchema = z.object({
  format: z.enum(['rmp', 'openmap']),      // 原来是 z.literal('rmp')
  version: z.number().int().positive(),
  nodes: ...,
  edges: ...,
  lineNames: ...,
  lineProfiles: z.array(...).optional(),    // 运营单位、颜色、徽标
  stationProfiles: z.array(...).optional(), // 结构、出口
  operators: z.array(...).optional(),
});
```

- UI：保留两个弹窗，另加一个「线网资料」大弹窗，内部三个 tab（车站 / 线路 / 运营单位）。
- 导入：新增 `parseOpenMapProject()`，把 OpenMap 工程转成同一套 `nodes/edges`，`format: 'openmap'`。
- 存储/接口基本不动，只扩 update schema 和 `changedFields`。

### 3.2 优点

- 改动面最小，现有物料渲染零改动；1–2 周可上线。
- 不需要数据迁移（旧项目仍合法）。
- 可以先验证“用户到底会不会补结构/出口”这个假设。

### 3.3 缺点

- **没有解决身份问题**：重新导入仍然整份覆盖，资料只能靠节点 ID 碰运气。
- **没有解决来源问题**：不存原文件，OpenMap 的折点、水域、图例、虚拟换乘只能丢弃。
- **没有解决资产问题**：标志图片塞不进 JSON；要么另起一套存储（那已经走到 B 了），要么只存外链。
- **schema 会变成格式并集**：`lineProfiles` / `stationProfiles` 同时服务 RMP 和 OpenMap，字段语义会越来越含糊。
- 单体 JSON 的天花板还在：导入历史、资产、备份都没有位置。

### 3.4 适合什么时候选

只想用最小成本验证需求，或者明确“短期不会做 OpenMap / 不会做标志上传”。在“单线网 + 拓扑只读”的前提下，A 比之前更可行：只要再做一层“重新导入按站名合并”，就能覆盖出口牌的第一批场景。但它仍然没有解决源文件留存和资产存储，一旦要结构预览、标志、导出备份，就会滑回 B。

---

## 4. 方案 B：线网资料中心（推荐）

### 4.1 一句话

把“自定义线网”从**一份 RMP 快照 + 两列覆盖名**升级为**一份可版本化的线网文档**：源文件、规范图、资料层分开存；物料侧继续吃投影出来的旧快照。

### 4.2 三层结构

```
┌─────────────────────────────────────────────────────────┐
│ 1. 源文件层 SourceArtifact                                │
│    原始上传（RMP JSON / OpenMap 工程 JSON / OM 包 ZIP）    │
│    + 摘要 sha256 + 格式/版本 + 许可与来源 + 导入时间        │
├─────────────────────────────────────────────────────────┤
│ 2. 规范图层 CanonicalGraph                                │
│    nodes / edges / routes（站序、分支）/ 可选折点           │
│    统一坐标与 ID；物料渲染的唯一几何来源                    │
├─────────────────────────────────────────────────────────┤
│ 3. 资料层 Profiles                                        │
│    lines（名称/颜色/运营单位/徽标）                        │
│    stations（名称/结构/出口/设施/换乘/备注）                │
│    operators（中英文名/外链/标志）                         │
│    assets（内容寻址的图片）                                │
└─────────────────────────────────────────────────────────┘
              │ toMaterialSnapshot(document) 纯函数投影
              ▼
   MaterialTransitNetworkSnapshot（现有物料层，不改）
```

关键点：**旧快照不消失，降级为“投影/缓存”**。这样 `material-transit-source.ts`、`rmp-transit-network.ts` 的线路选择、站序、配色逻辑可以原样复用，迁移风险最低。

投影的两个语义细节：

- `snapshot.format` 建议从 `z.literal('rmp')` 扩成 `'rmp' | 'openmap' | 'custom'`。现有消费方并不读这个字段（只有解析器写入、schema 校验），改动只影响类型与测试。
- `snapshot.version` 继续表示**源格式的版本**（RMP v77 / OpenMap v1），不要拿它当文档版本；文档版本用 `schemaVersion`。

### 4.3 数据模型草案

```ts
interface CustomNetworkProject {
  schemaVersion: 2;
  id: string;
  ownerId: string;
  title: string; // 用户可改，如“我的苏州线网”
  source: NetworkSourceMeta; // 最近一次导入
  graph: NetworkGraph;
  lines: LineProfile[];
  stations: StationProfile[];
  operators: OperatorProfile[];
  assets: AssetMeta[];
  importHistory: ImportRecord[]; // 最多保留 10 条
  createdAt: string;
  updatedAt: string;
}

interface NetworkSourceMeta {
  kind: 'rmp' | 'openmap-project' | 'openmap-bundle' | 'legacy-rmp';
  fileName: string;
  digest: string; // sha256
  formatVersion: string; // RMP v77 / OpenMap v1
  importedAt: string;
  license?: { name: string; url?: string };
  cityId?: string; // OM 包
}

interface NetworkGraph {
  nodes: Array<{
    id: string; // 规范 ID：`node:${sourceId}`
    kind: 'station' | 'junction';
    names: string[]; // [主名, 副名?]
    x: number;
    y: number;
    lineKeys: string[];
    lineColors: string[];
    status?: 'operating' | 'planned' | 'closed';
    sourceType?: string; // OpenMap 的 dot/tsf/no，保留诊断
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    lineKeys: string[];
    colors: string[];
    pathKind: 'simple' | 'diagonal' | 'perpendicular' | 'rotate-perpendicular' | 'unknown';
    points?: Array<{ x: number; y: number }>; // v2 新增：OpenMap 折点
  }>;
  routes: Array<{
    lineKey: string;
    nodeIds: string[];
    branches?: Array<{ label: string; nodeIds: string[] }>;
  }>;
}

interface LineProfile {
  lineKey: string;
  name: string;
  secondaryName?: string;
  color?: string;
  operatorIds?: string[]; // 支持共线运营，最多 3 家
  badgeAssetId?: string; // 用户上传的线路徽标
  badgeRef?: string; // OpenMap 的 svg 标识（如 icon@12），原样保留、不解析资源
}

interface StationProfile {
  nodeId: string;
  structure?: StationStructure;
  exits?: StationExit[];
  facilities?: StationFacility[];
  transfers?: StationTransfer[];
  note?: string;
  updatedAt?: string;
}

interface OperatorProfile {
  id: string;
  name: string; // 中文全称
  nameEn?: string;
  shortName?: string;
  logoAssetId?: string;
  url?: string;
}
```

### 4.4 界面信息架构

单线网，所以不做列表页，直接一个「我的线网」页（入口：账号页 + 物料工作台“线网数据”卡片）：

```
我的线网（/account/network）
├─ 概览：名称 / 来源 / 许可 / 线路数 / 站数 / 完整度 / 最近更新
├─ 线路：列表 + 名称/副名/颜色/运营单位/徽标
├─ 车站：搜索 + 筛选（缺名/缺英文/缺结构/缺出口/未开通）
│   └─ 站点详情抽屉：基本信息 | 结构 | 出口 | 设施 | 换乘 | 备注
├─ 运营单位：CRUD + 标志上传 + 被哪些线路引用
├─ 导入记录：每次导入的摘要、变更统计、回滚到上一版
└─ 导出：JSON / CSV（站点表、出口表）
```

单线网下，“导入”就是“替换当前线网”。入口需要明确写“重新导入会更新拓扑，已填资料按站名/ID 合并”，并在导入前提供“先导出备份”。

物料工作台的入口保留：“线网数据”卡片上的「配置线路名称」「补全站名」不删，改成跳转到对应页签/抽屉，老用户不用重新学。

### 4.5 导入流程

```
选择/拖入文件
  → 嗅探格式（RMP / OpenMap 工程 / OM 包 ZIP）
  → 解析 + 校验（纯函数，客户端或服务端）
  → 预览摘要：X 条线、Y 站、Z 站缺名、哪些特性会丢失
  → 用户选择：[先出图] / [开始补全]
  → 落库：源文件 + 规范图 + 资料层
  → 发布事件 CustomNetworkImported
```

### 4.6 重导入合并（B 的核心卖点）

1. 用 `source.digest` 判断是否同一份文件；相同则提示“没有变化”。
2. 同格式：按源节点 ID 对齐，资料原样保留。
3. 跨格式（RMP ↔ OpenMap）：按「站名 + 所属线路 + 坐标距离」做候选匹配，低于阈值不自动合并。
4. 新增节点：新建空资料。
5. 消失节点：资料标记为 `orphaned`，**不删除**；界面提示“3 份资料暂时没有对应车站”，可手动指派或导出。
6. 应用前展示 diff：新增/删除/改名/移动各多少；用户确认才写入。
7. 每次导入写一条 `ImportRecord`；P1 先保证记录可查，回滚 UI 放 P2。

### 4.7 优点

- 真正解决“重导入资料不丢”，这是单线网模式下用户愿意持续维护的前提（没有“另存一份”的退路）。
- OpenMap 的折点/分支/未开通段有地方放；水域/图例/装饰图可以先存 extras 或原文件，后续再决定消费。
- 资料层与渲染层解耦，物料侧几乎不改。
- 为导出备份、后续“发布到官方/群共享”留了基础；多线网以后要加，也不用再改文档模型。

### 4.8 缺点与风险

- 工作量最大：schema、迁移、存储、导入器、编辑 UI 都要动。
- 需要一次数据迁移（旧 RMP 项目 → 文档 v2），必须可回滚。
- 资产上传引入审核、安全、配额问题。
- 如果产品其实只需要“补几个字段”，B 会显得过度设计。

### 4.9 工作量

- P1（单线网资料页 + 结构/出口 + 模板库出口空位填充 T2 + 运营单位文本 + OpenMap 工程 JSON + 完整度）：**L，约 2–2.5 个迭代**。
- P2（标志资产 + OM 包 + 服务端解析 + 跨格式合并 + 导出/回滚）：**再 1.5–2 个迭代**。
- P3（结构楼层条、城市目录、原图预览）：按动态导览工作台的排期另算。

---

## 5. 方案 C：并入官方线网域

### 5.1 做法

不复用 RMP 快照，直接把用户线网建模成一份**私有的、待审核的官方线网数据集**：

- 线路用 `transitLineDraftSchema`（`packages/schemas/src/transit.ts:206-306`）；
- 车站详情用 `transitStationDetailUpdateSchema`（`:491-536`，已有楼层、设施、换乘、出口）；
- 录入后台或抽出来的同一个 `TransitStationDetailDialog`（`apps/web/components/admin-transit-panel.tsx:4256-5360`，约 1,100 行）；
- 存成 owner-scoped 的 draft dataset，审批后可以“发布”为官方数据。

### 5.2 优点

- **字段与 UI 全是现成的**：楼层剖面、设施轨道、出口列表、站厅侧、朝向、自动判向（`lib/transit-station-exits.ts`）都能直接用。
- 运营单位、外链、线网健康度、线路图、站点搜索等官方能力天然共享。
- 给用户一条“我维护的线网可以进入官方线网”的上升通道，激励最强。
- 只有一套线网语义，长期不会分裂。

### 5.3 缺点

- **坐标体系对不上**：官方线路是地图坐标 + `routeNodes/waypoints`（`transit.ts:39-49`），RMP/OpenMap 是示意图像素坐标；强行换算会失真。
- **身份对不上**：官方车站详情靠 `lineName + stationName` 匹配（`lib/transit-station-detail-match.ts:3-18`），不认节点 ID；重名站、改名站会错配。
- **UI 耦合深**：详情弹窗依赖 revision、lineSourceId、POI 绑定、地图 marker；自定义线网没有 POI，`placeMarkerId/roadMarkerIds` 只能留空。
- **权限与审批语义复杂**：用户草稿、管理员审核、发布、回滚，等于把后台的治理模型搬给 C 端。
- 后台面板 6,000+ 行，抽出通用组件的成本不比 B 小。

### 5.4 适合什么时候选

产品方向是“用户共建官方线网”，且愿意接受示意图坐标与地图坐标分离、先不做地图叠加。否则不建议。

---

## 6. 方案 D：OpenMap 原生托管

### 6.1 做法

把 OM 包/工程 JSON **原样存下来**，不转成 RMP：

- ZIP 里的 `openmap_project.json` + `data_*.js` 作为源；
- 用 OpenMap 引擎（iframe + sandbox，或把渲染层移植过来）直接画图；
- 车站结构/出口/运营单位作为 sidecar，按 OpenMap 的 station ID 挂上去；
- 物料侧仍然需要一份“规范图”，由 sidecar + 解析结果生成。

### 6.2 优点

- **保真度最高**：折点、圆角、并行线、水域、图例、虚拟换乘、未开通段全部保留。
- 导入最快：不用做有损转换。
- 与 OpenMap 生态一致，未来可以接他们的城市数据、题字、出入口模块。
- 如果目标是“在线看线网/分享线网”，这是最短路径。

### 6.3 缺点

- **执行第三方 JS 的安全问题**：OM 包的 `data_*.js` 是脚本；`eval`/`new Function` 等于 RCE。必须沙箱化（独立域名/无同源权限的 iframe + CSP，或换成字面量解析器；`sandbox="allow-scripts allow-same-origin"` 不构成隔离）。
- **两个渲染器**：OpenMap 一套、物料一套；站名排版、配色、交互都要维护两份。
- **物料侧仍要转换**：导视牌只需要站序/站名/线路色，但“转换”这一层跑不掉，等于 D 也要做 B 的一半。
- **图元资源仍会丢**：OM 包不带 `assets/`，`scattered` 里的图片路径是相对站点根的，解包后无法直接渲染；要做完整预览，得让用户另外提供资源目录，或只能看“无线网装饰物”的简版。
- **上游漂移**：OpenMap 版本更新快（工程 `version` 目前只是占位，没有迁移机制），跟着升级有成本。
- **许可**：引擎开源，但城市数据常是 CC BY-NC-SA 等；用户上传的城市数据不能默认当自有数据分发。

### 6.4 适合什么时候选

“在线看线网/分享”是主场景，物料是附加；或者只想先让用户把 OpenMap 作品搬进来展示。

---

## 7. 对比与推荐

### 7.1 对比表

| 维度              | A 补丁层         | B 资料中心                     | C 并入官方域     | D 原生托管        |
| ----------------- | ---------------- | ------------------------------ | ---------------- | ----------------- |
| 新用户上手速度    | ● 快             | ◐ 需建设                       | ○ 后台感重       | ● 拖包即看        |
| 车站结构/出口扩展 | ◐ 能塞，但无实体 | ● 原生支持                     | ● 现成字段       | ◐ sidecar         |
| 运营单位/标志     | ○ 只能外链       | ● 原生支持                     | ◐ 文本有，标志无 | ◐ sidecar         |
| OpenMap 保真      | ○ 基本丢光       | ◐ 折点/分支可留，装饰存 extras | ○ 坐标失真       | ● 原样            |
| 重导入资料不丢    | ○                | ●                              | ◐ 靠名称匹配     | ● 按源 ID         |
| 与现有物料兼容    | ● 零改动         | ● 投影兼容                     | ◐ 要改消费层     | ○ 要转换          |
| 实现量            | S–M              | L                              | XL               | M–L               |
| 长期风险          | 高（补丁堆叠）   | 中低                           | 高（耦合/权限）  | 高（安全/双渲染） |
| 最适合            | 快速验证         | 产品主线                       | 官方共建         | 在线看图          |

### 7.2 推荐

**主线选 B，分三期；字段命名借 C，预览能力留 D 的口子。**

- B 解决的是“可持续维护”：来源、身份、合并、资产、导出都有位置。
- 已定决策下，B 的 P1 不是“完整资料中心”，而是“**单线网资料页 + 出口闭环**”：先把出口送进导视牌模板，证明资料层有价值，再补标志/OM 包/结构渲染。
- 借 C 的字段：`overGround`、`platformSide`、`layers`、`facilities`、`transfers`、`exits` 的命名和枚举尽量照抄 `transitStationDetailUpdateSchema`，未来做“发布到官方线网”时只写映射，不重造语义。
- 留 D 的口子：源文件原样留存；如果以后要做“在线预览 OpenMap 原图”，直接把 ZIP 交给沙箱渲染，不需要重新导入。
- A 只作为“第一周先让字段能存”的过渡，不作为最终架构。

### 7.3 分期路线

**P0 地基（S，约 3–5 天）**

- 定 schema v2（文档 / 图 / 资料 / 资产引用）。
- 定单线网语义：导入 = 替换拓扑 + 按 ID/站名合并资料；保留最近 3 份源文件与 10 条导入记录；替换前自动导出一份资料备份。
- 旧 `material-transit-network-project-store.json` 迁移脚本：`snapshot` → `document`，`format: 'rmp'` → 源元数据；保留旧文件备份。
- 存储改为按项目分目录 + 原子写（临时文件 + rename）。
- 加接口 body 上限（当前 `POST` 没有应用层上限，`apps/web/app/api/materials/transit-network-projects/route.ts` 直接 `request.json()`，是个隐患）。

**P1 出口与资料 MVP（L，约 2–2.5 周）**

- 单页「我的线网」+ 车站列表/筛选 + 站点详情抽屉（基本信息 / 结构 / 出口）。
- 车站结构（形式/站台/楼层/备注）+ S1 文字资料卡预览；出口（编号/楼层/方位/状态/说明/地标/服务线路）。
- 模板库出口空位填充（T2）：`buildMetroWayfindingTemplateExamples()` 接收当前站出口，把出口类模板里的 `b.large('')` 空位填成实际出口编号（服务器线网出口放 P2，需要额外拉站点详情）。
- 运营单位中文名/英文名/外链 + 线路绑定（标志上传放 P2，模板暂无 logo 槽位）。
- OpenMap 工程 JSON 导入（客户端解析，先不做 ZIP）+ 同格式重导入按 ID 合并 + 替换前自动备份。
- 完整度与“可渲染出口数”；物料侧改为从文档投影。
- 验收：导入一份 OpenMap 工程，补 10 个站的出口，打开模板库选出口类模板时空位自动出现 A/B/C，选中后牌面即成品（关闭出口不出现、按线路过滤正确），刷新/换设备后仍在；重新导入同一份工程，资料不丢。

**P2 资产与导入增强（M，约 1.5–2 周）**

- 运营单位标志上传 + 内容寻址资产存储 + 资料中心内预览（模板 logo 槽位另排）。
- OM 包 ZIP 导入（服务端解析 + 源文件留存 + 摘要）。
- 跨格式合并（RMP ↔ OpenMap 按名称+线路+距离）+ diff 确认 + 导入历史与回滚。
- 导出 JSON / CSV（先导出再覆盖的备份路径）。
- 安全：ZIP bomb/路径穿越/条目数/解压体积限制；`data_*.js` 只做字面量解析，绝不执行。
- 验收：ZIP 拖入 30 秒内出摘要；删掉 3 个站再导入，提示“3 份资料待指派”，不静默删除。

**P3 动态导览与生态（按需）**

- 车站结构 S2 楼层条/剖面，随“旧版动态线路图 → 动态导览工作台”移植一起做。
- OpenMap 城市目录的 `data_exits.js` / `data_facilities.js` 导入（预填出口/设施）。
- OpenMap 原图预览（沙箱 iframe）。
- 发布到群/官方线网（复用 C 的审批模型）。
- 多线网（如果以后改主意）、分享链接、协作编辑。

### 7.4 P1 改动面（预估）

| 层        | 文件                                                                                           | 改什么                                                                         |
| --------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Schema    | `packages/schemas/src/materials.ts`                                                            | 文档 v2、`StationProfile` / `StationStructure` / `StationExit`、导入与更新输入 |
| Contracts | `packages/contracts/src/domain.ts`                                                             | 文档/资料类型；`changedFields` 扩展                                            |
| 存储      | `apps/web/lib/material-transit-network-project-store.ts`（或新 store）                         | 单项目分目录、原子写、旧 snapshot 迁移                                         |
| 业务      | `apps/web/lib/material-transit-network-project-workflow.ts`                                    | 读写文档、重新导入合并、导入历史                                               |
| 接口      | `apps/web/app/api/materials/transit-network-projects/**`                                       | 文档读写、导入、导出；body 上限                                                |
| 解析      | 新建 `apps/web/lib/openmap-transit-network.ts`；`rmp-transit-network.ts` 复用                  | OpenMap 工程 JSON → 文档；RMP 保持                                             |
| 前端      | 新建 `apps/web/components/transit-network-workspace.tsx`、`transit-station-profile-editor.tsx` | 单页资料中心、车站列表、出口表                                                 |
| 入口      | `apps/web/components/transit-network-source-control.tsx`                                       | “管理线网”入口、`accept` 扩展、资料传递                                        |
| 物料      | `apps/web/components/material-studio-panel.tsx`、`apps/web/lib/material-transit-source.ts`     | 传 `StationProfile`、套用 `exits`、运营单位文本                                |
| 模板      | `apps/web/lib/metro-wayfinding-examples.ts`、`apps/web/components/material-studio-panel.tsx`   | 出口类模板空位填充（T2）、`metroExampleStations` 补 `exits`                    |
| i18n      | `apps/web/lib/i18n-catalog.ts`                                                                 | 简中/繁中/英文                                                                 |
| 测试      | 新建 `scripts/checks/verify-custom-network.ts`                                                 | 解析、合并、出口排序/过滤、渲染快照断言                                        |

当前自定义线网链路没有自动化测试；P1 至少要把“解析 → 合并 → 出口过滤”做成纯函数测试，否则后面的导入格式扩展不可控。

---

## 8. 关键设计细节

### 8.1 车站结构：字段怎么定

原则：**先够用，再对齐官方**。v1 只做“看得懂、填得动”的字段，设施/换乘可以留到 v2。

```ts
interface StationStructure {
  position?: 'underground' | 'elevated' | 'ground' | 'mixed';
  platformType?: 'island' | 'side' | 'stacked' | 'twin-island' | 'side-stacked' | 'other';
  platformCount?: number;
  overGround?: boolean; // 对齐官方 transit.ts:494
  platformSide?: 'left' | 'right' | 'both' | 'none'; // 开门侧（对齐官方 :495），不是站台形式
  layers?: Array<{
    name: string; // B1 / 1F / 站厅层
    usage: 'concourse' | 'platform' | 'entrance' | 'transfer' | 'equipment' | 'other';
    note?: string;
  }>;
  note?: string;
}

interface StationExit {
  code: string; // A / B1 / 无障碍电梯
  name?: string; // 出口所在地/通道名
  floor?: string; // 引用 layers[].name
  direction?: 'upwards' | 'downwards'; // 站厅侧（上行侧/下行侧），对齐官方 :524
  orientation?: 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW'; // 官方为自由文本，这里收紧为 8 向下拉
  status?: 'open' | 'closed' | 'reserved';
  lineKeys?: string[]; // 该出口服务的线路；空 = 全站共用（导视牌按当前线路过滤）
  order?: number; // 可选；缺省按 code 自然序（A、A1、B…）
  description?: string; // 周边道路/地标说明
  landmarks?: string[];
}
```

与官方模型的差异要写进注释：

- 官方 `exits[].placeMarkerId/roadMarkerIds` 依赖地图 marker，自定义线网没有，v1 不设；用 `description/landmarks` 自由文本替代。
- 官方 `facilities[].location` 要求“精确到 1/4 车厢”，对示意图线网过重；v1 只做 `type + floor + note`。
- 官方 `transfers[]` 是站内换乘，自定义线网可以先用 `lineKey + mode + note`。

### 8.2 运营单位与标志

```ts
interface OperatorProfile {
  id: string; // op_xxx，稳定
  name: string;
  nameEn?: string;
  shortName?: string; // 用于窄版面
  logoAssetId?: string;
  url?: string;
}
```

- 线路用 `operatorIds: string[]`，支持“XX地铁 / YY轨道”共线运营；物料侧取第一个作为主运营单位。
- 标志资产三种存法对比：

| 方案                 | 做法                                 | 优点                 | 缺点                           |
| -------------------- | ------------------------------------ | -------------------- | ------------------------------ |
| 内联 base64          | 存进项目 JSON                        | 简单、单文件         | JSON 膨胀、无法缓存、备份笨重  |
| 外链 URL             | 只存 URL                             | 零存储               | 会失效、跨域、防盗链、无法审核 |
| 内容寻址存储（推荐） | 文件存盘，JSON 只存 `assetId/sha256` | 去重、可缓存、可迁移 | 要写上传/读取/清理             |

- 存储布局：`.yct-data/custom-network-assets/<sha256前2位>/<sha256>.<ext>`；读取走 `/api/materials/custom-network-assets/[assetId]`，带 `Content-Type`、`X-Content-Type-Options: nosniff`、`Cache-Control: immutable`。
- 安全：**用户上传的 SVG 一律光栅化**（项目已有 `sharp` 依赖），输出 512px 内的 PNG/WebP，丢弃原文件；这样既保留矢量观感，又彻底避开 SVG XSS。PNG/WebP 做魔数校验、像素上限（如 4096×4096）、体积上限（2MB）。
- 版权：上传时勾选“我有权使用该标志”；私有线网不公开；将来分享/发布时再走审核与下架流程。
- 物料侧：现有系统模板只有“线路运营方（可选）”文本字段（`apps/web/lib/system-material-templates.ts:1015`、`:1167`），没有图片槽位；**标志进模板要单独排期**。v1 先把资料存起来，并在资料中心/站点卡片里预览。

### 8.3 OpenMap 导入：格式、解析位置与损失

#### 8.3.1 先澄清名词

- **工程 JSON**：OpenMap Editor「导出工程 JSON」，全量可再编辑，顶层是 `{version, canvas, nodes, segments, lines, ...}`（`editor/js/core/project-model.js:26-67`）。
- **OM 包**：Editor「导出 OM 包」生成的 `{cityId}-openmap-bundle.zip`，不是 `.om` 文件。内部只有 4–5 个 entry（`editor/js/editor-app.js:6906-6915`）：
  - `{cityId}/openmap_project.json`（唯一全量件）
  - `{cityId}/data_stations.js`
  - `{cityId}/data_lines.js`
  - `{cityId}/data_legend.js`
  - 可选 `{cityId}/data_notopen.js`
- **不含**：出入口、设施、楼层、题字、assets、城市注册信息。这些在 OpenMap 里是独立的第二套静态数据（如 `city/shenyang/data_exits.js`、`data_facilities.js`），编辑器根本不加载。
- ZIP 是 Store 模式（无压缩）、手写字节流（`editor/js/tools/bundle-exporter.js:129-177`），要读 ZIP 得自备解压库（`jszip`/`yauzl`/`fflate`）。
- 如果用户手里只有 OpenMap 城市目录（`data_stations.js` + `data_lines.js`，没有 `openmap_project.json`），P1 不支持；P3 再评估用字面量解析器读这两个文件，并顺带读 `data_exits.js` / `data_facilities.js`。

#### 8.3.2 解析放哪

| 方案                   | 做法                                 | 优点                                | 缺点                                        |
| ---------------------- | ------------------------------------ | ----------------------------------- | ------------------------------------------- |
| 客户端解析             | 浏览器 `File.text()` / 解压          | 与现有 RMP 一致、服务器无依赖       | 大 ZIP 内存高、无法留存源文件、校验可被绕过 |
| 服务端解析（推荐 ZIP） | 上传 multipart，服务端解压/解析/存源 | 可限制体积/条目、可存源文件、可审计 | 要加依赖与接口                              |
| 混合                   | JSON 客户端、ZIP 服务端              | 兼顾体验与安全                      | 两条路径要维护                              |

建议：**工程 JSON 走客户端**（与 RMP 一致，快），**OM 包走服务端**（要解压、要留存、要限额）。

#### 8.3.3 转换映射

| OpenMap                                | yct 规范图                           | 处理                                       |
| -------------------------------------- | ------------------------------------ | ------------------------------------------ |
| `nodes[id].cn` / `.en`                 | `node.names[0]` / `[1]`              | `en` 可为空                                |
| `nodes[id].x/y`                        | `node.x/y`                           | 示意图像素坐标，原样                       |
| `nodes[id].type`（`dot/tsf/no/...`）   | `kind` + `status` + `sourceType`     | `tsf` 视为换乘站；`no` 标未开通            |
| `nodes[id].align/offset/textScale`     | 暂存 `extras`                        | v1 不参与渲染                              |
| `lines[].id/name/color`                | `lineKey/name/color`                 | 线路键用 OpenMap 的 `L1` 等                |
| `lines[].stationIds`                   | `routes[].nodeIds`                   | 先用 `segments` 校验顺序；不一致给警告     |
| `lines[].company`                      | `operators[]`                        | 只有从城市数据载入的工程才可能有；不能依赖 |
| `lines[].svg/svgclr`                   | `LineProfile.badgeRef`（原样字符串） | 资源不在包里，v1 只存标识                  |
| `segments[].points`                    | `edge.points`                        | 需扩展模型；否则只取端点 + `pathKind`      |
| `segments[].notOpen`                   | `edge.status`                        |                                            |
| `virtualConnectors/notOpenLines`       | `extras`                             | v1 不渲染                                  |
| `waters/texts/scattered/legend`        | `extras` 或原文件                    | v1 不渲染                                  |
| `data_stations.js` 的 `cn/en`          | 可选校正                             | 与工程 JSON 冲突时以工程 JSON 为准         |
| `data_lines.js` 的 `company/svg`       | 运营单位/徽标                        | 编辑器导出的可能没有                       |
| `data_exits.js` / `data_facilities.js` | 不解析                               | 城市目录专属，P3 再做                      |

#### 8.3.4 损失矩阵（要如实告诉用户）

| 信息                  | 能否带入 | 说明                                          |
| --------------------- | -------- | --------------------------------------------- |
| 站名/英文名           | ✅       |                                               |
| 线路名/颜色/站序      | ✅       | 站序需校验                                    |
| 换乘站形态            | ◐        | 只知“是换乘”，不知具体形式                    |
| 折点/圆角/并行偏移    | ◐        | 需扩展 `edges[].points`；否则退化             |
| 分支/交路             | ◐        | 需 `routes[].branches`                        |
| 未开通段              | ◐        | 存 `extras`，不渲染                           |
| 水域/文字/装饰图/图例 | ❌（v1） | 存 extras/原文件                              |
| 车站结构/出口/设施    | ❌       | 包里没有，需用户在 yct 维护或 P3 解析城市目录 |
| 运营单位名称          | ◐        | 可能没有；有则自动建                          |
| 运营单位标志          | ❌       | 包里没有                                      |

导入摘要必须显示这张表的子集，例如：“已带入 9 条线 / 246 站；3 条线的折点会退化；出入口需要你补充”。

### 8.4 重导入与合并

规范 ID 建议用 `node:${sourceId}`，`sourceId` 来自 RMP 的 node key 或 OpenMap 的 node id。跨格式时源 ID 不同，需要候选匹配：

```
score = 0.6 * 站名相似度 + 0.25 * 线路重合度 + 0.15 * 坐标归一化距离
score >= 0.8 自动匹配；0.5–0.8 让用户确认；< 0.5 视为新站
```

合并规则：

- 资料只增不删：消失的节点标记 `orphaned`，保留在“待指派”列表。
- 用户改过的名称不被自动覆盖：导入只更新 `graph`，`profiles` 以用户值为准；如需同步，逐项勾选。
- 每次导入写 `ImportRecord { digest, at, counts, warnings }`，支持回滚。

### 8.5 存储与配额

```
.yct-data/custom-networks/
├─ index.json                       # 列表缓存（可重建）
└─ <projectId>/
   ├─ project.json                  # 文档 + 资料
   ├─ source/<digest>.<ext>         # 原始上传，保留最近 3 份
   └─ assets/<sha256>.<ext>
```

- 原子写：临时文件 + `rename`；单项目一把锁（进程内队列 + 可选文件锁）。
- 配额建议：每用户 1 个线网；单线网 20MB 资产、单文件 JSON ≤ 8MB、ZIP ≤ 32MB（解压后 ≤ 64MB、条目 ≤ 64）。
- 清理：删除线网时延迟 7 天清理资产；未被引用的资产定期 GC。
- 接口：`POST` 加 `Content-Length` 上限；所有写入路径都过 zod；错误码沿用 `invalid_*` / `*_not_found` 风格。

### 8.6 校验与完整度

- 结构校验（zod）：字段类型/长度/枚举；引用完整性（`nodeId` 存在、`lineKey` 存在、`operatorId` 存在、`assetId` 存在）。
- 业务校验（warning，不阻断）：重复出口编号、出口楼层引用不存在的层、线路没有运营单位、站名为空。
- 完整度：`站名 86/86 · 英文名 60/86 · 结构 12/86 · 出口 8/86 · 运营单位 3/3`，显示为进度条 + “下一步建议”。
- 对导视牌更重要的指标是“**可渲染出口数**”：有编号 + 有方位或说明的出口才算可渲染；只有编号的出口在牌面上会变成光秃秃的字母，要提示补说明。
- 健康检查：把现有 `transit-network-health.ts` 的思路借过来，但只做“资料完整性”，不做规划结论。

### 8.7 与两个消费端的对接

#### 8.7.1 出口 → 导视牌模板（已定 T2）

已定：走 **T2 元素级**，把模板库出口模板里预留的空位填上，不新增独立出口牌。2026-11-23 起先按**服务器线网站内资料**测试（`/api/transit/station-details`），自定义线网资料随后沿用同一套规则。

服务器资料的口径：

- `stationDetails` 按「线路 + 车站」存，同一换乘站可能有多份 `exits`；当前线路出口 = 当前线路那份详情的 `exits`，其它线路出口 = 其它线路详情里、当前线路没有的编号。
- 出口没有独立的 `lineKeys` 字段；只能通过「哪份线路详情里有它」判断归属。
- 出口的 `direction`（站厅侧：上行侧/下行侧）用于双侧模板分左右。
- `facilities` 里的 `elevator` 是站级信息，**没有和出口编号绑定**；只能判断“这个站有没有电梯”，选哪个出口目前取当前线路第一个/说明里提到电梯的出口。

各模板的填法：

| 模板               | 填什么                                                                                         | 空格处理                                    |
| ------------------ | ---------------------------------------------------------------------------------------------- | ------------------------------------------- |
| 线路与出口方向     | **当前线路的全部出口**                                                                         | 没数据就删掉空大文本，不占位                |
| 线路色换乘出口     | **其它线路出口**                                                                               | 同上                                        |
| 线路号与双侧出口   | **带线路号一侧 = 其它线路出口；另一侧 = 当前线路出口**                                         | 每侧独立删空；整行宽度不足时转两行方框      |
| 双侧出口编号       | **当前线路出口**，按 `direction` 分左右：上行侧→左、下行侧→右                                  | 整行宽度不足时转两行方框                    |
| 出口编号与电梯     | 当前线路里“说明提到电梯/无障碍/升降”的出口；没有就用第一个；**整站没有电梯时不生成该模板**     | 不填就不生成                                |
| 出口编号与站内设施 | **每个当前线路出口生成一张卡**（`出口编号与站内设施 · A`），大文本填编号，旁边文本填该出口描述 | 没有出口就不生成；没有描述时填「出口/EXIT」 |
| 出口方向           | 当前线路第一个出口                                                                             | 没有就删空大文本                            |

**出口描述怎么进文本元素**：

- 服务器 `exits[].description` 直接作为数据源；自定义线网用 `StationExit.description`。
- 文本元素**左对齐**；主行只放中文，副行只放英文。
- 每个中文主行后面**紧跟**它对应的英文副行（交替排列），不是把英文合并到最后。
- 已有中英对照（如 `青年大街 路东/QINGNIANDAJIE East Side`）→ `青年大街 路东` 主行 + `QINGNIANDAJIE East-side` 副行。
- 多段中文（如 `建业街 路东/普济路 路北`）→ 两对：`建业街 路东` / `JIANYEJIE East-side`、`普济路 路北` / `PUJILU North-side`；空格分隔的多段（如 `青年大街路东 浑河 河北 博览馆参展公众入口`）也会拆成多个主行，但 `浑河 河北` 这种「河流 + 河岸方向」保持为一整段，英文写 `HUNHE North-side`。
- 只有一段中文且以「XX路东/南/西/北」结尾 → 主行原文，副行生成 `XX East-side/South-side/West-side/North-side`（拼音 + 方位）。
- 其它单段中文 → 主行原文，副行整串拼音；无描述 → 一对「出口 / EXIT」。
- 数据源用「北口 / 南口 / 西北口…」做方位占位时，不当作真实出口描述：示例数据生成时改用 `roads`（如「全运站路 路北」），仍没有就按无描述处理。

**无障碍电梯图标**：`出口编号与站内设施` 不再用开头弹性空白，出口图标/编号直接贴左；只有带电梯图标时，末尾才加一个弹性空白 + 电梯图标。判断顺序：出口字段 `hasAccessibleElevator` / `accessibleElevator` / `accessible` → 出口 `facilities` / `facilityTypes` 里的 accessible elevator → 描述里的「无障碍电梯 / 无障碍升降机 / 无障碍直梯」。

设计上设施挂在**出口 POI**（`metro-entrance` 标记）的 `facilities` 上，不在 station detail 的出口记录里。`readTransitStationDetails` 读取时会按 `placeMarkerId`，没有则按「车站名-出口编号出口」匹配 POI，把 `facilities` / `hasAccessibleElevator` 补回 exit；全角编号（`Ｃ`）按 NFKC 归一。`出口编号与电梯` 只从带无障碍电梯的出口生成；一个都没有就不生成。

**套用不同出口描述的方式（当前实现）**：`出口编号与站内设施` 在模板库里**按出口拆卡**。例如某站有 A/B/C，就出现「出口编号与站内设施 · A」「· B」「· C」三张卡，卡片里已经带该出口的编号和描述；用户直接选想要的那张即可，不需要套完再改字。代价是出口多的站卡片会变多。如果以后嫌多，可以改成模板库里的「出口」下拉，只保留一张卡，或做元素级 `exitCode/description` 绑定；两者都会动到预览状态或布局 schema，先不混进这一版。

其他规则：

- **每个大文本只放一个出口编号**；空的大文本直接不生成，不留在牌面上。
- **出口太多、单行放不下**：先按出口数量排大文本，不设个数阈值；当**整行自然宽度已经超过可用宽度、将要横向压缩一般文本**时，才把这一组连续大文本换成两行方框文本（`text` 元素 + 两行 `boxed` 段）。
  - 方框按「第一行、第二行、第一行、第二行」交替装，不按前后半段切。
  - 分隔线左侧左对齐，分隔线右侧右对齐。
- **分组时的编号合并**：`A1/A2` 这类单字母 + 数字合并成 `A`，`B1/B2/B3` → `B`；`L1/L2` 是独立出入口，保持原样。只用于双侧/换乘分组，`出口编号与站内设施` 仍按每个实际出口出卡。
- **沈阳 3 号线地上段**：李达—余良（含）按线路**左/右侧**分两组，不再按“靠近下一站/上一站”；其余车站仍按相邻站方向投影。
- **双侧模板只有一边有出口**：`双侧出口编号` 会移除空的一侧和分割线；两边都空时保留左侧（至少留一边）。
- **不分新元素类型、不改布局 schema**：生成时直接构造元素；生成后仍是普通文本，用户可继续编辑。
- **数据现状提醒**：本地服务器样例里，临东站/中华路/建业街临医二院的多条线路出口编号集合完全相同，所以“其它线路出口”为空，对应大文本会被删掉；宣庆文化宫（6 号线 0 个、10 号线 4 个）和青年大街（3 号线 6 个、6 号线 0 个）这类不对称站才会出现填充。这不是模板没生效，是数据里确实没有“当前线路没有的出口”。

验收：服务器线网模式下选一个换乘站/线路 → 出口模板的大文本按上表填；没有数据的空大文本消失；整行宽度不够时变成两行方框，左侧左对齐/右侧右对齐、两行交替；没有电梯的站不再出现“出口编号与电梯”。

#### 8.7.2 车站结构 → 动态导览工作台

结构信息第一批不渲染，只存；等旧版动态线路图移植时按三层消费（**S2 楼层条已定要做**，只是排期在后）：

| 层级              | 形态                                         | 需要的字段                                                  | 排期                   |
| ----------------- | -------------------------------------------- | ----------------------------------------------------------- | ---------------------- |
| **S1 文字资料卡** | 站点详情显示“地下二层 · 岛式站台 · 3 个出口” | `position`、`platformType`、`layers.length`、`exits.length` | 动态导览第一版         |
| S2 楼层条/剖面    | 按楼层顺序画 B1 站厅 / B2 站台               | `layers[].name/usage/order`、`platformType`、`platforms[]`  | 动态导览第二版（已定） |
| S3 图上符号       | 用结构影响线路图上的车站图形                 | 结构 + 线路图渲染耦合                                       | 远期                   |

- 结构字段现在就要按 S2 留好：`layers` 必须有稳定的 `order`，`usage` 要能区分站厅/站台/出入口/换乘；否则以后画楼层条要重做数据。
- 换乘站如果要显示“1 号线 B2 岛式 / 2 号线 B3 岛式”，单个 `platformType` 不够；预留 `platforms?: Array<{ lineKeys?: string[]; floor?: string; type?: PlatformType; note?: string }>`，动态导览排期时再启用。
- P1 的资料中心可以先做 S1 预览（纯文本 + chips），让用户填完能看到结果；S2 渲染器等动态导览工作台一起做。

---

## 9. 面向新用户的维护体验

这一节与选哪个方案无关，B 落地时必须一起做。

### 9.1 首次导入的五步

1. **识别**：拖入后 2 秒内显示“识别为 OpenMap 工程 · 9 条线 · 246 站”。
2. **预览**：一张小线网图 + 三条统计（站数、缺名、缺出口）+ 损失提示；单线网下额外提示“将替换当前线网，已填资料会按站名/ID 合并”。
3. **选择**：`[先出图]` `[开始补全（推荐）]`，两个都是主按钮，不劫持用户。
4. **补全**：进入工作台，默认筛选“缺站名”；补完一批后自动建议“下一步：12 个站缺出口”。
5. **随时退出**：自动保存；下次进入恢复上次位置。

### 9.2 车站列表与详情

- 左侧列表：搜索（站名/编号/拼音）、筛选（全部/缺名/缺英文/缺结构/缺出口/未开通）、按线路分组。
- 右侧详情：上半部分是表单，下半部分是线网小预览（SVG，高亮当前站与相邻站）。
- 结构用 chip 选择（地下/高架/地面；岛式/侧式/叠岛），楼层用可增删的 repeater。
- 出口用表格：编号 / 楼层 / 方位 / 状态 / 服务线路 / 说明 / 地标；按 `code` 自然序排列，支持“复制上一站”“批量添加 A–D”。
- 出口区提供「在模板库预览」按钮，直接看当前数据在出口模板里的效果；缺说明/缺方位的行标黄。
- 每个字段都有示例占位符（“如：B1 站厅层”“如：朝阳街路东”），不要求填满。

### 9.3 批量通道（给熟练用户）

- 粘贴表格：一行一站，列用 `|` 或 Tab 分隔；表头可识别。
- CSV 导入/导出：站点表（站名/英文名/形式/站台/备注）、出口表（站名/编号/楼层/方位/状态/说明）。
- JSON 导入：仅接受本文档 schema，带版本号与预览。

### 9.4 错误与边界

- 解析失败：给出“第几个文件/哪一行/什么字段”的具体信息，不只说“格式错误”。
- 大文件：显示进度与取消；超限时明确说“上限 32MB，当前 48MB”。
- 冲突：重导入时用 diff 对话框，不用 toast 糊弄。
- 空状态：没有线网时展示示例线网 + “导入我的线网”。
- 已知问题（2026-11-23 已修）：在“数据来源”弹窗里点「配置项目线路名称」，线路名编辑器是嵌套 modal；advanced 材质给 `.modal-panel` 加了 `backdrop-filter`，形成包含块，fixed 弹窗被困在数据来源面板里，出现标题/内容重叠。修法：两个名称编辑器用 `EditorDialogPortal` 投送到 body，并加 `.transit-network-editor-backdrop { z-index: 130 }` 压过数据来源弹窗（120）。

### 9.5 可访问性与移动端

- 编辑以桌面为主；移动端只读摘要 + 补站名（短表单）。
- 所有弹窗/抽屉复用现有 `ui/modal.tsx`、`ui/field.tsx`，键盘可达、Esc 关闭、焦点回归。

---

## 10. 待决策问题

已定（2026-11-23）：

- ~~一个用户几个线网？~~ → **一个**。因此不做列表/配额，重点做导入历史、回滚、导出备份。
- ~~拓扑是否允许在线微调？~~ → **不允许**。导入是唯一拓扑入口，重点做重导入合并。
- ~~车站结构和出口第一批给谁用？~~ → **出口给导视牌模板，结构给后续动态导览工作台**。因此 P1 必须打通「出口 → 模板库出口模板空位」，结构只需 S1 文字资料卡。
- ~~出口信息牌走 T1 还是 T2？~~ → **T2 元素级**，填充模板库模板里预留的空位；不新增独立出口牌模板。
- ~~动态导览要不要楼层条？~~ → **要（S2）**，但排期在动态导览工作台移植时；P1 只做 S1 文字资料卡，字段按 S2 预留 `layers.order/usage` 与 `platforms[]`。

仍需决定：

1. **运营单位标志的公开范围与审核？** 私有线网可以宽松；一旦分享/发布，商标与版权需要声明、审核与下架流程。
2. **OpenMap 导入的范围？** 只工程 JSON / 工程 JSON + OM 包 / 还要城市目录（能带出口和设施）。范围直接决定 P2/P3 的工作量。
3. **是否需要导出回 OpenMap？** 如果用户希望“在 yct 补完资料再回 OpenMap 出图”，就要做导出器；如果只是“读进来”，可以不做。
4. **P1 是否要包含运营单位标志上传？** 目前建议放 P2：模板还没有 logo 槽位，先存文本运营单位即可；如果你希望“资料一次性填完”，可以前移，但要同时做资产管线。
5. **出口空位与出口数量不匹配时怎么显示？** 目前建议“多了截断、少了留空”；如果你希望“少的时候重复图标/合并单元格”，模板生成规则要再定。

---

## 11. 实现进度（2026-11-23）

P1 第一刀已落地：

- **Schema / Contracts**：`materialTransitStationExitSchema`、`materialTransitStationStructureSchema`、`materialTransitStationProfileSchema`、`materialTransitNetworkSupplementSchema`；项目增加 `supplement`；PATCH 支持 `stationProfiles`，校验重复 nodeId / 重复出口编号。
- **Store / Workflow**：重新导入时保留 `supplement`；车站资料按 `nodeId` 合并，空资料视为清空；引用了不存在车站的资料会被拒绝；POST/PATCH 加了 8MB 应用层上限。
- **维护界面**：新增 `TransitNetworkProfilePanel`（工作台内 modal，后续可升为单页）与「管理车站资料」入口；车站列表支持搜索/缺出口/缺结构筛选；结构（形式/站台/数量/楼层）与出口（编号/方位/状态/楼层/说明）可编辑。
- **模板填充（T2，服务器线网优先）**：`MetroWayfindingExampleStation` 增加 `lineExits`（按线路+车站的出口）与 `exits`（自定义线网兜底）；`material-studio-panel` 拉取 `/api/transit/station-details` 并映射当前线路/其它线路出口；模板库出口模板按 §8.7.1 的规则填，空大文本不生成，超槽位转两行方框文本，`出口编号与电梯` 只在有电梯时生成。
- **服务端结构/出口读取**：当前线路出口来自该线路的 station detail；其它线路出口来自同站其它线路详情；双侧模板按 `direction`（上行侧/下行侧）分左右；无障碍电梯按出口字段/`facilities`/描述关键词判断，打开模板库前会重新拉一次 `/api/transit/station-details`。
- **出口描述与电梯图标**：多段中文各一个主行，英文副行紧跟在对应主行后；文本元素左对齐；英文方位统一 `East-side`。`出口编号与站内设施` 不用开头弹性空白，末尾电梯图标只在该出口有无障碍电梯时出现；`出口编号与电梯` 只从无障碍出口生成。
- **沈阳示例线网出口**：用隔壁 `cgo-shenyang/city/shenyang` 的 `data_exits.js`（高德/Wikipedia/官网核对）和 `data_facilities.js`（沈阳地铁官网）生成 `apps/web/lib/data/shenyang-sample-station-exits.json`：144 站、159 个线路组、521 条出口；每条出口带描述、方位、无障碍电梯标记和 `direction`。方向用 `amap_data.json` 的经纬度向相邻站投影：朝下一站为 `upwards`、朝上一站为 `downwards`；3 号线李达—余良按线路左右侧；换乘站按线路拆组。示例线网加载时直接使用，不写用户项目。
- **车站资料弹窗**：`MaterialTransitStationProfile` 新增 `lineGroups`，示例 profile 同时有平铺 `exits` 和按线路分组的 `lineGroups`；144 站都补了 `structure`（3 号线李达—余良为 ground/overGround，其余 underground）。示例线网/本机草稿也会把读到（或草稿里存的）资料写入弹窗；没有项目 ID 时是只读，不再误报所有站缺出口/缺结构。
- **示例线网另存/导入项目**：按 nodeId 合并示例资料；弹窗和模板库都能拿到 lineGroups 和出口。
- **新模板**：地上站加 5×1「左箭头 + 候车室图标 + 左对齐 空调候车室/Air-conditioned Waiting Room + 弹性空白」进站模板；其他站加 9×1「上箭头 + 向上出口图标 + 向左扶梯图标 + 左对齐 出口/EXIT」出站模板。
- **出口编号的下标**：参照 cgo-shenyang 的 `badgeHtml`，按「第一段连续字母/数字 + 其余部分」拆开：`C1 → C₁`、`L1 → L₁`、`A2 → A₂`；带方框/圆框的单个大文本在宽度不足时**保持原尺寸**，只让一般文本横向压缩；只有连续多个方框大文本在整行宽度不足时才转两行方框文本。
- **测试**：新增 `pnpm transit-network:check`（41 项断言：schema 校验、重复出口拒绝、当前/其它线路出口、双侧 direction 分侧、空大文本删除、宽度不足才转两行方框、电梯模板生成/跳过、出口描述中英/多中文交替行、左对齐、按出口拆卡、出口卡无开头弹性空白、单侧出口移除空侧/分割线、长副文本不压缩、出口编号主字/下标、单框大文本不缩放、A1/A2 合并、L1/L2 保留、沈阳 3 号线地上段左右侧、出口 POI 设施 join、全角编号匹配、placeMarkerId 优先、沈阳示例 144 站/线路分组/方向、示例 profile 的 lineGroups/地上结构、地上站候车室模板、其他站出口与上楼模板、北口/南口占位过滤、自定义线网兜底）。`pnpm -r typecheck` 与 `pnpm metro:check` 均通过；`ui:controls:sync` 已同步控件清单。
- **顺手修掉的窗口问题**：线路名/站名编辑器从数据来源弹窗内投送到 body，并加 `.transit-network-editor-backdrop { z-index: 130 }`，避免 advanced 材质的 `backdrop-filter` 包含块把弹窗困在面板里。

尚未落地：OpenMap 工程/OM 包导入、运营单位与标志、结构楼层条、跨格式重导入合并、i18n 键（当前面板文案为中文）。服务器线网的“电梯→出口”已改为从出口 POI 的 `facilities` 读取，不再按站级电梯猜。

**数据现状（2026-11-23 检查）**：`apps/web/.yct-data/transit-data-store.json` 的 station detail 出口记录仍只有 `code/description/direction/floor`，但同城的 POI 快照里已经有 `metro-entrance` 标记及其 `facilities`（例如「青年大街-A出口 → 无障碍电梯」「建业街临医二院-Ｃ出口 → 无障碍电梯」「新阳路-Ｃ出口 → 轮椅升降机」）。读取时 join 后，本地数据上的 `出口编号与电梯` 会生成、对应出口的末尾图标会出现；例如青年大街 3 号线 A、中华路 1 号线 A、建业街临医二院 1 号线 C。

---

## 附录 A：OpenMap 格式证据

- 工程模型：`C:\Users\20828\Documents\ChatGPT\cgo-shenyang\editor\js\core\project-model.js:26-67`
- 工程 JSON 导出：`editor/js/editor-app.js:4448-4459`
- OM 包条目：`editor/js/editor-app.js:6906-6915`
- ZIP 写入（Store 模式）：`editor/js/tools/bundle-exporter.js:129-177`
- 站点导出白名单：`editor/js/tools/bundle-exporter.js:362-378`
- 校验五条铁律：`editor/js/tools/bundle-exporter.js:30-71`
- 真实样本：`city/suzhou/openmap_project.json`（147,541 B / 246 站 / 237 段 / 9 线）
- 出入口独立数据：`city/shenyang/data_exits.js`（字段 `name/lines/pos/desc/geoDesc/roads/bearing/landmarks/closed`）
- 设施独立数据：`city/shenyang/data_facilities.js`（字段 `type/location`）
- 编辑器不加载出入口/设施：`editor/js/core/city-project-io.js:40-47`

## 附录 B：现有代码证据

- 快照与更新 schema：`packages/schemas/src/materials.ts:479-543`
- 单项目 upsert：`apps/web/lib/material-transit-network-project-workflow.ts:39-47`
- 存储：`apps/web/lib/material-transit-network-project-store.ts`
- 两个弹窗：`apps/web/components/transit-network-source-control.tsx:782-967`
- 只列未命名站：同文件 `:143-147`
- RMP 解析：`apps/web/lib/rmp-transit-network.ts:76-128`
- 官方车站详情 schema：`packages/schemas/src/transit.ts:491-536`
- 官方车站详情 UI：`apps/web/components/admin-transit-panel.tsx:4256-5360`
- 出口 UI：同文件 `:5156-5300`
- 运营单位字段：`packages/schemas/src/transit.ts:244-245`；UI `admin-transit-panel.tsx:5854-5870`
- 物料侧 operator 写死空串：`apps/web/lib/material-transit-source.ts:675`
- 资产上传管线：`apps/web/lib/content-asset-workflow.ts:248-293`（20MB、MIME 白名单、**无 SVG 消毒**）
- POI 图片管线（魔数校验、sha256 命名）：`apps/web/lib/poi-submission-image-workflow.ts:71-135`
- 本机草稿（IndexedDB）：`apps/web/lib/client-material-offline-drafts.ts:3-5`
