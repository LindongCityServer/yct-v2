/**
 * NaL 设计文件格式（`schemaVersion: 2`）的解析与校验。
 *
 * ## 为什么单独成文件
 * NaL 的 v2 格式是**跨工具共用**的：导向标志（`nalvitool`）、墙面标志（`nalwall`）、
 * 站名站牌（`nalstasign`）都用同一套信封与元素模型（见 NaL 仓库的
 * `docs/json-format-v2.md` / `core/design-format.js`）。因此这里只做
 * 「JSON → 强类型结构 + 中文报错」的纯函数解析，不依赖 DOM、不依赖任何 YCT 模板，
 * 后续其它模板（例如站台站名标志）要复用时直接 import 即可。
 *
 * ## 与 v1 的分工
 * v1（`layers` + `definitions`）的语义大量依赖素材号与 `definitions` 文本定义，
 * 转换逻辑仍留在 `metro-wayfinding-import.ts`；本文件只负责 v2。调用方先用
 * `readNalDesignToolType` / `readNalDesignSchemaVersion` 判断版本，再决定走哪条链路。
 *
 * ## 校验口径
 * - 枚举值、颜色、素材文件名、布尔值严格按 v2 文档校验，出错时**收集全部问题**
 *   并抛出 `NalDesignFormatError`，信息形如
 *   `boards[0].rows[1].groups[0].elements[3]：素材文件名无效`（对应文档 §6）。
 * - 文档约定「可选字段取默认值时不写出」，因此除画板 / 分组 / 元素列表外，
 *   缺省字段一律取默认值，不视为错误。
 */

export const NAL_DESIGN_SCHEMA_VERSION = 2;

export type NalDesignToolType = 'nalvitool' | 'nalwall' | 'nalstasign';
export type NalDesignTool = 'vitool' | 'wall' | 'stasign';

const NAL_DESIGN_TOOL_BY_TYPE: Record<NalDesignToolType, NalDesignTool> = {
  nalvitool: 'vitool',
  nalwall: 'wall',
  nalstasign: 'stasign',
};

/** 导入预览里展示的来源名称（与 v1 的 `NaL 导向标志设计器` 保持同一措辞）。 */
export const NAL_DESIGN_TOOL_LABELS: Record<NalDesignTool, string> = {
  vitool: 'NaL 导向标志设计器',
  wall: 'NaL 墙面标志设计器',
  stasign: 'NaL 站名站牌设计器',
};

export interface NalDesignIssue {
  /** JSON 内的位置，如 `boards[0].rows[1].groups[0].elements[3]`。 */
  path: string;
  message: string;
}

/** v2 校验失败：`issues` 是全部可定位的问题，`message` 是可直接展示的多行文本。 */
export class NalDesignFormatError extends Error {
  readonly issues: readonly NalDesignIssue[];

  constructor(fileName: string, issues: readonly NalDesignIssue[]) {
    super(describeNalDesignIssues(fileName, issues));
    this.name = 'NalDesignFormatError';
    this.issues = issues;
  }
}

function describeNalDesignIssues(fileName: string, issues: readonly NalDesignIssue[]): string {
  const head = `${fileName} 不是有效的 NaL v2 设计文件`;
  if (!issues.length) return head;
  const visible = issues.slice(0, 8).map((issue) => `- ${issue.path}：${issue.message}`);
  const rest =
    issues.length > visible.length ? [`- ……其余 ${issues.length - visible.length} 处`] : [];
  return [head, ...visible, ...rest].join('\n');
}

/** 供调用方判断「这是不是 NaL 工具的导出」。未知的 `nal*` 类型由调用方给出提示。 */
export function readNalDesignToolType(value: unknown): NalDesignToolType | undefined {
  if (!isObject(value) || typeof value.type !== 'string') return undefined;
  return isNalDesignToolType(value.type) ? value.type : undefined;
}

export function isNalDesignToolType(type: string): type is NalDesignToolType {
  return Object.prototype.hasOwnProperty.call(NAL_DESIGN_TOOL_BY_TYPE, type);
}

/** 读取 `schemaVersion`；缺省 / 非整数返回 `undefined`（调用方按 v1 处理）。 */
export function readNalDesignSchemaVersion(value: unknown): number | undefined {
  if (!isObject(value)) return undefined;
  return Number.isInteger(value.schemaVersion) ? (value.schemaVersion as number) : undefined;
}

