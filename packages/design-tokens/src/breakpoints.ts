import data from './breakpoints.json';

/**
 * 视口断点单一事实来源。
 *
 * CSS 媒体查询无法使用 CSS 变量，因此断点以本 JSON 登记：
 * - 命名断点供 JS matchMedia 使用（避免字面量散落）；
 * - known 列表登记全部历史断点值（含组件级宽度），新增值必须登记，由
 *   `scripts/ui-breakpoints.mjs` 在 CI 与看板中校验。
 */
export const breakpointPx = {
  singleColumnMax: data.singleColumnMax,
  mobileNavMax: data.mobileNavMax,
  previewDialogMax: data.previewDialogMax,
} as const;

export const SINGLE_COLUMN_MAX = data.singleColumnMax;
export const MOBILE_NAV_MAX = data.mobileNavMax;
export const PREVIEW_DIALOG_MAX = data.previewDialogMax;

/** 已登记的断点值（px）。新增媒体查询/matches 时同步登记。 */
export const KNOWN_BREAKPOINT_PX: readonly number[] = data.known;

export const SINGLE_COLUMN_MEDIA_QUERY = '(max-width: ' + SINGLE_COLUMN_MAX + 'px)';
export const MOBILE_NAV_MEDIA_QUERY = '(max-width: ' + MOBILE_NAV_MAX + 'px)';
export const PREVIEW_DIALOG_MEDIA_QUERY = '(max-width: ' + PREVIEW_DIALOG_MAX + 'px)';
