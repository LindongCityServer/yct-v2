# 物料模板源码规范

更新时间：2026-10-25

## 适用范围

本规范适用于路牌物料和公共交通导视物料的管理员模板。模板由管理员在 `/admin/materials` 创建、修订和发布；发布不依赖 Git 流程。

模板使用受限 SVG，而不是可执行脚本。这样既能自由排版，也不会让数据库内容获得服务端代码执行权限。

## 当前内置模板

公共交通导视按模板族分组展示，内置模板如下：

| 模板                                       | 说明                                                               |
| ------------------------------------------ | ------------------------------------------------------------------ |
| 公交站牌（始发终点 / 线路概览 / 线路详情） | 三套版式合并在同一入口，通过“版式”切换。                           |
| 公交站牌（横版线路详情）                   | 保持独立入口。                                                     |
| 地铁横板线路图（新版 / 旧版）              | 与站名、方向共用“地铁横板线路图”入口，通过“版式”和“样式”切换。     |
| 地铁站名（新版 / 旧版）                    | 站名灯箱版式，使用线路色条与站名拼音。                             |
| 地铁方向（新版 / 旧版）                    | 开门方向、开往方向、下一站站名与拼音。                             |
| 站台站名标志                               | 512 × 512 的方形站台站名牌，数据来源模式只需选择线路、车站与方向。 |
| 地铁导视牌                                 | 受限结构化 JSON 的可视化编辑器，支持导入 / 导出工程文件。          |

## SVG 要求

- 源码必须是完整的 `<svg>` 文档，并且必须含有 `viewBox`。
- 可以使用 SVG 的基础图形、文本、路径、分组、颜色、描边和本地样式。
- 禁止 `script`、事件属性（例如 `onclick`）、`foreignObject`、`iframe`、`object`、`embed`、`image`、`use`、外部 URL、`data:` URL 和 `url(...)`。
- 所有用户输入会经过 XML 转义后再插入 SVG。不要在属性名称、样式名称或 SVG 标签名中使用变量。

没有专门字体要求的物料文本默认使用 `HarmonyOS Sans SC`。确有版式需要时可在模板源码中明确覆盖，例如楼栋地名标志中的拉丁字母和数字使用 `Arial`，怀旧楼牌使用其专用字形渲染器。

渲染器会按当前尺寸把源 SVG 放入输出画布左上角。开启整数地图画对齐时，右侧和底部的补齐区域保持透明。

## 变量

字段变量的格式为 `{{字段键}}`。字段键必须以小写字母开头，只能包含字母、数字和下划线。

画布变量如下：

- `{{canvas.widthPx}}`、`{{canvas.heightPx}}`：未对齐前的实际内容像素尺寸。
- `{{canvas.innerWidthPx}}`、`{{canvas.innerHeightPx}}`：预留 8 px 内边距后的尺寸。
- `{{canvas.primaryFontPx}}`、`{{canvas.secondaryFontPx}}`、`{{canvas.captionFontPx}}`、`{{canvas.largeFontPx}}`：未配置字高规则时的比例字体尺寸。

配置设计时速规则后，还可以使用：

- `{{typography.primaryFontPx}}`
- `{{typography.secondaryFontPx}}`
- `{{typography.captionFontPx}}`

文本字段可以配置 `textFit` 后，在 SVG 中使用对应字段的排字变量：

- `{{fit.字段键.letterSpacing}}`：宽度有余量时增加的字间距。
- `{{fit.字段键.scaleX}}`：文本超宽时小于 `1`，用于压缩字宽；正常情况下为 `1`。

特殊字形文本可以配置 `glyph`，并在 SVG 中使用 `{{glyph.字段键}}`。当前内置渲染器包括：

- `nostalgic_digits`：怀旧楼牌数字轮廓，只接受阿拉伯数字。
- `chill_jinshu_vertical`：使用内置金属宋字体竖排道路名称；高度有余量时增加纵向字距，高度不足时压缩字高。

`glyph` 会展开为服务端生成的受信任 SVG 路径。管理员模板不能自行传入路径源码，也不能把普通文本字段直接作为 SVG 节点插入。

