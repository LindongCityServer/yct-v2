# 雨城通 v2（Yuchengtong / YCT）需求与架构边界草案

更新时间：2026-07-02

本文档用于记录 `yct.shangxiaoguan.top` 重构的已知需求、边界、阶段目标、技术路线建议和需要拍板的问题。后续新增想法优先补到“待拍板问题”和“信息待补充”里，确认后再移动到对应需求章节。

## 1. 项目定位

雨城通 v2 是面向临东市服务器玩家、游客、运营人员和管理员的公共交通与服务器生活服务入口。项目英文名统一写作 `Yuchengtong`，缩写统一写作 `YCT`。重构目标是在保留旧版功能的前提下，把原来分散的静态页面整合成一个响应式 Web 应用，并补齐后台、审核、账号、数据管理和可扩展的数据源适配能力。

核心原则：

- 前台体验优先围绕五个一级模块组织：运营信息、地图探索、出行、更多服务、账号相关设置。
- 后台能力围绕“内容、线路/站点、地图兴趣点、服务入口、用户历史与设置”建立审核和发布流程。
- 核心业务不绑定临东当前的数据来源，所有外部系统通过适配器接入。
- 保留旧项目中已有的线路查询、动态线路图、行程提醒、客运大屏、数据编辑器等能力，但逐步把数据和状态从浏览器本地迁移到后端。

## 2. 已知输入

### 2.1 旧项目盘点

旧项目源码来自 `LindongCityServer/yct`。当前结构显示它是以原生 HTML、CSS、JavaScript 为主的纯前端站点，主要模块包括：

| 模块          | 旧路径              | 现状观察                                                                  | v2 处理方向                                               |
| ------------- | ------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------- |
| 首页          | `/`                 | 首页资讯、Banner、搜索、服务器状态、行程提醒、快捷入口                    | 并入“运营信息”，保留为默认入口                            |
| 地铁线网      | `/metro_map`        | SVG 线网、站点详情、路径规划、票价、截图分享、行程提醒写入 `localStorage` | 并入“地图探索”，线路图作为地图图层/二级视图               |
| 公交线路      | `/bus_routemap`     | 公交线路展示，依赖 `data/bus_data.js`                                     | 并入“地图探索”和线路详情                                  |
| 动态线路图    | `/dynamic_routemap` | 动态线路图生成工具，脚本体量较大                                          | 作为“更多服务 / 工具箱”入口，后续可组件化                 |
| 数据编辑器    | `/data_composer`    | 可导入导出 JS 格式线路数据，为动态线路图生成自定义线网数据                | 升级为后台线路/站点编辑与审批的一部分                     |
| 客运购票      | `/ltcx`             | 单页内嵌大量逻辑，订单和设置主要存在本地                                  | 并入“出行”，先做行程与班次查询，真实订票后续联动 `ldpass` |
| 客运大屏      | `/ltcx_schedule`    | 从文本文件解析站点、班次、检票口等信息                                    | 并入“出行”或“更多服务 / 智运大屏”                         |
| 产品/物料展示 | `/product_gallery`  | 独立展示页                                                                | 并入“更多服务”或后续内容页                                |
| 实验室        | `/lab`              | 旧版实验性工具集合，包含动态线路图、地图搜索/预览、数据编辑器、生成器等   | 并入“更多服务 / 工具箱”入口，保留旧工具集合总入口         |

旧数据来源：

- 运营信息：`data/content_data.js` 与 `content/*.html`。
- 轨道交通线路：`data/metro_data.js`、`data/metro_station_detail.js`、`data/tram_data.js`、`data/local_railway_data.js`。
- 公交线路：`data/bus_data.js`。
- 客运：`ltcx/*.txt`、`ltcx/screen/*.txt`。
- 行程提醒、主题、通知设置、订单历史：大量使用 `localStorage` / `sessionStorage`。
- 迁移源优先支持直接从旧站 `https://yct.shangxiaoguan.top/data` 拉取最新数据；本地旧项目 `data` 目录作为可复现 fallback。

### 2.2 原型图观察

一级页面：

- 移动端采用顶部品牌栏、内容区、底部导航。运营信息页底部上方有类别筛选与乘车码入口。
- 桌面端采用顶部品牌栏、左侧导航卡片、右侧内容区。地图页左侧/中间为操作面板，右侧地图需要铺满整个视口。
- 桌面端侧边导航与内容区域需要在可用宽度内整体居中；普通内容页仍遵守默认最大宽度，地图页保持全宽并单独处理覆盖面板。
- 四个主要导航项在原型中表现为运营、探索、出行、服务；账号入口在顶部右侧。
- 免责声明与备案号：桌面端有侧边主导航时放在侧边区域、主导航卡片外侧；侧边导航折叠时放内容底部。移动端仅放在 `/account` 页面内容底部，避免占用底部导航和地图可见区域。
- 地图页是备案信息的特殊场景：备案信息不进入普通内容流，后续需要放在地图区域右下角，并使用辅助文本样式，避免遮挡地图操作面板。

二三级页面：

- 移动端二级页面采用顶部返回栏、主内容、底部/浮动操作区。
- 桌面端二级页面采用顶部返回栏、居中最大宽度内容区，右上角可放当前页面操作。
- 地图二级页面是特殊布局：地图必须保持可见并覆盖全视口，业务面板覆盖其上或停靠侧边。

### 2.3 外部资源

- 图标：统一使用 Material Symbols Outlined，可通过 CDN 引入，生产环境需要降级方案；不要再使用 `material-symbols-rounded`，避免部分图标的填充态不可辨识。
- 地图瓦片：
  - 当前较新的 HTTP 瓦片源：`http://ld.cmsy.xyz:19136/`。
  - 若 HTTPS 主站产生混合内容风险，可切换到 `https://map.shangxiaoguan.top` 下的静态地图资源；该资源效果较好且无混合内容风险，但可能不反映最新地图状态。
- 当前地图标记点：`https://map.shangxiaoguan.top/`。
- POI 分类图标：可参考 `https://map.shangxiaoguan.top` 下的各类 `png` 文件；注意部分业务分类可能对应多个图标文件，需要建立分类到图标的映射表。
- App 和网站图标源文件目录：`assets/brand/`。用户后续把源文件放入该目录；生成后的 Web/PWA 图标输出到 `apps/web/public/icons/`。
- 第一阶段地图数据配置：
  - `YCT_TILE_FRESH_HTTP_TEMPLATE`：较新 HTTP 瓦片模板。
  - `YCT_TILE_SAFE_HTTPS_STATIC_TEMPLATE`：HTTPS 静态瓦片模板。
  - `YCT_MARKER_BDSLM_BASE_URL`：BDSLM 标记点服务基础 URL。
  - `YCT_POI_ICON_CANDIDATES`：POI 图标候选，格式为 `category:file1.png,file2.png;category2:file3.png`。
- BDSLM 参考接口：
  - `/api/getPlayerMarkers` 返回在线玩家标记点 JSON，字段包含 `x`、`z`、`image`、`imageAnchor`、`imageScale`、`text`、`textColor`、`offsetX`、`offsetY`、`font`。
  - `/api/chat/fetch` 可按 `start` 拉取 WebChat 消息。
  - 地图渲染由 unmined 生成瓦片/静态资源。
- 账号系统：`LindongCityServer/ldpass` 已有轻量外部登录接入方案：
  - 跳转：`/login?client_id=<client_id>&redirect_uri=<redirect_uri>&state=<state>`。
  - 会话校验：`GET /api/auth/client-session?client_id=<client_id>`，请求需 `credentials: 'include'`。
  - 当前方案不是完整 OAuth/OIDC，适合同一可信业务体系内的 Web 登录态确认。

## 3. 一级模块边界

### 3.1 运营信息

定位：网站主入口，承接最新运营动态和用户下一步行动。

包含：

- 搜索入口：顶部全局搜索按钮进入独立搜索结果页，搜索资讯、站点、线路、工具、服务入口；运营首页不再保留单独搜索框，避免全局入口跳转到首页局部区域。
- 当前工程状态：`/search` 已合并运营信息、线路、已有站点详情、服务与工具入口；服务和工具结果直接读取已发布服务入口分组，外链入口按原打开方式跳转。
- Banner / Hero：展示重点图文资讯，可跳转站内内容页或外部链接；Hero 背景图片上方的遮罩渐变方向从下往上，便于标题在底部保持可读。
- 行程强提醒：即将出发、即将检票、线路调整影响、收藏站点相关提醒。
- 运营信息卡片：按固定分类筛选，当前线上旧站分类为 `通知公告`、`运营信息`、`地铁运营`、`公交运营`、`有轨运营`；兼容本地旧快照中的 `网站公告`。
- 信息流列表：按发布时间展示全部结果；已过期消息默认折叠到“过期消息”区域，用户可展开查看，避免旧消息挤占主要信息流。
- 内容详情页：支持 Markdown 正文、图片、附件、外链、发布时间、过期时间。
- 当前工程状态：运营详情页已用白名单方式渲染 Markdown，支持标题、段落、列表、引用、站内/HTTPS 链接、加粗、行内代码和图片；旧资源迁移后的 `原始图片：/legacy-assets/...` 会作为图片展示。该能力只负责安全展示，新增图片素材仍必须走上传和管理员审核。
- 旧运营消息正文边界：旧 `content_data.js` 的运营消息基本依赖外部链接，本身通常没有独立正文；迁移时可以把正文视为空，或仅把 `summary` 作为正文候选。旧记录中的 `link`、封面图和专题页引用应作为元数据、来源链接或素材线索保留，不应自动拼成一段看似完整的 Markdown 正文。
- 当前工程状态：内容后台已具备本地内容素材审核闭环，可上传新素材到 `apps/web/public/content-assets`，也可把旧内容素材清单导入 `.yct-data/content-asset-store.json`，记录来源、哈希、引用关系和审核状态；同 SHA-256 素材会复用已有记录。创建草稿时会扫描 Markdown 中的同站 `/content-assets/...` 与 `/legacy-assets/...` 图片链接，并自动合并对应素材 ID；素材审核通过后，带 `assetIds` 的内容才允许发布。
- 旧标题里的 `|` 是软断行点，展示时不显示该字符；迁移数据需要保留分段信息，以便前端插入 `<wbr>` 控制自然换行。
- Hero 的 eyebrow 使用当前消息分类名称，而不是固定宣传文案。
- 内容卡片封面优先使用已审核或已迁移图片；旧数据中如果把语义色变量名写在图片字段里，迁移时需要识别为颜色 token 或颜色 fallback，不能当作图片 URL 下载。

后台能力：

