# 图标体系迁往 Lucide 的可行性与观感评估

> 评估对象：当前全站图标方案（Material Symbols Outlined 可变字体 + SVG 资产 + 服务端出图）
> 评估方式：只读静态审计（未修改任何业务代码）+ 本地实测对照渲染
> 评估时间：2026-11-26；基线 commit `72e9351`（`main`）
> 结论状态：**暂不迁移**。本文只回答"要多少代价、观感会怎么变"，不含实施改动。

> **决策记录（2026-11-26）：暂不迁移 Lucide。**
> 决定性理由不是"改动量大"，而是**迁移不会减少图标体系的数量**：现状是 2 套（Material 字体 + 自绘 SVG 资产），换 Lucide 后变成 3 套（Lucide + 自绘 SVG + 清不干净的 Material 残留）——因为 37 个缺口必须自绘、未知名要兜底、导视牌/QQ 卡片那两条非 DOM 管线也不走组件。
> 而 Lucide 通常被期待的三项收益在本项目形态下都不成立：首屏（可单独修，见 §3.6）、体积（321 个名字要全量注册，gzip 后与字体同一量级）、图形一致性（换来的是气质从"交通导视"偏向"通用 SaaS"）。
> 重新评估的触发条件见 §6。

## 0. 结论摘要

技术上可以换，但**不能当成"把 CSS 类名换成 Lucide"来做**。名称层面的迁移其实不难：321 个在用图标里，284 个（88.5%）在 Lucide 有对应，其中 182 个形状几乎一致、102 个同概念但形状有差异，真正缺的只有 **37 个（11.5%）**。

真正花钱的是四件与"找图标"无关的事：

1. **选中态靠 FILL 轴表达**，而 Lucide 是纯描边图标集，没有填充轴 —— 36 条 CSS 规则、全站导航/筛选/切页的"点亮"效果都建立在这上面，且 `DESIGN.md:398` 把它写成了规范。
2. **构建门禁把图标清单钉死在 `apps/web` 的 build 链里**：换掉类名后 `sync-material-symbols-font.mjs --check` 会直接抛错，`next build` 不执行；另有 3 条 CI 门禁需要同批改。这是一次"要么全绿要么全红"的原子提交。
3. **图标名是入库数据**：`ServiceEntry.icon`、`TransitModeProfile.icon`、`TravelScheduleServiceProfile.icon`、`PoiFacilitySnapshot.symbolIcon`、`MapMarker.symbolIcon` 五个字段存的字符串就是 Material 名字本体，schema 只做 `^[a-z0-9_]+$` 正则、**没有枚举**，后台是纯文本输入框。任何"按名换实现"的方案都必须先定义未知名兜底。
4. **图标不只在 DOM 里**：导视牌导出走 `名字 → 34 个 SVG → resvg 光栅化`，QQ 卡片渲染器硬编码了 30 条 Material path（含 12 个字体子集里根本没有的天气图标），且有第二份 esbuild 产物副本。

观感上最明显的变化不是"图标长得不一样"，而是**"选中后从描边变实心"这套交互语言会消失**；其次是同字号下 Lucide 平均**略大略重**（实测墨迹覆盖 +9%、视觉包围盒 +12%）。对照图见 [assets/icon-lucide-comparison.png](assets/icon-lucide-comparison.png)。

### 记分卡

| 维度        | 现状证据                                                                                                      | 迁移难度                           |
| ----------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| 图标名映射  | 321 个在用名；284 个有 Lucide 对应（182 精确 / 102 近似）                                                     | 中（一次性映射表 + 37 个自建）     |
| 调用点改造  | **418 处**裸 `<span class="material-symbols-outlined">`（75 个文件）vs 仅 **51 处**走 `<MaterialSymbol>` 组件 | 高（量大，但机械）                 |
| CSS 耦合    | 215 条规则块 / 238 处选择器；150 条 `font-size`、80 条 `color`、**36 条强制 `--icon-fill: 1`**                | 高（尺寸类可平移，填充类要重设计） |
| 选中态语义  | `font-variation-settings: 'FILL' 1` + 过渡动画；规范明文（`DESIGN.md:398`）                                   | **高（设计决策，不是技术活）**     |
| 构建门禁    | `apps/web` build 前置校验 321 项字体清单                                                                      | 中（同步删改，但必须原子）         |
| 入库数据    | 5 类字段存名字本体，本机快照里 140 + 36 + 23 + 9 + 3 条                                                       | 高（要数据迁移 + 双读兼容）        |
| 非 DOM 渲染 | 导视牌 resvg 出图、QQ 卡片 30 条 path、3 条 API 路由、写时回源 Google                                         | **高（换的是美术资产，不是组件）** |
| 字体加载    | 290.9 KB woff2、`font-display: block`、**无 preload**                                                         | 迁移反而能改善（见 §3.6）          |

