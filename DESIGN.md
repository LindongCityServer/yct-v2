---
version: alpha
name: Yuchengtong
abbreviation: YCT
description: 雨城通（Yuchengtong，缩写 YCT）v2 的单文件设计系统，面向编码与设计代理读取，约束前台、后台、地图页和工具页的视觉与交互一致性。
compatibility:
  baseline: iOS 16.7（Safari 16.6 / WebKit 616）
  ios: '16.7'
  safari: '16.6'
  required-prefixes:
    - -webkit-backdrop-filter
    - -webkit-appearance
    - -webkit-mask-image
    - -webkit-text-size-adjust
  unsupported:
    - field-sizing
    - backdrop-filter 中的 SVG url() 引用（Safari 全版本）
    - scrollbar-width / scrollbar-color / scrollbar-gutter
    - popover 属性与 showPopover()
    - text-wrap: balance / pretty
    - @starting-style
    - transition-behavior: allow-discrete
    - 原生 CSS 嵌套之外的新语法（@scope、@container style 查询）
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
  duration-micro: 90ms
  duration-state: 160ms
  duration-reveal: 280ms
  duration-spinner: 1100ms
  easing-standard: cubic-bezier(0.2, 0, 0, 1)
  easing-linear: linear
  scale-press: 0.98
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
  space-12: 48px
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
  segmented-control:
    backgroundColor: '{colors.surface-muted}'
    activeBackgroundColor: '{colors.surface-panel}'
    activeTextColor: '{colors.primary}'
    rounded: '{rounded.md}'
    controlHeight: 40px
    mobileControlHeight: 44px
  modal:
    backdropBackgroundColor: 'rgb(0 0 0 / 36%)'
    backdropFilter: 'blur(8px)'
    advancedBackdropFilter: 'blur(var(--yct-material-blur-soft))'
    advancedPanelFilter: 'contrast + brightness + saturation + blur'
    shortcutBackdropBackgroundColor: transparent
    shortcutBackdropFilter: none
  material-workbench:
    maxWidth: 1120px
    desktopColumns: 'minmax(240px, 280px) minmax(0, 1fr) minmax(240px, 340px)'
    panelBackgroundColor: '{colors.surface-panel}'
    panelRounded: '{rounded.md}'
    controlHeight: 44px
    controlRounded: '{rounded.md}'
  control:
    heightSm: 34px
    heightMd: 40px
    heightLg: 44px
    tapTarget: 44px
    rounded: '{rounded.full}'
    focusRingWidth: 2px
    focusRingOffset: 2px
    disabledOpacity: 0.58
  field:
    height: 44px
    searchHeight: 46px
    mobileFontSize: 16px
    rounded: '{rounded.md}'
  status-chip:
    height: 28px
    padding: 8px
    fontSize: 12px
    fontWeight: 700
    rounded: '{rounded.full}'
  segmented-control-track:
    height: 40px
    mobileHeight: 44px
    padding: 3px
    gap: 3px
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

- **Font family**：默认使用随旧系统迁移的 `HarmonyOS Sans SC`，并在账号设置中允许用户切换回系统 sans 字体。
- **Headlines**：使用当前字体 token，700 权重，标题要短，不在紧凑面板里使用过大的字号。
- **Body**：正文以 16px / 14px 为主，行高 1.5，适合资讯列表、内容页和设置页。
- **Labels**：按钮、导航和状态标签使用 14px 半粗体；元信息使用 12px caption。
- **Letter spacing**：全部保持 `0px`，不使用负字距或装饰性大字距。
- **数字和时间**：可使用系统字体，不单独引入等宽字体，除非后续客运大屏需要。

## Layout

- **移动端一级页面**：顶部品牌栏、主内容区、底部四项导航。账号入口放顶部头像或个人入口，不默认占底部主导航。
- **桌面端一级页面**：顶部栏 + 左侧导航 + 主内容。普通内容最大宽度 `625px`，运营首页和后台列表可放宽到 `960px`。
- **运营首页 hero**：固定使用 `16:9` 比例，封面资源按真实图片元素裁切显示，文案只保留轻量标签和标题；首屏重点封面可以使用高优先级加载，遮罩放在图片上方。
- **二三级页面**：顶部返回栏，内容居中；右上角只放当前页面相关操作，没有操作时隐藏。
- **地图页面**：地图铺满视口，不放在卡片里。移动端使用底部抽屉，桌面端使用左侧停靠的 `sidebar-stack` 操作栈，面板宽度 `320px - 360px`。
- **间距**：以 4px 为基础单位，常用间距为 8 / 12 / 16 / 24 / 32px。
- **响应式断点**：小于或等于 720px 视为移动端；721px 到 1199px 视为平板；1200px 以上视为桌面；1600px 以上允许地图页使用更宽面板。

