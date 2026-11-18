# 设计系统、样式与控件库（/dev/controls）规范性与覆盖度审计

> 后续实施计划与验收基线见 [UI_COMPONENTIZATION_PLAN.md](UI_COMPONENTIZATION_PLAN.md)（`pnpm ui:plan:status` 查看实时进度）。

> 审计对象：`DESIGN.md`、`packages/design-tokens`、`apps/web/app/globals.css`、`/dev/controls` 及 `scripts/ui-controls-inventory.mjs`
> 审计方式：只读静态审计（未修改业务代码）；基线 commit `b6f5751`
> 审计时间：2026-11-16

## 0. 结论摘要

项目已经具备一条**完整的设计系统链路**：规范文档（DESIGN.md）→ token 包（packages/design-tokens）→ 全局样式标准层（globals.css 末尾「控件统一标准层」）→ 控件展示板（/dev/controls）→ AST 控件清单与构建门禁。这条链路在同类项目中属于较成熟的做法，方向正确。

但「规范性」和「覆盖度」呈**核心强、外围弱**的形态：

- **强**：颜色 / 圆角 / 间距 / 阴影 token 采纳度高（CSS 中 68%–87% 的声明走 token）；36 个业务路由 100% 进入 AST 清单并在 `apps/web build` 时强校验；13 种原生输入类型全部有展示入口；亮/暗主题、三档材质、厚度在展示板可直接切换。
- **弱**：排版与控件尺寸几乎未 token 化（字号 token 使用率 0.3%，控件尺寸 token 使用 0–2 次）；23 个展示板分区只有 7 个（30%）挂载了真实组件预览，8 个共享预览组件；业务代码 1,787 个类名中仅约 38 个进入标准目录；`controls-registry.json` 里 51 个登记类名有 9 个（18%）在 CSS 和业务代码中都不存在；仓库没有任何 CI（`.github` 仅有 PR 模板），所有检查依赖本地手动执行。

### 记分卡

| 维度                               | 关键证据                                                                                           | 评级 |
| ---------------------------------- | -------------------------------------------------------------------------------------------------- | ---- |
| 颜色 / 圆角 / 间距 / 阴影 token 化 | CSS 声明走 `var(--yct-*)`：颜色 87%、背景 75%、圆角 77%、gap 68%、padding 56%、阴影 45%            | B+   |
| 排版 token 化                      | 1,040 条 `font-size` 中仅 3 条用 token（0.3%）；81 种字号、23 种字重                               | D    |
| 控件尺寸 token 化                  | `--yct-control-height-*` 全站使用 0–2 次；主按钮 42px、次按钮 38px 与 DESIGN.md 的 40px 约定不一致 | D+   |
| 设计规范文档（DESIGN.md）          | 覆盖颜色/排版/布局/动效/材质/组件契约，但为 alpha 版本，与 token 包/实现有 4 处硬冲突              | C+   |
| 标准控件目录（/dev/controls）      | 23 分区、8 分类、51 个标准类名；其中 9 个类名不存在、13 个在业务代码中零使用；状态全部为 stable    | C    |
| 业务页面清单覆盖                   | 36/36 路由、150 个源码文件、3,765 组节点；`ui:controls:check` 通过并挂在 Web 构建上                | A-   |
| 共享组件真实预览覆盖               | 58 个被 ≥2 个页面引用的组件，仅 8 个进入展示板（13.8%）；7/23 分区有真实预览                       | D+   |
| 主题 / 状态覆盖                    | 亮暗主题 + 三档材质 + 厚度在展示板可试；错误/禁用/只读状态矩阵有专门分区；但视觉验收仍靠手工       | B    |
| 自动化治理                         | 27 个 `verify-*` 脚本、无 CI、无 token/registry 一致性校验、无视觉回归基线                         | C-   |
| 样式工程可维护性                   | 单文件 37,562 行 / 948 KB、2,121 个类名、274 个 `!important`、约 186 个疑似无引用类名              | C    |

## 1. 审计范围与方法

