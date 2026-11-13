/**
 * 编辑器统一快捷键。
 * 目标：所有工作台共用同一套键位语义，帮助面板与真实行为来自同一份注册表。
 */

export type EditorShortcutGroup = 'tool' | 'edit' | 'view' | 'business';

export interface EditorShortcut {
  /** 全局唯一 id，便于帮助面板与埋点引用。 */
  id: string;
  /** 组合键，例如 v、mod+z、shift+mod+z、delete。 */
  keys: string;
  label: string;
  group?: EditorShortcutGroup;
  /** 默认在输入框聚焦时不生效；显式置为 true 才放行。 */
  allowInInput?: boolean;
  run: (event: KeyboardEvent) => void;
}

const MODIFIER_KEYS = new Set(['control', 'meta', 'alt', 'shift']);

/**
 * 把键盘事件归一化为注册表使用的组合键字符串。
 * 顺序固定为 mod → alt → shift → key，保证注册表可读且可预测。
 */
export function normalizeShortcut(event: KeyboardEvent): string {
  const key = event.key.toLowerCase();
  if (MODIFIER_KEYS.has(key)) {
    return '';
  }
  const parts: string[] = [];
  if (event.ctrlKey || event.metaKey) parts.push('mod');
  if (event.altKey) parts.push('alt');
  if (event.shiftKey) parts.push('shift');
  parts.push(key);
  return parts.join('+');
}

/** 判断事件是否发生在可编辑控件里，避免抢走用户输入。 */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target.isContentEditable) {
    return true;
  }
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';
}

/** 编辑器工具键位，工具定义与快捷键共用，避免两处各写一份。 */
export const EDITOR_TOOL_KEYS = {
  select: 'v',
  pan: 'h',
  draw: 'p',
  move: 'e',
  /** 线路工作台沿用的节点拖移键，作为选择工具的别名。 */
  moveLegacy: 'm',
  station: 's',
  waypoint: 'r',
  /** 班次运行图的画图工具沿用 D，避免与线路工作台的 P 混淆。 */
  tripDraw: 'd',
  /** 班次运行图沿用的数字键快捷方式。 */
  tripPanDigit: '1',
  tripMoveDigit: '2',
  tripDrawDigit: '3',
} as const;

/** 帮助面板与注册表共用的快捷键描述。新增编辑器快捷键必须先登记到这里。 */
export interface EditorShortcutDescriptor {
  id: string;
  /** 注册表使用的组合键。 */
  keys: string;
  /** 帮助面板展示用的按键序列。 */
  displayKeys: string[];
  label: string;
  group: EditorShortcutGroup;
}

