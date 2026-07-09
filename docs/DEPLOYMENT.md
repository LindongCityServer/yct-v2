# 雨城通 v2 部署说明

本文档记录当前 Next.js 版本的推荐部署流程，重点是减少云服务器构建时的内存和磁盘压力。

## 构建产物在哪里

直接运行：

```powershell
pnpm --filter @yct/web build
```

默认构建目录在：

```text
apps/web/.next
```

启用 `output: 'standalone'` 后，还会生成可部署运行目录：

```text
apps/web/.next/standalone
```

注意：`.next` 是构建输出和缓存目录，不建议手动整目录上传。推荐使用仓库提供的打包脚本生成部署包。

## 推荐流程

在本地开发机或 CI 上构建部署包：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/web-build-artifact.ps1 -BasePath v2
```

生成 `zip` 时脚本会优先使用 7-Zip，其次回退到 `tar.exe -a`，最后才使用 PowerShell `Compress-Archive`。如果 7-Zip 不在 PATH 或常见安装目录，可以显式指定：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/web-build-artifact.ps1 -BasePath v2 -SevenZipPath "C:\Program Files\7-Zip\7z.exe"
```

也可以通过环境变量复用同一路径：

```powershell
$env:YCT_7Z_PATH = "C:\Program Files\7-Zip\7z.exe"
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/web-build-artifact.ps1 -BasePath v2
```

如果没有可用的 7-Zip，且 zip 压缩在 Windows 上耗时过长或留下 0 字节临时文件，可以改用 `tar.gz`：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/web-build-artifact.ps1 -BasePath v2 -ArchiveFormat tar.gz
```

如果压缩本身仍然很慢，可以生成不压缩的 `tar` 包：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/web-build-artifact.ps1 -BasePath v2 -ArchiveFormat tar
```

