# YCT 从 `/v2` 切换到域名根目录

本文只覆盖 `yct.shangxiaoguan.top` 在 Windows Server 2022 + 宝塔 Nginx 上的这次切换。生产程序目录固定为 `C:\wwwroot\yct-v2`，旧静态站继续留在 `C:\wwwroot\yct.shangxiaoguan.top`，内容素材放到独立的 `C:\wwwroot\yct-runtime\content-assets`。

## 1. 切换后的边界

- `https://yct.shangxiaoguan.top/` 及新版页面、API、认证和 Next 静态资源由 3300 端口的新项目提供。
- 旧静态站目录不删除。已存在的 `/gtr/`、`/metro_map/`、`/map_search/`、`/data/`、`/content/`、`/bus_stats/`、`/UI/`、`/generator/`、`/ltcx/`、`/lab/`、`/bus_routemap/`、`/ltcx_schedule/`、`/server/`、`/product_gallery/`、`/dynamic_routemap/`、`/data_composer/` 继续由 Nginx 的 `try_files` 静态返回。
- 未命中旧静态文件的路径才回退给新项目。因此旧链接可继续运行，但旧站根 `index.html` 不再作为首页。
- `/v2/...` 第一阶段使用 `307` 跳到对应根路径，保留请求查询参数；观察至少两周后再决定是否改成永久 `308`。
- `/v2/sw.js` 不重定向，而是返回退役脚本，清理旧 `yct-*` 缓存并注销 `/v2` Service Worker。
- `/gtr/` 原有 3000 端口反代和 `/.well-known/` 证书验证配置必须保留。

路由状态机如下：

```text
请求进入 yct.shangxiaoguan.top
  -> /v2/sw.js：返回退役脚本
  -> /v2 或 /v2/*：307 到根路径
  -> /content-assets/*：读取独立持久素材目录
  -> 旧静态文件/目录真实存在：继续返回旧站
  -> 其余路径：反代到 127.0.0.1:3300
```

## 2. `.env` 以哪个版本为准

唯一生产主版本是：

```text
C:\wwwroot\yct-v2\.env
```

处理规则：

1. 服务器现有 `.env` 的值和密钥优先，部署包绝不携带本机真实 `.env`。
2. 包内 `ENVIRONMENT.example` 只提供“当前代码认识哪些键”，不能直接改名覆盖生产文件。
3. `deploy-yct-web.ps1` 会先保留生产 `.env`，替换程序后调用 `merge-yct-env.ps1`，只追加示例中新增但生产文件缺失的键；已存在的值和密钥不会改变。
4. 新追加的空值要人工检查。尤其是 `LDPASS_YCT_PROVIDER_API_KEY`、`YCT_INTERNAL_TASK_TOKEN`、Web Push 密钥等，不能从示例默认值推断。
5. 启动器依次读取 `.env`、`.env.production`、`.env.local`、`.env.production.local`，后面的文件覆盖前面的同名键。本次建议只保留一个生产 `.env`；若其他文件存在，先搜索重复键并删除旧覆盖项。

首次切根路径必须有以下非敏感值：

```dotenv
YCT_PUBLIC_SITE_URL=https://yct.shangxiaoguan.top
NEXT_PUBLIC_YCT_BASE_PATH=
YCT_BASE_PATH=
YCT_CONTENT_STORE_PATH=C:\wwwroot\yct-v2\.yct-data\content-store.json
YCT_CONTENT_ASSET_STORE_PATH=C:\wwwroot\yct-v2\.yct-data\content-asset-store.json
YCT_CONTENT_ASSET_UPLOAD_DIR=C:\wwwroot\yct-runtime\content-assets
```

根路径切换后，不要再让服务器上的新应用通过公开域名反向请求自身来读取旧数据。生产环境改为直接读取旧静态站目录：

```dotenv
YCT_LEGACY_DATA_SOURCE=local
YCT_LEGACY_DATA_DIR=C:\wwwroot\yct.shangxiaoguan.top\data
YCT_LEGACY_PUBLIC_BASE_URL=https://yct.shangxiaoguan.top
```

`YCT_LEGACY_DATA_REMOTE_BASE_URL` 可以保留为应急回退值，但 `YCT_LEGACY_DATA_SOURCE=local` 时不会使用它。旧 `/data/` 与 `/content/` 仍需由 Nginx 对外提供，因为交通、地图及未迁移的静态链接还依赖旧目录。

首次部署前查看是否有后置文件覆盖关键键：

