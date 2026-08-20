# YCT 生产服务器配置运行手册

本文档供服务器侧 Codex CLI、运维人员和后续部署任务使用。目标站点为
`https://yct.shangxiaoguan.top`，当前工程默认假设 Windows Server + PowerShell +
Nginx/宝塔反向代理 + Node.js standalone。

这是一份“先核对、再修改、可回滚”的运行手册，不是密钥清单。生产密钥、票价、
设备编号和临东通后台配置必须由运营方提供；禁止根据示例值、历史聊天记录或代码默认值
自行猜测。

## 给服务器 Codex CLI 的硬性规则

执行任何部署、配置或重启任务前，必须先完整阅读本文，并遵守以下规则：

1. 用户没有明确要求时，不打包、不替换线上目录、不重启 Web、不重跑迁移。
2. 先只读检查当前进程、端口、反向代理、环境文件和运行时数据，再提出变更计划。
3. 不打印或提交 `LDPASS_*`、`YCT_*_TOKEN`、VAPID 私钥、Webhook Secret、Cookie 或完整 `.env`。
   检查时只输出“已配置/缺失/来源文件”和脱敏后的 URL。
4. 缺少真实密钥、真实票价或真实设备配置时必须停在“待运营方提供”，不能生成占位值上线。
5. 任何替换前都要先停止 Web 进程和位置采集器，并把旧目录的环境文件、运行时数据和上传素材
   复制到带时间戳的备份目录。备份成功且可读后，才允许替换代码。
6. 一次只做一个可回滚变更。变更后必须检查健康接口、构建号、回调地址、关键 API 和数据路径；
   任一项失败就停止继续操作并回滚。
7. 当前 YCT 的本地 JSON 仓储和事件 Outbox 是单实例 MVP。不得启动两个 Web 实例、两个内部任务
   调度器或两个位置采集器共同写同一份 `.yct-data`。
8. 旧 WordPress、旧 `content_data.js` 和旧资源已经迁移过的服务器，禁止再次执行一次性迁移脚本。
   只允许在用户明确授权、完成备份并确认幂等策略后执行迁移。
9. Material Symbols 的元数据文件和本地 SVG 目录必须成组备份、恢复；不得只复制其中一项，也不得
   在多实例的独立本地磁盘上分别生成同名图标。

## 先确认线上实际形态

代码仓库的根路径迁移方案使用：

| 项目           | 当前期望                                                        | 说明                                                                                                                          |
| -------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 公网地址       | `https://yct.shangxiaoguan.top`                                 | 生产 `YCT_PUBLIC_SITE_URL` 应使用这个站点根，不附加 `/v2`。                                                                   |
| Node 监听      | `127.0.0.1:3300`                                                | 以实际进程和 Nginx 配置为准，不要假设端口。                                                                                   |
| 稳定部署根目录 | `C:\wwwroot\yct-v2`                                             | 以服务器实际目录为准；不能把 `wwwroot` 总目录当作目标根。                                                                     |
| BasePath       | 根路径时为空，命令行可传 `/`                                    | 构建、启动、反代三者必须一致；若线上仍在 `/v2`，先读 [ROOT_PATH_MIGRATION.md](./ROOT_PATH_MIGRATION.md)，不要直接改成根路径。 |
| 运行时数据     | `.yct-data`、`runtime-assets`、`apps\web\public\content-assets` | 必须与代码目录分开保护，发版不得清空。                                                                                        |

服务器 CLI 必须通过只读命令确认实际状态，例如：

```powershell
$deployRoot = 'C:\wwwroot\yct-v2'
Get-ChildItem -LiteralPath $deployRoot -Force
Get-NetTCPConnection -State Listen -LocalPort 3300 -ErrorAction SilentlyContinue
Get-Process node -ErrorAction SilentlyContinue | Select-Object Id,Path,StartTime
```

如果实际目录、端口或 BasePath 不同，应在执行报告中明确写出，不要默默套用上表。

## 生产环境变量基线

真实环境文件应放在部署根目录，与 `start-yct-web.ps1` 和 `.yct-data` 同级，不要放在
`apps\web` 内。启动器按以下顺序加载，后者覆盖前者：

```text
.env -> .env.production -> .env.local -> .env.production.local
```

`merge-yct-env.ps1` 只能补齐缺失键，不会替换已有值。服务端 CLI 不得因为示例文件有默认值，
就覆盖生产已有值。

### 站点、反代和登录

生产根路径的最小基线如下，值仍需以现场实际为准：

