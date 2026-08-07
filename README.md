# 雨城通 v2

雨城通 v2（Yuchengtong，YCT）是面向临东市服务器玩家、游客、运营人员和管理员的公共交通与生活服务 Web 应用。项目将运营信息、地图探索、出行、工具服务和账号设置整合到统一界面，并为线路、站点、地图兴趣点和公共交通导视物料提供后台维护、审核与发布能力。

## 当前能力

- 运营信息：公告、提醒、内容流和服务器常用入口。
- 地图探索：uNmINeD 瓦片、地图标记、线路详情、附近搜索与路线估算。
- 出行服务：线路与站点查询、客运班次、提醒、票务草稿和历史记录。
- 数据维护：线路、站点、POI、分类图标和投稿审核。
- 公共交通导视：内置结构化编辑器、预览和导出，并支持导入[地铁线路图绘制器（Rail Map Painter，RMP）](https://railmapgen.org/?app=rmp)项目文件作为自定义线网数据。
- 多语言：固定界面和常见问题支持简体中文、繁體中文和 English；业务实体译名继续由正式数据维护。

RMP 在线应用的正式名称为“地铁线路图绘制器 / 地鐵線路圖繪製器 / Rail Map Painter”。导入后的项目作为只读线网快照使用，不支持在雨城通内修改文件固有的站点、站序、站名或拓扑；需要调整时，应回到 RMP 编辑并重新导入。

## 技术栈

- Monorepo：pnpm workspace
- Web：Next.js、React、TypeScript
- 契约与校验：`packages/contracts`、`packages/schemas`
- 质量检查：TypeScript、ESLint、Prettier

## 仓库结构

```text
apps/web/           Web 应用、API 路由与运行时仓储
packages/contracts/ 跨模块领域类型和事件契约
packages/schemas/   API、配置和持久化数据校验
docs/               需求、目标、设计、部署和专项说明
scripts/            构建、部署与运维脚本
```

## 本地准备

环境要求：Node.js 20.9 或更高版本、pnpm 11.7。

```powershell
pnpm install
Copy-Item .env.example .env.local
pnpm typecheck
```

开发和构建脚本可在根目录 `package.json` 中查看。仓库不提供模拟业务数据；本地运行前应按 `.env.example` 配置真实数据源或可复现的本地仓储。

## 数据与事件边界

- 业务模块通过 `packages/contracts/src/events.ts` 中的事件契约解耦；Service 完成核心持久化后发布事件，监听方负责后续副作用。
- RMP 项目文件会转换为受限、可校验的线网快照，并按当前登录用户保存草稿；默认仓储位于 `.yct-data`，生产多实例环境应迁移到共享持久化存储。
- 线路停靠位置可按正向、反向或本线路默认位置关联地图标记。读取时优先使用方向专属位置，其次回退到默认位置和普通站点标记。

## 文档入口

- [需求与架构边界](docs/REQUIREMENTS.md)
- [阶段目标](docs/GOALS.md)
- [视觉与交互设计](DESIGN.md)
- [事件契约](docs/EVENT_SCHEMA.md)
- [地图接入](docs/MAP_INTEGRATION.md)
- [物料模板与线网来源](docs/MATERIAL_TEMPLATE_SOURCE.md)
- [部署说明](docs/DEPLOYMENT.md)
- [AI 接入基线](docs/AI_ACCESS.md)

## 提交前检查

```powershell
pnpm typecheck
pnpm format:check
git diff --check
```

源文件统一使用 UTF-8 无 BOM。不要提交本地环境变量、`.yct-data`、运行时素材、构建产物或调试日志。
