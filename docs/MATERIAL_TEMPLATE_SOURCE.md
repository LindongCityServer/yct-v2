# 物料模板源码规范

## 适用范围

本规范适用于路牌物料和公共交通导视物料的管理员模板。模板由管理员在 `/admin/materials` 创建、修订和发布；发布不依赖 Git 流程。

模板使用受限 SVG，而不是可执行脚本。这样既能自由排版，也不会让数据库内容获得服务端代码执行权限。

## SVG 要求

- 源码必须是完整的 `<svg>` 文档，并且必须含有 `viewBox`。
- 可以使用 SVG 的基础图形、文本、路径、分组、颜色、描边和本地样式。
- 禁止 `script`、事件属性（例如 `onclick`）、`foreignObject`、`iframe`、`object`、`embed`、`image`、`use`、外部 URL、`data:` URL 和 `url(...)`。
- 所有用户输入会经过 XML 转义后再插入 SVG。不要在属性名称、样式名称或 SVG 标签名中使用变量。

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

`textFit` 只适用于 `text` 字段，数值使用源 SVG 的 `viewBox` 坐标：`maxWidth` 是文字可占用的最大宽度，`fontSize` 应与该 `<text>` 的 `font-size` 一致，`maxLetterSpacing` 为可选的最大字间距。使用时将三个变量同时写入该字段的 `<text>` 元素，例如：

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
  "options": [
    { "value": "west_east", "label": "左西右东" }
  ],
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

## 发布与审计

新模板和修订均先保存为草稿，只有管理员可以发布。发布新版本会归档同一模板先前的已发布版本。

手动输入物料需要登录、提交审核并通过后才能下载。由服务器已发布线路和站点、地图静态标记或已发布公开 POI 生成的物料需要登录但不需要审核。两种下载都会记录操作者、模板版本、来源引用、画布尺寸、输入散列和输出文件散列。

预览不写入下载审计，也不会触发导出事件。服务器来源预览可以公开使用；手动输入预览在正式环境需要登录，本地开发环境允许从 `localhost`、`127.0.0.1` 或 `::1` 免登录预览。下载与审核权限不受此开发例外影响。