| 对象                        | 规模                                                                              |
| --------------------------- | --------------------------------------------------------------------------------- |
| `DESIGN.md`                 | 370 行，含 front matter token 规格                                                |
| `packages/design-tokens`    | 105 个 CSS 变量（`tokens.css` 209 行）+ 107 行 TS 导出                            |
| `apps/web/app/globals.css`  | 37,562 行 / 948,301 字节；5,403 个规则块；2,121 个类名；411 段分区注释            |
| `apps/web/app/dev/controls` | 展示板 2,061 行；registry 357 行；自动生成清单 1.35 MB；另有 4 个拆分组件文件     |
| Web 应用                    | 37 个 `page.tsx`（36 个业务路由 + 1 个 /dev/controls）；125 个 `components/*.tsx` |
| 校验脚本                    | `scripts/ui-controls-inventory.mjs`（290 行）+ 27 个 `scripts/checks/verify-*`    |

方法：解析 CSS/TSX/JSON 做统计与交叉比对；运行 `node scripts/ui-controls-inventory.mjs --check`；逐项核对 DESIGN.md / tokens.css / registry / globals.css 的数值与命名；未执行浏览器视觉验收。

## 2. 体系结构现状

1. **规范层 `DESIGN.md`**：front matter 定义颜色、动效、排版、圆角、间距、组件规格；正文补充兼容基线（iOS 16.7 / Safari 16.6）、材质模式、组件族与别名、弹窗/字段/图片加载/分段控件契约。
2. **Token 层 `packages/design-tokens`**：`tokens.css` 提供 105 个 `--yct-*`（颜色、语义状态色、圆角、间距、阴影、动效、控件尺寸、安全区、弹窗尺寸），并在 `[data-accent]` / `[data-motion]` / `[data-color-scheme]` 下做主题覆盖；`index.ts` 导出 `yctTokens` 常量。
3. **样式层 `globals.css`**：导入 token 后定义 71 个本地 token（字体、材质、地图布局等）；文件末尾新增「控件统一标准层（Design Token 驱动）」，集中收口按钮/图标按钮/焦点环/状态芯片/分段控件/字段/触屏 44px。
4. **展示与清单层 `/dev/controls`**：23 个分区按 8 类组织，页面由 `controls-registry.json` 驱动目录、类名、别名与共享预览登记；`controls-inventory.json` 由 AST 扫描生成（36 路由 / 150 文件 / 3,765 组节点），展示板可按页面、类型、预览状态与关键字筛选。
5. **门禁**：`apps/web` 的 build 脚本执行 `ui-controls-inventory.mjs --check`、Material Symbols 校验和 `next build`；根 build 另加 `map:measure:check`、`changelog:check`。**没有 CI**：`.github` 只有 `pull_request_template.md`，上述门禁只在本地构建时生效。

## 3. 规范性评估

### 3.1 设计 Token：颜色/间距层成熟，排版与控件尺寸层缺位

