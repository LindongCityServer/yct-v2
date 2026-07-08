# 旧数据迁移说明

更新时间：2026-07-03

本文档记录雨城通 v1 数据迁移到 v2 的当前策略和已验证范围。

## 1. 原则

- 旧数据先进入“导入快照”，通过 schema 校验后再提交审核和发布。
- 迁移时可以直接从 `https://yct.shangxiaoguan.top/data` 拉取最新旧站数据；正式入库前仍应生成一次可追溯快照。
- 本地旧项目 `data` 目录仍保留为 fallback，用于断网、旧站不可用、复现某次迁移结果或对比差异。
- 不把旧线网图坐标误当作 Minecraft 世界坐标；旧 `coordinates.x/y` 先作为 `diagramX/diagramY` 保存。
- 导入器只解析旧文件并输出结构化记录，不直接写线上数据库。
- 导入失败需要给出具体文件、记录和 schema 错误，不能静默丢弃。

## 2. 当前支持的旧文件

| 文件                           | 解析器                                                | 当前输出                                         |
| ------------------------------ | ----------------------------------------------------- | ------------------------------------------------ |
| `data/content_data.js`         | `parseLegacyContentFile` / `parseLegacyContentSource` | 内容导入项                                       |
| `data/metro_data.js`           | `parseLegacyTransitFile` / `parseLegacyTransitSource` | 地铁线路、站点和停靠点属性                       |
| `data/tram_data.js`            | `parseLegacyTransitFile` / `parseLegacyTransitSource` | 有轨线路、站点和停靠点属性                       |
| `data/bus_data.js`             | `parseLegacyTransitFile` / `parseLegacyTransitSource` | 公交线路、站点和停靠点属性                       |
| `data/local_railway_data.js`   | `parseLegacyTransitFile` / `parseLegacyTransitSource` | 地方铁路线路和站点                               |
| `data/metro_station_detail.js` | `parseLegacyMetroStationDetailSource`                 | 地铁站点详情、楼层、设施、换乘、出入口和周边站   |
| `ltcx/route.txt`               | `parseLegacyCoachRouteSource`                         | 客运线路、途径站、班次时间、票价、公司和来源链接 |
| `ltcx/route.txt`               | `parseLegacyCoachScreenTripSource`                    | 客运大屏逐班次记录                               |
| `ltcx/stop.txt`                | `parseLegacyCoachStopNoticeSource`                    | 客运停运/调整公告、时段和原因                    |
| `ltcx/screen/station.txt`      | `parseLegacyCoachScreenStationSource`                 | 客运大屏站点编号和站名                           |
| `ltcx/screen/tickets.txt`      | `parseLegacyCoachScreenGateSource`                    | 客运大屏检票口配置                               |
| `ltcx/screen/rttime.txt`       | `parseLegacyCoachRuntimeSegmentSource`                | 客运区间运行时间和减价信息                       |
| `ltcx/screen/notice.txt`       | 文本归一化                                            | 客运大屏滚动公告                                 |

## 3. 运行时预览入口

运行时通过 `/api/operations/feed` 读取旧内容数据，并通过 `/api/transit/legacy-overview` 读取已支持的旧线路数据。首页展示旧内容 banner 和信息列表；完整线路浏览逐步转入地图探索，出行页只保留“出行服务”和“行程提醒”两个主模块，线路与站点、客运班次、客运大屏和票务平台预留入口都收纳到出行服务内。

客运文本文件不在旧站 `/data` 目录下，而在旧站根目录的 `/ltcx` 下。远程读取使用 `YCT_LEGACY_PUBLIC_BASE_URL`，本地读取时如果 `YCT_LEGACY_DATA_DIR` 指向旧项目 `data` 目录，会自动上探一级读取 `ltcx/*.txt`。