如果上一次命令已经完成 staging，只是在归档阶段中断，可以复用 `.deploy/web` 直接重试归档：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/web-build-artifact.ps1 -BasePath v2 -ArchiveFormat zip -SkipBuild -SkipStaging
```

如果未来从 `/v2` 切回站点根路径，改为：

```powershell
pnpm web:artifact
```

也可以先设置环境变量，再使用快捷脚本：

```powershell
$env:YCT_DEPLOY_BASE_PATH = "v2"
pnpm web:artifact
```

脚本会：

- 运行 `@yct/web` 的生产构建。
- 使用 Next.js standalone 输出作为部署主体。
- 额外把 `deploy-yct-web.ps1`、`start-yct-web.ps1`、`init-yct-admin.ps1`、运行时配置检查、烟雾检查和统一任务脚本一起放进部署包根目录。
- 补齐 `apps/web/.next/static` 和 `apps/web/public`。
- 补齐 pnpm workspace 下 Next standalone 可能漏掉的 `@next/*`、`@swc/*` 等运行时依赖。
- 跳过本机上传素材目录 `apps/web/public/content-assets`。
- 不打包 `.env`、`.env.*`、`.yct-data`、日志和本地缓存。
- 在 `artifacts/` 下生成 `yct-web-时间戳.zip`、`yct-web-时间戳.tar.gz` 或 `yct-web-时间戳.tar`。
- 压缩时先写入临时文件，成功后再改名为最终产物，避免失败时留下看似可用的坏包。
- 在 Windows 上生成 zip 时优先使用 7-Zip，避免 `tar.exe -a` 或 `Compress-Archive` 处理大量文件时非常慢；需要更稳定的大包压缩时仍可使用 `tar.gz`。
- 支持 `-SkipBuild -SkipStaging` 复用已经完成的 `.deploy/web`，只重新生成归档文件。

如果只想验证当前 staging 目录里的 standalone 产物是否完整，而不重新压缩大包，可以使用：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/web-build-artifact.ps1 -BasePath v2 -SkipBuild -SkipStaging -ValidateOnly
```

该校验会检查 staged HTML/RSC 引用的 `_next/static`、图标、manifest 和 service worker 是否存在；当脚本本次重新生成 staging 时，还会检查 `apps/web/public/sw.js` 的 `YCT_SW_VERSION` 是否已经被改写为本次构建号。当 `BasePath` 为 `/v2` 时，也会拦截没有 `/v2` 前缀的同源静态资源链接。

## 云服务器运行

### 推荐目录布局

推荐把解压后的部署目录直接作为运行根目录，并把真实环境变量文件和运行时数据放在同一层级。以 `C:\wwwroot\yct-v2` 为例：

```text
C:\wwwroot\yct-v2\
├─ start-yct-web.ps1
├─ DEPLOYMENT.txt
├─ .env                         # 推荐放这里
├─ .env.production              # 如果你习惯拆环境文件，也放这里
├─ .yct-data\
├─ apps\
│  └─ web\
│     ├─ server.js
│     ├─ .next\
│     └─ public\
│        ├─ content-assets\     # 运行时上传素材，需要持久化
│        ├─ icons\
│        └─ legacy-assets\      # 如果打包机已有该目录，会随部署包进入
└─ package.json
```

`.env`、`.env.production`、`.env.local` 这类真实环境变量文件，推荐都放在部署根目录，也就是和 `start-yct-web.ps1`、`.yct-data` 同级，而不是放到 `apps\web` 里。这样当前备份/替换脚本、手工启动命令和绝大多数进程管理方式都更一致。当前部署包里的 `start-yct-web.ps1` 会在启动前主动读取部署根目录下这些 `.env*` 文件，再启动 Next standalone；这一步是为了绕开 Next standalone 运行时先切到 `apps\web` 工作目录、导致默认读不到部署根目录 `.env` 的问题。

如果后续改用 PM2、Windows 服务或宝塔守护进程，除了保留这些文件在部署根目录，还要确保“工作目录”就是部署根目录，或者把同样的环境变量显式写进进程管理器配置；不要假设进程管理器一定会自动读取某个 `.env` 文件。

如果你怀疑线上虽然有 `.env` 但应用仍提示 `ldpass_not_configured`，可以先在部署目录运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\check-runtime-config.ps1
```

如果当前实例通过启动参数挂载在 `/v2`，建议显式带上：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\check-runtime-config.ps1 -BasePath v2
```

如果你只是想在本地临时验证某个访问入口会生成什么回调地址，也可以额外传入实际访问的 Origin：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\check-runtime-config.ps1 -Origin http://localhost:3300 -BasePath v2
```

这个脚本会按生产环境优先级检查 `.env`、`.env.production`、`.env.local`、`.env.production.local`，只输出配置项是否存在、来源文件、推导出的回调地址和告警，不会打印敏感值。部署包根目录也会附带同名脚本，解压后无需依赖仓库源码或 `tsx`。

如果需要在只有 standalone 部署包、没有 pnpm 的服务器上指定首位或追加雨城通管理员，可在部署根目录运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\init-yct-admin.ps1 -LdpassUserId "<ldpassUserId>"
```

脚本默认写入 `.yct-data\admin-memberships.json`；如果配置了 `YCT_ADMIN_STORE_PATH`，则写入该变量指向的管理员成员文件。这个文件属于运行时数据，替换部署包时要随 `.yct-data` 一起保留，不要提交到 GitHub。

如果是在源码目录而不是 standalone 包内操作，`pnpm admin:init <ldpassUserId>` 和 `npm run admin:init -- <ldpassUserId>` 都可以；不要使用 `npm admin:init <ldpassUserId>`，那会被 npm 当成不存在的内置命令。

如果当前重点是在排查 `ldpass` 登录回跳是否仍落到 `localhost:3300`，建议在启动前后都做这两个最小检查：

1. 运行 `check-runtime-config.ps1`，确认推导出的 `redirect_uri` 是 `https://yct.shangxiaoguan.top/v2/auth/ldpass/callback` 而不是 `localhost:3300`。
2. 启动后直接访问 `https://yct.shangxiaoguan.top/v2/auth/ldpass/callback?state=test`：
   - 如果能被 302 回账号页，说明应用路由和反代都接通了。
   - 如果这里是 404，说明 `/v2/auth/ldpass/callback` 没有正确转发到 Next standalone，和 `ldpass` 本身是否登录无关。

如果你准备把“旧客运公告变更后自动重算运营提醒”挂到计划任务，现在可以直接调用内部同步入口：

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri "https://yct.shangxiaoguan.top/v2/api/internal/operations/reminders/sync" `
  -Headers @{ Authorization = "Bearer <YCT_INTERNAL_TASK_TOKEN>" } `
  -ContentType "application/json" `
  -Body '{"force":"false"}'
```

说明：

- 这个入口会读取当前 `ltcx/stop.txt` 公告源，和本地 `.yct-data/operations-reminder-source-state.json` 中保存的上次签名比较。
- 公告源有变化时，会自动发布一次 `OperationsReminderDeliveryRefreshRequested` 事件，复用现有运营提醒候选与 Push 投递重算链路。
- 如果只是想强制重算、跳过“是否变化”的判断，可以把 `force` 传为 `"true"`。

如果你更希望只打一个统一入口，当前 `/api/internal/tasks/run` 已经把这一步并进去了：默认会先同步客运公告源，再重放事件 Outbox、处理到期 Push 投递并清理过期票务占座。仓库和部署包里都附带一个 PowerShell 调用脚本：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\run-yct-internal-tasks.ps1 `
  -Origin http://127.0.0.1:3300 `
  -BasePath v2
```

常用参数：

- `-Limit 50`：同时作为事件和通知处理的共享上限。
- `-EventLimit 100` / `-PushLimit 20`：分别覆盖共享上限。
- `-SkipOperationsReminderSync`：本次跳过客运公告源同步。
- `-ForceOperationsReminderRefresh`：即使公告签名没变化，也强制触发一次运营提醒重算。
- `-Now 2026-07-07T12:00:00+08:00`：为通知和票务过期处理注入调试时间。

把 `artifacts/yct-web-*` 上传到服务器后，推荐先解压到一个新的临时目录，再从这个临时目录执行包内的 `deploy-yct-web.ps1`。这个脚本会自动把旧部署目录中的环境文件、`.yct-data` 和 `apps\web\public\content-assets` 迁走，替换部署文件，再把这些持久数据放回去。

推荐命令：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\deploy-yct-web.ps1 -TargetRoot C:\wwwroot\yct-v2
```

如果希望部署完成后直接启动：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\deploy-yct-web.ps1 -TargetRoot C:\wwwroot\yct-v2 -StartAfterDeploy -Port 3300 -HostName 127.0.0.1 -BasePath v2 -NodePath "C:\node-v22\node.exe"
```

这个脚本默认会保留：

- `.env`
- `.env.production`
- `.env.local`
- `.env.production.local`
- `.yct-data`
- `apps\web\public\content-assets`

执行前仍然要确认旧进程已经停止，并且新包已经解压到一个和正式部署目录不同的新目录里。不要把新包直接覆盖解压到仍保留旧 `.next` 文件的目录里；Next.js 的 `server.js`、`.next/server` 和 `.next/static` 必须来自同一次构建，否则会出现页面能打开但客户端 chunk 404、路线规划或周边地点等交互失效的问题。

如果脚本不可用，或者你想手工确认整个过程，再使用下面这套兜底命令。执行前务必确认旧进程已经停止：

```powershell
$deployRoot = "C:\wwwroot\yct-v2"
$backupRoot = "C:\wwwroot\yct-v2-backup-$(Get-Date -Format yyyyMMdd-HHmmss)"
$artifact = "C:\Users\Administrator\Downloads\yct-web-20260705-230243.zip"

if (-not (Test-Path -LiteralPath $deployRoot)) {
  New-Item -ItemType Directory -Force -Path $deployRoot | Out-Null
}

New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null
foreach ($relativePath in @(
  ".env",
  ".env.production",
  ".env.local",
  ".env.production.local",
  ".yct-data",
  "apps\web\public\content-assets"
)) {
  $source = Join-Path $deployRoot $relativePath
  if (Test-Path -LiteralPath $source) {
    $target = Join-Path $backupRoot $relativePath
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
    Move-Item -LiteralPath $source -Destination $target -Force
  }
}

Get-ChildItem -LiteralPath $deployRoot -Force | Remove-Item -Recurse -Force
Expand-Archive -LiteralPath $artifact -DestinationPath $deployRoot -Force

foreach ($relativePath in @(
  ".env",
  ".env.production",
  ".env.local",
  ".env.production.local",
  ".yct-data",
  "apps\web\public\content-assets"
)) {
  $source = Join-Path $backupRoot $relativePath
  if (Test-Path -LiteralPath $source) {
    $target = Join-Path $deployRoot $relativePath
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
    Move-Item -LiteralPath $source -Destination $target -Force
  }
}
```

这段命令只适合在确认 `$deployRoot` 是部署目录时使用；不要把 `$deployRoot` 设为磁盘根目录、用户目录或 `wwwroot` 总目录。它本质上就是 `deploy-yct-web.ps1` 在做的事情，只是这里保留成手工兜底版本，方便排障。

### 需要迁移哪些数据

如果你是在“旧版 YCT v2 部署目录”上做原地升级，默认至少要保留这两类内容：

1. `.yct-data`
2. `runtime-assets`
3. `apps\web\public\content-assets`

只复制 `.yct-data` 并不总是足够，因为内容后台上传的图片素材默认不在 `.yct-data` 里，而是在 `apps\web\public\content-assets`。如果不一起保留，历史内容和审核通过的素材链接可能会丢图。

可以按下面理解：

- `.yct-data`：账号映射、管理员成员、交通数据版本、POI 投稿、POI 投稿图片、提醒、通知、票务草稿、离线范围请求等本地仓储；当前 POI 投稿图片默认在 `.yct-data/poi-submission-images`。
- `runtime-assets`：部署包根目录下的运行时静态资源；当前 POI 分类图标默认在 `runtime-assets/poi-icons`。
- `apps\web\public\content-assets`：内容后台上传的真实图片和附件。
- `apps\web\public\legacy-assets`：如果它来自你本地打包机的 `public` 目录，通常已经包含在部署包里；只有当云端还保留了“没有重新打进包的额外旧资源”时，才需要额外手工保留。

所以，对大多数当前部署来说：

- 如果你从一个旧的 YCT v2 目录升级到新的 YCT v2 目录，至少复制 `.yct-data`、`runtime-assets` 和 `apps\web\public\content-assets`。
- 如果这是第一次把 v2 部署到云端，`.yct-data` 可以先让系统按需创建，但 `.env` 仍然必须手工放好。
- 如果你确认当前没有任何后台上传素材，理论上只复制 `.yct-data` 也能跑，但我不建议把这个当默认流程。

zip 包可以直接右键解压，`tar.gz` 包可以用：

```powershell
tar -xzf .\yct-web-20260704-xxxxxx.tar.gz -C C:\wwwroot\yct-v2
```

不压缩的 `tar` 包使用：

```powershell
tar -xf .\yct-web-20260704-xxxxxx.tar -C C:\wwwroot\yct-v2
```

如果你没有使用 `deploy-yct-web.ps1` 自动启动，也可以在部署目录中手工运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\start-yct-web.ps1 -Port 3300 -HostName 127.0.0.1 -BasePath v2 -NodePath "C:\node-v22\node.exe"
```

如果未来站点不再挂载 `/v2`，需要重新用空 BasePath 构建，并以空 BasePath 启动。

当前这套 `/v2` 测试部署不是使用 Next.js 原生 `basePath`，而是：

- 构建时把同源链接、静态资源和前端跳转统一生成为 `/v2/...`
- 运行时仍由 Node 进程提供根路径路由，例如 `/map`、`/auth/ldpass/callback`
- 当前版本同时会在应用内把传入的 `/v2/...` 请求重写到根路径，因此外层宝塔反代可以直接把 `/v2/...` 原样转发给 Node，也可以继续在反代层剥掉 `/v2` 前缀

因此反代规则必须对页面、API、认证回调和静态资源都一致生效，而不是只代理首页。最容易漏掉的路径包括：

- `/v2/auth/ldpass/callback`
- `/v2/api/...`
- `/v2/_next/static/...`
- `/v2/sw.js`

反代挂载在 `/v2` 时，部署后至少检查以下地址：

```text
https://yct.shangxiaoguan.top/v2/api/health
https://yct.shangxiaoguan.top/v2/map
https://yct.shangxiaoguan.top/v2/api/map/markers
https://yct.shangxiaoguan.top/v2/sw.js
https://yct.shangxiaoguan.top/v2/_next/static/...
```

可以先用 `health` 接口确认当前正在运行的构建号和挂载路径：

```powershell
Invoke-WebRequest -Uri "https://yct.shangxiaoguan.top/v2/api/health?check=$(Get-Date -Format yyyyMMddHHmmss)" -UseBasicParsing -Headers @{ "Cache-Control" = "no-cache"; "Pragma" = "no-cache" } |
  Select-Object -ExpandProperty Content
```

返回 JSON 至少应包含：

```json
{
  "ok": true,
  "name": "Yuchengtong",
  "abbreviation": "YCT",
  "buildId": "20260707-123202",
  "basePath": "/v2"
}
```

如果这里的 `buildId` 仍是旧值，说明当前运行进程、部署目录或反代目标仍没有切到新包，先不要继续排查页面逻辑。

部署包中还会附带一个现成的烟雾检查脚本，可把上面的几步合并成一次检查：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\check-yct-web-smoke.ps1 -Origin "https://yct.shangxiaoguan.top" -BasePath "v2"
```

它会依次检查：

- `/v2/api/health` 的 `buildId` 与 `basePath`
- `/v2/map`
- `/v2/api/map/markers`
- `/v2/sw.js` 的首行构建号
- `/v2/api/auth/ldpass/start` 的 `location` 与 `yct.ldpass_return_origin` cookie（可用 `-SkipLdpass` 跳过）

可以用下面的命令快速核对云端 Service Worker 是否已经换成当前部署包里的版本：

```powershell
Get-Content .\apps\web\public\sw.js -TotalCount 1
(Invoke-WebRequest -Uri "https://yct.shangxiaoguan.top/v2/sw.js?check=$(Get-Date -Format yyyyMMddHHmmss)" -UseBasicParsing -Headers @{ "Cache-Control" = "no-cache"; "Pragma" = "no-cache" }).Content.Split("`n")[0]
```

两行都应是形如 `const YCT_SW_VERSION = '20260706-xxxxxx';` 的同一个构建号。如果线上仍是旧版本号，优先检查部署目录是否被完整清空后解压、反代是否指向本次目录，以及宝塔/Nginx 是否对 `/v2/sw.js` 施加了额外缓存。

如果登录 `ldpass` 后仍回跳到 `localhost`、`127.0.0.1` 或其他内网地址，再加一条针对登录入口的直接验收：

```powershell
curl.exe -I "https://yct.shangxiaoguan.top/v2/api/auth/ldpass/start?check=$(Get-Date -Format yyyyMMddHHmmss)"
```

理想结果应同时满足：

1. `location` 里的 `redirect_uri=` 指向 `https://yct.shangxiaoguan.top/v2/auth/ldpass/callback`
2. `set-cookie` 同时包含 `yct.ldpass_state` 和 `yct.ldpass_return_origin`

如果这里只有 `yct.ldpass_state`，通常说明当前运行的仍是旧部署包；源码即使已经修复，旧 bundle 里的 `.next/standalone` 也不会自动跟着变。

如果页面 HTML 里出现 `/_next/static/...` 或 `/api/...` 这类没有 `/v2` 的同源链接，通常表示运行的不是按 `/v2` 构建的包，或云端进程仍指向旧构建。

### 新老用户看到版本不一致

如果新访客更容易看到新版，而已经访问过的浏览器仍看到旧版，优先按下面顺序排查：

1. 云端是否仍在运行旧进程。用 `Get-NetTCPConnection -LocalPort 3300` 找到 PID，再确认对应命令行是否指向本次解压目录。
2. 部署目录是否混有旧 `.next/static`。如果 `.next/server` 与 `.next/static` 来自不同构建，客户端 chunk 会随机新旧混用。
3. 反向代理或 CDN 是否缓存了 HTML/RSC。临时测试阶段建议不要缓存 `/v2` 下的 HTML、RSC 和 API，只允许 `_next/static` 长缓存。
4. 应用会对 HTML、RSC 和 API 设置 `Cache-Control: no-store, max-age=0, must-revalidate`，但如果宝塔/Nginx 仍额外拼接 `max-age=43200` 一类规则，建议在反代层单独关闭 `/v2` 页面缓存，避免旧 HTML 引用已不存在的旧 chunk。
5. 浏览器是否保留旧 Service Worker 或旧 `yct-*` Cache。生产包会继续注册 PWA；打包脚本会用构建号改写 `sw.js` 缓存版本，并让客户端以 `sw.js?v=构建号` 注册，应用侧会通过 `proxy.ts` 和 `next.config.mjs` 的 headers 对 `/sw.js`、`/v2/sw.js` 等 Service Worker 路径设置 `no-store`，正常部署后旧 `yct-shell-*` 会在新 SW 激活时删除。如果仍看到旧 chunk 404，可以在浏览器开发者工具里 unregister 当前站点 Service Worker 并清理 Cache Storage 后重试。
6. 是否按 `/v2` 构建但以根路径启动，或反过来。构建参数 `-BasePath v2`、启动参数 `-BasePath v2` 和宝塔反代路径必须一致。
7. 如果登录 `ldpass` 后回跳地址仍落到 `localhost:3300`、`127.0.0.1:3300` 或其他内网地址，先检查反代是否保留 `Host`、`X-Forwarded-Host`、`X-Forwarded-Proto`；当前应用会优先用这些头推断对外站点，其次回退到部署根目录 `.env` 的 `YCT_PUBLIC_SITE_URL`。如果公网域名后面被拼出 `:3300`，通常是反代把上游端口写进了 `X-Forwarded-Port`；新版应用会在公网域名场景下忽略这个内部端口，但反代层仍建议只把外部端口写进 `X-Forwarded-Host`。如果两者都不对，`redirect_uri` 和登录后的账号页回跳都可能落回内网地址。当前部署脚本会在发布后打印一次 `Site URL` 和 `Callback URL` 摘要；只要这里仍是 localhost/127.0.0.1，就先不要继续点登录，优先排查目标目录内的 `.env`、`.env.local`、`.env.production.local` 以及 PM2 / shell 里残留的旧环境变量。另一个常见原因是你部署的仍是旧构建包：源码即使已经修了公开地址推断，旧包内的 `.next/standalone` 也不会自动跟着变，必须重新构建并部署新版包后才会生效。
8. 如果“发起登录”已经跳到了正确的公网 `redirect_uri`，但登录成功后账号页仍提示“当前回跳地址是 localhost/127.0.0.1”，说明回调请求阶段的反代头仍不完整。当前新版已经在 `start` 阶段把推导出的公网 origin 写入短期 HttpOnly Cookie，`callback` 会优先复用该值，因此这类问题一般只会出现在旧部署包或被旧进程环境污染的情况下；重新部署新版包后再测一次即可确认。

### 端口无法监听

如果启动时报：

```text
listen EACCES: permission denied 127.0.0.1:3300
```

优先检查端口占用：

```powershell
Get-NetTCPConnection -LocalPort 3300 -ErrorAction SilentlyContinue
netstat -ano | findstr :3300
```

如果没有普通监听进程，再检查 Windows 排除端口段：

```powershell
netsh interface ipv4 show excludedportrange protocol=tcp
```

如果 `3300` 落在排除范围内，直接换一个内部端口，例如：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\start-yct-web.ps1 -Port 3400 -HostName 127.0.0.1 -BasePath v2 -NodePath "C:\node-v22\node.exe"
```

然后把宝塔反向代理目标同步改为：

```text
http://127.0.0.1:3400
```

## Node.js 版本

当前仓库根 `package.json` 要求：

```text
node >=20.9.0
```

项目使用 Next.js 16。云服务器当前如果仍是 Node.js 18.6.0，需要先升级到 Node.js 20.9+，建议使用 22 LTS。否则即使上传 standalone 包，也可能运行失败。

如果宝塔面板的 Node 版本列表最高只有 18.6.0，可以不使用宝塔内置 Node，改用便携版 Node：

1. 在服务器下载 Windows x64 的 Node.js 22 LTS zip。
2. 解压到例如 `C:\node-v22`。
3. 用 `C:\node-v22\node.exe -v` 确认版本。
4. 启动时给 `start-yct-web.ps1` 传入 `-NodePath "C:\node-v22\node.exe"`。

这种方式不需要在云服务器上重新安装依赖或执行构建，只替换运行时使用的 Node 可执行文件。

如果使用宝塔 Node 项目管理器，且它不能选择自定义 `node.exe`，可以改用宝塔的进程守护/计划任务或 Windows 服务工具运行上述 PowerShell 启动命令，反向代理仍然指向 `127.0.0.1:3300`。

## 不建议的做法

不建议在 2 核 4G 的云服务器上新开 Codex 拉仓库再构建，原因是：

- Next.js 生产构建会同时占用 CPU、内存和 `.next/cache` 磁盘空间。
- Codex 自身也会占用一部分内存。
- 云服务器当前剩余磁盘较少，构建缓存和 `node_modules` 容易把空间吃满。

更稳妥的做法是：本地或 CI 构建 zip，服务器只负责解压、保留运行时数据、重启 Node 进程。

## 需要持久化但不进部署包的内容

以下内容应该保存在服务器持久目录或后续数据库/对象存储中，不随每次部署覆盖：

- 部署根目录下的 `.env`、`.env.production`、`.env.local` 等真实环境变量文件。
- `.yct-data` 本地运行时仓储，其中包含 POI 投稿图片目录 `.yct-data/poi-submission-images`。
- `runtime-assets` 运行时静态资源目录；当前 POI 分类图标默认写入 `runtime-assets/poi-icons`，后续内容素材、旧资源和其他上传文件也会逐步迁入同类目录。
- 后台上传素材目录 `apps/web/public/content-assets`。
- 日志、备份和导入中间文件。

## 后续改进

- 增加正式生产启动/停止脚本，和当前 `web:dev:*` 脚本区分。
- 将 `.yct-data` 替换为数据库与 Transactional Outbox。
- 将后台上传素材迁移到对象存储或共享静态资源目录。下一阶段优先考虑在部署包根目录下放置与 `start-yct-web.ps1`、`deploy-yct-web.ps1` 平级的运行时静态资源目录，例如 `runtime-assets\content-assets`、`runtime-assets\poi-icons` 和后续可能的 `runtime-assets\legacy-assets`；部署脚本负责从旧目录迁移、回填和保留这些目录，应用通过配置生成公开 URL。这样替换 standalone 包时不需要反复把上传素材塞回 `apps\web\public` 内部目录，也更适合多版本并行解压和切换。
- 增加 GitHub Actions 构建 artifact，避免本机手动打包。