- **采纳率（CSS 声明中值来自 `var(--yct-*)` 的比例）**：颜色 87%、背景 75%、圆角 77%、gap 68%、padding 56%、盒阴影 45%、margin 9%、字号 0.3%。模块级布局值（宽高、margin）基本是字面量，符合预期；但**字号是明确缺口**。
- **排版**：1,040 条 `font-size` 只有 3 条使用 token；81 种不同字号（最高频 12px×293、13px×196、18px×77、11px×75、14px×49、20px×43、16px×38）；23 种 `font-weight` 取值（700×160、650×74、800×55、600×47，另有 560/620/740/760/780 等），而 token 只提供 600/700 两档。DESIGN.md 的 typography 规格没有对应 CSS 变量（tokens.css 中无任何字号/字重变量），展示板页眉「视觉取值来自 packages/design-tokens」只对颜色/间距等部分成立。
- **控件尺寸**：tokens 中 `--yct-control-height-sm/md/lg`、`--yct-button-*`、`--yct-field-*`、`--yct-chip-*`、`--yct-segment-*` 齐全，但实测使用次数极低：control-height-sm 0 次、md 2 次、lg 2 次、size-md 2 次、button-padding-x 1 次、button-font-size 1 次、field-height 1 次、segment-track-height 1 次；使用较多的是 tap-target（21 次）、disabled-opacity（8 次）、focus-ring（各 3 次）。
- **断点**：DESIGN.md 规定 ≤720 移动端、721–1199 平板、≥1200 桌面；实际 CSS 断点以 **760px 为主（26 次）**，另有 720px（6）、560px（8）、640px（6）、900px、1219/1220px 等 31 种 `@media` 查询。断点未 token 化，也未与文档对齐。
- **兼容基线落实较好**：`viewport-fit=cover`、安全区 token、`100dvh` 优先（6 处 `100vh` 均为 `calc(100vh - …)` 的兜底）、`backdrop-filter` 97 对前缀（1 处 `::-moz-range-thumb` 无需前缀）、`scrollbar-width` 缺失时有 `@supports` + `::-webkit-scrollbar` 回退、`pointer: coarse` 下主要按钮/图标按钮/滑杆 44px、触屏文本控件 16px 且显式列出内联编辑器豁免。
- **问题点**：
  - `--yct-color-text-primary` **未定义**（`globals.css:22457` `.material-preview-error` 使用），属于无效声明，文字颜色会回退继承；
  - 13 个 token 在 Web 端无引用（如 `--yct-space-10`、`--yct-space-12`、`--yct-gutter-*`、`--yct-control-height-sm`、`--yct-dialog-width-md`；`--yct-color-accent-red/gray` 仅在 tokens.css 内部做映射）；
  - 旧值 fallback 与 token 漂移：`var(--yct-color-warning, #9b6514)`（token 实为 #b87900）、`var(--yct-color-success, #167d42)`（实为 #168a5d）、`var(--yct-color-danger, #c11111)`（实为 #b42318）等；
  - `--yct-material-hover-state` 在同段 `:root` 中重复定义两次（后者覆盖前者）；
  - 标题按钮 `.topbar-page-title` 只写 `appearance: none`，缺 `-webkit-appearance`（DESIGN.md 要求成对）。

### 3.2 组件规范：registry 的「标准类名」有 18% 是幻影

- 23 个分区、51 个登记类名，**全部 `status: "stable"`**；`controls-doc.tsx` 虽支持 beta/deprecated 文案，但没有任何分区使用，展示板的状态徽标与筛选失去区分意义。
- **9 个登记类名在 CSS 与业务 TSX 中都不存在**：`checkbox-control`、`selection-row`、`operation-list-item`、`trip-card`、`attachment-row`、`list-toolbar`、`batch-action-bar`、`filter-strip`、`range-input`。其中：
  - `range-input` 实际是共享组件 `RangeInput`，其根节点类名是 `dual-range-input`；
  - `filter-strip` / `trip-card` 的实际类名是 `search-filter-strip` / `schedule-trip-card` 等；
  - 「复选框与选择行」「列表项与卡片」「工具栏与批量操作条」**3 个分区的标准类名全部为幻影类**。
- **13 个登记类名在业务代码中零使用**（仅在展示板出现或完全未用）：上述 9 个 + `is-emphasis`、`controls-field-wide`、`controls-field`、`account-button`；另有 `.chip` 旧别名有样式但无使用。
- **类名/别名归档不一致**：`account-button`、`pill-button` 在 `controls-buttons` 中作为「历史别名」，却在 `controls-navigation` 的 `classes` 里作为标准类名出现；`chip` 同样只存在于别名表。
- **重复实现**：`SegmentedControl` 存在两份实现——共享组件 `components/segmented-control.tsx`（15 个路由引用）与 `account-settings-panel.tsx:2189` 内部同名组件（fieldset + 手写 `.segmented-control` 结构）；`metro-wayfinding-editor.tsx` 另有一层同名包装。与 DESIGN.md「所有控件按语义族归一，不按页面复制」冲突，且现有 check 只对 2 个 `exclusiveClasses` 做复制检测，无法发现这类重复。
- **别名一致性无校验**：DESIGN.md 要求历史别名「视觉必须与标准一致」，但 `.pill-button` 基础规则 38px、`.primary-action-button` 42px、末尾标准层 40px（触屏 44px），别名与标准实际依赖层叠顺序收敛，没有自动断言。

### 3.3 样式工程：单文件巨型样式表，历史值与新标准层共存

