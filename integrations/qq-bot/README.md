# 问一问 QQ 机器人

把雨城通「问一问」接到 QQ 官方机器人：群里 @ 机器人或单聊提问，回答仍由站内
`/api/assistant/chat` 生成，检索、工具和引用与网页端完全一致。

- **本地生图**：QQ 指令卡片在机器人进程内用 `@resvg/resvg-js` 渲染，再以 `file_data` 上传，
  不再依赖网页的 `/api/qq-bot/card`。改卡片只需要重新同步 `card-renderer.mjs` 并重启机器人。
- **独立进程**：不进入 Next.js 部署包，网页发版、重启都不影响机器人进程。
- **只需出站网络**：通过 QQ 网关 WebSocket 收事件，不需要公网回调地址或证书。
- **聊天式回复**：默认 `QQ_BOT_STYLE=chat`，请求会带 `channel` 让问一问按 QQ 语境缩短回答；
  超过约 240 字会再调用一次模型精炼到 180 字左右，失败则本地按整句取舍，最长 360 字。
  需要网页版完整格式时改 `QQ_BOT_STYLE=full`。
- **卡片转文字**：网页版的 `ui` 卡片指令会按引用还原成地点列表、线路站点和班次时间，不会丢内容或发 JSON。
- **无链接、无表格**：URL（含 `www.`、裸域名）会被去掉，Markdown 表格会转成自然语言列表。
- **快捷指令**：`/随机`、`/掷骰子`、`/算`、`/电码`、`/gb2312`、`/天气`、`/ip`、`/历史`、`/对联`；
  也支持自然触发词（`计算 1+2`、`上海天气`、`历史上的今天`、`菜单`）。这些在本地处理，
  不经过问一问，详见 [快捷指令文档](../../docs/QQ_BOT_COMMANDS.md)。
  `/天气` 配置 `QQ_BOT_AMAP_KEY` 时走高德，未配置则回退 wttr.in。
- **群互动**：`签到`、`签到榜`、`发言统计 [天数]`、`发言榜 [天数]`、`今日运势`、`重置运势`；
  状态保存在 `state/`，更新时保留。
- **按群功能开关**：群主和群管理员可以在群里用 `/模块` 关闭本群不需要的指令、问一问范围
  （临东服资料、公交与线路、公告与运营、地图与地点、通用问答），以及进退群提示、玩家进出播报和服务器消息；
  配置在 `state/group-modules.json`，审计在 `state/module-audit.jsonl`。没有配置文件时按注册表默认值：
  日常功能开；玩家进出播报、服务器消息和运维提醒默认关闭，需要群管理员用 `/模块` 单独开启。
  玩家进出还需要在 `.env` 配置 `QQ_BOT_PLAYER_EVENTS=1`，`/模块` 只决定哪些群接收。
  权限、锁定和范围划分见 [按群功能模块](../../docs/QQ_BOT_GROUP_MODULES.md)。
- **运维提醒**：部署脚本调用 `POST /ops`（`QQ_BOT_OPS_TOKEN` 鉴权），向开了
  `/模块 开 运维提醒` 的群发送雨城通/临东通/机器人更新开始与结束通知；手动入口是
  `notify-ops.ps1`。流程见 [运维提醒](../../docs/QQ_BOT_OPS_REMINDER.md)；机器人部署包根目录也会带一份
  `QQ_BOT_OPS_REMINDER.md`。
- **指令卡片**：除签到、帮助、关于、新对话外，本地指令会附一张 720px PNG；
  机器人在本地渲染后直接上传，不需要 `YCT_PUBLIC_BASE_URL`。
- **回答配图**：运营内容引用带封面时，可在文字后补一张图片（需 `YCT_PUBLIC_BASE_URL` 和
  `QQ_BOT_IMAGES=1`），会占用一次被动回复。
- **临东通绑定**：私聊 `/绑定` 生成一次性链接，`/我的绑定` 查询，`/解绑 确认` 解除；
  群里 @机器人 `/绑定` 生成群专属链接，网页显示 6 位确认码后回群 `/确认 482913`；
  群内也支持 `/我的绑定`、`/解绑 确认`，只影响当前群。需要 `LDPASS_API_BASE_URL` 和
  `QQ_BOT_LINK_SECRET`；群绑定链接需要 QQ 开放平台的链接/URL 权限，否则可能报 `40054010`。
- **账号上下文**：配置 `QQ_BOT_CONTEXT_SECRET`（与网页 `YCT_QQ_CONTEXT_SECRET` 一致）后，
  私聊问一问会自动带入绑定的临东通账号，用于当前位置和 Wiki 玩家资料。

完整接入步骤、平台配置和排障见 [docs/QQ_BOT.md](../../docs/QQ_BOT.md)。

## 1. 填密钥

编辑本目录的 `.env`（已被 `.gitignore` 忽略，不会提交）：

```dotenv
QQ_BOT_APP_ID=你的机器人 AppID
QQ_BOT_APP_SECRET=你的机器人 AppSecret
YCT_ASSISTANT_KEY=模型服务商的 API Key
```

