# AI 接入基线

更新时间：2026-10-29

雨城通采用“A+B+D”的 AI 接入路线：先建设可发现的语义化页面和稳定公共只读 API，再通过 MCP 提供只读工具服务。当前不部署大模型、Embedding、向量数据库或站内 RAG Worker；问一问使用访问者自己配置的模型 Key。

## 当前公开边界

公共层只读取已经发布或明确公开的读模型，不读取草稿、审核记录、账号、后台、内部任务、票务订单和登录会话。

当前公共 API 入口：

| 能力               | 路径                              |
| ------------------ | --------------------------------- |
| API 目录           | `/api/v1/public`                  |
| OpenAPI            | `/api/v1/public/openapi`          |
| 运营内容           | `/api/v1/public/operations`       |
| 单条运营内容       | `/api/v1/public/operations/{id}`  |
| 服务目录           | `/api/v1/public/services`         |
| 公共交通概览       | `/api/v1/public/transit/overview` |
| 站内设施详情       | `/api/v1/public/transit/stations` |
| 地图地点和线路标记 | `/api/v1/public/map/markers`      |
| 地图路线规划       | `/api/v1/public/map/route-plan`   |
| 周边地点           | `/api/v1/public/map/nearby`       |
| 沿线地点           | `/api/v1/public/map/along-line`   |
| 班次查询           | `/api/v1/public/travel/schedules` |

公共响应统一使用 `data` 和 `meta`：

```ts
interface PublicApiMeta {
  apiVersion: 'v1';
  generatedAt: string;
  sourceStatus: 'ready' | 'not_configured' | 'unavailable';
  locale: 'zh-CN' | 'zh-Hant' | 'en';
  timezone: 'Asia/Shanghai';
  asOf?: string;
  canonicalUrl?: string;
  message?: string;
}

interface PublicApiErrorResponse {
  error: {
    code: 'not_found' | 'source_unavailable';
    message: string;
  };
  meta: PublicApiMeta;
}
```

AI 或第三方客户端处理时间敏感数据时，必须同时检查 `sourceStatus`、`generatedAt`、`asOf` 和 `timezone`，不能只根据正文作出“当前状态”判断。

## A 层：可发现性

当前提供：

- `/robots.txt`：允许公开页面，禁止账号、后台、认证和内部接口。
- `/sitemap.xml`：包含公开固定页面、已发布运营内容和交通线路详情。
- `/llms.txt`：提供页面、API 和 OpenAPI 的导航，不复制整库内容。
- 根布局 `WebSite` JSON-LD。
- 运营内容页 `Article` JSON-LD。
- FAQ 页 `FAQPage` JSON-LD。

`llms.txt` 只是辅助导航，不是事实源。时间敏感事实必须回到公共 API，并引用 `canonicalUrl`。

## B 层：公共只读 API

公共接口运行在现有 Next.js standalone 应用内，复用当前已发布读模型。默认响应使用短缓存和 `Access-Control-Allow-Origin: *`，但不会开放写入能力。

地图标记接口优先读取 `.yct-data/map-marker-public-snapshot.json` 中最近一次成功快照；`run-yct-internal-tasks.ps1` 会在后台刷新该快照，公开 AI 请求不会等待外部地图源的冷启动。响应中的 `asOf` 表示快照数据时间，不能把请求时间当成地图数据更新时间。

生产部署需要确认：

1. `YCT_PUBLIC_SITE_URL` 使用真实公网地址，不能是 `localhost` 或 `127.0.0.1`。
2. 反向代理保留正确的公网 Host 和 HTTPS 协议。
3. 公共 API 的限流、缓存和访问日志由 Nginx 或上游网关承担。
4. 普通发版继续保留 `.env*`、`.yct-data` 和上传素材，不把这些内容打进发布包。