- `globals.css` 已达 **37,562 行 / 948 KB**、5,403 个规则块、2,121 个类名、411 段注释；组织靠注释分区（质量尚可），但无 CSS Modules / 作用域 / `@layer`，所有规则全局级联。
- **尺寸历史值仍在**：`.primary-action-button` 基础规则 42px、`.secondary-action-button` 38px、`.icon-action-button` 38×38、`.pill-button` 38px、`.category-chip` 34px，与 token 的 40 / 28 不一致；末尾「控件统一标准层」用 `:is(...)` 覆盖为 40px，触屏 44px，但页面级覆盖仍存在 30/32/34/38/40px（如 `.admin-content-actions button` 34px、`.telegraph-floating-toolbar .secondary-action-button` 38px、`.map-history-actions` 32px）。**最终尺寸依赖选择器权重与书写顺序**，是后续维护的隐患。
- `!important` 274 处（含移动端输入字号、单选框尺寸锁定等有意为之的场景），偏高。
- **魔法色值**：token 块之外仍有 302 处十六进制色值（其中 115 处为纯白/纯黑；部分为 `mask-image` 渐变所需黑白色，属合理），另有 `rgb()/rgba()` 162 处；TSX 中 588 处十六进制色值（34 个文件），集中在物料/导视渲染器（`material-glyphs.ts` 148、`metro-wayfinding-import.ts` 109、`system-material-templates.ts` 78，属生成型业务色可接受），但 `map-stage.tsx` 27、`brand-logo.tsx` 23、`admin-transit-panel.tsx` 20 等 UI 文件也有硬编码色。
- **疑似死样式**：约 186 个类名未在 `apps/web` 的 TS/TSX 源码中以完整词出现（如 `map-line-realtime-*`、`telegraph-envelope-*`、`operations-reminder-*` 等），其中含动态拼接类名误报，但仍提示历史重构后样式未清理。
- **内联样式** 81 处 `style={{ … }}`；`apps/portal` 为独立静态站，自带 2,454 行 CSS、52 个变量（其中 19 个是手抄的 `--yct-radius/space/motion`，另 33 个自有变量）、48 处十六进制色值，**不在** AST 清单与展示板覆盖范围（文档已声明该边界）。

### 3.4 文档一致性：DESIGN.md ↔ tokens.css ↔ 实现存在 4 处硬冲突

| #   | 冲突点             | DESIGN.md                         | 实现                                                                |
| --- | ------------------ | --------------------------------- | ------------------------------------------------------------------- |
| 1   | `rounded.xl`       | 20px                              | `--yct-radius-xl: 28px`（`rounded.lg` 才是 20px）                   |
| 2   | `surface-selected` | `#D9F6ED`                         | `color-mix(in srgb, primary 16%, transparent)`（渲染值不同）        |
| 3   | 字体族             | front matter 全部写 `system-ui…`  | 正文与代码默认 `'HarmonyOS Sans SC'`（`--yct-font-family-harmony`） |
| 4   | 输入圆角           | `components.input.rounded = full` | `components.field.rounded = md`，实现用 `--yct-radius-md`           |

其他不一致：

- DESIGN.md 未收录 `success / warning / danger` 语义状态色、`border-subtle/strong`、`surface-elevated`、`brand-light/deep`、`motion-duration-enter/layout`、`easing-emphasized`；
- tokens.css 未收录 DESIGN.md 的排版尺度、布局尺度（625 / 960 / 176 / 320 / 360 等）、neutral 梯度（只以语义色形式存在）；
- `docs/UI_CONTROLS.md` 末尾残留「本轮没有新增测试文件」的评审轮次语句；其「源码登记，待共享预览」的口径由清单按节点自动推导，但 registry 本身没有对应字段，容易被误解为分区状态；
- 展示板页眉「视觉取值来自 packages/design-tokens」不准确（字体、断点、布局尺寸不在包内）；
- 文档声明「所有控件按语义族归一」，但 registry 中存在幻影类、重复实现与未进目录的共享组件（见 3.2、4.2）。

### 3.5 自动化与门禁