## 1. 现状：图标分布在四层

| 层          | 规模                                                                            | 关键位置                                                                                      | 迁移性质       |
| ----------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | -------------- |
| 字体        | 321 图标 / 290,960 B，`font-display: block`，无预加载                           | `apps/web/app/fonts/material-symbols/`、`10-base.css:51-57`                                   | 可整层替换     |
| DOM 渲染    | 418 处裸 span（75 文件）+ 51 处组件 + 293 处内联字面名                          | `components/ui/material-symbol.tsx`、全站组件                                                 | 机械但量大     |
| 数据        | 5 类持久化字段 + 约 10 组代码内默认值/映射表（其中交通方式图标有 7 份平行定义） | `packages/schemas`、`packages/contracts`、`apps/web/lib/*store.ts`、`map-route-plan/types.ts` | 需数据迁移     |
| 非 DOM 出图 | 34 个静态 SVG + 导视牌 resvg 管线 + QQ 卡片 30 条 path + 3 条 API               | `lib/material-glyph-server-assets.ts`、`lib/qq-bot-card.ts`、`app/api/material-symbols/`      | **换美术资产** |

补充事实：服务端出图**不加载图标字体**。`material-renderer.ts:64-77` 交给 resvg 的 `fontFiles` 只有 HarmonyOS Sans，图标靠 `material-glyph-server-assets.ts:101-119` 按名字读 `public/material-symbols/outlined/{symbol}.svg` 再内联。所以真正焊死的不是字体，而是**"图标名 → SVG 美术文件 → 名字注册表"这条链**。

## 2. 困难分级

### 2.1 P0 — 会直接卡住构建和 CI（机械但必须同批提交）

| 门禁               | 位置                                                                 | 换图标后会发生什么                                                                                                          |
| ------------------ | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 字体清单校验       | `apps/web/package.json:8` → `sync-material-symbols-font.mjs --check` | AST 扫不到 Material 名字 → 抛"没有扫描到 Material Symbols 图标名" → **`next build` 不执行**                                 |
| 控件清单逐字节比对 | 同上 → `ui-controls-inventory.mjs --check`                           | 自动生成的 `controls-inventory.json` 里 **160 处** `"material-symbols-outlined"` 需要重新 sync                              |
| 原语测试           | CI `ui:primitives:test`                                              | 4 个测试文件直接断言 `material-symbols-outlined` 字面量（`material-symbol.test.mjs` 甚至断言 `>close<` 这段 ligature 文本） |
| UI 计划棘轮        | CI `ui:plan:check`                                                   | 三条覆盖指标只升不降：**字号 token 数 908**（删掉 141 条图标 `font-size` 会掉到约 790）、原语文件数 9、原语测试数 10        |

**这里有一个反直觉的实现约束**：`ui:plan` 的棘轮统计的是 CSS 里带 `var(--yct-` 的 `font-size` 声明数。所以最"正规"的 SVG 改法（用 `width`/`height` 定尺寸）会同时踩两条线 —— 既让 150 条现成的尺寸规则失效，又让棘轮掉到基线以下。可行的做法是让图标组件保持 `width: 1em; height: 1em`，**尺寸继续由 `font-size` 驱动**：150 条规则和棘轮都能原样保留，只需替换选择器。

### 2.2 P1 — 选中态：FILL 轴不可平移

这是唯一"技术能解决但设计要拍板"的项。