```powershell
$yctKeys = @(
  'YCT_PUBLIC_SITE_URL',
  'NEXT_PUBLIC_YCT_BASE_PATH',
  'YCT_BASE_PATH',
  'YCT_CONTENT_STORE_PATH',
  'YCT_CONTENT_ASSET_STORE_PATH',
  'YCT_CONTENT_ASSET_UPLOAD_DIR'
)

Get-ChildItem -LiteralPath 'C:\wwwroot\yct-v2' -Force -File |
  Where-Object { $_.Name -like '.env*' } |
  ForEach-Object {
    $yctEnvFile = $_
    Get-Content -LiteralPath $yctEnvFile.FullName -Encoding UTF8 |
      ForEach-Object {
        if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$' -and $Matches[1] -in $yctKeys) {
          [pscustomobject]@{ File = $yctEnvFile.Name; Key = $Matches[1]; Value = $Matches[2] }
        }
      }
  } | Format-Table -AutoSize
```

不要把完整 `.env` 输出发到聊天或日志；上面的列表只允许包含这些非敏感键。

## 3. WordPress 存档怎么合入

服务器上的迁移已经完成，不需要在部署时重新导入 SQL 或解压 `wordpress-site-files.tar.gz`。这次真正需要保住的是已经合并后的运行态快照：

| 数据     | 生产位置                                               | 已核对结果                     |
| -------- | ------------------------------------------------------ | ------------------------------ |
| 内容库   | `C:\wwwroot\yct-v2\.yct-data\content-store.json`       | SHA256 `ADB66A...D4E56`，76 条 |
| 素材库   | `C:\wwwroot\yct-v2\.yct-data\content-asset-store.json` | SHA256 `FBA253...97FDA`        |
| 实体素材 | 当前旧版本的 `apps\web\public\content-assets`          | 1291 文件，751117609 字节      |

`prepare-yct-root-migration.ps1` 会校验完整哈希和素材数量，先备份，再把实体素材复制到独立持久目录。任何一项不匹配都会停止，不会继续覆盖。

原始 `wordpress-content-export.json`、`wordpress-database.sql`、`wordpress-site-files.tar.gz`、`retirement-manifest.json`、`final-checksums.json` 属于冷归档：保留用于审计、追溯或灾难恢复，不由 Web 进程直接读取，也不应放进公开 Web 根目录。

WordPress 内容当前仍是归档状态。新版后台增加了受控恢复动作，流转为：

```text
archived --ContentRestored--> draft --ContentSubmitted--> pending_review
```

管理员进入 `/admin/operations` 后：

1. 把状态筛选为“已归档”。
2. 搜索并选择需要重新审核的 WordPress 公开文章。
3. 点击“批量恢复草稿”。恢复后选择会保留。
4. 需要修改分类、正文、图片或音视频链接时先逐篇编辑；分类可以正常修改。
5. 点击“批量提交审核”，不要直接发布。

本次结构化导出中可进入待审核队列的 17 篇 `post_status=publish` 文章为：

- 临东市服务器简介
- 《十问临东》（第一弹）
- 南溪市简介
- 课程表（高三）
- 体温单（学校用的）
- 2020年临东市服务器总结
- 关于“智慧临东”客户端
- 临东市服务器更新通告 | 2021年6月19日
- 【微志快讯】新版地图画标识制作完成
- 临东市服务器更新通告 | 2021年11月
- 手把手教您如何订阅临东市服务器的 RSS (简易信息聚合) 服务
- 【微志慢讯】临东五周年活动圆满完成！
- 临东市服务器10月份收支公示
- 临东市服务器 × 坪岗服务器长平 周边联动确认！
- 2022，来了！
- 上官Bot停止维护：道别，珍重
- 临东服务器2021年年度报告

四篇已过期 `page` 和 41 篇私有文章继续归档。由于原备份缺少 `wp_postmeta` 与 `wp_term_relationships`，WordPress 分类、标签和特色图不能被可靠还原；审核时按现有业务分类人工调整。视频、音频不搬入 YCT 素材库，只在正文中保留外部链接。

## 4. 本次首次部署

以下步骤在云服务器 PowerShell 中执行。先把新的根路径部署包解压到 `C:\wwwroot\yct-release-root-时间戳`，该目录必须位于 `C:\wwwroot\yct-v2` 外部。

### 4.1 只读预检

```powershell
Set-Location 'C:\wwwroot\yct-release-root-时间戳'

pwsh -NoProfile -ExecutionPolicy Bypass `
  -File '.\prepare-yct-root-migration.ps1'