客运大屏运行时入口为 `/api/transit/screen`，会合并读取 `ltcx/route.txt`、`ltcx/screen/station.txt`、`ltcx/screen/tickets.txt`、`ltcx/screen/rttime.txt` 和 `ltcx/screen/notice.txt`。其中 `route.txt` 在大屏语境下保留逐班次记录，不使用已聚合的客运线路列表。

统一班次查询 MVP 运行时入口为 `/api/travel/schedules`，当前复用同一批旧 `ltcx` 真实逐班次、站点、检票口、票价和运营方数据，并映射为 `TravelTripInstance`；航班读取 `YCT_FLIGHT_DATA_URL` 的真实文本数据并过滤到 YCT 范围；轮渡在数据源接入前只返回未接入服务摘要，不生成占位班次。查询接口支持 `serviceDate` 或兼容参数 `date`，格式为 `YYYY-MM-DD`；只有数据本身带 `operatingDays` 的班次才会按星期过滤，旧客运逐班次暂缺运行日字段时不做臆测剔除。接口也支持 `originStationName` / `destinationStationName`，兼容 `origin` / `destination` 和 `from` / `to`；当起终点同时存在时，按真实站点序列要求起点不晚于终点，避免把反向不存在的班次展示为可达。接口会同时返回旧 `ltcx/stop.txt` 解析出的 `serviceNotices`，前端按当前选择的服务日期展示匹配公告；旧公告目前只有时段和原因，不能自动关联具体班次或改写可售状态。运行时会对完整查询结果做 30 秒进程内缓存，并对航班文本源做 60 秒进程内缓存，避免连续访问重复拉取外部数据。

航班查询数据源当前可通过 `YCT_FLIGHT_DATA_URL` 配置，默认读取 `https://haojin.guanmu233.cn/data/flight_data.txt`。解析器按 `【航班号】〈航线备注〉«运行日»〔执飞机型〕『航空公司』《地点出发/经停/到达》{时间}#+天数#@位置@ ... §票价§《航班结束》` 结构读取，只纳入“临东金桦”起飞、经停、到达的航班，以及航空公司为“临东航空”的航班；其他航班不迁入 YCT 查询结果。当前运行时对外部航班源做短重试以缓解 `ECONNRESET` 等瞬时失败，但长期仍应迁入 YCT 后台数据源或稳定抓取快照。

浏览器本地班次记录保存在 `yct.travelScheduleHistory.v1`，只记录统一班次查询结果快照和提醒关联时间，最多保留最近 50 条。它不能作为旧订单或新版票务订单迁移来源；当前登录同步只提交行程提醒快照，不同步班次记录。地图收藏保存在 `yct.mapFavorites.v1`，登录用户进入账号页时会与 `/api/account/map-favorites` 的账号侧 markerId 列表做并集合并，并写回 `.yct-data/map-favorite-store.json`；它只同步 markerId，不复制地点快照，也不作为旧站订单迁移来源。旧站 `orders` 只读导入的 `legacy_order` 提醒同步到账号前会先向用户确认，拒绝时仍可同步非旧站提醒；确认状态保存在本机 `yct.tripReminders.legacySyncConsentAt`，账号页可撤销本地同意。登录状态下撤销会通过 `/api/account/trip-reminders` 删除账号侧 `legacy_order` 提醒副本，成功后把本机旧站提醒标回待同步；细粒度去重、冲突策略和正式迁移文案仍待后续实现。

统一班次与票务平台重写后，旧客运 `ltcx` 文本需要同时进入新版 `ScheduleService`、`TripInstance`、`FareProduct` 和停运提醒模型。旧站订单只允许作为历史或提醒来源迁移，不能直接视为新版真实票务订单；轮渡、航班后续也应通过同一套导入/适配器接口进入查询订票平台。

数据源配置：