- 基础规则在 `10-base.css:308-331`，四个轴 `FILL / wght / GRAD / opsz` 全部走自定义属性，并对 `font-variation-settings` 做了过渡 —— 也就是说选中时图标是**从描边平滑"长成"实心**的。
- `--icon-fill: 1` 共 **39 条独立声明（36 条置 1）**，覆盖：底部导航 `is-active`、`rail-item`、`chip`、`category-chip`、地图路线模式切换、时间筛选、服务条、地图气泡/标记、空状态提示等。
- **其中 16 条写在包装类上**（`.icon-button.is-active`、`.chip.is-active`…），靠继承生效 —— 按类名 grep `.material-symbols-outlined` 根本搜不到它们。
- 另有 8 处直接写死字面量 `font-variation-settings`，其中 `20-layout.css:641` 是**伪元素图标**（`content: 'expand_more'`），既不是组件也不是 span。
- `DESIGN.md:398` 把它写成规范：「本地字体需要保留可变字体能力，继续通过 `font-variation-settings: 'FILL' 1` 表达选中态填充」；`docs/REQUIREMENTS.md:64`、`docs/GOALS.md:191` 是同一约束的平行表述。

三种替代方案都会改变观感，需要设计选一个：**① 只靠颜色/底色**（最省事，但"点亮"的强度明显下降）；**② 同时维护 outline + filled 两份图标**（视觉最接近现在，但图标资源翻倍，且 37 个缺口图标要自绘两遍）；**③ 选中时加粗描边/放大**（`stroke-width` 1.75→2.4 之类，最轻，但和"实心"是两种语言）。

### 2.3 P2 — 图标名是开集数据

| 字段                                     | 校验                                                   | 输入方式                                                       |
| ---------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------- |
| `ServiceEntry.icon`                      | `packages/schemas/src/services.ts:15` `/^[a-z0-9_]+$/` | 后台自由文本                                                   |
| `TransitModeProfile.icon`                | `packages/schemas/src/transit.ts:14`                   | 后台自由文本（`admin-transit-panel.tsx:1966`，`maxLength=80`） |
| `TravelScheduleServiceProfile.icon`      | 同上                                                   | 后台自由文本                                                   |
| `PoiFacilitySnapshot.symbolIcon`         | `packages/schemas/src/map.ts:415`                      | 数据库既有值                                                   |
| `MapMarkerSnapshot.markers[].symbolIcon` | 同上                                                   | 快照 JSON                                                      |

本机 `.yct-data` 快照里已落盘的图标名：`map-marker-public-snapshot.json` 140 条、`legacy-map-marker-overrides.json` 36 条、`poi-submission-store.json` 23 条、`service-entry-store.json` 9 条，去重后 16 个名字。

**关键风险**：现在的 ligature 方案对未知名天然容错（渲染成一段普通文字，不报错、不塌布局）。换成 Lucide 后，未知名字必须有显式兜底图标，否则是空方块。而且 `material-symbol-asset-listeners.ts:14-41` 订阅了 6 个领域事件，数据一落库就**回源 Google 抓图标并落盘** —— 只要旧名字还在数据里，这条链会持续把 Material 图标写回资产目录。

好消息：这类字段只用于渲染、不参与检索键，可以走"先查 Lucide 映射，查不到回落 Material"的双读过渡。

### 2.4 P3 — 非 DOM 渲染管线（真正的工作量大头）

| 管线                   | 位置                                                                                                                          | 为什么难                                                                                                                    |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 导视牌/物料出图        | `material-glyph-server-assets.ts:101-119` → `metro-wayfinding-svg.ts:996` → resvg                                             | 换的是 34 个 SVG 美术资产 + 名字白名单，且要在 85px 网格上重新校准视觉重量；产物里还带 `data-material-symbol="stairs"` 标记 |
| QQ 卡片                | `qq-bot-card.ts:41-100` 硬编码 30 条 path（`viewBox 0 -960 960 960`）+ `integrations/qq-bot/src/card-renderer.mjs` 第二份副本 | Lucide 是 24 视图盒 + stroke，正变换（`scale(size/960) translate(0,960)`）要整体重写；CI 用 `qqbot:card:check` 比字节       |
| Google 回源 + 资产台账 | `material-symbol-asset-workflow.ts`、`material-symbol-asset-store.ts`、3 条 API 路由                                          | Lucide 是 npm 包，没有"按名字回源"这回事 —— 整个模型作废，台账要重建                                                        |
| 部署约束               | `scripts/web-build-artifact.ps1:1390-1392`                                                                                    | 元数据 JSON 与 `runtime-assets/material-symbols/` 必须成对备份；晋级要求服务器出网到 `fonts.googleapis.com`                 |