- 内容新建、Markdown 编辑、预览、提交审核、通过、驳回、定时发布、下线。
- 图片上传与插入：正文图片必须先作为内容素材上传并进入审核；上传后可把素材 ID 绑定到内容草稿，并在 Markdown 中引用同站公开路径。系统会自动识别 `/content-assets/...`、`/legacy-assets/...` 以及临时 `/v2/content-assets/...`、`/v2/legacy-assets/...` 链接。外链图片需要记录来源、展示域名和审核状态。
- 旧资源迁移清单：先扫描旧 `content_data.js` 和 `/content/*.html` 中的相对图片、附件和站内链接，生成旧站 URL、目标路径、引用来源和下载候选标记；资源真正进入新版展示前仍必须下载、校验、去重并进入素材审核。
- 旧专题正文预览：后台可把旧 `content/*.html` 的正文区域转换为 Markdown 候选，供管理员人工载入内容编辑器后创建草稿；草稿仍需提交审核、素材审核通过后才能发布，不能直接绕过内容审核上线。
- 旧资源下载：清单中的下载候选可以先落盘到 `apps/web/public/legacy-assets` 并生成校验报告；该步骤只保证资源不丢失，不代表素材已通过管理员审核。
- Banner 是否展示、排序、有效期管理。
- 分类和标签管理。
- 首页强提醒规则管理。
- 工程过渡实现：在数据库/Prisma 接入前，允许使用 `.yct-data/content-store.json` 和 `.yct-data/content-asset-store.json` 作为单机开发与小规模验证用的本地内容/素材仓储，并用 `apps/web/public/content-assets` 保存上传文件；它们必须通过同一套状态机、管理员校验和事件发布，后续可替换为数据库 Repository 与对象存储。

边界：

- 第一阶段不做复杂 CMS 排版器，内容编辑明确采用 Markdown，不强求制作可视化 Markdown 编辑器。
- Markdown 渲染必须走白名单，禁止直接执行 HTML、脚本或不受控 iframe。
- 图片只有在管理员审核通过后才能出现在已发布内容中；内容正文通过但图片未通过时，发布前必须提示并阻止上线或替换为占位。
- 旧版静态 HTML 内容先迁移为内容记录，原始 HTML 可作为兼容附件保留。
- 旧内容中的相对图片和专题页链接使用 `https://yct.shangxiaoguan.top` 作为基准解析；迁移后资源应下载或复制到新版资产目录，并记录来源、哈希和审核状态。

### 3.2 地图探索

定位：以地图为主体，整合原来分离的地图搜索、地铁线网、公交线路、地点信息和路线规划。

包含：

- 地图浏览：瓦片加载、缩放、定位、比例尺、图层切换。
- 地图缩放：用户交互层需要支持无级缩放，滚轮/触控板/按钮操作时地图区域可以连续缩放；但实际瓦片资源仍只有有限 uNmINeD zoom 层级，渲染层应按当前连续缩放值选择合适瓦片层级并做屏幕缩放，不能假定每个缩放值都有独立瓦片。
- 触控缩放：移动端和平板触控设备需要支持双指捏合缩放；捏合过程中瓦片层、标记点层、线性 POI、道路/线路轨迹和比例尺必须按同一连续缩放值更新。
- 地图动效一致性：瓦片层、标记点层、线性 POI 和道路/线路轨迹应使用一致的位移/缩放过渡节奏。拖动或缩放时不能出现瓦片平滑移动而标记点明显瞬移或脱节的体验；当连续缩放触发实际瓦片整数层级切换时，需要用旧层淡出、新层淡入的过渡缓解跳变。
- 地点搜索：站点、线路、兴趣点、服务器设施、用户自定义点。
- 地图周边搜索：地点搜索需要支持“以特定 POI 为中心搜索周边标记点”的模式；POI 详情中的“搜索周边”操作应进入该模式并携带当前 POI 或代表点作为搜索中心。
- 路线规划：站点到站点、地点到地点，支持公交/地铁/步行等扩展。后续需要形成独立路线规划页或等价的路线规划面板，具备路线方案列表、起终点编辑、出行方式切换、地图高亮和步骤详情。
- 路线规划吸附规则：标记点通常不会精确落在道路上，起点和终点应先吸附到最近道路；如果 POI 属于区域 POI，应优先使用其绑定的出口/出入口/入口点中距离最近且方向合适的点作为接驳点。起点到道路、道路到终点之间可以生成直线步行接驳段，但需要明确与道路网络段区分。
- 道路网络连通规则：从一条道路转向另一条道路时，后台道路图应能表达交叉、连接点和可通行规则；在只有旧道路端点数据的过渡阶段，可把 50 格范围内经过的其他道路视作连通或交叉候选，但正式路线规划必须保留可解释的节点、边、权重和来源，不能把视觉粗线直接当作导航图。
- 公共交通路线规划：启用公共交通时，路线应由起点步行接驳、公共交通站点间线路段、换乘/步行段和终点接驳组合而成；公共交通线路段必须使用真实线路、站点和方向数据，不能凭站名顺序或近似轨迹伪造可乘坐路线。
- 当前工程状态：地图 POI 详情中的“查看路线”已能创建路线规划草稿，并生成第一版估算路线结果。步行方案保留直线估算，并新增基于旧道路端点近似排序与 50 格连通候选的“道路步行估算”；该方案只作为过渡预览，不宣称为正式道路级导航。公共交通方案会按启用的交通方式遍历真实线路和方向，使用线路站序、站点标记和旧数据中的 `travelTime` 生成直达或一次换乘候选，排序后按启用方式数量动态展示多条可能路径，并在地图上高亮。路线卡片会标记“最快到达”“最少换乘”“最少步行”等候选特征，步骤时间线已先按地点、步行、乘车和换乘过程区分样式，乘车过程按对应线路色或交通方式语义色显示。路线结果态会隐藏非路线相关标记，仅保留起终点和经过的站点标记；这些路线相关标记从未碰撞过滤的投影点中选取，不再被地图拥挤碰撞规则隐藏。区域/父子 POI 已能在规划计算中把父地点按旧命名规则临时接驳到子地点：优先选择名称像入口、出口、出入口、站口、门等的子地点；如果没有这类子地点，则用朝向另一个端点最近的子地点兜底，并把这段接驳计入距离、时间和路线高亮。地图标记列表的分类筛选已包含“收藏”，可按浏览器本地收藏的地点 ID 过滤列表。正式道路图、后台可编辑出入口/方向规则、线路轨迹坐标和更完整换乘权重仍待后续接入。
- 地图操作面板：桌面端保留侧边操作栈，移动端保留底部抽屉，用于承载搜索、路线规划、图层、筛选和当前选中地点/线路信息；不能被数据源说明类面板替代。
- 地图操作面板视觉：`.map-sidebar-stack` 只负责布局定位，不承担卡片外观；搜索框、标记列表和工具栏分别作为独立视觉容器处理，其中标记列表承接背景、描边、边距和阴影，搜索框和工具栏也需要有轻量阴影或容器感。
- 地图操作面板滚动：搜索框应尽量保持固定可见，滚动条不要加在 `.map-panel-section` 上；标记列表滚动由 `.map-marker-list` 承担，兴趣点详情滚动由 `.map-poi-detail-body` 承担。
- 标记展示：地图标记默认缩小约 30%；小尺寸视口也保留文字标签。当前尺寸和范围下如果图标或标签会互相重叠，对应标记点应直接隐藏，不能用互相覆盖的文本硬挤。
- 搜索结果态的标记展示：当用户正在查看搜索结果时，碰撞处理优先只隐藏重叠标签，保留标记点本体，避免搜索命中的对象因为标签拥挤而完全不可见。
- 标记文本规范：旧标记名称里的换行、半角空格、全角空格和管道符号主要是旧网页排版断点；用于展示、搜索、碰撞宽度估算、站名匹配和数据关联时应忽略这些排版字符。道路、高速公路等道路类标记应依赖真实分类、旧图标或后续后台语义字段识别，不能在点位上额外塞入“道路/高速”等文字徽标。道路类透明图标文件不应作为可见图标渲染，道路端点也不应回退显示默认地点图标。
- 地图 HUD 与标注：地图比例尺、光标坐标和点位标签应作为地图覆层标注处理。比例尺和点位标签优先使用透明底、文字或线条描边、轻量阴影，避免使用大块填充背景和整体卡片阴影遮挡地图。
- 兴趣点详情：点击地图标记或选中特定兴趣点后，在地图探索内展示地点介绍并高亮该兴趣点。普通点状地点详情按“简介 / 设施或出入口”分组；周边搜索作为操作栏按钮提供，不再保留独立页签。桌面端优先使用信息面板 + 地图的组合布局，移动端需要保证地图仍可见。地铁站、公交站、有轨站、专用线/地方铁路车站和客运站需要在简介中展示接驳线路，接驳数据应来自真实线路数据，不允许写模拟线路。
- 区域 POI 关联：区域/面性 POI 需要能关联多个点状 POI，并按出入口、设施、楼栋、景点等分组展示在详情的“设施或出入口”区域。区域 POI 可以指定代表 POI，默认代表可按同名点标记推导；地图标记碰撞检测应优先保留代表 POI 的图标和标签。当前工程第一版先在前端按旧地图命名规则推导只读关联：若存在父地点 `XXXX`，则 `XXXX-OOOO` 会在父地点详情的“设施/出入口”中显示为子地点入口，并支持点按聚焦子 POI；同时会把这些存在子地点的父地点作为临时默认代表点，提高地图碰撞检测中的保留优先级。正式分组、显式代表点和后台编辑仍待后续实现。
- 定位展示：地图区域需要提供蓝色白边圆点形式的当前定位标记。定位来源、精度和是否为浏览器真实定位需要在数据层区分，不能把地图中心或默认点冒充为真实定位。
- 路线规划面板优先级：当展示路线规划卡片或路线方案详情时，应隐藏或折叠 `map-marker-list`，避免路线信息和标记列表在移动端或窄屏下争抢主要空间。
- 图层与投稿：`map-layer-panel` 第一阶段保留浏览模式、标记点/线条显示开关和投稿 POI 的弹窗入口；完整图层列表和常驻投稿表单后续再展开。道路端点组可绘制粗线近似轨迹，但必须用全量端点生成整条近似线，再判断整条线是否经过当前视口，不能只用可见范围内的端点决定是否展示；同时必须明确这不是道路级导航路线。
- 地图浏览模式：`map-layer-toggle` 第一版使用“卫星 / 路网 / 交通”多段式浏览模式控制：
  - 卫星：加载地图瓦片，保留道路文字标签，并将道路线条透明化叠加；公交站显示优先级降低，必要时隐藏公交站文字标签；提供开关控制标记点与线条显示状态。
  - 路网：不加载地图瓦片，显示道路线条和道路文字标签；公交站显示优先级降低，必要时隐藏低优先级标记点文字标签，但住宅、办公楼、工厂标记点的文字标签不应在该模式下被专门隐藏。
  - 交通：不加载地图瓦片，淡化道路线条，不显示道路文字标签；提高地铁站显示优先级，降低住宅、办公楼、工厂等低交通相关地点显示优先级，必要时隐藏这些低交通相关地点的文字标签。