- `NEXT_PUBLIC_YCT_BASE_PATH=/v2` / `YCT_BASE_PATH=/v2`：仅用于临时把新站挂到子路径测试；当前生产反代会把 `/v2` 剥离到应用根路径，因此应用只给浏览器侧链接和静态资源补前缀。后续迁回主路径时留空即可。
- 临时子路径部署不写死到业务数据：标题栏图标、favicon、manifest、旧内容封面、Markdown 图片和 POI 投稿上传图片都会按当前应用前缀生成浏览器可访问 URL；资源落盘、旧资源下载和 POI 投稿图片存储仍使用不带 `/v2` 等临时前缀的真实目录或内部路径。
- PWA Service Worker 会从自身公开地址推导子路径前缀：`/sw.js` 对应主路径，`/v2/sw.js` 对应 `/v2`。应用壳预热、离线兜底、公开 API 缓存、敏感路径排除都按该前缀归一化匹配，避免临时 `/v2` 反代下离线缓存失效。
- `YCT_LEGACY_DATA_SOURCE=auto`：默认模式；配置了 `YCT_LEGACY_DATA_DIR` 时优先读取本地，否则读取远程旧站。
- `YCT_LEGACY_DATA_SOURCE=local`：只读取 `YCT_LEGACY_DATA_DIR`。
- `YCT_LEGACY_DATA_SOURCE=remote`：只读取 `YCT_LEGACY_DATA_REMOTE_BASE_URL`。
- `YCT_LEGACY_DATA_REMOTE_BASE_URL=https://yct.shangxiaoguan.top/data`：默认远程旧站 data 基准。
- `YCT_LEGACY_DATA_FETCH_TIMEOUT_MS=8000`：远程旧站文件读取超时，默认 8 秒；线路快照会并行读取各旧数据源，公开交通和地图相关 API 会对旧数据派生结果做短 TTL 进程内缓存和进行中请求合并，避免本地开发站点因重复拉取/解析旧数据被拖慢。
- `YCT_FLIGHT_DATA_URL=https://haojin.guanmu233.cn/data/flight_data.txt`：默认航班文本数据源；迁移到 YCT 后台或其他服务器时可替换为新的同格式 URL。
- `YCT_TRAVEL_SERVICE_PROFILE_STORE_PATH=.yct-data/travel-service-profile-store.json`：统一班次/票务服务 Profile 本地仓储路径，维护客运大巴、轮渡、航班等可排班服务的名称、颜色、图标、排序和启用状态。
- `YCT_TICKETING_CATALOG_STORE_PATH=.yct-data/ticketing-catalog-store.json`：统一票务目录本地仓储路径，第一版只读取真实配置的票种和库存池用于可售性预检；没有配置时返回不可售原因，不生成默认票种或模拟库存。
- `YCT_TICKET_ORDER_STORE_PATH=.yct-data/ticket-order-store.json`：统一票务订单草稿与库存占用的本地仓储路径；第一版只在真实 `ldpass` Active 用户、真实票种和真实库存池都存在时写入 `draft` 订单，不承载真实票券或核销凭证。
- `YCT_EVENT_OUTBOX_STORE_PATH=.yct-data/event-outbox-store.json`：单机开发阶段的领域事件 Outbox 本地仓储路径；当前用于持久化事件审计、连接共享内存事件总线，并支持通过 `/api/internal/events/process` 重放待处理或失败事件，后续替换为数据库 Transactional Outbox。
- `YCT_PUSH_DELIVERY_STORE_PATH=.yct-data/push-delivery-store.json`：账号侧行程提醒触发的 Push 投递队列和送达审计本地仓储路径。
- `YCT_INTERNAL_TASK_RUN_STORE_PATH=.yct-data/internal-task-run-store.json`：统一内部任务结果摘要的本地仓储路径；当前会保留最近数轮轻量历史（默认 8 条，不保存整份通知明细），后台“运营提醒投递预览”会读取它来回显最近一次以及最近几次手动或定时运行的公告同步、事件重放、通知处理和票务清理结果。
- `YCT_WEB_PUSH_PUBLIC_KEY` / `NEXT_PUBLIC_YCT_WEB_PUSH_PUBLIC_KEY`、`YCT_WEB_PUSH_PRIVATE_KEY`、`YCT_WEB_PUSH_SUBJECT`：服务端 Web Push VAPID 配置；缺少任一项时内部投递任务只会延后队列并记录原因，不会伪造已送达。
- `NEXT_PUBLIC_YCT_PUSH_DEFAULT_ENABLED_TYPES` / `YCT_PUSH_DEFAULT_ENABLED_TYPES=trip,operations,ticket,check_in`：账号页和服务端新用户通知偏好的默认预选类型，留空或无有效项时默认四类都预选。
- `YCT_PUSH_DELIVERY_MIN_INTERVAL_MS=300000`：同一用户同一通知类型的服务端 Push 最小投递间隔，默认 5 分钟；设为 `0` 可关闭该开发期限频策略。
- `YCT_INTERNAL_TASK_TOKEN`：内部任务接口 `/api/internal/events/process`、`/api/internal/notifications/process`、`/api/internal/operations/reminders/sync` 与统一 runner `/api/internal/tasks/run` 的调用令牌；统一 runner 现在会先同步旧客运公告源、在发现公告签名变化时请求重算运营提醒投递，然后重放事件 Outbox、处理到期 Push 投递队列，并清理过期票务占座。
- `YCT_CONTENT_ASSET_UPLOAD_DIR=apps/web/public/content-assets`：内容后台上传素材的本地落盘目录；该目录属于运行时文件，不进入 Git，后续可替换为对象存储或共享资产目录。
- `YCT_LEGACY_ASSET_DOWNLOAD_REPORT_PATH=.yct-data/legacy-assets-download-report.json`：旧内容资源下载报告路径，供内容后台展示最近一次真实下载失败项；如果服务进程运行目录与下载脚本运行目录不同，需要显式配置到同一个报告文件。