/**
 * 版本闸门：`schemaVersion > 2` 的文件必须整体拒绝并提示升级（文档 §1），
 * 返回读取到的版本号（缺省为 `undefined`，即 v1）。
 */
export function assertNalDesignVersionSupported(
  fileName: string,
  value: unknown,
): number | undefined {
  const version = readNalDesignSchemaVersion(value);
  if (version !== undefined && version > NAL_DESIGN_SCHEMA_VERSION) {
    throw new Error(
      `${fileName} 使用了 NaL 格式 v${version}，当前只支持到 v${NAL_DESIGN_SCHEMA_VERSION}，请升级本工具后再导入。`,
    );
  }
  return version;
}

// ---------------------------------------------------------------------------
// 元素模型
// ---------------------------------------------------------------------------

export type NalDesignTransformAxis = 'horizontal' | 'vertical';

export interface NalDesignTransform {
  flipH?: boolean;
  flipV?: boolean;
  rotate?: 90 | 180 | 270;
}

export type NalTextLayout = 'single' | 'A' | 'C';
export type NalTextAlign = 'start' | 'middle' | 'end';
export type NalGroupAlign = 'left' | 'center' | 'right' | 'equidistant';
export type NalTintContent = 'light' | 'dark';

export interface NalDesignElementCommon {
  transform?: NalDesignTransform;
}

export interface NalDesignAssetElement extends NalDesignElementCommon {
  kind: 'asset';
  file: string;
}

export interface NalDesignTextElement extends NalDesignElementCommon {
  kind: 'text';
  layout: NalTextLayout;
  align: NalTextAlign;
  cn: string[];
  en: string[];
}

export interface NalDesignRibbonTextElement extends NalDesignElementCommon {
  kind: 'ribbonText';
  cn: string;
  en: string;
  align: NalTextAlign;
  color?: string;
}

export interface NalDesignExitElement extends NalDesignElementCommon {
  kind: 'exit';
  base: string;
  color?: string;
}

export interface NalDesignTintedElement extends NalDesignElementCommon {
  kind: 'tinted';
  base: string;
  color?: string;
  content?: NalTintContent;
}

export interface NalDesignLineBadgeElement extends NalDesignElementCommon {
  kind: 'lineBadge';
  cn: string;
  en: string;
  color?: string;
  content?: NalTintContent;
  asset?: string;
}

export type NalDesignColumnLayout =
  'equal' | 'top-wide' | 'bottom-wide' | 'single-ribbon' | 'single-center' | 'single-bottom';

export interface NalDesignColumnElement extends NalDesignElementCommon {
  kind: 'column';
  layout: NalDesignColumnLayout;
  align: Exclude<NalGroupAlign, 'equidistant'>;
  top: NalDesignElement[];
  bottom: NalDesignElement[];
}

export interface NalDesignCustomSvgElement extends NalDesignElementCommon {
  kind: 'customSvg';
  asset: string;
}

export type NalDesignElement =
  | NalDesignAssetElement
  | NalDesignTextElement
  | NalDesignRibbonTextElement
  | NalDesignExitElement
  | NalDesignTintedElement
  | NalDesignLineBadgeElement
  | NalDesignColumnElement
  | NalDesignCustomSvgElement;

export interface NalDesignAssetSnapshot {
  mime: string;
  content: string;
}

// ---------------------------------------------------------------------------
// 文档模型
// ---------------------------------------------------------------------------

export type NalDesignTheme = 'A' | 'B' | 'C' | 'D';

export interface NalDesignCanvas {
  /** 层数 `1` / `2`。 */
  rows: 1 | 2;
  /** 长度倍数；`null` 表示自动尺寸。 */
  length: number | null;
}

export interface NalDesignGroup {
  align: NalGroupAlign;
  elements: NalDesignElement[];
}

export interface NalDesignRow {
  groups: NalDesignGroup[];
}

export interface NalDesignBoard {
  rows: NalDesignRow[];
}

