# 雨城通 · FluentOS 原生应用

给 [FluentOS-On-Web](https://github.com/YoYoPAN1115/FluentOS-On-Web) 写的雨城通客户端，
以 **Developer Center 自建 App** 形式运行（沙箱 iframe + `FluentOS` 桥接）。

## 为什么是这个形态

雨城通的登录是 **Cookie + 服务端会话 + 302 跳转**（见 `apps/web/app/auth/ldpass/callback/route.ts`），
依赖 `state` / `ldpass_session` / `yctSession` 三枚 Cookie。
而 FluentOS 安装态沙箱有两条代码级硬约束：

| 约束 | 出处 | 后果 |
| --- | --- | --- |
| `sandbox` 不含 `allow-same-origin` | `developer-created-runtime.js:341-343` | 不透明来源，无 Cookie / localStorage / IndexedDB |
| CSP `connect-src 'none'`、`navigate-to 'none'`、`form-action 'none'` | 同上 `:532-534` | 不能自己发请求、不能跳转、不能提交表单 |
| `credentials:'omit'` + `redirect:'error'` | 同上 `:734-735` | 桥接请求不带 Cookie，且 3xx 直接抛错 |

因此：**把现有网页直接嵌进去，登录必然失败**；要让 App 能登录，必须把登录态从 Cookie 换成 Token。
方案是 RFC 8628 设备授权（`openExternal` 在真实浏览器完成登录 → 授权码 → 换令牌 → 存 `FluentOS.storage`）。

后端接口契约见 **[BACKEND_DEVICE_AUTH.md](./BACKEND_DEVICE_AUTH.md)**。
**该接口未实现前，App 的公开数据部分已可完整使用，登录入口会给出明确的「尚未开放」提示（不伪造成功）。**

## 文件

| 文件 | 用途 |
| --- | --- |
| `app.html` | Developer Center「HTML」字段 |
| `app.css` | 「CSS」字段 |
| `app.js` | 「JavaScript」字段 |
| `BACKEND_DEVICE_AUTH.md` | 需雨城通后端新增的接口与 CORS 改动 |

## 数据来源

全部走雨城通**已有**的公开只读 API，无需后端改动：

```
https://yct.shangxiaoguan.top/api/v1/public
```

| 端点 | 体积 | 用途 |
| --- | --- | --- |
| `/transit/overview` | 249 KB | 线路网概览（82 条线路 + 汇总） |
| `/transit/stations` | 31 KB | 站内设施详情（32 条） |
| `/travel/schedules` | 480 KB | 班次查询（407 班次 + 站点/换乘选项） |
| `/operations` | 88 KB | 运营公告（44 条） |
| `/services` | 3.8 KB | 服务入口目录 |

> **注意路径不带 `/v2`。** 线上 `/v2/api/...` 会被 nginx **307** 到 `/api/...`，
> 而桥接层是 `redirect:'error'`，带 `/v2` 会直接失败。规范地址以
> `GET /api/v1/public/openapi` 的 `servers[0].url` 为准。

## Developer Center 配置

1. **强制 FluentUI：开启。** 这是本 App 能获得原生观感的前提——
   运行时会把完整的 `css/fluent-ui.css` 注入沙箱，并用 MutationObserver 自动装饰：
   `<button>` → `.fluent-btn`、`<input>` → `.fluent-input` + 自动包裹 `.fluent-input-wrapper`、
   `<select>` → `.fluent-runtime-select`。关闭后组件会退化成浏览器默认样式。
2. **权限声明**（只声明用到的两个）：

   ```
   permissions:   [storage.local, network.request]
   network.connect: [yct.shangxiaoguan.top]
   network.image:   []
   ```

   权限归属（已核对 `developer-created-runtime.js` 的 `call` 分支）：

   | 调用 | 所需权限 |
   | --- | --- |
   | `FluentOS.network.request` | `network.request` + 目标域在 `network.connect` |
   | `FluentOS.storage.get/set/remove` | `storage.local` |
   | `FluentOS.getLanguage()` / `getThemeMode()` 等读系统状态 | **不需要**（`system.*` 读分支不校验权限） |
   | `FluentOS.openExternal(url)` | **不需要**，但**只接受 `https:`**（否则抛 `Only HTTPS links are allowed`） |
   | `FluentOS.window.setTitle` | `window.manage`（本 App 不用，标题由窗口框架给） |

   > ⚠️ **不要把这个 App 标成「只读校验」。** `_invokeApi` 里有
   > `if (profile.readOnly && !READONLY_METHODS.includes(method)) throw ...`，
   > 而 `READONLY_METHODS` 只含 `system.*` 读 + `window.info`。
   > 一旦标成只读，`network.request` 与 `storage.*` 会被整体拒绝，App 直接变砖。

3. 窗口尺寸建议：最小 520×420。

## 已实现页面

| 页面 | 内容 |
| --- | --- |
| 首页 | 来源状态、各制式线路/站点统计、服务入口（外链打开）、最新公告 |
| 线路 | 按制式筛选 → 线路详情（运营方、首末班、票价、途经站点序列） |
| 站点 | 搜索 → 楼层结构、站内设施、换乘、出入口、周边站点 |
| 班次 | 出发/到达/日期查询 → 班次列表（时刻、线路、历时、票价、承运方、车型、进出站、运营日） |
| 公告 | 按分类筛选 → 详情（内置极简 Markdown 渲染，全程 `textContent`，无 HTML 注入） |
| 账户 | 设备授权登录 / 等待授权 / 已登录 / 各类失败态 |

中英双语完整覆盖（133 个键，中英一一对应），随系统语言实时切换且保留输入内容与滚动位置。

## 自检

```bash
node <校验脚本>   # 语法 + i18n 键对齐 + 禁用 API 扫描 + 路径规范
```

本 App 已通过：语法检查、133/133 键中英对齐且全部被引用、无禁用 API
（`fetch` / `localStorage` / `window.parent` / `postMessage` / `innerHTML` 等一律未出现）、无 `/v2/api/` 路径。

## 必须实测的回归项

**预览态 ≠ 安装态**，这是本项目最容易踩的坑：

1. **预览/安装一致性** —— 同一份代码，Developer Center 预览能跑通 → **导出安装包重装后必须仍能跑通**。
   预览模式有两处额外放宽，安装后立即降级：
   - 预览态 iframe 额外给 `allow-same-origin`（源码注释写明是 developer-only）；
   - **预览态跳过全部权限校验**（`_ensurePermission` 里 `if (profile.preview === true) return true`）。
   所以「预览里能拉数据」完全不能证明「安装后能拉数据」——必须实测授权弹窗与拒绝后的降级。
2. **无 Cookie 依赖** —— 安装态下 `document.cookie` 为空、`localStorage` 访问抛异常，App 仍正常。
3. **权限拒绝降级** —— 拒绝 `storage.local` 或 `network.request` 后，App 仍能打开，
   相关功能显示明确提示，且**不重复弹窗**（FluentOS 的拒绝是持久的）。
4. **语言切换不丢状态** —— 切换系统语言后，班次筛选条件、站点搜索词、滚动位置全部保留。
5. **浅色 / 深色 / 窄窗口** —— 窄于 560px 时左侧导航自动变为横向滚动条。
6. **离线** —— 断网后显示超时/网络错误态与重试入口，不白屏。

## 已知边界

- 登录需后端实现 `BACKEND_DEVICE_AUTH.md`；未实现时登录入口显示「尚未开放设备授权接口」。
- App 内**不能**打开雨城通网页（`navigate-to 'none'`），所有外链一律经 `FluentOS.openExternal` 走真实浏览器。
- `FluentOS.storage` 配额为 512 KiB / 128 键 / 单值 100 KiB，因此只存令牌与轻量状态，业务数据实时拉取。
- 桥接**并发上限 32**（`MAX_BRIDGE_IN_FLIGHT`），且 iframe 侧超时按方法分档：
  `network.*` 20 秒、`dialog.show` 300 秒、其余 5 秒。各视图的数据请求按需加载、
  同视图内最多并行 3 个（首页），距上限有充足余量。
- 桥接请求由 **FluentOS 宿主页面**发出，`Origin` 为 FluentOS 的部署来源
  （`https://yoyopan1115.github.io`）。雨城通侧的 CORS 需覆盖该来源；因 App 不带凭据，
  沿用现有 `Access-Control-Allow-Origin: *` 即可。