只有在强制 `local` 但没有配置本地目录时，接口返回 `not_configured`。其他读取失败返回 `unavailable`。前台不得使用模拟内容或模拟线路数据。

## 4. 内容分类

旧站线上 `content_data.js` 当前分类已固定到首页 `category-strip`：

- `通知公告`
- `运营信息`
- `地铁运营`
- `公交运营`
- `有轨运营`

本地旧快照中曾出现 `网站公告`，新版也保留兼容入口，避免迁移旧快照时内容无分类可筛选。

首页分类过滤应按 `categoryId` 精确匹配，语义 `tags` 只作为搜索、推荐或跨模块标记的辅助信息。

旧内容标题中可能出现一个或多个 `|`。这些符号是旧项目用于分词断行的软断点，不是标题正文。迁移时应保留原始标题参与旧数据 `sourceId` 生成，但对外展示的 `title` 去掉 `|`，并额外输出标题分段用于前端插入 `<wbr>`。

旧 `content_data.js` 中的运营消息通常依赖外部链接承载正文，记录本身可以视为没有独立正文，或正文与 `summary` 完全相同。当前导入器只把 `summary` 作为旧消息 Markdown 候选；`link` 和 `image` 继续作为原始链接、封面或素材清单线索保留，不再自动拼入详情页正文，避免把外链索引误展示成完整文章。

## 5. 公交和地铁格式差异

旧数据中公共交通方式统一导入为 `TransitLine`，用 `mode` 区分 `metro`、`tram`、`bus`、`railway`、`coach` 等类型。为兼容公交、地铁、铁路和客运格式差异，导入结果同时保留：

- `stationSourceIds`：现有前台统计和起终点展示使用的站点 id 顺序。
- `stops`：线路和站点之间的停靠点级属性。

当前已兼容的差异：

