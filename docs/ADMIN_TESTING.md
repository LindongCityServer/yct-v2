# 管理员侧测试说明

更新时间：2026-07-07

本文档记录当前阶段如何测试雨城通 v2 的后台功能。后台身份来自真实 `ldpass` 会话，YCT 只维护本地管理员成员记录；当前不提供假登录、模拟管理员或绕过 `ldpass` 的测试入口。

## 1. 前置条件

- 已配置 `LDPASS_BASE_URL` 与 `LDPASS_CLIENT_ID`。
- `ldpass` 中已有一个可登录的 Active 用户。
- 测试用户在 `ldpass` 中完成登录后，YCT 能通过 `client-session` 读取到该用户。
- 本地或服务器运行目录可写入 `.yct-data/`。

如果没有配置 `ldpass`，后台 API 和票务订单写接口应返回 `ldpass_not_configured`，这属于正确的安全边界。

如果账号页回跳后显示 `session_cookie_missing` 或“雨城通没有收到临东通共享登录 Cookie”，优先检查 `ldpass` 生产环境是否配置了 `AUTH_COOKIE_DOMAIN=.shangxiaoguan.top`，并在重启 `ldpass` 后退出再重新登录。只在 `ldpass` 域名下能读到登录态、但 YCT 回调拿不到 `ldpass_session` 时，后台身份也无法建立。

## 2. 初始化首位管理员

拿到测试用户的 `ldpassUserId` 后，在项目根目录运行：

```powershell
pnpm admin:init <ldpassUserId>
```

该命令会写入 `.yct-data/admin-memberships.json`。这个文件属于运行时数据，不应提交到 GitHub。

## 3. 启动与登录

本地预览统一使用固定脚本：

```powershell
pnpm web:dev:restart
pnpm web:dev:status
```

打开 `http://127.0.0.1:3300/account`，通过临东通入口登录。登录后可用 `/api/account/status` 验证：

- `authenticated` 应为登录态。
- 管理员用户应返回后台相关入口和待办计数。
- 普通用户不应暴露管理员待办。

如果本地或服务器近期刚替换过部署包，建议先确认当前实例是不是目标构建：

```powershell
Invoke-WebRequest -Uri "http://127.0.0.1:3300/api/health?check=$(Get-Date -Format yyyyMMddHHmmss)" -UseBasicParsing |
  Select-Object -ExpandProperty Content
```

返回 JSON 中应能看到当前 `buildId` 与 `basePath`。如果服务器是挂在 `/v2` 反代下，线上验收时可改为：

```powershell
Invoke-WebRequest -Uri "https://yct.shangxiaoguan.top/v2/api/health?check=$(Get-Date -Format yyyyMMddHHmmss)" -UseBasicParsing -Headers @{ "Cache-Control" = "no-cache"; "Pragma" = "no-cache" } |
  Select-Object -ExpandProperty Content
```

若怀疑 `ldpass` 登录仍落到旧实例或错误域名，再补一条直接检查登录入口：

```powershell
curl.exe -I "https://yct.shangxiaoguan.top/v2/api/auth/ldpass/start?check=$(Get-Date -Format yyyyMMddHHmmss)"
```

期望结果：

- `location` 里的 `redirect_uri=` 指向 `https://yct.shangxiaoguan.top/v2/auth/ldpass/callback`
- `set-cookie` 同时包含 `yct.ldpass_state` 与 `yct.ldpass_return_origin`

登录回跳后如果账号页仍显示会话不可用：

- `ldpass_not_configured`：检查 YCT 部署目录根下 `.env` 是否包含 `LDPASS_BASE_URL`、`LDPASS_CLIENT_ID`。
- `session_cookie_missing`：检查 `ldpass` 的 `AUTH_COOKIE_DOMAIN` 与浏览器中旧 host-only Cookie 是否已经清理。
- `session_unavailable_localhost`：本地地址不能读取共享登录 Cookie，改用同主域测试环境或只验证回调地址是否登记正确。
- `session_unavailable`：YCT 已收到疑似共享 Cookie，但 `ldpass client-session` 未返回 Active 用户；检查用户状态、`client_id`、允许来源和 `ldpass` 会话是否仍有效。

## 4. 后台页面入口

当前已实现的后台页面：

- `/admin/operations`：运营内容、首页强提醒、运营提醒投递预览、旧内容素材、旧专题迁移预览。
- `/admin/services`：更多服务入口草稿、审核和发布。
- `/admin/transit`：旧线路数据导入、审核、发布，以及交通方式/可排班服务 Profile。
- `/admin/map-poi`：公开 POI 投稿审核和发布。