**可以砍掉的工作量**：导视牌 35 个 `symbol` 里已有 21 个通过 `assetName` 走 `metro-facilities`（52 个）+ `metro-arrows`（15 个）这套**已经脱离 Material** 的素材，真正要重做的只剩约 14 个。

### 2.5 P4 — 机械但量大的部分

- **418 处裸 span 分布在 75 个文件**：`admin-poi-panel.tsx`、`map-stage.tsx`、`metro-wayfinding-editor.tsx`、`controls-showcase.tsx` 是重灾区。组件只有一个（`components/ui/material-symbol.tsx`），但绝大多数调用点没走它。
- **CSS 215 条规则块**：`10-base.css` 49、`20-layout.css` 43、`50-materials.css` 34、`60-pages.css` 31、`40-admin.css` 20、`90-compat-standard.css` 18。
- **11 处 spin 动画**（加载态旋转）+ 2 处 `rotate(180deg)` 折叠箭头 + 2 处 `reduced-motion` 复位，全部绑在图标类名上。
- **交通方式 → 图标映射有 7 份平行定义**（`transit-mode-profile-store.ts`、`transit-network-health.ts`、`map-route-plan/types.ts`、`admin-transit-panel.tsx`、`transit-line-browser.tsx`、`transit-line-detail-panel.tsx`、`api/map/markers/route.ts`），改的时候极易漏一份；`packages/adapters/src/marker-provider.ts:292` 甚至在 adapters 包里硬编码了 `person_pin_circle`。
- 除上述映射表外，`faq-content.ts` + `faq-translations.ts` 里还藏着 39 + 32 个不同图标名（三语文案数据），迁移时不会出现在任何"组件改造"清单里。

## 3. 观感会怎么变（实测）

对照图：[assets/icon-lucide-comparison.png](assets/icon-lucide-comparison.png)（左：当前描边态；中：当前选中态实心态；右：Lucide。样本全部取自 `manifest.json` 的在用图标）

### 3.1 尺寸与重量：同字号下 Lucide 略大略重

对 39 个两边都有对应的图标做了 24px 画布 8× 超采样测量：

| 指标           | Material Symbols | Lucide | 差异     |
| -------------- | ---------------- | ------ | -------- |
| 平均墨迹覆盖率 | 22.8%            | 25.0%  | **+9%**  |
| 平均视觉包围盒 | 70.8%            | 79.6%  | **+12%** |

**但个体差异很大**，不是统一的"变粗"：`apps`（九宫格）+84%、`layers` +63%、`article` +41%、`refresh` +40%、`local_parking` +24% 明显变重；反过来 `commute` −32%、`signpost` −26%、`directions_subway` −12% 会变轻。

含义：**不能靠"整体缩 1px"来对齐视觉重量**。要么逐个微调尺寸，要么接受一批"看起来更抢眼"的图标。当前界面字号集中在 18px（45 条规则）、20px（23 条）、16px（18 条），也就是多数图标在 16–20px 之间，这个尺寸下重量差会被明显感知。

### 3.2 形状语言：从"可变形"变成"统一描边"

- Material Symbols 是可变字体，`wght / GRAD / opsz` 三个轴可用。走自定义属性这条路时，`--icon-weight`、`--icon-grade`、`--icon-optical-size` **全仓 0 个 setter**，全部停在默认 `400 / 0 / 24`（`10-base.css:314`）；只有 8 处字面量 `font-variation-settings` 会局部改轴（例如 `20-layout.css:643-647` 的伪元素用 `wght 600 / opsz 20`）。也就是说这三个轴基本没被系统性使用，迁到 Lucide 在这一层几乎没有损失。
- 顺带一个可以确认的事实：走变量的图标 `opsz` 是**钉死在 24** 的，不随字号变化。所以 40px/42px/44px 的大图标（离页面板、空状态、物料预览）现在其实是用 24 的光学尺寸画出来的，偏钝偏重。迁移不会让这件事变坏，但也修不了 —— 想调轻只能改 `stroke-width`。
- 线端与转角：Material 是方头/几何转角的 Metro 风格，Lucide 是 2px 圆头圆角（`stroke-linecap/linejoin: round`）。**这条会改变整个界面的气质** —— 现在的青绿品牌色 + 方头图标偏"交通导视/工具化"，圆头后会偏"通用 SaaS"。考虑到这是地铁/公交导视产品，这个反差值得先在深色 + 高级材质模式下试看一眼再决定。