- 公交 `bus_data.js` 顶层可能是对象表，不一定是数组。
- 公交停靠点可能带 `oneWay: "up" | "down"`，用于表示单向停靠；旧数据中 `down` 表示与数据记载站序相同的方向，`up` 表示与数据记载站序相反的方向。
- 公交停靠点可能带 `status`，例如暂未启用。
- 公交 `operator` 可能是字符串或字符串数组；数组会合并为文本。
- 公交 `fare` 可能是字符串或数字；数字会转为 `N元` 文本。
- 地铁/有轨停靠点可能带 `travelTime`、`platformSide`、`fareZone`、`labelOffset`、`trainPosition`。
- 地铁/有轨的 `coordinates.x/y` 只作为线网图坐标保存到 `diagramX/diagramY`，不等同于 Minecraft 世界坐标。
- 地方铁路 `local_railway_data.js` 当前结构与地铁/有轨相近，但没有颜色、票价和运营方，导入时保留为空，不补假字段。
- 客运 `ltcx/route.txt` 是按 `[班次]` 分块的班次文本。迁移时按“线路名 + 途径站”聚合为 `coach` 模式的 `TransitLine`，将多个发车时间保存到 `departureTimes`，同时保留 `firstLastBus`、`fare`、`operator`、`bookingUrl`。
- 旧客运数据中的历史站名别名会统一规范化展示，例如 `临东站（SB站）` 会映射为 `临东站汽车客运枢纽站`；导入层和读取层都会兜底处理，避免线路概览、地图线路型 POI、班次卡片出现不同名称。
- 客运大屏逐班次同样来自 `ltcx/route.txt`，但会通过 `parseLegacyCoachScreenTripSource` 保留 `tripId`、`departureTime`、`lineName`、`stationNames`、`fare`、`operator`、`bookingUrl` 和可选 `runtimeText`，避免大屏所需的班次粒度被线路聚合丢掉。
- 客运 `ltcx/stop.txt` 是按 `[时段]` / `[原因]` 分块的公告文本。迁移为 `TransitServiceNotice`，保留 `periodText` 与 `reason`，能解析 `YYYY 年 M 月 D 日 HH:mm-HH:mm` 时生成 `startsAt` / `endsAt`。
- 客运大屏 `station.txt` 是两行一组的 `站点编号 / 站名`；`tickets.txt` 和 `rttime.txt` 是 `[字段] 值` 分块文本。检票口按 `车站 + 线路` 匹配，运行时间按 `线路 + 区间` 匹配，`减价` 保留为文本，暂不在 YCT 内推导真实票价规则。
- 地铁站点详情 `metro_station_detail.js` 使用 `window.stationDetail = [...]` 暴露数据，导入时会先转换为受控变量再读取，不创建浏览器 `window` 对象。站点可引用 `stationTemplate`，迁移器会把模板中的楼层和设施展开到每个站点详情，再叠加站点自身的换乘、出入口和周边站。

## 6. 图片和旧页面资源

旧内容中存在大量相对链接，例如 `../data/content_banner/...`、`../content/res/...`、`../content/*.html`。迁移时使用 `https://yct.shangxiaoguan.top` 作为旧站基准域名解析相对地址。

当前运行时已经支持：

