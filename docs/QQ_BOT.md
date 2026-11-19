# QQ 机器人接入（问一问）

更新时间：2026-11-17

本文说明如何把雨城通「问一问」接到 QQ 官方机器人：平台侧需要准备什么、配置文件怎么写、
Windows 服务器怎么部署、出错时先看哪里，以及服务器上的 `codex` 能帮到什么程度。

代码在 [`integrations/qq-bot`](../integrations/qq-bot/README.md)，是一个**独立的 Node.js 进程**，
不进入 Next.js 部署包；卡片在机器人本地渲染，网页发版不会改变机器人发出的卡片。

随机数、算式、中文电码、GB2312、天气、IP 属地、历史上的今天、对对联、随机地点和服务器人数这些快捷指令不走问一问，
它们的用法、外部接口和部署注意见 [QQ_BOT_COMMANDS.md](./QQ_BOT_COMMANDS.md)。

## 1. 接入方式

```text
QQ 群 / 单聊
   │  ① 群里 @机器人，或直接给机器人发单聊消息
   ▼
QQ 开放平台网关（wss://api.bot.qq.com/websocket/）
   │  ② GROUP_AT_MESSAGE_CREATE / C2C_MESSAGE_CREATE
   ▼
integrations/qq-bot（常驻 Node 进程）
   │  ③ POST http://127.0.0.1:3300/api/assistant/chat（SSE）
   ▼
雨城通 Next.js：检索、工具调用、模型回答
   │  ④ SSE：meta / delta / references / done
   ▼
机器人转成 QQ 纯文本，用 msg_id + msg_seq 被动回复
```

选择 WebSocket 而不是 Webhook 的原因：

- 只需要**出站** 443 连接，不用公网回调地址、不用给机器人单独配 HTTPS 证书。
- 不和现有 Next.js 服务的路由、反代、鉴权混在一起，网页发版不受影响。
- 机器人必须保持 WebSocket 在线才能调用发消息接口，常驻进程本来就要维持连接。

问一问本身没有新增接口：机器人调用的是网页端同一个 `/api/assistant/chat`，
提示词、检索和工具都和站内一致，模型 Key 放在机器人自己的 `.env` 里。

区别只在回答形式。网页 `/ask` 面向阅读，会给 Markdown、引用编号、结构化卡片和追问建议；
QQ 是聊天窗口，长回答会刷屏、Markdown 符号会原样显示、引用编号也没有可点的地方。因此机器人：

1. 在请求里带 `channel: 'qq-group' | 'qq-c2c'`，服务端在系统提示末尾追加聊天风格规则：
   先给结论、约 120-180/150-220 字、纯文本、不输出引用编号和链接、不提网页操作、同类条目最多列 3 个。
2. 回答超过约 240 字时，机器人会再调用一次模型把它改写成 180 字左右的群聊消息
   （`QQ_BOT_CONDENSE`）；改写失败或关闭时，本地按整句取舍：保留结论和要点，整段舍弃后面的解释。
3. `QQ_BOT_STYLE=chat` 时还有 360 字的硬上限（`QQ_BOT_CHAT_MAX_CHARS`），到上限也只在完整句子处停，
   不补省略号；同时删掉“打开入口/到页面上点筛选器”这类网页操作说明，默认不附「参考：」标题。