```dotenv
YCT_PUBLIC_SITE_URL=https://yct.shangxiaoguan.top
NEXT_PUBLIC_YCT_BASE_PATH=
YCT_BASE_PATH=
LDPASS_BASE_URL=https://ldpass.shangxiaoguan.top
LDPASS_CLIENT_ID=yuchengtong
```

要求：

- `LDPASS_BASE_URL` 只写临东通站点 Origin，不加 `/api`、`/login`、查询参数或业务路径。
- `LDPASS_CLIENT_ID` 必须是临东通后台已启用并绑定到 `yct` 发卡方的应用。
- Nginx 必须把 `Host`、`X-Forwarded-Host`、`X-Forwarded-Proto` 和外部端口正确传给 Node。
  内部 `3300` 不能被拼进公网回调地址。
- `robots.txt`、`sitemap.xml`、`llms.txt`、`/api/v1/public` 和 `/api/v1/public/openapi` 必须由同一个 Next standalone 实例提供，不能回落到旧静态站。公共 API 的 canonical URL 必须使用当前公网 Origin 和 BasePath。
- 公共 API 必须保留应用返回的 CORS、短缓存和 `X-Robots-Tag: noindex` 响应头。反代可以增加限流和访问日志，但不能改写查询参数或 `data/meta` 响应结构。
- 根路径部署时回调应为：
  `https://yct.shangxiaoguan.top/auth/ldpass/callback`。
  `/v2/auth/ldpass/callback` 只属于旧的 `/v2` 挂载，不得混用。
- 临东通生产环境必须共享 `.shangxiaoguan.top` 范围的登录 Cookie；否则 YCT 能跳转但读不到
  临东通会话。Cookie 域配置属于临东通服务器，不是 YCT `.env` 能替代的。

### Web Push

服务端真实发送需要同时具备三项：

```dotenv
YCT_WEB_PUSH_SUBJECT=mailto:<运营方提供的联系地址>
YCT_WEB_PUSH_PUBLIC_KEY=<VAPID public key>
YCT_WEB_PUSH_PRIVATE_KEY=<VAPID private key>
```

浏览器订阅还需要：

```dotenv
NEXT_PUBLIC_YCT_WEB_PUSH_PUBLIC_KEY=<同一把 VAPID public key>
NEXT_PUBLIC_YCT_PUSH_DEFAULT_ENABLED_TYPES=trip,operations,ticket,check_in
YCT_PUSH_DEFAULT_ENABLED_TYPES=trip,operations,ticket,check_in
YCT_PUSH_DELIVERY_MIN_INTERVAL_MS=300000
```

关键注意事项：

- `NEXT_PUBLIC_YCT_WEB_PUSH_PUBLIC_KEY` 和 `NEXT_PUBLIC_YCT_PUSH_DEFAULT_ENABLED_TYPES` 会被
  Next.js 编译进浏览器 JavaScript。只修改线上 `.env` 不会改变已经生成的客户端包，必须在正确
  的构建环境中重新构建并部署，才能让账号页显示可用的订阅公钥。
- `YCT_WEB_PUSH_PRIVATE_KEY` 只能留在服务器运行时环境，绝不能写入 `NEXT_PUBLIC_*` 或部署包。
- 三个 VAPID 值必须属于同一对密钥；更换密钥会让旧浏览器订阅失效，应安排重新订阅，不能只替换
  私钥。
- 缺少任一项时，系统会返回 `web_push_not_configured`，投递会延后并记录原因，不会伪造“已送达”。
- 推送队列和订阅数据默认位于：
  `.yct-data/push-delivery-store.json`、`.yct-data/push-subscription-store.json`、
  `.yct-data/notification-preference-store.json`，发版必须保留。

### 临东通乘车码和设备网关

YCT 侧至少需要以下真实配置：

```dotenv
LDPASS_YCT_PROVIDER_API_KEY=<属于 yct 发卡方的服务端密钥>
LDPASS_RIDE_CODE_MAXIMUM_FARE=<运营方确认的单次最高票价>
LDPASS_RIDE_CODE_VERIFICATION_METHOD=pin
LDPASS_RIDE_CODE_EXPIRES_IN_SECONDS=120
LDPASS_RIDE_CODE_AUTHORIZATION_EXPIRES_IN_SECONDS=14400
LDPASS_RIDE_WEBHOOK_SECRET=<临东通后台生成的 Webhook Secret>
YCT_RIDE_GATEWAY_TOKEN=<设备网关和 YCT 共用的长随机密钥>
```

同时必须完成临东通后台配置：

