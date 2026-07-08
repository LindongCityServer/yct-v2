# YCT 与 ldpass 接入说明草案

更新时间：2026-07-07

本文档记录雨城通 v2（Yuchengtong / YCT）需要接入 `ldpass` 的模块、接入方式、需要的数据、建议接口格式和仍待确认的问题。

已查阅的 `ldpass` 参考版本：`75581f6 Refine backoffice actions and asset reload guard`。

## 1. 接入原则

- YCT 不保存 `ldpass` 密码，不复制 `ldpass` 的账号安全体系。
- 登录身份来自 `ldpass`，YCT 只保存本地用户映射、偏好、历史、管理员角色和业务状态。
- YCT 管理员权限由 YCT 自己维护角色表，不直接等同于 `ldpass` 管理员。
- 乘车码、电子票、检票、退票等长期凭证能力优先接入 `ldpass` 卡包/票券系统。
- 所有跨系统状态同步都必须有事件、审计和可重试机制。

## 2. 第一阶段：登录接入

`ldpass` 当前已支持轻量登录回跳和会话校验，适合同一可信业务体系内的 Web 登录态确认。

### 2.1 需要在 ldpass 登记的信息

```ts
export interface LdpassClientApplicationConfig {
  clientId: string;
  name: 'Yuchengtong';
  redirectUris: string[];
  allowedOrigins: string[];
  enabled: boolean;
}
```

需要提供：

- `client_id`。
- YCT 正式站 `redirect_uri`。
- YCT 测试站 `redirect_uri`。
- 允许携带 Cookie 调用会话校验接口的 Origin。
- 应用名称：`Yuchengtong`。

### 2.1.1 当前 YCT `/v2` 测试部署的推荐登记值

当前测试阶段，YCT 通过宝塔反向代理挂载在：

- 站点入口：`https://yct.shangxiaoguan.top/v2`
- 登录回调：`https://yct.shangxiaoguan.top/v2/auth/ldpass/callback`

结合目前已申请到的客户端信息，`ldpass` 后台建议至少登记：

```text
client_id: yuchengtong
应用名称: Yuchengtong
redirect_uri:
  - https://yct.shangxiaoguan.top/v2/auth/ldpass/callback
allowed_origin:
  - https://yct.shangxiaoguan.top
```

注意：

- `redirect_uri` 需要精确到完整路径，当前测试态必须带 `/v2/auth/ldpass/callback`。
- `allowed_origin` 一般只填来源，不带路径；当前测试态通常应写 `https://yct.shangxiaoguan.top`，而不是 `https://yct.shangxiaoguan.top/v2`。
- 如果后续 YCT 从 `/v2` 切回站点根路径，需要在 `ldpass` 侧额外登记根路径回调，例如 `https://yct.shangxiaoguan.top/auth/ldpass/callback`，并同步重新构建不带 `/v2` BasePath 的部署包。
- 如果本地开发需要直接调试轻量登录回跳，建议再单独登记开发环境回调与来源，例如：
  - 不带 BasePath 的本地模式：`http://127.0.0.1:3300/auth/ldpass/callback`
  - 带 `/v2` BasePath 的本地模式：`http://127.0.0.1:3300/v2/auth/ldpass/callback`
  - 对应来源仍然只需要 `http://127.0.0.1:3300`
  不要把生产和本地调试混成同一条配置说明。
- 当前 `/v2` 测试站依赖外层反代把浏览器访问的 `/v2/auth/ldpass/callback` 转发到应用内部的 `/auth/ldpass/callback`。如果反代只覆盖了首页、但没有覆盖认证回调路径，就会表现为 `ldpass` 登录后回跳 404。

### 2.1.2 YCT 运行时必须具备的环境变量

当前代码中，`ldpass` 轻量登录至少依赖以下环境变量：

```text
LDPASS_BASE_URL
LDPASS_CLIENT_ID
YCT_PUBLIC_SITE_URL
```

对应读取位置见 `apps/web/lib/runtime-config.ts`。

约束说明：