### 3.3 选中态：最明显的一处观感变化

现在：用户点中一项 → 图标从描边**平滑过渡**成实心（`font-variation-settings` 有 transition）。迁到 Lucide 后这个"点亮"信号要么消失、要么变弱（只能换颜色/底色/描边粗细）。底部导航四项、各类筛选 chip、地图模式切换都受影响 —— 这是用户每天感知最强的一处。

### 3.4 高级材质模式：图标的阴影实现要整体换轨

`60-pages.css:4186-4210` 把图标分成两类处理：字体图标用 `text-shadow`，SVG/蒙版图标用 `filter: drop-shadow`。且 `:where(svg *)` 会把子元素阴影清零，靠外层承担投影。

全量转成内联 SVG 后，**所有图标都会落到 `filter` 分支**，`DESIGN.md:306` 里"字体图标用文字阴影、SVG 用图形阴影"的双路径规则要重写成单路径，并且 4px/12px 两级阴影在 stroke 图形上的观感与填充字形不同，需要重新调参。另外 `70-data.css:1685-1705` 有一处按图标类名分支的"图标墨水比文字再沉 4%"的颜色微调，迁移后要跟着走。

### 3.5 布局细节：基线对齐会有一轮抖动

现在是 `display: inline-block` 的 span + `line-height: 1`；换成 `<svg>` 后是替换元素，基线对齐规则不同，通常会有 1–2px 的垂直位移。`DESIGN.md:256` 要求"固定格式组件需要明确尺寸约束，避免内容加载后抖动"，这轮抖动需要逐处确认。另外 `vertical-align`、`letter-spacing`、`white-space: nowrap` 这些只为字体图标存在的声明会失效。

### 3.6 反而会变好的地方：首屏

现在 290.9 KB 的 woff2 是 `font-display: block` 且**没有任何 preload**（`layout.tsx` 里只有 manifest link）。意味着首屏图标要等字体下载完成才显示。换成按需引入的 SVG 后这条阻塞消失，单个图标体积也从平均约 900 B 降到 1–2 KB 的可 tree-shake 模块 —— 但注意：因为图标名是动态字符串，**不能直接 tree-shake**，需要一个"名字 → 组件"的静态注册表，这会把收益部分吃掉。

### 3.7 交通/导视域：观感风险最高的一块

37 个无对应图标里，19 个集中在产品核心：

- **交通方式**（11）：`subway`、`directions_subway`、`directions_bus`、`tram`、`train`、`airport_shuttle`、`directions_boat`、`commute`、`directions_transit`、`metro`、`airline_seat_recline_extra`
- **转向/换乘**（8）：`turn_left`、`turn_right`、`turn_slight_left`、`turn_slight_right`、`u_turn_left`、`u_turn_right`、`transfer_within_a_station`、`run_circle`
- **设施/无障碍**（11）：`accessible`、`accessible_forward`、`elevator`、`escalator`、`stairs`、`ramp_right`、`wc`、`man`、`woman`、`family_restroom`、`breastfeeding`

这些不是"找不到图标可以凑合"，而是**地铁导视牌上必须一眼可辨的标准化符号**（电梯/扶梯/楼梯/卫生间/母婴室/无障碍）。Lucide 作为通用 UI 图标集在形状和语义上都承接不了 —— 硬套的结果是导视牌变成"通用 App 风格"，这在物料场景里是质量事故。

好消息：这 37 个里 **16 个已经有手抽的静态 SVG**（`public/material-symbols/outlined/`，960 网格单路径），可以直接留用。剩下 21 个（尤其 8 个转向箭头 + `progress_activity` + `commute` + `tram`）目前只能靠 webfont 出图，是纯新增工作量。

## 4. 如果要换，建议的路线

**双轨，不要"全站一把切"**：