示例：

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {{canvas.widthPx}} {{canvas.heightPx}}">
  <rect width="{{canvas.widthPx}}" height="{{canvas.heightPx}}" fill="#1456a0"/>
  <text x="50%" y="50%" fill="#ffffff" font-size="{{typography.primaryFontPx}}" text-anchor="middle">{{roadName}}</text>
</svg>
```

## 字段定义

字段定义是一个 JSON 数组。支持 `text`、`number` 和 `select` 三种字段类型。

```json
[
  {
    "key": "roadName",
    "label": "道路名称",
    "kind": "text",
    "required": true,
    "maxLength": 20,
    "textFit": {
      "maxWidth": 180,
      "fontSize": 32,
      "maxLetterSpacing": 3
    }
  },
  {
    "key": "designSpeedKph",
    "label": "设计时速",
    "kind": "number",
    "minimum": 0,
    "maximum": 400
  }
]
```

`select` 字段必须提供 `options`，每项包含 `value` 和 `label`。字段键不可重复。

`textFit` 只适用于 `text` 字段，数值使用源 SVG 的 `viewBox` 坐标：`maxWidth` 是文字可占用的最大宽度，`fontSize` 应与该 `<text>` 的 `font-size` 一致，`maxLetterSpacing` 为可选的最大字间距。`additionalFields` 可以列出需要与主字段共同参与测宽的其他文本字段及其字号，适合门牌主号与附标使用不同字高、但需要整体横向压缩的排版。使用时将三个变量同时写入对应排版组，例如：

```svg
<text
  x="0"
  text-anchor="middle"
  transform="translate(120 0) scale({{fit.roadName.scaleX}} 1)"
  letter-spacing="{{fit.roadName.letterSpacing}}"
