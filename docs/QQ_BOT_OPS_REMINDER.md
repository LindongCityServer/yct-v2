# QQ 机器人运维提醒

更新时间：2026-11-23

状态：P0 已实现。群级开关已移除，运维提醒改为**私聊发给机器人好友**；`/ops` 接口、消息模板、
幂等状态、pending 补发和手动通知脚本已经落地。雨城通/机器人的部署脚本集成、临东通的公网 relay
放在 P1。

## 1. 做什么

雨城通、临东通或 QQ 机器人更新开始/结束时，向**给机器人发过私聊消息的好友**发一条纯文本通知。
个人认证机器人只能让核心管理员加好友，所以接收人实际上就是运维管理员。

通知走 QQ 单聊：

- 不@全体、不带链接；
- 同一次更新每个好友最多收到开始、完成（或异常/回滚/取消）各一条；
- 主动私聊被平台拒绝时，通知写入 pending；好友私聊机器人发送 `/运维` 可以补发。

群里不再有「运维提醒」模块，也不向群发送运维消息。

## 2. 链路

```text
部署脚本 / notify-ops.ps1
   │  POST http://127.0.0.1:<QQ_BOT_EVENT_PORT>/ops
   │  Authorization: Bearer <QQ_BOT_OPS_TOKEN>
   ▼
机器人事件桥 /ops
   │  校验 system / phase / updateId
   │  按 state/ops-reminders.json 去重
   ▼
state/ops-recipients.json（私聊过机器人的好友）
   │  逐个 sendC2CMessage
   ├─ 成功：直接送达
   └─ 失败：写入 pending，私聊 /运维 时可补发
```

## 3. 配置

机器人 `.env`：

```dotenv
# 必填：/ops 的独立 token，至少 16 位随机串；为空时 /ops 关闭
QQ_BOT_OPS_TOKEN=<随机串>

# 必填：事件桥端口；0 时 /ops 不会监听
QQ_BOT_EVENT_PORT=8765
QQ_BOT_EVENT_BIND=127.0.0.1
QQ_BOT_EVENT_TOKEN=<OneBot/游戏服务器用的 token，可留空但非回环必须设置>

# 可选：幂等状态和接收人列表，更新机器人时保留
QQ_BOT_OPS_STATE_PATH=state/ops-reminders.json
QQ_BOT_OPS_RECIPIENT_PATH=state/ops-recipients.json
```

`QQ_BOT_OPS_TOKEN` 不要写进仓库、部署包或群消息；`notify-ops.ps1` 从环境变量、`-Token`
或 `-TokenFile` 读取。脚本默认请求 `http://127.0.0.1:8765/ops`；事件桥端口不是 8765 时加
`-Url http://127.0.0.1:<端口>/ops`。不希望通知失败影响部署脚本时加 `-BestEffort`。

## 4. 接收人怎么来

机器人自动记录两类私聊用户：

1. 给机器人发过任意私聊消息的用户；
2. 触发 `FRIEND_ADD` 的用户（平台下发该事件时）。

不需要手工配置 `user_openid`。当前机器人是**个人认证**，「允许被其他 QQ 用户添加使用」关闭，
只有机器人管理员/开发体验成员能加好友，所以这个列表基本等同于核心管理员。

新增好友后，建议先私聊机器人发一条消息（例如 `/运维`），确保接收人已经被记录。

## 5. 请求格式

```http
POST http://127.0.0.1:8765/ops
Authorization: Bearer <QQ_BOT_OPS_TOKEN>
Content-Type: application/json
```

```json
{
  "system": "yct",
  "phase": "start",
  "updateId": "ops-20261123-200000-a1b2c3d4",
  "version": "2.27.0",
  "buildId": "20261123-203512",
  "summary": "车站资料和在线玩家名单",
  "impact": "网页、登录、地图和机器人问一问可能短暂不可用",
  "expectedMinutes": 10,
  "startedAt": "2026-11-23T20:00:00+08:00"
}
```

字段：

