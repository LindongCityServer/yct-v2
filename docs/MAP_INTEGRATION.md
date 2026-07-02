# 地图接入说明

更新时间：2026-07-01

本文档记录雨城通 v2 当前地图数据源、uNmINeD 静态地图发现结果，以及后续需要验证的坐标转换边界。

## 1. 当前数据源

- HTTPS 静态地图基准：`https://map.shangxiaoguan.top/`
- 较新 HTTP 瓦片源：`http://ld.cmsy.xyz:19136/`
- 当前 v2 默认优先使用 HTTPS 静态地图作为安全来源；较新 HTTP 源仍通过 `YCT_TILE_FRESH_HTTP_TEMPLATE` 预留。
- 实时或玩家标记源可通过 `YCT_MARKER_BDSLM_BASE_URL` 接入 BDSLM `/api/getPlayerMarkers`。
- 未配置 BDSLM 时，v2 会读取 `https://map.shangxiaoguan.top/custom.markers.js` 作为静态标记快照。

## 2. uNmINeD 静态地图结构

已确认 `https://map.shangxiaoguan.top/` 是 uNmINeD + OpenLayers 输出，主要文件包括：

- `unmined.map.properties.js`：地图元信息，包含 `minZoom`、`maxZoom`、`centerX`、`centerZ`、`imageFormat`。
- `unmined.map.regions.js`：区域瓦片存在性数据。
- `custom.markers.js`：自定义地图标记。
- `unmined.js`：OpenLayers 地图初始化与瓦片 URL 规则。

当前发现的 uNmINeD 瓦片 URL 规则：

```text
tiles/zoom.{z}/{xd}/{yd}/tile.{x}.{y}.{format}
```

其中：

- `{z}` 是 uNmINeD 的 world zoom，不等同于常见 Web Mercator XYZ zoom。
- `{x}` / `{y}` 是 uNmINeD tile 坐标。
- `{xd}` = `Math.floor(tileX / 10)`。
- `{yd}` = `Math.floor(tileY / 10)`。
- 当前静态站 `imageFormat` 为 `jpeg`。

因此该源不能简单当成标准 `{z}/{x}/{y}.png` 瓦片源使用。后续完整地图渲染应直接接 OpenLayers/uNmINeD 规则，或在 `TileProvider` 中明确标记为 `unmined-static` 风格。

## 3. 当前 v2 已实现

- `/api/map/tile-providers`：在没有显式 HTTPS 瓦片模板时，返回 `lindong-unmined-static` Provider 描述。
- `/api/map/markers`：
  - 配置 `YCT_MARKER_BDSLM_BASE_URL` 时读取 BDSLM 实时标记。
  - 未配置时读取 `custom.markers.js` 并转换为统一 `MapMarkerSnapshot`。
- `/api/map/poi-categories`：
  - 配置 `YCT_POI_ICON_CANDIDATES` 时读取显式图标候选。
  - 未配置时从 `custom.markers.js` 的 `image` 字段提取旧地图实际使用的 PNG 文件，并按语义合并为默认 POI 分类。
  - 已固定的合并规则包括：`road.png` / `roadpoint.png` -> 道路，`exit-*` / `way-in.png` / `way-out.png` -> 地铁出入口，`lindong-metro.png` / `lindong-metro-transfer.png` -> 地铁站，`railway-station.png` / `local-railway-station.png` -> 铁路车站。
- `/map` 页面：
  - 读取瓦片 Provider 和标记快照。
  - 展示可用图层、标记数量、POI 分类数量、最近标记列表。
  - 通过同源 `/api/map/unmined-regions` 读取并解析 `unmined.map.properties.js` 与 `unmined.map.regions.js`，按 uNmINeD 区域索引过滤真实存在的瓦片，避免在可见区域内大量请求不存在的 tile。
  - 地图主体已具备基础拖拽、滚轮缩放、放大/缩小/回到默认视图按钮；仍需继续验证不同缩放级别下的坐标精度。
  - 地图标记图案沿用 `custom.markers.js` 中的旧图标文件名，并通过静态地图基准 URL 解析为 `map.shangxiaoguan.top` 下的资源。
  - 前端会读取 uNmINeD region 索引过滤真实存在的瓦片；后续仍需在界面层确保缺瓦片区域透明显示，不出现破图或不自然底色块。
  - 在坐标转换完全验证前，线路和部分道路级数据仍只作为 POI/端点组展示，不宣称已经完成道路级精确导航。

## 4. 地图体验进展与待办

