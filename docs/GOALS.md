# 雨城通 v2（Yuchengtong / YCT）重构目标与执行记忆

更新时间：2026-07-03

本文档用于帮助后续协作记住“我要为雨城通 v2 做哪些工作、按什么顺序推进、哪些事情需要用户拍板”。它不替代需求文档，而是作为执行层的目标清单。

## 1. 总目标

在保留旧版雨城通功能的前提下，将雨城通 v2（英文名 `Yuchengtong`，缩写 `YCT`）重构为一个可维护、可扩展、支持后台审核、支持账号系统、支持地图探索和多数据源适配的现代 Web 应用。

最终形态应具备：

- 前台五块能力：运营信息、地图探索、出行、更多服务、账号设置。
- 后台四条审核线：内容、线路/站点、公开 POI、服务入口。
- 可扩展适配器：地图瓦片、标记点、线路数据、账号系统、内容来源均可替换。
- 设计系统：以 design token 驱动前台、后台、地图页和工具页。
- 事件驱动后端：核心业务服务只做数据库操作和事件发布，副作用由监听器处理。
- 轻量 PWA：安装入口、应用壳缓存、近期数据缓存和通知增强，但不把核心流程绑定在离线能力上。

## 2. 当前已完成的文档工作

- `docs/REQUIREMENTS.md`：需求边界、模块划分、技术路线、事件 Schema、状态机、待拍板问题。
- `DESIGN.md`：设计系统、design token、布局、组件、地图页、后台、PWA 视觉规则。
- `docs/GOALS.md`：本文档，记录后续执行目标和记忆清单。
- `docs/LDPASS_INTEGRATION.md`：YCT 与 `ldpass` 的登录、账号入口、主题计划、票券、乘车码和权限接入边界。
- `docs/MAP_INTEGRATION.md`：地图瓦片、uNmINeD 静态地图、BDSLM/静态标记和坐标转换待验证项。

## 3. 后续工作优先级

### P0：启动前必须明确

- 技术路线已确认采用 Next.js + TypeScript + Prisma + 数据库 + 事件总线。
- 部署前必须确认 Node.js 版本满足所选 Next.js 的官方最低要求；具体服务器配置不写入仓库。
- 第三个一级模块第一阶段文案已确认使用 `出行`，真实购票能力后续再接入。
- 账号接入第一阶段使用 `ldpass` 轻量登录回跳和 `client-session`。
- 地图瓦片生产环境无法直接提供 HTTPS，需要确认代理/反代/独立页面方案。
- 后台第一阶段至少覆盖内容审核、服务入口管理、线路数据导入发布。
- 旧数据迁移范围已明确：线路、站点、内容信息和原有专题页面完整迁移。

### P1：MVP 验证闭环

目标：先用最小实现证明架构可行。

- 搭建项目骨架。
- 建立 design token 与基础布局。
- 实现地图闭环：
  - 读取瓦片源配置。
  - 读取 BDSLM 或当前地图标记点。
  - 支持点标记，预留线和面标记数据结构。
  - 叠加至少一份旧线路数据。
  - 验证 Minecraft `x/z` 与地图坐标转换规则。
- 实现登录闭环：
  - 跳转 `ldpass` 登录。
  - 回跳校验 `state`。
  - 调用 `client-session`。
  - 建立雨城通本地用户映射。
- 实现内容闭环：
  - 后台创建内容。
  - 提交审核。
  - 审核通过。
  - 前台首页读取已发布内容。

MVP 完成标准：

- 不依赖模拟数据。
- 至少一条真实旧线路数据能显示。
- 至少一条真实内容记录能从后台发布到首页。
- 登录态能用 `ldpass` 真实接口或约定好的开发环境接口完成校验。

### P2：第一阶段产品化

目标：让新版可以作为主站替代旧首页和核心查询入口。

- 前台一级模块：
  - 运营信息：首页、Banner、分类卡片、内容详情。
  - 地图探索：地图、点/线/面标记、站点/线路搜索、基于后台标记数据的道路级规划最小验证、线路详情。
  - 出行：行程提醒、班次查询入口、客运大屏入口；真实购票后续接入 `ldpass`。
  - 更多服务：外部站点与工具入口，智运大屏对应旧 `ltcx_schedule`。
  - 账号设置：顶部头像入口、登录、退出、历史、偏好、通知、主题/强调色、`ldpass` 相关入口。
- 后台：
  - 内容管理与审核。
  - 服务入口管理。
  - 线路数据导入与版本发布的基础流程。
- 数据：
  - 旧 `content_data.js` 迁移。
- 旧 `metro_data.js`、`tram_data.js`、`local_railway_data.js`、`bus_data.js` 和 `ltcx/route.txt` 进入结构化数据。
  - 旧行程提醒从 `localStorage` 迁移为可登录同步的数据模型。
- PWA：
  - manifest。
  - 应用壳缓存。
  - 近期线路/内容/站点详情缓存。
  - 安装状态入口。
  - App 图标。
  - 自定义矩形范围离线包在账号设置页手动更新或删除。
  - PWA 安装文案。

第一阶段完成标准：

- 移动端和桌面端主路径可用。
- 首页资讯可通过后台发布。
- 地图页可以稳定浏览瓦片、搜索站点、查看线路。
- 用户登录后能管理基础历史和偏好。
- 未登录用户仍可浏览公开内容和地图。

### P3：后台与数据治理完善

目标：让运营人员可以长期维护数据，而不是继续手改文件。

- 线路/站点编辑器替代旧 `data_composer`。
- 道路级路线规划可用版。
- 数据校验报告：
  - 重名站点。
  - 孤立站点。
  - 线路断点。
  - 单向站点。
  - 缺少坐标。
- 审核差异对比。
- 发布版本回滚。
- POI 用户提交与公开审核。
- POI 支持点、线、面；面性标记优先评估多个矩形组合作为编辑/存储结构，显示层按性能决定是否转换为多边形。
- 抓取型数据源导入快照。

完成标准：

- 公开数据变更全链路有草稿、审核、发布、回滚。
- 抓取数据不能绕过审核直接上线。
- 管理员可以追踪谁在什么时候发布了什么版本。

### P4：出行票务与 ldpass 深度联动

目标：在第一阶段出行提醒稳定后，重写统一班次查询与订票系统，并接入真实电子票、检票、退票和乘车码。客运、轮渡、航班共享同一套平台，旧 `/ltcx/` 只作为交互深度和迁移参考。

- 建立统一班次模型：`ScheduleService`、`TripInstance`、`FareProduct`、`Inventory`、`Order`、`Ticket`、`Refund`、`CheckIn`。
- 接入 `ldpass` 票券/卡包能力。
- 建立乘车码与票券状态联动。
- 建立电子票、检票、退票状态机。
- 建立票务事件：
  - `TravelSchedulePublished`
  - `TicketInventoryHeld`
  - `TicketOrderCreated`
  - `TicketIssued`
  - `TicketCheckedIn`
  - `TicketRefundRequested`
  - `TicketRefundCompleted`
- 建立行程与票券联动。

完成标准：

- 不把“提醒”伪装成“购票”。
- 如果出现票券，就必须有清晰的状态、权限、审计和异常处理。

## 4. 工作边界

默认要做：

- 先读旧项目和现有上下文，再动手。
- 保留旧功能，不无意删除用户已有能力。
- 所有公开数据变更走审核和发布版本。
- 使用事件驱动设计后端模块。
- 用 design token 统一设计系统。
- 支持移动端和桌面端。
- 代码和文档保存为 UTF-8 无 BOM。

默认不做：

- 不直接启动 Node.js 开发服务，除非用户明确要求。
- 不额外写测试，除非用户明确要求或改动风险非常高。
- 不用模拟数据替代真实需求。
- 不把当前临东 URL 写死进核心业务。
- 不把 PWA 当成离线 App 重做整个系统。
- 第一阶段不做真实票务，但后续必须按 `ldpass` 票券接入方向预留模型。

## 5. 需要持续记住的架构约束