- `LDPASS_BASE_URL` 应为 `ldpass` 站点根地址，例如 `https://ldpass.example.com`，而不是带 `/login?...` 的完整登录链接。
- `LDPASS_CLIENT_ID` 应与 `ldpass` 后台登记值一致；当前测试态为 `yuchengtong`。
- `YCT_PUBLIC_SITE_URL` 应指向 YCT 对外访问的站点根，例如当前测试态应为 `https://yct.shangxiaoguan.top`。YCT 的实际回调路径会再由当前 BasePath 组合出 `/v2/auth/ldpass/callback`。
- 反向代理如果会把外网 `https://yct.../v2/...` 转发到内网 `http://127.0.0.1:3300/...`，应尽量保留 `Host`、`X-Forwarded-Host` 和 `X-Forwarded-Proto`。当前 YCT 会优先用这些头判断对外站点，再回退到 `YCT_PUBLIC_SITE_URL`；如果这些头都缺失，回跳地址可能退回内网主机名或本地地址。
- 当前代码即使在反代只保留了 `Host`、没有传入 `X-Forwarded-*` 时，也会优先按外层 `Host` 推导 `redirect_uri`；但如果反代把 `Host` 一并改写成 `127.0.0.1:3300` 或 `localhost:3300`，登录地址仍然会退回本地地址，因此宝塔/Nginx/反代层最好仍显式透传公网 Host。
- 如果反代额外传入 `X-Forwarded-Port: 3300`，公网 `redirect_uri` 可能会被错误拼成 `https://yct.shangxiaoguan.top:3300/...`。新版 YCT 会在 `X-Forwarded-Host` 已是公网域名时忽略这种内部端口；如果确实需要公网非默认端口，请直接把端口写进 `X-Forwarded-Host`。
- 部署包里的 `start-yct-web.ps1` 现在会按 `.env` -> `.env.production` -> `.env.local` -> `.env.production.local` 的顺序导入环境变量，后面的文件会覆盖前面的值，也会覆盖当前 shell 或 PM2 里残留的同名 `YCT_*` / `LDPASS_*` 变量；如果服务器曾经跑过本地地址版本，这一点尤其重要。

排障时要特别注意：

- 这些变量即使在本机 `.env` 中已配置，云端部署目录根下如果没有同样的真实 `.env`，运行时依然会表现为 `ldpass_not_configured`。
- Next standalone 运行时会切到 `apps\web` 作为工作目录；因此部署包里的 `start-yct-web.ps1` 必须先从部署根目录显式导入 `.env*`，否则即使部署根目录有 `.env`，应用也可能仍然显示 `ldpass_not_configured`。
- 如果进程管理器绕过了 `start-yct-web.ps1` 直接执行 `node apps\web\server.js`，Next.js 进程同样可能读不到放在部署根目录的 `.env`。
- `LDPASS_BASE_URL` 或 `LDPASS_CLIENT_ID` 只要其中任一项为空字符串，YCT 就会把 `ldpassConfigured` 判定为 `false`。

### 2.1.3 ldpass 侧必须具备的共享 Cookie 配置

当前 YCT 回调会在服务端读取 `ldpass` 的 `client-session`，因此回调请求里必须带有临东通登录态 Cookie。临东通普通用户登录 Cookie 名为 `ldpass_session`；根据当前 `ldpass` 实现，生产环境只有配置了父域 Cookie 后，浏览器才会把这枚 Cookie 同时发送给 `ldpass.shangxiaoguan.top` 和 `yct.shangxiaoguan.top`。

临东通生产环境建议至少确认：

```text
NODE_ENV=production
AUTH_COOKIE_DOMAIN=.shangxiaoguan.top
```

注意事项：

- 修改 `AUTH_COOKIE_DOMAIN` 后必须重启 `ldpass` 服务，并让测试用户退出后重新登录一次，旧的 host-only Cookie 不会自动变成父域 Cookie。
- 如果浏览器直接请求 `https://ldpass.shangxiaoguan.top/api/auth/client-session?client_id=yuchengtong` 能得到 `authenticated=true`，但 YCT 回跳后仍提示缺少共享 Cookie，通常说明 `ldpass_session` 仍只属于 `ldpass.shangxiaoguan.top`，没有共享到 `.shangxiaoguan.top`。
- 直接打开 YCT 的 `/api/auth/ldpass/client-session` 只能证明 YCT 能连到 `ldpass`，不能单独证明登录态可用；只有在浏览器已经持有共享 `ldpass_session` 的情况下，它才可能返回 `authenticated=true`。
- 新版 YCT 的 `/api/auth/ldpass/client-session` 会额外返回 `yctDiagnostics`。如果返回 `authenticated:false`，但 `clientApplication.clientId` 正确且 `yctDiagnostics.ldpassSessionCookiePresent:false`，通常不是 YCT `.env` 为空，而是当前请求没有把 `ldpass_session` 带到 YCT 域名。