- 将旧图片相对路径解析为旧站绝对来源 URL。
- 记录相对图片未来迁移到 `/legacy-assets/...` 的目标路径，便于后续同站托管。
- 在批量资源下载完成前，前台封面可回退旧站绝对来源 URL，避免新版预览出现缺图；下载完成后优先使用同站 `/legacy-assets/...` 路径。
- 在内容详情中保留旧图片来源和原始链接信息。
- 通过 `/api/operations/legacy-assets` 生成旧内容资源清单：扫描 `content_data.js` 中的封面图和站内链接，对 `/content/*.html` 旧专题页继续扫描 `src`、`href` 与 CSS `url(...)` 引用，输出旧站 URL、未来迁移路径和是否为下载候选。
- 旧内容资源清单同时输出正式差异报告字段：`summary` 记录原始引用数、唯一引用数、外链数、非下载项、本地缺失文件、重复引用和重复资源数量；`issues` 逐条列出外链、非下载候选、缺少迁移目标、本地缺失文件、重复引用和重复资源；`duplicateResources` 记录同一资源被多个内容复用的条目，便于后续去重迁移。
- 通过 `pnpm legacy:assets:download` 下载清单中的下载候选到 `apps/web/public/legacy-assets`，并写入 `.yct-data/legacy-assets-download-report.json`，记录大小、SHA-256、Content-Type 和失败项。该命令可重复运行，远端内容未变化时不会重写文件。
- 下载报告会同步写入 `differenceReport`，合并当前资源清单摘要、issue 统计、重复资源分组和真实下载失败项；`.yct-data` 仍属于运行报告目录，不进入仓库。
- 内容后台 `/admin/operations` 已接入旧资源差异报告，只读展示引用总数、下载候选、外链、本地缺失、真实下载失败、issue 分类、重复资源样例和下载失败样例；后台 API 会校验管理员身份，并从 `YCT_LEGACY_ASSET_DOWNLOAD_REPORT_PATH` 指向的路径读取最近一次下载报告，默认读取 `.yct-data/legacy-assets-download-report.json`。
- 内容后台 `/admin/operations` 已接入旧专题正文迁移预览：服务端读取旧 `content/*.html`，优先提取 `.content-container` 正文区域，保守转换为 Markdown 候选并展示页面数、图片数、链接数和转换提示；管理员可把单个旧专题载入内容编辑器后创建草稿，后续仍走提交审核、素材审核和发布流程。
- 内容后台会基于旧资源清单和下载报告生成只读 `LegacyContentAssetInventory`：每条素材记录保留旧站来源 URL、迁移后公开路径、SHA-256、Content-Type、文件大小、待审核状态、引用的旧内容和引用类型；同一下载项被多个内容复用时只生成一条素材记录。
- 已迁移资源的去重分两层记录：`sourceUrl + migratedPath` 相同的重复引用直接复用同一素材记录，`summary.reusedAssetCount` 和 `summary.deduplicatedReferenceCount` 记录复用规模；SHA-256 相同但下载项不同的资源进入 `duplicateGroups`，供正式素材入库前二次去重。
- 内容后台可以把旧内容素材清单导入 `.yct-data/content-asset-store.json`，导入后每条素材进入 `pending_review` 状态；管理员审核通过或驳回时分别发布 `ContentAssetReviewed` 事件。内容发布时会读取真实素材状态，只有全部素材为 `approved` 时才允许带 `assetIds` 的内容发布。
- 内容后台可以上传新内容素材到 `apps/web/public/content-assets`，文件名按 SHA-256 稳定生成，业务记录仍进入 `.yct-data/content-asset-store.json` 的 `pending_review` 状态；同 SHA-256 文件重复上传会复用已有素材记录，不额外生成重复素材。运行时上传目录可通过 `YCT_CONTENT_ASSET_UPLOAD_DIR` 调整，该目录默认不进入 Git。
- 创建内容草稿时会扫描 Markdown 图片中的同站 `/content-assets/...` 和 `/legacy-assets/...` 链接，并把匹配到的素材记录自动合并进 `assetIds`；临时反代使用的 `/v2/content-assets/...` 与 `/v2/legacy-assets/...` 也会归一化为同一个素材路径。
- 旧内容封面和 `原始图片：...` Markdown 引用在运行时会先检查本地 `/legacy-assets/...` 文件是否存在；存在则使用同站资源，不存在则回退旧站绝对 URL，避免资源下载未完成时出现破图。临时 `/v2` 子路径只用于浏览器公开路径，落盘检查和下载目标仍映射到 `apps/web/public/legacy-assets`。
- 当前实测资源清单包含 131 个原始引用、122 个唯一引用、91 个下载候选引用、18 个外链引用、31 个非下载项、9 个重复引用和 12 组重复资源；本地缺失文件为 0。按 `sourceUrl + migratedPath` 去重后实际下载并生成 61 条素材记录，复用 30 个重复内容引用，SHA-256 缺失 0，真实哈希重复组 0。首次下载结果为 61 个成功、0 个失败、总大小 72,256,470 字节；二次运行结果为 61 个未变化、0 个失败，证明脚本可以复跑。