- Service 不允许 import 其他业务 Service。
- Service 完成数据库操作后发布事件。
- 通知、缓存刷新、搜索索引、Webhook、同步任务都属于监听器副作用。
- 公开发布和通知类副作用必须考虑 Outbox。
- 外部系统通过 Provider/Adapter 接入。
- 旧 JS 数据导入时不能直接执行上传内容。
- 账号系统第一阶段优先依赖 `ldpass`，雨城通只保存本地映射和业务偏好。
- YCT 管理员权限由 YCT 自己维护角色表，不直接等同 `ldpass` 管理员。
- 非 Active 的 `ldpass` 用户允许进入只读账号页。
- 管理员角色第一阶段先不拆分。
- 投稿用户只需要验证服务器账号。
- 地图页必须让地图保持主体地位，不能被普通卡片布局框住。
- Minecraft 坐标规则：X 正方向对应东，Z 正方向对应南；BDSLM 标记点输出 `x/z` 可作为输入格式参考。

## 6. 需要持续记住的设计约束

- 图标统一使用 Material Symbols Outlined，不再使用 `material-symbols-rounded`；选中态继续通过 `font-variation-settings: 'FILL' 1` 表达填充。
- 卡片圆角不超过 8px。
- 不做卡片套卡片。
- 地图不放在装饰卡片中。
- 工具按钮优先图标按钮，并提供可访问名称。
- 移动端触控目标不小于 44px。
- 不使用单一色系铺满整个界面。
- 不用可视文本解释 UI 应该怎么用，界面本身要自明。
- 后台界面要密集、清晰、偏工具，不做营销式页面。
- 顶部头像入口需要显示登录状态和必要计数徽标。
- 账号设置支持深浅色主题和强调色；默认强调色跟随 `ldpass` 主题计划，在青绿色、红色和灰色之间按时间切换，用户可改为自定义。

## 7. 数据迁移记忆清单

旧项目关键数据：

- `data/content_data.js`：首页资讯和 Banner。
- `content/*.html`：旧内容详情。
- `data/metro_data.js`：地铁线路。
- `data/tram_data.js`：有轨电车线路。
- `data/local_railway_data.js`：本地铁路。
- `data/bus_data.js`：公交线路。
- `data/metro_station_detail.js`：地铁站点详情。
- `ltcx/*.txt`：客运目的地、路线、站点、公告等。
- `ltcx/screen/*.txt`：客运大屏相关数据。
- 原有专题页面：完整迁移为内容页或归档内容。

迁移原则：

- 先导入为草稿或导入快照。
- 通过 schema 校验。
- 人工审核后发布。
- 保留原始来源文件路径和导入时间。

## 8. 待用户拍板清单

高优先级：

- PWA 自定义矩形范围离线包的体积上限、范围上限、增量更新和自动清理策略。
- 地图 HTTPS/代理方案。
- 管理员 PIN 二次确认来源。
- 是否第一阶段就做线路/站点后台编辑，还是先做导入发布。

中优先级：

- 是否保留旧节庆特效。
- 公开 POI 的分类、图片、命名规范和驳回模板。
- 旧行程和订单迁移到账号后的冲突策略和正式同意文案细化。
- 更多服务里哪些工具必须第一阶段可用。
- 后台标记数据如何生成道路图。

低优先级：

- Banner 图片比例。
- App 图标源文件本体。
- 内容页是否需要评论、点赞、收藏。
- 是否做多语言或英文站点名。

## 9. 后续建议的文件结构

如果采用 Next.js monorepo，建议结构如下：

```text
apps/
  web/
    app/
    components/
    styles/
    public/
  api/
    src/
packages/
  contracts/
  database/
  event-bus/
  adapters/
  design-tokens/
docs/
  REQUIREMENTS.md
  GOALS.md
  ARCHITECTURE.md
  EVENT_SCHEMA.md
  DATA_MIGRATION.md
  OPERATIONS.md
DESIGN.md
```

说明：

- `contracts` 保存 DTO、事件类型、共享枚举。
- `adapters` 保存瓦片、标记点、账号、线路导入等适配器。
- `event-bus` 保存事件总线抽象和 Outbox。
- `design-tokens` 可生成 CSS variables 和前端 token 类型。

## 10. 后续执行顺序建议

1. 用户确认 P0 拍板项。
2. 创建项目骨架。
3. 定义核心数据模型和事件 Schema。
4. 做 MVP 三闭环。
5. 做前台一级页面布局。
6. 做后台内容审核。
7. 做地图探索主流程。
8. 做出行提醒和历史同步。
9. 做更多服务入口。
10. 做 PWA 轻量增强。
11. 做旧数据批量迁移。
12. 做性能、兼容性、可访问性复核。

## 11. 当前开工判断

当前文档已经足够支撑 MVP 开工。

2026-07-01 已完成第一轮工程开工：

- 创建 Next.js 全栈单体 monorepo 骨架：`apps/web`、`packages/contracts`、`packages/event-bus`、`packages/adapters`、`packages/design-tokens`。
- 建立前台一级页面壳：运营、地图探索、出行、更多服务、账号设置。
- 建立共享事件 Schema 和进程内 EventBus，后续服务按事件驱动扩展。
- 接入品牌资源目录 `assets/brand/`，生成 Web/PWA 图标到 `apps/web/public/icons/`。
- 新增 `pnpm brand:icons`，用于从 SVG 源文件重新生成图标。
- 新增 API 壳：`/api/health`、`/api/operations/feed`、`/api/map/tile-providers`、`/api/settings/bootstrap`、`/api/auth/ldpass/login-url`、`/api/auth/ldpass/client-session`。未接入真实数据源时明确返回 `not_configured` 或 503，不使用模拟业务数据。
- 已验证：`pnpm typecheck` 和 `pnpm --filter @yct/web build` 通过。

可以立即开始的工作：

- 运营信息 Markdown 内容模型、图片素材审核模型和发布状态机。
- 地图真实数据适配器：瓦片模板配置、BDSLM/地图标记点读取、POI 图标分类映射。
- 后台命令行初始化首位超级管理员。
- 旧线路/站点/内容数据导入器的 schema 设计。

已完成的基础项：

- Next.js 全栈单体项目骨架。
- design token 和基础响应式布局。
- 共享领域类型、事件 Schema、EventBus。
- 地图适配器骨架：较新 HTTP 瓦片源、安全 HTTPS 静态瓦片源、POI 图标映射辅助、`ldpass` 身份 Provider 壳。
- 前台一级页面壳：运营、地图探索、出行、更多服务、账号设置。
- 账号设置页的主题、通知、离线包入口占位。
- API 壳：健康检查、运营信息列表、地图瓦片源列表、设置启动信息。
- `ldpass` 登录 URL 与 client-session 同源 API 壳。
- 内容修订、内容素材、POI 投稿、旧数据导入批次的共享领域类型。
- 内容修订、内容素材和 POI 投稿的纯状态机：`@yct/domain`。
- 内容 Markdown、素材上传、地图几何、POI 分类、瓦片模板和旧数据导入的运行时 schema：`@yct/schemas`。
- 内容草稿预检 API：`/api/operations/validate-content`。
- 旧内容数据 feed：`/api/operations/feed`，支持通过 `YCT_LEGACY_DATA_SOURCE` 选择本地旧项目 `data` 目录或远程旧站 `https://yct.shangxiaoguan.top/data`；不使用模拟内容。
- 首页运营信息入口：展示真实旧内容 banner、摘要列表、搜索和固定分类过滤；当前固定分类来自线上旧站 `通知公告`、`运营信息`、`地铁运营`、`公交运营`、`有轨运营`，并兼容旧快照 `网站公告`。
- 运营信息详情页：`/operations/[id]`，从旧内容数据按真实 source id 读取标题、摘要、Markdown 正文和旧资源引用。
- BDSLM 标记点适配器：`@yct/adapters` 的 `BdslmMarkerProvider`。
- 地图数据 API：`/api/map/markers`、`/api/map/poi-categories`。
- 地图配置环境变量：`YCT_MARKER_BDSLM_BASE_URL`、`YCT_MARKER_BDSLM_TIMEOUT_MS`、`YCT_POI_ICON_CANDIDATES`。
- 地图页真实数据快照：`/map` 读取瓦片 Provider 和标记点快照；未配置 BDSLM 时读取 `map.shangxiaoguan.top/custom.markers.js`，并以示意层展示点位分布和最近标记列表。
- 默认 POI 分类映射：未配置 `YCT_POI_ICON_CANDIDATES` 时，`/api/map/poi-categories` 会从旧地图静态标记图标推导分类，并合并道路、地铁出入口、地铁站、铁路车站等多图标分类。
- uNmINeD 静态瓦片 Provider：`/api/map/tile-providers` 在未配置显式 HTTPS 模板时返回 `lindong-unmined-static`，记录 `tiles/zoom.{z}/{xd}/{yd}/tile.{x}.{y}.jpeg` 规则，完整渲染待坐标转换接入。
- 旧数据导入预检包：`@yct/legacy-import`。
- 旧数据预检命令：`pnpm legacy:inspect`，默认检查远程旧站，也可传入本地 `data` 目录或远程 data URL；已验证 `content_data.js`、`metro_data.js`、`tram_data.js`、`bus_data.js`。
- 旧线路数据概览 API：`/api/transit/legacy-overview`，覆盖已验证的地铁、有轨电车、公交、地方铁路和客运线路，并保留停靠点级属性；客运从 `ltcx/route.txt` 按线路名和途径站聚合班次。
- 出行页旧线路摘要入口：显示真实旧线路统计和前若干条线路，线路标识使用线路颜色或交通方式语义色，不再复用分类 chip。
- 品牌图标源文件目录：`assets/brand/`。
- PWA 图标生成与 manifest 接入。
- 本地预览进程管理脚本：`pnpm web:dev:start`、`pnpm web:dev:stop`、`pnpm web:dev:restart`、`pnpm web:dev:status`，后续 3300 端口预览部署统一走这组入口。
- 桌面端免责声明与备案号：侧边主导航展开时显示在侧边导航卡片外侧；侧边导航折叠时显示在内容底部。移动端仅在账号设置页底部显示。

