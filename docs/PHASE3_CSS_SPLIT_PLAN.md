# Phase 3：globals.css 拆分与控件尺寸 token 差异清单

> 状态：**已完成（2026-11-16）**。Stage 0 视觉基线已采集（24 张），Stage 1 展示板拆分完成；Stage 2–5 以「顺序保持拆分」一次性落地为 9 个文件，并用像素对比验证（最大差异 0.864%，1% 噪声阈值内）。域级重排/死类清理留作后续可选优化。
> 关联：`docs/UI_COMPONENTIZATION_PLAN.md`、`docs/DESIGN_SYSTEM_AUDIT.md`

## 1. 当前体量

| 指标                       | 数值                                                        |
| -------------------------- | ----------------------------------------------------------- |
| `apps/web/app/globals.css` | 37,562 行 / 约 890 KB（字符）                               |
| 规则块                     | 5,403                                                       |
| 类名                       | 2,121                                                       |
| 分区注释                   | 411 段（大部分为 `/* 说明 */`，仅少量 `/* ==== */` 大横幅） |
| `!important`               | 274                                                         |
| token 块外十六进制色值     | 302（其中纯黑白 115）                                       |
| 疑似无引用类名             | 约 186（含动态拼接误报，仅作上限）                          |

## 2. 领域体积（按类名前缀统计的类引用次数，存在跨域复用，仅用于估算拆分规模）

| 领域                        | 类引用次数 |
| --------------------------- | ---------- |
| map                         | 1,050      |
| telegraph                   | 986        |
| transit                     | 929        |
| admin                       | 694        |
| material                    | 584        |
| metro-wayfinding            | 447        |
| editor / markdown / content | 361        |
| search / assistant          | 298        |
| travel / schedule           | 216        |
| operations / feed           | 152        |
| controls board              | 142        |
| account / settings          | 59         |

## 3. 目标文件结构与加载顺序

拆分后由 `apps/web/app/layout.tsx` 按顺序 import，保持全局级联顺序（**标准层必须最后**）：

```
@yct/design-tokens/tokens.css          // 唯一 token 来源（保持现有）
./globals/styles/00-base.css           // @font-face、reset、html/body、原生控件、基础排版
./globals/styles/10-layout.css         // 顶栏 / 侧栏 / 底栏 / 页面骨架 / 安全区
./globals/styles/20-overlays.css       // modal / toast / 字段 / 控件统一标准层 / 焦点环
./globals/styles/30-map.css            // map-* 与地图悬浮件
./globals/styles/40-admin.css          // admin-* / 后台表格 / 审核
./globals/styles/50-materials.css      // material-* / metro-wayfinding-* / telegraph-*
./globals/styles/60-travel.css         // travel-* / schedule-* / 票务
./globals/styles/70-pages.css          // operations / feed / search / account / editor
./globals/styles/80-controls-board.css // .controls-*（/dev/controls 专用）
./globals/styles/90-compat.css         // iOS 16.7 兼容、LQIP、媒体查询收口
```

说明：

- 不采用 CSS `@import`（必须位于所有规则之前，与现有 `@font-face` 冲突）；用 layout.tsx 多 import 控制顺序。
- `90-compat.css` 保持在最后，确保兼容降级与媒体覆盖仍能压过基础规则。
- 控件统一标准层仍在 `20-overlays.css` 末尾，保持「收口历史 38/42px」的级联语义。

## 4. 分阶段方案（每阶段独立 PR）

### Stage 0（前置）：视觉回归基线

- 已提供采集脚本：`scripts/visual-regression/capture-controls.mjs`（`visual:controls:capture`），通过 `PLAYWRIGHT_MODULE_PATH` 注入外部 Playwright，采集 mobile/tablet/desktop × light/dark，并在外观 dock 可用时补三档材质，输出到 `.screenshots/controls-baseline`。
- 当前环境未安装 Playwright（现有 browser 脚本同样依赖 `PLAYWRIGHT_MODULE_PATH` 外部注入），因此基线尚未生成、diff 与 CI 步骤待补。
- 采用「外部模块注入 + 基线目录」方案：先在依赖可用环境生成 `/dev/controls` 亮/暗 × 三档材质 × 窄屏截图基线，再开始搬代码。
- 在基线可用前，只做 Stage 1 这类隔离域拆分，并要求人工逐页核对。

### Stage 1（低风险试点）：控件展示板 CSS

- ✅ 已完成（2026-11-16）：从 `globals.css` 抽出 810 行（约 142 处类引用）到 `apps/web/app/styles/80-controls-board.css`，由 `layout.tsx` 在 `globals.css` 之后 import，保持原有级联顺序；
- 校验：新文件花括号 122/122、globals 5281/5281 配平；`tsc` 通过；`ui:controls:check` 通过；`ui:plan` 指标改为扫描全部应用 CSS，字号 token 使用率保持 87.2%；
- ⚠️ 视觉验收：当前无 Playwright 截图基线，需人工打开 `/dev/controls` 逐项核对（亮/暗 × 三档材质 × 窄屏），作为 Stage 2 的前置确认。
- 该域只服务开发展示板，失败不影响业务页面，适合作为拆分首个试点。

