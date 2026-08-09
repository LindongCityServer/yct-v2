# 发布版本流程

部署时间通常早于提交说明最终落盘，因此版本更新记录不能在部署后反推提交标题。截止 `apps/web/release-notes.json` 中 `historyCutoffSha` 的旧版本已经固化在 `apps/web/release-history.json`，普通构建不会重新计算或改写旧版本号。正式构建前先由发布操作者填写本次真正上线的用户可感知变更，再生成不可变发布清单。

## 标准流程

1. 确认本次实际要上线的功能、修复、性能或界面变化。
2. 执行 `pnpm release:prepare --theme <主题> --change "<类型>|<用户可感知摘要>"`。`--change` 可以重复，类型只能是 `feat`、`fix`、`perf`、`style`，破坏性变更使用 `feat!|...` 等形式。
3. 检查 `apps/web/release-notes.json` 中生成的版本号和摘要。命令会保存源码指纹，确保清单对应本次构建内容。
4. 运行正式发布包构建。`pnpm web:artifact` 会强制要求源码指纹与最新发布清单一致。
5. 如果构建前源码或用户可感知范围发生变化，执行 `pnpm release:prepare --amend --theme <主题> --change "<类型>|<摘要>"`，然后重新构建。

## 版本规则

- 首个历史用户版本从 `2.0.0` 开始。
- 提交在 60 分钟总跨度内合并为一个历史批次。
- 历史 Conventional Commit 按 `type(scope)` 解析；早期无前缀提交只在摘要含明确功能或修复动词时纳入，并从稳定领域关键词推断主题。`docs`、`chore`、`deploy` 和纯重构仍不展示。
- 相邻批次超过 12 小时没有提交，才开启新的发布会话；不按自然日切分。
- 批次出现历史上从未出现的主题时升 minor，即使与上一批在同一发布会话。
- Asia/Shanghai 同一自然日最多升一次 minor；同一发布会话跨过午夜时也最多升一次 minor。
- 已知主题的同会话批次升 patch；不同会话且包含 `feat` 时升 minor。
- 破坏性变更升 major。

页面只展示用户可感知摘要，不展示 commit hash、内部 scope 或源码指纹。

`2.0.0` 是例外的人工策划版本：其更新记录依据旧版 [`LindongCityServer/yct`](https://github.com/LindongCityServer/yct) 的真实页面与功能，对照 v2 首批实现描述迁移差异，不直接显示“初始化雨城通 v2 实现”这一条技术提交标题。

`pnpm release:freeze-history` 默认拒绝覆盖现有快照。只有在明确决定重写全部历史版本时，才允许执行 `pnpm release:freeze-history --force`；这会改变既有版本号，不能作为日常发布步骤。
