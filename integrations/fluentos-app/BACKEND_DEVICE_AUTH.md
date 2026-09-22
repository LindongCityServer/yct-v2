# 雨城通 · FluentOS 客户端设备授权接口契约

> 面向 `integrations/fluentos-app` 这个 FluentOS 沙箱 App。
> 目标：让 App 在**读不到浏览器 Cookie** 的前提下拿到可撤销的访问令牌。
> 依据：RFC 8628（OAuth 2.0 Device Authorization Grant）。

## 1. 为什么不能用现有登录流程

App 侧被两条硬约束夹住，两者都是 FluentOS 沙箱的既定行为，不是配置项：

| 约束 | 出处 | 后果 |
| --- | --- | --- |
| 安装态 iframe `sandbox` 不含 `allow-same-origin` | `js/core/developer-created-runtime.js:341-343` | 来源不透明，读不到也写不了 Cookie / localStorage / IndexedDB |
| 安装态 CSP `connect-src 'none'` | 同上 `:532-534` | App 内不能自己 fetch，必须走 `FluentOS.network.request` |
| 桥接层 `credentials:'omit'` | 同上 `:734-735` | 桥接请求**不带任何 Cookie** |
| 桥接层 `redirect:'error'` | 同上 `:734-735` | 任何 3xx 直接抛错，不能靠服务端 302 |

而现有登录链路（`apps/web/app/auth/ldpass/callback/route.ts`）从头到尾依赖 Cookie：
`yctAuthStateCookieName` 校验 state → 转发 `cookieHeader` 调 ldpass `client-session`（需 `ldpass_session` 共享 Cookie）→ 写 `yctSessionCookieName` → 302 回账号页。

**结论：Cookie 路线在沙箱内不可能走通，必须换成 Token。**

## 2. 需要新增的接口

### 2.1 `POST /api/auth/device/authorize`

由 App 发起，申请一个设备授权码。

请求（`content-type: application/json`）：

```json
{
  "clientId": "yuchengtong",
  "client": "fluentos",
  "scope": "account.read"
}
```

响应 `200`：

```json
{
  "device_code": "d3f1a9c2e8b74f10a6c5e2d9b0f3a7c1",
  "user_code": "HX4K-9P2M",
  "verification_uri": "https://yct.shangxiaoguan.top/v2/auth/device",
  "verification_uri_complete": "https://yct.shangxiaoguan.top/v2/auth/device?user_code=HX4K-9P2M",
  "expires_in": 600,
  "interval": 5
}
```

约束：

- `device_code`：≥32 字节随机串，**服务端只存哈希**。
- `user_code`：8 位、字母表去掉易混字符（建议 `BCDFGHJKLMNPQRSTVWXZ23456789`），显示为 `XXXX-XXXX`，**一次性**。
- `interval`：建议查询间隔秒数，App 侧下限 3 秒。
- `verification_uri_complete` 可选但强烈建议提供，App 会优先使用它，用户无需手输。

### 2.2 `GET /api/auth/device/token?device_code=<device_code>`

App 在用户点击「我已授权」时调用一次（**App 不做自动轮询**，避免无意义的重复请求与权限噪音）。

响应 `200`，按状态分四种：

```json
{ "status": "pending" }
```

```json
{
  "status": "approved",
  "access_token": "yct_at_...",
  "token_type": "Bearer",
  "expires_in": 2592000,
  "refresh_token": "yct_rt_...",
  "readonly": false
}
```

```json
{ "status": "denied" }
```

```json
{ "status": "expired" }
```

- `device_code` 不存在 → `404`（App 会据此判定「接口尚未开放」并给出对应提示）。
- `readonly: true` 用于非 Active 用户的只读账户（对应 `LDPASS_INTEGRATION.md` §2.2.1 的只读账户诉求）。

### 2.3 `GET /v2/auth/device?user_code=<可选>`

给人看的页面，由 `FluentOS.openExternal` 在**真实浏览器标签**中打开（这一步 Cookie 一切正常，可直接复用现有 ldpass 登录）。

要求：

1. 若未登录 ldpass，先走现有 `/v2/auth/ldpass/start` 流程。
2. 登录后提供输入框填写 `user_code`（若 URL 带 `user_code` 则预填）。
3. 用户确认后把该 `device_code` 标记为 `approved`，并绑定当前 ldpass 用户。
4. 显示明确的成功/失败结果与「可以回到 FluentOS 应用」的提示。
5. 页面自身**不得**被设计成 App 内嵌——它必须能独立在顶层浏览器中工作。

## 3. CORS 改动（必须）

App 的请求实际由 **FluentOS 宿主页面**发出（`_networkRequest` 运行在宿主侧），因此 `Origin` 是 FluentOS 的部署来源，而非 iframe 的不透明来源。