2026-07-02 已落实第二轮运营消息、线路列表和地图页反馈：

- 首页 `hero-panel` 背景图片遮罩渐变改为从下往上；`eyebrow` 继续使用对应消息分类。
- `feed-panel` 按发布时间展示全部结果；过期消息折叠到单独区域，用户可展开查看。
- `feed-item-cover` 已支持真实图片背景；旧站相对图片优先解析到 `https://yct.shangxiaoguan.top`，语义色变量名不再误当作图片 URL。
- 旧数据中图片字段可能直接写语义色变量名、CSS 变量或色值；迁移时要识别为颜色 token / fallback，不作为图片 URL 下载。
- 全局搜索按钮进入独立 `/search` 搜索结果页；首页原有搜索框去掉。当前搜索结果已覆盖运营信息、线路、已有站点详情、服务与工具入口。
- 移动端 `transit-summary-strip` 沿用多列布局，不强制单列。
- `line-list` 去掉前 8 条硬截断，按真实旧数据展示全部线路；当前远程旧站预检为地铁 4 条、有轨 3 条、公交 56 条、地方铁路 1 条、客运 19 条。
- 线路标识样式单独处理：地铁线路参考旧站 `bus_routemap` 中的地铁线路标识，其他方式使用线路色或交通方式语义色的圆角矩形背景配白色文字。
- 已处理：交通方式 Profile 第一版可通过后台维护名称、默认色、Material Symbols 图标、排序和启用状态；地方铁路默认棕色，客运大巴默认黄绿色，轮渡默认青蓝色。当前使用 `.yct-data/transit-mode-profile-store.json` 作为数据库接入前的本地仓储，成功更新后发布 `TransitModeProfileUpdated` 事件；航班不属于当前地图 `TransitLine` Profile，但统一班次查询中默认使用蓝紫色语义色，后续票务 Profile 也需要支持配置。
- 已处理第一版：统一班次/票务服务 Profile 与地图交通方式 Profile 分开维护，新增 `.yct-data/travel-service-profile-store.json`、管理员 API `/api/admin/travel/service-profiles` 和后台“可排班服务配置”区；客运大巴、轮渡、航班、地方铁路、自定义服务的名称、颜色、图标、排序和启用状态可被服务器 Profile 覆盖，成功更新后发布 `TravelScheduleServiceProfileUpdated` 事件。
- `line-list-item` 已可点击进入线路详情二级页面；详情页先展示旧数据中的概览和站点序列，后续按新原型细化样式。
- `/map` 已恢复用户可用的 `sidebar-stack` 操作栈；桌面端为侧边面板，移动端为底部抽屉，承载标记点筛选、图层和 POI 分类。
- `/map` 地图操作面板已改为独立 `map-control-stack`，不再复用主导航的 `sidebar-stack` 类，降低侧边栏高度被全局导航样式覆盖的风险；移动端仍作为底部抽屉紧贴底部导航上方。
- 新增 `/api/map/unmined-regions`，通过同源服务端读取并解析旧地图 `unmined.map.properties.js` 与 `unmined.map.regions.js`，前端按 uNmINeD 区域索引过滤真实存在的瓦片；地图主体保留基础拖拽、滚轮缩放、工具按钮缩放和回到默认视图。
- 地图标记图案继续沿用 `map.shangxiaoguan.top/custom.markers.js` 中的旧图标文件名，并通过静态地图基准 URL 解析旧 PNG 资源。
- `map-data-badge` 和 `map-data-panel` 已从主界面移除，改为轻量数据状态提示；详细 Provider、标记数量和适配器状态后续移到管理员、调试或关于面板。

2026-07-02 已推进 `ldpass` 登录闭环：

- 新增 `/api/auth/ldpass/start`：生成一次性 `state`，写入 HttpOnly Cookie，并跳转到 `ldpass` 登录页。
- 新增 `/auth/ldpass/callback`：校验回跳 `state`，读取 `ldpass` `client-session`，并在拿到真实 Active 账号后写入 `.yct-data/yct-user-links.json` 本地用户映射和 YCT 本地账号快照 Cookie；只读账号只写展示快照，不创建可写用户映射。
- 新增 `/api/auth/logout`：清理 YCT 本地登录状态并发布 `YctSessionEnded` 事件；是否联动退出 `ldpass` 仍待后续确认。
- 新增 `/api/account/status`：读取 `ldpass` 会话并区分未配置、未登录、Active 登录、只读账号和会话不可用；只有匹配 YCT 本地管理员成员时才合并内容、服务入口、交通数据和 POI 的待审核计数。
- 顶部头像入口已接入账号状态：普通登录显示登录态，只读/异常/未配置显示状态点，管理员待审核数量与浏览器本地待同步行程提醒数量合并为单一计数徽标；本地行程提醒写入、删除或清空时会发出轻量前端事件刷新标题栏。
- 账号设置页已接入登录状态展示、临东通账号入口、退出入口和未配置提示。
- 共享契约新增 `YctUserLink`、`YctAccountSessionSnapshot`，并新增 `LdpassUserLinked`、`YctSessionStarted`、`YctSessionEnded` 事件 Schema。
- 当前阶段未接入数据库，`YctUserLink` 使用 `.yct-data/yct-user-links.json` 作为本地仓储；账号快照仅用于前台展示，业务写接口仍必须实时校验 `ldpass` 会话。后台鉴权和 POI 投稿鉴权会在通过真实 `ldpass` 会话后补写或刷新本地用户映射。

2026-07-02 已推进内容审核发布闭环：