- 道路与线性对象标签：线性对象标签锚点应取近似折线中点，保证标签落在轨迹上，不能使用端点平均几何中心导致标签漂离道路或线路。道路文字标签需要参与普通点位同一套碰撞检测。普通道路标签不补 Material Symbols 图标，文字中心应与道路轨迹锚点中心对齐；仅当高速路图标文件名匹配 `highway-*` 时显示该图标并隐藏文字。道路标签局部三个点的 Z 范围明显大于 X 范围时使用竖排文字。
- 长道路标签：道路轨迹很长时，标签锚点应优先取当前视口内可见轨迹片段的中心点，并保证锚点仍在轨迹上；只有无法计算可见片段时才回退整条轨迹中点，避免用户在当前地图范围内看不到道路名称。
- 道路轨迹：旧数据中 `road`、`roadpoint` 以及高速/收费站类透明道路图标都应参与同名道路端点组归并。点击道路端点或道路详情时，需要聚焦到所属道路详情并在地图区域高亮对应道路近似轨迹。粗线轨迹之间发生大面积视觉重叠时，可隐藏较短的普通道路轨迹以降低交叉误读，但高速公路和快速路不参与该隐藏规则。
- 地点操作栏：普通点状地点详情需要提供操作栏，包括“查看路线”（重点按钮，图标使用 `directions`）、“搜索周边”、“收藏”和“分享”。道路、线路等线性地点不显示这组普通地点操作栏。当前工程第一版已支持查看路线、搜索周边、本机收藏和分享/复制地点链接；收藏仅写入浏览器本地 `yct.mapFavorites.v1`，暂不代表账号同步或服务端收藏。
- 线路图层：地铁、有轨、公交、轮渡等线路可叠加展示。
- 线路详情：站点列表、方向、首末班、票价、运营方、相关公告。公共交通线路介绍逐步归入地图探索二级页面，作为特殊的线性 POI 或线路图层详情，而不是长期放在出行页承担基础浏览功能。当前工程已提供 `/map/lines/[id]` 第一版线路详情页，旧 `/travel/[id]` 暂时保留兼容。
- 线路地图交互：车站详情中的接驳线路标识应可点击，点击后在地图页选中对应线路对象，详情面板展示线路信息，地图区域展示线路上所有已定位站点并高亮当前已知轨迹。当前没有后台线路坐标时，可用真实站点坐标形成近似展示轨迹，但不能宣称为道路级导航。
- 地图内线路详情：站点时间线节点和连接线需要使用线路色或对应交通方式语义色；站点列表需要提供正向/反向分段控制。加载特定方向时必须尊重停靠点属性中的单向站、停靠方向或后续后台方向数据，不能简单把站点数组反转后当作完整反向线路。
- 线路型 POI：公共交通线路后续需要作为一类或两类独立 POI 入库，至少记录线路方向、途径站点点标记和展示/检索属性；可选记录方向对应的途径坐标序列。如果暂不记录坐标，则地图展示和道路级导航需要通过后台道路网络按途径站点规划出一条可解释路线，不能凭站名直接画假线。
- 兴趣点管理：
  - 登录用户可创建私有兴趣点。
  - 已登录且符合权限要求的用户可提交公开兴趣点申请。
  - 管理员审核通过后对所有人可见。
- 标记几何类型：
  - 点标记：站点、建筑、设施、玩家或车辆实时点。
  - 无序端点组：旧地图“道路”分类下同名点先归并为 `MultiPoint`，表示同一个线性 POI 的全部端点；端点没有顺序，不能直接当作路线或可导航道路。
  - 线性标记：道路、河流、边界、施工段、线路局部走向。
  - 面性标记：区域、建筑群、公园、站场、封控或活动范围。

后台能力：

- 瓦片源配置。
- 标记点源配置。
- POI 审核。
- 线路、站点、坐标、别名、换乘关系、运营状态管理。
- 道路级路线规划所需的道路网络数据、可通行规则和路径权重管理。道路网络数据来源基本只能依赖后台维护的标记点/线/面数据。
- 数据版本发布与回滚。
- 工程过渡实现：在数据库/Prisma 接入前，允许使用 `.yct-data/transit-data-store.json` 作为单机开发与小规模验证用的本地交通数据版本仓储；导入、审核、发布必须走同一套状态机，后续可替换为数据库 Repository。
- 第一阶段交通数据后台先做“从旧站真实数据导入快照、校验、预览、审核、发布”，不急于实现完整可视化线路/站点编辑器。

边界：

- 路线规划目标需要精确到道路级；实现上需要先把后台标记数据转换为道路图数据模型，再在 MVP 中决定是否先做只读演示或分阶段上线。
- 公共交通方式统一抽象为同一套 `TransitLine`，用 `mode` 区分地铁、公交、客运、有轨、轮渡、铁路等类型。
- 交通方式语义色需要支持服务器 Profile 级配置。当前默认建议：地方铁路使用棕色，客运大巴使用黄绿色，轮渡保留青蓝色，航班使用蓝紫色；不同服务器部署时，后台应能维护各交通方式的默认色、图标和排序，避免写死在前端 token 中。第一版工程实现使用 `.yct-data/transit-mode-profile-store.json` 作为地面公共交通本地仓储，并通过 `TransitModeProfileUpdated` 事件预留缓存刷新、审计和跨部署同步监听器。
- 可排班服务 Profile 与地图 `TransitModeProfile` 分开维护：航班不属于当前地图 `TransitLine`，但属于统一班次/票务服务；第一版工程实现使用 `.yct-data/travel-service-profile-store.json` 维护客运大巴、轮渡、航班、地方铁路和自定义可排班服务的名称、颜色、图标、排序和启用状态，并通过 `TravelScheduleServiceProfileUpdated` 事件预留缓存刷新、审计和跨部署同步监听器。
- 线路迁移需要兼容公交和地铁格式差异：公交顶层可能是对象表，停靠点可带 `oneWay`、`status`；地铁/有轨停靠点可带 `travelTime`、`platformSide`、`fareZone`、`labelOffset`、`trainPosition`。这些字段应作为线路-站点关系属性保存，不应丢弃到纯站点表里。
- 旧站部分站点只有线网图坐标或完全没有 Minecraft 世界坐标；导入快照允许坐标为空，并通过校验提醒记录，不能为了满足类型而写入假坐标。
- 地图瓦片和实时标记点必须通过适配器接入，不能把当前临东 URL 写死在核心业务里。
- 当前 `ld.cmsy.xyz:19136` 不能提供 HTTPS，生产主站若使用 HTTPS，会有混合内容风险。第一阶段 `TileProvider` 需要支持“较新 HTTP 瓦片源”和“安全 HTTPS 静态瓦片源”两套配置，按部署环境选择；后续再评估后端代理、同源反代或独立 HTTP 地图页。
- 当前 `map.shangxiaoguan.top` 资源可直接接入，不涉及跨域问题；仍需用适配器封装，便于未来迁移。若切换到该 HTTPS 静态瓦片源，需要在界面上标记地图更新时间或数据来源。
- `map.shangxiaoguan.top` 当前为 uNmINeD + OpenLayers 静态输出，瓦片路径不是标准 Web XYZ，而是 `tiles/zoom.{z}/{xd}/{yd}/tile.{x}.{y}.{format}`。完整渲染必须通过专门的 uNmINeD `TileProvider` / `CoordinateTransform` 处理，不能直接当 `{z}/{x}/{y}.png` 使用。
- 不存在瓦片的区域必须透明处理，不能显示破图、错误占位或大块不自然底色；前端瓦片层需要继续基于 uNmINeD region 索引或 Provider 能力判断是否请求/渲染该 tile。
- 当用户关闭地图瓦片时，可以显示道路类对象的粗线条轨迹作为可读底图；但旧道路端点没有顺序，不能直接把同名端点按数组顺序连成路线。实现前需要评估基于后台道路网络生成、基于端点近似生成，或只展示端点与道路名称的方案。
- `map-data-badge`、`map-data-panel` 这类数据源、标记数量、适配器状态说明，对普通用户价值有限，不应占据地图页主要可见区域；必要时只保留“数据更新时间/来源”的轻量入口，详细诊断信息放入管理员、调试或关于面板。
- 用户上传公共 POI 前必须登录；公开前必须人工审核。POI 简介、外部链接和图片同样属于审核内容；第一阶段支持图片文件上传和图片链接兜底，文件上传限制常见图片格式与大小，并生成可进入 POI 审核流的图片 URL。后续仍需要补充对象存储、违规图片处理、图片安全检查和更完整的管理员预览规则。
- POI 分类体系第一阶段参考 `map.shangxiaoguan.top` 的 PNG 资源归纳，分类与图标允许一对多；后台需要能维护分类名称、图标、显示顺序、是否允许投稿和默认审核规则。
- BDSLM 标记点通过适配器转换为统一 `MapMarkerSnapshot`，Minecraft 世界坐标 `x/z` 直接进入 `Point` 几何；屏幕/瓦片坐标转换继续由地图渲染层处理。
- 面性标记优先评估“多个矩形组合”作为 Minecraft 存档内的编辑/存储方式，因为它更贴近方块世界和后台录入习惯。显示层可以按需转换为多边形或合并轮廓，但是否转换、如何合并、是否保留原始矩形集合，需要根据性能和编辑体验评估后决定。
- 工程过渡实现：在数据库/Prisma 接入前，公开 POI 投稿使用 `.yct-data/poi-submission-store.json` 作为本地仓储，POI 投稿图片默认落盘到 `.yct-data/poi-submission-images`；前台 `/api/map/poi-submissions` 仅允许已登录且服务器账号已验证的 `ldpass` 用户提交公开 POI，后台 `/api/admin/map/poi-submissions` 由 YCT 管理员审核和发布。当前第一版投稿资料包括地点名称、分类、简介、相关链接、上传图片或图片链接和点坐标。
- 发布后的公开 POI 会合并进 `/api/map/markers`，与旧地图标记一起提供给前台；第一版前台投稿入口只开放点坐标提交，接口和数据模型继续保留线、多矩形和多边形几何，待地图渲染层支持后再开放对应编辑 UI。发布后的图片会在地点详情中展示；当前本地文件上传仍是过渡实现，后续需要补充对象存储、图片审核状态和资源迁移策略。
- 公开地图和交通数据 API 在读取旧站文件、旧地图标记或派生线路型 POI 时必须做请求合并和短 TTL 服务端缓存；不能让首页、地图页、RSC 预取和 Service Worker 预热的并发请求各自全量拉取/解析同一批旧数据。远程旧站文件读取必须有明确超时，当前运行时配置为 `YCT_LEGACY_DATA_FETCH_TIMEOUT_MS`，默认 8 秒。该缓存只是开发和过渡期的进程内保护，不等同正式数据库缓存、Outbox 或跨实例一致性机制。
- 地图页的大型交互组件在开发环境和首屏 SSR 中需要控制编译压力；当前地图主体通过客户端懒加载挂载，服务端先返回页面壳，地图数据仍由前端按需读取公开 API。