4. 如果模型仍然输出了网页版的 ```ui 卡片指令，机器人会按引用把卡片还原成
   「· 地点名」「线路：A → B → C」「· 班次（08:40 → 09:20）」，而不是丢掉整块，
   避免正文出现“附近有 3 家超市：”后面什么都没有。
5. 客户端始终会去掉链接（包括 `www.` 和裸域名），把 Markdown 表格转成
   「· 170路：首班 06:00，末班 21:30」这样的自然语言列表，避免群里出现竖线和长网址。

网页端不传 `channel`，提示词和输出完全不变。机器人也要兼容旧版网页：即使服务端还没更新，
最坏情况只是回答仍偏长，客户端会先精炼、再按整句取舍，不会截半句。

## 2. 平台侧准备（一次性）

以下操作只能在 [QQ 开放平台](https://q.qq.com) 完成，`codex` 或任何本地脚本都代替不了。

1. **创建机器人**：`q.qq.com` → 创建机器人 → 在「开发设置」里取得 `AppID` 和 `AppSecret`。
2. **申请事件权限**：在机器人管理端的事件订阅/权限页面勾选「群聊消息」和「单聊消息」，
   对应 `GROUP_AND_C2C_EVENT (1 << 25)`。没有权限时连接会直接以 `4013/4014` 关闭。
3. **配置沙箱**：机器人未上线时只能连沙箱环境（否则报 `4914`）。在沙箱配置里加入测试群或测试成员，
   先用沙箱把流程跑通，再提交上线审核。
4. **把机器人拉进群**：由群主或管理员在群设置里添加机器人；单聊则由用户从机器人资料卡发起。
   机器人不在群里时发消息会报 `40034101/40054003`。
5. **不需要 Markdown / URL 权限**：本适配只发纯文本和图片消息，且默认去掉回答里的链接，避免 `40054010`。
   手机 QQ 对 Markdown 图片兼容性差，回答配图和指令卡片都改为独立图片消息；群聊里图片走主动消息，
   不占用 `msg_seq`，因此文字仍然只 @ 发起者一次。

官方文档：

- [接入总览](https://bot.q.qq.com/wiki/develop/api-v2/)
- [获取 access_token](https://bot.q.qq.com/wiki/develop/api-v2/dev-prepare/access-token.html)
- [WebSocket 方式](https://bot.q.qq.com/wiki/develop/api-v2/dev-prepare/event-emit/websocket.html)
- [事件与 Intents](https://bot.q.qq.com/wiki/develop/api-v2/dev-prepare/event-emit/payload.html)
- [发送群聊消息](https://bot.q.qq.com/wiki/develop/api-v2/autogen/api/v2_groups_group_openid_messages.post.html)
- [发送单聊消息](https://bot.q.qq.com/wiki/develop/api-v2/autogen/api/v2_users_user_openid_messages.post.html)

## 3. 配置文件

编辑 [`integrations/qq-bot/.env`](../integrations/qq-bot/.env)（已被 `.gitignore` 忽略）。
同名进程环境变量优先于文件内容，方便以后用 PM2、计划任务或密钥管理工具注入。

### 必填

| 配置项              | 说明                                                              |
| ------------------- | ----------------------------------------------------------------- |
| `QQ_BOT_APP_ID`     | QQ 开放平台机器人 AppID                                           |
| `QQ_BOT_APP_SECRET` | QQ 开放平台机器人 AppSecret                                       |
| `YCT_ASSISTANT_KEY` | 问一问使用的模型 API Key（DeepSeek / GLM / MiMo），不是 QQ 的密钥 |

### 常用

| 配置项                       | 默认值                    | 说明                                                                   |
| ---------------------------- | ------------------------- | ---------------------------------------------------------------------- |
| `YCT_BASE_URL`               | `http://127.0.0.1:3300`   | 网页服务地址；同机部署用本机端口，跨机用公网 `https://` 地址           |
| `YCT_ASSISTANT_PROVIDER`     | `deepseek`                | `deepseek` / `glm` / `mimo`                                            |
| `YCT_ASSISTANT_MODEL`        | `deepseek-v4-flash`       | 模型名，需与网页端支持的模型一致                                       |
| `YCT_ASSISTANT_LOCALE`       | `zh-CN`                   | `zh-CN` / `zh-Hant` / `en`                                             |
| `YCT_PUBLIC_BASE_URL`        | 空                        | 站点公网 HTTPS 地址；用于回答配图，指令卡片不再需要                    |
| `LDPASS_API_BASE_URL`        | 空                        | 临东通 API 根地址；QQ 绑定功能需要                                     |
| `QQ_BOT_LINK_SECRET`         | 空                        | 临东通内部 QQ 绑定接口的 Bearer secret，必须与临东通一致               |     | `QQ_BOT_GROUP_ALLOWLIST` | 空  | 只响应这些群 openid，逗号或空格分隔；空表示不限制 |
| `QQ_BOT_USER_QPM`            | `6`                       | 每个用户每分钟最多提问次数                                             |
| `QQ_BOT_GROUP_QPM`           | `20`                      | 每个群每分钟最多提问次数                                               |
| `QQ_BOT_STYLE`               | `chat`                    | `chat` 为简短聊天风格；`full` 使用网页版完整格式                       |
| `QQ_BOT_CHAT_MAX_CHARS`      | `360`                     | chat 模式下客户端兜底上限；提示词已经要求更短                          |
| `QQ_BOT_CONDENSE`            | `1`                       | 长回答超过阈值时再调用一次模型精炼，关掉可省一次调用                   |
| `QQ_BOT_CONDENSE_CHARS`      | `180`                     | 精炼目标字数；触发阈值约为该值 + 60 字                                 |
| `QQ_BOT_SEGMENT_CHARS`       | `900`                     | 单条 QQ 消息的字数上限，超长会切段                                     |
| `QQ_BOT_ACK`                 | `1`                       | 先发「正在查资料」提示；群聊占一次被动回复，单聊用输入中状态           |
| `QQ_BOT_APPEND_SOURCES`      | `0`（chat）/ `1`（full）  | 在回答末尾附上参考标题（不带链接）                                     |
| `QQ_BOT_LINKS`               | `0`                       | 是否保留回答里的 URL；没申请到 URL 权限时保持关闭                      |
| `QQ_BOT_FOLLOWUPS`           | `0`                       | 是否附上模型生成的追问建议                                             |
| `QQ_BOT_ANSWER_TIMEOUT_MS`   | `120000`                  | 单次问一问请求超时                                                     |
| `QQ_BOT_WEATHER_CITY`        | 空                        | `/天气` 默认城市；填真实城市名，例如 `上海`                            |
| `QQ_BOT_AMAP_KEY`            | 空                        | 高德 Web 服务 Key；配置后天气优先走高德，否则回退 wttr.in              |
| `QQ_BOT_STATE_PATH`          | `state/qq-bot-state.json` | 签到、发言统计和运势的本地状态文件；更新时保留该目录                   |
| `QQ_BOT_IMAGES`              | `1`                       | 是否把回答引用里的运营封面作为主动图片发送；需要 `YCT_PUBLIC_BASE_URL` |
| `QQ_BOT_CARDS`               | `1`                       | 是否在机器人本地渲染并发送指令结果卡片                                 |
| `QQ_BOT_CARD_FONT_DIR`       | 空（使用 `assets/fonts`） | 卡片字体目录；部署时可由 `qqbot:card:assets` 生成                      |
| `QQ_BOT_CARD_ASSET_DIR`      | 空（使用 `assets`）       | 卡片品牌图标和格纸模板目录                                             |
| `QQ_BOT_BILIBILI`            | `1`                       | 识别消息里的 B 站视频链接，回复标题、UP 主、链接和封面                 |
| `QQ_BOT_FORTUNE_TEXTS_PATH`  | `data/fortune-texts.txt`  | 今日运势文案，一行一条；修改后重启机器人                               |
| `QQ_BOT_GROUP_NOTICES_PATH`  | `data/group-notices.json` | 按群配置的入群/被踢/退群文案                                           |
| `QQ_BOT_GROUP_ALIASES`       | 空                        | `群openid=旧群号` 映射，把官方 openid 对应到文案配置里的群号           |
| `QQ_BOT_PLAYER_EVENTS`       | `0`                       | 是否轮询站内玩家位置，自动播报玩家进服/退服                            |
| `QQ_BOT_PLAYER_EVENT_GROUPS` | 空                        | 玩家进服/退服播报的群 openid，逗号或空格分隔                           |
| `QQ_BOT_PLAYER_POLL_MS`      | `30000`                   | 玩家位置轮询间隔，最小 10 秒                                           |
| `QQ_BOT_PLAYER_JOIN_TEXT`    | `🟢 {name} 进入了服务器`  | 玩家进服文案，支持 `{name}`                                            |
| `QQ_BOT_PLAYER_LEAVE_TEXT`   | `🔴 {name} 离开了服务器`  | 玩家退服文案，支持 `{name}`                                            |
| `QQ_BOT_EVENT_PORT`          | `0`（关闭）               | 事件桥监听端口；开启后接 OneBot 群消息/进退群和游戏服务器事件          |
| `QQ_BOT_EVENT_BIND`          | `127.0.0.1`               | 事件桥绑定地址；默认只允许本机插件访问                                 |
| `QQ_BOT_EVENT_TOKEN`         | 空                        | 事件桥 Bearer Token；绑定非回环地址时必须设置                          |
| `QQ_BOT_EVENT_GROUP_MAP`     | 空                        | `旧群号=官方群openid` 映射，用于把 OneBot 群事件对到官方群             |
| `QQ_BOT_EVENT_GROUPS`        | 空                        | 游戏服务器聊天/进服/退服广播到的官方群 openid                          |
| `QQ_BOT_IMAGE_HOSTS`         | 空                        | 额外允许的配图域名，逗号分隔；默认只允许站点自己的域名                 |
| `QQ_BOT_LOG_LEVEL`           | `info`                    | `debug` / `info` / `warn` / `error`                                    |