```

预期看到 76 条内容、1291 个素材文件和 `Preflight passed`。若哈希或数量不符，停止部署并从 `final-checksums.json` 重新核对，不能跳过校验。

预检还会按磁盘分别估算备份与素材复制所需空间，并分别保留 256 MiB 余量。空间不足时脚本会停止；先扩容或把 `-BackupRoot` 指向容量足够的独立磁盘。即使备份放到 D 盘，脚本仍会单独检查 `C:\wwwroot\yct-runtime\content-assets` 所在盘，不要删除现有运行数据来强行腾空间。

### 4.2 停止所有运行态写入

先停止 3300 端口的旧 Web 进程、玩家位置采集器和会写 `.yct-data` 的计划任务。确认端口已释放：

```powershell
Get-NetTCPConnection -LocalPort 3300 -State Listen -ErrorAction SilentlyContinue
```

输出应为空。一次性脚本检测到 3300 仍在监听时会拒绝 `-Apply`。玩家位置采集器不监听该端口，必须在宝塔、计划任务或进程管理器中单独确认已经停止。

### 4.3 备份、搬素材并合并 `.env`

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass `
  -File '.\prepare-yct-root-migration.ps1' `
  -Apply
```

脚本会：

- 在 `C:\wwwroot\yct-migration-backup\时间戳` 保存 `.env*`、`.yct-data`、不含重复内容素材的旧程序副本和 Nginx 配置。
- 把 1291 个素材复制到 `C:\wwwroot\yct-runtime\content-assets`，复制后再次校验数量和字节数。
- 如果此前复制中断且目标目录只有部分文件，脚本会从已验证的旧版本素材目录续拷，而不是把不完整目录当成成功快照。
- 按键补齐生产 `.env`，再写入根路径所需的六个非敏感值；ldpass、Push 和内部任务密钥不变。

### 4.4 替换程序

在新包目录运行：

部署命令统一使用 PowerShell 7（`pwsh`），根路径统一写成 `-BasePath '/'`。脚本会安全地把 `/` 归一化为内部空 BasePath；不要写 `-BasePath ''` 或 `-BasePath '\'`。

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass `
  -File '.\deploy-yct-web.ps1' `
  -TargetRoot 'C:\wwwroot\yct-v2' `
  -BasePath '/'
```

部署脚本会把新包复制到稳定根目录，并再次执行 `.env` 的按键补缺。注意：它会清空 `C:\wwwroot\yct-v2` 中的旧版本目录，因此 4.2 必须先成功。

### 4.5 检查配置并启动 Node

```powershell
Set-Location 'C:\wwwroot\yct-v2'

pwsh -NoProfile -ExecutionPolicy Bypass `
  -File '.\check-runtime-config.ps1' `
  -BasePath '/'

pwsh -NoProfile -ExecutionPolicy Bypass `
  -File '.\start-yct-web.ps1' `
  -Port 3300 `
  -HostName 127.0.0.1 `
  -BasePath '/' `
  -NodePath 'C:\node-v24\node.exe'
```

配置检查应显示站点为 `https://yct.shangxiaoguan.top`，回调为 `https://yct.shangxiaoguan.top/auth/ldpass/callback`，BasePath 为 `/`。Node 启动后先直接验收内网端口：

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass `
  -File '.\check-yct-web-smoke.ps1' `
  -Origin 'http://127.0.0.1:3300' `
  -BasePath '/' `
  -SkipLdpass
```

### 4.6 切换 Nginx

1. 在宝塔中先备份当前站点配置。
2. 删除或停用旧的 `/v2/` 反代文件 `1782997343409.conf`，否则它的 `^~ /v2/` 会抢在迁移重定向之前命中。
3. 保留 `/gtr/` 的 `1778155949160.conf` 和 `panel-ssl-proxy.conf`。
4. 从主 `server {}` 中删除旧的 `/v2/content-assets/` 固定版本 `alias`。
5. 把包内 `nginx\yct-root-locations.conf` 复制到 `C:\BtSoft\nginx\conf\vhost\extension\yct.shangxiaoguan.top\root-migration.conf`。主配置已经 include 这个目录，不要再重复粘贴。
6. 删除宝塔默认的 `error_page 404 /404.html;`，否则新应用未知路径的 404 可能被替换成旧站页面；旧静态站自身的 `404.html` 仍可直接访问。
7. 当前主配置仍 include `rewrite\yct.shangxiaoguan.top\*.conf` 和 `redirect\yct.shangxiaoguan.top\*.conf`。若这些目录有文件，先检查是否定义了另一个 `location /`、`/v2` 或全站跳转；有冲突就先停用对应规则。
8. 检查配置并重载：

```powershell
& 'C:\BtSoft\nginx\nginx.exe' -t
```

只有看到 `syntax is ok` 和 `test is successful` 才能在宝塔中重载 Nginx。

### 4.7 公网验收

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass `
  -File 'C:\wwwroot\yct-v2\check-yct-web-smoke.ps1' `
  -Origin 'https://yct.shangxiaoguan.top' `
  -BasePath '/'