- Provider slug 必须是 `yct` 且处于 Active。
- API Key 只授予乘车码文档中列出的 `action_links:create`、`ride_authorizations:*` 权限。
- Webhook 地址必须使用公网 HTTPS：
  `https://yct.shangxiaoguan.top/api/internal/ride-code/ldpass-webhook`。
- 订阅 `RideAuthorizationGranted`、`RideAuthorizationEntered`、`RideAuthorizationCaptured`、
  `RideAuthorizationReleased`，并把一次性 Secret 写入 YCT。
- `.yct-data/ride-gate-config.json` 必须登记真实进站/出站设备、站点、`fareProfileId` 和站间票价。
  进出站设备的 `fareProfileId` 必须一致，票价不得超过最高票价。
- LiteLoaderBDS 插件的 `gatewayToken` 必须与 `YCT_RIDE_GATEWAY_TOKEN` 完全一致，且只指向 HTTPS
  的 YCT 网关。不能用客户端输入的玩家名代替命令执行上下文中的真实玩家。

完整事件、状态机、JSON 格式和插件安装步骤以 [RIDE_CODE_GATEWAY.md](./RIDE_CODE_GATEWAY.md) 为准。
没有真实卡、测试账号、设备和票价前，不得在生产执行扣款验收。

### 内部任务、旧数据和地图外部源

```dotenv
YCT_INTERNAL_TASK_TOKEN=<长随机内部任务令牌>
YCT_LEGACY_DATA_SOURCE=remote
YCT_LEGACY_DATA_REMOTE_BASE_URL=https://yct.shangxiaoguan.top/data
YCT_LEGACY_PUBLIC_BASE_URL=https://yct.shangxiaoguan.top
YCT_FLIGHT_DATA_URL=https://haojin.guanmu233.cn/data/flight_data.txt
YCT_UNMINED_MAP_BASE_URL=https://map.shangxiaoguan.top/
YCT_MARKER_BDSLM_BASE_URL=http://ld.cmsy.xyz:19136
YCT_MAP_MARKER_PUBLIC_SNAPSHOT_STORE_PATH=.yct-data/map-marker-public-snapshot.json
YCT_MAP_SHARE_LINK_STORE_PATH=.yct-data/map-share-links.json
```

- `YCT_INTERNAL_TASK_TOKEN` 同时保护事件重放、Push 处理、运营提醒同步、统一任务入口和玩家位置
  采集入口。定时任务和 Web 必须使用同一值；缺失时任务应保持关闭，而不是删除鉴权。
- 旧数据已经迁移到本地仓储后，`YCT_LEGACY_DATA_SOURCE` 应以现场迁移方案为准。不要因为远程旧站
  可访问就自动重跑导入；迁移文档中的“一次性迁移”只能人工确认后执行。
- `YCT_MARKER_BDSLM_BASE_URL`、瓦片地址和航班地址属于外部依赖。修改前先用只读 HTTP 请求确认
  目标确实返回当前格式，不得用模拟数据掩盖源站故障。
- `YCT_MAP_MARKER_PUBLIC_SNAPSHOT_STORE_PATH` 和 `YCT_MAP_SHARE_LINK_STORE_PATH` 属于持久运行数据，必须和 `.yct-data` 一起备份；不要把它们放入部署包。删除短链接仓储会使已分享的 `/s/<token>` 失效。

### Material Symbols 动态图标

后台可输入不在内置字体子集中的 Material Symbols 名称。预览和首次确认由服务端访问 Google Fonts，确认后转换为本地 SVG；公开页面只读取本站资产。生产基线为：

```dotenv
YCT_MATERIAL_SYMBOL_ASSET_STORE_PATH=.yct-data/material-symbol-asset-store.json
YCT_MATERIAL_SYMBOL_ASSET_DIR=runtime-assets/material-symbols
```

上线前必须确认：

- Web 进程身份可写入 `.yct-data` 和 `runtime-assets/material-symbols`。使用包内 `start-yct-web.ps1` 时会设置 `YCT_RUNTIME_ROOT`；若进程管理器直接启动 `apps\web\server.js`，必须显式设置同一个稳定的 `YCT_RUNTIME_ROOT`，或使用绝对路径。
- 服务器可以出站访问 `fonts.googleapis.com:443` 和 `fonts.gstatic.com:443`。这只影响后台预览和首次固化新图标；公开访客不应访问 Google 域名。
- 反向代理将当前 BasePath 下的 `/api/material-symbols/*` 和 `/api/admin/material-symbols/*` 转发给同一个 Next standalone 实例，且没有把公开本地 SVG 路由误设为管理员鉴权。
- `.yct-data/material-symbol-asset-store.json` 与 `runtime-assets/material-symbols` 纳入同一备份和恢复点。备份前停止 Web 和所有可能写入事件的任务，恢复后同时核对文件数量和可读性。
- 当前 JSON + 文件系统实现只允许单个 Web 写者。需要多实例时，先把元数据迁到带唯一约束的共享数据库，把 SVG 迁到共享对象存储或共享只读卷，并确保只有一个幂等固化消费者；不能依赖各实例本地磁盘自动同步。