`QQ_BOT_API_BASE`、`QQ_BOT_INTENTS`、`QQ_BOT_MAX_QUESTION_CHARS` 一般不用改。
`QQ_BOT_API_BASE` 默认 `https://api.bot.qq.com`，只有平台域名调整时才需要改。

## 4. 本机自检

在 `integrations/qq-bot` 目录执行（自检不会发消息，只读接口）：

```powershell
node src/index.mjs --check
```

它会依次检查：

1. `.env` 必填项、地址和数值范围；
2. QQ `access_token` 能否获取（只打印前几位）；
3. `/gateway` 能否拿到网关地址；
4. `YCT_BASE_URL/api/health` 是否正常，并打印当前 `buildId`。

全部通过时最后一行是「检查通过，可以启动机器人」。

再分别验证回答链路和事件权限：

```powershell
node src/index.mjs --ask "中华路沿线有哪些公交站"
node src/index.mjs --probe
```

- `--ask` 不连接 QQ，直接调用问一问并打印回答、引用和用时；用来确认模型 Key 和网页服务。
- `--probe` 连接网关等待 `READY`，成功后立即退出；用来确认 AppID/AppSecret 和事件权限。
  如果这里报 `4014`，说明「群聊/单聊消息」事件权限还没批下来。

## 5. 部署到 Windows 服务器

