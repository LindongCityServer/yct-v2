---
version: alpha
name: Yuchengtong
abbreviation: YCT
description: 雨城通（Yuchengtong，缩写 YCT）v2 的单文件设计系统，面向编码与设计代理读取，约束前台、后台、地图页和工具页的视觉与交互一致性。
colors:
  primary: '#168F78'
  primary-hover: '#0F725F'
  primary-soft: '#E9FBF6'
  accent-default: '#168F78'
  accent-red: '#C93A3A'
  accent-gray: '#6F7775'
  secondary: '#2584E8'
  tertiary: '#F59B22'
  neutral-0: '#FFFFFF'
  neutral-50: '#F7F8F8'
  neutral-100: '#EEF1F1'
  neutral-200: '#DFE5E4'
  neutral-500: '#7A8684'
  neutral-700: '#364240'
  neutral-900: '#111817'
  surface: '#F7F8F8'
  surface-panel: '#FFFFFF'
  surface-muted: '#EEF1F1'
  surface-selected: '#D9F6ED'
  on-surface: '#111817'
  on-surface-secondary: '#364240'
  on-surface-muted: '#7A8684'
  inverse: '#FFFFFF'
  error: '#E5484D'
  metro: '#2584E8'
  bus: '#F59B22'
  tram: '#C64255'
  ferry: '#168AA5'
  railway: '#8B5E34'
  coach: '#8BBF35'
  flight: '#6657D9'
motion:
  duration-fast: 120ms
  duration-standard: 180ms
  easing-standard: cubic-bezier(0.2, 0, 0, 1)
typography:
  headline-lg:
    fontFamily: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif
    fontSize: 32px
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: 0px
  headline-md:
    fontFamily: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif
    fontSize: 24px
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: 0px
  title-md:
    fontFamily: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif
    fontSize: 20px
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: 0px
  body-md:
    fontFamily: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0px
  body-sm:
    fontFamily: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0px
  label-md:
    fontFamily: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif
    fontSize: 14px
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: 0px
  caption:
    fontFamily: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: 0px
rounded:
  none: 0px
  xs: 4px
  sm: 6px
  md: 8px
  lg: 20px
  xl: 20px
  full: 999px
spacing:
  base: 4px
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  2xl: 32px
  3xl: 48px
  mobile-gutter: 16px
  desktop-gutter: 24px
  content-max: 625px
  content-wide-max: 960px
  side-nav-width: 176px
  map-panel-width: 320px
  map-panel-width-wide: 360px
components:
  button-primary:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.inverse}'
    rounded: '{rounded.md}'
    typography: '{typography.label-md}'
    height: 40px
    padding: 12px
  button-secondary:
    backgroundColor: '{colors.surface-panel}'
    textColor: '{colors.on-surface}'
    rounded: '{rounded.md}'
    typography: '{typography.label-md}'
    height: 40px
    padding: 12px
  icon-button:
    backgroundColor: transparent
    textColor: '{colors.on-surface-secondary}'
    rounded: '{rounded.full}'
    size: 40px
  card:
    backgroundColor: '{colors.surface-panel}'
    textColor: '{colors.on-surface}'
    rounded: '{rounded.md}'
    padding: 16px
  nav-item-active:
    backgroundColor: '{colors.surface-selected}'
    textColor: '{colors.primary}'
    rounded: '{rounded.full}'
  input:
    backgroundColor: '{colors.surface-panel}'
    textColor: '{colors.on-surface}'
    rounded: '{rounded.full}'
    height: 44px
---

# Yuchengtong (YCT) Design System

## Overview

雨城通 v2，英文名 `Yuchengtong`，缩写 `YCT`。它是公共交通与服务器生活服务入口，界面应当像一套稳定、可信、轻量的公共服务系统，而不是营销页。整体气质是清爽、克制、易扫描：移动端适合单手快速查找，桌面端适合在地图、列表和后台数据之间高效切换。

视觉核心来自原型中的白底、青绿色品牌色、轻量图标和交通类别色。地图探索页必须让地图成为主体；后台页面必须更密集、更工具化；工具箱可以保留一点轻快感，但仍要服从同一套 token。

## Colors