- 新增本地管理员成员仓储 `.yct-data/admin-memberships.json`，并新增 `pnpm admin:init <ldpassUserId>` 初始化超级管理员。
- 新增本地内容仓储 `.yct-data/content-store.json`，作为数据库接入前的开发/单机持久化 Repository；该目录已加入 `.gitignore`。
- 新增内容工作流服务：创建草稿、提交审核、审核通过/驳回、发布；状态流转复用 `@yct/domain`，成功后发布 `ContentSubmitted`、`ContentReviewed`、`ContentPublished` 事件。
- 新增后台 API：`/api/admin/operations/contents`、`/submit`、`/review`、`/publish`；后台 API 需要真实 `ldpass` 会话和本地管理员成员记录。
- 新增 `/admin/operations` 内容后台页面，可创建 Markdown 草稿并执行提交、通过、驳回和发布。
- 首页、搜索页、运营详情页与 `/api/operations/feed` 已合并读取本地已发布内容和旧站内容；草稿和待审核内容不会进入前台。
- 运营详情页已接入白名单 Markdown 渲染，支持标题、段落、列表、引用、站内/HTTPS 链接、加粗、行内代码和图片；旧资源迁移后的 `原始图片：/legacy-assets/...` 会作为图片块展示，但新增图片素材仍必须走上传和管理员审核。
- 内容素材审核模块接入后，带 `assetIds` 的内容只有在所有素材均为 `approved` 时才能发布，避免绕过图片审核边界。
- 新增旧内容资源清单：`/api/operations/legacy-assets` 会扫描旧 `content_data.js` 的封面和站内链接，并对 `/content/*.html` 旧专题页继续扫描 `src`、`href`、CSS `url(...)` 引用，输出旧站 URL、未来 `/legacy-assets/...` 路径和下载候选标记；当前只做清单，不下载、不绕过审核。
- 新增旧资源下载脚本：`pnpm legacy:assets:download` 会下载清单中的下载候选到 `apps/web/public/legacy-assets`，生成 `.yct-data/legacy-assets-download-report.json` 校验报告；下载后旧内容封面优先使用本地 `/legacy-assets/...`，缺失时再回退旧站 URL。
- 已验证旧资源下载脚本可复跑：资源清单中 91 个下载候选引用按来源和目标路径去重后实际落盘 61 个文件，总大小 72,256,470 字节；二次运行全部为 `unchanged`，失败项为 0。
- 已处理：旧内容封面和内容 Markdown 图片会先检查同站 `/legacy-assets/...` 文件是否真实存在；本地缺失时自动回退旧站 URL，避免下载未完成或临时子路径部署时出现 `feed-item-cover` 破图。下载脚本也会把 `/v2/legacy-assets/...` 正确映射回 `apps/web/public/legacy-assets`，不把临时反代前缀写进落盘目录。
- 已处理：旧内容 Markdown 的 `原始图片：...` 重写会排除颜色 token，并把真实相对图片路径改写为 `/legacy-assets/...` 或旧站回退 URL；当前真实旧内容 16 条图片行均无相对路径残留，也没有颜色 token 被渲染为图片。
- 已处理：`/v2` 反代仅作为保留旧站数据时的临时测试前缀；应用路径工具已保持幂等，标题栏图标、favicon、manifest、运营封面和 Markdown 图片会按当前公开前缀输出，后续迁回主路径时清空 `NEXT_PUBLIC_YCT_BASE_PATH` / `YCT_BASE_PATH` 即可。
- 已处理：旧内容资源清单新增正式差异报告，接口返回外链、非下载候选、本地缺失文件、重复引用和重复资源分组；下载脚本生成的 `.yct-data/legacy-assets-download-report.json` 会同步写入 `differenceReport`，包含清单 issue 统计、重复资源和真实下载失败项。当前真实旧站数据验证为 131 个原始引用、122 个唯一引用、18 个外链、12 组重复资源、本地缺失 0、下载失败 0。
- 已处理：`/admin/operations` 内容后台新增旧资源差异报告面板，通过后台专用只读 API 展示引用摘要、issue 分类、重复资源样例和真实下载失败样例；API 会校验 YCT 管理员身份，并通过 `YCT_LEGACY_ASSET_DOWNLOAD_REPORT_PATH` 读取最近一次 `.yct-data/legacy-assets-download-report.json`。
- 已处理：内容后台新增只读旧内容素材清单，基于旧资源清单和下载报告记录来源 URL、迁移路径、SHA-256、文件类型、文件大小、待审核状态和内容引用关系；当前真实旧站数据为 61 条素材记录、91 个内容引用、12 条被多处内容复用的素材、30 个重复引用已复用，SHA-256 缺失 0，真实哈希重复组 0。
- 已处理：旧内容素材清单可以导入 `.yct-data/content-asset-store.json`，后台可审核通过或驳回素材，成功后发布 `ContentAssetImported` / `ContentAssetReviewed` 事件；内容发布会读取真实素材状态，带 `assetIds` 的内容在素材全部通过后可以发布。
- 已处理：内容后台新增本地素材上传入口，文件落盘到 `apps/web/public/content-assets`，记录进入 `.yct-data/content-asset-store.json` 并等待审核；同 SHA-256 上传会复用已有素材记录，成功上传发布 `ContentAssetUploaded` 事件。下一步仍要补数据库素材表、对象存储/共享资产目录、引用回写和回滚流程。
- 已处理第一版：旧运营消息不再把 `summary` 硬当详情正文展示；当旧 `content_data.js` 的正文只等同标题、摘要或占位文本时，详情页显示“旧系统没有独立正文”的提示，并提供规范化后的原始链接入口。
- 已处理：创建内容草稿时会自动扫描 Markdown 中的同站 `/content-assets/...` 和 `/legacy-assets/...` 图片链接，并把匹配到的素材 ID 合并进 `assetIds`；临时 `/v2/content-assets/...` 与 `/v2/legacy-assets/...` 前缀也会被归一化识别，减少运营人员手动漏填素材 ID 导致发布校验失效的风险。
- 已处理第一版：旧专题 HTML 页面可以生成 Markdown 迁移预览，后台展示页面数、转换后的正文长度、图片数、链接数和转换提示；管理员可把单个旧专题载入内容编辑器，再按草稿、提交审核、素材审核和发布流程上线。当前真实旧站 4 个专题页均可转换且无转换警告。

2026-07-02 已推进服务入口管理闭环：

- `/services` 已改为读取服务入口分组数据：默认真实入口来自旧站和服务器站点配置，本地已发布入口会合并展示。
- 新增本地服务入口仓储 `.yct-data/service-entry-store.json`，并新增 `YCT_SERVICE_ENTRY_STORE_PATH` 配置；该目录不进入仓库，后续可替换为数据库 Repository。
- 新增服务入口工作流：创建草稿、提交审核、审核通过/驳回、发布；成功后发布 `ServiceEntrySubmitted`、`ServiceEntryReviewed`、`ServiceEntryPublished` 事件。
- 新增公开 API `/api/services/entries`，返回按“运营及周边、服务器网站、工具箱、其他服务”归组的服务入口。
- 新增后台 API：`/api/admin/services/entries`、`/submit`、`/review`、`/publish`；后台 API 需要真实 `ldpass` 会话和本地管理员成员记录。
- 新增 `/admin/services` 服务入口后台页面，可配置名称、描述、图标、分类、链接、打开方式、可见性和排序。
- 账号设置页在登录后增加“服务后台”入口，未登录用户仍只看到登录与本地偏好。
- 默认工具箱入口已加入旧站 `/lab/`“实验室”，作为旧版实验性工具集合总入口；旧页实际包含动态线路图、地图搜索、地图预览、数据编辑器、公交站牌生成器、路牌生成器、楼牌生成器、电报纸生成器和设计系统入口。当前同时拆出已验证可访问的具体旧工具入口：动态线路图、地图搜索、地图预览、数据编辑器、物料展示、公交站牌生成器、路牌生成器、楼牌生成器和电报纸生成器。
- 旧实验室中的“设计系统”链接当前在旧站返回 404，暂不作为独立默认入口上架，后续等旧资源迁移或链接修复后再处理。

2026-07-02 已推进线路数据导入发布闭环：

- 新增共享交通数据快照类型：`TransitDataRevision`、`TransitLineSnapshot`、`TransitStationSnapshot`、`TransitDataRevisionStatus`，允许旧站站点缺少 Minecraft 世界坐标，避免用假坐标补类型。
- 新增交通数据状态机：`imported` / `validation_failed` -> `pending_review` -> `approved` / `rejected` -> `published` -> `superseded`，发布新版时会把旧发布版标记为 `superseded`。
- 新增本地交通数据仓储 `.yct-data/transit-data-store.json`，并新增 `YCT_TRANSIT_DATA_STORE_PATH` 配置；它是数据库接入前的单机 Repository。
- 旧线路解析入口已重构为完整快照读取：继续从旧站 `metro_data.js`、`tram_data.js`、`bus_data.js`、`local_railway_data.js` 和 `ltcx/route.txt` 拉取真实数据，并保留停靠点级属性；客运班次聚合为 `coach` 模式的 `TransitLine`，同时保留首末班、班次数、票价、公司和来源链接字段。
- 新增后台 API：`/api/admin/transit/datasets`、`/submit`、`/review`、`/publish`；后台 API 需要真实 `ldpass` 会话和本地管理员成员记录。
- 新增 `/admin/transit` 线路后台页面，可导入旧站最新线路、查看摘要和校验提示、预览部分线路并执行提交、通过、驳回和发布。
- 新增公开 API `/api/transit/overview`；出行页和线路详情页优先读取已发布交通数据版本，没有发布版时继续退回旧站直读，避免现有体验中断。
- 新增客运公告解析：`ltcx/stop.txt` 迁移为 `TransitServiceNotice`，公开 API 为 `/api/transit/service-notices`；出行页会展示当前/未来客运提醒，历史提醒折叠显示，避免过期公告冒充当前强提醒。
- 新增地铁站点详情解析：`metro_station_detail.js` 迁移为 `TransitStationDetailSnapshot`，公开 API 为 `/api/transit/station-details`；线路详情页会按站名展示出入口、设施、换乘和周边站摘要，并对已有详情的站点链接到 `/travel/stations/[lineName]/[stationName]` 二级页。
- 新增客运大屏快照解析：`ltcx/screen/station.txt`、`tickets.txt`、`rttime.txt`、`notice.txt` 与 `ltcx/route.txt` 组合为 `TransitScreenSnapshot`，公开 API 为 `/api/transit/screen`；出行页展示智运大屏摘要和近期班次，`/travel/screen` 提供按线路、车站、班次号、检票口和时间状态筛选的二级页。
- 共享事件 Schema 新增 `TransitDataRevisionImported`、`TransitDataRevisionReviewed`，并继续使用 `TransitDataRevisionSubmitted`、`TransitDataRevisionPublished`。

