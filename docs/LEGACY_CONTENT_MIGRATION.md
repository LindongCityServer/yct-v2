# 旧站运营消息与内容页面一次性迁移

本文供云服务器上的 Codex CLI 执行。目标是把旧静态站 `data/content_data.js` 中的运营消息，以及这些消息引用的 `content/*.html` 独立页面，一次性写入新版内容库。迁移后内容先进入草稿，不自动提交审核或发布。

## 1. 迁移边界

- 旧站根目录：`C:\wwwroot\yct.shangxiaoguan.top`
- 旧运营消息：`C:\wwwroot\yct.shangxiaoguan.top\data\content_data.js`
- 旧独立页面：`C:\wwwroot\yct.shangxiaoguan.top\content\*.html`
- 新版稳定目录：`C:\wwwroot\yct-v2`
- 新版内容库：由生产 `.env` 的 `YCT_CONTENT_STORE_PATH` 指定，当前应为 `C:\wwwroot\yct-v2\.yct-data\content-store.json`

旧运营消息使用稳定的 `content:<序号>:<标题>` ID。能解析到独立 HTML 页面的消息使用 HTML 转换后的完整 Markdown；其他消息使用原正文、摘要或标题回退。HTML 页面是运营消息的正文增强，不会额外生成第二条记录。

已存在相同 `contentId` 时只跳过，绝不修改其标题、分类、正文、素材、状态或发布时间。因此已经人工接管、恢复、编辑或发布的旧内容不会被覆盖，WordPress 导入记录也不会因本迁移被重置。

迁移出的草稿不会立刻替代公开旧消息。公开读取规则是：草稿、待审核和已批准但未发布的本地记录继续让同 ID 旧消息对外显示；本地记录正式发布后接管展示；本地记录归档后屏蔽同 ID 旧消息。这样迁移与人工审核可以分批进行，但当旧数据源本身不可用时，尚未发布的草稿也不会自动公开。

状态流转：

```text
旧静态数据 --预览--> ready / skipped_existing
ready --ContentLegacyAdopted--> draft
批次有新增 --ContentLegacyMigrationCompleted--> 迁移结果审计
draft --人工编辑--> draft --ContentSubmitted--> pending_review
```

## 2. 部署前必须调整 `.env`

唯一生产主文件仍是 `C:\wwwroot\yct-v2\.env`。部署包中的 `ENVIRONMENT.example` 只能补充缺失键，不能覆盖生产值或密钥。

确认以下值存在：

```dotenv
YCT_PUBLIC_SITE_URL=https://yct.shangxiaoguan.top
YCT_BASE_PATH=
NEXT_PUBLIC_YCT_BASE_PATH=
YCT_LEGACY_DATA_SOURCE=local
YCT_LEGACY_DATA_DIR=C:\wwwroot\yct.shangxiaoguan.top\data
YCT_LEGACY_PUBLIC_BASE_URL=https://yct.shangxiaoguan.top
YCT_INTERNAL_TASK_TOKEN=<保留服务器现有密钥>
YCT_CONTENT_STORE_PATH=C:\wwwroot\yct-v2\.yct-data\content-store.json
```

根路径部署后使用 `remote` 会让 Node 通过公开域名反向请求同一台服务器，容易受到 Nginx 路由、DNS、TLS、缓存或自反代影响。生产读取旧数据应使用 `local`；公开 `/data/` 能访问不代表服务端自取一定可靠。

修改 `.env` 前先备份，禁止把完整文件或 `YCT_INTERNAL_TASK_TOKEN` 输出到终端记录：

```powershell
$yctEnv = 'C:\wwwroot\yct-v2\.env'
$yctEnvBackup = "C:\wwwroot\yct-v2\.env.before-legacy-content-$(Get-Date -Format yyyyMMdd-HHmmss)"
Copy-Item -LiteralPath $yctEnv -Destination $yctEnvBackup
```

还要检查是否有后置文件覆盖这些键：

```powershell
$yctKeys = @(
  'YCT_LEGACY_DATA_SOURCE',
  'YCT_LEGACY_DATA_DIR',
  'YCT_LEGACY_PUBLIC_BASE_URL',
  'YCT_CONTENT_STORE_PATH'
)

Get-ChildItem -LiteralPath 'C:\wwwroot\yct-v2' -Force -File |
  Where-Object { $_.Name -like '.env*' } |
  ForEach-Object {
    $yctFile = $_
    Get-Content -LiteralPath $yctFile.FullName -Encoding UTF8 |
      ForEach-Object {
        if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$' -and $Matches[1] -in $yctKeys) {
          [pscustomobject]@{ File = $yctFile.Name; Key = $Matches[1]; Value = $Matches[2] }
        }
      }
  } | Format-Table -AutoSize
```

如果 `.env.local` 或 `.env.production.local` 仍把数据源改回 `remote`，应修正或移除该重复键。修改后必须重启 Node，运行中的进程不会自动重新读取 `.env`。

## 3. 部署新包

把新部署包解压到正式目录以外，例如 `C:\wwwroot\yct-release-时间戳`。不要覆盖解压到旧 `.next`。

先停止 3300 端口的 Web 进程、玩家位置采集器和其他会写 `.yct-data` 的计划任务，再备份运行态：