export const EDITOR_SHORTCUT_CATALOG = {
  toolPan: {
    id: 'editor-tool-pan',
    keys: EDITOR_TOOL_KEYS.pan,
    displayKeys: ['H'],
    label: '手型工具',
    group: 'tool',
  },
  toolSelect: {
    id: 'editor-tool-select',
    keys: EDITOR_TOOL_KEYS.select,
    displayKeys: ['V'],
    label: '选择工具',
    group: 'tool',
  },
  toolDraw: {
    id: 'editor-tool-draw',
    keys: EDITOR_TOOL_KEYS.draw,
    displayKeys: ['P'],
    label: '绘制 / 添加控制点',
    group: 'tool',
  },
  /** 班次运行图沿用 D 作为画图工具键，P 同时保留为统一别名。 */
  tripToolDraw: {
    id: 'editor-trip-tool-draw',
    keys: EDITOR_TOOL_KEYS.tripDraw,
    displayKeys: ['D'],
    label: '画图工具（添加 / 移除锚点）',
    group: 'tool',
  },
  tripToolMove: {
    id: 'editor-trip-tool-move',
    keys: EDITOR_TOOL_KEYS.moveLegacy,
    displayKeys: ['M'],
    label: '拖移端点（修改区间 / 停站用时）',
    group: 'tool',
  },
  tripToolPanDigit: {
    id: 'editor-trip-tool-pan-digit',
    keys: EDITOR_TOOL_KEYS.tripPanDigit,
    displayKeys: ['1'],
    label: '手型工具（数字键）',
    group: 'tool',
  },
  tripToolMoveDigit: {
    id: 'editor-trip-tool-move-digit',
    keys: EDITOR_TOOL_KEYS.tripMoveDigit,
    displayKeys: ['2'],
    label: '拖移端点（数字键）',
    group: 'tool',
  },
  tripToolDrawDigit: {
    id: 'editor-trip-tool-draw-digit',
    keys: EDITOR_TOOL_KEYS.tripDrawDigit,
    displayKeys: ['3'],
    label: '画图工具（数字键）',
    group: 'tool',
  },
  tripStationZoom: {
    id: 'editor-trip-station-zoom',
    // 组合键由运行图滚轮监听处理，这里只登记帮助面板文案。
    keys: 'shift',
    displayKeys: ['Shift', '滚轮'],
    label: '缩放站点轴',
    group: 'view',
  },
  toolMove: {
    id: 'editor-tool-move',
    keys: EDITOR_TOOL_KEYS.moveLegacy,
    displayKeys: ['M'],
    label: '选择 / 拖移节点',
    group: 'tool',
  },
  toolStation: {
    id: 'editor-tool-station',
    keys: EDITOR_TOOL_KEYS.station,
    displayKeys: ['S'],
    label: '站点工具',
    group: 'tool',
  },
  toolWaypoint: {
    id: 'editor-tool-waypoint',
    keys: EDITOR_TOOL_KEYS.waypoint,
    displayKeys: ['R'],
    label: '途径点工具',
    group: 'tool',
  },
  swapStationTool: {
    id: 'editor-line-swap-station-tool',
    keys: 'alt',
    displayKeys: ['Alt'],
    label: '临时切换站点 / 途径点工具',
    group: 'business',
  },
  toggleSnap: {
    id: 'editor-line-toggle-snap',
    keys: 'shift',
    displayKeys: ['Shift'],
    label: '临时反转吸附',
    group: 'view',
  },
  insertPrepend: {
    id: 'editor-insert-prepend',
    keys: '[',
    displayKeys: ['['],
    label: '反向追加模式',
    group: 'business',
  },
  insertAppend: {
    id: 'editor-insert-append',
    keys: ']',
    displayKeys: [']'],
    label: '追加模式',
    group: 'business',
  },
  insertNearest: {
    id: 'editor-insert-nearest',
    keys: '\\',
    displayKeys: ['\\'],
    label: '就近插入模式',
    group: 'business',
  },
  undo: {
    id: 'editor-undo',
    keys: 'mod+z',
    displayKeys: ['Ctrl', 'Z'],
    label: '撤销',
    group: 'edit',
  },
  redo: {
    id: 'editor-redo',
    keys: 'mod+shift+z',
    displayKeys: ['Ctrl', 'Shift', 'Z'],
    label: '重做',
    group: 'edit',
  },
  redoY: {
    id: 'editor-redo-y',
    keys: 'mod+y',
    displayKeys: ['Ctrl', 'Y'],
    label: '重做',
    group: 'edit',
  },
  deleteSelection: {
    id: 'editor-delete-selection',
    keys: 'delete',
    displayKeys: ['Delete'],
    label: '移除选中对象',
    group: 'edit',
  },
  duplicateSelection: {
    id: 'editor-duplicate-selection',
    keys: 'mod+d',
    displayKeys: ['Ctrl', 'D'],
    label: '创建副本',
    group: 'edit',
  },
  moveUp: {
    id: 'editor-move-up',
    keys: 'mod+[',
    displayKeys: ['Ctrl', '['],
    label: '上移',
    group: 'edit',
  },
  moveDown: {
    id: 'editor-move-down',
    keys: 'mod+]',
    displayKeys: ['Ctrl', ']'],
    label: '下移',
    group: 'edit',
  },
  temporaryPan: {
    id: 'editor-temporary-pan',
    keys: ' ',
    displayKeys: ['Space'],
    label: '临时手型（按住）',
    group: 'view',
  },
  middleMousePan: {
    id: 'editor-middle-mouse-pan',
    keys: 'mouse-middle',
    displayKeys: ['中键拖拽'],
    label: '临时手型',
    group: 'view',
  },
  save: {
    id: 'editor-save',
    keys: 'mod+s',
    displayKeys: ['Ctrl', 'S'],
    label: '保存并留在当前页',
    group: 'business',
  },
  saveAndBack: {
    id: 'editor-save-and-back',
    keys: 'mod+enter',
    displayKeys: ['Ctrl', 'Enter'],
    label: '保存并返回',
    group: 'business',
  },
  /*
    公共交通导视：这些键位由 MetroWayfindingEditor / 宿主已有的监听器处理，
    这里只登记目录供帮助面板展示，避免与编辑器的全局监听重复触发。
  */
  wayfindingDuplicateElement: {
    id: 'wayfinding-duplicate-element',
    keys: 'alt+c',
    displayKeys: ['Alt', 'C'],
    label: '创建元素副本',
    group: 'business',
  },
  wayfindingMoveElement: {
    id: 'wayfinding-move-element',
    keys: 'alt+arrowleft',
    displayKeys: ['Alt', '↑↓←→'],
    label: '行内上移 / 下移元素',
    group: 'business',
  },
  wayfindingReverse: {
    id: 'wayfinding-reverse',
    keys: 'alt+r',
    displayKeys: ['Alt', 'R'],
    label: '反转元素顺序',
    group: 'business',
  },
  wayfindingSwitchRow: {
    id: 'wayfinding-switch-row',
    keys: 'mod+arrowdown',
    displayKeys: ['Ctrl', '↑ / ↓'],
    label: '切换导视牌行',
    group: 'business',
  },
  wayfindingTemplateLibrary: {
    id: 'wayfinding-template-library',
    keys: 'alt+o',
    displayKeys: ['Alt', 'O'],
    label: '打开模板库',
    group: 'business',
  },
  wayfindingSwitchStyle: {
    id: 'wayfinding-switch-style',
    keys: '[',
    displayKeys: ['[ / ]'],
    label: '切换版式样式',
    group: 'business',
  },
  wayfindingSwitchSource: {
    id: 'wayfinding-switch-source',
    keys: 'alt+m',
    displayKeys: ['Alt', 'M'],
    label: '切换数据来源',
    group: 'business',
  },
  wayfindingExportProject: {
    id: 'wayfinding-export-project',
    keys: 'mod+shift+e',
    displayKeys: ['Ctrl', 'Shift', 'E'],
    label: '导出工程文件',
    group: 'business',
  },
  canvasFit: {
    id: 'editor-canvas-fit',
    keys: 'mod+0',
    displayKeys: ['Ctrl', '0'],
    label: '适配画布',
    group: 'view',
  },
} as const satisfies Record<string, EditorShortcutDescriptor>;