2026-07-02 已推进轻量 PWA 增强：

- 新增 `apps/web/public/sw.js`：缓存应用壳、manifest、图标、公开一级页面和离线兜底页。
- 新增 `/offline` 离线兜底页面；普通导航离线且没有近期缓存时会退回该页面。
- 新增 `PwaBridge` 并接入根布局，在安全上下文或本地开发环境注册 Service Worker。
- 近期访问的出行二级页 `/travel/[id]`、`/travel/screen`、`/travel/stations/[lineName]/[stationName]` 和运营详情 `/operations/[id]` 进入运行时缓存；`/travel/screen` 同时纳入应用壳预热；公开 API `/api/transit/overview`、`/api/transit/service-notices`、`/api/operations/feed`、`/api/services/entries`、`/api/settings/bootstrap` 使用 stale-while-revalidate。
- 站点详情 API `/api/transit/station-details` 纳入数据缓存和账号页“刷新缓存”入口，支撑近期线路详情离线查看站点摘要。
- 客运大屏 API `/api/transit/screen` 纳入数据缓存和账号页“刷新缓存”入口，支撑出行页近期班次摘要离线查看。
- 地图公开基础 API `/api/map/tile-providers`、`/api/map/markers`、`/api/map/poi-categories`、`/api/map/unmined-regions` 纳入数据缓存名单，用于后续自定义范围离线包的基础数据预热。
- Service Worker 明确不缓存 `/account`、`/admin`、`/auth`、`/api/auth`、`/api/admin`，避免登录态、后台页面和鉴权结果进入离线缓存。
- 账号设置页新增安装入口、刷新缓存、清理缓存和自定义矩形离线范围管理；范围记录保存到浏览器本地，包含 `packageId`、名称、Minecraft X/Z 边界、状态和刷新时间，可手动刷新基础公开数据或删除。登录用户打开账号页时会拉取并合并 `/api/account/offline-packages` 服务端请求记录；保存或刷新范围时会写入 `.yct-data/offline-package-store.json` 并发布 `OfflinePackageRequested` 事件，删除范围时会清理账号侧请求记录并发布 `OfflinePackageRequestDeleted` 事件。
- 已处理：Service Worker 会从 `/sw.js` 或 `/v2/sw.js` 自身地址推导应用子路径，并用归一化后的应用路径判断应用壳、公开 API、近期内容、敏感路径和离线兜底；临时 `/v2` 反代不会再让 PWA 缓存规则只匹配根路径。
- 当前通知类型管理已支持登录用户同步到 `.yct-data/notification-preference-store.json` 并发布 `PushPreferenceUpdated` 事件；浏览器设备订阅可在配置 `NEXT_PUBLIC_YCT_WEB_PUSH_PUBLIC_KEY` 后登记到 `.yct-data/push-subscription-store.json`，并发布 `PushDeviceSubscribed` / `PushDeviceSubscriptionRevoked` 事件。已新增本地事件 Outbox `.yct-data/event-outbox-store.json` 和受 `YCT_INTERNAL_TASK_TOKEN` 保护的 `/api/internal/events/process` 重放入口；已新增服务端投递队列 `.yct-data/push-delivery-store.json`、真实 `web-push` 发送器、失败/延后回写、同用户同类型最小间隔限频和内部处理接口 `/api/internal/notifications/process`。缺少 VAPID 配置时不会伪造送达，只会把到期投递延后并记录原因。通知类型默认预选项已可通过 `NEXT_PUBLIC_YCT_PUSH_DEFAULT_ENABLED_TYPES` / `YCT_PUSH_DEFAULT_ENABLED_TYPES` 配置；跨实例数据库 Outbox、正式计划任务部署和送达统计看板仍待后续实现。自定义矩形离线范围当前只登记边界、同步账号侧请求并预热基础数据，不代表真实瓦片离线包已经生成。体积上限、范围上限、增量更新和服务端生成策略仍保持待拍板。

2026-07-02 已推进出行提醒与本地历史闭环：

- 共享契约 `TripReminder` 已扩展来源、路线快照、旧订单来源、同步时间和完整状态字段；`TripReminderScheduled` 事件 payload 预留 `title` 与 `source`。
- 新增浏览器侧行程提醒存储适配器：新数据保存到 `yct.tripReminders.v1`，首次发现旧站 `localStorage.orders` 时只读导入为 `legacy_order`，并用 `yct.tripReminders.legacyImportedAt` 避免重复导入。
- 新增服务端行程提醒同步 MVP：登录用户可在账号页把未同步提醒提交到 `/api/account/trip-reminders`，写入 `.yct-data/trip-reminder-store.json`，成功后回写本地 `syncedAt`；账号页打开时会拉取服务端提醒并保守合并到本机；待提醒记录会发布 `TripReminderScheduled` 事件，并由通知投递监听器按用户偏好和活跃设备订阅写入 `.yct-data/push-delivery-store.json`。旧站 `orders` 来源的提醒同步前会单独确认，拒绝时仍可同步非旧站提醒；确认状态保存在本机，账号页可撤销本地同意，已登录时会删除账号侧旧站提醒副本并发布 `TripReminderDeleted`。
- `/travel` 新增行程提醒面板，支持匿名用户手动创建、完成、取消和删除本地提醒，并分为“即将进行”和“历史行程”展示。
- `/account` 新增本地历史概览，展示行程提醒、历史行程、班次查询记录和待同步数量，提供进入出行页管理、班次查询、同步提醒到账号和清空新版本地历史的入口。
- 当前阶段不把旧 `orders` 解释成真实新版票务订单；班次查询记录不作为服务端订单同步。旧站 `orders` 来源同步账号已有最小确认门槛、本地撤销同意和账号侧副本删除；更细冲突解决和正式迁移文案仍待后续实现。

2026-07-02 已推进公开 POI 投稿与审核闭环：

- 新增本地 POI 投稿仓储 `.yct-data/poi-submission-store.json`，并新增 `YCT_POI_SUBMISSION_STORE_PATH` 配置；该目录不进入仓库，后续可替换为数据库 Repository。
- 新增 POI 投稿工作流：验证服务器账号的 `ldpass` 用户提交公开 POI，管理员审核通过/驳回，审核通过后发布为公开 POI；成功后发布 `PoiSubmitted`、`PoiReviewed`、`PoiPublished` 事件。
- 新增前台投稿 API `/api/map/poi-submissions`；当前前台只开放点坐标提交，接口和数据模型继续保留线、多矩形和多边形几何。
- 当前前台入口位于 `/map` 的地图浏览/图层面板内，点击“投稿 POI”打开弹窗；表单采集地点名称、允许公开投稿的 POI 分类、简介、相关链接、上传图片或图片链接和 Minecraft X/Z 坐标，并以 `public_pending_review` 的点状公开 POI 提交审核。
- 当前投稿接口要求登录 `ldpass` 且已验证服务器账号；匿名用户、非验证用户和私有 POI 暂不开放提交。图片第一版支持用户文件上传到 `.yct-data/poi-submission-images`，上传成功后发布 `PoiSubmissionImageUploaded` 事件并把生成的图片 URL 写入 POI 投稿；图片安全检查、对象存储、营业时间、电话、出入口/设施关联、代表 POI、线性/区域几何的可视化编辑仍待后续后台与表单设计。
- 新增后台 API `/api/admin/map/poi-submissions`、`/review`、`/publish`，并新增 `/admin/map-poi` 后台页面。
- `/api/map/markers` 会合并本地已发布公开 POI 与旧地图/BDSLM 标记；外部标记源不可用时，仍可返回本地已发布 POI。
- `/account` 登录后的后台入口增加“POI 后台”。