`YCT_BASE_URL` 默认是 `http://127.0.0.1:3300`，即网页服务在本机的监听地址。

## 1.1 安装本地生图依赖

卡片渲染使用 `@resvg/resvg-js` 和字体资源。首次部署或升级后执行：

```powershell
pnpm install
pnpm qqbot:card:assets
pnpm qqbot:card:build
```

部署到服务器时，把 `integrations\qq-bot` 整个目录（包含 `node_modules` 和 `assets`）复制过去；
如果服务器不能安装原生依赖，请在相同 Node 版本/操作系统上安装后再复制。

更推荐用 pnpm 生成不含本地 `.env`、`test/` 的自包含目录：

```powershell
pnpm qqbot:package
```

产物在 `artifacts/qq-bot-时间戳.zip`，内有真实 `node_modules`、`assets` 和启动脚本；
部署后把真实 `.env` 单独放进该目录，再运行启动脚本。

## 2. 三步自检

```powershell
node src/index.mjs --check          # 配置 + QQ 凭证 + 网关 + 网页健康
node src/index.mjs --ask "中华路沿线有哪些公交站"   # 不连 QQ，直接测问一问
node src/index.mjs --probe          # 连网关等 READY，确认事件权限
```

## 3. 启动

```powershell
node src/index.mjs
```

Windows 服务器建议用启动脚本常驻（自动重启、按天写 UTF-8 日志）。
脚本需要 PowerShell 7（`pwsh`）：5.1 会把无 BOM 的 UTF-8 脚本读成乱码。

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File .\start-qq-bot.ps1 -NodePath "C:\node-v24\node.exe"
```

需要开机自启时，以管理员身份运行：

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File .\install-qq-bot-task.ps1 -NodePath "C:\node-v24\node.exe"
```

## 文件说明

| 文件                       | 作用                                                         |
| -------------------------- | ------------------------------------------------------------ |
| `src/index.mjs`            | 命令行入口：常驻运行、`--check`、`--probe`、`--ask`          |
| `src/gateway.mjs`          | QQ 网关 WebSocket：Hello/Identify/Resume、心跳、压缩帧、重连 |
| `src/qq-api.mjs`           | access_token、网关地址、群聊/单聊消息、输入状态              |
| `src/assistant-client.mjs` | 调用 `/api/assistant/chat` 并消费 SSE                        |
| `src/condense.mjs`         | 长回答二次精炼（直连模型服务商，失败自动回退）               |
| `src/answer.mjs`           | Markdown 转 QQ 纯文本、表格转列表、按句取舍、分段            |
| `src/bot.mjs`              | 事件处理、去重、限流、被动回复序号、对话上下文               |
| `src/commands.mjs`         | 本地快捷指令分发                                             |
| `src/modules.mjs`          | 按群功能模块注册表、别名和帮助文本                           |
| `src/group-modules.mjs`    | 按群开关存储、优先级、锁定、审计和热加载                     |
| `src/ops-reminder.mjs`     | 运维提醒校验、模板、幂等状态和按群发送                       |
| `src/module-command.mjs`   | `/模块` 命令、权限和变更文案                                 |
| `src/hints.mjs`            | 功能关闭后的提示节流                                         |
| `src/group-link.mjs`       | 群绑定 token 内存缓存、URL token 与确认码解析                |
| `src/card-render.mjs`      | 卡片封面/二维码预处理和本地 PNG 渲染                         |
| `src/card-renderer.mjs`    | 由网页卡片源码生成的本地渲染器，更新卡片后同步重建           |
| `assets/`                  | 字体、品牌图标和格纸模板，由 `qqbot:card:assets` 同步        |
| `src/community.mjs`        | 签到、发言统计、今日运势与本地状态                           |
| `src/images.mjs`           | 从引用里挑选可发送的配图                                     |
| `src/calc.mjs`             | 安全算式求值，不调用 eval                                    |
| `src/random.mjs`           | 随机整数与骰子                                               |
| `src/weather.mjs`          | 高德天气（优先）与 wttr.in 回退                              |
| `src/ip.mjs`               | IP 属地查询（ipwho.is，失败回退 ipapi.co）                   |
| `src/history.mjs`          | 历史上的今天（百度百科按月数据）                             |
| `src/couplet.mjs`          | 对对联提示词与模型调用                                       |
| `src/model-api.mjs`        | 模型服务商兼容接口封装                                       |
| `data/`                    | 中文电码与 GB2312 静态表                                     |
| `state/`                   | 签到、发言统计、运势、按群开关和审计；更新时保留             |
| `src/conversation.mjs`     | 对话记录、限流器、去重集合、会话队列                         |
| `src/config.mjs`           | `.env` 读取与校验                                            |
| `start-qq-bot.ps1`         | Windows 常驻启动脚本（自动重启 + 日志）                      |
| `notify-ops.ps1`           | 手动/部署时向 `/ops` 发运维提醒                              |
| `install-qq-bot-task.ps1`  | 注册/卸载开机计划任务                                        |
| `test/`                    | `node --test test`，不依赖网络和真实 QQ 凭证                 |
