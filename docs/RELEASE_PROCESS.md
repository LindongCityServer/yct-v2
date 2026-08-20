# 发布版本流程

部署时间通常早于提交说明最终落盘，因此版本更新记录不能在部署后反推提交标题。截止 `apps/web/release-notes.json` 中 `historyCutoffSha` 的旧版本已经固化在 `apps/web/release-history.json`，普通构建不会重新计算或改写旧版本号。正式构建前先由发布操作者填写本次真正上线的用户可感知变更，再生成不可变发布清单。

## 标准流程

1. 确认本次实际要上线的功能、修复、性能或界面变化。
2. 执行 `pnpm release:prepare --bump <级别> --theme <主题> --change "<类型>|<用户可感知摘要>"`。`--change` 可以重复，类型只能是 `feat`、`fix`、`perf`、`style`，破坏性变更使用 `feat!|...` 等形式。普通发布可省略 `--bump`，默认按 patch 处理；新增核心用户流程、公开 API 或需要单独对外说明的完整能力时显式使用 `--bump minor`。
3. 检查 `apps/web/release-notes.json` 中生成的版本号和摘要。命令会保存源码指纹，确保清单对应本次构建内容。
4. 运行正式发布包构建。`pnpm web:artifact` 会强制要求源码指纹与最新发布清单一致。
5. 如果构建前源码或用户可感知范围发生变化，执行 `pnpm release:prepare --amend --theme <主题> --change "<类型>|<摘要>"`，然后重新构建。`--amend` 默认保留该版本已经记录的 bump；只有确认版本级别判断错误时才重新传入 `--bump`。

## 版本规则

- 首个历史用户版本从 `2.0.0` 开始；已经固化到 `release-history.json` 的历史版本号保持不变。
- 新的人工发布默认升 patch。小型新增、已有流程增强、修复、性能和样式调整都可以归入 patch，不再因为第一次出现某个主题或跨过发布会话而自动升 minor。
- 新增独立核心流程、公开 API、重要数据契约或需要单独对外宣布的完整能力时，由发布操作者显式指定 `--bump minor`。
- 包含破坏性变更时必须使用 `--bump major`，并至少存在一项带 `!` 的变更；没有破坏性变更时禁止误升 major。
- `themes` 只用于更新日志归类和检索，不再决定版本级别。
- 旧的准备记录如果没有 `bump` 字段，仍按原来的主题、发布会话和自然日规则校验，仅用于兼容既有发布清单；所有新记录都会保存明确的 `bump`。

页面只展示用户可感知摘要，不展示 commit hash、内部 scope 或源码指纹。

`2.0.0` 是例外的人工策划版本：其更新记录依据旧版 [`LindongCityServer/yct`](https://github.com/LindongCityServer/yct) 的真实页面与功能，对照 v2 首批实现描述迁移差异，不直接显示“初始化雨城通 v2 实现”这一条技术提交标题。

`pnpm release:freeze-history` 默认拒绝覆盖现有快照。只有在明确决定重写全部历史版本时，才允许执行 `pnpm release:freeze-history --force`；这会改变既有版本号，不能作为日常发布步骤。