固定格式组件，例如底部导航、图标按钮、地图控件、线路 chip、行程卡片，需要明确尺寸约束，避免内容加载后抖动。

## Platform Compatibility

兼容基线：**iOS 16.7（Safari 16.6 / WebKit 616）**。所有前台、后台和地图页都必须在该版本上可读、可点、可滚动；更高版本只是增强，不是前提。

### 必须遵守

- **前缀**：`backdrop-filter` 在 Safari 18 前只认 `-webkit-backdrop-filter`，任何模糊/材质表面都要成对书写；`appearance`、`mask-image`、`text-size-adjust` 同理保留 `-webkit-` 前缀。
- **安全区**：`viewport` 使用 `viewport-fit=cover`；顶栏高度已包含 `env(safe-area-inset-top)`，底部导航、弹窗遮罩和 Toast 必须读取 `--yct-safe-area-*`。
- **输入字号**：触控设备上，普通文本控件聚焦时不得小于 16px，避免 iOS 整页自动放大；只有参与绝对定位/网格排版的内联编辑器（导视大文本、电报纸、电报网格）允许豁免。
- **视口高度**：优先 `100dvh` / `100svh`，`100vh` 只作为旧浏览器回退；移动端面板高度不要再写裸 `100vh`。
- **触控目标**：按钮、图标按钮、字段和开关在 `pointer: coarse` 下点击区域不小于 44px；视觉尺寸可以更小，但不能靠缩小命中区换密度。
- **滚动条**：iOS 16.7 的 Safari 16.6 不支持 `scrollbar-width`，需要细滚动条时用 `@supports not (scrollbar-width: thin)` 提供 `::-webkit-scrollbar` 回退。
- **原生控件**：滑杆、搜索框清除按钮必须同时写 `-webkit-appearance: none` 与 `appearance: none`。

### 明确不支持 / 需要降级

- `field-sizing: content`：不可用，依赖它的输入必须同时设置 `size` 属性或固定宽度，保证宽度仍可用。
- `backdrop-filter: url(#svg-filter)`：Safari 全版本不支持；高级材质的 SVG 扭曲只在支持的无前缀引擎启用，WebKit 自动回退为普通模糊。
- `popover` / `showPopover()`、`text-wrap: balance`、`@starting-style`、`transition-behavior: allow-discrete`、`@scope`、`@container style()`：不要作为功能前提。
- `scrollbar-width` / `scrollbar-color`：仅作为增强，缺失时不影响布局。
- 背景滤镜完全不可用时，浮动面板回退到不透明 `surface-panel`，文字阴影同时关闭。

## Motion

- **Duration tokens**：普通过渡使用 `duration-fast` / `duration-standard`；持续性加载动画使用 `duration-spinner`，不要在组件里硬写孤立时长。
- **Reduced motion**：账号设置里的动态效果开关会写入 `data-motion`。当用户选择关闭动态，或系统启用 `prefers-reduced-motion: reduce` 且用户没有强制开启动态时，过渡时长和持续动画都应降到 0 或禁用。
- **地图动效**：瓦片层、标记点层、线性 POI、道路/线路轨迹和路线规划结果需要共享同一套位移/缩放节奏。瓦片整数级别切换时允许淡入淡出，但不能让标记点与底图拖动脱节。
- **状态反馈**：路线规划、上传、审核发布等可能超过瞬时响应的操作，需要使用轻量状态条或按钮内状态反馈；动画只是辅助，文字状态必须可读。

## Elevation & Depth

雨城通主要依靠背景层级、边框和少量阴影表达深度。

- 页面背景使用 `surface`，普通卡片使用 `surface-panel`。
- 列表项和后台表格优先使用细边框、分隔线、浅色背景，不使用厚重阴影。
- 浮层、弹窗、地图抽屉可以使用轻阴影，例如 `0 12px 32px rgb(17 24 23 / 14%)`。
- 地图控件需要有足够背景对比，但不能像装饰卡片一样抢主体。
- 后台页面的层级应服务于信息密度，不做大面积浮动卡片。

## Material Modes & Overlays