### 3.3 出行

定位：承接“我要出行”的任务流，但需要避免在第一阶段把概念扩得过乱。

建议第一阶段包含：

- 行程提醒：从路线规划、班次查询或手动创建进入。
- 班次查询：第一阶段优先读取客运班次；后续可扩展铁路、轮渡、航班、公交快线等可排班交通数据。
- 统一班次与票务平台：客运、轮渡、航班等具有班次、票务、检票或退票需求的交通方式，应接入同一套新版查询与订票系统。新版系统需要重写，不沿用旧 `/ltcx/` 的纯前端本地订单逻辑；它应抽象 `ScheduleService`、`TripInstance`、`FareProduct`、`Inventory`、`Order`、`Ticket`、`Refund`、`CheckIn` 等统一模型，再由不同交通方式提供适配器和业务规则。详细边界见 `docs/TRAVEL_TICKETING_PLATFORM.md`。
- 订票能力：仅在真实票务和 `ldpass` 票券/核销链路明确后上线；第一阶段可以保留客运订票入口位置，但不能把占位误导为可用购票。
- 客运订购与显示参考旧站 `https://yct.shangxiaoguan.top/ltcx/` 的能力深度：线路/站点/日期筛选、未来日期切换、班次卡片、当日过站过滤、途经站与公司展示、动态票价、购票确认、订单详情、条形码或核销凭证、退票、本地历史、帮助/关于和停运提醒。新版实现需要保留这些核心任务流，但把真实订单、票券和核销状态接入 `ldpass`，不能只复刻旧版本地假订单。
- 客运提醒：读取旧 `ltcx/stop.txt` 等班次调整/停运公告，结构化为可展示、可推送、可缓存的服务提醒；过期公告不能作为当前强提醒展示。
- 车站信息：站点设施、候车点、检票口、运营提示；第一版站点详情使用旧 `metro_station_detail.js`，可从线路详情和全局搜索进入，未覆盖的公交/客运等站点不生成空详情。
- 客运大屏：旧 `ltcx_schedule` 的现代化入口。
- 客运大屏数据：读取旧 `ltcx/route.txt` 与 `ltcx/screen/*.txt`，结构化为站点、逐班次、检票口、运行区间和滚动公告；出行页展示摘要，`/travel/screen` 提供完整班次筛选和检票口展示。
- 统一班次查询 MVP：当前工程新增 `/travel/schedules` 和 `/api/travel/schedules`，以同一套 `TravelScheduleService` / `TravelTripInstance` 展示客运、轮渡、航班等可排班交通方式；客运读取旧 `ltcx` 真实班次，保留班次号、站点、检票口、票价、运营方，并预留车型/船型/机型字段；航班读取 `YCT_FLIGHT_DATA_URL` 并过滤到 YCT 范围；轮渡在没有数据源前只显示“暂未接入”，不生成模拟班次，不创建真实订单。页面支持服务日期、经过车站、起点和终点筛选，默认选中今天；接口支持 `serviceDate` 或 `date` 参数，只有具备运行日字段的数据会按星期过滤，旧客运缺失运行日时不能凭空隐藏班次。接口还支持 `originStationName` / `destinationStationName`，兼容 `origin` / `destination`、`from` / `to`；同时选择起终点时必须按班次真实站点序列判断可达方向。接口返回旧 `ltcx/stop.txt` 的结构化客运提醒，页面按服务日期展示匹配公告；在没有线路/班次级停运规则前，公告只作为提醒，不自动取消或隐藏班次。
- 班次服务配置：`/api/travel/schedules` 返回的服务摘要需要携带服务 Profile 中的 `label`、`color`、`icon` 和 `sortOrder`；前台不能用固定前端常量决定客运/轮渡/航班的图标和颜色。管理员第一版可在 `/admin/transit` 的“可排班服务配置”区维护这些值。
- 航班数据源：航班信息可参考 `https://haojin.guanmu233.cn/data/flight_data.txt` 的文本格式，形如 `【航班号】〈航线备注〉«运行日»〔执飞机型〕『航空公司』《起飞机场出发》{起飞时间}#+天数#@值机位置@ ... 《到达机场到达》{到达时间}#+天数#@到达位置@ §票价§《航班结束》`。YCT 当前只处理任一航段地点为“临东金桦”的航班，以及航空公司为“临东航空”的航班；其他城市间航班不进入本项目查询结果。解析器需要预留经停航段，但如果上游当前没有经停样例，不得伪造经停。
- 班次提醒联动：统一班次查询中的真实班次可以创建本地行程提醒，默认按下一次发车时间提前 30 分钟提醒，若班次过近则使用当前时间后 1 分钟；提醒来源标记为 `schedule`，写入本地 `yct.tripReminders.v1`，不代表订票、占座或服务端订单。
- 本地班次记录：统一班次查询页允许匿名用户将真实查询结果保存到 `yct.travelScheduleHistory.v1`，添加班次提醒时也会自动记录对应班次快照；记录内容仅包含班次号、交通方式、线路、站点、时间、检票/值机位置、票价、运营方和车型/机型等查询信息，不代表订单、票券、占座或可核销凭证。
- 历史行程：登录后跨设备同步，本地匿名用户可保留浏览器本地历史。
- 线路浏览：完整线路列表、线路介绍和线路型 POI 已逐步转入地图探索；出行页第一版不再铺开完整线路列表，只保留“线路与站点”任务入口导向地图页。旧线路数据仍通过地图线路详情、全局搜索和兼容二级页可访问。
- 线路概览条：移动端 `transit-summary-strip` 可以沿用多列布局，不必强制改为单列。
- 线路标识：地铁线路样式参考旧站 `bus_routemap` 中的地铁线路标识样式；公交、有轨、轮渡等其他方式使用圆角矩形，背景色采用线路色或对应交通方式语义色，文字使用白色。

后续接入：

- 真实订票、占座、退票、电子票、检票二维码。
- 与 `ldpass` 卡包/票券能力打通，把票券发放到账号。
- 乘车码能力与真实购票/票券能力一起接入 `ldpass`，不在 YCT 内独立造一套长期凭证系统。
- 支付或实际权益扣减需要另行确认业务规则；票券、检票和退票状态必须尽量联动行程提醒。
- 班次和票务系统需要事件驱动实现，核心服务只处理状态变更并发出事件，例如 `TravelSchedulePublished`、`TicketInventoryHeld`、`TicketOrderCreated`、`TicketIssued`、`TicketCheckedIn`、`TicketRefundRequested`、`TicketRefundCompleted`，通知、提醒、审计和 `ldpass` 同步通过监听器扩展。

边界：

- 第一阶段主导航和页面标题使用“出行”，先去掉“购票”等字样，避免提前承诺真实票务能力。
- 第一阶段出行页只保留“出行服务”和“行程提醒”两个主模块；统一班次查询入口、票务平台预留、客运大屏和线路/站点导向均收纳到“出行服务”中。线路基础浏览、线路介绍和线路型 POI 转入地图探索。
- 真实电子票、检票、退票在 `ldpass` 票券接入后上线。
- 旧 `/ltcx/` 的购票和订单功能可作为交互基准，但不能继续依赖清空全站 `localStorage`、纯前端订单号或仅本地条形码来表示真实票务状态。新版需要把本地匿名体验、登录后迁移、`ldpass` 票券和核销凭证分层处理。
- 客运大屏的“检票口”仅表示站内展示数据，不代表 YCT 已经具备真实检票核销能力；真实核销仍以后续 `ldpass` 票券/核销链路为准。
- 工程过渡实现：浏览器侧使用 `yct.tripReminders.v1` 保存新版本地行程提醒和历史；首次发现旧站 `localStorage.orders` 时会只读导入为 `legacy_order` 来源记录，写入新版 key 后不删除旧 key，也不反复导入，避免用户在新版删除后又被旧数据恢复。登录用户可在账号页把未同步的提醒快照提交到 `/api/account/trip-reminders`，服务端写入 `.yct-data/trip-reminder-store.json` 并对待提醒记录发布 `TripReminderScheduled` 事件。通知投递监听器会把该事件转换为 `.yct-data/push-delivery-store.json` 中的投递队列，内部任务接口 `/api/internal/notifications/process` 在 `YCT_INTERNAL_TASK_TOKEN` 校验通过后处理到期队列；配置 `YCT_WEB_PUSH_PUBLIC_KEY` / `NEXT_PUBLIC_YCT_WEB_PUSH_PUBLIC_KEY`、`YCT_WEB_PUSH_PRIVATE_KEY` 和 `YCT_WEB_PUSH_SUBJECT` 后才会执行真实 Web Push，未配置时只保留队列延后和审计原因。旧站 `orders` 来源提醒同步到账号前必须单独确认，拒绝时保留在本机且仍允许同步非旧站提醒；账号页可撤销本地同步同意，已登录时会删除账号侧 `legacy_order` 提醒副本并发布 `TripReminderDeleted` 事件。
- 本地提醒来源第一阶段包含 `manual` 和 `legacy_order`；路线规划、班次查询、票务联动后续分别使用 `route_plan`、`schedule`、`ticket` 来源。

### 3.4 更多服务

定位：收纳站内工具、外部站点、服务器周边服务。

包含：

- 运营及周边：智运大屏、服务规章、常见问题、周边图鉴。其中“智运大屏”对应旧项目 `ltcx_schedule`。
- 服务器网站：网页地图、实时地图、知识库、临东通等。
- 工具箱：旧版实验室、动态线路图、地图搜索/预览、数据编辑器、物料展示、公交站牌/路牌/楼牌/电报纸生成等；旧版实验室对应 `/lab`，它是旧站实验性工具集合总入口，不单指视觉工具。

后台能力：