>{{roadName}}</text>
```

下拉字段可以配置 `selectVariableValues`，为每个选项预先定义多个受限派生值；SVG 通过 `{{select.字段键.变量键}}` 读取当前选项的值。这适合方位模式、图形路径或一项配置联动多处标签，且不会在 SVG 中执行脚本。

```json
{
  "key": "directionMode",
  "label": "方位模式",
  "kind": "select",
  "options": [{ "value": "west_east", "label": "左西右东" }],
  "selectVariableValues": {
    "west_east": {
      "leftText": "西",
      "rightText": "东"
    }
  }
}
```

```svg
<text>{{select.directionMode.leftText}}</text>
<text>{{select.directionMode.rightText}}</text>
```

## 设计时速与字高

GB 5768 模板可通过 `typographyProfile` 将设计时速映射到字高，字高单位为毫米。渲染器按下面公式换算像素：

```text
字体像素 = 四舍五入(字高毫米 / 1000 × pxPerMeter)
```

`pxPerMeter` 默认为 128，可在物料工作台中调整。规则中的数值必须由模板管理员依据已核验的规范条文填写，系统不会内置或猜测 GB 5768 的速度档位和字高。

```json
{
  "designSpeedFieldKey": "designSpeedKph",
  "rules": [
    {
      "minDesignSpeedKph": 0,
      "maxDesignSpeedKph": 60,
      "primaryTextHeightMm": 0,
      "secondaryTextHeightMm": 0,
      "captionTextHeightMm": 0
    }
  ]
}
```

上例只说明结构，`0` 不是有效字高，不能直接发布。每个时速输入必须命中恰好适用的规则，否则渲染会拒绝导出。

## 公共交通导视与 RMP 线网

公共交通导视工作台可以使用服务器已发布线网，也可以导入[地铁线路图绘制器（Rail Map Painter，RMP）](https://railmapgen.org/?app=rmp)项目文件。该应用的正式名称为“地铁线路图绘制器 / 地鐵線路圖繪製器 / Rail Map Painter”。

导入边界如下：

- 当前支持 RMP v77 及以下版本，文件上限为 5 MB。
- 单个项目最多包含 2,000 个节点和 4,000 条边；每条边最多解析 4 个线路颜色或线路键。
- 项目必须至少包含可识别、具名的车站，以及带有效线路颜色的连接边。
- 系统只保留生成导视所需的站点坐标、站名、线路键与颜色，以及边的拓扑和路径样式；RMP 图片和车站视觉属性不会进入快照。
- 导入后的线网是只读数据源。工作台不支持修改文件固有的站点、站序、站名或拓扑，只允许补充线路的主显示名称和次显示名称。要修改固有信息，应在 RMP 中编辑并重新导入。
- 工作台根据图几何推导东、西、南、北方向，用于导视版式，不把几何方向解释为运营意义上的上行或下行。

导出时，RMP 快照通过 `networkGeometry` 随请求提交，服务端再次进行结构与限制校验，不能只依赖浏览器端解析结果。

## RMP 项目暂存与事件

- 未登录用户或暂存失败时，导入线网仍可在当前页面使用，但不会写入账号。
- 登录用户当前保存一份 RMP 线网草稿；再次导入会更新该草稿，切换回服务器线网不会删除它。
- 默认仓储是 `.yct-data/material-transit-network-project-store.json`，可通过 `YCT_MATERIAL_TRANSIT_NETWORK_PROJECT_STORE_PATH` 调整。该 JSON 仓储适合单机验证，多实例生产部署应迁移到共享数据库，并补充乐观锁和容量治理。
- 导入、更新和删除分别发布 `MaterialTransitNetworkProjectImported`、`MaterialTransitNetworkProjectUpdated`、`MaterialTransitNetworkProjectDeleted`。事件载荷只携带项目标识、所有者和摘要，不携带完整项目快照。
- 服务器线网与已导入线网之间的界面切换属于客户端瞬时状态，不发布领域事件。

## 内置导视编辑器

地铁导视使用受限结构化 JSON，而不是自由 HTML 或可执行脚本。当前编辑器支持主行与次行、顺序化内容段、普通文本、边框文本、线路标识、设施图标、方向箭头、框体形状以及填充和文字颜色。站名、位置和 RMP 线路名的输入补全只读取当前真实线网和地点数据，不生成模拟名称；服务端仍以 Schema 校验结果作为预览和导出的最终边界。

## 发布与审计

新模板和修订均先保存为草稿，只有管理员可以发布。发布新版本会归档同一模板先前的已发布版本。

下载与审核边界：

- 服务器已发布线路、带站点的公交站牌和导入的 RMP 只读线网生成物料时，需要登录并验证服务器账号，但不需要提交物料审核，可直接下载无水印图片；其他服务器来源（如公开 POI、地图坐标）只需登录，同样不需要物料审核。
- 手动输入的其他物料需要登录、提交审核并通过后才能下载无水印图片。
- 地铁导视牌使用手动输入时，如果站名等文本与模板基线一致，可直接免审核导出。服务端只比较文本签名，调整画布尺寸、箭头、图标、空白等图形内容不会使免审核资格失效；修改文本后需要重新提交审核。
- 本地开发环境中，本地管理员视为已验证服务器账号，仅用于本地验证导出流程。
- 账号权限不可用或服务器账号尚未验证时，下载会回退为带水印预览。

审计记录：

- 每次预览和下载都会写入同一份审计记录，以 `kind` 区分 `preview`（带水印预览）和 `export`（无水印下载）；历史记录没有 `kind` 时按下载处理。
- 记录包含操作者标识与名称、IP 地址及属地、模板 ID、版本与名称、内容摘要、来源类型与引用、草稿 ID、画布尺寸、输入散列、输出图片散列、生成时间和图片 ID。
- 未登录预览会记为匿名记录，并以请求 IP 作为匿名标签；被下一次编辑取消的预览不写入审计。
- 后台“下载预览记录”支持按用户、模板、内容摘要、IP 属地或图片 ID 搜索，并按预览 / 下载、带水印 / 无水印筛选。
- 下载文件名由模板名称、内容摘要和导出 ID 组成；地铁导视的内容摘要从版式中的文本元素提取。

预览不触发导出事件。服务器来源预览可以公开使用；手动输入预览在正式环境需要登录，本地开发环境允许从 `localhost`、`127.0.0.1` 或 `::1` 免登录预览。下载与审核权限不受此开发例外影响。