不阻塞 MVP、做到对应阶段再拍板：

- 瓦片 HTTPS/反代最终方案。
- 后台标记数据生成道路图的具体编辑方式。
- 自定义矩形范围离线包的体积上限、范围上限和增量更新策略。
- Web Push 正式计划任务部署和跨实例 Outbox。
- 管理员 PIN 来源。
- 票务库存、核销链接、退票和对账细则。
- 客运班次订购与展示的交互深度以旧站 `https://yct.shangxiaoguan.top/ltcx/` 为参考：需要覆盖线路/站点/日期筛选、班次卡片、动态票价、购票确认、订单详情、条形码或核销凭证、退票、本地历史和停运提醒；真实票券、核销和跨设备订单同步仍以 `ldpass` 接入方案为准。
- 新增方向：客运、轮渡、航班等班次查询和票务能力需要通过同一套新版查询订票平台解决，不沿用旧 `/ltcx/` 的纯前端本地订单逻辑。已新增 `docs/TRAVEL_TICKETING_PLATFORM.md` 记录统一模型、状态机、事件、踩坑点和测试用例，并已在 `packages/contracts/src/domain.ts`、`packages/contracts/src/events.ts` 和 `packages/schemas/src/ticketing.ts` 中补充第一版票务领域与事件契约。
- 已处理第一版：统一班次查询新增只读票务可售性预检；`/api/travel/schedules` 会在真实班次上返回 `ticketing` 状态，`/api/travel/ticketing/availability?tripInstanceId=...` 可单独查询。预检读取 `.yct-data/ticketing-catalog-store.json` 中真实配置的票种和库存，没有配置时只返回不可售原因，不生成默认票种、模拟库存或真实订单。
- 已处理第一版：新增 `POST /api/travel/ticketing/orders` 订单草稿创建入口；接口要求真实 `ldpass` Active 用户，并且必须存在真实票种与库存池，成功时写入 `.yct-data/ticket-order-store.json` 的 `draft` 订单和 15 分钟库存占用，并发布 `TicketInventoryHeld` / `TicketOrderCreated` 事件。当前前台仍不直接启用购票按钮，缺少票种或库存时返回 409，不落库、不发事件。
- 已处理第一版：新增 `GET /api/travel/ticketing/orders` 当前用户订单草稿列表，以及 `POST /api/travel/ticketing/orders/:orderId/cancel` 取消草稿订单；取消只允许当前用户自己的 `draft` / `pending_issue` 订单，会释放对应库存占用并发布 `TicketOrderCancelled` 事件。

## 12. 界面反馈处理进展

2026-07-02 用户针对当前预览提出以下修改意见。当前进展：

- 已处理：`/map` 页 `sidebar-stack` 此前高度为 `0` 的问题已通过限定主导航侧栏布局规则处理；仍建议后续人工预览桌面侧栏和移动端底部抽屉的实际可见区域。
- 已处理：`map-panel-section` 精简、移动端贴近底部导航、地图拖动缩放、瓦片加载、标记点图标沿用 `map.shangxiaoguan.top`。
- 已处理：`/search` 页改用二级页面布局，`search-box` 脱离 `search-results-panel`。
- 已处理：`content` 与 `content-stack` 默认最大宽度为 `720px`，地图页保持全宽。
- 已处理：线路详情页面改为二级页标题、线路属性卡片、方向切换胶囊控件和竖向站点序列；左侧线条颜色使用线路色或对应交通方式语义色。
- 已处理：线路列表增加 chip 栏，用于切换显示全部线路或按交通方式筛选。
- 已处理：线路标识样式参考用户附图；前面的交通方式图标暂时只在线路列表里展示，详情页线路标识不重复交通方式图标。
- 已处理：`/travel` 添加行程提醒的表单放入弹窗，不长期占据出行页主内容区域。
- 已处理：`/travel/screen` 智运大屏二级页使用真实旧站客运大屏数据，展示完整班次、途经站、检票口、票价、运行时间和运营方；它仍是班次查询/展示，不代表真实检票核销能力已经上线。
- 已处理：旧地铁站点详情二级页使用真实 `metro_station_detail.js` 数据，展示站内层级、出入口、设施、换乘和周边站点；线路详情中有详情的站点可点击进入，全局搜索也能检索已有站点详情。当前不为缺少详情数据的公交/客运站点生成空页面。
- 已处理第一版：线路详情入口作为 `transit-line` 类型地图对象合并到 `/api/map/markers`，地图侧栏搜索线路名时可进入对应线路详情页；线路对象只使用真实站点坐标作为 `MultiPoint` 候选信息，没有坐标时只展示“待补线路坐标”，不凭站点顺序伪造道路级线形。
- 已处理第一版：新增地图探索侧线路详情二级页 `/map/lines/[id]`，复用既有线路属性卡片、方向切换和站点序列；地图线路型 POI、全局搜索线路结果和出行页现有线路列表均跳转到该地图侧详情页。旧 `/travel/[id]` 暂时保留兼容既有链接。
- 已部分处理：旧地图标记点中“道路”分类下所有同名标记点会在 `/api/map/markers` 额外归并为 `MultiPoint` 端点集合；这些端点没有顺序，地图侧栏可搜索和定位，但当前不会画成路径线，避免误当作有序路径。
- 新增待办：线路需要作为一类或两类独立线性 POI 存进数据库；数据至少记录线路方向、途径站点点标记和展示属性，可选记录途径坐标序列。若不记录坐标，则必须通过道路级导航按途径站点规划路线，不能直接用站点顺序生成伪线形。
- 已处理第一版：`/map` 搜索或选中有真实坐标的线性 POI 时，会在地图上展示中心标签和端点小点；道路端点组不连线，`transit-line` 在未补线路坐标前仍只作为侧栏检索和详情入口，避免把无序端点或缺失坐标伪装成路线。
- 已处理：`/map` 页主导航 `.sidebar-stack` 不再依赖固定定位子元素撑开高度，地图侧栏也避免被主导航折叠规则误伤；后续仍需在浏览器里确认桌面侧栏和移动底部抽屉的实际可见区域。
- 已处理：`/account` 页面里的 `.settings-row` 恢复卡片背景色，同时继续保持二级页内去描边、减少层级噪声的方向。

2026-07-02 追加记录的新反馈，当前进展：

- 已处理第一版：地图页视觉层级调整为 `.map-sidebar-stack` 只负责定位，`.map-marker-list` 承接背景、描边、边距、阴影与滚动；`.map-search-box` 增加阴影；`.map-toolbar` 增加背景、描边、阴影和毛玻璃效果。
- 已处理第一版：地图标记整体缩小约 30%；小尺寸视口也保留文本标签，并用图标+标签碰撞盒隐藏当前尺寸和范围下会重叠的标记点，避免地图上出现互相覆盖的文字。
- 已处理第一版：点击地图标记或侧栏选中特定兴趣点后，会在地图操作栈中展示“简介 / 设施或出入口”详情面板，并在地图上高亮该兴趣点；周边搜索移入操作栏按钮，当前设施数据仍等待后台结构化补充。
- 已处理第一版：公交、地铁、有轨、客运、地方铁路等线路介绍已有地图探索二级页面 `/map/lines/[id]`；`/travel` 已收窄为“出行服务”和“行程提醒”两个模块，出行服务只保留班次查询、智运大屏/客运展示、票券与订单预留入口，线路与站点浏览继续交给地图探索。真实订票、票券、核销、退票以及轮渡/航班更深接入仍待后续统一票务平台推进。
- 已处理第一版：地图瓦片缺失区域继续通过 uNmINeD region 索引过滤，请求层避免破图；地图页备案信息已转移到地图区域右下角。
- 已处理第一版：桌面端侧边导航和内容区域的整体对齐方式调整为居中，普通内容区仍保留 `720px` 最大宽度，地图页保持全宽特殊布局。

2026-07-02 地图页新增反馈，当前进展：