/** 公共交通导视工作台已实现的快捷键；画布内联编辑不额外占用键位。 */
export const METRO_WAYFINDING_SHORTCUT_IDS = [
  'undo',
  'redo',
  'deleteSelection',
  'wayfindingDuplicateElement',
  'wayfindingMoveElement',
  'wayfindingReverse',
  'wayfindingSwitchRow',
  'wayfindingTemplateLibrary',
  'wayfindingSwitchStyle',
  'wayfindingSwitchSource',
  'wayfindingExportProject',
  'temporaryPan',
  'middleMousePan',
  'canvasFit',
  'save',
  'saveAndBack',
] as const satisfies ReadonlyArray<keyof typeof EDITOR_SHORTCUT_CATALOG>;

/** POI 简介工作台已实现的快捷键；简介与链接在预览卡内联编辑，不额外占用键位。 */
export const POI_INTRO_SHORTCUT_IDS = ['save', 'saveAndBack'] as const satisfies ReadonlyArray<
  keyof typeof EDITOR_SHORTCUT_CATALOG
>;

/** 运营消息工作台已实现的快捷键；块结构操作只在选中块后生效。 */
export const MARKDOWN_EDITOR_SHORTCUT_IDS = [
  'duplicateSelection',
  'moveUp',
  'moveDown',
  'deleteSelection',
  'save',
  'saveAndBack',
] as const satisfies ReadonlyArray<keyof typeof EDITOR_SHORTCUT_CATALOG>;

/** POI 几何工作台当前已实现的快捷键，帮助面板只展示这一份清单。 */
export const POI_GEOMETRY_SHORTCUT_IDS = [
  'toolPan',
  'toolSelect',
  'toolDraw',
  'temporaryPan',
  'middleMousePan',
  'insertPrepend',
  'insertAppend',
  'insertNearest',
  'duplicateSelection',
  'moveUp',
  'moveDown',
  'deleteSelection',
  'save',
  'saveAndBack',
] as const satisfies ReadonlyArray<keyof typeof EDITOR_SHORTCUT_CATALOG>;

/** 区划编辑工作台已实现的快捷键，帮助面板只展示这一份清单。 */
export const AREA_EDITOR_SHORTCUT_IDS = [
  'toolSelect',
  'toolPan',
  'toolDraw',
  'temporaryPan',
  'middleMousePan',
  'insertPrepend',
  'insertAppend',
  'insertNearest',
  'duplicateSelection',
  'moveUp',
  'moveDown',
  'deleteSelection',
  'save',
  'saveAndBack',
] as const satisfies ReadonlyArray<keyof typeof EDITOR_SHORTCUT_CATALOG>;

/** 线路走向工作台已实现的快捷键，帮助面板只展示这一份清单。 */
export const LINE_EDITOR_SHORTCUT_IDS = [
  'toolSelect',
  'toolPan',
  'toolMove',
  'toolStation',
  'toolWaypoint',
  'swapStationTool',
  'toggleSnap',
  'insertPrepend',
  'insertAppend',
  'insertNearest',
  'undo',
  'redo',
  'duplicateSelection',
  'moveUp',
  'moveDown',
  'deleteSelection',
  'save',
  'saveAndBack',
] as const satisfies ReadonlyArray<keyof typeof EDITOR_SHORTCUT_CATALOG>;

/** 班次运行图工作台已实现的快捷键，帮助面板只展示这一份清单。 */
export const TRIP_WORKBENCH_SHORTCUT_IDS = [
  'toolSelect',
  'toolPan',
  'tripToolDraw',
  'tripToolMove',
  'tripToolPanDigit',
  'tripToolMoveDigit',
  'tripToolDrawDigit',
  'tripStationZoom',
  'undo',
  'redo',
  'redoY',
  'duplicateSelection',
  'moveUp',
  'moveDown',
  'deleteSelection',
  'save',
  'saveAndBack',
] as const satisfies ReadonlyArray<keyof typeof EDITOR_SHORTCUT_CATALOG>;

export const EDITOR_SHORTCUT_GROUPS: ReadonlyArray<{
  id: EditorShortcutGroup;
  label: string;
}> = [
  { id: 'tool', label: '工具' },
  { id: 'edit', label: '编辑' },
  { id: 'view', label: '视图' },
  { id: 'business', label: '业务' },
];