部署包会把本文复制为根目录 `AI_ACCESS.md`，并附带 `check-yct-web-smoke.ps1`。生产启动后执行：

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass `
  -File '.\check-yct-web-smoke.ps1' `
  -Origin 'https://yct.shangxiaoguan.top' `
  -BasePath '/'
```

烟雾检查会验证 `robots.txt`、`sitemap.xml`、`llms.txt`、公共 API 目录和 OpenAPI，同时拦截以下配置错误：

- canonical URL 或文档 URL 指向本机、内网端口、错误域名或错误 BasePath。
- `robots.txt` 的 `Host` 或 `Sitemap` 指向 localhost、错误域名或错误 BasePath。
- 公共 API 缺少 `Access-Control-Allow-Origin: *`。
- 反代把公开短缓存覆盖成全局 `no-store`。
- 公共 JSON 接口缺少 `X-Robots-Tag: noindex`。
- 地图标记接口不是 HTTP 200，或无法返回 `apiVersion: v1`。

如果反代需要限流，应根据实际流量和服务器容量在 Nginx 或上游网关中配置，并保留查询参数、`data/meta` JSON 结构和应用响应头。没有确认容量前不要在部署模板中猜测固定限额。

## 事件边界

公共只读请求本身不发布领域事件。未来如果增加搜索索引或 MCP 审计，应由现有业务事件驱动监听器：

| 事件                           | 后续消费者               |
| ------------------------------ | ------------------------ |
| `ContentPublished`             | 更新运营内容索引         |
| `ContentArchived`              | 删除运营内容索引         |
| `EntityTranslationUpdated`     | 更新实体名称和别名索引   |
| `TransitDataRevisionPublished` | 更新线路、站点和拓扑索引 |
| `TravelSchedulePublished`      | 更新班次索引             |
| 对应的 POI 发布/更新事件       | 更新地图地点索引         |

监听器只能读取已发布投影并执行异步副作用，不能绕过审核直接改变公共数据。

## D：MCP（已实现）

`/api/mcp` 提供无状态、只读的 Streamable HTTP MCP 服务，与问一问共用同一份工具清单（`apps/web/lib/assistant/tools`），工具变更只注册一次，两端自动同步。

当前工具：

| 工具                      | 能力                                   |
| ------------------------- | -------------------------------------- |
| `search_places`           | 按名称或类别检索地图地点               |
| `search_transit`          | 检索公交/地铁线路与站点详情            |
| `nearby_places`           | 以地点为圆心的周边检索                 |
| `along_line_places`       | 线路沿线地点检索                       |
| `line_timetable`          | 线路首末班、上下行下一班与特殊班次标注 |
| `plan_journey`            | 按客运班次规划起终点换乘               |
| `plan_route`              | 地图路线规划（步行、打车、公共交通）   |
| `poi_notices`             | 地点当前生效的运营公告                 |
| `service_notices`         | 客运停运与调整公告                     |
| `network_health`          | 线网数据健康摘要                       |
| `search_wiki`             | 检索临东 Wiki，区分超时与无结果        |
| `list_material_templates` | 已发布的物料模板                       |
| `search_site_content`     | 运营公告、服务目录与 FAQ 检索          |
| `get_operation_detail`    | 按 ID 读取运营公告正文                 |
| `query_travel_schedules`  | 按站点、日期、类型浏览客运班次列表     |

约束：

- 匿名可用，不读取账号、后台、票务订单和登录会话，也没有写入能力。
- 协议版本为 `2025-06-18` / `2025-03-26` / `2024-11-05`，不支持 resources、prompts 和批量请求。
- 引用链接在 MCP 响应中会转换为绝对地址；`initialize` 的 instructions 会给出站点地址与 MCP 端点。
- 当前限流为进程内内存（来源 IP 每分钟 60 次）。多实例部署时应改由上游网关限流，或替换为共享存储实现，否则每个实例会独立计数。
- 工具复用已发布的读模型；`sourceStatus`、`asOf`、时区等时间语义仍以公共 API 或引用中的 `asOf` 为准。
