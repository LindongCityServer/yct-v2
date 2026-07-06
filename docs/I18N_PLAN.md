# YCT 多语言规划

更新时间：2026-07-05

本文档用于约束雨城通 v2（Yuchengtong / YCT）后续多语言能力。当前目标不是立即翻译全站，而是先明确哪些内容可以安全国际化，哪些内容必须等待业务数据提供正式译名。

## 1. 支持范围

第一阶段支持三种语言：

| 语言 | 代码 | 用途 |
| --- | --- | --- |
| 简体中文 | `zh-CN` | 默认语言和业务数据主语言 |
| 繁体中文 | `zh-Hant` | 面向繁体中文用户的界面文案 |
| 英语 | `en` | 面向英语用户的界面文案 |

用户偏好额外支持 `system`，表示跟随浏览器或 `ldpass` 账号偏好解析成实际语言。`system` 不是可写入业务数据的语言代码。

## 2. 可国际化内容

- 界面固定文案：导航、按钮、表单标签、错误提示、空状态、免责声明说明等。
- 设计系统文案：状态名、通用操作名、可复用组件内的提示。
- 非业务枚举：如票务订单状态、审核状态、浏览模式、通知类型。
- 文档化提示：PWA 安装说明、离线包提示、路线估算免责声明等。

这些内容可以按 namespace 拆成翻译目录，例如 `common`、`map`、`travel`、`account`、`admin`。

## 3. 不能直接机器翻译的内容

- 地名、站名、道路名、建筑名、服务器组织名。
- 公共交通线路名、班次名、航空公司名、运营单位名。
- 运营消息标题和正文。
- 用户投稿 POI 的标题、简介和链接说明。
- 旧站迁移来的专题页面正文。

这些内容必须来自以下来源之一：

- 原始数据源已经提供的正式译名字段。
- 管理员在后台维护的翻译字段。
- 服务器 Profile 或部署适配器提供的别名/译名表。
- 投稿者提交并通过审核的译名。

没有正式译名时必须回退到 `zh-CN` 原文，不能自动生成看似正式的译名。

## 4. 数据模型建议

固定界面文案使用翻译目录：

```ts
export type LocaleCode = 'zh-CN' | 'zh-Hant' | 'en';
export type LocalePreference = LocaleCode | 'system';

export interface TranslationCatalog {
  id: string;
  profileId: string;
  revisionId: string;
  locale: LocaleCode;
  namespace: string;
  messages: Record<string, string>;
  publishedAt: string;
}
```

业务实体译名使用实体翻译表，不直接覆盖主字段：

```ts
export interface EntityTranslation {
  id: string;
  profileId: string;
  entityType: 'poi' | 'transit_line' | 'transit_station' | 'service_entry' | 'operation_content';
  entityId: string;
  locale: LocaleCode;
  fields: Record<string, string>;
  aliases?: string[];
  status: 'draft' | 'pending_review' | 'published' | 'rejected' | 'archived';
  updatedBy: string;
  updatedAt: string;
}
```

搜索索引应同时读取主语言名称、正式译名和别名；排序仍以当前界面语言优先，匹配不到时回退主语言。

## 5. 解析与回退规则

1. 用户选择 `system` 时，按 `ldpass` 偏好、浏览器 `Accept-Language`、站点默认语言的顺序解析。
2. 解析出的语言必须落在支持列表内；不支持时回退 `zh-CN`。
3. 固定文案缺少目标语言 key 时回退 `zh-CN` 同 key。
4. 业务实体缺少目标语言字段时回退实体主字段。
5. 运营内容缺少目标语言版本时，展示主语言内容，并在需要的位置显示“暂无该语言版本”的辅助提示。
6. 语言切换控件中的语言名称固定使用自称名称：`简体中文`、`繁體中文`、`English`，避免用户切换后无法识别补救入口。

## 6. 事件列表

契约源码位置：`packages/contracts/src/events.ts`。