- 服务入口配置：名称、图标、分类、链接、打开方式、可见状态、排序。
- 工具注册表：区分内置工具、旧页面兼容工具、外部链接工具。
- 权限控制：部分工具仅管理员/运营人员可见。
- 工程过渡实现：在数据库/Prisma 接入前，允许使用 `.yct-data/service-entry-store.json` 作为单机开发与小规模验证用的本地服务入口仓储；它必须通过同一套管理员校验、审核和发布状态机，后续可替换为数据库 Repository。
- 默认入口：第一阶段可内置少量已确认真实入口，例如旧站的智运大屏、实验室、动态线路图、地图搜索、地图预览、数据编辑器、物料展示页、公交站牌/路牌/楼牌/电报纸生成器，以及服务器 Wiki、网页地图等外部站点；这些默认入口视为系统配置，后台新增或修改的公开入口仍必须审核发布。
- 旧实验室中的“设计系统”链接当前在旧站返回 404，第一阶段不作为独立默认入口上架，只保留在实验室总入口中等待后续迁移或修复。

边界：

- 不把每个工具都强行重写成同一套 UI。第一阶段可以用“工具壳 + 旧工具兼容 iframe/路由”的方式降低风险。
- 会持续使用但复杂度高的工具，再按优先级组件化。
- `.yct-data` 属于私有运行数据，不进入 GitHub 仓库；生产部署前需要确认它的备份、迁移和数据库替换计划。
- 服务入口发布只负责“入口可见性”，不代表外部站点或旧工具已经完成新版安全审计；涉及管理员工具、数据写入或账号联动的入口仍需要单独权限校验。

### 3.5 账号相关设置

定位：登录、退出、历史、偏好、通知、设备和个人数据管理入口。

包含：

- 登录、退出。
- 当前账号状态展示。
- 历史记录：搜索历史、浏览历史、行程历史、收藏地点、最近线路。
- 偏好设置：深色/浅色/跟随系统主题、强调色、地图默认图层、常用交通方式、通知偏好。
- 主题计划：强调色默认跟随 `ldpass` 主题计划，按计划时间在默认青绿色、红色和灰色之间切换；具体色值由 YCT 设计系统自行映射，不要求照搬 `ldpass` 色值。用户可在设置中改为自定义强调色。
- 通知授权与 PWA 安装状态提示。
- 管理员入口：有权限时显示后台入口。
- `ldpass` 相关入口：绑定账号、服务器账号验证、更改头像、账户安全、设备管理等页面可以作为跳转入口展示，不在 YCT 内复制实现。
- 顶部头像入口需要区分未登录、已登录、登录异常、管理员有待办等状态，并按需显示合并计数徽标。徽标只显示一个数字或状态点，来源可包含未读通知、待处理订单、管理员审核待办和账号异常。
- 当前工程状态：顶部头像通过 `/api/account/status` 读取账号状态；未配置/只读/会话不可用显示状态点，Active 登录显示登录态，YCT 管理员会合并显示内容、服务入口、交通数据和 POI 待审核数量。前台还会读取浏览器本地行程提醒中的待同步数量，与服务端待办合并成一个徽标；普通用户不会暴露管理员计数。
- 通知设置文案：账号页需要明确区分“通知类型开关”和“免打扰时段”。通知类型决定是否接收行程、运营、票务、检票等推送；免打扰时段决定指定时段内是否静默、延后或阻止通知，不能让用户误以为一个开关同时控制所有通知权限。
- 状态点可见性：`account-badge.is-dot` 在浅色模式下必须与标题栏背景有明确对比，可通过描边、阴影、不同色值或尺寸调整实现，不能只依赖接近白色/浅色背景。
- 本地历史第一阶段在账号设置页展示行程提醒、历史行程、本地班次记录、地图收藏和待同步数量，并提供进入出行页、班次查询页、地图页、同步提醒到账号和清空新版本地历史的入口；当前只同步行程提醒快照，不把本地班次记录、地图收藏或旧 `orders` 解释成服务端订单/账号收藏。登录后会拉取服务端提醒并保守合并到本机，本机已有同 ID 或同旧订单来源的记录优先保留；旧 `orders` 来源提醒同步前已有用户确认，撤销时可删除账号侧旧站提醒副本并把本机旧站提醒标回待同步，更细冲突解决、收藏同步和正式迁移文案仍待完善。

接入建议：

- 第一阶段使用 `ldpass` 已有轻量登录回跳和 `client-session` 校验。
- 雨城通后端只保存 `ldpassUserId` 映射、偏好、历史和权限快照，不保存 ldpass 密码。
- 当前工程过渡实现：`YctUserLink` 本地映射保存到 `.yct-data/yct-user-links.json`，可通过 `YCT_USER_LINK_STORE_PATH` 覆盖；登录回跳、后台鉴权和 POI 投稿鉴权都会以真实 `ldpass` 会话为依据补写或刷新映射。`yct.account_snapshot` Cookie 仅用于账号页展示，不作为业务写接口授权依据。
- YCT 管理员权限由 YCT 自己维护角色表；登录身份来自 `ldpass`，后台权限不直接等同于 `ldpass` 角色。
- 后续若要开放给第三方或移动端，再评估标准 OIDC Provider。

## 4. 后台与审核边界

后台至少需要四条审核线：

| 审核线       | 提交人                   | 审核人 | 发布对象                 |
| ------------ | ------------------------ | ------ | ------------------------ |
| 内容审核     | 管理员/运营人员/授权作者 | 管理员 | 首页卡片、Banner、内容页 |
| 交通数据审核 | 线路编辑者               | 管理员 | 线路、站点、换乘、班次   |
| POI 审核     | 登录用户/运营人员        | 管理员 | 公开兴趣点               |
| 服务入口审核 | 管理员/运营人员          | 管理员 | 更多服务入口和工具配置   |

核心要求：

- 所有会影响公开页面的数据变更都必须有草稿、审核、发布版本和审计记录。
- 已发布版本应可回滚。
- 数据发布要么整体成功，要么继续使用上一版，避免半套线路数据上线。
- 审核通过只是允许发布，是否立即发布要支持“立即”和“定时”两种策略。

## 5. 推荐技术路线

### 5.1 方案对比

| 方案                | 描述                                                                                            | 优点                                                                             | 风险                                                         |
| ------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| A. Next.js 全栈单体 | Next.js App Router 承接前台、后台和 API；TypeScript、Prisma、数据库、事件总线在一个 monorepo 内 | 与 `ldpass` 技术方向接近，部署和维护成本低，前后台共享类型方便，适合当前团队规模 | 后端复杂后需要保持模块边界，避免页面和业务逻辑粘在一起       |
| B. 前后端分离       | 前端独立 SPA，后端用 NestJS/Fastify/Hono 提供 API                                               | 后端边界清晰，适合后续多客户端                                                   | 初期部署、鉴权、类型同步、跨域和运维复杂度更高               |
| C. 继续静态站增强   | 保留静态页面，增加少量接口                                                                      | 改动最小                                                                         | 无法优雅支撑审核、账号、跨设备历史、后台数据管理和可扩展适配 |

已确认采用方案 A：Next.js + TypeScript + Prisma + 数据库 + 事件驱动模块化。

理由：

- 需求已经明显超过纯前端能力，需要后台、审核、发布、历史、账号映射和数据版本。
- 与 `ldpass` 的 monorepo、Next.js、Prisma、事件总线方向一致，方便复用接入经验。
- 前台需要 SEO/分享友好的内容页，同时地图和工具又需要大量客户端交互，Next.js 的服务端页面与客户端组件混合模式适合。
- 当前公开文档不记录具体云服务器配置；生产环境细节放在私有运维文档中，不进入 GitHub 仓库。
- 部署前必须确认 Node.js 运行时满足所选 Next.js 版本的官方最低要求。当前 Next.js 官方安装文档要求 Node.js `20.9` 或更高版本；Node.js 官方已将 Node 18 标记为 End-of-Life，因此现有运行时需要升级或锁定到兼容的旧技术栈，但后者不建议作为长期方案。

### 5.2 兼容性目标

- 浏览器最低目标：Safari 17、Chromium 114。
- Next.js 官方当前支持的现代浏览器基线覆盖 Chrome 111+、Edge 111+、Firefox 111+、Safari 16.4+；YCT 仍需要在 Safari 17 和 Chromium 114 上做手工/自动化回归，尤其是地图、PWA、通知、Markdown 图片和文件上传。
- 地图能力需要单独验证 WebGL、Canvas、Service Worker 缓存和触控手势；如果 MapLibre 在目标设备上出现性能或兼容问题，需保留 Leaflet 栅格瓦片方案作为降级路径。

### 5.3 建议技术组件

- Web 框架：Next.js App Router。
- 语言：TypeScript。
- 数据库：生产建议 PostgreSQL；开发可使用 SQLite，但迁移脚本要以生产数据库为准。
- ORM：Prisma。
- API：Next Route Handlers 作为 BFF/API 层，核心业务放入 `packages` 或 `apps/api` 风格模块。
- 地图：MapLibre GL JS 或 Leaflet 二选一。
  - 如果只是栅格瓦片、标记点、简单线段，Leaflet 更轻。
  - 如果未来需要大量图层、样式表达式、矢量瓦片、复杂交互，MapLibre 更有扩展空间。
  - 当前建议优先评估 MapLibre，若瓦片格式与性能不合适，再退到 Leaflet。
- 后台 UI：自建轻量组件库，基于 design token，不引入重型后台模板。
- 数据校验：Zod 或同类 schema 校验库。
- 事件机制：进程内 EventBus + 数据库 Transactional Outbox。单机 MVP 可以先用共享内存事件总线和本地 JSON Outbox 过渡；当前本地 Outbox 写入 `.yct-data/event-outbox-store.json`，并通过 `/api/internal/events/process` 提供受保护重放入口。公开数据发布、通知、Webhook、同步任务的正式实现仍必须落数据库 Transactional Outbox。
- PWA：轻量增强，见第 6 章。

参考资料：

- Next.js Route Handlers 官方文档：https://nextjs.org/docs/app/building-your-application/routing/route-handlers
- Prisma 官方文档：https://www.prisma.io/docs
- MapLibre GL JS 官方文档：https://maplibre.org/maplibre-gl-js/docs/
- MDN PWA 安装说明：https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable

## 6. PWA 结论

建议支持 PWA，但按轻量渐进增强做。

适合做：