- **Primary `#168F78`**：品牌主色，用于当前导航、主按钮、选中态、关键图标。
- **Accent**：默认跟随 `ldpass` 主题计划，在青绿色、红色、灰色三个 YCT 映射色之间按时间切换；具体色值由 YCT 设计系统维护，不要求照搬 `ldpass`。用户也可以在设置里改为自定义强调色。
- **Primary soft `#E9FBF6` / Selected `#D9F6ED`**：用于当前导航背景、轻量提示、选中 chip。
- **Secondary `#2584E8`**：用于地铁、链接型强调、地图中的蓝色交通信息。
- **Tertiary `#F59B22`**：用于公交、轻量提醒和非危险强调。
- **Error `#E5484D`**：用于危险操作、停运、校验错误和强警示。
- **Neutral scale**：页面背景、卡片、边框、文本和辅助信息都从中取值。
- **Mode colors**：`metro`、`bus`、`tram`、`ferry`、`railway`、`coach` 仅表达交通方式，不替代具体线路色。默认语义中地方铁路使用棕色，客运大巴使用黄绿色，轮渡保留青蓝色，航班使用蓝紫色；不同服务器的交通方式色、图标和排序允许通过后台 Profile 配置覆盖，前台不要把这组颜色写死为不可变常量。

不要把界面做成单一青绿色主题。运营信息、地图线路、出行提醒和后台状态需要有足够的语义区分。

## Typography

- **Headlines**：使用系统 sans 字体，700 权重，标题要短，不在紧凑面板里使用过大的字号。
- **Body**：正文以 16px / 14px 为主，行高 1.5，适合资讯列表、内容页和设置页。
- **Labels**：按钮、导航和状态标签使用 14px 半粗体；元信息使用 12px caption。
- **Letter spacing**：全部保持 `0px`，不使用负字距或装饰性大字距。
- **数字和时间**：可使用系统字体，不单独引入等宽字体，除非后续客运大屏需要。

## Layout

- **移动端一级页面**：顶部品牌栏、主内容区、底部四项导航。账号入口放顶部头像或个人入口，不默认占底部主导航。
- **桌面端一级页面**：顶部栏 + 左侧导航 + 主内容。普通内容最大宽度 `625px`，运营首页和后台列表可放宽到 `960px`。
- **运营首页 hero**：固定使用 `16:9` 比例，封面资源按背景裁切，文案只保留轻量标签和标题。
- **二三级页面**：顶部返回栏，内容居中；右上角只放当前页面相关操作，没有操作时隐藏。
- **地图页面**：地图铺满视口，不放在卡片里。移动端使用底部抽屉，桌面端使用左侧停靠的 `sidebar-stack` 操作栈，面板宽度 `320px - 360px`。
- **间距**：以 4px 为基础单位，常用间距为 8 / 12 / 16 / 24 / 32px。
- **响应式断点**：小于 768px 视为移动端；768px 到 1199px 视为平板；1200px 以上视为桌面；1600px 以上允许地图页使用更宽面板。

固定格式组件，例如底部导航、图标按钮、地图控件、线路 chip、行程卡片，需要明确尺寸约束，避免内容加载后抖动。

## Elevation & Depth

雨城通主要依靠背景层级、边框和少量阴影表达深度。

- 页面背景使用 `surface`，普通卡片使用 `surface-panel`。
- 列表项和后台表格优先使用细边框、分隔线、浅色背景，不使用厚重阴影。
- 浮层、弹窗、地图抽屉可以使用轻阴影，例如 `0 12px 32px rgb(17 24 23 / 14%)`。
- 地图控件需要有足够背景对比，但不能像装饰卡片一样抢主体。
- 后台页面的层级应服务于信息密度，不做大面积浮动卡片。

## Shapes

- 默认卡片、侧边栏和工具容器使用更柔和的 `lg` 圆角；紧凑列表项仍优先使用 `md`。
- 输入框、导航选中态、chip 可以使用 `full` 圆角，表达轻量可选状态。
- 地图底部抽屉允许使用较大的顶部圆角，但内部卡片仍遵守 8px 上限。
- 不混用大量圆角尺度；同一页面里卡片、按钮、输入框应保持一致。
- 不做卡片套卡片。页面分区用完整布局或浅色背景带区分。

