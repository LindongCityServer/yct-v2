# 雨城通 · FluentOS PWA App

把雨城通以 Developer Center 的 **PWA App** 形式封装进
[FluentOS-On-Web](https://github.com/YoYoPAN1115/FluentOS-On-Web)，
并让「通过临东通登录」在嵌入环境下真正可用。

> **本文只覆盖 FluentOS 这一个宿主。**
> 「嵌入模式」本身与宿主无关——只要本站被跨站 iframe 嵌入，
> 顶层弹窗登录 + `SameSite=None` 会话 Cookie 这套通用编排就适用，
> 换任何网页桌面宿主都不需要改通用层。宿主专属协议走适配器，见第 6 节。

---

## 1. 为什么直接嵌入会「登录校验失败」

三层断裂，都由 Cookie 语义决定，**不是配置问题**：

| #   | 断裂点                                                                                                                                  | 出处                                                                                        |
| --- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 1   | PWA App 的 iframe sandbox **默认不含 `allow-same-origin`**，来源不透明 → Cookie 存不下来                                                | FluentOS `js/third_parts_apps/pwa-loader.js:364-366`                                        |
| 2   | 即使补上 `allow-same-origin`，`yct.ldpass_state`（`SameSite=lax`）**在 iframe 内导航中不会发送** → 回调页判定 `state_invalid`           | `apps/web/app/api/auth/ldpass/start/route.ts`、`apps/web/app/auth/ldpass/callback/route.ts` |
| 3   | 登录弹窗写下的会话 `yct.account_snapshot`（`SameSite=lax`）**在 iframe 内的请求中同样不会发送** → 弹窗显示成功、iframe 里仍读不到登录态 | `apps/web/lib/yct-session.ts`、`apps/web/app/api/account/status/route.ts`                   |

第 2 条更隐蔽：`SameSite=Lax` 只在**顶层导航**中发送，
而 iframe 内导航的目标浏览上下文是 iframe 自己 → 非顶层 → Cookie 不发 →
`storedState === undefined` → `state_invalid`。

第 3 条是同一语义的另一面：`SameSite=Lax` 只在**同站请求**或**顶层导航**中发送，
而判定是否同站看的是**顶层站点**。
iframe 内的 `fetch` 虽然是同源请求（`Sec-Fetch-Site: same-origin`），
但顶层站点是 FluentOS 的域名——只要它与 `yct` 跨站，这枚 Lax 会话 Cookie 就不会被携带。

**已排除的其他原因**（实测 `curl -D-`）：

- 雨城通首页与 ldpass 登录页都**没有** `X-Frame-Options` / `frame-ancestors`，嵌入不被拒绝。
- `ldpass.shangxiaoguan.top` 与 `yct.shangxiaoguan.top` 同属 `shangxiaoguan.top`（同站）。
  但这条只对「**顶层站点也在 `shangxiaoguan.top` 下**」的宿主成立：
  此时 iframe 内的 `fetch` 才是 same-site，Lax 对非导航请求正常发送，问题只出在导航上；
  而宿主是 `yoyopan1115.github.io` 这类跨站域名时，连 `fetch` 也不会带 Lax Cookie。

---

## 2. 修复方式

**把登录整体搬到顶层弹窗**（只有顶层导航才发 Lax Cookie），
再用 `postMessage` 把结果通知回 iframe；
同时为 iframe 内的请求**额外下发一枚 `SameSite=None` 的会话 Cookie**。

```
iframe 点「打开登录窗口」
  → window.open('/api/auth/ldpass/start?embed=1')     ← 顶层弹窗，Cookie 一切正常
  → ldpass 登录 → 302 回 /auth/ldpass/callback
  → 回调页渲染「完成页」（不是 302）
     → 同时写下两枚同值会话 Cookie：
       yct.account_snapshot         （SameSite=Lax，供网页端）
       yct.account_snapshot_embed   （SameSite=None; Secure，供跨站 iframe）
  → postMessage 结果给 window.opener
  → iframe 收到 → router.refresh() → 浮层收起
```

会话仍由 **HttpOnly Cookie** 持有，`postMessage` 只传结果码，不传任何凭据。
两枚 Cookie 指向**同一个服务端会话**，因此不存在两份登录态。

---

## 3. Developer Center 配置

| 项   | 值                                                                           |
| ---- | ---------------------------------------------------------------------------- |
| 类型 | **PWA App**（「构建 PWA App：将安全、支持嵌入的 HTTPS 网站封装为独立 APP」） |
| URL  | `https://yct.shangxiaoguan.top/`                                             |
| 权限 | **必须声明 `storage.local`**                                                 |

> **`storage.local` 是 PWA App 唯一可申请的权限**
> （FluentOS `js/core/developer-center-store.js:12`：
> `PWA_PERMISSIONS: Object.freeze(['storage.local'])`），
> 而它正是拿到 `allow-same-origin` 的唯一途径
> （`pwa-loader.js:365`：`trustedCatalog || allowLocalStorage`）。
>
> 用户安装时若不授予该权限，iframe 会退回不透明来源，**登录必然失败**。

不要标成「只读校验」：`READONLY_METHODS` 只含 `system.*` 读 + `window.info`，
标了之后 `network.request` / `storage.*` 会被整体拒绝。

---

## 4. 雨城通侧改动

**通用层（宿主无关）**

- `lib/embedded-auth-protocol.ts` — 完成页 ↔ iframe 的 postMessage 协议（两侧共享，避免各写一份字符串）
- `lib/client-embedded-auth.ts` — 弹窗编排 + 状态广播（事件驱动，不承载凭据）
- `lib/embed-auth-complete-page.ts` — 服务端渲染的完成页
- `components/embedded-auth-bridge.tsx` — 挂消息监听 + 渲染登录浮层
- `components/account-login-entry.tsx` / `components/account-logout-entry.tsx` — 嵌入态改用弹窗 / 同站 fetch

**宿主适配层（可选能力）**

- `lib/embedded-host-adapters.ts` — 宿主适配器接口 + 通用宿主来源配置
- `components/embedded-host-bridges.tsx` — 宿主桥接的**唯一挂载点**
- `components/embedded-hosts/fluentos.tsx` — FluentOS 适配器：存储握手 v2 + 来源解析

**修改**

- `app/layout.tsx` — 挂载 `EmbeddedHostBridges`（不再直接挂宿主专属桥接）
- `app/globals.css` — `.embedded-auth-prompt`（含窄屏与 `prefers-reduced-motion` 退路）
- `lib/yct-session.ts` — 新增 `yct.ldpass_embed` 标记 Cookie，以及嵌入专用会话 Cookie
  `yct.account_snapshot_embed`（`SameSite=None; Secure`）、`writeYctSessionCookies`、`resolveYctSessionCookie`
- `lib/request-site-url.ts` — 新增 `isSameOriginDocumentRequest`（嵌入会话的同源校验）
- `app/api/auth/ldpass/start/route.ts` — 支持 `?embed=1`，写下嵌入标记
- `app/auth/ldpass/callback/route.ts` — 用 `finish()` 统一收尾，嵌入态改渲染完成页并额外下发嵌入会话 Cookie
- `app/api/auth/logout/route.ts` — 同时读取 / 清理两枚会话 Cookie，并对嵌入会话追加同源校验
- `lib/user-auth.ts` / `lib/admin-auth.ts` — 读取两枚会话 Cookie；嵌入会话追加同源校验
- `app/account/page.tsx`、`app/api/account/status/route.ts`、`app/api/map/player-locations/route.ts` — 读取两枚会话 Cookie
- `components/login-required-bridge.tsx` — 嵌入态只广播 `required`，不跳转
- `components/account-settings-panel.tsx` — 登录 / 登出改用新组件

**普通网页端行为逐字段不变**：`finish()` 只改响应形态，不改状态码集合与 Cookie 清理口径；
非嵌入登录不下发嵌入会话 Cookie，普通页面仍只依赖 `SameSite=Lax` 的那枚。

---

## 5. 几个容易踩的坑

### 登录入口不能自动开窗

`login-required` 由 **fetch 401 异步触发**，异步调用栈里的 `window.open`
会被浏览器的弹窗拦截器拦掉。所以嵌入态下 `login-required-bridge` 只广播
`required` 状态，由 `EmbeddedAuthBridge` 渲染一个**按钮**，等真实用户手势再开窗。

好处是：40+ 处登录触发点全部经事件总线汇聚到 `login-required-bridge` 这一个消费点，
**只改一处即全覆盖**。

### 登出同样要改

`<a href="/api/auth/logout">` 在 iframe 里也是非顶层导航 → Lax Cookie 不发 →
服务端 `request.cookies.get(yctSessionCookieName)` 拿到 `undefined` →
`deleteYctServerSession(undefined)` 静默失败 →
**用户以为已登出、服务端会话其实还活着**。

嵌入态改为同站 `fetch` 再 `reload()`，登出路由也会同时读两枚会话 Cookie。

### 嵌入会话 Cookie 不能加 `Partitioned`

`SameSite=None` 的 Cookie 容易顺手加上 CHIPS 的 `Partitioned` 来收敛第三方范围，
但在这里**会直接失效**：分区键取顶层站点，弹窗写入时的顶层站点是 `yct` 自己，
而 iframe 读取时的顶层站点是宿主（如 `yoyopan1115.github.io`），
两者分区不匹配 → iframe 永远读不到。

### `SameSite=None` 需要配套的同源校验

嵌入会话 Cookie 会随**任何**跨站请求发送，因此使用它的写接口
（`lib/user-auth.ts`、`lib/admin-auth.ts`、登出路由）都必须确认「发起方文档就是本站」：
iframe 拿到 `allow-same-origin` 后其文档源即本站源，`Origin` 指向本站；
恶意站点的 iframe 则指向自身，会被 403 拦下。
校验刻意不复用 `resolvePublicSiteOrigin`——它会拿请求自带的 `Origin` 参与推导，把攻击者来源误判成站点来源。

---

## 6. 宿主适配：存储握手与来源配置

这套存储握手是 **FluentOS 专属约定**，其它网页桌面宿主没有对应要求，
因此它被隔离在 `components/embedded-hosts/fluentos.tsx` 这个适配器里，不进通用层。

因为必须申请 `storage.local`，配套义务是实现 `fluentos:storage-request` /
`fluentos:storage-response`（v2，动作 `probe` / `measure` / `clear`），
否则「设置 > 应用程序」统计不到占用、卸载时站点数据残留。

适配器需要知道**哪些来源算这个宿主**，来源列表统一用通用变量配置：

```dotenv
# 逗号分隔多个来源；留空时使用适配器内置的默认来源
NEXT_PUBLIC_YCT_EMBED_HOST_ORIGINS=https://yoyopan1115.github.io
```

FluentOS 适配器内置的默认来源就是 `https://yoyopan1115.github.io`。
新增其它宿主时，写一份自己的适配器、在 `EmbeddedHostBridges` 里挂上即可——
通用登录编排与这份变量都不用改。

---

## 7. 浏览器边界

iframe 内请求到 `yct.shangxiaoguan.top` 属于**第三方 Cookie**（顶层站点是宿主的域名）。
嵌入登录下发的 `yct.account_snapshot_embed` 因此必须是 `SameSite=None; Secure`——
Lax 那一枚在跨站 iframe 里无论如何都不会被发送，跟浏览器是否放开第三方 Cookie 无关。

| 浏览器             | 表现                                                                                                                                                                   |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chrome / Edge 桌面 | 默认仍允许第三方 Cookie，嵌入会话可用                                                                                                                                  |
| Safari             | ITP 默认拦截第三方 Cookie，嵌入会话写不进也读不到。`document.requestStorageAccess()` 因 FluentOS 的 iframe 未声明 `storage-access` 权限策略而不可用 → 需引导外部浏览器 |
| Firefox            | TCP 默认隔离第三方 Cookie → 需引导外部浏览器                                                                                                                           |

可行的长期替代是让**宿主与 `yct` 同站**（例如把 FluentOS 部署到 `*.shangxiaoguan.top`）：
此时 Lax 会话 Cookie 在 iframe 内的请求里正常发送，嵌入专用 Cookie 与同源校验都可省掉，
也不再受第三方 Cookie 策略影响。届时需要同步移除这一段依赖。

---

## 8. 验证清单

1. **普通网页端回归**：非嵌入访问 `/account`，登录仍是 302 回 `/account?auth=login_success`；
   `login-required` 仍是 toast + 延迟跳转；非嵌入登录**不会**下发 `yct.account_snapshot_embed`。
2. **预览态 ≠ 安装态**（最容易踩）：
   - 预览模式 `_ensurePermission` 里 `profile.preview === true` 直接放行，**跳过全部权限校验**；
   - 预览模式 iframe 额外带 `allow-same-origin`。
     所以「预览能登录」完全不能证明「安装后能登录」。
3. 未授予 `storage.local` → 浮层出现、点按钮后仍失败（预期），文案指向权限；授予后成功。
4. 登录成功后 iframe 内 `/api/account/status` 返回已登录，且刷新后保持；
   Network 里该请求的 Request Headers 应带有 `yct.account_snapshot_embed`。
5. 弹窗被拦截 → 显示 `popup_blocked` 提示，不静默失败。
6. 用户手动关闭弹窗 → 浮层回到「需要登录」，不卡在等待态。
7. 登出后服务端会话确实被销毁（复查 `.yct-data` 里的会话记录）。
8. 断网 → 失败提示可重试，不白屏。
9. **跨站伪造防护**：用其它域名的页面跨站请求 `/api/account/trip-reminders` 等写接口，
   带 `yct.account_snapshot_embed` 时应被 403 `cross_site_request_blocked` 拒绝。

---

## 9. 备选形态

`integrations/fluentos-app/` 保留了另一条路线的产出
（Developer Center「HTML / CSS / JavaScript 沙箱 App」+ RFC 8628 设备授权），
适用于**不想在雨城通侧改代码**的场景。当前未启用，保留作参考。