export interface NalDesignVitoolDocument {
  kind: 'vitool';
  schemaVersion: 2;
  theme: NalDesignTheme;
  canvas: NalDesignCanvas;
  grouping: boolean;
  boards: NalDesignBoard[];
  assets: Record<string, NalDesignAssetSnapshot>;
}

export type NalDesignWallSize = 'long' | 'short' | 'short_colored';
export type NalDesignWallAlign = 'left' | 'center' | 'right';
export type NalDesignWallLayerScale = 1 | 2 | 3;
export type NalDesignWallBottomScale = 1 | 2;

export interface NalDesignWallLayer {
  scale: NalDesignWallLayerScale;
  align: NalDesignWallAlign | 'auto';
  elements: NalDesignElement[];
}

export interface NalDesignWallColors {
  primary: string;
  secondary: string;
}

export interface NalDesignWallBoard {
  colors: NalDesignWallColors;
  align: NalDesignWallAlign;
  top: NalDesignElement[];
  middle: { layers: NalDesignWallLayer[] };
  bottom: { scale: NalDesignWallBottomScale; elements: NalDesignElement[] };
}

export interface NalDesignWallDocument {
  kind: 'wall';
  schemaVersion: 2;
  size: NalDesignWallSize;
  boards: NalDesignWallBoard[];
  assets: Record<string, NalDesignAssetSnapshot>;
}

export interface NalDesignStasignDocument {
  kind: 'stasign';
  schemaVersion: number;
  design: string;
  state: Record<string, string | boolean>;
  zoom?: number;
}

export type NalDesignDocument =
  NalDesignVitoolDocument | NalDesignWallDocument | NalDesignStasignDocument;

// ---------------------------------------------------------------------------
// 解析上下文
// ---------------------------------------------------------------------------

interface NalDesignContext {
  assets: Record<string, NalDesignAssetSnapshot>;
  issues: NalDesignIssue[];
}

function createContext(): NalDesignContext {
  return { assets: {}, issues: [] };
}

function report(context: NalDesignContext, path: string, message: string): void {
  // 一份文件里同一类错误可能成百上千，截断到 40 条足以定位，避免弹窗爆掉。
  if (context.issues.length >= 40) return;
  context.issues.push({ path, message });
}

function throwIfInvalid(fileName: string, context: NalDesignContext): void {
  if (context.issues.length) throw new NalDesignFormatError(fileName, context.issues);
}

const NAL_TEXT_LAYOUT_ROWS: Record<NalTextLayout, { cn: number; en: number }> = {
  single: { cn: 1, en: 1 },
  A: { cn: 1, en: 2 },
  C: { cn: 2, en: 2 },
};

const NAL_CANVAS_LENGTHS = new Set([4, 5, 6, 7, 8, 9, 10, 12]);
const NAL_COLUMN_LAYOUTS = new Set<NalDesignColumnLayout>([
  'equal',
  'top-wide',
  'bottom-wide',
  'single-ribbon',
  'single-center',
  'single-bottom',
]);
const NAL_SINGLE_COLUMN_LAYOUTS = new Set<NalDesignColumnLayout>([
  'single-ribbon',
  'single-center',
  'single-bottom',
]);
const NAL_DESIGN_MAX_COLUMN_DEPTH = 6;

// ---------------------------------------------------------------------------
// vitool
// ---------------------------------------------------------------------------

/** 解析 `nalvitool` 的 v2 文档。 */
export function parseNalVitoolDesignV2(value: unknown, fileName: string): NalDesignVitoolDocument {
  if (!isObject(value)) throw new NalDesignFormatError(fileName, []);
  const context = createContext();
  context.assets = parseNalDesignAssets(value.assets, context);
  const theme = parseTheme(value.theme, context);
  const canvas = parseCanvas(value.canvas, context);
  const grouping = parseBoolean(value.grouping, 'grouping', context) ?? false;
  const boards = parseVitoolBoards(value.boards, context);
  throwIfInvalid(fileName, context);
  return {
    kind: 'vitool',
    schemaVersion: NAL_DESIGN_SCHEMA_VERSION,
    theme,
    canvas,
    grouping,
    boards,
    assets: context.assets,
  };
}

function parseTheme(value: unknown, context: NalDesignContext): NalDesignTheme {
  if (value === undefined) return 'A';
  if (value === 'A' || value === 'B' || value === 'C' || value === 'D') return value;
  report(context, 'theme', '配色模式必须是 A / B / C / D');
  return 'A';
}

