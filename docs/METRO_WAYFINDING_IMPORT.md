# 地铁导视牌：外部工程导入兼容说明

> 代码入口：`apps/web/lib/metro-wayfinding-import.ts`；NaL v2 的解析与校验在
> `apps/web/lib/nal-design-format.ts`；回归校验：`pnpm metro:check` 中的
> `scripts/checks/verify-metro-import-sources.ts`。

工作台只使用一个可编辑元素模板（`system_material_metro_wayfinding`），因此所有外部工程
最终都要落到「单行 / 双行 / 竖向」三种版式之一。外部来源目前包括 YCT 自己的工程、
NaL 导向标志设计器、Chitose.City Sign Maker 与 MoeRT-GuideGen。

## NaL 三个设计器

NaL 的 v2 格式（`schemaVersion: 2`）由导向标志（`nalvitool`）、墙面标志（`nalwall`）、
站名站牌（`nalstasign`）共用同一套信封与元素模型。导入按 `type` 与 `schemaVersion` 分流：

| 文件                                  | 处理                                                                                                |
| ------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `nalvitool`，无 `schemaVersion`（v1） | 走原有 `layers` + `definitions` 迁移                                                                |
| `nalvitool`，`schemaVersion: 2`       | 读取第一个画板的 `rows → groups → elements`，按 1 / 2 层落下                                        |
| `nalwall`，`schemaVersion: 2`         | 视作**竖向导视牌**：`top` / `middle.layers` / `bottom` 从上到下叠放成竖向一列，每个模块包一层组合框 |
| `nalstasign`（v1 / v2）               | 视作竖向站名牌：站名大文字 → 英文名 → 线路标 → 下一站                                               |
| `schemaVersion > 2`                   | 整体拒绝并提示升级本工具                                                                            |

### v2 元素映射

| `kind`                  | 产出                                                                    |
| ----------------------- | ----------------------------------------------------------------------- |
| `asset`                 | 复用素材号映射（`way@` / `stn@` / `oth@` / `line@` / `clss@` / `cls@`） |
| `text`                  | 文本元素：`single` = 1 中 1 英、`A` = 1 中 2 英、`C` = 2 中 2 英        |
| `ribbonText`            | 文本元素 + 色带色作背景、可读前景色                                     |
| `exit`                  | `sub@01` / `sub@02` → 出口图标；`sub@03` → 分隔点「·」                  |
| `tinted`                | 在基础素材上着色：有 `content` 时彩色底 + 浅/深内容，否则只染前景       |
| `lineBadge`             | 彩色底组合框 + 中英文两行文本                                           |
| `column`                | 摊平成「上半栏 → 分割线 → 下半栏」；`single-*` 只取 `top`               |
| `customSvg`             | 无法参数化，跳过并提示                                                  |
| `transform.flipH/flipV` | 只对箭头与带方向的图标生效（镜像方向）；旋转忽略并提示                  |

其余近似与降级：

- 双画板 / 双模块只导入第一个画板 / 第一组模块，并给出提示。
- `theme` C、D 需要启元权限，按 NaL 的降级规则落到 A、B 的底色。
- `canvas.length: null`（自动尺寸）按 8 格画布导入。
- `grouping` 与 v1 的 `group` 同口径，映射到双行之间的「行间分割线」。
- 墙面标志、站名站牌的画布固定 4 米宽；竖向高度按非空模块数 / 4 米推算。
- 站名站牌的 `state` 与 URL 参数同名：`cn` / `en` / `lineColor` / `lineColor2` /
  `multiLine` / `nextCn` / `nextEn` / `isTerminus`；`lineColor` 的 `01`–`32`
  按 `clss@NN` 已确证的号段解析为线路标，`#RRGGBB` 直接当色带色。

## 校验口径

v2 文件先完整校验再转换：枚举、颜色（`#RRGGBB`，统一大写）、素材文件名、`customSvg`
引用的快照都必须合法，出错时一次性列出位置，例如：

```
nal-v2.json 不是有效的 NaL v2 设计文件
- boards[0].rows[0].groups[0].elements[0].color：颜色必须是 #RRGGBB
```

文档约定「可选字段取默认值时不写出」，因此 `theme` / `canvas` / `grouping` 等缺省时
按默认值处理，不视为错误；只有 `boards` / `rows` 结构与元素本身的字段错误会中断导入。

## 已知不支持

- 旧版（无 `schemaVersion`）的 `nalwall` 工程：结构为 `canvases` + `definitions`，
  与 v2 差异过大，提示用户在 NaL 设计器中升级后重新导出。
- NaL 的「线路通长」（`staline`）等新工具类型：只给出明确的「暂不支持该类型」提示。
- 自定义 SVG 快照、旋转、嵌套分栏的精确版式；语义模式下会按目标模板重新归一化。