可先做不含密钥的连通性检查：

```powershell
Test-NetConnection 'fonts.googleapis.com' -Port 443
Test-NetConnection 'fonts.gstatic.com' -Port 443
```

发布后使用真实管理员会话预览并确认一个新图标，确认 JSON 和 SVG 目录同步新增内容，再从公网页面检查本站 `/api/material-symbols/<iconName>` 返回 `image/svg+xml`。Google Fonts 故障时，既有本地 SVG 与内置字体仍应可用；新图标预览失败时不得手工修改 JSON 冒充确认成功。

## 配置检查和验收顺序

以下命令只读，不会打印密钥。根路径部署用 `/`；旧 `/v2` 部署必须把所有命令的 BasePath 改为
`v2`，不要传空字符串：

```powershell
Set-Location 'C:\wwwroot\yct-v2'
pwsh -NoProfile -ExecutionPolicy Bypass `
  -File '.\check-runtime-config.ps1' `
  -BasePath '/' `
  -Json
```

检查结果至少应满足：

- `YCT_PUBLIC_SITE_URL` 是公网 HTTPS 根地址，不是 `localhost`、`127.0.0.1` 或带 `/v2` 的地址。
- `LDPASS_BASE_URL` 和 `LDPASS_CLIENT_ID` 均为 set。
- 推导回调是当前真实挂载路径下的 `/auth/ldpass/callback`。
- 没有“process.env 覆盖 `.env` 且值不同”的告警。若有，先重启进程管理器或清除旧环境变量。

然后从服务器内网和公网分别检查构建及反代：

```powershell
$stamp = Get-Date -Format yyyyMMddHHmmss
Invoke-WebRequest "http://127.0.0.1:3300/api/health?check=$stamp" -UseBasicParsing |
  Select-Object -ExpandProperty Content
Invoke-WebRequest "https://yct.shangxiaoguan.top/api/health?check=$stamp" -UseBasicParsing |
  Select-Object -ExpandProperty Content
Invoke-WebRequest "https://yct.shangxiaoguan.top/auth/ldpass/callback?state=test" -UseBasicParsing |
  Select-Object StatusCode,Headers

pwsh -NoProfile -ExecutionPolicy Bypass `
  -File '.\check-yct-web-smoke.ps1' `
  -Origin 'https://yct.shangxiaoguan.top' `
  -BasePath '/'
```

公网和内网的 `/api/health` 应指向同一构建号；回调测试可以返回应用自己的状态错误或 302，但不能是
Nginx 404。若线上仍为 `/v2`，将地址替换为 `/v2/api/health`、`/v2/auth/ldpass/callback`。

### Push 验收

1. 在一个真实的 Active 临东通测试账号中打开账号设置，确认浏览器能够读取 VAPID 公钥并登记订阅。
2. 登录后检查 `/api/account/push-subscriptions` 和 `/api/account/push-preferences` 的返回状态；不要
   直接改 JSON 仓储伪造订阅。
3. 用真实 `YCT_INTERNAL_TASK_TOKEN` 调用统一任务脚本：

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass `
  -File '.\run-yct-internal-tasks.ps1' `
  -Origin 'http://127.0.0.1:3300' `
  -BasePath '/' `
  -TaskToken '<从安全存储读取，不要写入脚本>'