- **性能材质**：使用不透明表面，不启用 `backdrop-filter`，保证低性能设备上的滚动和输入响应。
- **高级材质**：浮动面板使用 `contrast + brightness + saturation + blur` 的完整背景滤镜，并使用半透明 `surface-panel` 表面维持文本对比度。
- **Liquid Glass 扩展**：`LiquidMaterialBridge` 集中维护悬浮控件名单（含 `rail`），通过材质偏好事件及 `ResizeObserver` 更新独立位移图。左右边缘保持原比例，仅中央纵向收缩，上下内收像素各为有效圆角半径 × 35% ×（1 − 厚度比例），不再按控件高度百分比缩小；局部内收最多为可见跨度的 24%，避免圆形端点退化；单侧过渡宽度为有效圆角半径 ×（1 − 厚度比例），使用三次缓出，最厚时过渡归零。四角卷曲与镜像补齐沿每列实际圆角轮廓计算，兼容圆形与胶囊形控件；卷曲深度与强度随厚度减弱。顶栏与其他悬浮控件使用相同的动态位移、背景滤镜和表面透明度，未注册滤镜时保留普通模糊，离开高级模式时释放滤镜。
- **选中态**：通用控件使用当前强调色本身的 16% 不透明度叠加，亮暗模式及红色、灰色主题均动态跟随强调色；线路、交通方式等带业务色的筛选器对自身强调色透明化，不再混入面板底色。
- **全站交互**：所有材质模式的按钮、链接和卡片内控件共用文本色半透明悬停背景，内部文字和图标使用 `scaleHover = 1.06`，只缩放一层；高级材质额外提供背景色重阴影。进入和退出共用动效 token，减少动效模式下不放大。按钮不保留装饰描边，键盘焦点轮廓仍保留。地图列表标题与条目分别至少 40px / 44px 高，使用 8px 内边距与圆角。
- **高级材质内控件**：分类条布局和普通标记列表项保持透明，分类按钮和分段轨道使用一次 design token 混合得到的轻底色；普通子控件不再叠加背景模糊，只有分段选中项、开关和滑杆把手允许保留材质式表面。分段选中项、开关把手、滑杆把手使用中性默认背景；开启的开关轨道和滑杆已激活部分使用强调色，首页轮播激活点固定白色。材质注册时识别嵌套关系，顶栏目录按钮共用外层材质；目录通过 Portal 挂到页面根部，避开父级滤镜的背景采样限制，并共用动态透明度、扭曲、模糊及边缘效果。
- **高级材质边缘**：所有悬浮控件共用上粗（2px）、下细（1px）、两侧更细的偏移内描边，不添加固定宽度的整圈描边，并叠加小范围模糊内阴影。最薄时浅色上/下描边浓度为 18% / 10%，内阴影为 24%；深色为 7% / 4%，内阴影为 10%。两种模式的描边和内阴影均使用白色，随厚度增加淡出，100% 时完全透明；容器外投影始终使用半透明黑色。
- **透明子元素**：高级材质文字与图标共用材质背景色的可读性阴影，最薄时浓度 96%，由 4px 紧贴阴影和 12px 扩散阴影组成；随厚度增加收窄、淡出，100% 时完全透明。字体图标直接使用文字阴影，SVG、蒙版图标和控件内图片使用同色图形阴影；蒙版置于图标内层，外层负责投影，图标不添加内描边或内阴影。固定深色材质使用自身的深色底色；文字、图标自身或其材质内部的祖先有填充底色时，改用最近一层填充背景色（保留其透明度）作为阴影颜色，透明子元素继承该颜色。仅有背景图时沿用最近底色，蒙版图标的图形颜色不当作背景色。静止和悬停均按此规则解析颜色，悬停阴影范围为 8px / 18px，最厚时同样完全透明。通过 DOM、悬停、焦点、背景过渡和材质偏好事件更新，恢复透明时恢复上层底色阴影，普通工作区面板不叠加高级材质。
- **Modal backdrop**：普通模式使用半透明黑色背景和模糊；高级材质模式只保留 `blur(var(--yct-material-blur-soft))`，不在整屏遮罩上叠加对比度、亮度或饱和度滤镜。
- **Modal panel**：高级材质弹窗面板必须保留完整的 `contrast + brightness + saturation + blur` 组合，遮罩的简化不能向内覆盖面板材质。
- **快捷键弹窗**：`shortcut-backdrop` 始终透明且不使用任何背景滤镜，只由弹窗面板本身建立层级。
- **可访问性降级**：减少透明度或浏览器不支持背景滤镜时，浮动面板回退到不透明 `surface-panel`，文字阴影和滤镜同时关闭。