function parseCanvas(value: unknown, context: NalDesignContext): NalDesignCanvas {
  if (value === undefined) return { rows: 1, length: null };
  if (!isObject(value)) {
    report(context, 'canvas', '画布尺寸必须是对象');
    return { rows: 1, length: null };
  }
  let rows: 1 | 2 = 1;
  if (value.rows !== undefined) {
    if (value.rows === 1 || value.rows === 2) rows = value.rows;
    else report(context, 'canvas.rows', '层数必须是 1 或 2');
  }
  let length: number | null = null;
  if (value.length === null) {
    length = null;
  } else if (value.length !== undefined) {
    if (Number.isInteger(value.length) && NAL_CANVAS_LENGTHS.has(value.length as number)) {
      length = value.length as number;
    } else {
      report(context, 'canvas.length', '长度必须是 4-12（不含 11）的整数或 null');
    }
  }
  return { rows, length };
}

function parseVitoolBoards(value: unknown, context: NalDesignContext): NalDesignBoard[] {
  if (!Array.isArray(value) || value.length === 0) {
    report(context, 'boards', '画板必须是非空数组');
    return [];
  }
  if (value.length > 2) {
    report(context, 'boards', '一个文件最多包含 2 个画板');
  }
  return value.slice(0, 2).flatMap((rawBoard, boardIndex) => {
    const boardPath = `boards[${boardIndex}]`;
    if (!isObject(rawBoard)) {
      report(context, boardPath, '画板必须是对象');
      return [];
    }
    if (!Array.isArray(rawBoard.rows)) {
      report(context, `${boardPath}.rows`, '层必须是数组');
      return [];
    }
    const rows = rawBoard.rows.map((rawRow, rowIndex) =>
      parseVitoolRow(rawRow, `${boardPath}.rows[${rowIndex}]`, context),
    );
    return [{ rows }];
  });
}

function parseVitoolRow(value: unknown, path: string, context: NalDesignContext): NalDesignRow {
  if (!isObject(value)) {
    report(context, path, '层必须是对象');
    return { groups: [] };
  }
  if (value.groups === undefined) return { groups: [] };
  if (!Array.isArray(value.groups)) {
    report(context, `${path}.groups`, '分组必须是数组');
    return { groups: [] };
  }
  return {
    groups: value.groups.map((rawGroup, groupIndex) =>
      parseVitoolGroup(rawGroup, `${path}.groups[${groupIndex}]`, context),
    ),
  };
}

function parseVitoolGroup(value: unknown, path: string, context: NalDesignContext): NalDesignGroup {
  if (!isObject(value)) {
    report(context, path, '分组必须是对象');
    return { align: 'left', elements: [] };
  }
  const align = parseGroupAlign(value.align, `${path}.align`, context) ?? 'left';
  return { align, elements: parseElements(value.elements, `${path}.elements`, context) };
}

// ---------------------------------------------------------------------------
// wall
// ---------------------------------------------------------------------------

/** 解析 `nalwall` 的 v2 文档。 */
export function parseNalWallDesignV2(value: unknown, fileName: string): NalDesignWallDocument {
  if (!isObject(value)) throw new NalDesignFormatError(fileName, []);
  const context = createContext();
  context.assets = parseNalDesignAssets(value.assets, context);
  const size = parseWallSize(value.size, context);
  const boards = parseWallBoards(value.boards, context);
  throwIfInvalid(fileName, context);
  return {
    kind: 'wall',
    schemaVersion: NAL_DESIGN_SCHEMA_VERSION,
    size,
    boards,
    assets: context.assets,
  };
}

function parseWallSize(value: unknown, context: NalDesignContext): NalDesignWallSize {
  if (value === undefined) return 'long';
  if (value === 'long' || value === 'short' || value === 'short_colored') return value;
  report(context, 'size', '牌体规格必须是 long / short / short_colored');
  return 'long';
}