| 字段              | 必填 | 说明                                                     |
| ----------------- | ---- | -------------------------------------------------------- |
| `system`          | 是   | `yct` / `ldpass` / `qqbot`                               |
| `phase`           | 是   | `start` / `end` / `failed` / `rolled_back` / `cancelled` |
| `updateId`        | 是   | 1-80 位，同一次更新的开始和结束必须相同                  |
| `version`         | 否   | 目标版本；缺省时文案省略版本行                           |
| `buildId`         | 否   | 构建号；有版本时附在版本行                               |
| `summary`         | 否   | 更新摘要，最多 120 字；缺省时省略说明行                  |
| `impact`          | 否   | 影响范围；缺省时按系统使用默认文案                       |
| `expectedMinutes` | 否   | 开始阶段预计时长，1-180 分钟                             |
| `reason`          | 否   | 异常/回滚/取消原因，最多 120 字                          |
| `startedAt`       | 否   | 开始时间；结束阶段用来计算用时                           |

成功返回：

```json
{
  "ok": true,
  "duplicate": false,
  "system": "yct",
  "phase": "start",
  "updateId": "ops-20261123-200000-a1b2c3d4",
  "sent": 1,
  "failed": [],
  "failureCodes": [],
  "pending": 0,
  "recipients": 1,
  "hint": ""
}
```

- `duplicate: true`：同一个 `updateId + phase` 已经发过，不重复发。
- `reason: "no_recipients"`：还没有好友私聊过机器人；先让好友私聊机器人一条消息。
- `pending > 0`：部分/全部私聊失败，已保留待补发；好友私聊机器人发送 `/运维` 可补发。
- `failureCodes` / `hint`：例如 `40034105` 会提示检查主动消息权限。

## 6. 文案

开始：

```text
【运维提醒·开始】雨城通
11-23 20:00 开始，预计 10 分钟
版本：2.27.0
影响：网页、登录、地图和机器人问一问可能短暂不可用
说明：车站资料和在线玩家名单
完成后会再发一条恢复通知。
```

完成：

```text
【运维提醒·完成】雨城通已恢复
版本：2.27.0（构建 20261123-203512）
用时：8 分钟
说明：车站资料和在线玩家名单
如仍无法使用，请稍后重试或联系管理员。
```

异常：

```text
【运维提醒·异常】雨城通更新未完成
原因：部署后健康检查未通过，正在排查
服务可能暂时不可用，请稍后再试。
```

回滚：

```text
【运维提醒·已回滚】雨城通
已回滚到 2.26.0，服务已恢复。
原因：部署后健康检查未通过
```

取消：

```text
【运维提醒·已取消】雨城通
原定 11-23 20:00 的更新已取消，服务不受影响。
```

临东通、QQ 机器人使用同一模板，只换系统名、默认影响面和版本来源。

## 7. P0 操作流程

### 7.1 雨城通更新

在机器人目录执行（和网页部署在同一台 Windows 服务器）：

```powershell
cd C:\wwwroot\qq-bot

# 1. 开始：先发开始通知，再停网页进程
.\notify-ops.ps1 -System yct -Phase start -Version 2.27.0 -ExpectedMinutes 10 `
  -UpdateId ops-20261123-200000-a1b2c3d4 -Summary "车站资料和在线玩家名单"

# 2. 按现有部署流程停 Web、替换部署目录、启动 Web

# 3. 健康检查通过后发完成
.\notify-ops.ps1 -System yct -Phase end -UpdateId ops-20261123-200000-a1b2c3d4 -Version 2.27.0

# 失败回滚时
.\notify-ops.ps1 -System yct -Phase rolled_back -UpdateId ops-20261123-200000-a1b2c3d4 `
  -Version 2.26.0 -Reason "部署后健康检查未通过"
```

### 7.2 QQ 机器人更新

机器人自己更新时进程是停的，**必须在停之前发开始**：

```powershell
cd C:\wwwroot\qq-bot
.\notify-ops.ps1 -System qqbot -Phase start -Version 2.27.0 -ExpectedMinutes 3 `
  -UpdateId ops-20261123-220000-b2c3d4e5 -Summary "运维提醒私聊与 pending 补发"

# 停止计划任务，覆盖 src/data/脚本，保留 .env 和 state，--check 通过后启动

.\notify-ops.ps1 -System qqbot -Phase end -UpdateId ops-20261123-220000-b2c3d4e5 -Version 2.27.0