- ✅ 已有：AST 清单同步校验、分区锚点唯一、原生输入类型全覆盖、共享预览「业务 + 展示板」双向引用、两个共享 DOM 类禁止复制；`apps/web build` 时执行清单校验；27 个 `verify-*` 脚本覆盖单选/复选框、材质透明度、Material Symbols、metro 编辑器等局部回归。
- ❌ 缺失：
  - **无 CI**（`.github` 仅 PR 模板），`typecheck`、`ui:controls:check`、`metro:check` 均依赖人工；
  - 无 token 一致性检查（tokens.css ↔ index.ts ↔ DESIGN.md ↔ globals.css）；
  - 无 registry 有效性检查（类名是否在 CSS/业务中存在、status 枚举、别名重复）；
  - 无共享组件重复实现检测；
  - 无视觉回归/截图基线（`.screenshots` 目录无基线，展示板验收依赖人工）；
  - 无自动可访问性检查（焦点环、aria-label、对比度）。
- 说明：`apps/web` 的 TypeScript 类型检查本次直跑 `tsc` 通过（exit 0），但未纳入任何自动门禁；本次审计环境（Windows 沙箱）无法运行 `tsx`（esbuild 子进程被拦截），`verify-form-controls.ts` 未能本地复跑；该脚本已被 `metro:check` 收录，不构成项目缺陷，但说明其执行成本高、易被跳过。

## 4. 覆盖度评估

### 4.1 页面与源码清单：覆盖充分

- `ui:controls:check` 通过：**36 个业务路由 / 150 个源码文件 / 3,765 组源码节点**；37 个 `page.tsx` 中除 /dev/controls 外全部覆盖。
- 节点构成：交互控件 733（19.5%）、组件引用 715（19.0%）、样式容器 2,317（61.5%）。清单本质是「JSX 元素目录」，不是「控件种类目录」；循环实例会合并。
- 原生输入类型 13/13 全部在展示板有入口（checkbox、color、date、datetime-local、file、number、password、radio、range、search、text、time、url）。
- 路由节点量 Top：`/admin/map-areas/editor` 906、`/admin/map-poi` 888、`/services/road-materials` 850、`/map` 719；后台页面是本项目交互最密集的区域，也是控件规范收益最大的区域。

### 4.2 标准控件与共享组件：目录窄、预览更窄

| 口径                   | 数值              | 说明                                                                                                                                                         |
| ---------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| registry 分区          | 23 个（8 分类）   | 其中 7 个有真实组件预览                                                                                                                                      |
| registry 标准类名      | 51 个             | 其中 9 个不存在、13 个业务零使用 → 实际可用约 38 个                                                                                                          |
| 业务 JSX 类名          | 1,787 个          | 仅约 2.1% 进入 registry                                                                                                                                      |
| 共享预览组件           | 8 个              | RouteModeToggleList、RangeInput、SegmentedControl、MapLayerToggle、ScheduleStopTimeTable、PoiFacilityEditor、WorldCoordinatePicker、OperationTableOfContents |
| 被 ≥2 个页面引用的组件 | 58 个             | 8 个有预览（13.8%），50 个没有                                                                                                                               |
| 展示板分区真实预览率   | 7/23 = 30.4%      | 其余 16 个分区仍是手写样例                                                                                                                                   |
| 清单节点中共享预览     | 40 / 3,765 = 1.1% | 其余均标记「源码登记，待共享预览」                                                                                                                           |

未进入展示板的跨页共享组件（部分）：`MaterialSymbol`（36 路由）、`ProgressiveImage`（DESIGN.md 明确约定内容图必须使用，却无预览）、`ServerStatusPill`、`MobileActionRail`、`GlobalSearchPanel`、`AdminRefreshButton`（15 路由）、`AdminSectionNavigation`（11 路由）、`EditorHeaderToolbar` 等编辑器工具条族（9 路由）、`LayeredMapTile`、`CurrentPlayerLocationButton`、`TicketOrderDraftPanel` 等；另有 13 个全局桥接组件由 `layout.tsx` 引入、本身无控件节点，不计入页面清单。

> 口径提醒：1,787 个业务类名中大部分是页面级组合样式，registry 是「标准语义族」而非全量目录，2.1% 不代表 98% 的 UI 失控；但它说明**命名层面没有「标准 / 页面级」的区分机制**，只能靠 registry 人工维护，且 registry 目前存在幻影项。

