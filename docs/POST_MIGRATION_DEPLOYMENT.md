# 数据迁移完成后的生产发版手册

本文适用于 WordPress 存档和旧 `data/content_data.js` 已经迁入生产内容库之后的普通发版。目标是只替换程序，不重建、覆盖或重新导入生产数据。

## 1. 先确认数据边界

生产环境的事实来源是服务器当前运行态，不是部署包，也不是最初迁移时的冷归档：

| 内容                                       | 生产位置                                | 普通发版处理                 |
| ------------------------------------------ | --------------------------------------- | ---------------------------- |
| 文章、迁移结果、账号、审核、事件 Outbox 等 | `C:\wwwroot\yct-v2\.yct-data`           | 整体备份、整体保留           |
| 生产环境变量和密钥                         | `C:\wwwroot\yct-v2\.env*`               | 保留现有值，只补缺失键       |
| 运行时图标等资源                           | `C:\wwwroot\yct-v2\runtime-assets`      | 整体备份、整体保留           |
| 内容实体素材                               | `C:\wwwroot\yct-runtime\content-assets` | 位于程序目录外，不随发版替换 |
| 旧静态站                                   | `C:\wwwroot\yct.shangxiaoguan.top`      | 继续只读保留                 |

迁移完成后，最初记录的 76 条内容、1291 个素材或旧 SHA-256 只用于证明当时的迁移快照。只要线上发生过编辑、发布、投稿、账号登录或事件投递，当前文件数量和哈希就可能合法变化，不能再用旧哈希覆盖或否定当前生产数据。

普通发版禁止执行：

- `prepare-yct-root-migration.ps1 -Apply`
- `migrate-yct-legacy-content.ps1 -Apply`
- 重新导入 `wordpress-database.sql`、`wordpress-content-export.json` 或旧 `content_data.js`
- 把本地 `.yct-data`、`.env` 或 `content-assets` 上传并覆盖服务器

这些迁移是一次性写入动作。日常发版只运行 `deploy-yct-web.ps1`。

## 2. 本地生成并校验发布包

当前生产站使用域名根路径，本地执行：

```powershell
pnpm typecheck
pnpm web:artifact
```

脚本会在 `artifacts` 中生成 `yct-web-时间戳.zip` 和同名 `.sha256` 文件。发布包不包含任何真实 `.env`、`.yct-data`、运行时上传素材或本地缓存。

上传 zip 和 `.sha256` 后，先在服务器核对传输完整性：

```powershell
$yctArchive = 'C:\Users\Administrator\Downloads\yct-web-时间戳.zip'
$yctChecksum = "$yctArchive.sha256"
$yctExpectedHash = ((Get-Content -LiteralPath $yctChecksum -Raw -Encoding UTF8).Trim() -split '\s+')[0]
$yctActualHash = (Get-FileHash -LiteralPath $yctArchive -Algorithm SHA256).Hash

if ($yctActualHash -ne $yctExpectedHash) {
  throw "部署包 SHA-256 不一致，停止部署。"
}
```

将新包解压到正式目录以外的新目录，例如 `C:\wwwroot\yct-release-时间戳`。禁止直接覆盖解压到 `C:\wwwroot\yct-v2`，否则新旧 `.next` 文件混合后会产生随机 chunk 404。

## 3. 维护窗口与只读快照

先通过实际使用的宝塔、Windows 服务、PM2 或计划任务停止以下写入者：

- 3300 端口的 Web 进程
- 玩家位置采集器
- 内部任务、事件 Outbox、Push、票务清理等计划任务
- 可能直接写 `.yct-data` 的其他脚本

确认 Web 已停止：

```powershell
Get-NetTCPConnection -LocalPort 3300 -State Listen -ErrorAction SilentlyContinue
```

输出必须为空。部署脚本默认也会检查 3300 端口；端口仍在监听时会拒绝替换。玩家位置采集器不监听端口，仍需在进程管理器中单独确认。

停写后记录当前生产数据摘要，作为本次发版基线：

```powershell
$yctDataRoot = 'C:\wwwroot\yct-v2\.yct-data'
$yctDataFiles = @(Get-ChildItem -LiteralPath $yctDataRoot -Recurse -Force -File)

[pscustomobject]@{
  CapturedAt = Get-Date -Format o
  FileCount = $yctDataFiles.Count
  TotalBytes = [long](($yctDataFiles | Measure-Object -Property Length -Sum).Sum)
  ContentStoreSha256 = (Get-FileHash -LiteralPath (Join-Path $yctDataRoot 'content-store.json') -Algorithm SHA256).Hash
  EventOutboxSha256 = (Get-FileHash -LiteralPath (Join-Path $yctDataRoot 'event-outbox-store.json') -Algorithm SHA256).Hash
} | Format-List
```

必须备份整个 `.yct-data`，不能只备份 `content-store.json`。内容状态变化会同时产生事件与审计记录，只恢复一个 JSON 会造成内容库和事件 Outbox 不一致。

## 4. 执行替换

在新包解压目录执行：