### 5.1 目录布局

机器人和网页是两个独立目录，互不覆盖：

```text
C:\wwwroot\yct-v2\   # 现有网页部署目录（不要动）
C:\wwwroot\qq-bot\   # 机器人：把 integrations\qq-bot 整个目录复制过来（含 node_modules 和 assets）
├─ .env                       # 只放在服务器上，不要提交、不要放进网页部署包
├─ src\
├─ data\                      # 电码/GB2312 静态表，随代码更新
├─ state\                     # 签到、发言统计、运势，更新时保留
├─ start-qq-bot.ps1
├─ install-qq-bot-task.ps1
└─ logs\                      # 运行时生成
```

不需要构建 Next.js，也不需要把机器人放进 `apps\web\.next`。首次部署先在仓库根目录执行
`pnpm install`、`pnpm qqbot:card:assets` 和 `pnpm qqbot:card:build`，再把包含
`node_modules`、`assets` 的目录复制过去；机器人只对网页发起本机 HTTP 请求，不需要改 Nginx，
也不需要开放入站端口。推荐运行 `pnpm qqbot:package` 生成 `artifacts/qq-bot-时间戳.zip`，
再把真实 `.env` 单独放进解压后的目录。

### 5.2 上传

本地把 `integrations\qq-bot` 目录压缩后上传，解压到 `C:\wwwroot\qq-bot`，或直接用远程桌面复制。
不要上传本地测试用的 `logs`；`.env` 是否随包上传取决于你是否愿意让密钥经过压缩包，稳妥做法是
在服务器上单独创建 `.env` 并粘贴内容。

服务器上确认 Node 版本（本机器人用到内置 WebSocket，要求 Node.js 22+；当前部署机是 **Node 24**）：

```powershell
C:\node-v24\node.exe -v
```

机器人卡片直接读取 `integrations\qq-bot\assets\card-templates\telegram-row.svg` 和
`answer-sheet-row.svg`，由 `pnpm qqbot:card:assets` 从网页同源资源同步；网页发版不再影响机器人卡片。
如果模板或字体缺失，卡片仍可渲染，但电码/GB2312 格纸底图会退回无底图版本。

### 5.3 先跑自检

```powershell
cd C:\wwwroot\qq-bot
C:\node-v24\node.exe src\index.mjs --check
C:\node-v24\node.exe src\index.mjs --probe
```

### 5.4 常驻启动