- 已处理第一版：地图操作栈只负责布局定位，视觉容器样式拆到搜索框、标记列表和工具栏。标记列表承接背景、描边、边距和阴影，搜索框与工具栏增加轻量阴影。
- 已处理第一版：地图标记整体缩小约 30%；标记右侧文本标签只在空间足够时显示，并用简单网格密度控制降低重叠概率。后续如标记量继续增长，需要更完整的碰撞避让策略。
- 已处理第一版：点击或搜索选中 POI 后，会突出显示该 POI，并在地图操作栈中展示地点详情。普通点状地点详情保留“简介 / 设施或出入口”页签；周边搜索改为详情操作栏按钮，不再作为常驻页签。设施数据仍等待后台结构化来源。
- 已处理第一版：公共交通线路详情已新增地图探索二级页 `/map/lines/[id]`，地图线路型 POI、全局搜索线路结果和出行页现有线路列表会跳转到该入口；旧 `/travel/[id]` 暂时保留兼容。出行页后续仍需继续精简，只保留提醒、客运班次查询、订票与后续交通方式预留入口。
- 已处理第一版：地图页备案信息移到地图区域右下角，避免占用侧边操作栈或普通内容流。
- 已处理第一版：地图操作面板滚动已下沉到 `.map-marker-list` 和 `.map-poi-detail-body`，`.map-panel-section` 只负责组织搜索框与当前列表/详情。
- 已处理第一版：旧标记名称和描述会清理全角空格；点标记在小尺寸视口也保留文字标签，并通过碰撞盒隐藏当前尺寸和范围下会重叠的标记。搜索结果态优先只隐藏重叠标签，保留命中的点位本体。道路类点位不额外显示“道路/高速”等文字徽标。
- 已处理第一版：旧地图标记名称里的换行、空格和全角空格视为旧网页排版断点；搜索、碰撞宽度估算和站名匹配时会忽略这些空白。
- 已处理第一版：道路类标记的 `road.png`、`roadpoint.png`、`highway-s1.png`、`toll-gate.png` 当前按透明占位图处理；道路端点不作为普通点位图标渲染，也不会回退成默认地点图标。道路数据继续用于道路端点组、搜索和瓦片关闭时的粗线层。
- 已处理第一版：`map-layer-panel` 升级为“卫星 / 路网 / 交通”多段式浏览模式，并提供标记点、线条与标签显示开关。卫星模式加载瓦片并以透明道路线条叠加道路文字标签；路网模式关闭瓦片并突出道路网络；交通模式关闭瓦片、淡化道路、不显示道路文字，并提高交通 POI 优先级。道路近似轨迹参考旧站 `map_search/navigation.js` 的粗排序思路：先按 X/Z 跨度选择主轴起点，再用最近邻串联无序端点；随后以整条近似线的包围盒判断是否经过当前视口，再交由 SVG 裁剪，避免只看可见端点导致长路段缺失。它仅用于视觉参照，不代表道路级导航结果。
- 已处理第一版：道路端点组合并时显式纳入 `road`、`roadpoint`、`highway-s1` 和 `toll-gate` 图标来源；点击道路端点组会打开道路详情并高亮对应近似轨迹。普通道路粗线发生大面积重叠时，会隐藏较短轨迹以降低交叉误读，高速/快速路不参与该隐藏规则。
- 已处理第一版：地铁站、公交站、有轨站、地方铁路/专用线车站和客运站的 POI 详情会在简介中展示“接驳线路”。数据来自 `/api/transit/overview` 的真实线路 `stationNames`，用站名规范化匹配；如果旧地图 POI 名称与线路站名仍无法匹配，会显示暂无已知接驳线路。
- 已处理第一版：接驳线路标识可在地图页直接选中对应线路对象，线路详情面板展示站点序列，地图区域展示已有站点坐标和当前已知近似轨迹。
- 已处理第一版：地图内线路详情的站点序列增加正向/反向分段控制；`/api/transit/overview` 会输出轻量 `stationStops` 摘要，地图详情按 `oneWay: up/down` 过滤单向站，时间线节点和连线颜色使用线路色或交通方式语义色。
- 已处理第一版：地图左下角新增比例尺和光标所指 Minecraft X/Z 坐标显示；比例尺按当前 uNmINeD zoom 的屏幕像素与方块距离动态取整。
- 已处理第一版：地图交互层支持连续无级缩放；瓦片资源仍按最近的 uNmINeD 整数 zoom 层级请求，并按连续缩放值在屏幕上缩放瓦片尺寸、标记点和比例尺。
- 已处理第一版：地图瓦片资源层级切换时会保留上一层瓦片短暂淡出，新层淡入，避免整数 zoom 切换时直接跳变。
- 已处理第一版：地图标记点、线性 POI 和道路/线路轨迹的位移过渡与瓦片层保持同一节奏，减少拖动或缩放时瓦片与标记分离的视觉问题。道路文字标签参与同一套碰撞检测，线性对象标签锚点取近似折线中点，确保标签落在轨迹上；普通道路文字以轨迹锚点居中对齐，当局部 Z 范围明显大于 X 范围时改用竖排文字。选中道路近似轨迹使用强调色高亮。
- 已处理第一版：地图标记列表新增展开/收起按钮，收起时保留搜索框和列表摘要，减少对地图主体的遮挡。
- 已处理第一版：地图标记列表新增可折叠分类筛选；无搜索词时按当前地图中心距离展示最近标记，搜索时展示匹配结果。
- 已处理第一版：地图页只使用地图区域右下角的 `map-legal` 展示备案和免责声明；主导航收起后不再在内容末尾追加普通 `site-legal`。

## 5. 待验证坐标转换

已知 Minecraft 坐标规则：

- X 正方向对应东。
- Z 正方向对应南。

仍需从 uNmINeD/OpenLayers 侧验证：

- uNmINeD `dataProjection` 到 `viewProjection` 的完整转换参数。
- `centerX` / `centerZ` 与页面初始中心的关系。
- uNmINeD tile 坐标如何从 Minecraft `x/z` 推导。
- 静态标记、BDSLM 实时玩家标记和后台 POI 是否可以共用同一套 `CoordinateTransform`。
- 当前已确认并实现基础瓦片公式：`tileX = floor(x * 2^zoom / 256)`、`tileZ = floor(z * 2^zoom / 256)`，`zoom` 使用 uNmINeD world zoom。后续还要用旧站 OpenLayers 的实际视口截图对比，确认 Retina `devicePixelRatio`、比例尺和触控缩放下是否需要额外校正。

在这些问题确认前，前端可以展示标记快照和示意分布，但不能宣称已经完成道路级精确地图定位。
