# 临东市服务器主入口

`apps/portal` 是部署到 `https://shangxiaoguan.top/` 的独立静态门户，不属于雨城通 Next.js 应用。直接上传本目录中的 `index.html`、`portal.css`、`portal-i18n.js`、`legacy-wordpress-redirect.js`、`portal.js`、`site-config.js` 和 `assets` 即可，不需要 Node.js 服务。

备案提交的网站名称为“个人学习网站”。该名称必须保留在页面 `<title>`、`application-name`、`og:site_name` 和页脚站点身份中；“临东市服务器”是本页内容标题，不能替换备案名称。ICP备案号在主页底部居中展示并链接备案管理系统。这里仅保证页面展示一致；如果备案主体、网站用途或登记信息发生变化，仍需按接入商和主管部门要求办理变更。

## 部署边界

- 根域 `shangxiaoguan.top`：本静态门户。
- 雨城通 `yct.shangxiaoguan.top`：独立应用，当前公开路径为域名根目录；`/v2/` 仅保留旧链接兼容跳转。
- 临东通、Wiki 和原始网页地图：继续使用各自域名。

不要把 `apps/web/app/page.tsx` 替换成门户；它仍是雨城通运营首页。

## 雨城通根路径迁移

根路径迁移完成后，`site-config.js` 中的 `yctBaseUrl` 是：

```js
const yctBaseUrl = 'https://yct.shangxiaoguan.top/';
```

页面中的新版雨城通、整合地图和工作台地址都从 `yctBaseUrl` 派生，不需要逐个修改 HTML。线网数据编辑器、动态线路图、物料图鉴和电报纸生成器继续从 `legacyBaseUrl` 派生；Nginx 的旧静态文件兜底必须继续提供这些路径，不能交给 Next.js 吞掉。

## 旧 WordPress 链接兼容

门户加载时会解析唯一且为正整数的 `p` 查询参数，例如 `https://shangxiaoguan.top/?p=96`。解析、公开状态查询、导航和提示分别通过以下事件解耦：

- `portal:legacy-wordpress-resolution-requested`：已经把 `p` 转换为 `wordpress_content_[p]`，请求确认公开状态。
- `portal:legacy-wordpress-resolution-completed`：雨城通返回 `published`、`not_published` 或 `unavailable`。
- `portal:legacy-wordpress-notice-visibility-requested`：未发布或暂时无法确认时请求显示提示，或由关闭按钮请求隐藏。
- `portal:legacy-wordpress-notice-visibility-changed`：提示的实际可见状态已经改变。

只有 `published` 会使用 `location.replace()` 前往雨城通内容页，不在浏览器历史中留下无意义的中转页。`not_published` 会提示后留在门户；数据源或网络异常使用 `unavailable`，不会误称内容尚未发布。雨城通接口只复用公开内容读取模型，不读取或暴露草稿状态。

旧链接查询由门户跨域访问 `https://yct.shangxiaoguan.top/api/operations/legacy-wordpress/[p]`。该公开只读接口不使用 Cookie，并返回 `Access-Control-Allow-Origin: *`。根域当前的 CSP 还必须在原策略中加入：

```nginx
connect-src 'self' https://yct.shangxiaoguan.top;
```

这是对现有 `Content-Security-Policy` 的字段补充，不能另加一条相互冲突的 CSP。部署顺序应先发布雨城通接口并确认 CORS 响应头，再发布门户脚本和 CSP；否则旧链接会保守地显示“暂时无法确认”并留在门户。

## 地图与旧工具关系

- 雨城通地图是推荐的产品入口，负责整合地点、公共交通、路线规划和底图切换，本身不是第三套独立瓦片源。
- `map.shangxiaoguan.top` 是稳定的 HTTPS 静态地图原站，提供精细瓦片和地点标记，但更新较慢。
- `ld.cmsy.xyz:19136` 是较新的 HTTP 地图原站，提供较新瓦片与玩家位置。门户只提供直达链接，不在 HTTPS 页面中直接嵌入，避免混合内容限制。
- 旧版地图搜索原本用于替代完整地图能力；雨城通地图可用后，门户不再展示这个重复入口，但不删除旧页面。
- 动态线路图是主工具，线网数据编辑器作为卡片内的配套入口；编辑器导出的旧版数据主要供动态线路图导入，不把它描述成通用线网平台。
- 路牌、楼牌和公交站牌旧生成器已经由新版工作台覆盖，门户不再重复展示；电报纸生成器在迁移完成前保留为单独的旧版入口。
- 物料与周边图鉴记录临东的视觉物料、纪念品和实体周边，归入服务器服务，而不是通用创作工具。
- 公共交通导视工作台可以把 RMP 项目作为只读自定义线网。门户只陈述兼容能力并展开 RMP 正式名称，不使用第三方 Logo，也不暗示与地铁线路图绘制器存在官方合作；具体版本与导入限制以工作台说明为准。

## 品牌与界面边界