临时前台运行（关掉窗口就停）：

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File .\start-qq-bot.ps1 -NodePath "C:\node-v24\node.exe"
```

`start-qq-bot.ps1` 会做四件事：

- 在机器人目录启动 `src\index.mjs`，退出后自动重启；
- 连续快速失败时把重启间隔从 5 秒逐步拉到 60 秒，避免刷爆日志；
- 日志按天写入 `logs\qq-bot-yyyyMMdd.log`，超过 10MB 顺延为 `.1.log`；
- 控制台和日志都按 UTF-8 处理：Node 输出不会被 GBK 解码成乱码，旧版留下的 UTF-16 日志会自动改名为 `.utf16`。

脚本必须用 PowerShell 7（`pwsh`）运行。Windows PowerShell 5.1 会把无 BOM 的 UTF-8 脚本本身读成乱码，
这属于解释器编码问题，不是机器人输出问题。

开机自启（需要管理员权限的 PowerShell）：

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File .\install-qq-bot-task.ps1 -NodePath "C:\node-v24\node.exe"
```

脚本会注册名为 `YCT QQBOT` 的计划任务，使用 `SYSTEM` 账户、开机触发、忽略重复实例。
卸载：

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File .\install-qq-bot-task.ps1 -Uninstall
```

如果不用计划任务，也可以交给宝塔「进程守护管理器」、NSSM 或 PM2：

- 工作目录：`C:\wwwroot\qq-bot`
- 启动命令：`C:\node-v24\node.exe src\index.mjs`
- 机器人自己读取同目录 `.env`，不需要在进程管理器里重复配置变量。

注意：直接用 `node src\index.mjs` 时，工作目录必须是机器人目录，否则找不到 `.env`。
用 `--env` 可以显式指定配置文件路径。

### 5.5 更新与回滚

机器人不写站内数据库；签到、发言统计和运势保存在本地 `state/`，对话上下文只保存在内存里。更新步骤：

1. 停止计划任务或进程（`Stop-ScheduledTask -TaskName "YCT QQBOT"`）；
2. 覆盖 `src\`、`data\` 和两个 `.ps1` 脚本；
3. 保留服务器上的 `.env` 和 `state\`；
4. 重新 `--check`，再启动。

回滚只需要把旧目录换回来。网页更新（`deploy-yct-web.ps1`）不会碰到机器人目录；
但网页重启期间机器人调用会失败，用户会收到「连不上问一问服务」的提示，等网页恢复即可。

## 6. 运行行为与平台限制

| 场景    | 被动回复窗口 | 每条用户消息最多回复 | 本适配的行为                     |
| ------- | ------------ | -------------------- | -------------------------------- |
| QQ 群聊 | 5 分钟       | 5 次                 | 先发提示占 1 次，答案最多 4 段   |
| QQ 单聊 | 60 分钟      | 4 次                 | 输入中状态占 1 次，答案最多 3 段 |

- **只做被动回复**：不依赖主动消息配额，也不会在没有人提问时推送。
- **快捷指令**：`/随机`、`/算`、`/电码`、`/gb2312`、`/天气`、`/ip`、`/历史`、`/对联`、`/随机地点`、`/人数` 在本地处理，
  也支持“计算 1+2”“上海天气”“历史上的今天”“菜单”等自然触发词；完整说明见
  [QQ_BOT_COMMANDS.md](./QQ_BOT_COMMANDS.md)。
- **群互动**：签到、签到榜、发言统计/发言榜、今日运势；状态在 `state/`，更新时保留。
- **运势文案**：默认读取 `data/fortune-texts.txt`，一行一条，可直接编辑；状态里只保存文案索引，
  修改文件后重启机器人即可生效。
- **玩家进出播报**：设置 `QQ_BOT_PLAYER_EVENTS=1` 和 `QQ_BOT_PLAYER_EVENT_GROUPS` 后，
  每 `QQ_BOT_PLAYER_POLL_MS` 轮询站内 `/api/map/player-locations`，只在在线名单变化时发消息；
  首次轮询只建基线，不补发历史。
- **B 站链接**：消息里出现 `bilibili.com/video/...` 或 `b23.tv/...` 时，读取视频标题、UP 主、
  标准链接和封面，文字与海报各占一次被动回复；可用 `QQ_BOT_BILIBILI=0` 关闭。
- **群进退群文案**：`data/group-notices.json` 按群配置 `welcome` / `kick` / `leave`，
  支持 `{name}`、`{id}` 和旧文案占位符。官方 QQ 机器人不保证下发普通成员进退群事件；
  若平台不下发，需要由 OneBot/群管事件桥接后再调用对应事件处理。
- **事件桥**：设置 `QQ_BOT_EVENT_PORT` 后监听 `POST /onebot` 和 `POST /server`。
  OneBot 群消息会补全发言统计，进退群通知按 `data/group-notices.json` 发送；
  游戏服务器可以把 `join`、`leave`、`chat` 事件 POST 到 `/server`，由机器人广播到
  `QQ_BOT_EVENT_GROUPS`。事件桥默认只绑定 `127.0.0.1`，非本机访问请设置 Token。
- **群消息统计范围**：官方机器人只收到 `GROUP_AT_MESSAGE_CREATE` 时，统计只能覆盖 @机器人 的消息；
  需要在 QQ 开放平台开通“接收所有消息”，或用 OneBot 事件桥把全部群消息 POST 到 `/onebot`。
  开启事件桥并配置 `QQ_BOT_EVENT_GROUP_MAP` 后，机器人会把该群的全部消息计入统计，并跳过重复的官方 @ 事件。
- **服务器人数**：`/人数` / `/在线人数` 读取站内服务器状态；站内问一问也新增了
  `get_server_status` 工具。状态未知时会明确说“无法确认”，不会把未知当成 0 人。
- **随机地点**：`/随机地点` / `手气不错` 调用站内 `/api/map/random-poi`，返回 POI 文字和分享卡片；
  卡片带地点名、类型、描述、地址、营业时间、坐标和地图链接。

事件桥请求示例：

```http
POST http://127.0.0.1:8765/server
Authorization: Bearer <QQ_BOT_EVENT_TOKEN>
Content-Type: application/json

