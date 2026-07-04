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

如果 zip 压缩在 Windows 上耗时过长或留下 0 字节临时文件，可以改用 `tar.gz`：

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
- 补齐 `apps/web/.next/static` 和 `apps/web/public`。
- 补齐 pnpm workspace 下 Next standalone 可能漏掉的 `@next/*`、`@swc/*` 等运行时依赖。
- 跳过本机上传素材目录 `apps/web/public/content-assets`。
- 不打包 `.env`、`.env.*`、`.yct-data`、日志和本地缓存。
- 在 `artifacts/` 下生成 `yct-web-时间戳.zip`、`yct-web-时间戳.tar.gz` 或 `yct-web-时间戳.tar`。
- 压缩时先写入临时文件，成功后再改名为最终产物，避免失败时留下看似可用的坏包。
- 在 Windows 上生成 zip 时优先使用 `tar.exe`，避免 `Compress-Archive` 处理大量文件时非常慢；需要更稳定的大包压缩时建议使用 `tar.gz`。
- 支持 `-SkipBuild -SkipStaging` 复用已经完成的 `.deploy/web`，只重新生成归档文件。

如果只想验证当前 staging 目录里的 standalone 产物是否完整，而不重新压缩大包，可以使用：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/web-build-artifact.ps1 -BasePath v2 -SkipBuild -SkipStaging -ValidateOnly
```

该校验会检查 staged HTML/RSC 引用的 `_next/static`、图标、manifest 和 service worker 是否存在；当 `BasePath` 为 `/v2` 时，也会拦截没有 `/v2` 前缀的同源静态资源链接。

## 云服务器运行

把 `artifacts/yct-web-*` 上传到服务器并解压到部署目录。不要把新包直接覆盖解压到仍保留旧 `.next` 文件的目录里；Next.js 的 `server.js`、`.next/server` 和 `.next/static` 必须来自同一次构建，否则会出现页面能打开但客户端 chunk 404、路线规划或周边地点等交互失效的问题。推荐做法是先停止旧进程，再解压到一个空目录，确认可用后切换反代；如果只能使用原目录，先备份并清空旧目录中除持久数据外的部署文件。

zip 包可以直接右键解压，`tar.gz` 包可以用：

```powershell
tar -xzf .\yct-web-20260704-xxxxxx.tar.gz -C C:\wwwroot\yct-v2
```

不压缩的 `tar` 包使用：

```powershell
tar -xf .\yct-web-20260704-xxxxxx.tar -C C:\wwwroot\yct-v2
```

解压后运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\start-yct-web.ps1 -Port 3300 -HostName 127.0.0.1 -BasePath v2 -NodePath "C:\node-v22\node.exe"
```

如果未来站点不再挂载 `/v2`，需要重新用空 BasePath 构建，并以空 BasePath 启动。

反代挂载在 `/v2` 时，部署后至少检查以下地址：

```text
https://yct.shangxiaoguan.top/v2/map
https://yct.shangxiaoguan.top/v2/api/map/markers
https://yct.shangxiaoguan.top/v2/_next/static/...
```

如果页面 HTML 里出现 `/_next/static/...` 或 `/api/...` 这类没有 `/v2` 的同源链接，通常表示运行的不是按 `/v2` 构建的包，或云端进程仍指向旧构建。

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

- `.env` 和真实密钥。
- `.yct-data` 本地运行时仓储。
- 后台上传素材目录 `apps/web/public/content-assets`。
- 日志、备份和导入中间文件。

## 后续改进

- 增加正式生产启动/停止脚本，和当前 `web:dev:*` 脚本区分。
- 将 `.yct-data` 替换为数据库与 Transactional Outbox。
- 将后台上传素材迁移到对象存储或共享静态资源目录。
- 增加 GitHub Actions 构建 artifact，避免本机手动打包。
