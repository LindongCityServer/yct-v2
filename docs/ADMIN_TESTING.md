# 管理员侧测试说明

更新时间：2026-07-03

本文档记录当前阶段如何测试雨城通 v2 的后台功能。后台身份来自真实 `ldpass` 会话，YCT 只维护本地管理员成员记录；当前不提供假登录、模拟管理员或绕过 `ldpass` 的测试入口。

## 1. 前置条件

- 已配置 `LDPASS_BASE_URL` 与 `LDPASS_CLIENT_ID`。
- `ldpass` 中已有一个可登录的 Active 用户。
- 测试用户在 `ldpass` 中完成登录后，YCT 能通过 `client-session` 读取到该用户。
- 本地或服务器运行目录可写入 `.yct-data/`。

如果没有配置 `ldpass`，后台 API 和票务订单写接口应返回 `ldpass_not_configured`，这属于正确的安全边界。

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

## 4. 后台页面入口

当前已实现的后台页面：

- `/admin/operations`：运营内容、旧内容素材、旧专题迁移预览。
- `/admin/services`：更多服务入口草稿、审核和发布。
- `/admin/transit`：旧线路数据导入、审核、发布，以及交通方式/可排班服务 Profile。
- `/admin/map-poi`：公开 POI 投稿审核和发布。

这些页面都需要真实 `ldpass` 登录态和本地管理员成员记录。未登录、未配置 `ldpass` 或非管理员用户访问时，应看到鉴权失败或权限不足，而不是后台数据。

## 5. 最小验证路径

建议按以下顺序测试：

1. 访问 `/api/account/status`，确认当前账号是管理员。
2. 访问 `/admin/operations`，创建一条 Markdown 草稿，提交审核，通过并发布，确认首页和 `/api/operations/feed` 只出现已发布内容。
3. 访问 `/admin/services`，创建一个服务入口草稿，提交审核，通过并发布，确认 `/services` 和 `/api/services/entries` 出现已发布入口。
4. 访问 `/admin/transit`，导入旧站线路数据，查看校验摘要，提交审核，通过并发布，确认 `/api/transit/overview` 优先读取已发布版本。
5. 使用普通登录用户提交 POI 后，再访问 `/admin/map-poi` 审核并发布，确认 `/api/map/markers` 合并已发布 POI。

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