# 新版本起不来：回滚旧版本并启动后
.\notify-ops.ps1 -System qqbot -Phase rolled_back -UpdateId ops-20261123-220000-b2c3d4e5 `
  -Reason "新版本 --check 未通过，已回滚"
```

限制：如果新版本完全起不来、旧版本也无法启动，机器人不会发完成/回滚通知；
需要人工私聊说明，或等 P1 的独立发信器。

### 7.3 临东通更新

临东通是独立服务器，P0 先在雨城通/机器人所在服务器手动执行：

```powershell
cd C:\wwwroot\qq-bot
.\notify-ops.ps1 -System ldpass -Phase start -UpdateId ops-20261123-210000-c3d4e5f6 `
  -Version 2026.11.23 -ExpectedMinutes 15

# 在临东通服务器执行它的更新、重启和健康检查

.\notify-ops.ps1 -System ldpass -Phase end -UpdateId ops-20261123-210000-c3d4e5f6 -Version 2026.11.23
```

P1 再把这段接到临东通部署流水线：由它调用雨城通的公网 relay，再由 relay 转发到机器人回环 `/ops`。

## 8. 平台限制与 40034105

个人认证机器人在控制台无法开启「被添加到任意群聊/提供公开服务」等企业灰度能力；
群主动消息也可能被平台以 `40034105 主动消息发送失败，无权限` 拒绝。

即使改成私聊，主动消息仍可能被拒绝。处理顺序：

1. 机器人管理员在机器人资料页开启「接收机器人推送」/「允许主动发送消息」；
2. 确认机器人已上线、不是仅沙箱；
3. 仍失败时，通知会进入 pending；好友私聊机器人发送 `/运维` 可补发；
4. 要稳定自动推送，需要企业认证/企业灰度/平台白名单，代码无法绕过。

`40034100` 是频控，`40054013` 是用户关闭主动消息，`40034101` / `40054003` 是机器人不在群，
不要和 `40034105` 混在一起。

## 9. 验证

```powershell
# 1. 机器人启动时应有事件桥监听日志
#    事件桥已监听 http://127.0.0.1:8765

# 2. 检查 token 和端口
Select-String -Path C:\wwwroot\qq-bot\.env -Pattern 'QQ_BOT_OPS_TOKEN|QQ_BOT_EVENT_PORT'

# 3. 只看请求体、不发消息
.\notify-ops.ps1 -System yct -Phase start -UpdateId test-1 -DryRun

# 4. 发一条测试开始通知；先私聊机器人发一条消息，确保接收人已记录
.\notify-ops.ps1 -System yct -Phase start -UpdateId test-1 -Version test -ExpectedMinutes 1

# 5. 再发完成，确认用时和去重
.\notify-ops.ps1 -System yct -Phase end -UpdateId test-1 -Version test
.\notify-ops.ps1 -System yct -Phase end -UpdateId test-1 -Version test   # 应返回 duplicate

# 6. 如果提示 pending，私聊机器人发送 /运维 补发
```

`state/ops-reminders.json` 会记录最近 100 次、30 天内的通知和最多 50 条 pending；
重复的 `updateId + phase` 不会重复发私聊消息。

## 10. 安全边界

- `/ops` 只监听事件桥地址（默认 `127.0.0.1`），不经过公网 Nginx；跨机调用需要显式改 bind、
  设置 token、加防火墙，或走 P1 的雨城通公网 relay。
- `QQ_BOT_OPS_TOKEN` 与 OneBot/游戏服务器的 `QQ_BOT_EVENT_TOKEN` 分开；泄露一个不影响另一个。
- token 为空时 `/ops` 返回 503，不会无鉴权发送。
- `state/ops-recipients.json` 保存接收人的 `user_openid`，只在服务器 `state/` 下，更新机器人时保留；
  不要提交到仓库或放进公开日志。
- 日志只打印打码后的 openid，不打印 token 或完整接收人。
- 私聊主动消息也有平台频控；本功能一次更新每个好友最多 1 条开始 + 1 条结束，不做高频告警。
- `summary`、`reason` 和 `impact` 会原样发到私聊，不要写密钥、内部地址或未公开的运维细节。