- 已处理第一版：地图操作面板内部不再由 `.map-panel-section` 承担滚动条；滚动容器拆到 `.map-marker-list` 和 `.map-poi-detail-body`，搜索框保持固定可见。
- 已处理第一版：标记点名称和详情展示会去掉全角空格，避免旧数据中的排版空白影响搜索和标签宽度。
- 已处理第一版：道路或高速公路类标记只作为内部分类和粗线层样式判断使用；地图点位继续沿用旧地图图标和地点名称，不再额外显示“道路/高速”等文字徽标。
- 已处理第一版：`map-layer-panel` 只保留“加载地图瓦片”开关和“投稿 POI”弹窗按钮；POI 投稿表单已从常驻面板改为弹窗。
- 已处理第一版：地图瓦片开关关闭时，会基于旧道路端点组绘制粗线近似轨迹。轨迹参考旧站 `map_search/navigation.js`：先按 X/Z 跨度选择主轴起点，再用最近邻串联全部端点；之后按整条近似线包围盒判断是否经过当前视口，避免只看可见端点导致一端在视口外的长路段缺失。由于旧道路标记点没有严格顺序，该线仅是视觉参照，不代表道路级导航。
- 已处理第一版：地图区域新增比例尺和光标所指 Minecraft X/Z 坐标显示；地图标记列表新增展开/收起按钮。
- 已处理第一版：地图页在主导航收起时不再渲染普通内容末尾的 `site-legal`，备案和免责声明统一交给地图区域右下角的 `map-legal`。
- 已处理第一版：地图 POI 详情会为地铁站、公交站、有轨站、地方铁路/专用线车站和客运站展示接驳线路，数据来自真实线路概览并按清理排版空白后的站名匹配。
- 已处理第一版：道路类透明图标文件按透明占位处理，不再作为普通点位图标渲染，也不会回退成默认地点图标；道路点继续用于道路端点组和瓦片关闭时的粗线层。
- 已处理第一版：搜索结果态的地图点位碰撞改为只隐藏重叠标签，保留标记点本体；普通浏览态仍按拥挤程度隐藏冲突点位。
- 已处理第一版：道路端点组归并显式纳入 `road`、`roadpoint`、`highway-s1` 和 `toll-gate` 图标来源；点选道路端点/道路详情会聚焦道路对象并高亮近似轨迹，普通道路粗线大面积重叠时隐藏较短者，高速/快速路不参与隐藏。
- 已处理第一版：站点详情里的接驳线路标识可点击选中地图线路对象，详情面板展示线路站点序列，地图区域高亮已有站点坐标形成的近似线路轨迹。
- 已处理第一版：普通点状地点详情增加操作栏，“查看路线”使用 `directions` 图标和重点按钮样式，“搜索周边 / 收藏 / 分享”使用图标按钮；道路、线路等线性地点不显示普通地点操作栏。
- 已处理第一版：地图缩放改为交互层连续无级缩放，瓦片资源层仍按最近的 uNmINeD 整数 zoom 层级取图并进行屏幕缩放；比例尺、标记点和轨迹使用连续缩放值计算。
- 已处理第一版：`/travel` 主内容不再铺开完整线路列表，只保留“出行服务”和“行程提醒”两个主模块；客运班次、统一票务平台预留、客运大屏、线路与站点导向都收纳到出行服务内，完整线路浏览继续转入地图探索。
- 已处理第一版：新增统一班次查询入口 `/travel/schedules` 和公开 API `/api/travel/schedules`，客运使用旧 `ltcx` 真实班次、站点、检票口、票价和运营方数据；轮渡仍作为未接入服务显示，不生成模拟班次。当前页面只做查询与旧版参考入口，不代表真实票务、电子票或核销能力已上线。
- 已处理第一版：统一班次查询接入 `YCT_FLIGHT_DATA_URL` 航班文本数据源，默认参考 `https://haojin.guanmu233.cn/data/flight_data.txt`；仅纳入“临东金桦”起飞/经停/到达的航班，以及航空公司为“临东航空”的航班。航班卡片展示航班号、起降时间、运行日、值机/到达位置、票价、承运方和机型。
- 已处理第一版：航班数据读取增加短重试，缓解外部文本源偶发 `ECONNRESET` 导致航班服务随机降级为“未接入”的问题；长期仍需要把航班数据迁入 YCT 后台或稳定快照。
- 已处理第一版：统一班次查询新增浏览器本地班次记录，保存到 `yct.travelScheduleHistory.v1`，最多保留最近 50 条；用户可手动保存班次，添加班次提醒时也会自动记录。账号页“本地历史”会合并展示行程提醒和班次记录，但这些记录不代表订单、票券、占座或核销凭证。
- 已处理第一版：统一班次查询改为读取 `TravelScheduleServiceProfile`，服务筛选、班次卡片和本地班次记录使用服务 Profile 返回的图标、颜色和排序，不再把客运/轮渡/航班语义色写死在查询页面里。
- 已处理第一版：统一班次查询增加服务日期筛选，页面默认选中今天，公开 API 支持 `serviceDate` 和兼容参数 `date`。航班等带 `operatingDays` 的数据会按日期对应星期过滤；旧客运逐班次数据暂缺运行日字段时保持展示，避免凭空假设班次只在某些日期运行。
- 已处理第一版：统一班次查询增加经过车站、起点和终点筛选，公开 API 支持 `originStationName` / `destinationStationName` 并兼容 `origin` / `destination`、`from` / `to`。起终点同时存在时按真实站点序列判断方向，只返回起点不晚于终点的班次。
- 已处理第一版：统一班次查询结果接入旧 `ltcx/stop.txt` 客运提醒，页面根据所选服务日期展示匹配公告。由于旧公告只提供时段和原因，当前不自动把具体班次标为停运或不可购票，后续需要后台补充线路/站点/班次级规则后再联动可售状态。
- 已处理第一版：地图图层开关升级为“卫星 / 路网 / 交通”多段式浏览模式，并提供标记点、线条与标签开关。卫星模式加载瓦片并透明化道路线条，保留道路文字；路网模式关闭瓦片突出道路网络；交通模式关闭瓦片、淡化道路并提高交通 POI 优先级。
- 已处理第一版：地图内线路详情的站点时间线节点/线条使用线路色或交通方式语义色；站点列表提供正向/反向分段控制，方向切换会根据 `oneWay: up/down` 过滤单向站，避免简单反转完整站点数组。
- 已处理第一版：瓦片整数层级切换增加旧层淡出、新层淡入过渡；`map-marker-dot`、线性 POI、道路/线路轨迹增加与瓦片层一致的移动/缩放过渡，降低拖动或缩放时标记点、轨迹与瓦片视觉脱节的问题。
- 已处理第一版：道路文字标签参与普通标记点同一套碰撞检测；线性对象标签锚点取近似折线中点，确保标签落在道路或线路轨迹上。普通道路不补线性图标，标签中心与道路轨迹锚点对齐，局部 Z 跨度明显大于 X 跨度时使用竖排文字；选中道路近似轨迹改用强调色高亮。
- 已处理第一版：地图标记列表增加可折叠分类筛选；无搜索词时按当前地图中心列出最近标记，搜索时展示匹配结果。
- 已处理第一版：除页面根滚动条外，内部滚动容器的滚动条轨道背景设置为透明，降低面板滚动条对地图和卡片的视觉干扰。
- 已处理第一版：普通点状 POI 的“查看路线”按钮会创建路线规划草稿卡片，记录地图中心起点、目的地点名和目的地坐标，并允许更新起点或重新聚焦终点；正式道路级路径仍等待后台道路图、可通行规则和权重数据发布，不使用旧道路端点粗线冒充导航结果。

2026-07-03 当前 3300 预览新增反馈，先记录为待办：

