/**
 * 视口断点的应用侧常量（单一事实来源：packages/design-tokens/src/breakpoints.json）。
 *
 * CSS 媒体查询只能用字面量；本文件供 JS matchMedia 使用，避免 720/760/959 散落。
 * 新增断点时同步更新 JSON 与 scripts/ui-breakpoints.mjs 的登记校验。
 */
export const SINGLE_COLUMN_MAX = 720;
export const MOBILE_NAV_MAX = 760;
export const PREVIEW_DIALOG_MAX = 959;

export const SINGLE_COLUMN_MEDIA_QUERY = '(max-width: ' + SINGLE_COLUMN_MAX + 'px)';
export const MOBILE_NAV_MEDIA_QUERY = '(max-width: ' + MOBILE_NAV_MAX + 'px)';
export const PREVIEW_DIALOG_MEDIA_QUERY = '(max-width: ' + PREVIEW_DIALOG_MAX + 'px)';