旧内容图片字段需要兼容的特殊情况：

- 旧数据里可能把语义色变量名、CSS 变量或颜色值直接写在原本应表示图片链接的字段里，用来表达卡片背景色或分类语义色。
- 迁移器需要区分“可下载图片 URL / 相对图片路径”和“颜色 token / CSS 变量 / 色值”，不能把颜色 token 当作图片下载。
- 旧内容 Markdown 中的 `原始图片：...` 只保留真实图片路径；`--bus-color`、`var(...)`、`#RRGGBB` 等颜色值只作为封面色处理，不再生成详情页图片块。
- 颜色类值应迁移为 `coverColorToken` 或等价字段；只有真实图片路径才进入素材下载、哈希校验和审核流程。
- 当前前台若出现 `feed-item-cover` 未加载图片，需要优先排查旧字段是否被识别成颜色 fallback、图片源 URL 是否解析成功，以及封面组件是否真正使用图片而不是只渲染背景色。

仍需要补齐的批量迁移能力：

- 将本地 `.yct-data/content-asset-store.json` 迁移到正式数据库素材表，并把 `apps/web/public/content-assets` 迁移到正式对象存储或服务器共享资产目录。
- 素材替换、归档或删除后的内容引用回写、审计记录和回滚策略。

## 7. 已验证结果

命令：

```powershell
pnpm legacy:inspect
```

当前默认远程旧站验证结果：

```json
{
  "dataSource": "https://yct.shangxiaoguan.top/data",
  "sourceKind": "remote",
  "content": {
    "count": 34,
    "categories": {
      "通知公告": 8,
      "地铁运营": 4,
      "运营信息": 2,
      "有轨运营": 3,
      "公交运营": 17
    }
  },
  "metro": {
    "lineCount": 4,
    "stationCount": 28,
    "stopMetadataCount": 33
  },
  "tram": {
    "lineCount": 3,
    "stationCount": 10,
    "stopMetadataCount": 20
  },
  "bus": {
    "lineCount": 56,
    "stationCount": 364,
    "stopMetadataCount": 166,
    "oneWayStopCount": 104,
    "statusStopCount": 2
  },
  "railway": {
    "lineCount": 1,
    "stationCount": 10,
    "stopMetadataCount": 0
  },
  "coach": {
    "lineCount": 19,
    "stationCount": 11,
    "stopMetadataCount": 0
  },
  "coachNotices": {
    "count": 5,
    "firstPeriod": "2025 年 1 月 28 日 12:00-23:59"
  },
  "metroStationDetails": {
    "count": 32,
    "firstLine": "1号线",
    "firstStation": "临北路",
    "firstExitCount": 2,
    "firstFacilityCount": 6
  },
  "coachScreen": {
    "stationCount": 12,
    "tripCount": 365,
    "gateCount": 15,
    "runtimeSegmentCount": 12,
    "noticeLength": 350
  },
  "legacyAssets": {
    "contentCount": 34,
    "pageCount": 4,
    "referenceCount": 104,
    "downloadableCount": 91
  }
}
```

也可以传入本地旧项目 `data` 目录或其他远程 data URL：

```powershell
pnpm legacy:inspect C:\path\to\old-yct\data
pnpm legacy:inspect https://yct.shangxiaoguan.top/data
```

## 8. 待补充

- 图片素材正式入库后的审批动作、引用回写和回滚策略。
- 旧专题 HTML 归档附件、差异对比和回滚策略。