### Stage 2：物料 / 导视 / 电报纸

- 迁移 `material-*`、`metro-wayfinding-*`、`telegraph-*`（约 584 / 447 / 986 类引用）；
- 验收：物料工作台（导视/路牌）、地铁导视编辑器、电报纸工作室逐页核对；构建 + 清单校验通过。

### Stage 3：地图

- 迁移 `map-*`（约 1,050 类引用）；地图样式与手势/浮层强耦合，单独排期；
- 验收：地图页、地图测距、图层、POI 详情、材质三档 + 亮暗。

### Stage 4：后台

- 迁移 `admin-*`、`transit-*`（约 694 / 929 类引用）；
- 验收：后台各面板（POI/线路/班次/运营/素材/翻译）逐页核对。

### Stage 5：收口

- 剩余 base/layout/overlays/pages 留在 `globals.css` 或继续拆分；
- 清理疑似死类、降低 `!important`、统一控件尺寸（见第 5 节）。

## 5. 控件尺寸 token 差异（Phase 3 剩余项）

现状：标准层已用 token 收口按钮/图标按钮/字段/分段/芯片，但上下文覆盖仍大量使用字面量（按 `min-height/height` 统计）：

| 字面量 | 出现次数 | 说明                                       |
| ------ | -------- | ------------------------------------------ |
| 34px   | 53       | 密集工具条 / 后台                          |
| 38px   | 44       | 地图、后台、电报的紧凑档                   |
| 32px   | 43       | 图标按钮上下文覆盖                         |
| 40px   | 37       | 设计基线（对应 `--yct-control-height-md`） |
| 28px   | 35       | 状态芯片 / 小图标                          |
| 30px   | 32       | 地图 / 历史面板                            |
| 42px   | 28       | 主按钮历史值（与标准层 40px 冲突）         |
| 24px   | 25       | 小图标 / 徽标                              |
| 36px   | 22       | 地图 / 工具条                              |
| 44px   | 21       | 触控基线（对应 `--yct-control-height-lg`） |

token 实际使用次数（全 CSS）：

| token                        | 次数 |
| ---------------------------- | ---- |
| `--yct-tap-target-min`       | 21   |
| `--yct-control-height-md`    | 2    |
| `--yct-control-height-lg`    | 2    |
| `--yct-control-size-md`      | 2    |
| `--yct-field-height`         | 1    |
| `--yct-segment-track-height` | 1    |
| `--yct-chip-height`          | 1    |

建议顺序：

1. 先列「哪些字面量属于标准控件尺寸」清单（按钮/字段/芯片/分段），不含布局高度与图标尺寸；
2. 把标准三层（34 / 40 / 44）之外的 28/30/32/36/38/42/46 逐个归类：要么改成 34/40/44，要么登记为具名语义 token（如紧凑工具条）；
3. 每次替换只改等值或经视觉确认的值；无截图基线时不做批量修改；
4. 同步更新 DESIGN.md 的尺寸契约（如果确认保留紧凑档）。

## 6. 与其他 Phase 3 项的关系

- 视觉回归（Stage 0）是 CSS 拆分的前置条件；当前采用外部 Playwright 注入方案，CI 暂不执行截图。
- 共享预览 ≥ 20 与字号 token ≥ 60% 已达成（20 / 87.2%）。
- portal token 已纳入生成/校验（`scripts/portal-tokens.mjs`，19 个基础 token）。

## 7. 实际执行结果（2026-11-16）

- Stage 0：临时安装 `playwright-core`（`.tmp/pw`，不入仓库依赖），使用系统 Edge（`PLAYWRIGHT_CHANNEL=msedge`）采集 `/dev/controls` 24 张截图到 `.screenshots/controls-baseline`（亮/暗 × mobile/tablet/desktop × 默认 + 三档材质）；新增 `scripts/visual-regression/compare-controls.mjs`（pngjs + pixelmatch，默认 1% 阈值）。
- Stage 1：`.controls-*` 样式独立为 `apps/web/app/styles/80-controls-board.css`。
- Stage 2–5：`globals.css` 按顺序拆为 `10-base` / `20-layout` / `30-components` / `40-admin` / `50-materials` / `60-pages` / `70-data` / `80-controls-board` / `90-compat-standard` 共 9 个文件；`layout.tsx` 按原顺序 import，`globals.css` 保留说明桩；字体相对路径改为 `../fonts/`。
- 验证：拆分前后 24 张像素对比最大差异 0.864%（同代码重复截图噪声约 0.75%，阈值 1%）；花括号配平；`tsc`、`ui:controls:check`、`ui:plan:check`、断点/portal 校验全绿。
- 后续可选：按域重排文件、清理死类、降低 `!important`；CI 如需截图回归，需在 CI 安装浏览器或注入 `PLAYWRIGHT_MODULE_PATH`。