## Shapes

- 默认卡片、侧边栏和工具容器使用更柔和的 `lg` 圆角；紧凑列表项仍优先使用 `md`。
- 输入框、导航选中态、chip 可以使用 `full` 圆角，表达轻量可选状态。
- 地图底部抽屉允许使用较大的顶部圆角，但内部卡片仍遵守 8px 上限。
- 不混用大量圆角尺度；同一页面里卡片、按钮、输入框应保持一致。
- 不做卡片套卡片。页面分区用完整布局或浅色背景带区分。

## Component Standards

所有控件按“语义族”归一，不按页面复制。新代码优先使用标准类名；历史类名作为别名保留，但视觉必须服从本节。实现值来自 `packages/design-tokens`，不要在各页面写孤立尺寸。

### 尺寸与状态

- **高度**：`sm` 34px（密集工具条、浮层 chip），`md` 40px（默认按钮/分段轨道），`lg` 44px（移动端主操作、字段）。触控命中区下限 44px。
- **圆角**：按钮、图标按钮、chip、分段轨道用 `full`；字段用 `md`；弹窗与卡片用 `lg`。
- **字重**：次要按钮 600；主按钮与选中项 700。
- **焦点**：统一 `outline: 2px solid primary`，偏移 2px；不要用 `box-shadow` 冒充焦点环。
- **禁用**：所有按钮只对对应非禁用态做淡化（`--yct-disabled-opacity`），不切换语义色；次要强调按钮本身使用主色 14% tint + 主色 68% 文字，不再使用实心主色。
- **按下**：`scale(0.98)`，随 `data-motion='reduced'` 归零。
- **悬停**：中性控件叠加文本色 7% 表面色；主按钮使用 `primary-hover`。

### 组件族与别名

| 语义      | 标准类                                 | 历史别名（必须与标准一致）                                              |
| --------- | -------------------------------------- | ----------------------------------------------------------------------- |
| 主按钮    | `.primary-action-button`               | `.pill-button`、`.secondary-action-button.is-primary`（历史实心主按钮） |
| 次要强调  | `.secondary-action-button.is-emphasis` | —                                                                       |
| 次按钮    | `.secondary-action-button`             | `.icon-action-button`（图标形态）                                       |
| 图标按钮  | `.icon-button` / `.icon-action-button` | `.account-button`                                                       |
| 状态芯片  | `.admin-poi-status-chip` 语义族        | `.trip-status-chip`、`.trip-local-badge`、`.offline-package-status`     |
| 筛选 chip | `.category-chip`                       | `.chip`                                                                 |
| 分段控件  | `.segmented-control`                   | `.material-mode-switch`、`.line-direction-switch`（大尺寸档）           |
| 开关      | `.switch-control`                      | —                                                                       |
| 字段      | `.material-field`                      | `.search-box`（46px 搜索档）                                            |
| 弹窗      | `.modal-panel`                         | `dialog.client-dialog`                                                  |
| Toast     | `.app-toast`                           | —                                                                       |

### 弹窗契约

- 表面：`surface-panel` + `rounded.lg` + `shadow-floating`；遮罩 `rgb(0 0 0 / 36%)` + 8px 模糊，始终带 `-webkit-` 前缀。
- 结构：头部固定、正文滚动、底部操作固定；按钮高度 40px（移动端 44px）。
- 安全区：遮罩四边至少 `max(16px, safe-area)`；面板不得超出 `100dvh - 安全区`。
- 关闭按钮必须是 `.icon-button` 或 `.icon-action-button`，并提供 `aria-label`。

### 字段契约

- 高度 44px（搜索 46px）；圆角 `md`；1px 边框；聚焦主色边框 + 3px 18% 主色光晕。
- `aria-invalid='true'` 使用 error 边框 + 16% error 光晕。
- 标签在上方，12–13px、600；必填、错误、帮助文本不得只靠颜色表达。
- 触控设备普通文本控件字号 16px，避免 iOS 聚焦缩放（可视化内联编辑器除外）。

### 图片加载契约

- 内容图（运营封面、POI 图片、Markdown 插图、头像）统一使用 `ProgressiveImage`。
- 占位方式是真实多级 LQIP：按 32/64/128/256/512/1024 的 2 倍阶梯，根据渲染尺寸取最后 3 档（第一档为第二档的一半），原图加载完成后覆盖；不要使用“原图加载完成后再降低模糊度”的动画。
- 低清快照阶段在图片右上角显示 `progress_activity` 状态图标，原图加载完成后自动消失；头像等小图不显示状态图标。
- 图标、地图瓦片、二维码、电报纸/物料模板保持原图直出，不接入 LQIP。
- 门户静态图片的 LQIP 位于 `apps/portal/assets/lqip/`，图片变更后运行 `pnpm portal:lqip` 重新生成。
- 远程图片只有命中 `next.config.mjs` 的 `images.remotePatterns` 才会生成 LQIP；未命中的远程图回退为中性底色。