### 4.3 展示板本身

- 4 个拆分文件 + registry + 1.35 MB 生成清单；`controls-showcase.tsx` 单文件 2,061 行 / 87.6 KB 手写样例，后续随控件增加会线性膨胀。
- 展示板提供：全局外观 dock（材质模式、明暗主题、材质厚度）、公开数据按需读取（复用真实 GET 接口，有加载/错误/空态）、内联筛选与分页清单、Do/Don't 规范块、标准类名/历史别名展示。
- 展示板页面的访问控制：开发环境开放，生产需 `NEXT_PUBLIC_ENABLE_CONTROLS=1`，否则 404，符合预期。

### 4.4 主题、状态与场景覆盖

- ✅ 亮/暗主题、三档材质、材质厚度、禁用/只读/错误/字段集单选等状态在展示板可切换查看；
- ✅ 真实浮层容器（modal、toast、material-field、map-layer-toggle、schedule-stop-time-table 的真实 DOM）有回归场景；
- ⚠️ 窄屏、真实地图容器、真实登录/权限分支、公共接口失败等场景仍依赖人工验收（文档已如实说明「静态清单不替代这一步」）；
- ⚠️ 无截图基线，无法回归视觉漂移。

### 4.5 边界与外部系统

- `apps/portal`（独立静态站）不在 AST 清单内，文档已声明；但其手工维护的 19 个 `--yct-*` 副本与 33 个自有变量，存在与主站 token 漂移的风险。
- `apps/web/public/legacy-assets/*.css`（约 81 KB）为旧站静态资源，不在设计系统内，属预期边界。

## 5. 问题清单（按优先级）

### P0 —— 直接错误或会误导使用者

1. **未定义变量**：`--yct-color-text-primary`（`globals.css:22457`）在 token 包与 globals 中均无定义，应改为 `--yct-color-text`。
2. **registry 幻影类**：9 个类名不存在、3 个分区的标准类名全为幻影；`range-input` 应以组件形式登记（`RangeInput` / `dual-range-input`）。
3. **无 CI**：构建门禁只在本地生效；至少应让 `ui:controls:check`、`typecheck` 在 PR 上必跑。
4. **旧 fallback 漂移**：清理 `#9b6514 / #167d42 / #c11111` 等与 token 不一致的 fallback，避免误导下一位维护者。

### P1 —— 体系一致性缺口

5. **排版/断点 token 化**：将 12/13/14/16/18/20px 等高频字号与 720/760 断点收敛为 token（或明确「排版不纳入 token」并在 DESIGN.md 记录）；统一 23 种字重到 3–4 档。
6. **控件尺寸收口**：删除历史 42/38px 等基础规则，或把「控件统一标准层」前移到组件基础规则处；用 `--yct-control-*` 取代页面级 30/32/34/38/40px 覆盖；把 `.category-chip` 34px 与 28px chip token 对齐。
7. **registry 自动校验**：类名必须存在于 CSS 且（或）业务代码；status 使用枚举；别名不得与标准类重复；registry 与展示板分区一一对应。
8. **重复实现治理**：合并 `account-settings-panel` 的本地 `SegmentedControl` 与 `metro-wayfinding-editor` 的包装层；check 增加「同名组件重复实现」检测。
9. **展示板覆盖**：优先把 `ProgressiveImage`、`MaterialSymbol`、`ServerStatusPill`、`MobileActionRail`、`AdminRefreshButton`、`AdminSectionNavigation`、编辑器工具条族纳入展示板（20+ 共享组件目标），并在 registry 中为「非控件/全局组件」建立明确分类，而不是留在清单里标记「待共享预览」。

### P2 —— 工程质量与长期维护

10. **拆分 globals.css**：按领域拆分（base / layout / map / admin / material / controls），或引入 `@layer` 管理级联顺序；清理约 186 个疑似无引用类名；降低 274 处 `!important`。
11. **DESIGN.md 对齐**：修正 radius xl、surface-selected、字体族、input 圆角 4 处冲突；补齐 success/warning/danger 等已实现 token；把 tokens.css 未覆盖的布局/排版值写入 front matter 或标注为「非 token」。
12. **CI 扩展**：`typecheck` + `ui:controls:check` + `metro:check` + `prettier --check`；对 `globals.css` 加「新增裸色值/裸字号」的 lint 提示。
13. **视觉回归**：对 /dev/controls 的关键分区（按钮、字段、分段、开关、弹窗、表格、地图悬浮件）建立亮/暗 × 三档材质 × 窄屏截图基线。
14. **Portal token 同步**：把 portal 的 19 个 `--yct-*` 副本纳入生成/校验流程，或文档明确「独立视觉域」。

## 6. 建议路线（可执行顺序）

1. 一周内：P0 四项（修变量、清幻影类、加 CI、清 fallback）+ registry 自动校验脚本（约 100–150 行，接在 `ui-controls-inventory.mjs` 之后）。
2. 两周内：排版/断点收口；删除 42/38px 基础规则并验证展示板与业务页面回归；合并 SegmentedControl 重复实现。
3. 一个月内：展示板补 8–12 个共享组件预览；DESIGN.md 与 token 包对齐；建立截图基线。
4. 持续：拆分 globals.css、清理死类、把「标准 / 页面级类名」写入命名约定或 registry 备注。

## 7. 附录：口径、数据与复现

### 7.1 主要数据表

| 指标                                       | 数值                                       |
| ------------------------------------------ | ------------------------------------------ |
| token 包变量数                             | 105（`:root` 首块）                        |
| globals.css 本地 token 数                  | 71                                         |
| Web 端零引用 token                         | 13                                         |
| 未定义但被引用的 token                     | 1（`--yct-color-text-primary`）            |
| CSS 规则块 / 类名 / 分区注释               | 5,403 / 2,121 / 411                        |
| `var(--yct-*)` 使用次数                    | 5,987                                      |
| `!important`                               | 274                                        |
| token 块外十六进制色值                     | 302（其中纯黑白 115）                      |
| TSX 十六进制色值                           | 588（34 文件）                             |
| 内联样式                                   | 81 处                                      |
| 字号声明 / 去重值 / token 使用             | 1,040 / 81 / 3                             |
| `@media` 去重查询                          | 31（760px×26、560px×8、720px×6、640px×6）  |
| registry 分区 / 分类 / 标准类名 / 共享预览 | 23 / 8 / 51 / 8                            |
| 业务路由 / 源码文件 / 清单节点             | 36 / 150 / 3,765                           |
| 展示板分区真实预览率                       | 7/23 = 30.4%                               |
| 跨页组件 / 有预览                          | 58 / 8 = 13.8%                             |
| portal CSS                                 | 2,454 行 / 45 KB / 52 变量 / 48 十六进制色 |

### 7.2 复现命令

```bash
node scripts/ui-controls-inventory.mjs --check   # 通过：36 个页面，150 个源码文件，3765 组源码节点
pnpm ui:controls:check                           # 同上（构建门禁）
pnpm metro:check                                 # 含 verify-form-controls.ts（本环境因沙箱无法执行 tsx）
node node_modules/typescript/bin/tsc -p apps/web/tsconfig.json --noEmit   # 通过（exit 0）
# pnpm --filter @yct/web typecheck 在本环境会触发依赖安装而失败，故改用上面的 tsc 直跑
```

### 7.3 口径与局限

- **节点数 ≠ 控件种类数**：清单按 AST 源码节点合并，循环生成的实例只算一组；因此不能用 3,765 反推控件数量。
- **类名统计含注释与动态拼接**：CSS 类名/色值统计基于文本正则，注释中的示例类名、运行时拼接的类名、生成型业务色会带来一定误差。
- **「疑似无引用类名」是上限**：动态拼接（如 `map-line-realtime-${state}`）会被误判为无引用。
- **未做浏览器视觉验收**：亮暗、材质、窄屏、真实浮层的最终观感仍需按 `docs/UI_CONTROLS.md` 的验收重点人工确认；本次审计未启动 dev server。
- **环境限制**：本机 Windows 沙箱禁止 esbuild/子进程管道，`tsx` 脚本与 `pnpm` 依赖安装未能完整执行；`node` 直接执行的静态统计不受影响。
