# Material Symbols Outlined

`MaterialSymbolsOutlined.woff2` 是根据项目源码按需生成的 Material Symbols Outlined 可变字体子集，用于固定图标的本地加载、弱网降级和离线友好渲染。

图标清单保存在同目录的 `manifest.json`。重新增加 Material Symbols 图标后，在仓库根目录运行：

```text
pnpm icons:material-symbols:sync
```

发布前也可以只校验源码图标集合、`manifest.json` 和字体文件大小是否一致：

```text
pnpm icons:material-symbols:check
```

同步脚本使用 TypeScript AST 提取 JSX 图标正文、`MaterialSymbol` 的 `name` 属性和图标字段，避免把普通业务字符串误收进字体，也避免漏掉多行 JSX 中的图标名。同步脚本只在开发或发布时访问 Google Fonts；公开页面运行时不依赖 `fonts.googleapis.com` 或 `fonts.gstatic.com`，只有受保护的后台预览和资源晋级流程允许回源。

后台动态填写的图标名不进入构建期字体：管理员输入时由受保护的预览接口按单图标回源；确认保存、服务入口提交、交通配置更新或 POI 发布后，服务端会把字形转换为按内容哈希保存的本地 SVG。公开页面只读取本地 SVG，尚未晋级的旧数据继续回退到本字体子集。

来源 CSS：
`https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200`

Material Symbols / Material Icons 项目由 Google 按 Apache License 2.0 分发。