```powershell
$yctStamp = Get-Date -Format yyyyMMdd-HHmmss
$yctBackup = "C:\wwwroot\yct-backup-before-legacy-content-$yctStamp"
New-Item -ItemType Directory -Path $yctBackup | Out-Null
Copy-Item -LiteralPath 'C:\wwwroot\yct-v2\.env' -Destination $yctBackup
Copy-Item -LiteralPath 'C:\wwwroot\yct-v2\.yct-data' -Destination $yctBackup -Recurse
```

在解压目录执行普通根路径部署：

```powershell
Set-Location 'C:\wwwroot\yct-release-时间戳'

powershell -NoProfile -ExecutionPolicy Bypass `
  -File '.\deploy-yct-web.ps1' `
  -TargetRoot 'C:\wwwroot\yct-v2' `
  -BasePath '/'
```

部署脚本会保留生产 `.env*` 与 `.yct-data`，并只补充示例中缺失的环境变量。部署后再次确认第 2 节的本地旧数据配置，然后启动：

```powershell
Set-Location 'C:\wwwroot\yct-v2'

powershell -NoProfile -ExecutionPolicy Bypass `
  -File '.\start-yct-web.ps1' `
  -Port 3300 `
  -HostName 127.0.0.1 `
  -BasePath '/' `
  -NodePath 'C:\node-v24\node.exe'
```

先执行内网烟雾检查，不要直接开始写入：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File '.\check-yct-web-smoke.ps1' `
  -Origin 'http://127.0.0.1:3300' `
  -BasePath '/' `
  -SkipLdpass
```

## 4. 预览与正式迁移

默认命令只预览，不写内容库：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File '.\migrate-yct-legacy-content.ps1' `
  -Origin 'http://127.0.0.1:3300' `
  -BasePath '/' `
  -EnvironmentRoot 'C:\wwwroot\yct-v2'
```

2026-08-03 的真实只读预览为 35 条候选，其中 4 条带 HTML 正文。这个数量用于发现明显配置错误，不作为硬编码约束；旧站继续更新时数量可以变化。Codex CLI 应把 `summary` 和所有非空 `warnings` 回报给操作者。重点检查：

- `candidateCount` 不是 0，且与旧 `content_data.js` 的实际条目数一致。
- `htmlPageCount` 与仍存在的 `content/*.html` 引用数量一致。
- `skippedExistingCount` 包含此前已经接管的 `content:*` 记录。
- `warningCount` 若非 0，先阅读对应条目，不要直接 `-Apply`。

确认预览后，在 Web 单实例运行、后台无人编辑内容的维护窗口执行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File '.\migrate-yct-legacy-content.ps1' `
  -Origin 'http://127.0.0.1:3300' `
  -BasePath '/' `
  -EnvironmentRoot 'C:\wwwroot\yct-v2' `
  -Apply
```

正式迁移只创建缺失草稿。脚本会拒绝 `YCT_LEGACY_DATA_SOURCE=remote`、缺失 `content_data.js`、缺失旧 `content` 目录或缺失内部任务令牌的环境。

## 5. 验收与幂等复跑

记录执行前后的内容数量和状态：

```powershell
$yctStore = 'C:\wwwroot\yct-v2\.yct-data\content-store.json'
$yctContent = Get-Content -LiteralPath $yctStore -Raw -Encoding UTF8 | ConvertFrom-Json

[pscustomobject]@{
  Records = @($yctContent.records).Count
  LegacyRecords = @($yctContent.records | Where-Object { $_.contentId -like 'content:*' }).Count
}

$yctContent.records |
  Where-Object { $_.contentId -like 'content:*' } |
  Group-Object { $_.revision.status } |
  Select-Object Name, Count
```

验收条件：

- 总记录数只增加正式结果中的 `createdCount`。
- 新建的 `content:*` 全部为 `draft`，没有自动发布。
- 已存在记录的状态、标题和正文保持不变。
- HTML 页面候选的 `markdownLength` 明显大于摘要回退项，正文图片指向 `/legacy-assets/...`。
- 后台 `/admin/operations` 能筛选并编辑这些草稿，分类可人工调整。

随后再次运行一次预览，再运行一次 `-Apply`。预期第二次 `createdCount=0`，全部候选为 `skipped_existing`；这一步验证迁移幂等，不会复制文章。

## 6. 回滚与保留旧站

若迁移结果不符合预期，停止 Web 与写任务后，同时恢复第 3 节备份的 `.yct-data` 和 `.env`，再重启。不要在 Web 运行时直接用旧 JSON 覆盖内容库。

本次迁移完成后仍不能删除 `C:\wwwroot\yct.shangxiaoguan.top`，也不能关闭 Nginx 的 `/data/`、`/content/` 等旧静态兼容路由。当前交通、地图及外部历史链接仍可能依赖这些文件；本迁移只消除“运营内容展示必须实时读取旧 `content_data.js`”这一项依赖。

高频踩坑：

- 同时运行两个 Node 实例写同一份 JSON 内容库，会发生后写覆盖先写。迁移窗口只保留一个 Web 实例。
- 看到旧记录内容不完整后直接强制覆盖，会抹掉已经人工编辑的版本。本实现故意只跳过；需要补正文时在后台人工合并。
- 只备份 `content-store.json` 而不备份事件 Outbox，回滚后审计事件可能与内容状态不一致，因此备份和恢复整个 `.yct-data`。
- 把旧静态目录复制进每个部署包，会让新旧版本内容漂移且包体不断膨胀。旧站继续作为独立只读来源，正式内容写入稳定 `.yct-data`。