function parseWallBoards(value: unknown, context: NalDesignContext): NalDesignWallBoard[] {
  if (!Array.isArray(value) || value.length === 0) {
    report(context, 'boards', '模块组必须是非空数组');
    return [];
  }
  if (value.length > 2) report(context, 'boards', '一个文件最多包含 2 组模块');
  return value.slice(0, 2).flatMap((rawBoard, boardIndex) => {
    const boardPath = `boards[${boardIndex}]`;
    if (!isObject(rawBoard)) {
      report(context, boardPath, '模块组必须是对象');
      return [];
    }
    const colors = parseWallColors(rawBoard.colors, `${boardPath}.colors`, context);
    const align = parseWallAlign(rawBoard.align, `${boardPath}.align`, context) ?? 'left';
    const top = parseWallModuleElements(rawBoard.top, `${boardPath}.top`, context);
    const layers = parseWallLayers(rawBoard.middle, `${boardPath}.middle`, context);
    const bottom = parseWallBottom(rawBoard.bottom, `${boardPath}.bottom`, context);
    return [{ colors, align, top, middle: { layers }, bottom }];
  });
}

function parseWallColors(
  value: unknown,
  path: string,
  context: NalDesignContext,
): NalDesignWallColors {
  if (!isObject(value)) {
    report(context, path, '缺少模块配色');
    return { primary: '#0C2F54', secondary: '#1D5784' };
  }
  return {
    primary: parseColor(value.primary, `${path}.primary`, context) ?? '#0C2F54',
    secondary: parseColor(value.secondary, `${path}.secondary`, context) ?? '#1D5784',
  };
}

function parseWallAlign(
  value: unknown,
  path: string,
  context: NalDesignContext,
): NalDesignWallAlign | undefined {
  if (value === undefined) return undefined;
  if (value === 'left' || value === 'center' || value === 'right') return value;
  report(context, path, '对齐方式必须是 left / center / right');
  return undefined;
}

function parseWallModuleElements(
  value: unknown,
  path: string,
  context: NalDesignContext,
): NalDesignElement[] {
  if (value === undefined) return [];
  if (!isObject(value)) {
    report(context, path, '模块必须是对象');
    return [];
  }
  return parseElements(value.elements, `${path}.elements`, context);
}

function parseWallLayers(
  value: unknown,
  path: string,
  context: NalDesignContext,
): NalDesignWallLayer[] {
  if (value === undefined) return [];
  if (!isObject(value)) {
    report(context, path, '中部模块必须是对象');
    return [];
  }
  if (!Array.isArray(value.layers)) {
    report(context, `${path}.layers`, '层级必须是数组');
    return [];
  }
  if (value.layers.length > 5) report(context, `${path}.layers`, '中部模块最多 5 层');
  return value.layers.slice(0, 5).flatMap((rawLayer, layerIndex) => {
    const layerPath = `${path}.layers[${layerIndex}]`;
    if (!isObject(rawLayer)) {
      report(context, layerPath, '层级必须是对象');
      return [];
    }
    let scale: NalDesignWallLayerScale = 1;
    if (rawLayer.scale !== undefined) {
      if (rawLayer.scale === 1 || rawLayer.scale === 2 || rawLayer.scale === 3) {
        scale = rawLayer.scale;
      } else {
        report(context, `${layerPath}.scale`, '层级缩放必须是 1 / 2 / 3');
      }
    }
    let align: NalDesignWallAlign | 'auto' = 'auto';
    if (rawLayer.align !== undefined) {
      if (rawLayer.align === 'auto') {
        align = 'auto';
      } else {
        align = parseWallAlign(rawLayer.align, `${layerPath}.align`, context) ?? 'auto';
      }
    }
    return [
      {
        scale,
        align,
        elements: parseElements(rawLayer.elements, `${layerPath}.elements`, context),
      },
    ];
  });
}

function parseWallBottom(
  value: unknown,
  path: string,
  context: NalDesignContext,
): { scale: NalDesignWallBottomScale; elements: NalDesignElement[] } {
  if (value === undefined) return { scale: 1, elements: [] };
  if (!isObject(value)) {
    report(context, path, '底部模块必须是对象');
    return { scale: 1, elements: [] };
  }
  let scale: NalDesignWallBottomScale = 1;
  if (value.scale !== undefined) {
    if (value.scale === 1 || value.scale === 2) {
      scale = value.scale;
    } else {
      report(context, `${path}.scale`, '底部缩放必须是 1 / 2');
    }
  }
  return { scale, elements: parseElements(value.elements, `${path}.elements`, context) };
}