```

响应中如果出现 `web_push_not_configured`、缺少 VAPID 或持续 `deferred`，不要宣称推送已恢复。
统一任务应只运行一个实例；可用 Windows 任务计划程序按 1--5 分钟执行。
统一任务还会后台刷新公开地图快照；如果地图外部源不可用，先保留最近一次成功快照并检查其 `asOf`，不要让 AI 请求直接承担外部源超时。

### 临东通验收

1. 先用 `check-runtime-config.ps1` 和 `/api/auth/ldpass/start` 验证回跳地址不含内网主机、`3300` 或错误
   BasePath。
2. 在临东通后台确认 `client_id`、`yct` Provider、API 权限和 Webhook Secret 完全对应。
3. 只用运营方提供的测试账号、测试卡和测试设备执行一次完整的“授权 -> 进站冻结 -> 出站结算 ->
   Webhook 同步”验收。
4. 重复同一个设备事件和重复 Webhook，结果必须幂等；未登记设备、缺票价、超最高票价必须拒绝且不扣款。

## 发版和数据保护协议

用户没有明确要求发版时，服务器 CLI 只做上面的检查。明确要求发版后仍必须遵守：

1. 在新包目录完成校验后再操作，源目录与 `C:\wwwroot\yct-v2` 不能相同，也不能互相嵌套。
2. 停止 Web、内部任务和位置采集器，确认没有进程继续写 `.yct-data`。
3. 用 `deploy-yct-web.ps1` 替换；根路径参数传 `-BasePath '/'`，不要传空字符串。脚本会保留并校验：
   `.env*`、`.yct-data`、`runtime-assets`、`apps\web\public\content-assets`。
4. Material Symbols 已投入使用后，要额外确认 `.yct-data/material-symbol-asset-store.json` 与
   `runtime-assets/material-symbols` 均出现在同一个备份及恢复结果中。
5. 部署后先启动单个 Web，再跑配置检查、内网健康、公网健康和烟雾检查；通过后再恢复定时任务。
   使用真实管理员确认一个新动态图标，并检查公开 SVG 路由仍由当前构建提供。
6. 将本次构建号、备份目录、配置检查摘要、健康接口结果和未完成项写入发布记录，不写密钥。

禁止以下操作：

- 直接把 zip 解压覆盖旧 `.next`、`server.js` 或运行目录。
- 删除 `.yct-data`、`runtime-assets`、内容上传素材或环境文件来“解决配置问题”。
- 把生产 `.env`、VAPID 私钥、临东通 API Key、Webhook Secret 或设备网关 Token 提交 GitHub。
- 以 `-BasePath ''` 传参；PowerShell 会把它解释为缺少参数，根路径请使用 `/`，脚本内部会归一化为空路径。
- 在没有确认数据备份和回滚路径时执行一次性迁移、密钥轮换或票价变更。

## 回滚条件

出现以下任一情况立即停止后续任务并回滚到最近一次可验证备份：

- 内外网健康接口构建号不一致，或返回 404/502。
- 页面、API、`_next/static` 或 `sw.js` 不是同一次构建。
- ldpass 回调落到 `localhost`、`127.0.0.1`、内部端口或错误 BasePath。
- A+B 公共入口返回 404，公共 API canonical URL 指向内网，或 CORS、缓存、`X-Robots-Tag` 验收失败。
- 账号页无法读取公钥，内部任务仍报告 `web_push_not_configured`。
- 临东通 Webhook 签名失败、设备事件拒绝原因不明或出现重复扣款风险。
- `.yct-data`、上传素材、旧内容或管理员文件数量/哈希异常。
- 已登记的 Material Symbols 本地路由返回 404/502，或元数据与 SVG 文件数量明显不一致。

回滚时只恢复已验证的代码包和数据备份，不要用“重新跑迁移”代替回滚。完成后重新执行本手册的
配置检查和健康验收。

## 给后续任务的报告格式

服务器 Codex CLI 完成检查或变更后，必须报告：

```text
任务：<检查/配置/部署/回滚>
代码版本：<buildId 或 git commit>
部署根目录：<脱敏后的路径>
BasePath：<空路径或 /v2>
配置文件来源：<只写文件名，不写内容>
已配置：<键名列表>
缺失/待运营方提供：<键名列表>
数据备份：<目录、时间、校验结果>
健康检查：<内网/公网结果>
Push：<未配置/已登记/已处理/未验收>
临东通：<未配置/配置检查通过/测试验收通过>
回滚点：<备份目录或“不适用”>
未执行：<明确列出未打包、未重启、未迁移等事项>
```

本文件只描述服务器配置和运维边界；业务契约以代码和以下专项文档为准：

- [DEPLOYMENT.md](./DEPLOYMENT.md)
- [POST_MIGRATION_DEPLOYMENT.md](./POST_MIGRATION_DEPLOYMENT.md)
- [ROOT_PATH_MIGRATION.md](./ROOT_PATH_MIGRATION.md)
- [DATA_MIGRATION.md](./DATA_MIGRATION.md)
- [LDPASS_INTEGRATION.md](./LDPASS_INTEGRATION.md)
- [RIDE_CODE_GATEWAY.md](./RIDE_CODE_GATEWAY.md)