## Components

- **App Header**：移动端高度约 56px，桌面端约 64px。包含 Logo、当前页操作和账号入口。不要把说明性文字塞进顶部栏。
- **Primary Navigation**：运营、探索、出行、服务四项使用 Material Symbols Outlined 图标加短文字。当前项用 selected 背景和 primary 文本。
- **Account Entry**：使用头像或 `account_circle` 图标，承接登录、退出、历史、偏好和通知。未登录显示登录入口；已登录显示头像；存在未读通知、待处理订单、审核待办或异常状态时显示一个合并计数徽标，具体来源进入账号/通知面板后展开。
- **Cards**：只用于独立内容项、列表项、弹窗和工具容器。资讯卡片应有固定缩略图比例，避免图片加载后跳动。
- **Buttons**：工具类操作优先图标按钮，并提供可访问名称和 tooltip。文本按钮只用于明确命令，例如保存、发布、提交审核。
- **Inputs**：移动端触控高度不小于 44px。搜索框、起终点输入和后台筛选保持统一高度。
- **Chips**：用于运营信息分类、交通方式过滤、线路状态。颜色必须来自语义 token 或线路数据。
- **Lists**：运营信息列表展示标题、摘要、日期、分类、缩略图；行程列表展示起终点、时间、方式、状态；后台表格在移动端转为摘要列表。
- **Map Controls**：图层、定位、缩放、比例尺使用固定尺寸控件。地图标记点必须有形状或符号差异，不能只靠颜色区分。
- **Map Data Info**：`map-data-badge`、`map-data-panel` 等数据源状态信息默认不作为主界面组件展示。普通用户只需要轻量看到数据更新时间或来源入口；标记数量、Provider、适配器状态等详细信息放入管理员、调试或关于面板。
- **Admin Shell**：后台使用顶部标题栏、侧边导航、主内容区。审核页面必须展示提交内容、差异、提交人、风险提示和操作按钮。
- **PWA UI**：安装入口放在账号设置或更多服务中。离线状态用非阻塞提示，并标明数据更新时间。自定义矩形范围离线包的手动更新和删除入口放在账号设置页，范围列表需要显示名称、坐标范围、大小、更新时间和删除操作。
- **PWA Install Copy**：安装入口可使用文案“安装雨城通。把 YCT 添加到主屏幕，快速查看运营信息、线路和站点详情。支持缓存已下载的自定义范围离线包，并在你允许后接收行程、运营、订票和检票提醒。”
- **Theme Settings**：账号设置中提供浅色、深色、跟随系统和强调色选择。默认强调色跟随 `ldpass` 主题计划；如果用户选择自定义强调色，本地选择优先生效。

图标优先使用 Material Symbols Outlined CDN；不要使用 `material-symbols-rounded`，避免部分图标无法清晰区分 `FILL` 填充状态。CDN 不可用时页面功能不能被阻塞。

品牌、App 和网站图标源文件统一放在 `assets/brand/`，生成后的 Web/PWA 图标输出到 `apps/web/public/icons/`。提交源文件前不要把私有运维信息或外部账号密钥放进图标目录。

## Do's and Don'ts

- Do 使用 `DESIGN.md` front matter 中的 token 作为实现的权威值。
- Do 保持地图页全视口，业务面板覆盖或停靠在地图上。
- Do 保留地图页的侧边操作栈或底部抽屉，让搜索、路线规划、图层筛选和选中对象详情优先于数据源诊断信息。
- Do 为移动端按钮和控件保留至少 44px 触控目标。
- Do 为所有图标按钮提供 `aria-label` 或等效可访问名称。
- Do 让后台界面偏信息密度和任务效率，而不是前台宣传风格。
- Do 让线路颜色来自数据，同时保证文本和标签可读。
- Don't 把地图、后台表格或整页分区包进装饰卡片。
- Don't 使用卡片套卡片。
- Don't 用一整套青绿色铺满所有状态和模块。
- Don't 在界面里放说明“如何使用本页面”的大段可见文字。
- Don't 使用负字距、夸张渐变背景、装饰光斑或纯氛围图片。
- Don't 把 PWA 安装提示做成首页强打扰弹窗。