- **UI 图标走 Lucide**：导航、按钮、表单、后台表格、地图控件这类通用语汇，用 182 个精确映射 + 部分可接受的 102 个近似映射。
- **业务/导视图标保持自绘 SVG**：37 个缺口 + 全部交通方式 + 导视设施。它们本来就有 34 个现成资产，且 `metro-facilities` / `metro-arrows` 那套（52 + 15 个）已经完全脱离 Material。

**四个关键实现决定**（都能显著减少返工）：

1. **尺寸继续走 `font-size`**：图标组件输出 `width: 1em; height: 1em` 的内联 SVG。150 条现有尺寸规则和 `ui:plan` 字号棘轮都能保住，改的是选择器而不是尺寸体系。
2. **名字 → 组件用静态注册表**：因为存在开集数据，必须有 `Record<string, LucideIcon>` 的集中表 + 未知名兜底（建议兜底到现在的自绘资产，而不是空白）。
3. **FILL 用"双份图标"策略**：为高频选中态（底部导航 4 项、常用 chip、地图模式）准备 filled 变体，其余降级为颜色/底色。这样核心交互的观感保住，工作量可控。
4. **先收敛再迁移**：先把 7 份平行的交通方式映射收敛成 1 个模块，再动图标。否则迁移过程中漏一份就是线上某处图标错乱。

**分阶段（建议顺序）**：

| 阶段 | 内容                                                                                           | 出口标准                   |
| ---- | ---------------------------------------------------------------------------------------------- | -------------------------- |
| P0   | 收敛映射表 + 补 3 个缺失 SVG（`local_taxi`、`accessible_forward`、`groups`）+ 定未知名兜底策略 | 不改观感，纯整理           |
| P1   | 引入图标组件 + 注册表，只迁 182 个精确映射                                                     | 视觉基线可对比，无功能变化 |
| P2   | 处理 FILL 选中态（设计定方案）                                                                 | 导航/筛选观感验收          |
| P3   | 迁 102 个近似映射 + 重做导视牌 14 个素材 + QQ 卡片 path 表                                     | 出图管线回归               |
| P4   | 删字体链（脚本/build 行/woff2/manifest/README）+ 改文档 + 重拍视觉基线                         | CI 全绿                    |

## 5. 现在可以先做什么（隔壁在改的前提下）

**先别动源码。** 冲突面不是"改几个文件"：75 个 tsx + 9 个 CSS + 自动生成的 `controls-inventory.json`（160 处），基本覆盖了所有 UI 文件，而且 P0 那批门禁要求**原子提交**。在别人还在改界面的时候动，等于把两边的 diff 绞在一起。

按本次评估时的 `git status`，工作区里正在改的文件恰好是图标密度最高的一批 —— 仅这几个未提交文件里就有 **241 处** `material-symbols-outlined`：

| 在改文件                                                  | 图标引用数 | 说明                                     |
| --------------------------------------------------------- | ---------- | ---------------------------------------- |
| `apps/web/app/dev/controls/controls-inventory.json`       | 160        | 自动生成，`ui:controls:check` 逐字节比对 |
| `apps/web/app/styles/50-materials.css`                    | 36         | 该文件共 34 条图标规则块                 |
| `apps/web/components/metro-wayfinding-editor.tsx`         | 36         | 全仓图标最密集的单个组件之一             |
| `apps/web/components/transit-material-form-workspace.tsx` | 7          |                                          |
| `apps/web/components/metro-wayfinding-canvas.tsx`         | 2          |                                          |

也就是说：等这批改动落地再动图标，能省掉一轮纯粹的 rebase 冲突。

不碰业务代码、现在就能做、而且对后续有帮助的三件：