### 2.2 登录流程

```text
YCT 前端
  -> GET ldpass /login?client_id=...&redirect_uri=...&state=...
  -> 用户在 ldpass 登录
  -> ldpass 回跳 YCT redirect_uri，并带回 state
  -> YCT 校验 state
  -> YCT 后端/前端调用 ldpass client-session
  -> YCT 创建或更新本地 UserLink
```

当前可用会话校验接口：

```http
GET /api/auth/client-session?client_id=<client_id>
```

YCT 已建立同源 API 壳：

```http
GET /api/auth/ldpass/login-url?redirect_uri=<redirect_uri>&state=<state>
GET /api/auth/ldpass/client-session
GET /api/auth/ldpass/start
GET /auth/ldpass/callback?state=<state>
GET /api/auth/logout
```

说明：

- `login-url` 只负责根据 `LDPASS_BASE_URL` 和 `LDPASS_CLIENT_ID` 生成跳转地址。
- `client-session` 只在环境变量配置齐全时转发当前请求 Cookie 到 `ldpass` 会话校验接口。
- `start` 负责生成一次性 `state`、写入 HttpOnly Cookie，并把当前推导出的公网 origin 一并写入短期 Cookie，然后跳转到 `ldpass` 登录页。
- `callback` 负责校验 `state`、优先复用 `start` 阶段保存的公网 origin、读取 `client-session`，并在读取到真实 Active 账号后写入 YCT 本地用户映射和账号快照 Cookie；只读账号只写展示快照。
- `logout` 只清理 YCT 本地 `state` 和账号快照 Cookie，并发布本地会话结束事件，不代表已经退出 `ldpass`。
- 未配置 `ldpass` 时，JSON API 返回 503；用户跳转入口回到账号页显示未配置提示；所有路径都不伪造登录态。

### 2.2.1 当前阶段推荐的快速排障顺序

当账号页提示未配置、点击登录没有跳转，或回跳后仍拿不到会话时，优先按下面顺序排查：

1. 检查部署目录根下真实 `.env` 是否存在，且 `LDPASS_BASE_URL`、`LDPASS_CLIENT_ID`、`YCT_PUBLIC_SITE_URL` 都不是空值。
2. 检查当前运行包是否按 `/v2` 构建并以 `/v2` 启动；如果线上页面仍引用根路径的 `/_next/static/...` 或 `/auth/ldpass/callback`，通常说明运行的不是 `/v2` 包。
3. 检查 `ldpass` 后台登记的 `redirect_uri` 是否是 `https://yct.shangxiaoguan.top/v2/auth/ldpass/callback`。
4. 检查 `ldpass` 后台登记的 `allowed_origin` 是否包含 `https://yct.shangxiaoguan.top`。
5. 如果点击登录后跳转地址仍是 `localhost:3300`、`127.0.0.1:3300` 或其他内网地址，先检查宝塔/Nginx/反代是否传入了 `X-Forwarded-Host`、`X-Forwarded-Proto`，以及部署根目录中的 `YCT_PUBLIC_SITE_URL` 是否仍指向线上域名而不是本地地址；如果回跳地址是公网域名但多了 `:3300`，检查反代是否把内部端口写进了 `X-Forwarded-Port`；如果你是用旧版部署包启动的，记得重新解压新版包，因为旧版 `start-yct-web.ps1` 不会覆盖残留的进程环境变量，也不会忽略公网域名上的内部端口。
6. 登录后请求 `GET /api/account/status`，确认返回的不是 `ldpass_not_configured`。
7. 登录后请求 `GET /api/auth/ldpass/client-session`，查看 `yctDiagnostics.ldpassSessionCookiePresent`。如果它是 `false`，而返回体里仍有正确的 `clientApplication`，说明 YCT 配置已基本生效，但浏览器没有向 YCT 域名发送临东通共享 Cookie。
8. 如果账号页提示雨城通没有收到临东通共享登录 Cookie，检查 `ldpass` 生产环境是否配置了 `AUTH_COOKIE_DOMAIN=.shangxiaoguan.top`，并在重启 `ldpass` 后重新登录。
9. 如果 `yctDiagnostics.ldpassSessionCookiePresent:true` 但仍然 `authenticated:false`，再检查浏览器当前是否已经登录 `ldpass`、账号是否为 Active、`client_id` 是否一致，以及 `ldpass` 的 `client-session` 是否能识别该客户端。