- 安装到桌面/主屏幕。
- 缓存应用壳、字体、图标、设计系统 CSS。
- 缓存最近访问过的运营信息、线路基础数据、站点详情。
- 尽量支持离线打开线路或站点详情；离线包按用户自定义矩形范围存储，由用户在账号设置页手动更新或删除。
- 行程提醒、运营提醒、订票状态、检票提醒等服务端 Web Push。
- Push 免打扰时段由用户在账号设置页配置；服务端发送前必须读取用户通知偏好和免打扰规则。
- 弱网下展示“最近一次可用数据”，并明确标记更新时间。
- 单独准备 YCT App 图标；第一阶段不要求单独启动图。

不建议做：

- 把后台审核、登录态关键判断、公开数据发布依赖离线能力。
- 无限制缓存地图瓦片。
- 在离线状态下允许提交会影响公开内容的数据。
- 把 iOS 通知能力当成所有用户必然可用的基础能力。

当前工程过渡实现：

- 使用 `apps/web/public/sw.js` 提供轻量 Service Worker，缓存应用壳、图标、manifest、公开一级页面和离线兜底页。
- 近期访问的 `/travel/[id]`、`/travel/screen`、`/travel/stations/[lineName]/[stationName]` 与 `/operations/[id]` 会进入运行时缓存，用于弱网或离线时继续打开最近内容；`/travel/screen` 作为公共出行二级页也会随应用壳预热。
- `/api/transit/overview`、`/api/operations/feed`、`/api/services/entries`、`/api/settings/bootstrap` 以及公开地图基础 API `/api/map/tile-providers`、`/api/map/markers`、`/api/map/poi-categories`、`/api/map/unmined-regions` 使用 stale-while-revalidate 缓存策略，优先保证近期公开数据可读。
- Service Worker 不缓存 `/account`、`/admin`、`/auth`、`/api/auth`、`/api/admin`，避免把登录态、后台和鉴权内容放进离线缓存。
- 账号设置页提供安装入口、刷新缓存、清理缓存和自定义矩形离线范围管理。当前工程允许用户在浏览器本地保存多个 Minecraft X/Z 矩形范围，手动刷新该范围所需的基础公开数据，或删除范围；登录用户打开账号页时会拉取 `/api/account/offline-packages` 的服务端请求记录并合并到本机，保存或刷新范围时写入 `.yct-data/offline-package-store.json` 并发布 `OfflinePackageRequested` 事件，删除范围时会清理账号侧请求记录并发布 `OfflinePackageRequestDeleted` 事件。这仍不是完整瓦片离线包生成。
- 账号设置页已支持通知总开关、Push 免打扰时段，以及行程提醒、运营提醒、票务状态、检票提醒四类通知类型的偏好管理；匿名用户继续保存在浏览器本地，登录用户变更时会通过 `/api/account/push-preferences` 同步到 `.yct-data/notification-preference-store.json`，并发布 `PushPreferenceUpdated` 事件。登录用户在配置 `NEXT_PUBLIC_YCT_WEB_PUSH_PUBLIC_KEY` 后，可由账号页把当前浏览器 Push 订阅登记到 `/api/account/push-subscriptions`，写入 `.yct-data/push-subscription-store.json` 并发布 `PushDeviceSubscribed` / `PushDeviceSubscriptionRevoked` 事件；当前服务端发送器、投递队列、失败/延后回写、送达审计、通知类型默认预选配置和同用户同类型最小间隔限频已有第一版，仍需正式配置 VAPID 密钥、部署内部定时任务和补数据库 Outbox。
- 本地开发环境不输出 PWA manifest 链接，并会主动注销同源 Service Worker、删除 `yct-*` Cache，避免旧 RSC/chunk 缓存干扰 Next dev 热更新；生产环境继续暴露 `/manifest.webmanifest` 并注册 Service Worker。

待确认：

- 离线包体积上限、自动清理策略、增量更新方式，以及单个自定义矩形范围的最大面积。
- Web Push 通知类型默认预选项已可通过 `NEXT_PUBLIC_YCT_PUSH_DEFAULT_ENABLED_TYPES` / `YCT_PUSH_DEFAULT_ENABLED_TYPES` 配置；当前工程默认四类通知类型本地开启，正式上线可按推送策略调整。

PWA 安装文案草案：

```text
安装雨城通
把 YCT 添加到主屏幕，快速查看运营信息、线路和站点详情。支持缓存已下载的自定义范围离线包，并在你允许后接收行程、运营、订票和检票提醒。
```

参考资料：

- web.dev PWA 学习文档：https://web.dev/learn/pwa
- Apple Web Push 文档：https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers

## 7. 可扩展性设计

为了支持未来迁移到其他服务器或城市，核心业务需要面向接口，而不是面向临东当前 URL。

建议定义以下适配器：

```ts
export interface TileProvider {
  id: string;
  name: string;
  sourceKind: 'fresh-http' | 'safe-https-static' | 'proxied' | 'custom';
  getTileTemplate(profileId: string): Promise<string>;
  getAttribution(profileId: string): Promise<string | null>;
  getFreshness?(profileId: string): Promise<{ updatedAt?: string; note?: string }>;
}

export interface MarkerProvider {
  id: string;
  name: string;
  fetchMarkers(profileId: string): Promise<MapMarkerSnapshot>;
}

export type MapGeometry =
  | { type: 'Point'; coordinates: [number, number] }
  | { type: 'LineString'; coordinates: Array<[number, number]> }
  | { type: 'Rectangle'; bounds: { minX: number; minZ: number; maxX: number; maxZ: number } }
  | {
      type: 'MultiRectangle';
      rectangles: Array<{ minX: number; minZ: number; maxX: number; maxZ: number }>;
    }
  | { type: 'Polygon'; coordinates: Array<Array<[number, number]>> }
  | { type: 'MultiPolygon'; coordinates: Array<Array<Array<[number, number]>>> };

export interface TransitDataProvider {
  id: string;
  name: string;
  fetchLines(profileId: string): Promise<TransitLineSnapshot>;
  fetchStations(profileId: string): Promise<TransitStationSnapshot>;
  fetchSchedules?(profileId: string): Promise<TransitScheduleSnapshot>;
}

export interface IdentityProvider {
  id: string;
  name: string;
  buildLoginUrl(input: LoginRedirectInput): Promise<string>;
  readClientSession(input: ClientSessionInput): Promise<ClientSessionResult>;
}

export interface ContentSourceProvider {
  id: string;
  name: string;
  importContents(profileId: string): Promise<ImportedContentSnapshot>;
}
```

迁移到其他地方时，只新增或替换 Provider：

- 临东：BDSLM 标记点、当前瓦片 URL、旧项目 data 文件、ldpass 账号。
- 其他服务器：可能是另一个瓦片服务、抓取某 API 的线路数据、不同账号系统、不同 wiki。
- 抓取型数据源必须先进入“导入快照”，再由管理员审核发布，不能直接覆盖线上数据。

## 8. 事件驱动设计

后端业务服务必须遵循事件驱动边界：

- Service 不 import 其他业务 Service。
- Service 只负责本模块数据库操作和校验。
- 核心操作成功后发布领域事件。
- 副作用逻辑由监听器处理，例如通知、搜索索引刷新、缓存失效、Webhook 投递。
- 公开发布、通知、同步任务使用 Outbox 保证至少一次投递。当前单机过渡版已有本地 Outbox 和重放入口，后续接入数据库时需要把事件写入与业务状态变更放入同一事务。

### 8.1 事件基础结构

```ts
export interface YctDomainEvent<TType extends string, TPayload> {
  eventId: string;
  type: TType;
  occurredAt: string;
  actor: {
    type: 'anonymous' | 'user' | 'admin' | 'system' | 'adapter';
    id?: string;
  };
  profileId: string;
  payload: TPayload;
}
```

### 8.2 关键事件 Schema

```ts
export interface ContentSubmittedPayload {
  contentId: string;
  revisionId: string;
  title: string;
  categoryId: string;
}

export interface ContentApprovedPayload {
  contentId: string;
  revisionId: string;
  reviewerId: string;
  publishMode: 'immediate' | 'scheduled';
  scheduledAt?: string;
}

export interface ContentPublishedPayload {
  contentId: string;
  revisionId: string;
  publishedAt: string;
}

export interface TransitDataRevisionSubmittedPayload {
  datasetId: string;
  revisionId: string;
  dataKind: 'metro' | 'tram' | 'bus' | 'ferry' | 'railway' | 'schedule';
  sourceProviderId: string;
  summary: {
    lineCount: number;
    stationCount: number;
  };
}

export interface TransitDataRevisionApprovedPayload {
  datasetId: string;
  revisionId: string;
  reviewerId: string;
}

export interface TransitDataPublishedPayload {
  datasetId: string;
  revisionId: string;
  version: string;
  publishedAt: string;
}

export interface PoiSubmittedPayload {
  poiId: string;
  ownerUserId: string;
  name: string;
  geometry: MapGeometry;
  visibility: 'private' | 'public_requested';
}

export interface PoiSubmissionImageUploadedPayload {
  imageId: string;
  fileName: string;
  imageUrl: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
}

export interface PoiApprovedPayload {
  poiId: string;
  reviewerId: string;
  publicPoiId: string;
}

export interface TripReminderCreatedPayload {
  reminderId: string;
  userId?: string;
  anonymousDeviceId?: string;
  source: 'manual' | 'route_plan' | 'schedule' | 'ticket' | 'legacy_order';
  plannedStartAt: string;
}

export interface TripReminderDeletedPayload {
  userId: string;
  reminderIds: string[];
  source?: 'manual' | 'route_plan' | 'schedule' | 'ticket' | 'legacy_order';
  deletedAt: string;
  reason: 'user_requested' | 'legacy_sync_consent_revoked' | 'system';
}

export interface TripReminderNotificationDuePayload {
  reminderId: string;
  channel: 'browser' | 'web_push' | 'server';
  dueAt: string;
}

export interface UserPreferenceUpdatedPayload {
  userId: string;
  changedKeys: string[];
}

export interface ExternalServiceEntryPublishedPayload {
  serviceEntryId: string;
  categoryId: string;
  url: string;
}

export interface MapMarkerSnapshotImportedPayload {
  providerId: string;
  snapshotId: string;
  markerCount: number;
  fetchedAt: string;
}

export type TicketableServiceKind = 'coach' | 'ferry' | 'flight' | 'railway' | 'custom';

export interface TravelSchedulePublishedPayload {
  scheduleServiceId: string;
  serviceKind: TicketableServiceKind;
  revisionId: string;
  publishedAt: string;
  tripInstanceCount: number;
}

export interface TicketInventoryHeldPayload {
  inventoryHoldId: string;
  tripInstanceId: string;
  fareProductId: string;
  userId: string;
  quantity: number;
  expiresAt: string;
}

export interface TicketInventoryHoldExpiredPayload {
  inventoryHoldId: string;
  tripInstanceId: string;
  releasedQuantity: number;
  expiredAt: string;
}

export interface TicketOrderCreatedPayload {
  orderId: string;
  userId: string;
  ldpassUserId: string;
  scheduleId: string;
  serviceKind?: TicketableServiceKind;
  tripInstanceId?: string;
  fareProductId?: string;
  inventoryHoldId?: string;
  passengerCount?: number;
  status?: 'pending_issue' | 'issued' | 'cancelled';
}

export interface TicketOrderCancelledPayload {
  orderId: string;
  cancelledAt: string;
  reason: 'user_cancelled' | 'inventory_expired' | 'issue_failed' | 'admin_cancelled' | 'system';
}

export interface TicketIssuedPayload {
  orderId: string;
  ticketId: string;
  ldpassPassId?: string;
  actionLinkId?: string;
  issuedAt: string;
}

export interface TicketCheckedInPayload {
  orderId: string;
  ticketId: string;
  stationId?: string;
  checkedInAt: string;
  redemptionRequestId?: string;
}

export interface TicketRefundRequestedPayload {
  orderId: string;
  ticketId: string;
  requestedAt: string;
  reason?: string;
}

export interface TicketRefundCompletedPayload {
  orderId: string;
  ticketId: string;
  refundedAt: string;
  amount?: number;
}
```