1. **把映射表定稿**：321 个名字 → Lucide 名 + 37 个自建（可放 `docs/` 或 `packages/design-tokens`，纯新增文件不冲突）。这是整个迁移最长的一根前置杆。
2. **记录"迁移前"的视觉基线**：等隔壁的分支合完再跑一次 `pnpm visual:controls:capture`。现在 `.screenshots/` 是空的（且被 gitignore），一旦要迁移，没有基线就没法判断"只是换了图标"还是"顺手改坏了布局"。
3. **顺手补已知缺口**（与迁移无关的现存 bug）：`metro-wayfinding.ts:253` 的「出租车」选项声明了 `symbol: 'local_taxi'` 但没有 `assetName`，而 `public/material-symbols/outlined/local_taxi.svg` 不存在 → 渲染会命中 `material-glyph-server-assets.ts:107` 的异常。另外 34 个 SVG 里 `chair.svg`、`support_agent.svg` 不在导视牌 symbol 白名单内、目前没有消费方（图标本身仍走字体，不算坏账，但迁移时会成为待定资产）。

真开始动手时，建议开一个独立 worktree，从 P0 做起，P1 之前不要碰导视牌出图链。

## 6. 什么情况下值得重新评估

按现有结论，下面这些条件单独出现都不够，通常要同时成立才值得再动一次：

1. **设计明确放弃 FILL 选中态**（改成颜色/底色/描边语义）——这是 P1 的唯一硬阻塞，解掉了迁移的性质就从"改设计"退回"改代码"。
2. **图标名从开集收敛成枚举**：三个自由文本字段（`TransitModeProfile.icon` 等）改成受控选择器，且历史数据全部清洗完。这样"未知名兜底"这个长期负担才消失。
3. **出现第二个使用同一套图标的前端表面**（小程序、桌面端、第三方嵌入），那时统一 API 的收益才会超过维护成本。
4. **Material Symbols 本地字体链路自己出问题**：Google 回源失效、子集构建失败、或需要升级到不再兼容的版本。这时候是"被迫迁移"，性质不同，需要按本文的 P0→P4 走。

反过来，如果动机只是下面任意一条，**不需要换图标库**：

- **首屏图标闪烁**：直接修字体加载（`font-display` / 预加载），见 §3.6。这是唯一一个真实且独立于图标库的痛点。
- **图标体积**：当前 321 图标 / 290.9 KB，平均约 900 B；换成需要全量注册的 Lucide 后 gzip 量与字体同一量级，没有明显收益。
- **"图标不够用"**：Material Symbols 有 4000+ 图标，缺的从来不是数量，而是本项目的交通导视专用符号——那部分无论用哪个库都得自绘。

## 附录 A：37 个无 Lucide 对应的图标

**交通方式（11）**：`subway` `metro` `directions_subway` `directions_bus` `tram` `train` `airport_shuttle` `directions_boat` `directions_transit` `commute` `airline_seat_recline_extra`

**转向/换乘（8）**：`turn_left` `turn_right` `turn_slight_left` `turn_slight_right` `u_turn_left` `u_turn_right` `transfer_within_a_station` `run_circle`

**设施/无障碍（11）**：`accessible` `accessible_forward` `elevator` `escalator` `stairs` `ramp_right` `wc` `man` `woman` `family_restroom` `breastfeeding`

**动效/气象/体育（7）**：`progress_activity` `animation` `partly_cloudy_day` `sports` `sports_soccer` `stadium` `travel`

其中已有静态 SVG 可直接留用的 16 个：`accessible` `airline_seat_recline_extra` `breastfeeding` `directions_boat` `elevator` `escalator` `family_restroom` `man` `ramp_right` `stairs` `subway` `train` `u_turn_left` `u_turn_right` `wc` `woman`

## 附录 B：参考数据来源

- 图标清单：`apps/web/app/fonts/material-symbols/manifest.json`（321 项，`fontBytes: 290960`）
- 调用点计数：`apps/web` + `packages` 下 `*.ts/tsx` 中 `material-symbols-outlined` 418 处（75 文件）、`<MaterialSymbol` 51 处
- CSS 计数：9 个样式文件、215 条规则块、238 处选择器、150 条 `font-size`、36 条 `--icon-fill: 1`
- 墨迹/包围盒测量：39 个两边都有对应的图标，24px 画布、8× 超采样、阈值 200/255
- Lucide 版本：`lucide-static@1.80.0`（静态 SVG 取自 unpkg）
- 对照图生成方式：Material 侧从 Google Fonts 按 `FILL=0 / FILL=1` 两个静态实例取 TTF，用 `opentype.js` 抽 `getPath(0,24,24)` 路径；Lucide 侧直接内联官方 SVG，`stroke-width 2`、圆头圆角。