补充说明：

- 当前 YCT 的轻量登录回调是服务端在 `GET /auth/ldpass/callback` 中调用 `ldpass client-session` 完成本地会话落库。
- 这要求回调请求里能拿到 `ldpass` 共享会话 Cookie；因此生产环境最好使用同主域或明确共享 Cookie 的测试域。
- `http://localhost:3300` / `http://127.0.0.1:3300` 这种本地地址通常只能用来验证 `redirect_uri` 是否已被 `ldpass` 允许，未必能完成真正的会话读取。如果本地回跳后看到账号页提示“当前回跳地址是 localhost/127.0.0.1，本地站点无法直接读取临东通共享会话”，这属于当前接入方式下的预期保护，而不是 YCT 业务状态机本身出错。

补充一个很快的路由烟雾检查：

- 直接访问 `https://yct.shangxiaoguan.top/v2/auth/ldpass/callback?state=test`。
- 如果进入了 YCT 应用自己的回调逻辑，通常会被 302 回账号页并带上 `auth=state_invalid` 一类参数。
- 如果这里直接是 404，就说明请求根本没有到达 YCT 的 Next 应用，优先检查 `/v2/auth/ldpass/callback` 是否和 `/v2/account`、`/v2/map` 一样被反代到了 3300。

部署目录中也可以先运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\check-runtime-config.ps1 -BasePath v2
```

如果只是想验证本地某个访问入口会生成什么回跳地址，也可以传入当前访问的 Origin：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\check-runtime-config.ps1 -Origin http://localhost:3300 -BasePath v2
```

它会只输出配置是否存在、来源文件、推导出的 `allowed_origin` / `redirect_uri` 和常见告警，不会打印敏感密钥。

如果你需要在本机直接模拟 `/v2` 反代挂载模式，当前仓库也提供了固定脚本：

```powershell
pnpm web:dev:restart:v2
pnpm web:dev:status
pnpm runtime:check:v2
```

其中 `web:dev:status` 会显示当前开发进程记录下来的 `BasePath`，避免本地根路径模式和 `/v2` 模式混淆。

请求要求：

```ts
await fetch(`${ldpassBaseUrl}/api/auth/client-session?client_id=${clientId}`, {
  credentials: 'include',
});
```

当前响应字段：

```ts
export interface LdpassClientSessionResponse {
  authenticated: boolean;
  clientApplication?: {
    clientId: string;
    name: string;
  };
  user?: {
    id: string;
    username: string;
    email: string;
    role: string;
    status: 'Active';
    reviewInfo?: string | null;
    reviewRejectedReason?: string | null;
    serverAccountName?: string | null;
    serverAccountVerified: boolean;
    avatarUrl?: string | null;
    avatarFallbackUrl?: string | null;
    expirationReminderDays?: number;
  };
}
```

当前 `ldpass` 实现只会把 `Active` 用户放入 `client-session.user` 并返回 `authenticated=true`。YCT 的业务写接口只接受这种有效登录态。

用户希望非 Active 的 `ldpass` 用户也能进入只读账号页，因此需要后续与 `ldpass` 约定一种只读账户查询方式，例如：

- 扩展 `client-session`，在 `authenticated=false` 时允许返回脱敏的 `readonlyUser` 和 `status`。
- 新增可信客户端只读接口，仅返回账号状态、用户名、头像和审核提示。
- YCT 回跳后只能展示“登录态异常/账户待处理”静态页，不读取更多账号资料。

### 2.3 YCT 本地用户映射

```ts
export interface YctUserLink {
  id: string;
  ldpassUserId: string;
  usernameSnapshot: string;
  emailSnapshot?: string;
  serverAccountVerifiedSnapshot: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
}
```

说明：