## 9. 核心状态机

### 9.1 内容发布

```text
Draft
  -> Submitted
  -> Approved
  -> Scheduled
  -> Published
  -> Archived

Submitted -> Rejected -> Draft
Published -> Archived
Published -> Draft，新建修订版后重新提交
```

### 9.2 线路/站点数据发布

```text
Imported 或 Draft
  -> Validating
  -> ValidationFailed 或 PendingApproval
  -> Approved
  -> Published
  -> Superseded

Published -> RolledBack，恢复上一 Published 版本
```

当前工程过渡实现先采用同步校验的简化状态机：

```text
imported
  -> pending_review
  -> approved 或 rejected
  -> published
  -> superseded

validation_failed
  -> archived
```

说明：

- 导入动作直接从旧站真实数据源读取 `metro_data.js`、`tram_data.js`、`bus_data.js`，生成一个 `TransitDataRevision` 快照。
- 校验在导入时同步执行；如果存在阻断错误，版本进入 `validation_failed`，不能提交审核。
- 后台预览至少展示版本摘要、校验错误/提醒和部分线路，满足“线路数据发布需要预览”的第一阶段要求。
- 发布新版本时必须整体替换；旧发布版标记为 `superseded`，避免半套线路数据上线。
- 完整线路/站点编辑器、差异对比、回滚 UI 和定时发布后续再做。

### 9.3 公开 POI

```text
Private
  -> PublicSubmitted
  -> PublicApproved
  -> PublicVisible

PublicSubmitted -> PublicRejected -> Private
PublicVisible -> HiddenByAdmin
```

### 9.4 行程提醒

```text
Scheduled
  -> NotificationQueued
  -> Notified
  -> Completed

Scheduled -> Cancelled
NotificationQueued -> Failed -> RetryQueued 或 Cancelled
```

当前工程状态：

- 新版本地提醒以 `TripReminder` 结构保存，状态包含 `scheduled`、`notification_queued`、`notified`、`sent`、`ongoing`、`completed`、`cancelled`、`expired`。
- 旧站 `orders` 导入只作为历史迁移来源，不代表真实票务订单已经迁移到新版。
- 未登录用户允许创建、完成、取消、删除浏览器本地提醒；登录用户已有服务端 Repository 同步 MVP、旧站来源同步前确认和账号侧旧站提醒副本删除。通知送达已具备 Web Push 设备订阅、投递队列、内部处理接口和失败/延后审计第一版；跨实例 Outbox、正式计划任务部署和更细冲突处理仍待后续实现。

### 9.5 电子票

```text
DraftOrder
  -> PendingIssue
  -> Issued
  -> CheckedIn
  -> Completed

PendingIssue -> Cancelled
Issued -> RefundRequested -> Refunded
Issued -> Expired
CheckedIn -> RefundBlocked 或 ManualReview
```

电子票状态需要与 `ldpass` 票券状态同步。YCT 负责出行场景、班次和行程关联，`ldpass` 负责账号身份、票券凭证、乘车码或核验凭证承载。

## 10. 高频踩坑点

- 多实例事件丢失：只用内存 EventEmitter 时，一个实例写库、另一个实例负责通知会漏事件。公开发布、通知、Webhook 必须用 Outbox。
- 地图瓦片缓存失控：Service Worker 不能无限缓存瓦片，否则移动端存储很快爆掉。只缓存应用壳和少量最近数据。
- CORS 与混合内容：主站如果走 HTTPS，`http://ld.cmsy.xyz:19136/` 瓦片会触发混合内容风险。需要确认生产是否提供 HTTPS 或走反向代理。
- 旧 JS 数据直接 `eval`：旧项目中存在从 JS 文本提取数组再 `eval` 的方式。v2 导入时应解析为受控 JSON/Schema，导入失败进入错误报告，不直接执行上传内容。
- 本地历史迁移：旧订单/行程在 `localStorage`，登录后跨设备同步时要避免重复导入、误覆盖和隐私泄露。
- 审核并发：两个管理员同时审核同一修订版时，需要乐观锁或状态条件更新。
- 地图与面板抢视口：移动端地图页必须保证地图始终可见，底部抽屉展开高度要受控，避免完全挡住地图。
- 出行模块概念过大：如果没有真实库存、票券、支付或权益系统，“购票”会让用户以为能真实买票。第一阶段主导航使用“出行”，把票务承诺收窄到后续接入。
- 道路级路线规划数据缺口：站点线路数据不能直接推出道路级路径，必须额外维护道路图、节点、边、通行规则和权重，否则路线结果会看起来“像能导航”，实际却不可用。

类似惨痛教训的抽象例子：一个静态站升级后台时，最容易把“审核通过后发送通知、刷新缓存、写搜索索引”都塞进同一个 Service。单机演示没问题，上线多实例后某次缓存刷新失败导致首页看不到新公告，数据库却已经发布成功。后来只能补 Outbox 和重放工具。雨城通从一开始就把副作用挂在事件监听器上，可以少走这条弯路。

## 11. 建议验证用例

这些不是要求立刻写测试，只是后续验证机制是否稳健的核心用例。

- 内容发布：提交内容、审核通过、定时发布、过期下线、回滚到上一版本。
- 线路导入：导入旧 `metro_data.js`、校验失败、修正后发布、前台读取新版本。
- 路线规划：同站换乘、断线线路、单向公交站、没有路径、跨交通方式。
- 道路级规划：后台标记数据生成道路图、起终点吸附到道路、禁行边、断头路、跨桥/隧道、道路权重变化、步行与公共交通衔接。
- POI 审核：用户提交公开 POI、管理员驳回、再次提交、通过后公开可见。
- POI 几何：点、线、多边形、多矩形组合、多面区域、非法自交多边形。
- 登录接入：未登录跳转 ldpass、回跳校验 `state`、账号非 Active 时仅允许只读账号页并拒绝业务写接口。
- 历史同步：匿名本地行程登录后导入，同一行程不重复，跨设备可见。
- PWA 缓存：离线打开最近访问线路，恢复联网后刷新到新版本。
- Web Push：设备订阅登记、服务端推送成功、用户撤销授权、设备过期、重复推送去重。
- 票务联动：订票成功后生成 `ldpass` 票券、退票后同步状态、检票后行程状态变化、票券异常进入人工处理。
- 多实例事件：发布内容后 Outbox 可重放，监听器失败不会丢事件。
- 地图性能：低端移动设备加载地图、线路、标记点时保持可交互。

## 12. 阶段建议

### 12.1 MVP 验证

先做三个小闭环，确认路线可行后再全面铺开：

- 地图闭环：读取瓦片、读取 BDSLM 标记点、叠加一条旧线路数据。
- 登录闭环：从雨城通跳转 ldpass 登录，回跳后读取 `client-session`，写入本地用户映射。
- 内容闭环：后台创建内容、审核、发布到首页卡片。

### 12.2 第一阶段

- 前台四大主模块加账号入口。
- 运营信息后台与首页发布。
- 地图探索基础版：瓦片、点/线/面标记、站点/线路搜索、线路详情，道路级规划先完成基于后台标记数据的数据模型和最小验证。
- 出行提醒：迁移旧行程提醒能力，登录后支持同步。
- 出行班次：提供智运大屏二级页，支持按线路、车站、班次号、检票口和时间状态筛选旧客运大屏数据。
- 车站信息：提供旧地铁站点详情二级页，展示站内层级、设施、出入口、换乘和周边站点；全局搜索可检索已有站点详情。
- 更多服务入口配置。
- 设计系统与响应式布局落地。
- 轻量 PWA：manifest、应用壳缓存、安装入口、近期线路/站点详情离线缓存。

### 12.3 第二阶段

- 线路/站点后台编辑、审核、版本发布。
- POI 用户提交与公开审核。
- 道路级路线规划可用版。
- 更完整的班次查询、旧文本导入治理和客运大屏运维工具。
- 搜索索引优化。
- 旧工具组件化或工具壳接入。
- 服务端 Web Push。

### 12.4 第三阶段

- 真实电子票、检票、退票和 `ldpass` 票券接入。
- 标准 OIDC 或更开放的第三方身份能力。
- 多部署 Profile 与抓取型数据源管理。
- Webhook、数据同步任务、监控告警。

## 13. 已确认决策与待拍板问题

### 13.1 产品命名与导航

已确认：

- 项目中文名为“雨城通”，英文名为 `Yuchengtong`，缩写为 `YCT`。
- 全局搜索按钮进入独立搜索结果页，不再跳转到运营首页内的搜索框。
- 当前工程已提供独立搜索结果页和分类 chip 栏，可切换全部、运营信息、线路、站点、服务入口结果，避免某一类结果过多时压住其他类型结果；地点/POI、工具更细分类随地图 POI 与服务入口数据完善后继续扩展。
- 后续需要加入购票功能，但第一阶段可以先不上线真实购票。
- 乘车码功能与购票/票券相关功能一起接入 `ldpass`。
- 第一阶段主导航使用“出行”，先去掉“购票”等字样。
- 账号相关设置只作为顶部头像入口，不作为底部/侧边主导航项。
- 顶部头像入口需要区分登录状态，并按需显示计数徽标，例如待审核、未读通知、管理员待办。
- 计数徽标需要合并显示；前台只显示一个徽标，详情在账号/通知面板内展开。
- 后续规划多语言支持，初步目标为简体中文、繁体中文和英语。界面固定文案可以走 i18n key；地名、站名、组织名等专有名词需要独立翻译字段、别名表或按服务器配置维护，不能默认用机器翻译覆盖真实业务数据。