// ---------------------------------------------------------------------------
// stasign
// ---------------------------------------------------------------------------

/**
 * 解析 `nalstasign`：v2 与 v1（`version: 1` / 只有 `state` 的配置）结构一致，
 * 都是「设计模板 ID + 与 URL 参数同名的 state」，因此共用一条解析路径。
 */
export function parseNalStasignDesign(value: unknown, fileName: string): NalDesignStasignDocument {
  if (!isObject(value)) throw new NalDesignFormatError(fileName, []);
  const context = createContext();
  const schemaVersion = readNalDesignSchemaVersion(value) ?? 1;
  const design = typeof value.design === 'string' ? value.design.trim() : '';
  if (!design) report(context, 'design', '缺少站牌设计模板 ID');
  const state = parseStasignState(value.state, context);
  let zoom: number | undefined;
  if (isObject(value.view) && value.view.zoom !== undefined) {
    if (
      typeof value.view.zoom === 'number' &&
      Number.isFinite(value.view.zoom) &&
      value.view.zoom > 0
    ) {
      zoom = value.view.zoom;
    } else {
      report(context, 'view.zoom', '画布缩放必须是正数');
    }
  }
  throwIfInvalid(fileName, context);
  return { kind: 'stasign', schemaVersion, design, state, ...(zoom === undefined ? {} : { zoom }) };
}

function parseStasignState(
  value: unknown,
  context: NalDesignContext,
): Record<string, string | boolean> {
  if (value === undefined) {
    report(context, 'state', '缺少站牌参数');
    return {};
  }
  if (!isObject(value)) {
    report(context, 'state', '站牌参数必须是对象');
    return {};
  }
  const state: Record<string, string | boolean> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === 'string' || typeof raw === 'boolean') {
      state[key] = raw;
      continue;
    }
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      // URL 参数天然是字符串；数字是合法的书写方式，转成字符串即可。
      state[key] = String(raw);
      continue;
    }
    if (raw === null || raw === undefined) continue;
    report(context, `state.${key}`, '参数值必须是字符串或布尔值');
  }
  return state;
}

// ---------------------------------------------------------------------------
// 公共字段
// ---------------------------------------------------------------------------

function parseNalDesignAssets(
  value: unknown,
  context: NalDesignContext,
): Record<string, NalDesignAssetSnapshot> {
  if (value === undefined) return {};
  if (!isObject(value)) {
    report(context, 'assets', '素材快照表必须是对象');
    return {};
  }
  const assets: Record<string, NalDesignAssetSnapshot> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!isObject(raw)) {
      report(context, `assets.${key}`, '素材快照必须是对象');
      continue;
    }
    const content = typeof raw.content === 'string' ? raw.content : '';
    if (!content) {
      report(context, `assets.${key}.content`, '素材快照缺少 SVG 内容');
      continue;
    }
    const mime = typeof raw.mime === 'string' && raw.mime ? raw.mime : 'image/svg+xml';
    assets[key] = { mime, content };
  }
  return assets;
}

function parseElements(
  value: unknown,
  path: string,
  context: NalDesignContext,
  depth = 0,
): NalDesignElement[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    report(context, path, '元素必须是数组');
    return [];
  }
  return value.flatMap((raw, index) => {
    const element = parseElement(raw, `${path}[${index}]`, context, depth);
    return element ? [element] : [];
  });
}

