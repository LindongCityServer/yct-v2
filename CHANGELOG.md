# 更新日志

> 本日志仅收录经 PR 合并的改动；直接推送到 main 的提交不在此列。
> 自动区段由 `scripts/changelog/generate.mjs` 生成，重复运行可安全刷新；手工补充请写在标记之外。

## Unreleased

<!-- changelog:unreleased:start -->
区间：2026-11-02T12:23:26.518Z → 当前时间；已合并 PR 9 个。

### 新功能
- 概览指标块改为可点击跳转（[#30](https://github.com/LindongCityServer/yct-v2/pull/30)，@wangkai8787）
- 新增测距/测面积工具并拦截自交边界（[#32](https://github.com/LindongCityServer/yct-v2/pull/32)，@wangkai8787）
- 在线玩家胶囊可点击跳转玩家板块（[#47](https://github.com/LindongCityServer/yct-v2/pull/47)，@beepingflijo）
- 班次级运营日历支持节假日、调休与自定义缓冲日（重建）（[#48](https://github.com/LindongCityServer/yct-v2/pull/48)，@beepingflijo）

### 修复
- 兜底关闭 POI 详情的 Esc（修复 #33 回归）（[#34](https://github.com/LindongCityServer/yct-v2/pull/34)，@wangkai8787）
- 限制相册主图尺寸并预取相邻图片（[#25](https://github.com/LindongCityServer/yct-v2/pull/25)，@wangkai8787）
- 分享卡片补充简介与固定比例配图（[#29](https://github.com/LindongCityServer/yct-v2/pull/29)，@wangkai8787）
- 修正 sharp 默认导出类型引用，恢复 typecheck 基线（[#41](https://github.com/LindongCityServer/yct-v2/pull/41)，@wangkai8787）

### 重构
- 「班次」页签更名为「运营配置」（[#31](https://github.com/LindongCityServer/yct-v2/pull/31)，@wangkai8787）
<!-- changelog:unreleased:end -->

## 2.18.0 — 2026-11-02

<!-- changelog:release:2.18.0:start -->
区间：2.17.1（2026-10-31T14:17:40.765Z） → 2.18.0（2026-11-02T12:23:26.518Z）；已合并 PR 0 个。

本区间无经 PR 合并的改动（直接推送到 main 的提交按体例不收录）。
<!-- changelog:release:2.18.0:end -->

## 2.17.1 — 2026-10-31

<!-- changelog:release:2.17.1:start -->
区间：2.17.0（2026-10-30T09:24:58.633Z） → 2.17.1（2026-10-31T14:17:40.765Z）；已合并 PR 0 个。

本区间无经 PR 合并的改动（直接推送到 main 的提交按体例不收录）。
<!-- changelog:release:2.17.1:end -->

## 2.17.0 — 2026-10-30

<!-- changelog:release:2.17.0:start -->
区间：2.16.1（2026-10-29T16:38:27.367Z） → 2.17.0（2026-10-30T09:24:58.633Z）；已合并 PR 3 个。

### 新功能
- 顶栏隐藏探索彩蛋与问一问随机推荐（[#19](https://github.com/LindongCityServer/yct-v2/pull/19)，@WangKai878787，关闭 [#6](https://github.com/LindongCityServer/yct-v2/issues/6)）
- 线路运营公司名称支持外链（[#18](https://github.com/LindongCityServer/yct-v2/pull/18)，@WangKai878787，关闭 [#7](https://github.com/LindongCityServer/yct-v2/issues/7)）

### 修复
- 后台长简介默认收起并支持展开（[#17](https://github.com/LindongCityServer/yct-v2/pull/17)，@WangKai878787，关闭 [#13](https://github.com/LindongCityServer/yct-v2/issues/13)）
<!-- changelog:release:2.17.0:end -->

## 2.16.1 — 2026-10-29

<!-- changelog:release:2.16.1:start -->
区间：2.16.0（2026-10-29T15:01:09.949Z） → 2.16.1（2026-10-29T16:38:27.367Z）；已合并 PR 0 个。

本区间无经 PR 合并的改动（直接推送到 main 的提交按体例不收录）。
<!-- changelog:release:2.16.1:end -->

## 2.16.0 — 2026-10-29

<!-- changelog:release:2.16.0:start -->
区间：2.15.0（2026-10-27T22:39:47.221Z） → 2.16.0（2026-10-29T15:01:09.949Z）；已合并 PR 1 个。

### 修复
- 防止单向线路发车时刻被回填到另一侧（[#9](https://github.com/LindongCityServer/yct-v2/pull/9)，@WangKai878787，关闭 [#8](https://github.com/LindongCityServer/yct-v2/issues/8)）
<!-- changelog:release:2.16.0:end -->

## 历史区间（2.0.0 – 2.15.0）未回溯

<!-- changelog:history:start -->
这些版本的更新内容仍以 `apps/web/release-notes.json` 的人工摘要为准。
当时仓库没有走 PR 流程，GitHub 上没有可回溯的关联编号，因此不在此重复。
<!-- changelog:history:end -->
