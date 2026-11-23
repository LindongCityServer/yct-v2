# QQ 机器人运维提醒

更新时间：2026-11-23

状态：P0 已实现。群级开关、`/ops` 接口、消息模板、幂等状态和手动通知脚本已经落地；
雨城通/机器人的部署脚本集成、临东通的公网 relay、机器人停机时的独立发信器放在 P1。
本文件会随雨城通网页部署包和机器人部署包各带一份；网页部署包的 `DEPLOYMENT.md` 里也有
“发版时的 QQ 群运维提醒”快捷命令。

## 1. 做什么

雨城通、临东通或 QQ 机器人更新开始/结束时，向**开启了「运维提醒」模块的群**发一条纯文本通知。
默认关闭，群主或群管理员在群里发送：

```text
/模块 开 运维提醒
```

机器人会回复开启成功，并说明会收到哪类通知。发送 `/模块 关 运维提醒` 可关闭。

通知只走 QQ 群主动消息，不@全体，不带链接；一次更新每个群通常收到开始一条、结束类通知一条
（完成、异常、回滚或取消中实际发生的一种）。

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
GroupModuleStore.listEnabledGroups('opsReminder')
   │  只取 /模块 开 运维提醒 的群，旧群号会反查成 group_openid
   ▼
QQ 群消息（msg_type=0，纯文本）
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

# 可选：幂等状态，更新机器人时保留
QQ_BOT_OPS_STATE_PATH=state/ops-reminders.json
```

`QQ_BOT_OPS_TOKEN` 不要写进仓库、部署包或群消息；`notify-ops.ps1` 从环境变量、`-Token`
或 `-TokenFile` 读取。脚本默认请求 `http://127.0.0.1:8765/ops`；`QQ_BOT_EVENT_PORT` 不是
8765 时加 `-Url http://127.0.0.1:<端口>/ops`。不希望通知失败影响部署脚本时加 `-BestEffort`，
它会把缺少 token、请求失败降级为警告并返回成功。

## 4. 请求格式

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
  "version": "2.26.0",
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
  "sent": 2,
  "failed": [],
  "groups": 2
}
```

- `duplicate: true`：同一个 `updateId + phase` 已经发过，不重复发。
- `reason: "no_groups"`：没有群开启「运维提醒」，发送数为 0；不会记成已通知，开启群后可重试。
- 部分群发送失败时 `failed` 里是打码后的群标识，其余群照常发送。

## 5. 文案

开始：

```text
【运维提醒·开始】雨城通
11-23 20:00 开始，预计 10 分钟
版本：2.26.0
影响：网页、登录、地图和机器人问一问可能短暂不可用
说明：车站资料和在线玩家名单
完成后会再发一条恢复通知。
```

完成：

```text
【运维提醒·完成】雨城通已恢复
版本：2.26.0（构建 20261123-203512）
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
已回滚到 2.25.0，服务已恢复。
原因：部署后健康检查未通过
```

取消：

```text
【运维提醒·已取消】雨城通
原定 11-23 20:00 的更新已取消，服务不受影响。
```

临东通、QQ 机器人使用同一模板，只换系统名、默认影响面和版本来源。

## 6. P0 操作流程

### 6.1 雨城通更新

在机器人目录执行（和网页部署在同一台 Windows 服务器）：

```powershell
cd C:\wwwroot\qq-bot

# 1. 开始：先发通知，再停网页进程
.\notify-ops.ps1 -System yct -Phase start -Version 2.26.0 -ExpectedMinutes 10 `
  -Summary "车站资料和在线玩家名单" -UpdateId ops-20261123-200000-a1b2c3d4

# 2. 按现有部署流程停 Web、替换部署目录、启动 Web

# 3. 健康检查通过后发完成
.\notify-ops.ps1 -System yct -Phase end -UpdateId ops-20261123-200000-a1b2c3d4 -Version 2.26.0

# 失败回滚时
.\notify-ops.ps1 -System yct -Phase rolled_back -UpdateId ops-20261123-200000-a1b2c3d4 `
  -Version 2.25.0 -Reason "部署后健康检查未通过"