{"type":"chat","player":"小明","message":"晚上好"}
```

```json
// POST /onebot
{
  "post_type": "message",
  "message_type": "group",
  "group_id": 1062878744,
  "user_id": 10001,
  "sender": { "nickname": "小明" },
  "message_id": 123,
  "raw_message": "大家好"
}
```

- **指令卡片**：除签到、帮助、关于机器人和新对话外，本地指令会在文字后附一张 720px 宽的 PNG，
  版式对齐地图分享卡片（主题色淡面性色块、Material Symbols 图标、原始 `yct-logo-wordmark.svg`
  字标，页脚显示来源、发送人和发送时间）；电码/GB2312 直接使用
  `apps/web/public/card-templates/` 里的 SVG 行模板；需要 `YCT_PUBLIC_BASE_URL` 和
  `QQ_BOT_CARDS=1`，会占用一次被动回复。
- **指令卡片**：`QQ_BOT_CARDS=1` 时，机器人在本地渲染 PNG 并直接上传；不再需要网页卡片路由，
  也不再依赖 `YCT_PUBLIC_BASE_URL`。卡片封面/二维码在机器人进程内预取。
- **回答配图**：运营内容引用带封面时，可在文字后补一张图片（需 `YCT_PUBLIC_BASE_URL` 和
  `QQ_BOT_IMAGES=1`），会占用一次被动回复。
- **路线优先公共交通**：问“怎么走”时先给一条公共交通方案，写明乘坐几路/几号线和换乘点；
  资料里没有公交方案时明确说明“这段没有可用的公共交通方案”，再给步行或打车建议。
- **游客身份**：机器人请求不带站点登录态，也不读取 QQ 用户的站点账号，问一问按游客回答。
- **必须 @ 机器人**：群聊只处理 `GROUP_AT_MESSAGE_CREATE`。如果开放平台开启了「接收所有消息」，
  机器人会看到 `GROUP_MESSAGE_CREATE`，但只在日志里提醒一次，不会逐条回答。
- **去重**：平台可能重复推送同一条消息，机器人按消息 id 在 10 分钟内只回答一次。
- **限流**：默认每个用户 6 次/分钟、每个群 20 次/分钟，全局最多同时处理 3 个问题，
  同一会话排队最多 2 条，超过会直接提示稍后再试。
- **上下文**：群聊按「群 + 用户」、单聊按用户保存最近 3 轮，30 分钟无活动自动过期；
  发送「新对话」「重置」清空，发送「帮助」查看说明。
- **精炼**：回答超过阈值（默认 240 字）时再调用一次模型，改写成 180 字左右的群聊消息；
  失败或关闭时本地按整句取舍。二次调用会增加约 1-3 秒和少量 token，可用 `QQ_BOT_CONDENSE=0` 关闭。
- **长度**：精炼后再按 `QQ_BOT_SEGMENT_CHARS` 切段；硬上限 360 字（`QQ_BOT_CHAT_MAX_CHARS`），
  超出被动回复次数时截断并提示。
- **卡片指令**：网页版的地点列表、线路条、班次卡会按引用还原成纯文本列表；引用缺失时只跳过那一块，
  不会把 JSON 原样发进群里。
- **回答风格**：默认 `chat`，群聊 2-3 句、120-180 字；单聊 3-4 句、150-220 字，不带 Markdown、
  引用编号和链接；用户明确要完整清单时允许稍长。需要网页版那种完整格式时改 `QQ_BOT_STYLE=full`，
  并建议同时打开 `QQ_BOT_APPEND_SOURCES=1`。
- **不提网页操作**：客户端会删掉“打开入口”“到页面上点筛选器”“打开后选择左侧方案”这类句子，
  避免群里出现无法执行的指引；需要详情时只说“在雨城通里搜一下”。
- **链接**：默认去掉所有 URL、`www.` 和裸域名，因为部分机器人未申请 URL 权限会报 `40054010`，
  链接在手机 QQ 群里也不方便点；参考标题仍会保留。只有明确申请到 URL 权限并希望保留时才设
  `QQ_BOT_LINKS=1`。
- **表格**：Markdown 表格会转成「· 对象：列名 值，列名 值」的自然语言列表，不会出现 `|` 和分隔线。
- **日志**：首次收到某个群的消息时会打印群 openid，方便配置 `QQ_BOT_GROUP_ALLOWLIST`。

## 7. 常见问题

| 现象 / 错误码               | 原因                                             | 处理                                                                        |
| --------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------- |
| `4013` / `4014`             | intents 无效或没有权限                           | 在开放平台申请「群聊消息」「单聊消息」事件；确认 `QQ_BOT_INTENTS=33554432`  |
| `4914`                      | 机器人未上线，只能连沙箱                         | 用沙箱成员测试，或提交上线审核                                              |
| `4915`                      | 机器人被封禁                                     | 在开放平台申诉                                                              |
| `--probe` 一直超时          | 服务器出站 443 被拦、网络不通                    | 检查安全组/防火墙的出站 443；本适配不内置代理，需要代理时在系统层解决       |
| `--check` 获取 token 失败   | AppID/AppSecret 错误、含空格或 IP 受限           | 重新复制密钥；确认开放平台没有限制来源 IP                                   |
| `40034128`                  | 被动回复超时或次数用完                           | 模型响应太慢或一次回答段数过多；调小 `QQ_BOT_SEGMENT_CHARS`、检查模型延迟   |
| `40054007` / `40054018`     | 消息长度超限                                     | 调小 `QQ_BOT_SEGMENT_CHARS`（建议 600–900）                                 |
| `304103` / `40034005`       | 回复的消息 ID 已过期                             | 群聊 5 分钟、单聊 60 分钟内回复；检查模型是否过慢或机器人在排队             |
| `40054010`                  | 机器人没有 URL 权限                              | 保持 `QQ_BOT_LINKS=0`；确需发链接时先在开放平台申请                         |
| `40034006`                  | 内容违规                                         | 模型输出被平台拦截，换个问法；必要时在提示词层面收窄                        |
| `40034100`                  | 主动消息频控                                     | 本适配不应出现；检查是否误用了不带 `msg_id` 的发送                          |
| `40034101` / `40054003`     | 机器人不在群 / 被移出                            | 重新把机器人拉进群                                                          |
| `40054005`                  | 消息被去重                                       | 同一 `msg_id + msg_seq` 重复发送；重启后仍出现说明两次提问拿到了同一消息 id |
| 群里 @ 了但没反应           | 没 @、不在白名单、群或成员不在沙箱、事件权限没批 | 看 `logs\qq-bot-*.log` 里是否收到事件；对照第 2 节                          |
| 问一问返回 401              | `YCT_ASSISTANT_KEY` 缺失或失效                   | 重新填 Key，`--ask` 验证                                                    |
| `/天气` 提示城市查不到      | 高德/wttr 没有该地名                             | 把 `QQ_BOT_WEATHER_CITY` 改成真实城市，例如 `上海`                          |
| `/天气` 报 INVALID_USER_KEY | 高德 Key 类型不对、额度用完或启用了域名白名单    | 确认是高德「Web 服务」Key，并在控制台检查配额和域名限制                     |
| `/ip` 或 `/历史` 失败       | 服务器无法出站访问对应接口                       | 检查出站 443；这两个功能失败不影响问一问和其他指令                          |
| 回答「连不上问一问服务」    | 网页进程没起、端口不对、`YCT_BASE_URL` 写错      | 先在服务器上 `Invoke-WebRequest http://127.0.0.1:3300/api/health`           |
| 启动脚本或日志中文乱码      | 用 `powershell.exe` 5.1 运行，或旧日志是 UTF-16  | 改用 `pwsh` 7；脚本已强制 UTF-8，旧日志会自动改名 `.utf16`                  |
| 计划任务启动后没日志        | `node.exe` 路径不对、工作目录不对                | 用绝对路径；先在计划任务里手动「运行」一次看 `logs`                         |