- 已处理第一版：地图页面支持触控设备双指捏合缩放，复用现有连续缩放和地图中心换算，瓦片层、标记点层、道路/线路轨迹层继续跟随同一套 `mapView` 状态同步缩放。
- 已处理第一版：区域/父子 POI 先按旧地图命名规则推导只读关联；若存在父地点 `XXXX`，则点名 `XXXX-OOOO` 会出现在父地点详情的“设施/出入口”栏中，并可点按聚焦到对应子 POI。存在子地点的父地点会作为临时默认代表点参与地图碰撞优先级加权，优先保障这类代表地点展示。后续仍需要后台显式维护出入口、楼栋、景点、设施等分组，并支持区域 POI 指定或覆盖代表 POI。
- 路线规划需要从“路线草稿卡片”升级为路线规划页能力：起点/终点先按自身或上级区域 POI 的入口/出口吸附到道路，再在道路网络中规划；道路之间在约 50 格范围内可按连通/交叉候选处理；公共交通启用时需要把步行接驳、站点间公共交通线路和终点接驳组合成完整路径。
- 已处理第一版：地图路线规划卡片新增交通方式开关和多方案初步结果；当前根据直线距离、旧道路端点、已导入站点、真实线路站序和站点 `travelTime` 生成步行直达、道路步行估算、公共交通直达和一次换乘候选，按耗时/距离排序后根据启用交通方式数量动态展示多条可能路径，并在地图上用虚线折线高亮选中方案。道路步行估算会把起终点接驳到最近道路端点，使用旧道路端点近似排序和 50 格连通候选生成过渡路径，并明确标注不代表正式道路级导航。路线卡片已增加“最快到达”“最少换乘”“最少步行”等徽标；步骤时间线已从纯文本升级为地点、步行、乘车和换乘过程的结构化节点，并按参考稿调整为地点节点与过程竖条的视觉层级，乘车步骤使用对应线路色或交通方式语义色。路线结果态保留的起点、终点和途经站点从未碰撞过滤的投影点中选取，不再被地图碰撞隐藏规则误删。公共交通候选会过滤起终点同站进出的结果，线路区间切片使用过滤后的可定位站点索引，避免把实际乘坐区间外的终点站或无关站点纳入地图高亮路径。所有方案均明确标注为估算方案，正式道路图、区域 POI 出入口吸附、线路真实轨迹坐标、高阶换乘和多策略权重仍待道路网络、线路方向坐标和时刻表数据继续完善。
- 已处理第一版：地图道路和线性 POI 标签优先取当前视口内可见折线片段的中点，并通过线段裁剪保证锚点落在轨迹上；无法计算可见片段时才回退整条轨迹中点。
- 已处理第一版：地图“路网”模式不再对住宅、办公楼/建筑、工厂等低交通相关标记点额外降权，文字标签可按普通标记规则显示；这类标签只在“交通”模式下降低优先级并按拥挤情况隐藏。
- 已处理第一版：地图搜索新增“搜索特定地点周边的标记点”模式；POI 介绍页的“周边”按钮会携带当前 POI 作为中心，列表按到该 POI 的距离展示附近标记，并提供退出入口。
- 已处理第一版：地图区域用蓝色白边圆点标示“回到默认视图”按钮对应的默认落点；路线规划草稿在地图上额外显示填充 `location_on` 的起点与终点标记，并在草稿卡片显示时隐藏 `map-marker-list`，避免路线面板和标记列表争抢空间。
- 已处理第一版：蓝点、起点、终点等临时标记接入和普通标记一致的移动、拖拽和缩放过渡；后续新增轨迹点/途经点时应复用同一类引导标记样式，避免与瓦片、标记和轨迹图层视觉脱节。
- 已处理第一版：`map-poi-detail-panel` 和 `map-route-plan-card` 增加面板级临时收起/展开按钮；收起时保留标题栏和关闭入口，不清空已选地点或路线草稿。
- 已处理第一版：`map-route-plan-card` 的圆角、图标和字号已收敛到地图浮层尺度，并限制最大高度；移动端 `map-control-stack` / `map-sidebar-stack` 改为贴在底部导航上方且适当放大最大高度，避免路线卡片被底部导航遮挡。路线交通方式开关支持折叠/展开，折叠态保留常用方式，隐藏方式中存在启用项时“更多”按钮显示激活态。起点/终点行已按输入控件视觉处理，并支持聚焦后输入地点、查看真实标记候选、点选候选、点选地图标记或轻点地图空白处回填端点；显示端点候选时会隐藏交通方式、路线方案和路线说明，候选项标记图标被限制在 24px 轨道内；道路吸附和区域 POI 出入口吸附仍待后续实现。
- 已处理第一版：`/search` 搜索结果页增加分类 chip 栏，按全部、运营、线路、站点、服务切换结果，避免某一类结果过多时压住其他类型结果。
- 已处理第一版：`account-badge.is-dot` 增强描边和阴影对比度，浅色模式下不再只依赖接近标题栏的背景色区分状态点。
- 已处理第一版：`/travel/schedules` 的 `schedule-trip-card` 参考用户 2026-07-03 附图重排，顶部显示交通方式图标、真实班次号/线路和票价，主体强调出发时间、运行/经停和到达时间，移动端继续保持三段式票据布局；底部保留添加提醒、保存记录、旧版参考和票务状态操作，运营方和车型/船型/机型字段仍只展示真实数据或待公布状态。
- 已处理第一版：`/account` 通知与免打扰区域文案拆清楚，总开关控制本设备是否接收推送，分类决定允许哪些类型推送，免打扰时段只负责静默或延后提醒。
- 后续需要规划多语言支持，暂定简体中文、繁体中文和英语；地名、组织名、站名等专有名词翻译策略待定，不能先用机器翻译直接替换业务数据。
- 管理员侧测试流程需要文档化；已新增 `docs/ADMIN_TESTING.md` 记录当前如何配置 `ldpass`、初始化管理员、进入后台页面和验证 API 边界。

2026-07-03 本地开发站点打开缓慢排查，当前进展：

- 已处理第一版：`/api/transit/overview`、线路型 POI、POI 分类和 `/api/map/markers` 外部标记源读取加入短 TTL 进程内缓存，并合并进行中的同 key 请求，避免首页、地图页和 RSC 预取同时触发多次旧线路/地图数据全量读取。
- 已处理第一版：旧线路快照读取改为并行读取各旧数据源，远程旧站文件读取增加 `YCT_LEGACY_DATA_FETCH_TIMEOUT_MS` 超时配置，默认 8 秒，避免旧站或外部地图源响应慢时把本地 `next dev` 请求队列拖到分钟级。
- 当前结论：`localhost:3300` 打开很久主要是开发服务器被 `/api/transit/overview`、`/api/map/markers` 和 `/map` 的旧数据重复拉取/解析占满；代码侧已降低重复工作，但已运行的旧 dev 进程仍可能需要重启后才完全吃到新逻辑和清理 Next dev cache。
- 已处理第一版：`/map` 改为客户端懒加载地图大组件，降低 Next dev 对地图页的 SSR/编译压力；旧客运大屏快照读取加入 30 秒进程内缓存，减少 `/travel`、统一班次查询和客运大屏页面重复读取旧 `ltcx` 文本。
- 已处理第一版：补充静态 `apps/web/public/manifest.webmanifest`，使用相对 `start_url`、`scope` 和图标路径兼容根路径与 `/v2` 临时子路径；同时在非生产环境不向页面输出 PWA manifest 链接。本地开发继续由 `PwaBridge` 清理同源 Service Worker 和 `yct-*` Cache，重启脚本会清理 `.next/dev`，降低旧 RSC/chunk 或 Next dev manifest route 缓存污染导致加载失败的概率。
- 已处理第一版：统一班次查询增加 30 秒进程内查询结果缓存，航班文本源增加 60 秒进程内读取缓存；缓存 key 包含旧数据源、航班 URL、服务 Profile 仓储、票务目录仓储和查询参数，降低 `/travel/schedules` 与票务可售性预检连续访问时重复拉取外部数据的压力。
- 已处理第一版：启用 Next.js `output: 'standalone'` 并新增 `scripts/web-build-artifact.ps1` / `pnpm web:artifact`，可在本地或 CI 生成上传服务器的 web 独立部署包，避免 2 核 4G 云服务器上开 Codex 拉仓库并执行完整构建。部署说明记录在 `docs/DEPLOYMENT.md`；当前服务器 Node.js 18.6.0 不满足仓库 `node >=20.9.0` 要求，正式运行 standalone 包前需要升级 Node。
- 已处理第一版：针对云服务器部署时 `@swc/helpers/__/_interop_require_default` 与 `@next/env` 等 Next 运行时依赖缺失的问题，部署打包脚本会从 pnpm 的 `next@.../node_modules` 中解析并补拷贝真实依赖目录到 standalone 的 `apps/web/node_modules`；生成的启动脚本新增 `-NodePath` 参数，用于在宝塔内置 Node 最高仅 18.6.0 时改用便携版 Node 22。已用 `.deploy/web/start-yct-web.ps1` 在本机临时启动 3400 端口并验证 `/api/health` 返回 200。

## 13. 完成定义

一次阶段性交付只有满足以下条件才算完成：

- 用户目标中的关键路径可用。
- 没有使用模拟数据冒充真实数据。
- 已知待拍板问题没有被擅自写死。
- 关键文档同步更新。
- 没有遗留调试日志。
- 没有启动中的开发服务器。
- 文件编码保持 UTF-8 无 BOM。
- 如果修改了代码，至少完成与风险匹配的本地验证。