function parseElement(
  value: unknown,
  path: string,
  context: NalDesignContext,
  depth: number,
): NalDesignElement | undefined {
  if (!isObject(value)) {
    report(context, path, '元素必须是对象');
    return undefined;
  }
  const kind = value.kind;
  if (typeof kind !== 'string') {
    report(context, `${path}.kind`, '缺少元素类型');
    return undefined;
  }
  const transform = parseTransform(value.transform, `${path}.transform`, context);
  const common = transform ? { transform } : {};
  switch (kind) {
    case 'asset': {
      const file = parseAssetFileName(value.file, `${path}.file`, context);
      return file ? { kind, file, ...common } : undefined;
    }
    case 'text': {
      const layout = parseTextLayout(value.layout, `${path}.layout`, context);
      const align = parseTextAlign(value.align, `${path}.align`, context);
      const allowed = NAL_TEXT_LAYOUT_ROWS[layout];
      return {
        kind,
        layout,
        align,
        cn: parseTextLines(value.cn, `${path}.cn`, allowed.cn, context),
        en: parseTextLines(value.en, `${path}.en`, allowed.en, context),
        ...common,
      };
    }
    case 'ribbonText': {
      return {
        kind,
        cn: readNalTextValue(value.cn),
        en: readNalTextValue(value.en),
        align: parseTextAlign(value.align, `${path}.align`, context),
        color: parseColor(value.color, `${path}.color`, context),
        ...common,
      };
    }
    case 'exit': {
      const base = parseAssetFileName(value.base, `${path}.base`, context);
      return base
        ? {
            kind,
            base,
            color: parseColor(value.color, `${path}.color`, context),
            ...common,
          }
        : undefined;
    }
    case 'tinted': {
      const base = parseAssetFileName(value.base, `${path}.base`, context);
      return base
        ? {
            kind,
            base,
            color: parseColor(value.color, `${path}.color`, context),
            ...parseTintContent(value.content, `${path}.content`, context),
            ...common,
          }
        : undefined;
    }
    case 'lineBadge': {
      const asset = typeof value.asset === 'string' ? value.asset : undefined;
      return {
        kind,
        cn: readNalTextValue(value.cn),
        en: readNalTextValue(value.en),
        color: parseColor(value.color, `${path}.color`, context),
        ...parseTintContent(value.content, `${path}.content`, context),
        ...(asset && Object.prototype.hasOwnProperty.call(context.assets, asset) ? { asset } : {}),
        ...common,
      };
    }
    case 'column': {
      if (depth >= NAL_DESIGN_MAX_COLUMN_DEPTH) {
        report(context, path, '分栏嵌套层数过深');
        return undefined;
      }
      const layout = parseColumnLayout(value.layout, `${path}.layout`, context);
      const align = parseWallAlign(value.align, `${path}.align`, context) ?? 'left';
      return {
        kind,
        layout,
        align,
        top: parseElements(value.top, `${path}.top`, context, depth + 1),
        bottom: parseElements(value.bottom, `${path}.bottom`, context, depth + 1),
        ...common,
      };
    }
    case 'customSvg': {
      const asset = asString(value.asset).trim();
      if (!asset) {
        report(context, `${path}.asset`, '自定义 SVG 元素缺少快照键');
        return undefined;
      }
      if (!Object.prototype.hasOwnProperty.call(context.assets, asset)) {
        report(context, `${path}.asset`, `引用的 SVG 快照 ${asset} 不存在`);
        return undefined;
      }
      return { kind, asset, ...common };
    }
    default: {
      report(context, `${path}.kind`, `未知的元素类型 ${kind}`);
      return undefined;
    }
  }
}

function parseTransform(
  value: unknown,
  path: string,
  context: NalDesignContext,
): NalDesignTransform | undefined {
  if (value === undefined) return undefined;
  if (!isObject(value)) {
    report(context, path, '变换必须是对象');
    return undefined;
  }
  const transform: NalDesignTransform = {};
  const flipH = parseBoolean(value.flipH, `${path}.flipH`, context);
  const flipV = parseBoolean(value.flipV, `${path}.flipV`, context);
  if (flipH) transform.flipH = true;
  if (flipV) transform.flipV = true;
  if (value.rotate !== undefined) {
    if (value.rotate === 90 || value.rotate === 180 || value.rotate === 270) {
      transform.rotate = value.rotate;
    } else {
      report(context, `${path}.rotate`, '旋转角度必须是 90 / 180 / 270');
    }
  }
  return Object.keys(transform).length ? transform : undefined;
}

function parseBoolean(
  value: unknown,
  path: string,
  context: NalDesignContext,
): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'boolean') return value;
  report(context, path, '必须是 JSON 布尔值');
  return undefined;
}

function parseTextLayout(value: unknown, path: string, context: NalDesignContext): NalTextLayout {
  if (value === undefined) return 'single';
  if (value === 'single' || value === 'A' || value === 'C') return value;
  report(context, path, '文本框版式必须是 single / A / C');
  return 'single';
}