### 13.2 地图与数据

已确认：

- `ld.cmsy.xyz:19136` 当前无法提供 HTTPS。
- 当前 `map.shangxiaoguan.top` 资源直接接入不涉及跨域问题。
- 路线规划需要精确到道路级。
- 道路级路线规划的数据来源基本只能通过后台维护的标记点/线/面数据实现。
- 用户公开 POI 使用人工审核。
- 不同公共交通方式统一抽象为同一套 `TransitLine`。
- 地图标记需要支持点、线、面。
- Minecraft 中 X 正方向对应东，Z 正方向对应南；BDSLM 标记点可作为坐标输入格式参考。
- 面性标记优先评估多个矩形组合，显示层可视性能再决定是否转换为多边形。
- 如果 HTTP 瓦片产生混合内容风险，可以切换到 `https://map.shangxiaoguan.top` 的静态资源；HTTP 瓦片较新，HTTPS 静态瓦片更安全但可能不反映最新情况。
- POI 分类可参考 `map.shangxiaoguan.top` 下的 PNG 文件；分类与图标允许一对多。

仍待确认：

- 瓦片混合内容的长期生产方案：临时切换 HTTPS 静态源、后端代理、同源反代、独立 HTTP 地图页，还是升级瓦片发布方式。
- 后台标记数据如何转为道路图：手工连接节点、自动从线性标记抽取，还是二者结合。
- 线路型 POI 在数据库中拆成“线路整体 + 方向子 POI”，还是每个方向各自作为独立线性 POI；途径坐标是必填、可选，还是由道路级规划按途径站点生成。
- 面性地点的显示层是否转换为多边形，以及转换后的性能边界。
- 公开 POI 允许的最终分类表、分类到图标的映射规则、图片要求、命名规范和驳回理由模板。

### 13.3 账号与权限

已确认：

- YCT 只允许 `ldpass` 用户作为登录用户；需要账号身份的业务接口只接受有效登录态。
- YCT 管理员权限由 YCT 自己维护角色表。
- 匿名用户允许保存本地历史和行程提醒。
- 匿名用户不允许创建私有 POI，不允许创建行程订单。
- 旧订单和旧行程需要在用户明确同意后再迁移到登录账号。
- 非 Active 的 `ldpass` 用户允许进入只读账号页。
- 管理员角色第一阶段先不拆分。

仍待确认：

- 旧本地历史迁移到账号后的冲突处理和正式同意文案细化；旧站 `orders` 来源同步前确认、账号侧副本删除和本地撤销同意已完成第一版。

### 13.4 后台与审核

已确认：

- 已验证服务器账号的 `ldpass` 用户可以投稿。
- 投稿用户只需要验证服务器账号即可，不需要额外投稿者白名单。
- 内容审核第一阶段不做二审。
- 线路数据发布需要预览。
- 管理员敏感操作可以增加 PIN 二次确认。

仍待确认：

- 内容审核是否需要基础敏感词、外链域名提示、图片安全检查。
- PIN 来源：复用 `ldpass` PIN，还是 YCT 自己维护后台操作 PIN。
- 预览环境形态：单独预览 URL、后台嵌入预览，还是“待发布版本”切换查看。

### 13.5 出行与后续票务

已确认：

- 后续可以做真实电子票、检票、退票系统。
- 真实票务需要接入 `ldpass`。
- 行程提醒应尽量联动购票或票券状态。
- 班次数据第一阶段从旧文本导入。
- 检票优先走 `ldpass` 侧核销链接、操作链接或核销 API，YCT 负责把出行订单和票券/核销状态关联起来。
- 客运班次订购和显示的产品深度参考旧站 `/ltcx/`：至少覆盖班次查询、站点/日期筛选、购票确认、订单详情、凭证展示、退票、本地历史和停运提醒；新版需要在这些任务流上接入真实服务端订单和 `ldpass` 票券状态。

仍待确认：

- 票务库存模型：是否存在座位、余票、票种、价格、乘客实名或占座超时。
- 退票规则：发车前/检票后/过期后的状态处理。
- YCT 票务订单主表、库存、对账和退票规则与 `ldpass` 票券/核销系统的边界。
- 车站大屏、管理员扫码、乘车码和人工检票分别如何接入 `ldpass` 核销链路。

### 13.6 PWA

已确认：

- 尽量支持离线打开线路或站点详情。
- 离线包按用户自定义矩形范围存储。
- 自定义范围离线包的手动更新和删除入口放在账号设置页。
- 当前工程已提供本地自定义矩形范围管理，并已把登录用户的范围请求接入服务端请求记录、账号页合并、删除清理、`OfflinePackageRequested` 和 `OfflinePackageRequestDeleted` 事件；后续仍需要接服务端离线包生成、体积检查、瓦片/API 清单生成和下载状态回写。
- 推送需要做服务端 Web Push；当前已完成账号侧设备订阅登记和撤销，并新增投递队列、真实 `web-push` 发送器、失败/延后回写、送达审计、通知类型默认预选配置和同用户同类型最小间隔限频第一版。正式上线仍需要配置 VAPID 密钥、部署内部定时任务和补跨实例 Outbox。
- Push 触发来源包括行程提醒、运营提醒、订票和检票等。
- Push 免打扰时段由用户设置。
- 设置页面需要提供 Push 类型管理入口。
- 需要单独的 App 图标。
- App 和网站图标源文件目录使用 `assets/brand/`。
- 第一阶段不需要单独启动图。
- 需要撰写 PWA 安装文案，第一版草案已写入第 6 章。

仍待确认：

- 自定义矩形范围的最大面积、离线包体积上限、自动清理和增量更新策略。
- Web Push 正式定时任务部署和跨实例 Outbox。

### 13.7 管理员账号来源方案

可选方案：

- 推荐方案 A：登录身份来自 `ldpass`，YCT 后台维护 `AdminRole`。第一阶段只区分 `admin` 和 `super_admin`。首次超级管理员通过一次性 seed 脚本绑定某个 `ldpassUserId`，后续由超级管理员在后台授予其他人权限。
- 方案 B：登录身份来自 `ldpass`，但首批管理员通过私有环境变量或私有配置文件列出 `ldpassUserId` 白名单。上线快，但权限变更需要运维介入。
- 方案 C：YCT 自建后台账号和密码。独立性强，但会重复造账号安全体系，不推荐作为长期方案。
- 方案 D：完全继承 `ldpass` 管理员角色。实现简单，但 YCT 权限边界会被 `ldpass` 角色牵动，不利于细分内容、线路、POI 等后台权限。

已确认采用方案 A，并将首位超级管理员初始化放在后台命令行完成。

当前工程过渡实现：

- `pnpm admin:init <ldpassUserId>` 会把首位或指定管理员写入 `.yct-data/admin-memberships.json`。
- 后台 API 使用真实 `ldpass` 登录态校验身份，并检查本地管理员成员记录。
- `.yct-data` 属于私有运行数据，不进入 GitHub 仓库；后续接入数据库后应迁移到正式 `AdminMembership` 表。

仍待确认：

- 管理员 PIN 二次确认使用 `ldpass` 还是 YCT 本地机制。
- 是否需要操作审批，例如删除线路、发布票务规则必须双人确认。

## 14. 已知约束与信息待补充

已知信息：

- 生产服务器的具体配置、剩余存储、面板版本等属于私有运维信息，不写入 GitHub 仓库。
- 部署目标是 Windows + 宝塔面板类环境；具体版本、硬件和磁盘情况记录在私有运维文档。
- 当前运行时需要重点检查 Node.js 版本是否满足所选 Next.js 版本要求；若不满足，应优先升级运行时。
- 管理员数量约 5 名，投稿者数量约十余名，日活规模按几千次级别估算。
- 旧数据中的线路、站点信息、内容信息和原有专题页面需要完整迁移。
- 设计稿暂时只有截图，没有 Figma / Sketch 源文件。
- 浏览器最低目标：Safari 17、Chromium 114。
- 第一位超级管理员通过后台命令行初始化。
- App 和网站图标源文件目录：`assets/brand/`。

地图坐标系需要补充说明：

- 旧地图和 BDSLM 通常使用 Minecraft 世界坐标 `x` / `z` 表达位置。
- Minecraft 中 X 正方向对应东，Z 正方向对应南。
- BDSLM 的 `/api/getPlayerMarkers` 会直接返回玩家当前位置的 `x` / `z`，可作为标记点输入格式参考。
- BDSLM 地图渲染由 unmined 生成，YCT 仍需要实测 unmined 前端或瓦片资源如何把世界坐标映射到屏幕/瓦片坐标。
- 前端瓦片地图可能使用另一套像素坐标、瓦片坐标或投影坐标。
- 需要明确“一个 Minecraft 坐标点如何落到地图瓦片上的屏幕位置”，也就是：
  - 原点在哪里。
  - `x` 正方向对应屏幕向右还是向左。
  - `z` 正方向对应屏幕向下还是向上。
  - 缩放级别与世界坐标的比例关系。
  - 不同维度或不同地图是否有独立坐标系。
- 如果 BDSLM 产出的前端已有转换逻辑，需要把这段规则整理成 `CoordinateTransform` 适配器，而不是散落在地图组件里。

仍待补充：

- 生产数据库可用性：是否可以安装 PostgreSQL，还是必须先用 SQLite。
- 公开地图瓦片的长期反代/代理方案。
- App 图标源文件本体。
- `ldpass` 绑定账号等账户深链是否稳定可用。
- 票务订单、票券发行、核销链接、退票和对账的跨系统详细协议。

## 15. 参考资料

- 旧雨城通仓库：https://github.com/LindongCityServer/yct
- 临东通账号系统仓库：https://github.com/LindongCityServer/ldpass
- YCT 与 ldpass 接入说明：`docs/LDPASS_INTEGRATION.md`
- BDSLM 仓库：https://github.com/LiteLDev/BDSLM
- Next.js Route Handlers：https://nextjs.org/docs/app/building-your-application/routing/route-handlers
- Next.js Installation：https://nextjs.org/docs/app/getting-started/installation
- Node.js Previous Releases：https://nodejs.org/en/about/previous-releases
- Prisma 文档：https://www.prisma.io/docs
- MapLibre GL JS 文档：https://maplibre.org/maplibre-gl-js/docs/
- MDN PWA：https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps
- web.dev PWA：https://web.dev/learn/pwa
- Apple Web Push：https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers
