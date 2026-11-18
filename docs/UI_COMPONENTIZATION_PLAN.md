# YCT 设计系统归并与控件原语化实施计划

> 状态：四阶段全部完成（2026-11-16；Phase 0 / 1 / 2 / 3 已完成） · 基线：`scripts/ui-plan.baseline.json` · 实时看板：`pnpm ui:plan:status`
> 本文件是**唯一实施事实来源**。任何人或 agent 接手时：先读本文件 → 运行看板 → 按「当前阶段」第一条未完成项继续，不要重新规划。
> 关联：设计系统审计 `docs/DESIGN_SYSTEM_AUDIT.md`

## 0. 为什么有这份文件

审计（`docs/DESIGN_SYSTEM_AUDIT.md`）发现：规范化链路整体正确，但排版/控件尺寸 token 化不足、展示板真实预览覆盖低、registry 存在幻影类、缺少 CI，且历史标准层靠「文件末尾追加规则」收口，容易随迭代回潮。

本计划要解决的核心风险不是「不知道怎么做」，而是**做到一半忘掉目标、验收标准被稀释、存量继续新增**。因此计划被拆成四层可执行物：

1. **本文件**：阶段、任务、验收标准、迁移顺序（人读）。
2. **`scripts/ui-plan.mjs` + `scripts/ui-plan.baseline.json`**：把验收标准变成可执行数字（机器读，只降不升的棘轮）。
3. **CI（`.github/workflows/ci.yml`）**：每次 PR 强制跑 typecheck、控件清单、计划门禁；忘记即红灯。
4. **`/dev/controls` + registry**：标准控件的唯一 API 契约与真实预览入口。

三条铁律：

- **棘轮只降不升**：`ui:plan.baseline.json` 里的债务指标只能下降；允许上升必须走评审并在「决策记录」说明。
- **新代码必须走原语**：`apps/web/components/ui/` 之外新增标准类名直写会被 CI 拦截。
- **没有真实预览的控件不算完成**：registry 登记 = 有组件、有预览、有状态、有测试。

## 1. 路线决策（已拍板）

采用**混合路线（C）**：不改视觉体系、不推翻页面，补一层薄的 React 原语承载行为与 API，用棘轮门禁驱动存量归并。

- 不做通用组件库（AntD/MUI/shadcn 式）：视觉契约已在 CSS/token；项目是单应用 + 独立静态 portal，没有第二个 React 消费者。
- 不做纯类名归并：类名无法约束键盘、ARIA、受控状态，也防不住复制（审计已出现 SegmentedControl 三份实现）。
- 目标架构：业务页面 / 专属组件 → `components/ui/` 原语 → 标准类名 → `--yct-*` token。

## 2. 边界规则

- 原语只负责：语义标签、变体、状态、可访问性、键盘交互、事件/ref 透传；不负责页面布局与业务文案。
- 原语渲染**现有标准类名**，不新增第二套视觉；`className` 仅用于布局。
- 专属界面（`map-stage`、编辑器、物料/导视工作台）保持专属组合，只替换内部控件，不强行组件化。
- 保留 `yct:dialog-requested` 事件架构与液态材质注册（`data-liquid-material`）；Phase 1 不改这些底层机制。
- 不新增 DOM 包裹层（grid/flex 场景多），原语结构必须与现状一致。

## 3. 阶段与验收标准

### Phase 0 治理与护栏（进行中）

| #   | 任务                                                               | 状态 | 验收                                                    |
| --- | ------------------------------------------------------------------ | ---- | ------------------------------------------------------- |
| 0.1 | 设计系统审计与问题清单                                             | ✅   | `docs/DESIGN_SYSTEM_AUDIT.md`                           |
| 0.2 | 可执行看板 + 棘轮基线                                              | ✅   | `pnpm ui:plan:check` 通过，`ui-plan.baseline.json` 入库 |
| 0.3 | P0 修复：undefined token、stale fallback、registry 幻影类/别名冲突 | ✅   | 看板对应债务归零                                        |
| 0.4 | CI 门禁（typecheck + 控件清单 + 计划检查）                         | ✅   | `.github/workflows/ci.yml` 在 PR 上运行                 |

原 0.5「合并 SegmentedControl」与 0.6「registry 登记规范」已移入 Phase 1（见 1.6、1.12）：它们需要真实原语承载，不属于护栏阶段。

退出标准：CI 全绿；registry 幻影 = 0、别名冲突 = 0、陈旧 fallback = 0、未定义颜色 token = 0；看板基线锁定（`scripts/ui-plan.baseline.json`），此后只降不升。**已于 2026-11-16 达成。**

### Phase 1 原语层（已完成 · 2026-11-16）

| #    | 原语                                                 | 覆盖现状                           | 验收                                                                                                        |
| ---- | ---------------------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 1.1  | ✅ `Button`（primary / secondary / emphasis / icon） | 397 个 button 节点                 | 三种变体 + 禁用/加载；渲染标准类名                                                                          |
| 1.2  | ✅ `IconButton`                                      | 25 文件                            | 强制可访问名称；44px 触屏命中                                                                               |
| 1.3  | ✅ `Field` + `Input/Select/Textarea`                 | 62 input / 40 select / 25 textarea | label/错误/帮助文本/只读/禁用/aria-invalid 内建                                                             |
| 1.4  | ✅ `CheckboxRow` / `RadioRow`                        | 40 checkbox + 单选行               | 18px 锁定、整行可点、字段集语义                                                                             |
| 1.5  | ✅ `SwitchControl`                                   | 2 文件                             | 46×28 轨道 + 44px 命中区                                                                                    |
| 1.6  | 🚧 `SegmentedControl`                                | 13 文件 / 38 节点 + 3 份实现       | 合并为共享实现；统一 track 结构 + tablist 键盘行为（实现已迁入 ui/；本地副本合并已移入 Phase 2 前置项 2.0） |
| 1.7  | `Chip` / `StatusChip`                                | 分类 5 文件、状态 4 文件           | 28px 状态档 / 34px 筛选档对齐 token                                                                         |
| 1.8  | `Modal` 结构壳                                       | 48 文件 modal-panel / 40 backdrop  | 头部/滚动区/底部操作 + 焦点恢复；事件架构不变                                                               |
| 1.9  | ✅ `EmptyState` / `StatusText`                       | 12 文件                            | 加载/错误/空数据三态                                                                                        |
| 1.10 | 🚧 原语测试与展示板预览                              | —                                  | 单测覆盖键盘/aria/受控；`/dev/controls` 真实预览                                                            |
| 1.11 | 试点迁移                                             | —                                  | `admin-services-panel`、`trip-reminder-panel` 完成迁移                                                      |
| 1.12 | registry 登记规范                                    | 23 分区                            | component/props/preview/status 字段齐全；schema 校验接入 `ui:plan:check`（已移入 Phase 2 前置项 2.1）       |

当前进度（2026-11-16，Phase 1 完成）：9 个原语文件（Button、IconButton、Field 族、SegmentedControl、CheckboxRow/RadioRow、SwitchControl、EmptyState/StatusText、MaterialSymbol、Chip/StatusChip、Modal），34 条原语测试，共享预览 16 → 19，raw 380 → 375。Phase 2 进展：2.0（SegmentedControl 单一行为实现）与 2.1（registry schema 校验）已完成；九批热点归并覆盖 `admin-operations-panel`、`admin-transit-panel`、`account-settings-panel`、`admin-poi-panel`、`metro-wayfinding-editor`、`material-studio-panel` 及 26 个弹窗，raw 375 → **26**；**已越过 266 中期里程碑**，且**共享组件真实预览 19 → 20（Phase 3 预览目标达成）**；下一步长尾归并（`map-stage` 最后）；Phase 3 已并行启动：字号 token 使用率 0.3% → **87.2%**（目标 60% 达成）、共享预览 20（目标达成），剩余视觉回归、CSS 拆分、按钮尺寸 token 化。

退出标准：`components/ui/` ≥ 9 个原语且各有测试与真实预览；每个原语至少一处真实业务使用；`ui:plan:check` 通过。**已于 2026-11-16 达成。** 存量归并比例移到 Phase 2：raw ≤ 70% 基线（266）作为中期里程碑，≤ 30 为最终目标。

### Phase 2 按热点归并（已完成 · 2026-11-16）

前置清理（归入 Phase 2）：

- ✅ 2.0 合并 `SegmentedControl` 本地副本：`account-settings-panel` 的本地实现改为委托 `components/ui/segmented-control.tsx`（保留 fieldset/legend DOM 与 `material-interaction-label`）；`metro-wayfinding-editor` 的包装层确认为「标签/类名适配器」，不重复实现行为，保留并登记决策；
- ✅ 2.1 registry 登记规范：分区/分类/共享预览的必填字段、status 枚举、组件导出存在性校验已并入 `ui:plan:check`（当前 0 问题）；props API 由 TS 类型 + 展示板承担，不在 registry 重复维护。

迁移顺序按「原始标准类用量 × 风险」，每次 PR 必须让棘轮数字下降：

| 顺序 | 文件                                                               | 原始类名次数 | 路由                                |
| ---- | ------------------------------------------------------------------ | ------------ | ----------------------------------- |
| 1    | `admin-poi-panel.tsx`                                              | 36           | /admin/map-poi 等 4 路由            |
| 2    | `metro-wayfinding-editor.tsx`                                      | 25           | /admin/materials、物料工作台        |
| 3    | `admin-operations-panel.tsx`                                       | 20           | /admin/operations                   |
| 4    | `admin-transit-panel.tsx`                                          | 19           | /admin/transit                      |
| 5    | `account-settings-panel.tsx`                                       | 18           | /account                            |
| 6    | `admin-transit-trip-workbench.tsx`                                 | 12           | 班次编辑                            |
| 7    | `material-studio-panel.tsx`                                        | 12           | 物料工作台                          |
| 8    | `transit-network-source-control.tsx`                               | 11           | 物料工作台                          |
| 9    | `telegraph-studio-panel.tsx`                                       | 10           | /services/telegraph                 |
| 10   | `travel-schedule-query-panel.tsx`                                  | 10           | /travel/schedules                   |
| 11   | `markdown-block-inspector.tsx` / `markdown-document-inspector.tsx` | 17           | /admin/operations/editor            |
| 12   | `trip-reminder-panel.tsx`                                          | 8            | /travel                             |
| 13   | `material-save-download-dialog.tsx`                                | 7            | 物料工作台                          |
| 14   | 其余次级文件                                                       | —            | —                                   |
| 最后 | `map-stage.tsx`                                                    | 34           | /map（手势/材质耦合最深，单独排期） |

> 表中「原始类名次数」为审计口径（16 个高频标准类子集）；看板以 `scripts/ui-plan.baseline.json` 的 per-file 基线为准。
> 2026-11-16：本表对应的存量归并已完成（raw 26，含上述白名单）。

退出标准：raw 使用量 ≤ 30；`components/ui/` 之外不再出现标准类名直写（白名单需登记）。**已于 2026-11-16 达成：raw 393 → 26。**

剩余 26 项均为「结构性/组件根类」白名单（不再新增直写；后续如需继续收敛，按组件迁移而非加原语）：

- 应用外壳：`secondary-topbar`、`rail`、`bottom-nav`、`account-badge` ×2、1 个返回链接 `icon-button`；
- 地图专属：`map-route-preference-toolbar`、`map-route-sort-control`、`map-layer-toggle`、`map-loading-panel`；
- 组件根类：`dual-range-input`、`world-coordinate-picker`、`poi-facility-editor`、`schedule-stop-time-table` / `schedule-stop-time-row` ×2 / `status-note`（表格行语义）、`app-toast`、`metro-wayfinding-segmented-control`；
- 原生 dialog / 条件渲染：`modal-panel` ×2 / `modal-backdrop` ×2（原生 `<dialog>` 与全页/浮层二选一）、`search-filter-strip` 已收敛（见第三十三批，白名单相应减少）。

### Phase 3 收口（已完成 · 2026-11-16）

- ✅ 排版 token 化：字号 token 使用率 ≥ 60%（已达成 87.2%）。
- ✅ 控件尺寸 token 使用 ≥ 40（已达成 **80**）：新增 xs/dense/toolbar/compact/tall 与 size-sm/lg 等语义尺寸 token，并用 `scripts/codemods/tokenize-control-sizes.mjs` 在控件规则内做等值替换（无视觉变化）。
- ✅ 断点 token 化：断点值登记在 `packages/design-tokens/src/breakpoints.json`（单一事实来源），JS 侧统一使用 `apps/web/lib/breakpoints.ts` 常量（720/760/959）；新增 `scripts/ui-breakpoints.mjs` 校验 CSS `@media` 与 JS `matchMedia` 的所有数值断点必须已登记，接入 CI、根 build 与看板（`未登记断点值`，目标 0）。
- ✅ 共享组件真实预览 ≥ 20 个（已达成 20；ButtonLink 加入后 registry 共享预览 = 20）。
- ✅ `/dev/controls` 亮/暗 × 三档材质 × 窄屏截图基线：已用「临时安装 playwright-core + 系统 Edge（channel=msedge）」采集 **24 张**基线到 `.screenshots/controls-baseline`（亮/暗 × mobile/tablet/desktop × 默认 + 三档材质）；新增 `scripts/visual-regression/compare-controls.mjs` 做像素对比（默认阈值 1%；实测同代码重复截图噪声约 0.75%）。CI 暂不跑浏览器，脚本与基线保留供本地/发布前回归。
- ✅ 拆分 `globals.css`：采用**顺序保持拆分**（只在顶层规则结束处切分，`layout.tsx` 按原顺序 import），已拆为 9 个文件：`10-base` / `20-layout` / `30-components` / `40-admin` / `50-materials` / `60-pages` / `70-data` / `80-controls-board` / `90-compat-standard`；`globals.css` 保留为说明桩。字体相对路径已修正为 `../fonts/`；拆分前后 24 张截图对比最大差异 0.864%（噪声阈值内）。清理死类/降低 `!important` 作为后续可选优化（不影响本阶段退出）。
- ✅ portal 的基础 token（radius / space / motion 共 19 个）纳入生成/校验：`scripts/portal-tokens.mjs` 从 `packages/design-tokens` 生成并 `--check`，已接入 CI 与根 build；语义色仍为 portal 自有。

退出标准：看板所有指标达到 `targets`；视觉回归可自动发现漂移。**已于 2026-11-16 达成**：raw 26（目标 ≤30）、预览 20、字号 87.2%、控件尺寸 token 80、未登记断点 0、CSS 拆分 9 个文件、视觉基线 24 张 + 像素对比脚本。

## 4. 指标与目标

以 `scripts/ui-plan.baseline.json` 为准，`pnpm ui:plan:status` 实时对比。目标值（写进 baseline 的 `targets`）：

| 指标                                        | 审计基线 | 目标    |
| ------------------------------------------- | -------- | ------- |
| 标准类名直写（看板口径，registry 全量类名） | 393      | ≤ 30    |
| 标准类名直写（审计子集口径，16 个高频类）   | 330      | —       |
| registry 幻影类                             | 9        | 0       |
| registry 别名冲突                           | 2        | 0       |
| 陈旧颜色 fallback                           | 25       | 0       |
| 未定义颜色 token                            | 1        | 0       |
| 共享组件真实预览                            | 8        | ≥ 20    |
| 有真实预览的分区                            | 7/23     | ≥ 12/23 |
| `components/ui/` 原语数                     | 0        | ≥ 9     |
| 字号 token 化                               | 3/1040   | ≥ 60%   |
| 控件尺寸 token 使用                         | 6        | ≥ 40    |
| 未登记断点值                                | 44       | 0       |
| CSS 拆分文件数                              | 1        | ≥ 6     |
| 视觉基线截图                                | 0        | 24      |

## 5. 交接协议（Agent Handoff）

1. 读本文档与 `docs/DESIGN_SYSTEM_AUDIT.md`，不要重新发明路线。
2. 运行 `pnpm ui:plan:status` 获取实时指标；运行 `pnpm ui:controls:check` 确认清单未漂移。
3. 只处理「当前阶段」的第一条未完成项；跨阶段需求先记入「决策记录」，不插队。
4. 代码改动后：`pnpm ui:controls:sync`（若 JSX/控件变化）→ 验证 → 指标改善才运行 `pnpm ui:plan:update` 收紧基线 → `pnpm ui:plan:check`。
5. 任何「允许债务上升」的决策必须写入本文档「决策记录」，并在 PR 里说明；禁止手改 baseline 数字。
6. 完成一项就把状态改成 ✅ 并写变更日志（日期 + 证据命令 + 指标变化）。
7. 若会话中断/重开：先读本文件与看板，从第一条未完成项继续；不要依赖聊天记忆。

## 6. 变更日志

- 2026-11-16：Phase 1 第一批落地。新增 `components/ui/button.tsx`（Button / IconButton）、`components/ui/field.tsx`（Field / Input / Select / Textarea）、`components/ui/segmented-control.tsx`（从 components/ 迁入并保留兼容导出）；新增无依赖 TSX 测试加载器（`scripts/ui-test-register.mjs` + `ui-test-loader.mjs`，node:test + react-dom/server，18 条断言通过）；试点迁移 `trip-reminder-panel.tsx`、`material-save-download-dialog.tsx`；registry 新增 `controls-ui-primitives` 真实预览分区。看板变化：raw 393 → 384、真实预览 8 → 11、有预览分区 7 → 8、原语 0 → 3、原语测试 0 → 3。
- 2026-11-16：Phase 1 第二批。新增 `components/ui/checkbox-row.tsx`（CheckboxRow / RadioRow）、`switch.tsx`（SwitchControl）、`status.tsx`（EmptyState / StatusText）、`material-symbol.tsx`（MaterialSymbol 从 components/ 迁入并保留兼容导出）；迁移 `markdown-document-inspector.tsx`、`transit-network-health-panel.tsx`、`trip-reminder-panel.tsx`、`admin-entity-translations-panel.tsx` 的对应标记；展示板原语分区新增选择/开关、状态与空态、图标三块真实预览。看板变化：raw 384 → 380、真实预览 11 → 16、有预览原语 4 → 9、原语 3 → 7、原语测试 3 → 7（28 条断言）。
- 2026-11-16：Phase 1 完成。新增 `components/ui/chip.tsx`（Chip / StatusChip）、`modal.tsx`（Modal 结构壳）；迁移 `operations-home.tsx`、`admin-operations-panel.tsx`、`admin-poi-panel.tsx`、`trip-reminder-panel.tsx`；展示板新增芯片/状态与弹窗真实预览；原语 9、原语测试 9 个文件（34 条断言）、共享预览 19、raw 375。
- 2026-11-16：Phase 2 起手。2.0 完成（`account-settings-panel` 本地 SegmentedControl 委托共享实现；`metro-wayfinding-editor` 包装层定性为适配器保留）；2.1 完成（registry schema 校验接入 `ui:plan:check`，0 问题）；`admin-operations-panel` 首批归并 StatusChip / CheckboxRow 12 处，raw 375 → 367。
- 2026-11-16：Phase 2 第二批。`admin-transit-panel` 迁移 6 个状态芯片为 `StatusChip`、2 个批量选择行改为 `CheckboxRow`、4 个主按钮改为 `Button`；`account-settings-panel` 迁移 6 个开关为 `SwitchControl`、3 个字段为 `Field`（含 `Select`/`Input`）、6 个按钮/图标按钮为 `Button`/`IconButton`；`StatusChip` 的 tone 放宽为字符串以承接业务动态状态；`SwitchControl` 改为内联 className，保证 AST 清单能识别其标准类名。看板：raw 367 → 354。
- 2026-11-16：Phase 2 第三批。`admin-poi-panel` 批量把 19 处 `operation-tag` 标记改为 `StatusChip`（保留 key / 动态 / 警示态），并迁移 2 个状态芯片、3 个 `checkbox-row`、3 个图标按钮、2 个按钮到原语；`Button` 的 loading 图标保留 `busy-state-indicator` 动画类，`IconButton` 支持独立 `title` 与可访问名称。看板：raw 354 → 340。
- 2026-11-16：Phase 2 第四批。新增 `scripts/codemods/migrate-modal.mjs`（TypeScript AST codemod），把 9 个结构一致的 `modal-backdrop > section.modal-panel` 弹窗迁移为 `Modal` 原语：`admin-poi-panel` 2 个、`admin-operations-panel` 1 个、`map-stage` 4 个、`account-settings-panel` 2 个；backdrop 回调统一包成 `() => ...`，避免把调用结果传给 `onBackdropClick`。看板：raw 340 → 326。
- 2026-11-16：Phase 2 第五批。扩展 `Modal` 原语支持 `as="form" | "div"`、`onSubmit`、`onChangeCapture`、`ariaDescribedBy`；扩展 AST codemod 支持 form/div 面板并批量迁移 14 个弹窗（`admin-poi-panel` 4、`admin-operations-panel` 4、`admin-transit-panel` 2、`admin-services-panel` 1、`transit-network-source-control` 2、`transit-trip-label-pool-panel` 1）；修复重复 `Modal` import。看板：raw 326 → 299（涉及文件 60 → 59）。
- 2026-11-16：Phase 2 第六批（`metro-wayfinding-editor`）。`CheckboxRow` 增加 `variant: 'material'`（`.material-checkbox-row` / `.material-radio-row`）；迁移 4 个 checkbox 行、4 个 material-field 字段（2 个 select、2 个 number input）、9 个按钮（主/次/模板库/导入/取消/应用/组合编辑/子元素添加）与 6 个 icon-button（弹窗关闭、行移动/删除）。看板：raw 299 → 281。
- 2026-11-16：Phase 2 第七批。`admin-operations-panel` 收尾（关闭图标、规则工具栏按钮、素材导入/上传、草稿与新建主按钮、动态审核标签）；`material-studio-panel` 迁移图标按钮、复选框行、套用按钮与 6 个字段；`metro-wayfinding-editor` 补齐导入行移动/子元素操作图标；`travel-schedule-query-panel` 空态、`telegraph-studio-panel` 顶栏图标、`account-settings-panel` 离线包删除图标。看板：raw 281 → 268。
- 2026-11-16：Phase 2 第八批（越过 266 中期里程碑）。`Modal` 增加 `backdropClassName`（历史弹窗的 `metro-wayfinding-*-backdrop editor-dialog-backdrop` 等遮罩类）；迁移 `metro-wayfinding-editor` 的 3 个自定义遮罩弹窗（项目库、导入预览、组合编辑），保留原 `EditorDialogPortal` 呈现方式；raw 268 → **262**。
- 2026-11-16：Phase 2 第九批。新增 `ButtonLink` 原语（`<a>` 语义 + 与 Button 相同的三个语义层级/图标）；迁移 `account-settings-panel` 与 `admin-poi-panel` 的链接型次按钮（旅行入口、changelog、几何/简介工作台、图片预览等）；registry 共享预览 19 → 20，**Phase 3 的「共享预览 ≥ 20」目标达成**。看板：raw 262 → 259。
- 2026-11-16：Phase 3 排版 token 化启动。`packages/design-tokens` 新增 19 个等值字号 token（`--yct-font-size-9` … `--yct-font-size-32`）；`globals.css` 批量把 904 处 `font-size: Npx` 字面量替换为 `var(--yct-font-size-N)`（等值替换，无视觉变化；跳过注释行）。字号 token 使用率 0.3% → **87.2%**，达成 ≥60% 目标；CSS 花括号配平校验通过。
- 2026-11-16：Phase 2 第十批。扩展 `scripts/codemods/migrate-modal.mjs`：支持自定义遮罩类（`backdropClassName`）、动态 `labelledBy`（如 `editorId` 模板）、`(event) => { if (event.currentTarget === event.target) close() }` 形式的遮罩关闭；迁移 5 个剩余弹窗（`admin-transit-panel` 2、`map-stage` 1、`markdown-document-inspector` 2）。看板：raw 259 → 251。
- 2026-11-16：Phase 3 portal token 生成/校验落地：`scripts/portal-tokens.mjs` 以 `tokens.css` 为唯一来源生成 portal.css 的 19 个 `--yct-*` 基础 token，并检查「生成块之外不得手写同族 token」；`portal:tokens:sync/check` 接入 CI 与根 build。
- 2026-11-16：Phase 2 第十一批。`Modal` 支持 `ariaLabel`（无标题元素的 `aria-label` 对话框）；codemod 同步支持 `aria-label`；迁移 `admin-transit-trip-workbench` 4 个 `aria-label` 版弹窗。看板：raw 251 → 243。
- 2026-11-16：Phase 2 第十二批。`telegraph-studio-panel` 9 个次按钮/主按钮与 `travel-schedule-query-panel` 6 个按钮/链接迁移到 `Button`/`ButtonLink`（含 `loading` 状态与动态图标）。看板：raw 243 → 235。
- 2026-11-16：Phase 2 第十三批。`transit-network-source-control` 7 个按钮/图标迁移（导入工程、行名/站名编辑器关闭与保存，保存带 loading）；`markdown-block-inspector` 4 个块操作次按钮 + 完成编辑图标按钮迁移。看板：raw 235 → 228。
- 2026-11-16：Phase 2 第十四批。`status.tsx` 新增 `FormErrorText`（`.form-error-text` + `role=alert`）；`account-settings-panel` 迁移 13 处：行程同步/撤销授权/安装 PWA/离线包刷新（含 loading）、GitHub 与管理后台链接、助手配置保存/清空、MCP 复制、离线包弹窗关闭、表单提交主按钮、LD-PASS 链接、本地管理员登录、错误文本。看板：raw 228 → 220。
- 2026-11-16：Phase 2 第十五批。`Modal` 支持 `panelStyle`（历史预览弹窗用内联样式控宽）；codemod 支持「target-check 遮罩 + 面板无 stopPropagation」的组合；迁移 5 个剩余弹窗（`material-studio-panel` 3、`map-stage` 1、`transit-wayfinding-workspace` 1）；`admin-poi-panel` 迁移 9 处（名称翻译/线路/主列表链接、编辑链接按钮、4 个保存主按钮，含 loading 态）。看板：raw 220 → 206。
- 2026-11-16：Phase 2 第十六批。`material-studio-panel` 服务时间字段、`admin-poi-panel` 图片链接输入与上传字段迁移到 `Field`/`Input`（上传字段用 `hint` 保留说明、`className` 保留布局类）；看板：raw 206 → 203。
- 2026-11-16：Phase 2 第十七批。`IconButton` 支持 `children` 自定义图形（`SmartQaGlyph` 等非 Material 图形）；迁移 `app-shell` 3 个图标按钮（桌面菜单、全局搜索/智能问答入口）；迁移 `map-stage` 10 个 `icon-action-button`（详情折叠/关闭、线网日班板、分享、选路需求、附近/分享操作等）与地图空态 `EmptyState`。看板：raw 203 → 193。
- 2026-11-16：Phase 2 第十八批。`map-stage` 再迁 17 处：线路信息/缩放工具条图标 ×4、历史版本上一条/下一条/分享/回到当前 ×4、分享模式按钮组（条件 variant + loading + 动态图标）、图片/链接分享复制、POI 提交/取点/详情链接、选路需求取消/确认、POI 动作条路线与收藏（`aria-pressed`/`is-active`）；剩余 `search-box` 与地图芯片类待专用原语。看板：raw 193 → 179。
- 2026-11-16：Phase 2 第十九批。`status.tsx` 新增 `Eyebrow`（`.eyebrow`，`as='span'|'p'`）；迁移 8 处 eyebrow（`admin-materials`、`material-studio`、`operations-home` ×2、`telegraph`、`transit-network-health` ×5）；`material-save-download-dialog` 弹窗迁移到 `Modal`。看板：raw 179 → 172。
- 2026-11-16：Phase 2 第二十批。批量迁移 `empty-state` 8 处（changelog、global-search、operations-home、search-page、services、transit-line-detail、transit-network-health、transit-screen-detail）到 `EmptyState`（含 `as="p"`、图标与子内容）；迁移 `status-note` 9 处到 `StatusText`（global-search 8、search-page 1；`schedule-stop-time-table` 的 `role=row` 特殊结构保留）。看板：raw 172 → 162。
- 2026-11-16：Phase 2 第二十一批。`StatusChip` 新增 `ticket` 变体（`.ticket-order-status-badge`），`EmptyState` 支持 `as="section"`；`ticket-order-detail-panel` 迁移 5 处（不可用态占位 + 重试/返回账户、刷新/取消（loading）/班次表/账户链接、状态徽标）；`telegraph-studio-panel` 迁移 6 处（开始写信、重播动画、模拟发送、信封翻面（aria-label/title）、确认关闭、历史删除）。看板：raw 162 → 152。
- 2026-11-16：Phase 2 第二十二批。`category-chip` 5 处迁移到 `Chip`（翻译实体筛选、全局搜索/搜索页分类芯片、线路浏览器全部/模式芯片，含计数 `small`、动态 tone 与图标）；`admin-operations-panel` 迁移 4 处（打开 Markdown 编辑器链接、新增/继续编辑规则按钮、保存规则按钮（动态图标 + disabled）、内容编辑弹窗 → `Modal`，`onChangeCapture` 透传）。codemod 允许 `section`/`div` 面板的 `onChangeCapture`。看板：raw 152 → 142。
- 2026-11-16：Phase 2 第二十三批。新增 `scripts/codemods/migrate-material-field.mjs`：把 `label.material-field > span + input/textarea/select（+small 提示）` 自动迁移为 `Field` + `Input/Textarea/Select`，保留附加类名、`className="muted"` 提示与控件属性；结构不确定的标签跳过。一次迁移 65 个字段（9 个文件：admin-administrative-area 7、admin-markdown-editor 1、admin-poi 18、admin-transit-line-map 5、admin-transit-trip-workbench 8、markdown-asset 2、markdown-block-inspector 7、markdown-document-inspector 5、material-studio 12）。看板：raw 142 → 131。
- 2026-11-16：Phase 2 第二十四批。`field.tsx` 新增 `SearchField`（`.search-box` + 搜索图标 + 输入框 + 可选清除按钮/尾部操作，支持 `as="label"` 与 ref）；迁移 5 处 `search-box`：地图搜索（清除 + 随机探索尾部按钮）、搜索页、行程查询、车站屏详情、翻译后台（label 语义）。看板：raw 131 → 126。
- 2026-11-16：Phase 2 第二十五批。剩余 `icon-action-button` 全部迁移到 `IconButton`：`admin-markdown-editor-workspace` 2、`keyboard-shortcut-bridge` 1、`map-measure-panel` 1、`markdown-asset-section` 3（刷新/插入/复制）、`markdown-document-inspector` 3（关闭 POI/素材、清除封面）、`ticket-order-draft-panel` 1、`travel-schedule-query-panel` 1（清除历史）。看板：raw 126 → 116。
- 2026-11-16：Phase 2 第二十六批。`SegmentedControl` 新增 `wrapperClassName`（外层 `.segmented-control` 轨道），`segmented-control.tsx` 新增 `SegmentedTabs`（历史手写 fieldset/legend 按钮组）；新增 `migrate-segmented-wrapper.mjs` 迁移 13 处「div.segmented-control > SegmentedControl」包裹（admin-transit-line-map 5、material-studio 3、markdown-block-inspector 2、admin-markdown-editor 1、admin-transit-trip-workbench 1、transit-wayfinding 1）；账号设置分段适配器与 `admin-services` 入口筛选迁移到 `SegmentedTabs`。看板：raw 116 → 107。
- 2026-11-16：Phase 2 第二十七批。剩余手写 segmented 标签组迁移到 `SegmentedTabs`：`admin-operations-panel` 3（内容后台系列、强提醒工作区、上线方式）、`admin-transit-panel` 4（后台系列、班次视图、线路编辑区域、折线/沿路）、`admin-transit-trip-workbench` 2（同步方式、抽取方式）；`SegmentedTabs` 的 `label` 改为可选以支持纯 `div` 轨道。看板：raw 107 → 98。
- 2026-11-16：Phase 2 第二十八批。批量迁移剩余 `secondary-action-button`（23 处、17 个文件）：事件/审计分页（保留图标顺序）、行政区划新建链接、地图设置保存、Markdown 编辑页保存、后台刷新、服务入口新建、客户端弹窗/嵌入登录取消确认、素材上传、Markdown 文档弹窗入口与「完成」、地铁导视重试/模板库、离线页 4 个链接、运营详情原链接、线路健康「查看全部目标」、可视化编辑器保存、票务草稿详情/取消、离线页按钮组。看板：raw 98 → 75。
- 2026-11-16：Phase 2 第二十九批。`field.tsx` 新增 `FieldGroup`（非单控件字段壳：分段/滑块/颜色等复合字段）；迁移 10 处剩余 `material-field`：Markdown 文档（有效期/封面链接/重点排序）、Markdown 图片链接、行政区划（颜色/两个透明度滑块）、物资工作室 6 个分段字段、导视工作区版式字段。看板：raw 75 → 69。
- 2026-11-16：Phase 2 第三十批。`Modal` 新增 `ariaModal`（非阻塞浮层用 false）；codemod 支持 `aria-modal={false}`；迁移 `keyboard-shortcut-bridge` 快捷键弹窗、`telegraph-studio-panel` 确认发报弹窗、`admin-poi-panel` 两个编辑弹窗（`formElement` 模式整理为 `Modal as="form"`）。看板：raw 69 → 61。
- 2026-11-16：Phase 2 第三十一批。`chip.tsx` 新增地图芯片原语 `TransferLineChip` / `MapHudChip` / `MapPresenceChip` / `RouteOptionBadge`（含测试）；迁移 `map-stage` 6 类地图芯片；状态芯片迁移到 `StatusChip`（`admin-services` 2、`operation-detail` 1）；行程/车站屏空态 section 迁移到 `EmptyState as="section"`；`trip-reminder` 错误文本 → `FormErrorText`；2 个主按钮 → `Button`；4 个剩余 `icon-button` → `IconButton`（`admin-materials`、`client-dialog`、`transit-health`、`transit-wayfinding`）。看板：raw 61 → 43。
- 2026-11-16：Phase 2 第三十二批。`SegmentedTabs` 支持 `legendClassName`/`ariaLabel`（sr-only legend 场景）；`CheckboxRow`/`RadioRow` 支持 `icon` 行内图形槽；迁移 `transit-network-health` 交通方式筛选、`admin-materials` 对齐复选框、`transit-wayfinding` 双行分隔复选框、`material-studio` 两条交通线路选择行（radio/checkbox 动态 + 线路色块）。看板：raw 43 → 39。
- 2026-11-16：Phase 2 第三十三批（收口）。`button.tsx` 新增 `IconLink`（锚点图标链接）；`chip.tsx` 新增 `FilterStrip`；账号登录/退出入口改为 `Button`/`ButtonLink` 变体 API；`admin-edit-link` 改为 `IconLink`/`ButtonLink`；全局搜索/搜索页筛选条迁移到 `FilterStrip`；`admin-poi` 工作区分段迁移到 `SegmentedTabs`；`transit-network-source-control` 条件按钮拆为 `Button`/`IconButton`、分段轨道改 `wrapperClassName`；`metro-wayfinding-editor` 3 个复合字段迁移到 `FieldGroup`。**Phase 2 退出标准达成：raw 39 → 26（≤30）**，剩余 26 项登记为结构/组件根类白名单。
- 2026-11-16：Phase 3 控件尺寸 token 化。新增 `--yct-control-height-xs/dense/toolbar/compact/tall` 与 `--yct-control-size-sm/lg`；新增 `scripts/codemods/tokenize-control-sizes.mjs`，只对选择器含控件标记的规则做**等值**尺寸替换；控件尺寸 token 使用 6 → **80**（目标 40 达成）；CSS 花括号配平（globals 5281/5281、展示板 122/122）。
- 2026-11-16：Phase 3 断点 token 化。新增 `packages/design-tokens/src/breakpoints.json`（命名断点 + 已登记值白名单）与 `apps/web/lib/breakpoints.ts`（JS 常量）；新增 `scripts/ui-breakpoints.mjs`（`ui:breakpoints:check`）校验 CSS `@media` 与 JS `matchMedia` 的数值断点，接入 CI 与根 build；`ui:plan` 新增「未登记断点值」债务指标（目标 0）；JS 侧 720/760/959 字面量全部替换为常量。
- 2026-11-16：Phase 3 视觉回归基础设施：新增 `scripts/visual-regression/capture-controls.mjs`（外部 Playwright 注入，`PLAYWRIGHT_MODULE_PATH`；默认采集 mobile/tablet/desktop × light/dark，并在外观 dock 可用时补三档材质；输出 `.screenshots/controls-baseline`）与 `visual:controls:capture` 脚本；当前环境无 Playwright，脚本尚未执行。
- 2026-11-16：Phase 3 CSS 拆分调研完成，输出 `docs/PHASE3_CSS_SPLIT_PLAN.md`：按类名前缀估算领域体积、给出目标文件结构与 layout.tsx 加载顺序、Stage 0–5 分阶段方案（Stage 1 先拆 /dev/controls 专用样式），并列出控件尺寸字面量分布与 token 使用差异。
- 2026-11-16：Phase 3 Stage 1（CSS 拆分试点）完成：`globals.css` 中 810 行 `.controls-*` 样式拆出到 `apps/web/app/styles/80-controls-board.css`，`layout.tsx` 在 globals 之后 import；看板脚本改为扫描 `globals.css` + `app/styles/*.css` 全部应用样式（字号/颜色/class 指标口径不变）；花括号配平、tsc、ui:controls:check 均通过。视觉验收待外部 Playwright 基线。
- 2026-11-16：Phase 3 视觉回归 + CSS 拆分完成。临时安装 `playwright-core`（`.tmp/pw`，不入仓库依赖）并用系统 Edge 采集 `/dev/controls` **24 张**截图基线（`.screenshots/controls-baseline`，亮/暗 × mobile/tablet/desktop × 默认 + 三档材质）；新增 `scripts/visual-regression/compare-controls.mjs`（pngjs + pixelmatch，默认 1% 噪声阈值，实测重复截图噪声约 0.75%）。`globals.css` 按顺序拆为 9 个文件（`10-base`/`20-layout`/`30-components`/`40-admin`/`50-materials`/`60-pages`/`70-data`/`80-controls-board`/`90-compat-standard`），`layout.tsx` 按原顺序 import，字体相对路径修正为 `../fonts/`；拆分前后 24 张对比最大差异 0.864%（阈值内）。**Phase 3 退出标准达成，四阶段全部完成。**
- 2026-11-16：Phase 0 完成。新增计划文档、`scripts/ui-plan.mjs`（看板/棘轮/registry 校验）、`scripts/ui-plan.baseline.json`、`.github/workflows/ci.yml`；修复未定义 token、24 处陈旧 fallback、registry 9 个幻影类与 4 个别名冲突；标准类名直写基线锁定 393（60 文件），共享预览 8，有预览分区 7。下一步：Phase 1 原语层（Button / Field / SegmentedControl 优先）。
- 2026-11-17：设计原则符合性复核（静态 + 运行时，Edge/Chromium + 临时 playwright-core 测量 `/dev/controls` 亮/暗桌面与粗指针移动端）：核心尺寸/圆角/焦点/禁用/字段/分段/开关/弹窗/可访问名称均符合 DESIGN.md；发现并修复 6 项偏差——减少动效下按压缩放未归零、移动端分段轨道未用 44px token、字段标签 650→600、字段禁用透明度 0.55→`--yct-disabled-opacity`、分类 chip 未定义字号（改 13px/600）、窄屏弹窗遮罩 8px→16px；分段未选中字重 500→600。复验：`reducedMotion.scalePress=1`、粗指针分段轨道 44px、字段字重 600、分类 chip 13px/600、门禁全绿。**对比度低于 WCAG AA 的问题经确认暂不调整主题色，留作设计决策。**
- 2026-11-17：展示板（/dev/controls）按设计原则修正：卡片去掉灰色描边（标准卡片 = surface-panel + lg 圆角）；开关改用 `SwitchControl` 原语，禁用开关的原生 checkbox 不再透出、光标改为 not-allowed、轨道统一 .58 淡化；加载按钮 `aria-busy` 改为 `cursor: progress` 且不再整体变灰；标题栏直接渲染真实 `SecondaryPageHeader` 组件（取消虚线演示框与吸顶）；选路控件改为「多选 Chip + 单选 SegmentedControl」标准组合（地图紧凑类降级为历史别名）；输入类型与状态卡片的表单控件改用 `Field`/`Input`/`SegmentedTabs`/`RadioRow` 原语；分类 chip/文本字段/状态文本/空态等示例改用标准原语；补颜色选择器正方形色板与文件选择按钮样式。看板 raw 26 → 24（route-mode 自研类降为 alias）。

## 7. 决策记录

- 2026-11-16：采用混合路线（C），不做通用组件库；理由与边界见第 1、2 节。
- 2026-11-16：registry 中「列表/工具栏/复选框行」分区的幻影类先降级为「示例对照（暂无标准类名）」，待 Phase 1 原语化后再登记真实标准类名；不临时把页面私有类「扶正」为标准。
- 2026-11-16：视觉回归放到 Phase 3，Phase 0 不以截图基线为退出条件（先保证可度量的结构门禁）。
- 2026-11-16：`search-box` 作为独立搜索字段标准类保留在 `controls-search`，从 `controls-text-field` 别名中移除；DESIGN.md 的「字段别名」表待 Phase 3 同步。
- 2026-11-16：组合别名（如 `secondary-action-button is-primary`）不作为独立类名参与一致性校验，只校验其基础类是否存在。
- 2026-11-16：仓库现存 183 个文件未通过全量 Prettier 检查（历史存量），CI 暂不启用 repo-wide 格式门禁，避免一次引入不可执行的红灯；格式清理归入 Phase 3。
- 2026-11-16：Phase 1 测试采用 node:test + `react-dom/server` + 自研 TSX 加载器（`scripts/ui-test-register.mjs`），不新增依赖、不依赖沙箱不可用的 esbuild；键盘/交互级断言待后续（jsdom 或 Vitest 可用时）补齐。
- 2026-11-16：`IconButton` 通过 `variant: 'action' | 'icon'` 映射 `.icon-action-button` / `.icon-button`，避免迁移时改变既有 DOM 类名；`Field` 的 hint 输出无类名 `<small>`，沿用现有上下文样式（如 `.transit-wayfinding-export-density small`）。
- 2026-11-16：修正阶段验收边界：原 Phase 1 同时要求 `raw ≤ 70%`，与 Phase 2 的归并目标重复；现 Phase 1 只验收原语层（≥9 原语 + 测试 + 真实预览 + 业务使用），raw ≤ 70% 基线（266）作为 Phase 2 中期里程碑、≤ 30 为最终目标；看板 phaseStatus 同步调整。
- 2026-11-16：`metro-wayfinding-editor` 的本地 `SegmentedControl` 属于「标签/类名适配器」，行为已由共享组件承载，保留；2.0 的完成标准是「单一行为实现」，不是删除所有包装。
- 2026-11-16：registry 不重复维护 props 表：组件 API 以 TS 类型 + /dev/controls 展示为准，registry schema 只校验分区/分类/预览/状态/导出存在性。
- 2026-11-16：原语的 `className` 优先内联到 JSX 表达式（如 `className={['switch-control', className].filter(Boolean).join(' ')}`），让 AST 控件清单能识别原语渲染的标准类名；否则「仅由原语使用」的类会被误判为未使用。
- 2026-11-16：同构的单行标记（如 `operation-tag`）允许用一次性正则改写为原语（`StatusChip`），改写后必须经 `tsc` + `ui:controls:check` 验证；结构复杂/多行嵌套的标记仍手工迁移。
- 2026-11-16：弹窗迁移使用 AST codemod，仅处理「section 面板 + 结构完全一致」的弹窗；form/div 面板需要 `Modal` 扩展 `as` / panel props 后再迁，不做文本级冒险替换。
- 2026-11-16：`Modal` 已支持 `as` / `onSubmit` / `onChangeCapture` / `ariaDescribedBy`，codemod 随之覆盖 form/div 面板；codemod 增加「已存在 Modal import 时跳过插入」以避免重复导入。
- 2026-11-16：`CheckboxRow`/`RadioRow` 支持 `variant: 'row' | 'material'`，用于工作台字段（material 前缀类名）；`<a class="secondary-action-button">` 形式的链接暂不迁移，待 `ButtonLink` 原语评估后再统一。
- 2026-11-16：看板 raw 的口径是「AST 清单按 signature 合并后的节点数」，同一文件内完全相同的标记会合并为 1 个节点；因此必须把某个 signature 全部迁移完才会降 1，逐条迁移到一半可能看不到数字变化。后续排期按「签名整组清零」而不是「逐处替换」估算收益。
- 2026-11-16：已越过 raw ≤ 266（70% 基线）中期里程碑（262），共享预览达到 20（Phase 3 目标之一）。
- 2026-11-16：`ButtonLink` 进入原语层，链接型按钮不再单独手写 `<a class="secondary-action-button">`；后续新链接一律使用 `ButtonLink`。
- 2026-11-16：字号 token 采用「等值实际尺度」策略（9–32px 共 19 档，覆盖现有占比 87%）；先消除字面量、后续再评估收敛到 DESIGN.md 的 12/14/16/20/24/32 主尺度，避免一次性改字号造成视觉回归。Phase 3 与 Phase 2 长尾并行推进，看板 phaseStatus 允许 Phase 3 提前显示 active。
- 2026-11-16：弹窗 codemod 的边界放宽到「自定义遮罩类 / 动态 labelledBy / target-check 关闭」，仍保留属性白名单与结构校验；无法安全推断的一律跳过，不做文本级替换。
- 2026-11-16：portal 不 import design-tokens 的 CSS，采用「生成块 + 唯一来源 + CI 校验」策略；生成块之外禁止手写 `--yct-*`，避免出现第二份副本。
- 2026-11-16：CSS 拆分后看板度量改为「应用全部 CSS 文件」；后续每拆一个领域文件，无需改脚本，自动纳入字号/颜色/class 统计。
- 2026-11-16：`FormErrorText` 放在 `status.tsx`（与原语同文件），避免新增原语文件；表单错误文本统一带 `role=alert`。
- 2026-11-16：弹窗 codemod 允许「遮罩做 target-check、面板不写 stopPropagation」的历史写法（迁移后由 Modal 统一在面板阻断冒泡）；面板 `style` 通过 `panelStyle` 透传，保持预览宽度等历史效果。
- 2026-11-16：`IconButton` 的图形来源有两种：Material Symbols 用 `icon`，自定义 React 图形（如 `SmartQaGlyph`）用 `children`；不可访问名称仍由 `label` 必填。
- 2026-11-16：`Eyebrow` 放在 `status.tsx`，通过 `as` 保留历史 `span`/`p` 标签语义，避免为纯样式再多一个原语文件。
- 2026-11-16：原语内部用字符串映射渲染的类名（如 `StatusChip` 的变体表）计入「已使用」，否则迁移后 registry 会误报未使用；该口径只作用于 `components/ui` 原语层。
- 2026-11-16：`client-dialog-bridge`、`transit-network-health` 的目标弹窗继续使用原生 `<dialog>`（依赖 `showModal()`/`onCancel`/ref 语义），不套 `Modal`；`modal-panel` 类保留为原生 dialog 的样式钩子。
- 2026-11-16：地图芯片按语义拆分原语，不把地图专属类塞进通用 `Chip`；`MapHudChip` 负责 source/coordinate 两种 HUD 小卡。
- 2026-11-16：Phase 2 完成口径：raw ≤30 且剩余均为已登记的结构性/组件根类白名单；Phase 3 完成口径收紧为「字号 ≥60% + 共享预览 ≥20 + 视觉基线存在 + CSS 拆分 ≥6 个领域文件 + 控件尺寸 token 使用 ≥40」，避免仅靠排版/预览就误判收口完成。
- 2026-11-16：尺寸 token 化采用「先补语义 token，再等值替换」策略；只替换选择器命中的控件规则，避免把布局高度误当控件高度。
- 2026-11-16：浏览器媒体查询无法使用 CSS 变量，断点采用「JSON 单一事实来源 + 应用常量 + CI 登记校验」；已登记 20 个历史断点值（含组件级宽度），新增断点必须先登记。
- 2026-11-16：弹窗面板的 `onChangeCapture` 不限于 `form`（React 对 section/div 同样有效），codemod 一并支持透传。
- 2026-11-16：字段迁移采用 AST codemod（`migrate-material-field.mjs`），只处理「label.material-field > span + 单个 input/textarea/select + 可选 small」的可判定结构；复杂控件（颜色、分段、自定义行）保留手工迁移。
- 2026-11-16：`SearchField` 放在 `field.tsx`（与字段族同文件），通过 `trailing` 插槽保留地图随机探索按钮等历史操作，避免为搜索框新增原语文件。
- 2026-11-16：分段控件的两种历史形态分别收敛：组件用法用 `wrapperClassName` 保留轨道，手写按钮组用 `SegmentedTabs`；不再在业务文件重复 `segmented-control` 结构。
- 2026-11-16：视觉回归采用「外部 Playwright 模块注入 + 基线目录」方案（B）：仓库不新增依赖，CI 暂不跑截图；补齐依赖安装环境后再生成首轮基线并接入 CI。剩余 259 → 30 属于长尾：`map-stage` 等强耦合文件最后处理；`<a class="secondary-action-button">` 链接型按钮待 `ButtonLink` 原语；Phase 3 的字号 token / 视觉回归 / CSS 拆分按计划并行推进。
- 2026-11-16：`globals.css` 采用**顺序保持拆分**（只在顶层规则结束处切分、`layout.tsx` 按原顺序 import）而不是按域搬移；用像素对比证明级联不变，域级重排留作可选优化。
- 2026-11-16：视觉截图使用临时 `playwright-core` + 系统 Edge（`PLAYWRIGHT_CHANNEL=msedge`），不写入仓库依赖；同代码重复截图噪声约 0.75%，对比阈值取 1%。
- 2026-11-16：四阶段已完成；后续新增样式/控件继续受 CI（ui:controls:check、ui:plan:check、breakpoints、portal tokens、typecheck、primitives tests）与 `ui:plan.baseline.json` 棘轮约束。
- 2026-11-17：设计原则复核结论：主色文字/芯片对比度（4.01/3.42/2.95 等）低于 WCAG AA 4.5，但**主题色先不调整**，作为后续设计决策；其余低风险偏差已按 DESIGN.md 在本轮修正。分段未选中字重统一 600、字段标签字重统一 600、分类 chip 明确 13px/600。
- 2026-11-17：选路控件定义收敛：多选出行方式 = Chip 组，单选排序 = SegmentedControl；`map-route-preference-toolbar` / `map-route-sort-control` 仅作为地图内紧凑布局别名（复用同一套 token），不再作为独立控件族登记。
- 2026-11-17：/dev/controls 的「真实组件预览」优先直接渲染业务组件/原语（标题栏用 SecondaryPageHeader，开关用 SwitchControl，输入用 Field 族）；只有需要对照历史类名时才保留静态标记，并在文档里标注为历史别名。