日志里出现 `WebSocket 已关闭：code ...` 时，先对照上表和官方 WebSocket 错误码；
`code 4009`、`4900–4913` 属于正常断线重连范围，机器人会自动 Resume。

## 8. 服务器上的 codex 能帮什么

结论：**codex 适合做运维辅助，不适合负责构建和部署**。

`docs/DEPLOYMENT.md` 已经明确不建议在 2 核 4G 的云服务器上拉仓库跑 Next.js 构建：
构建会同时吃 CPU、内存和 `.next/cache` 磁盘，`codex` 自己也要占内存。机器人本身不需要构建，
但网页发版仍应在本地或 CI 打包，服务器只负责解压、保留运行时数据、重启进程。

适合交给 codex 的事：

1. **读日志定位问题**。例如：

   ```text
   读取 C:\wwwroot\qq-bot\logs\qq-bot-20261117.log，
   找出最后一次断线原因、对应的 QQ 错误码和当时执行的配置项。
   只给结论和需要改的 .env 字段，不要修改任何文件。
   ```

2. **核对配置**。让它执行并解读 `node src/index.mjs --check` 的输出，比对 `--probe` 的报错码。
3. **写只读巡检脚本**。例如每天检查 `/api/health`、机器人进程和最近日志关键字，发现问题只告警。
4. **检查计划任务和路径**。确认 `SYSTEM` 账户下的 `node.exe` 路径、工作目录、日志权限。
5. **整理发布记录**。把本次改了哪些 `.env` 字段、哪个脚本版本记进运维笔记。