现有 `apps/web/lib/public-api.ts` 的 `createPublicJsonResponse()` 已设置：

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, OPTIONS
Access-Control-Allow-Headers: Accept, Content-Type
```

因为 App 使用 `credentials: 'omit'`（不带 Cookie），**通配符 `*` 是合法且安全的**，不需要改成具体来源，也不需要 `Access-Control-Allow-Credentials`。需要补的是：

1. `POST /api/auth/device/authorize` 与 `GET /api/auth/device/token` 需要把 `POST` 加入 `Access-Control-Allow-Methods`。
2. 两个路径都要有 `OPTIONS` 预检处理，返回 `204` 并带上上述三个头。
3. **若将来有接口读取 `Authorization` 头**：必须把 `Authorization` **显式**写进 `Access-Control-Allow-Headers`。按 Fetch 规范，`Access-Control-Allow-Headers: *` **不覆盖** `Authorization`。
4. **禁止 3xx**。桥接层是 `redirect:'error'`，任何 301/302/307/308 都会让 App 直接失败。因此：
   - 新接口必须能在 `/api/auth/device/...` 精确路径直接返回 200，不能被 nginx 或 Next 重写到别处。
   - 注意线上现状：`GET /v2/api/v1/public/openapi` 会 **307** 到 `/api/v1/public/openapi`。App 里所有请求因此一律使用**不带 `/v2` 的规范路径**（已在 `app.js` 的 `API_BASE` 固化）。新接口请沿用 `/api/...` 形态。
   - 若开启 `trailingSlash` 相关重定向，请确保这些路径不会被 308。

## 4. 令牌存储与校验

建议新增两张表（当前项目阶段可先落 `.yct-data/*.json`，与 `yct-user-links.json` 同策略）：

```ts
interface YctDeviceAuthorization {
  id: string;
  deviceCodeHash: string;      // sha256，不存明文
  userCode: string;            // 一次性，消费后置空或标记已用
  status: 'pending' | 'approved' | 'denied' | 'expired';
  ldpassUserId?: string;
  clientId: string;
  scope: string[];
  intervalSeconds: number;
  expiresAt: string;
  createdAt: string;
  approvedAt?: string;
}

interface YctApiToken {
  id: string;
  tokenHash: string;           // sha256，不存明文
  refreshTokenHash?: string;
  ldpassUserId: string;
  clientId: string;
  scope: string[];
  readonly: boolean;
  expiresAt?: string;
  revokedAt?: string;
  lastUsedAt?: string;
  createdAt: string;
}
```

业务接口的 Bearer 分支：

```
Authorization: Bearer <access_token>
  → 哈希后查 yct_api_tokens
  → 校验未撤销、未过期、scope 覆盖
  → 解析出 ldpassUserId，注入与现有 Cookie 会话等价的请求上下文
```

现有 Cookie 会话路径（`yctSessionCookieName`）**保持不变**，供网页端继续使用；两条路径最终归一到同一个用户上下文。

## 5. 安全要求

- `device_code` / `user_code` / `access_token` / `refresh_token` 一律**只存哈希**。
- `user_code` 一次性，成功消费后立即失效；`device_code` 过期后不可复用。
- 对 `POST /api/auth/device/authorize` 与 `GET /api/auth/device/token` 做速率限制（按 IP + clientId）。
- 令牌必须可撤销（`revokedAt`），并发布审计事件；复用现有事件总线契约。
- 不得把 `LDPASS_YCT_PROVIDER_API_KEY` 或任何服务端密钥下发到客户端；App 只持有自己的 `access_token`。
- `verification_uri` 必须与 `LDPASS_BASE_URL` 同源，避免开放重定向。

## 6. 传输层限制（App 侧固定值，设计接口时请对齐）

| 项 | 限制 | 出处 |
| --- | --- | --- |
| 请求超时 | 15 秒（宿主）/ 20 秒（iframe） | `_networkRequest` 的 `AbortController` |
| 请求体上限 | 512 KiB | 同上 |
| 响应体上限 | 2 MiB | `_readLimitedResponse(response, 2 * 1024 * 1024)` |
| 请求头名 / 值 | ≤80 / ≤4096 字符 | 同上 |
| 被禁请求头 | `cookie` `host` `origin` `referer` `connection` `content-length` `proxy-*` `sec-*` | 同上 |
| 允许方法 | GET / HEAD / POST / PUT / PATCH / DELETE | 同上 |
| 域名白名单 | 精确主机名，最多 20 个 | `network.connect` 声明 |

## 7. 验收用例

1. 未实现时：App 点击登录 → `POST /api/auth/device/authorize` 返回 `404` → App 显示「尚未开放设备授权接口」，其余功能不受影响。
2. 正常链路：authorize 返回 `user_code` → App 打开 `verification_uri_complete` → 浏览器完成 ldpass 登录并确认 → App 点「我已授权」→ `status: approved` → 令牌写入 `FluentOS.storage` → 重启 App 仍为已登录。
3. `user_code` 二次使用必须被拒。
4. `device_code` 超过 `expires_in` 后查询返回 `status: expired`。
5. 用户拒绝授权 → `status: denied` → App 回到未登录态且不重试。
6. 令牌撤销后，业务请求返回 `401`，App 回到「需重新登录」态。
7. 所有响应**不含 3xx**（用 `curl -sD-` 检查，确认无 `Location` 头）。
8. 预检：`curl -X OPTIONS -H 'Origin: https://yoyopan1115.github.io' -H 'Access-Control-Request-Method: POST' -H 'Access-Control-Request-Headers: content-type' <authorize 地址>` 返回 204 且三个 CORS 头齐全。