门户与雨城通共享临东 Logo、HarmonyOS Sans SC、主绿色、基础表面色、分隔线和小圆角；这些元素负责让访客识别出同一项目体系。门户继续采用全幅城市头图和纵向分流结构，不复制雨城通的高频操作导航，也不复制临东通面向账号与卡券的界面层级。

门户当前顺序为“头图、简介、创作工具、地图、服务、社交链接、友情链接、页脚”。简介保留在工具之前以维持首次访问者的叙事路径；头图首屏直接提供“使用创作工具”入口，让只关心工具的访客可以跳过简介。界面以独立表面块和背景层级为主，减少连续分隔线与描边，公共圆角令牌定义在 `portal.css`。

## 多语言

门户使用单份 HTML 和 `portal-i18n.js` 翻译字典提供简体中文、繁体中文和英文。首次加载按 `navigator.languages` 解析：

- `zh-Hant`、`zh-TW`、`zh-HK`、`zh-MO` 使用繁体中文。
- 其他 `zh` 语言标签使用简体中文。
- `ug`、`bo`、`ii`、`mn` 及其地区变体使用简体中文。
- `en` 使用英文；其他语言回退到英文。

用户手动选择后写入 `localStorage`，后续加载优先使用该偏好。语言状态通过 `portal:locale-requested` 和 `portal:locale-changed` 事件传递；随机头图的地点名称和替代文本也随语言切换。

## 主题

门户通过 `prefers-color-scheme` 跟随系统浅色或深色外观，不额外保存主题偏好。正文、卡片、链接面块、弹窗和透明工具封面底色均使用语义颜色变量；头图、二维码海报和工具成品保持原始色彩，避免反相处理破坏内容辨识度。

## 图标

`assets/icons` 仅本地托管门户实际使用的 Material Symbols Outlined SVG，来源为 Google Fonts Material Symbols 官方静态资源。许可文本保存在 `assets/icons/LICENSE`（Apache License 2.0）。交互图标通过 CSS mask 继承当前文字颜色，以自动适配深色外观；不要改为远程字体整包加载。新增图标时下载单个 SVG，并继续保留许可证。

## 工具封面

三个主工具使用真实成品作为封面，优化后的文件位于 `assets/tools`，来源与裁切信息见同目录的 `manifest.json`。封面统一输出为 `1200 × 750` WebP，并保留透明通道；媒体区通过 `--tool-media-surface` 提供统一的 `#eeeeee` 浅灰底色，后续主题可以覆盖这个变量而不必重新导出图片。更新图片时继续保留相同比例和明确的替代文本，不使用模拟生成结果或整页浏览器边框。

## 头图来源

头图清单位于 `site-config.js`，素材来源记录在 `assets/hero/manifest.json`。当前图片来自雨城通公开地图接口中已经发布且带图片的 POI，门户保留 POI 名称和地图直达链接。现有 10 张以建筑和站房为主，不因数量本身继续扩充；后续优先补充道路、公共交通、共同建设和纪念活动等有明确背景信息的图片。新增素材需要记录地点或事件、约拍摄年份、来源、替代文本、裁切位置和直达目标。

## 事件

页面使用浏览器 `CustomEvent` 解耦交互，Payload 契约见 `events.d.ts`：

- `portal:hero-requested`：请求选择初始头图或手动换图。
- `portal:hero-selected`：头图和 POI 链接已经更新。
- `portal:entry-activated`：用户打开简介延伸阅读、工具、地图、服务、社区或友链入口。
- `portal:locale-requested`：系统、存储偏好或用户请求切换语言。
- `portal:locale-changed`：页面语言、元信息与头图说明已经更新。
- `portal:wechat-poster-visibility-requested`：请求打开或关闭微信公众号海报。
- `portal:wechat-poster-visibility-changed`：微信公众号海报的可见状态已经更新。
- `portal:legacy-wordpress-resolution-requested`：请求解析旧 WordPress 文章的公开状态。
- `portal:legacy-wordpress-resolution-completed`：旧文章解析已经得到公开、未发布或暂不可用状态。
- `portal:legacy-wordpress-notice-visibility-requested`：请求显示或关闭旧链接提示。
- `portal:legacy-wordpress-notice-visibility-changed`：旧链接提示的可见状态已经更新。

当前没有接入统计监听器；以后若增加分析，只监听这些事件，不要把上报逻辑写进链接或头图组件。

## 友情链接

友情链接按临东市服务器 Wiki 的 `MediaWiki:首页友链` 页面同步，但排除指向门户根域自身的“上小官的个人心得”。最近一次人工检查与结果见 `LINK_CHECK.md`。除这个明确的自链接例外，不要在门户单独新增、删除或重命名友链；应先修改 Wiki 配置，再同步门户，避免两个入口长期分叉。

公开列表可以包含互换友链和临东主动推荐的相关站点。“待确认”只表示当前访问状态无法由自动检查确认，“不活跃”表示项目或站点已明确停止活跃；两者都不表示对方没有回链。关系类型、对方回链状态和最近核验日期应在维护记录中管理，不在公开页面标注；页面通过社交账号入口接受新的友链交换联系。