- `usernameSnapshot` 和 `emailSnapshot` 只用于展示快照和审计，真实账号信息以 `ldpass` 为准。
- 邮箱等敏感信息前台展示需要最小化。
- 用户退出 YCT 时只清理 YCT 本地会话；是否同时跳转 `ldpass` 退出需要后续确认。
- 当前代码阶段尚未接入数据库，先用 `.yct-data/yct-user-links.json` 保存 `YctUserLink` 本地映射，路径可通过 `YCT_USER_LINK_STORE_PATH` 覆盖；后续接入数据库时迁移到正式 `YctUserLink` 表。
- `yct.account_snapshot` HttpOnly Cookie 只保存账号展示快照，登录回跳、后台鉴权和需要服务器账号验证的写接口会基于真实 `ldpass` 会话补写或刷新本地用户映射。
- Cookie 快照只能用于账号页展示和前台状态提示，不能作为业务写接口授权依据；需要写入的业务接口仍必须实时校验 `ldpass` 会话或服务端本地会话。

### 2.4 登录相关事件

```ts
export interface LdpassUserLinkedPayload {
  yctUserLinkId: string;
  ldpassUserId: string;
  usernameSnapshot: string;
  serverAccountVerifiedSnapshot: boolean;
}

export interface YctSessionStartedPayload {
  ldpassUserId: string;
  authenticated: boolean;
  readonly: boolean;
}

export interface YctSessionEndedPayload {
  ldpassUserId?: string;
  reason: 'user_logout' | 'state_invalid' | 'session_expired' | 'system';
}
```

说明：

- 当前阶段已由 `auth-workflow` 在本地用户映射创建、会话开始、会话结束后发布领域事件；事件会先写入 `.yct-data/event-outbox-store.json`，再交给共享内存事件总线分发。后续接数据库 Transactional Outbox 时保持同一事件契约。
- 监听器可用于刷新计数徽标、记录审计、触发历史迁移提醒或清理本地设备状态。

## 3. 账号设置入口

YCT 账号设置页不复制 `ldpass` 的账户安全能力，而是提供入口。

建议入口：

```ts
export interface LdpassAccountLink {
  kind:
    | 'account_home'
    | 'bind_server_account'
    | 'change_avatar'
    | 'security'
    | 'devices'
    | 'theme'
    | 'wallet';
  label: string;
  href: string;
  requiresLogin: boolean;
}
```

需要 `ldpass` 提供或约定：

- 账户首页 URL。
- 绑定/验证服务器账号 URL。
- 更改头像 URL。
- 账户安全 URL。
- 设备管理 URL。
- 主题设置或主题计划 URL。
- 卡包/票券 URL。

如果 `ldpass` 没有稳定深链，YCT 第一阶段可以只提供 `ldpass` 账户首页入口。

## 4. 主题计划接入

YCT 默认跟随 `ldpass` 的主题计划，并在计划时间内切换强调色。YCT 只消费主题语义，不要求照搬 `ldpass` 的具体色值；当前默认映射为青绿色、红色和灰色三类强调色。

### 4.1 建议数据格式

```ts
export interface LdpassThemePlan {
  id: string;
  name: string;
  startsAt: string;
  endsAt?: string;
  accentTone: 'teal' | 'red' | 'gray';
  accentColor?: string;
  surfaceMode?: 'light' | 'dark' | 'system';
  priority: number;
  source: 'ldpass';
}
```

### 4.2 YCT 本地偏好

```ts
export interface YctThemePreference {
  userId: string;
  colorScheme: 'light' | 'dark' | 'system';
  accentMode: 'follow_ldpass' | 'custom';
  customAccentColor?: string;
  updatedAt: string;
}
```

建议规则：

- 默认使用 `follow_ldpass`，按 `ldpass` 主题计划切换强调色。
- 用户选择 `custom` 时，本地强调色优先生效。
- 主题计划生效或过期时，YCT 通过事件刷新 UI 和缓存。
- 当 `ldpass` 返回具体色值时，YCT 可以只读取主题语义并映射到自己的青绿色、红色或灰色 token。

待确认：

- `ldpass` 已有公开主题计划接口 `GET /api/theme/schedule`，后台接口为 `GET /api/admin/theme/schedule` 与 `POST /api/admin/theme/schedule`。
- 需要确认公开接口返回的主题语义是否稳定，是否足够让 YCT 映射到 `teal`、`red`、`gray` 三类强调色。
- 是否需要把主题计划缓存到 YCT 后端，避免每次打开都请求 `ldpass`。