部署命令统一使用 PowerShell 7（`pwsh`）。根路径统一传 `-BasePath '/'`，脚本会把 `/` 归一化为应用内部的空 BasePath；不要传 `''`，也不要用反斜杠 `\`。

```powershell
Set-Location 'C:\wwwroot\yct-release-时间戳'

pwsh -NoProfile -ExecutionPolicy Bypass `
  -File '.\deploy-yct-web.ps1' `
  -TargetRoot 'C:\wwwroot\yct-v2' `
  -BasePath '/' `
  -Port 3300
```

部署脚本按以下顺序工作：

```text
检查端口已停止
  -> 完整复制上一版程序与运行数据到时间戳备份目录
  -> 对每个持久目录逐文件计算 SHA-256 并校验备份
  -> 清空正式程序目录并复制新包
  -> 从备份恢复持久数据并再次逐文件校验
  -> 只向生产 .env 追加缺失键
  -> 保留完整上一版备份用于回滚
```

任何备份或恢复校验失败都会停止。程序替换阶段失败时，脚本会尝试自动恢复上一版程序和持久数据；即使自动恢复也失败，时间戳备份仍保留，不会被脚本删除。

不要使用 `-AllowActiveListener` 绕过端口保护，除非已经确认 3300 的监听进程与本部署完全无关。

## 5. 启动与验收

先检查配置，不要立即开放后台写入任务：

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

先执行内网检查，再执行公网检查：

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass `
  -File '.\check-yct-web-smoke.ps1' `
  -Origin 'http://127.0.0.1:3300' `
  -BasePath '/' `
  -SkipLdpass

pwsh -NoProfile -ExecutionPolicy Bypass `
  -File '.\check-yct-web-smoke.ps1' `
  -Origin 'https://yct.shangxiaoguan.top' `
  -BasePath '/'
```

还要人工核对后台中的 WordPress 归档文章、旧站迁入草稿、上次发版后新建或编辑的内容、内容图片、账号登录和地图数据。全部正常后再恢复玩家位置采集器和计划任务，并确认同一时刻只有一个 Web 实例写这份 JSON 数据库。

### 5.1 A+B 公共 AI 入口

当前版本的 AI 接入是站点可发现性和公共只读 API，不需要额外启动模型、向量数据库或索引 Worker。恢复定时任务前，先使用部署包内的烟雾检查确认以下入口都由本次 Web 构建提供：

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass `
  -File '.\check-yct-web-smoke.ps1' `
  -Origin 'https://yct.shangxiaoguan.top' `
  -BasePath '/'
```

脚本会检查：

- `/robots.txt`、`/sitemap.xml`、`/llms.txt`
- `/api/v1/public`、`/api/v1/public/openapi` 和 `/api/v1/public/map/markers`
- 公共 API 的 `apiVersion`、OpenAPI 版本、canonical URL、CORS、缓存和 `X-Robots-Tag`
- `robots.txt` 的公网 `Host` 和 `Sitemap` 地址

如果公网反代仍挂载在 `/v2`，所有路径都必须带 `/v2`，并使用 `-BasePath 'v2'`。如果公共 API 目录返回的 canonical URL 指向 localhost、内部端口、错误域名或错误 BasePath，先修正 `YCT_PUBLIC_SITE_URL` 与反代头，不要恢复后台定时任务。

## 6. 回滚

公网验收失败且尚未恢复写任务时：停止新 Web，使用部署脚本输出的时间戳备份目录恢复上一版。该备份现在保留完整程序、`.env*`、`.yct-data` 和部署目录内的运行时素材。

如果新版本已经对外运行并产生了新数据，不能直接用发版前的 `.yct-data` 覆盖。先停止所有写入者，再额外备份当前 `.yct-data`，回滚程序时保留这份最新数据；只有确认新旧数据结构不兼容时，才制定单独的数据降级方案。

至少保留最近一次已验证可用的发布包、对应 `.sha256`、本次部署生成的上一版目录备份，以及程序目录外的内容素材。观察期结束前不要清理这些文件。

## 7. 核心验收用例

普通发版至少验证：

1. 部署包 SHA-256 在本地和服务器一致。
2. 端口未停止时部署脚本拒绝执行。
3. 部署前后的 `.yct-data` 文件数、总字节数及逐文件哈希一致。
4. WordPress 迁移记录和旧 `content_data.js` 草稿数量不减少，人工修改内容不回退。
5. 上次发版后产生的账号、投稿、审核、事件 Outbox 和上传素材仍可读取。
6. 根路径健康检查、深链刷新、API、ldpass 回调、`sw.js` 和内容图片正常。
7. 失败部署可以从时间戳备份恢复，且不会通过重跑迁移来“修复”数据。
8. `robots.txt`、`sitemap.xml`、`llms.txt`、公共 API 目录和 OpenAPI 均通过部署包烟雾检查，且 canonical URL、CORS、缓存和 `X-Robots-Tag` 正确。

当前仍是单机 JSON 存储，这是最大的架构边界：不能让两个实例共享写入同一 `.yct-data`。需要多实例时，应先迁移到支持事务的数据库，并把现有事件机制升级为 Transactional Outbox；仅把 JSON 放到共享磁盘并不能解决并发覆盖问题。