curl.exe -I 'https://yct.shangxiaoguan.top/v2/map?source=cutover'
curl.exe -I 'https://yct.shangxiaoguan.top/data/'
curl.exe -I 'https://yct.shangxiaoguan.top/gtr/'
```

验收要求：根路径健康检查的 `basePath` 为空；根首页、`/map`、API、`/_next/static`、`/sw.js`、内容图片均正常；`/v2/map` 返回 `307` 且 `Location` 为 `/map?source=cutover`；旧 `/data/` 和 `/gtr/` 仍可访问；登录回调不含 localhost、127.0.0.1、3300 或 `/v2`。

## 5. 回滚

若公网验收失败：

1. 停止新 3300 进程。
2. 恢复迁移备份目录中的 Nginx 主配置和 `proxy\yct.shangxiaoguan.top` 目录。
3. 从 `previous-release` 启动旧 `apps\web\server.js`，使用原来的 `-BasePath v2`。
4. 还原迁移备份中的 `.env*` 和 `.yct-data` 后再启动，避免新进程已经写入一半状态。
5. 执行 Nginx `-t`，通过后重载。

独立的 `C:\wwwroot\yct-runtime\content-assets` 是复制品，回滚时无需删除。删除它不会让回滚更干净，反而会失去一份素材副本。

## 6. 今后部署新包

本节的完整停写、校验、备份保留和回滚命令见 [POST_MIGRATION_DEPLOYMENT.md](./POST_MIGRATION_DEPLOYMENT.md)。迁移已经完成后，以该日常发版手册为准。

以后始终构建根路径包，不再传 `-BasePath v2`：

```powershell
pnpm web:artifact
```

每次发版：

1. 把新包解压到 `C:\wwwroot\yct-release-新时间戳`，不能解压到正式目录内部。
2. 停止 Web 进程和所有写运行态文件的后台任务。
3. 执行包内 `deploy-yct-web.ps1 -TargetRoot 'C:\wwwroot\yct-v2' -BasePath '/'`。
4. 部署脚本保留 `.env*`、`.yct-data`、`runtime-assets`，并按键追加新版新增环境变量。外置 `C:\wwwroot\yct-runtime\content-assets` 不在覆盖范围内。
5. 审核 `ENVIRONMENT.example` 中刚新增的空值，执行 `check-runtime-config.ps1 -BasePath '/'`。
6. 用 `start-yct-web.ps1 ... -BasePath '/'` 启动，再执行内网和公网烟雾检查。
7. Nginx 根路由配置不随普通发版重复修改。

不要再次执行 `prepare-yct-root-migration.ps1 -Apply`。它是绑定本次 WordPress 快照哈希和旧版本目录的一次性迁移工具；后续发版只使用 `deploy-yct-web.ps1`。

若需要把旧 `data/content_data.js` 和 `content/*.html` 一次性转入新版内容库，按包内 `LEGACY_CONTENT_MIGRATION.md` 操作。该迁移与 WordPress 存档导入相互独立，只创建缺失草稿，不覆盖已恢复、已编辑或已发布记录。

## 7. 高频故障与核心检查

- **曾经最容易出事故的做法**：把新 zip 直接解压到旧 `.next` 上，旧 HTML 引用新 chunk 或反过来，部分用户又被 Service Worker 命中旧缓存，最终表现成“首页能开、地图随机白屏”。本流程要求源目录与正式目录分离，并用退役脚本处理 `/v2` Worker。
- **多实例写 JSON**：当前内容库仍是单机 JSON。不要同时启动两个 Web 实例指向同一 `.yct-data`，否则读改写会丢更新；扩到多实例前必须迁数据库并使用事务 Outbox。
- **启动器被绕过**：直接运行 `apps\web\server.js` 时不会自动把相对路径统一到部署根目录。生产必须使用 `start-yct-web.ps1`，或在进程管理器中显式配置绝对路径。
- **Nginx 误缓存**：页面、RSC、API、认证和 `sw.js` 不允许加 `expires 12h`；只对 `/_next/static/` 与内容素材做长缓存。
- **密钥被示例覆盖**：`ENVIRONMENT.example` 只能补键，不能覆盖。启动前发现新键为空并不等于应留空，要按对应集成配置真实值。

最少验收用例：根首页与刷新深链、根 API、ldpass 开始与回调、内容图片、17 篇文章恢复/编辑分类/批量提交、旧静态目录、`/v2` 查询参数跳转、旧 Worker 注销、重启后仍读取同一份 76 条内容库。