function parseTextAlign(value: unknown, path: string, context: NalDesignContext): NalTextAlign {
  if (value === undefined) return 'start';
  if (value === 'start' || value === 'middle' || value === 'end') return value;
  report(context, path, '文本对齐必须是 start / middle / end');
  return 'start';
}

/**
 * 读取文本框的 `cn` / `en` 行数组。
 *
 * 行数由 `layout` 决定（single = 1/1、A = 1/2、C = 2/2），多写的行截断；
 * 空字符串保留（用户可能只清空了其中一行）。非字符串项逐个报错。
 */
function parseTextLines(
  value: unknown,
  path: string,
  limit: number,
  context: NalDesignContext,
): string[] {
  if (value === undefined) return [];
  // 文档写的是字符串数组；线上偶有单字符串写法，按一行处理，不因书写形式拒绝整份文件。
  if (typeof value === 'string') return [value.slice(0, 160)];
  if (!Array.isArray(value)) {
    report(context, path, '文本行必须是数组');
    return [];
  }
  const lines: string[] = [];
  value.forEach((raw, index) => {
    if (typeof raw !== 'string') {
      report(context, `${path}[${index}]`, '文本行必须是字符串');
      return;
    }
    lines.push(raw.slice(0, 160));
  });
  return limit > 0 ? lines.slice(0, limit) : lines;
}

function parseGroupAlign(
  value: unknown,
  path: string,
  context: NalDesignContext,
): NalGroupAlign | undefined {
  if (value === undefined) return undefined;
  if (value === 'left' || value === 'center' || value === 'right' || value === 'equidistant') {
    return value;
  }
  report(context, path, '分组对齐必须是 left / center / right / equidistant');
  return undefined;
}

function parseColumnLayout(
  value: unknown,
  path: string,
  context: NalDesignContext,
): NalDesignColumnLayout {
  if (value === undefined) return 'equal';
  if (typeof value === 'string' && NAL_COLUMN_LAYOUTS.has(value as NalDesignColumnLayout)) {
    return value as NalDesignColumnLayout;
  }
  report(
    context,
    path,
    '分栏版式必须是 equal / top-wide / bottom-wide / single-ribbon / single-center / single-bottom',
  );
  return 'equal';
}

function parseTintContent(
  value: unknown,
  path: string,
  context: NalDesignContext,
): { content?: NalTintContent } {
  if (value === undefined) return {};
  if (value === 'light' || value === 'dark') return { content: value };
  report(context, path, '内容颜色必须是 light / dark');
  return {};
}

/** 素材文件名必须是**裸文件名**（不允许路径分隔符），且以 `.svg` 结尾。 */
function parseAssetFileName(
  value: unknown,
  path: string,
  context: NalDesignContext,
): string | undefined {
  const file = typeof value === 'string' ? value.trim() : '';
  if (!file || /[\\/]/u.test(file) || !/\.svg$/iu.test(file)) {
    report(context, path, '素材文件名无效');
    return undefined;
  }
  return file;
}

/** 颜色按 `#RRGGBB` 校验并统一成大写（文档约定大写，小写同样接受）。 */
function parseColor(value: unknown, path: string, context: NalDesignContext): string | undefined {
  if (value === undefined || value === '') return undefined;
  const color = typeof value === 'string' ? value.trim() : '';
  if (!/^#[0-9a-f]{6}$/iu.test(color)) {
    report(context, path, '颜色必须是 #RRGGBB');
    return undefined;
  }
  return color.toUpperCase();
}

/** `single-*` 是单层缩放（只有 `top`），其余是上下分栏。 */
export function isNalDesignSingleColumnLayout(layout: NalDesignColumnLayout): boolean {
  return NAL_SINGLE_COLUMN_LAYOUTS.has(layout);
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** 色带文本 / 线路标的文本字段：文档写字符串，也接受单元素数组。 */
function readNalTextValue(value: unknown): string {
  if (typeof value === 'string') return value.slice(0, 160);
  if (Array.isArray(value)) {
    const first = value.find((item): item is string => typeof item === 'string');
    return (first ?? '').slice(0, 160);
  }
  return '';
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