这些页面都需要真实 `ldpass` 登录态和本地管理员成员记录。未登录、未配置 `ldpass` 或非管理员用户访问时，应看到鉴权失败或权限不足，而不是后台数据。

## 5. 最小验证路径

建议按以下顺序测试：

1. 访问 `/api/account/status`，确认当前账号是管理员。
2. 访问 `/admin/operations`，创建一条 Markdown 草稿，提交审核，通过并发布，确认首页和 `/api/operations/feed` 只出现已发布内容。
3. 在 `/admin/operations` 配置一条首页强提醒规则，确认首页出现对应提醒卡片；如果规则关联的是运营内容，未公开或已过期内容不应继续出现在首页强提醒中。若旧站 `ltcx/stop.txt` 可读，还应在“运营提醒投递预览”或首页看到自动生成的“客运调整”候选，无需再手工录入同一条公告。
4. 在同一页面查看“运营提醒投递预览”：已开启“运营提醒”且有活跃浏览器 Push 订阅的登录用户应进入 `queued`；已开启但没有订阅的用户应进入 `skipped`；关闭运营提醒的用户不应进入当前投递队列。自动客运公告候选与手工规则候选应一起参与计算。
5. 在“公告源同步”区点击“同步公告源”后，应能看到旧客运公告源的最近检查时间、候选数量，以及必要时的“最近请求重算”时间；若旧 `ltcx/stop.txt` 内容未变化，同步结果应提示无需重算。点击“强制同步并重算”时，即使公告签名未变化，也应更新“最近请求重算”时间。
6. 在账号设置里切换“运营提醒”通知类型、登记浏览器 Push 订阅或撤销订阅后，回到 `/admin/operations` 刷新“运营提醒投递预览”，确认该用户的运营提醒投递结果会自动重算，旧的无效 `queued` / `skipped` 记录会被标记为 `cancelled`。
7. 如需验证全量重算，在 `/admin/operations` 的“运营提醒投递预览”里点击“重算投递”，确认不修改规则正文也能重新触发一次 `operations` 类型投递计算；适合排查规则、用户偏好和设备订阅是否已经同步到当前运行实例。
8. 点击“运行统一任务”后，应能在同一区块看到最近一轮任务结果摘要：公告源状态、内容型提醒可见性状态、事件重放数、通知处理数、通知失败数和票务过期清理数；如果当前没有待处理事件或到期通知，事件/通知计数允许为 `0`。
9. 最近统一任务卡片需要直接给出任务级摘要状态；当公告源不可用/未配置、事件重放失败数大于 0，或通知失败数大于 0 时，应表现为“有告警”，其余情况表现为“正常”。
10. 连续运行几次统一任务后，后台“最近统一任务”列表应保留最近几次摘要，并区分“管理员触发”还是“系统触发”；历史项只要求展示聚合结果，不需要回放每条通知明细。若存在定时发布内容被首页强提醒规则引用，到点前内容型提醒候选应为 `0`，到点后再次运行统一任务时应能看到“内容型提醒可见性”从无变化或未检查变为已变化，并请求一次运营提醒重算。
7. 访问 `/admin/services`，创建一个服务入口草稿，提交审核，通过并发布，确认 `/services` 和 `/api/services/entries` 出现已发布入口。
8. 访问 `/admin/transit`，导入旧站线路数据，查看校验摘要，提交审核，通过并发布，确认 `/api/transit/overview` 优先读取已发布版本。
9. 使用普通登录用户提交 POI 后，再访问 `/admin/map-poi` 审核并发布，确认 `/api/map/markers` 合并已发布 POI。

## 6. 需要特别检查的安全边界

- 未登录用户不能访问后台写接口。
- 非管理员用户不能访问后台写接口。
- 后台审核、发布和上传素材必须写入本地仓储并发出对应事件。
- `.yct-data/`、上传素材目录、真实 `.env` 和管理员成员文件不能进入 Git。
- Service Worker 不缓存 `/admin`、`/auth`、`/api/auth` 和 `/api/admin`。

## 7. 当前限制

- 第一阶段管理员角色暂不细分，只有本地管理员成员判断。
- 管理员 PIN 二次确认来源仍待确认。
- 本地 `.yct-data` 仓储只适合开发和单机验证，后续需要替换为数据库和 Transactional Outbox。
- 票务订单草稿接口已存在，但前台不直接启用购票按钮；真实票券、核销、退票和对账仍待接入 `ldpass`。