```ts
export interface LocalePreferenceUpdatedPayload {
  userId?: string;
  localDeviceId?: string;
  locale: LocalePreference;
  resolvedLocale?: LocaleCode;
  previousLocale?: LocalePreference;
  updatedAt: string;
  source: 'account_settings' | 'browser_default' | 'ldpass_profile' | 'system_migration';
}

export interface TranslationCatalogPublishedPayload {
  catalogId: string;
  revisionId: string;
  locales: LocaleCode[];
  namespaces: string[];
  publishedAt: string;
  publishedBy: string;
}

export interface EntityTranslationUpdatedPayload {
  entityType: 'poi' | 'transit_line' | 'transit_station' | 'service_entry' | 'operation_content';
  entityId: string;
  locale: LocaleCode;
  fields: string[];
  updatedAt: string;
  updatedBy: string;
}
```

这些事件后续用于刷新前端缓存、搜索索引、账号偏好同步和管理员审计。业务 Service 只负责写入偏好或译名，不直接调用搜索、通知或缓存模块。

## 7. 状态机

语言偏好状态：

```text
未设置
  -> 首次访问：读取浏览器语言，落到 system
  -> 用户选择：写入 locale preference

system
  -> 解析支持语言：resolvedLocale
  -> ldpass 或浏览器变化：重新解析
  -> 用户手动选择：固定为 zh-CN / zh-Hant / en

固定语言
  -> 用户改回 system：重新跟随外部偏好
  -> 用户切换其他语言：发布 LocalePreferenceUpdated
```

业务实体翻译状态：

```text
draft -> pending_review -> published
pending_review -> rejected -> draft
published -> archived
published -> draft（新修订）
```

## 8. 工业界常见做法

- UI 文案和业务数据分开：前者走翻译目录，后者走实体翻译表或 CMS 多语言字段。
- 语言偏好跟账号绑定，同时保留匿名设备偏好；登录后再按冲突规则合并。
- 搜索索引把别名、译名和主语言字段分列存储，避免运行时在列表里逐条翻译。
- 翻译目录发布走版本号和缓存失效，不能让每个请求实时读散落的 JSON 文件。

## 9. 高频踩坑

- 把地名直接机器翻译：会产生看似正式但没人认可的站名，后续很难纠正。
- 只翻 UI 不翻搜索：用户看到英文界面，却无法用英文别名搜到地点。
- 在 URL 中混用语言路径和临时 `/v2` basePath：会导致反代阶段资源路径和路由匹配混乱。
- 把 `system` 当成真实 locale 写入翻译目录：后续目录发布和缓存 key 会不可控。
- 日期、数字和排序继续写死 `zh-CN`：界面切换语言后仍然出现中文日期或中文排序结果。

## 10. 核心测试用例

- 未登录用户选择英语，刷新后保持英语；清除本地设置后回到 `system`。
- 登录用户选择繁体中文，退出再登录仍读取账号侧偏好。
- 浏览器语言为不支持语言时，解析结果回退 `zh-CN`。
- 某个 UI key 缺少英文翻译时，只回退该 key，不让整页报错。
- 地点没有英文译名时显示中文原名，搜索仍可用中文命中。
- 地点有英文别名时，英文搜索命中该地点，但详情主字段仍遵守当前语言回退规则。
- 翻译目录发布后，搜索索引和缓存刷新事件只执行一次，重复投递不产生重复索引。

## 11. 分阶段实施

1. 契约和文档：固定语言代码、偏好事件、翻译目录事件和实体翻译事件。
2. 客户端偏好：账号设置页增加语言偏好控件，匿名用户写本地，登录用户同步账号侧。当前已完成登录用户服务端偏好 API、事件发布、客户端本地偏好工具和账号页语言偏好控件；控件会保存偏好、更新页面 `lang`，并通过轻量前端事件通知同页 UI 更新。
3. UI 文案目录：先迁移低风险公共组件和设置页，再扩展到地图、出行和后台。当前已新增客户端 `common` 翻译目录和 `useI18n` hook，并先接入主导航、顶部搜索/乘车码/账号入口、普通用户二级页返回按钮与固定标题、账号页外观/语言/字体/动态偏好控件、搜索页固定文案、离线页固定文案、首页运营信息固定文案、更多服务页固定文案和出行一级页固定文案；业务实体名称仍保持主语言回退，不做机器翻译。
4. 实体译名后台：允许管理员为 POI、线路、站点、服务入口和运营内容维护译名与别名。
5. 搜索索引：把当前语言、主语言、别名和译名共同纳入索引。
6. 内容多语言：运营消息和专题页支持多语言修订、审核和发布。

第一阶段上线前，仍以 `zh-CN` 为主语言；任何未审核译名都不得进入公开页面。