## 5. 管理员权限

登录身份来自 `ldpass`，YCT 后台权限由本地维护。

第一阶段管理员角色先不拆分，仅区分普通管理员和超级管理员。后续如果后台规模扩大，再拆出内容审核、交通数据、POI、服务入口、票务等细粒度权限。

```ts
export type YctAdminRole = 'admin' | 'super_admin';

export interface YctAdminMembership {
  id: string;
  yctUserId: string;
  ldpassUserId: string;
  role: YctAdminRole;
  status: 'active' | 'suspended';
  createdAt: string;
  updatedAt: string;
}
```

首位管理员来源建议：

- 已确认：后台命令行初始化首位超级管理员，命令绑定指定 `ldpassUserId` 为 `super_admin`。
- 备选：私有环境变量配置首批 `ldpassUserId` 白名单。

管理员敏感操作可以增加 PIN 二次确认。PIN 来源待确认：

- 复用 `ldpass` PIN。
- YCT 本地维护后台 PIN。
- 首阶段只对删除、发布、回滚、票务退款等高风险操作要求二次确认。

## 6. 投稿能力

已验证服务器账号的 `ldpass` 用户允许投稿。

投稿时 YCT 需要读取：

```ts
export interface YctContributorIdentity {
  ldpassUserId: string;
  username: string;
  serverAccountVerified: boolean;
}
```

投稿规则：

- `serverAccountVerified=true` 才能提交内容投稿。
- 投稿进入 YCT 内容审核流。
- 第一阶段不做二审。
- 图片素材和正文一起审核，图片未通过时内容不能发布。
- 不需要额外投稿者白名单。

待确认：

- 投稿频率限制。
- 投稿后是否给用户站内通知或邮件通知。

## 7. 票务与乘车码接入

后续真实电子票、检票、退票和乘车码需要联动 `ldpass`。YCT 侧会重写统一班次查询与订票系统，客运、轮渡、航班共享同一套订单、票券和状态机；`ldpass` 不负责 YCT 的班次查询和订单规则，但负责账号、卡包凭证、操作链接和核销承载。

已在 `ldpass` 仓库中确认的候选能力：

- 公开 Provider 核销 API：
  - `GET /api/open/provider/redemptions`
  - `POST /api/open/provider/redemptions`
  - `POST /api/open/provider/redemptions/:requestId/cancel`
  - `POST /api/open/provider/redemptions/:requestId/reverse`
- 登录 Provider 核销 API：
  - `POST /api/provider/redemptions`
  - `GET /api/provider/redemptions`
  - `GET /api/provider/redemptions/pass-preview`
  - `POST /api/provider/redemptions/by-card-number`
  - `POST /api/provider/redemptions/:requestId/cancel`
  - `POST /api/provider/redemptions/:requestId/reverse`
- 操作链接能力：
  - `POST /api/open/provider/action-links`
  - `GET /api/open/provider/action-links`
  - `POST /api/open/provider/action-links/:actionLinkId/revoke`
  - `POST /api/open/provider/action-links/revoke-batch`
  - `GET /api/wallet/action-links/preview`
  - `POST /api/wallet/action-links/confirm-pin`
  - `POST /api/wallet/action-links/server-redemption/start`
  - `POST /api/wallet/action-links/server-redemption/complete`
  - `POST /api/wallet/action-links/server-confirm`
- 票券变更审核：
  - `GET /api/admin/passes/ticket-update-requests`
  - `POST /api/admin/passes/ticket-update-requests/:requestId/approve`
  - `POST /api/admin/passes/ticket-update-requests/:requestId/reject`
- Provider API Key Scope 已包含 `action_links:create/read/revoke`、`passes:read/status_update/ticket_update`、`redemptions:create/cancel/reverse/read`。

### 7.1 职责边界

YCT 负责：

- 交通线路、站点、班次、车站、行程。
- 订单草稿、班次选择、出行提醒。
- 票务状态在出行场景中的展示。

`ldpass` 负责：

- 用户身份。
- 卡包/票券凭证。
- 乘车码、操作链接或核销凭证承载。
- 票券领取、展示和账户侧安全能力。

建议第一阶段票务联动方向：

