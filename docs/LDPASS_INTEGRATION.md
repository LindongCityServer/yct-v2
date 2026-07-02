# YCT 与 ldpass 接入说明草案

更新时间：2026-07-01

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
- `start` 负责生成一次性 `state`、写入 HttpOnly Cookie，并跳转到 `ldpass` 登录页。
- `callback` 负责校验 `state`、读取 `client-session`，并在读取到真实账号后写入 YCT 本地账号快照 Cookie。
- `logout` 只清理 YCT 本地 `state` 和账号快照 Cookie，不代表已经退出 `ldpass`。
- 未配置 `ldpass` 时，JSON API 返回 503；用户跳转入口回到账号页显示未配置提示；所有路径都不伪造登录态。

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
- 当前代码阶段尚未接入数据库，先用 `yct.account_snapshot` HttpOnly Cookie 保存账号展示快照；后续落库时需要把它替换或同步到 `YctUserLink` 表。
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

- 当前阶段先定义事件 Schema，后续接数据库和 Outbox 时由 Auth Service 在本地用户映射创建、会话开始、会话结束后发布。
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