不要让 codex 做的事：

- 不要在服务器上 `pnpm install`、`pnpm build` 或重新拉整个仓库；
- 不要让它改 `apps\web\.next`、覆盖网页部署目录；
- 不要把 `.env`、AppSecret、模型 Key 贴进对话、提交到 Git 或写进公开日志；
- 它无法代替你在 QQ 开放平台点权限、加沙箱成员或提交上线审核。

## 9. 安全与运维

- `.env` 只放在服务器机器人目录，配合 NTFS 权限限制为管理员和 `SYSTEM` 可读；
  不要复制进网页部署包，也不要提交到仓库。
- 更换 AppSecret 或模型 Key 后重启机器人（停止计划任务再启动）。
- 模型 Key 有额度，建议上线后配置 `QQ_BOT_GROUP_ALLOWLIST` 和较低的 `QQ_BOT_USER_QPM`。
- 机器人只读问一问，不写数据库、不改站点数据、不读取账号或后台信息。
- 日志会打印群 openid、用户 openid、回答长度和错误码，但不打印 AppSecret、模型 Key 或完整回答。

## 10. 上线检查清单

- [ ] `.env` 三个必填项已填，`--check` 通过
- [ ] `--ask` 能拿到正常回答
- [ ] `--probe` 能收到 `READY`
- [ ] 沙箱群里 @ 机器人能收到答案，日志里有一次完整回答记录
- [ ] 单聊能收到「输入中」状态和答案
- [ ] 计划任务或进程守护已配置，重启服务器后机器人自动上线
- [ ] `logs` 目录有当天日志，磁盘空间足够
- [ ] 按需配置群白名单和限流
- [ ] 记录 AppID、负责人和 Key 的轮换时间（不要记录密钥本身）