### 分段控件契约

- 轨道：`surface-muted` + 3px 内边距 + 3px 间隙 + `full` 圆角，高度 40px（移动端 44px）。
- 选中项：`surface-selected` + primary 文本 + `shadow-soft` + 700 字重。
- 未选中项悬停：文本色 9% 半透明底；不要给整条轨道加背景滤镜。
- 选项数量 2–4 个；超过 4 个改用下拉或筛选 chip。

## Components

- **App Header**：移动端高度约 56px，桌面端约 64px。包含 Logo、当前页操作和账号入口。不要把说明性文字塞进顶部栏。运营首页在简体/繁体中文界面使用带文字 `wordmark`，英文界面使用 `symbol` 并在后方标题显示 `Yuchengtong`；地图、出行、更多服务三个一级页面始终使用 `symbol`，页面标题紧随其后。
- **Primary Navigation**：运营、探索、出行、服务四项使用 Material Symbols Outlined 图标加短文字。当前项用 selected 背景和 primary 文本。
- **Account Entry**：使用头像或 `account_circle` 图标，承接登录、退出、历史、偏好和通知。未登录显示登录入口；已登录显示头像；存在未读通知、待处理订单、审核待办或异常状态时显示一个合并计数徽标，具体来源进入账号/通知面板后展开。
- **Cards**：只用于独立内容项、列表项、弹窗和工具容器。资讯卡片应有固定缩略图比例，避免图片加载后跳动；非首屏列表封面默认使用懒加载和低优先级请求。
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
- **Material Workbench**：路牌物料与公共交通导视共用同一工作台骨架。桌面端按“模板与尺寸 / 内容编辑 / 实时预览”组织为三列，平板在预览操作后使用弹窗，移动端收敛为单列；顶部栏只保留预览、提交审核和下载命令。工作区面板使用 `surface-panel`、1px 边框和 8px 圆角，不使用厚重阴影；表单控件保持 44px 触控高度，数据来源使用标准分段选择器，预览底板只用于识别透明区域，历史记录使用分隔列表而不是嵌套卡片。公共交通导视的数据来源分段控件需要明确区分服务器线网和已导入线网；导入 RMP 后展示文件摘要、兼容性提示和只读边界，只允许在独立弹窗中补充线路显示名称，不让用户误以为可以直接修改 RMP 固有的站点、站序、站名或拓扑。

图标使用随项目本地嵌入的 Material Symbols Outlined；不要使用 `material-symbols-rounded`，避免部分图标无法清晰区分 `FILL` 填充状态。本地字体需要保留可变字体能力，继续通过 `font-variation-settings: 'FILL' 1` 表达选中态填充。

品牌、App 和网站图标源文件统一放在 `assets/brand/`，生成后的 Web/PWA 图标输出到 `apps/web/public/icons/`。提交源文件前不要把私有运维信息或外部账号密钥放进图标目录。

## Do's and Don'ts

- Do 使用 `DESIGN.md` front matter 中的 token 作为实现的权威值。
- Do 保持地图页全视口，业务面板覆盖或停靠在地图上。
- Do 保留地图页的侧边操作栈或底部抽屉，让搜索、路线规划、图层筛选和选中对象详情优先于数据源诊断信息。
- Do 为移动端按钮和控件保留至少 44px 触控目标。
- Do 为所有图标按钮提供 `aria-label` 或等效可访问名称。
- Do 让后台界面偏信息密度和任务效率，而不是前台宣传风格。
- Do 让两个物料工作台共享布局、控件状态与响应式规则，模板差异只进入编辑内容，不复制页面级样式。
- Do 让线路颜色来自数据，同时保证文本和标签可读。
- Don't 把地图、后台表格或整页分区包进装饰卡片。
- Don't 使用卡片套卡片。
- Don't 用一整套青绿色铺满所有状态和模块。
- Don't 在界面里放说明“如何使用本页面”的大段可见文字。
- Don't 使用负字距、夸张渐变背景、装饰光斑或纯氛围图片。
- Don't 把 PWA 安装提示做成首页强打扰弹窗。