```

### 6.2 QQ 机器人更新

机器人自己更新时进程是停的，**必须在停之前发开始**：

```powershell
cd C:\wwwroot\qq-bot
.\notify-ops.ps1 -System qqbot -Phase start -Version 2.26.0 -ExpectedMinutes 3 `
  -Summary "运维提醒与群模块显示" -UpdateId ops-20261123-220000-b2c3d4e5

# 停止计划任务，覆盖 src/data/脚本，保留 .env 和 state，--check 通过后启动

.\notify-ops.ps1 -System qqbot -Phase end -UpdateId ops-20261123-220000-b2c3d4e5 -Version 2.26.0

# 新版本起不来：回滚旧版本并启动后
.\notify-ops.ps1 -System qqbot -Phase rolled_back -UpdateId ops-20261123-220000-b2c3d4e5 `
  -Reason "新版本 --check 未通过，已回滚"
```

限制：如果新版本完全起不来、旧版本也无法启动，机器人不会发完成/回滚通知；
需要人工在群里说明，或等 P1 的独立发信器。

### 6.3 临东通更新

临东通是独立服务器，P0 先在雨城通/机器人所在服务器手动执行：

```powershell
cd C:\wwwroot\qq-bot
.\notify-ops.ps1 -System ldpass -Phase start -UpdateId ops-20261123-210000-c3d4e5f6 `
  -Version 2026.11.23 -ExpectedMinutes 15

# 在临东通服务器执行它的更新、重启和健康检查

.\notify-ops.ps1 -System ldpass -Phase end -UpdateId ops-20261123-210000-c3d4e5f6 -Version 2026.11.23
```

P1 再把这段接到临东通部署流水线：由它调用雨城通的公网 relay，再由 relay 转发到机器人回环 `/ops`。

## 7. 验证

```powershell
# 1. 机器人启动时应有事件桥监听日志
#    事件桥已监听 http://127.0.0.1:8765

# 2. 检查 token 和端口
Select-String -Path C:\wwwroot\qq-bot\.env -Pattern 'QQ_BOT_OPS_TOKEN|QQ_BOT_EVENT_PORT'

# 3. 只看请求体、不发消息
.\notify-ops.ps1 -System yct -Phase start -UpdateId test-1 -DryRun

# 4. 发一条测试开始通知；先在测试群 /模块 开 运维提醒
.\notify-ops.ps1 -System yct -Phase start -UpdateId test-1 -Version test -ExpectedMinutes 1

# 5. 再发完成，确认用时和去重
.\notify-ops.ps1 -System yct -Phase end -UpdateId test-1 -Version test
.\notify-ops.ps1 -System yct -Phase end -UpdateId test-1 -Version test   # 应返回 duplicate
```

`state/ops-reminders.json` 会记录最近 100 次、30 天内的通知；重复的 `updateId + phase`
不会重复发群消息。

## 8. 安全边界

- `/ops` 只监听事件桥地址（默认 `127.0.0.1`），不经过公网 Nginx；跨机调用需要显式改 bind、
  设置 token、加防火墙，或走 P1 的雨城通公网 relay。
- `QQ_BOT_OPS_TOKEN` 与 OneBot/游戏服务器的 `QQ_BOT_EVENT_TOKEN` 分开；泄露一个不影响另一个。
- token 为空时 `/ops` 返回 503，不会无鉴权发送。
- 日志只打印打码后的群 openid，不打印 token、版本以外的密钥或完整群号。
- 群主动消息有平台频控；本功能一次更新每群最多 1 条开始 + 1 条结束，不做高频告警。
- `summary`、`reason` 和 `impact` 会原样发到群里，不要写密钥、内部地址、完整群号或未公开的运维细节。