- YCT 保存出行订单、班次、站点、提醒和本地业务状态。
- `ldpass` 保存票券、卡包、操作链接和核销请求。
- 检票优先走 `ldpass` 的操作链接或核销 API；YCT 只保存 `ldpassPassId`、`actionLinkId`、`redemptionRequestId` 等关联键。
- YCT 通过轮询、Webhook 或后台任务同步核销状态，然后更新行程提醒、订单状态和计数徽标。
- 所有出票、退票、核销、冲正请求都必须带幂等键，避免重复操作。

### 7.2 YCT 订单草稿

```ts
export interface YctTicketOrderDraft {
  userId: string;
  ldpassUserId: string;
  scheduleId: string;
  fromStationId: string;
  toStationId: string;
  passengerCount: number;
  tripReminderId?: string;
}
```

### 7.3 票券发行请求

```ts
export interface LdpassTicketIssueRequest {
  externalOrderId: string;
  ldpassUserId: string;
  ticketType: 'transit_ticket';
  title: string;
  validFrom: string;
  validUntil?: string;
  metadata: {
    yctScheduleId: string;
    fromStationId: string;
    toStationId: string;
    routeLabel: string;
    departureTime: string;
    arrivalTime?: string;
  };
}
```

### 7.4 票券发行响应

```ts
export interface LdpassTicketIssueResponse {
  ldpassPassId: string;
  status: 'issued' | 'pending' | 'failed';
  claimUrl?: string;
  reason?: string;
}
```

### 7.5 票券状态同步

```ts
export interface LdpassTicketStatusWebhook {
  eventId: string;
  type:
    | 'TicketIssued'
    | 'TicketCheckedIn'
    | 'TicketRefundRequested'
    | 'TicketRefunded'
    | 'TicketCancelled'
    | 'TicketExpired';
  occurredAt: string;
  ldpassPassId: string;
  externalOrderId: string;
  payload: Record<string, unknown>;
}
```

YCT 收到状态变化后：

- 更新本地订单和行程状态。
- 将外部 `TicketRefunded` 回调映射为 YCT 内部 `TicketRefundCompleted` 领域事件。
- 发布 YCT 领域事件。
- 刷新前台计数徽标和行程提醒。
- 必要时触发 Web Push。

待确认：

- `ldpass` 当前票券模型是否已经能承载交通票。
- YCT 采用公开 Provider API Key、登录 Provider 后台 API，还是新增专用服务端接口。
- 出票采用 Provider 票券接口、票券变更审核、添加卡券领取码，还是操作链接。
- 检票由 `ldpass` 核销链接发起，还是由 YCT 车站/大屏后台创建核销请求后跳转到 `ldpass` 确认。
- 退票由 YCT 规则判断、`ldpass` 票券规则判断，还是二者共同校验。

## 8. 历史迁移与用户同意

旧订单和旧行程可以在用户同意后迁移到登录账号。

```ts
export interface LocalHistoryMigrationConsent {
  yctUserId: string;
  ldpassUserId: string;
  acceptedAt: string;
  sourceDeviceId: string;
  itemCounts: {
    tripReminders: number;
    orders: number;
    searchHistory: number;
  };
}
```

迁移要求：

- 用户必须看到将迁移的数据类型和数量。
- 导入需要去重。
- 导入结果需要可查看。
- 是否允许撤销导入仍待确认。

## 9. 待 ldpass 明确或新增的能力

- 稳定账户深链：绑定服务器账号、更改头像、账户安全、设备管理、卡包。
- 非 Active 用户只读账号页所需的脱敏账户状态接口或 `client-session` 扩展。
- 票券发行接口或领取码接口的交通票使用方式。
- 票券状态 Webhook 或状态轮询接口。
- PIN 二次确认是否允许外部系统复用。
- 乘车码的生成、刷新、撤销和核验规则。

## 10. 安全要求

- `redirect_uri` 必须精确匹配。
- YCT 登录回跳必须校验 `state`。
- 跨站会话校验必须使用 HTTPS 和允许的 Origin。
- YCT 不把 `client-session` 返回的信息当长期 token 使用。
- YCT 与 `ldpass` 之间的服务端调用需要使用服务端密钥或签名机制，不能把敏感密钥下发到浏览器。
- 票务状态同步必须具备幂等键，避免重复出票、重复退票或重复检票。
