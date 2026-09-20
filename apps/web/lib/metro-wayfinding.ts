export const METRO_WAYFINDING_TEMPLATE_ID = 'system_material_metro_wayfinding';
export const METRO_WAYFINDING_BACKGROUND = '#262626';
export const METRO_WAYFINDING_FOREGROUND = '#FFFFFF';
export const METRO_WAYFINDING_WARNING_FOREGROUND = '#E53935';
export const METRO_WAYFINDING_GAP = 16;
export const METRO_WAYFINDING_PADDING = 22;
export const METRO_WAYFINDING_HEIGHT = 128;
export const METRO_WAYFINDING_TEXT_HEIGHT = 85;
export const METRO_WAYFINDING_SECONDARY_TEXT_MAX_HEIGHT = 28;
export const METRO_WAYFINDING_DIVIDER_WIDTH = 4;
export const METRO_WAYFINDING_LARGE_TEXT_FRAMED_FONT_SIZE = 78;
export const METRO_WAYFINDING_LARGE_TEXT_UNFRAMED_FONT_SIZE = 85;
export const METRO_WAYFINDING_LARGE_TEXT_SUFFIX_FONT_SIZE = 28;
export const METRO_WAYFINDING_COMBINATION_MIN_SCALE = 0.25;
export const METRO_WAYFINDING_COMBINATION_MAX_SCALE = 1;
export const METRO_WAYFINDING_COMBINATION_DEFAULT_SCALE = 0.65;
/**
 * 组合框切入 / 切出「无填充+色带」模式时的缩放补偿系数。
 * 切入时缩放除以该系数，切出时乘以该系数还原。
 */
export const METRO_WAYFINDING_COMBINATION_STRIPE_SCALE_FACTOR = 0.65;
export const METRO_WAYFINDING_COMBINATION_MIN_WIDTH = 85;
export const METRO_WAYFINDING_COMBINATION_PADDING = 8;
export const METRO_WAYFINDING_COMBINATION_GAP = 8;
export const METRO_WAYFINDING_COMBINATION_STRIPE_WIDTH = 24;
export const METRO_WAYFINDING_COMBINATION_STRIPE_TOP = 20;
export const METRO_WAYFINDING_COMBINATION_FLEX_MIN_WIDTH = 16;
export const METRO_WAYFINDING_PROJECT_FORMAT = 'yct.metro-wayfinding.project';
export const METRO_WAYFINDING_PROJECT_SCHEMA_VERSION = 1;

export const metroWayfindingBackgroundPalette = [
  { value: '#262626', label: '深灰色' },
  { value: '#F2C94C', label: '黄色' },
  { value: '#FFFFFF', label: '白色' },
  { value: '#E5EDFF', label: '淡蓝色' },
  { value: '#4A4E54', label: '灰色' },
  { value: '#0A124D', label: '深蓝色' },
  { value: '#085E41', label: '深绿色' },
] as const;

export const metroWayfindingForegroundPalette = [
  { value: '#FFFFFF', label: '白色' },
  { value: '#F2C94C', label: '黄色' },
  { value: '#111111', label: '黑色' },
  { value: '#0A124D', label: '深蓝色' },
  { value: '#8ED8FF', label: '浅蓝色' },
  { value: METRO_WAYFINDING_WARNING_FOREGROUND, label: '警告红' },
] as const;

export type MetroWayfindingColor = string;
export type MetroWayfindingIconGroup = 'facility' | 'arrow';
export type MetroWayfindingIconDirection = 'left' | 'right' | 'up' | 'down';
// 设施图标的“变种”：同一设施的不同形态（楼梯的上 / 下 / 双向）。
// 变种与方向是两个正交维度，由面板上的两个独立分段控件分别选择。
export type MetroWayfindingIconVariant = 'two-way' | 'up' | 'down';
// 从「原始素材」得到「另一侧朝向素材」的变换方式：
// - horizontal：水平镜像，素材本身朝右，朝左时左右翻转（默认，适用于绝大多数图标）。
// - vertical：垂直镜像，素材本身朝上，朝下时上下翻转。
// 个别图标的原始素材朝向与其他图标不一致（例如下楼图形相对上楼 / 双向整体上下颠倒），
// 此时需要用垂直镜像而非水平镜像才能得到语义正确的朝向。
export type MetroWayfindingIconMirrorAxis = 'horizontal' | 'vertical';
export type MetroFacilityIconAssetName =
  // 楼梯：3 个变种（双向 / 向上 / 向下）× 2 个方向（左 / 右）。
  // 后缀 -right 表示“朝右”的原始素材；无后缀者为朝左（水平翻转后的）素材。
  | 'stairs-two-way'
  | 'stairs-two-way-right'
  | 'stairs-up'
  | 'stairs-up-right'
  | 'stairs-down'
  | 'stairs-down-right'
  | 'escalator'
  | 'escalator-and-stairs'
  | 'accessible-elevator'
  | 'restroom'
  | 'mens-restroom'
  | 'womens-restroom'
  | 'family-restroom'
  | 'accessible-restroom'
  | 'nursing-room'
  | 'wheelchair'
  | 'wheelchair-lift'
  | 'accessible-ramp'
  | 'waiting-room'
  | 'exit'
  | 'subway'
  | 'passenger-service-center'
  | 'ticket-machine'
  | 'meeting-point';
export type MetroArrowIconAssetName =
  | 'south-west'
  | 'west'
  | 'north-west'
  | 'north'
  | 'north-east'
  | 'east'
  | 'south-east'
  | 'south'
  | 'turn-left-up'
  | 'turn-left-down'
  | 'turn-right-up'
  | 'turn-right-down'
  | 'u-turn-left'
  | 'u-turn-right';

export interface MetroWayfindingIconOption {
  id: string;
  label: string;
  symbol: string;
  group: MetroWayfindingIconGroup;
  assetName?: MetroFacilityIconAssetName;
  assetNameByDirection?: Partial<Record<MetroWayfindingIconDirection, MetroFacilityIconAssetName>>;
  // 该图标支持的“变种”集合（如楼梯的双向 / 向上 / 向下）。
  // 声明后，面板会额外渲染一个“图标变种”分段控件；
  // 通过 assetNameByVariantAndDirection 解析具体素材。
  variants?: readonly MetroWayfindingIconVariant[];
  defaultVariant?: MetroWayfindingIconVariant;
  // variant → direction → 素材名。仅当图标同时有变种与方向时使用。
  assetNameByVariantAndDirection?: Partial<
    Record<
      MetroWayfindingIconVariant,
      Partial<Record<MetroWayfindingIconDirection, MetroFacilityIconAssetName>>
    >
  >;
  // 指定「朝左素材 → 朝右素材」所用的镜像轴。默认水平镜像；
  // 原始素材朝向与常规不一致的图标（如楼梯的下楼变种）声明为 vertical。
  mirrorAxis?: MetroWayfindingIconMirrorAxis;
  // variant → 该变种单独使用的镜像轴，覆盖上面的全局设置。
  mirrorAxisByVariant?: Partial<Record<MetroWayfindingIconVariant, MetroWayfindingIconMirrorAxis>>;
  defaultForegroundColor?: string;
}

export const metroWayfindingIconOptions: MetroWayfindingIconOption[] = [
  // 楼梯：变种（双向 / 向上 / 向下）与方向（向左 / 向右）拆成两个独立分段控件。
  // 默认组合为「双向 + 向左」＝ stairs-two-way。
  // 素材约定：无后缀文件为「朝左」，-right 后缀文件为「朝右」；
  // 朝右素材是朝左素材的水平镜像，翻转已烘焙进 SVG 自身，渲染管线不再叠加变换。
  {
    id: 'stairs',
    label: '楼梯',
    symbol: 'stairs',
    group: 'facility',
    assetName: 'stairs-two-way',
    variants: ['two-way', 'up', 'down'],
    defaultVariant: 'two-way',
    assetNameByVariantAndDirection: {
      'two-way': { left: 'stairs-two-way', right: 'stairs-two-way-right' },
      up: { left: 'stairs-up', right: 'stairs-up-right' },
      down: { left: 'stairs-down', right: 'stairs-down-right' },
    },
  },
  {
    id: 'escalator',
    label: '扶梯',
    symbol: 'escalator',
    group: 'facility',
    assetName: 'escalator',
    // 扶梯素材自带“向右上行”朝向，朝左由渲染管线水平镜像。
    assetNameByDirection: { left: 'escalator', right: 'escalator' },
  },
  {
    id: 'elevator',
    label: '无障碍电梯',
    symbol: 'elevator',
    group: 'facility',
    assetName: 'accessible-elevator',
  },
  {
    id: 'restroom',
    label: '卫生间',
    symbol: 'wc',
    group: 'facility',
    assetName: 'restroom',
  },
  {
    id: 'mens-restroom',
    label: '男卫生间',
    symbol: 'man',
    group: 'facility',
    assetName: 'mens-restroom',
  },
  {
    id: 'womens-restroom',
    label: '女卫生间',
    symbol: 'woman',
    group: 'facility',
    assetName: 'womens-restroom',
  },
  {
    id: 'nursing-room',
    label: '母婴室',
    symbol: 'breastfeeding',
    group: 'facility',
    assetName: 'nursing-room',
  },
  {
    id: 'family-restroom',
    label: '家庭卫生间',
    symbol: 'family_restroom',
    group: 'facility',
    assetName: 'family-restroom',
  },
  {
    // 图形为“男 + 女 + 轮椅”，语义是供轮椅 / 无障碍需求人群使用的卫生间。
    // 历史版本曾误挂“第三卫生间”名称，并占用 third-restroom 资源名，现已更正。
    id: 'accessible-restroom',
    label: '无障碍卫生间',
    symbol: 'accessible_forward',
    group: 'facility',
    assetName: 'accessible-restroom',
  },
  {
    id: 'wheelchair-lift',
    label: '轮椅升降机',
    symbol: 'elevator',
    group: 'facility',
    assetName: 'wheelchair-lift',
    // 轮椅升降机素材自带朝向，朝另一侧由渲染管线水平镜像。
    assetNameByDirection: { left: 'wheelchair-lift', right: 'wheelchair-lift' },
  },
  {
    id: 'accessible-ramp',
    label: '无障碍坡道',
    symbol: 'ramp_right',
    group: 'facility',
    assetName: 'accessible-ramp',
  },
  { id: 'police', label: '警务室', symbol: 'local_police', group: 'facility' },
  {
    id: 'waiting',
    label: '候车室',
    symbol: 'airline_seat_recline_extra',
    group: 'facility',
    assetName: 'waiting-room',
  },
  { id: 'exit', label: '出口', symbol: 'logout', group: 'facility', assetName: 'exit' },
  { id: 'subway', label: '地铁', symbol: 'subway', group: 'facility', assetName: 'subway' },
  { id: 'airplane', label: '飞机', symbol: 'flight', group: 'facility' },
  { id: 'boat', label: '轮船', symbol: 'directions_boat', group: 'facility' },
  { id: 'train', label: '火车', symbol: 'train', group: 'facility' },
  { id: 'taxi', label: '出租车', symbol: 'local_taxi', group: 'facility' },
  {
    id: 'service',
    label: '乘客服务中心',
    symbol: 'help',
    group: 'facility',
    assetName: 'passenger-service-center',
  },
  {
    id: 'ticket',
    label: '自动售票机',
    symbol: 'confirmation_number',
    group: 'facility',
    assetName: 'ticket-machine',
  },
  {
    id: 'meeting-point',
    label: '会合点',
    symbol: 'groups',
    group: 'facility',
    assetName: 'meeting-point',
  },
  {
    id: 'no-entry',
    label: '禁止进入',
    symbol: 'block',
    group: 'facility',
    defaultForegroundColor: METRO_WAYFINDING_WARNING_FOREGROUND,
  },
  {
    id: 'wheelchair',
    label: '轮椅',
    symbol: 'accessible',
    group: 'facility',
    assetName: 'wheelchair',
    // 轮椅侧影自带朝向，朝另一侧由渲染管线水平镜像。
    assetNameByDirection: { left: 'wheelchair', right: 'wheelchair' },
  },
  { id: 'south-west', label: '左下', symbol: 'south_west', group: 'arrow' },
  { id: 'west', label: '左', symbol: 'arrow_back', group: 'arrow' },
  { id: 'north-west', label: '左上', symbol: 'arrow_insert', group: 'arrow' },
  { id: 'north', label: '上', symbol: 'arrow_upward', group: 'arrow' },
  { id: 'north-east', label: '右上', symbol: 'arrow_outward', group: 'arrow' },
  { id: 'east', label: '右', symbol: 'arrow_forward', group: 'arrow' },
  { id: 'south-east', label: '右下', symbol: 'south_east', group: 'arrow' },
  { id: 'south', label: '下', symbol: 'arrow_downward', group: 'arrow' },
  { id: 'turn-left-up', label: '先左后上', symbol: 'arrow_top_right', group: 'arrow' },
  { id: 'turn-left-down', label: '先左后下', symbol: 'arrow_top_left', group: 'arrow' },
  { id: 'turn-right-up', label: '先右后上', symbol: 'arrow_top_left', group: 'arrow' },
  { id: 'turn-right-down', label: '先右后下', symbol: 'arrow_top_right', group: 'arrow' },
  { id: 'u-turn-left', label: '左掉头', symbol: 'u_turn_left', group: 'arrow' },
  { id: 'u-turn-right', label: '右掉头', symbol: 'u_turn_right', group: 'arrow' },
];

export const metroWayfindingFacilityOptions = metroWayfindingIconOptions.filter(
  (option) => option.group === 'facility',
);
export const metroWayfindingArrowOptions = metroWayfindingIconOptions.filter(
  (option) => option.group === 'arrow',
);

export type MetroWayfindingTextAlign = 'left' | 'center' | 'right';
export type MetroWayfindingTextWritingMode = 'horizontal' | 'vertical';
export type MetroWayfindingSpaceMode = 'fixed' | 'flex';

export function resolveMetroFacilityIconAssetName(
  iconId: string,
  direction?: MetroWayfindingIconDirection,
  variant?: MetroWayfindingIconVariant,
): MetroFacilityIconAssetName | undefined {
  const option = metroWayfindingIconOptions.find((item) => item.id === iconId);
  const defaultDirection = resolveMetroWayfindingFacilityDefaultDirection(iconId) ?? 'up';
  const effectiveDirection = direction ?? defaultDirection;
  // 有变种的图标（楼梯）：按「变种 × 方向」取素材，找不到再退回方向表 / 默认素材。
  const byVariant = option?.assetNameByVariantAndDirection;
  if (byVariant) {
    const effectiveVariant = variant ?? option?.defaultVariant ?? option?.variants?.[0];
    const asset = effectiveVariant ? byVariant[effectiveVariant]?.[effectiveDirection] : undefined;
    if (asset) return asset;
  }
  return option?.assetNameByDirection?.[effectiveDirection] ?? option?.assetName;
}

export function resolveMetroArrowIconAssetName(
  iconId: string,
): MetroArrowIconAssetName | undefined {
  return metroWayfindingArrowOptions.some((option) => option.id === iconId)
    ? (iconId as MetroArrowIconAssetName)
    : undefined;
}

// 图标变种选项：仅对声明了 variants 的图标（如楼梯）返回非空数组。
export function resolveMetroFacilityVariantOptions(iconId: string): MetroWayfindingIconVariant[] {
  const option = metroWayfindingIconOptions.find((item) => item.id === iconId);
  return option?.variants ? [...option.variants] : [];
}

export function resolveMetroFacilityDefaultVariant(
  iconId: string,
): MetroWayfindingIconVariant | undefined {
  const option = metroWayfindingIconOptions.find((item) => item.id === iconId);
  if (!option?.variants?.length) return undefined;
  return option.defaultVariant ?? option.variants[0];
}

export function resolveMetroFacilityVariantLabel(variant: MetroWayfindingIconVariant): string {
  return variant === 'up' ? '向上' : variant === 'down' ? '向下' : '双向';
}

// 解析「朝左素材 → 朝右素材」所用镜像轴；未声明的图标默认水平镜像。
// 楼梯是例外：它的翻转已经烘焙进 -right 素材本身（见 public/metro-facilities），
// 因此渲染时不再叠加变换，也就不会走到这里。
export function resolveMetroFacilityMirrorAxis(
  iconId: string,
  variant?: MetroWayfindingIconVariant,
): MetroWayfindingIconMirrorAxis {
  const option = metroWayfindingIconOptions.find((item) => item.id === iconId);
  if (variant && option?.mirrorAxisByVariant?.[variant]) {
    return option.mirrorAxisByVariant[variant]!;
  }
  return option?.mirrorAxis ?? 'horizontal';
}

// 把镜像轴转成 SVG 变换串，供渲染管线与面板预览共用。
export function resolveMetroFacilityMirrorTransform(
  iconId: string,
  direction: MetroWayfindingIconDirection | undefined,
  variant?: MetroWayfindingIconVariant,
): string {
  const axis = resolveMetroFacilityMirrorAxis(iconId, variant);
  return axis === 'vertical' ? 'translate(0 85) scale(1 -1)' : 'translate(85 0) scale(-1 1)';
}

// 设施图标可选方向：默认四向全集；图标声明了方向表时只暴露显式声明过的方向，
// 有变种的图标（楼梯）取所有变种方向的并集，避免出现无对应图形的方向。
export function resolveMetroFacilityDirectionOptions(
  iconId: string,
): MetroWayfindingIconDirection[] {
  const option = metroWayfindingIconOptions.find((item) => item.id === iconId);
  if (!resolveMetroWayfindingFacilityDefaultDirection(iconId)) {
    return [];
  }
  const byVariant = option?.assetNameByVariantAndDirection;
  if (byVariant) {
    return (['left', 'up', 'right', 'down'] as const).filter((direction) =>
      Object.values(byVariant).some((map) => map?.[direction] !== undefined),
    );
  }
  const byDirection = option?.assetNameByDirection;
  if (byDirection) {
    return (['left', 'up', 'right', 'down'] as const).filter(
      (direction) => byDirection[direction] !== undefined,
    );
  }
  return iconId === 'exit' ? ['left', 'up', 'right', 'down'] : ['left', 'right'];
}

export function resolveMetroFacilityDirectionLabel(
  direction: MetroWayfindingIconDirection,
): string {
  return direction === 'left'
    ? '朝左'
    : direction === 'right'
      ? '朝右'
      : direction === 'up'
        ? '向上'
        : '向下';
}

// 旧项目文件兼容：上楼 / 下楼 / 双向楼梯三选项已合并为单一“楼梯”选项。
export function migrateLegacyMetroFacilityIconId(iconId: string): string {
  if (iconId === 'stairs-down') return 'stairs';
  if (iconId === 'stairs-two-way') return 'stairs';
  // 历史版本把「男+女+轮椅」的图形误命名为“第三卫生间”并占用 third-restroom 资源名，
  // 现更正为“无障碍卫生间”（accessible-restroom）。旧工程文件按图形语义迁移，避免换图。
  if (iconId === 'third-restroom') return 'accessible-restroom';
  return iconId;
}

export function isLegacyMetroFacilityStairIconId(iconId: string): boolean {
  return iconId === 'stairs-down' || iconId === 'stairs-two-way';
}

function migrateLegacyMetroFacilityIconDirection(
  rawDirection: unknown,
  resolvedIconId: string,
): MetroWayfindingIconDirection | undefined {
  const isExplicitDirection =
    rawDirection === 'left' ||
    rawDirection === 'right' ||
    rawDirection === 'up' ||
    rawDirection === 'down';
  const direction = isExplicitDirection ? rawDirection : undefined;
  // 仅对“楼梯”生效：旧版上/下楼曾用 direction 的 up / down 表达，
  // 现在 up / down 已移交“图标变种”，方向只允许左 / 右。
  if (resolvedIconId !== 'stairs') {
    return direction;
  }
  // 旧值里的 up / down 一律作废（变种由 migrateLegacyMetroFacilityIconVariant 接管），
  // 方向回落到左（水平翻转后的图形）。
  return direction === 'right' ? 'right' : 'left';
}

// 旧图标 ID → 新版楼梯变种。
function migrateLegacyMetroFacilityIconVariant(
  rawIconId: string,
  resolvedIconId: string,
  rawDirection: unknown,
): MetroWayfindingIconVariant | undefined {
  if (resolvedIconId !== 'stairs') return undefined;
  if (rawIconId === 'stairs-down') return 'down';
  if (rawIconId === 'stairs-up') return 'up';
  if (rawIconId === 'stairs-two-way') return 'two-way';
  // 旧版 stairs 用 direction: 'up' / 'down' 表示上/下楼，需转成变种。
  if (rawIconId === 'stairs') {
    if (rawDirection === 'up') return 'up';
    if (rawDirection === 'down') return 'down';
  }
  return undefined;
}

export interface MetroWayfindingTextSegment {
  kind: 'text';
  value: string;
}

export interface MetroWayfindingLineSegment {
  kind: 'line';
  value: string;
  color: MetroWayfindingColor;
}

export interface MetroWayfindingBoxedTextSegment {
  kind: 'boxed';
  value: string;
}

export type MetroWayfindingMainSegment =
  MetroWayfindingTextSegment | MetroWayfindingLineSegment | MetroWayfindingBoxedTextSegment;

export interface MetroWayfindingMainTextRow {
  id: string;
  kind: 'main';
  segments: MetroWayfindingMainSegment[];
}

export interface MetroWayfindingSecondaryTextRow {
  id: string;
  kind: 'secondary';
  value: string;
  bold: boolean;
}

export type MetroWayfindingTextRow = MetroWayfindingMainTextRow | MetroWayfindingSecondaryTextRow;

export function hasMetroWayfindingTextRowContent(row: MetroWayfindingTextRow): boolean {
  return row.kind === 'main'
    ? row.segments.some((segment) => segment.kind !== 'text' || segment.value.trim().length > 0)
    : row.value.trim().length > 0;
}

export type MetroWayfindingFrameShape = 'none' | 'rectangle' | 'circle';
export type MetroWayfindingFrameFillMode = 'none' | 'inverse' | 'color';
export type MetroWayfindingCombinationFillMode = MetroWayfindingFrameFillMode | 'stripe';
export type MetroWayfindingCombinationStripePosition = 'left' | 'right' | 'bottom';

export interface MetroWayfindingFacilityElement {
  id: string;
  type: 'facility';
  iconId: string;
  direction?: MetroWayfindingIconDirection;
  // 仅对有变种的图标（如楼梯：双向 / 向上 / 向下）有意义。
  variant?: MetroWayfindingIconVariant;
  frameShape: MetroWayfindingFrameShape;
  frameFillMode: MetroWayfindingFrameFillMode;
  frameFillColor?: MetroWayfindingColor;
  frameStroke: boolean;
  backgroundColor?: MetroWayfindingColor;
  foregroundColor?: MetroWayfindingColor;
}

export interface MetroWayfindingArrowElement {
  id: string;
  type: 'arrow';
  iconId: string;
  framed: boolean;
  frameFillMode: MetroWayfindingFrameFillMode;
  frameFillColor?: MetroWayfindingColor;
  frameStroke: boolean;
  backgroundColor?: MetroWayfindingColor;
  foregroundColor?: MetroWayfindingColor;
}

export interface MetroWayfindingTextElement {
  id: string;
  type: 'text';
  align: MetroWayfindingTextAlign;
  writingMode: MetroWayfindingTextWritingMode;
  rows: MetroWayfindingTextRow[];
  backgroundColor?: MetroWayfindingColor;
  foregroundColor?: MetroWayfindingColor;
}

export interface MetroWayfindingTextMetrics {
  mainFontSize: number;
  secondaryFontSize: number;
  spacing: number;
  contentHeight: number;
}

/**
 * 大文本里**任意位置**的下角标（`oth@two` 这类角标素材、或用户手动插入）。
 * `at` 以 `value` 的**码点下标**计：0 = 正文开头，码点数 = 正文末尾。
 */
export interface MetroWayfindingLargeTextSuffix {
  at: number;
  value: string;
}

/** 大文本切成的片段序列：正文块与下角标交替，供渲染 / 宽度估算 / 编辑 UI 使用。 */
export interface MetroWayfindingLargeTextRun {
  kind: 'text' | 'suffix';
  value: string;
}

export interface MetroWayfindingLargeTextElement {
  id: string;
  type: 'largeText';
  value: string;
  /** 仅作**旧存档兜底**：恒等于「末尾」那一个下角标。新数据一律写 `suffixes`。 */
  suffix: string;
  /**
   * 任意位置的下角标列表，按 `at` 升序。
   * 读取**必须**走 `resolveMetroLargeTextSuffixes`——它会把 legacy `suffix`
   * 兜底成末尾一项，并做排序 / 越界收敛。直接读 `element.suffix` 会丢掉中间角标。
   */
  suffixes?: MetroWayfindingLargeTextSuffix[];
  frameShape: MetroWayfindingFrameShape;
  frameFillMode: MetroWayfindingFrameFillMode;
  frameFillColor?: MetroWayfindingColor;
  frameStroke: boolean;
  backgroundColor?: MetroWayfindingColor;
  foregroundColor?: MetroWayfindingColor;
}

export interface MetroWayfindingSpaceElement {
  id: string;
  type: 'space';
  mode: MetroWayfindingSpaceMode;
  units: number;
  backgroundColor?: MetroWayfindingColor;
  foregroundColor?: MetroWayfindingColor;
}

export interface MetroWayfindingDividerElement {
  id: string;
  type: 'divider';
  backgroundColor?: MetroWayfindingColor;
  foregroundColor?: MetroWayfindingColor;
}

export type MetroWayfindingCombinationChild =
  | MetroWayfindingFacilityElement
  | MetroWayfindingArrowElement
  | MetroWayfindingTextElement
  | MetroWayfindingLargeTextElement
  | MetroWayfindingSpaceElement;

export interface MetroWayfindingCombinationElement {
  id: string;
  type: 'combination';
  scale: number;
  children: MetroWayfindingCombinationChild[];
  frameFillMode: MetroWayfindingCombinationFillMode;
  frameFillColor?: MetroWayfindingColor;
  frameStroke: boolean;
  stripePosition: MetroWayfindingCombinationStripePosition;
  backgroundColor?: MetroWayfindingColor;
  foregroundColor?: MetroWayfindingColor;
}

export type MetroWayfindingElement =
  | MetroWayfindingFacilityElement
  | MetroWayfindingArrowElement
  | MetroWayfindingTextElement
  | MetroWayfindingLargeTextElement
  | MetroWayfindingSpaceElement
  | MetroWayfindingDividerElement
  | MetroWayfindingCombinationElement;

export type MetroWayfindingLayoutMode = 'single' | 'double' | 'vertical';

export interface MetroWayfindingLayout {
  backgroundColor: MetroWayfindingColor;
  foregroundColor: MetroWayfindingColor;
  mode: MetroWayfindingLayoutMode;
  dividerBetweenRows: boolean;
  rows: MetroWayfindingElement[][];
}

export interface MetroWayfindingProjectCanvas {
  widthM: number;
  heightM: number;
  pxPerMeter: number;
  alignToTile: boolean;
  tileSizePx: number;
}

export interface MetroWayfindingProjectFile {
  format: typeof METRO_WAYFINDING_PROJECT_FORMAT;
  schemaVersion: typeof METRO_WAYFINDING_PROJECT_SCHEMA_VERSION;
  template: {
    id: string;
    version: number;
  };
  canvas: MetroWayfindingProjectCanvas;
  layout: MetroWayfindingLayout;
  exportedAt: string;
}

export interface MetroWayfindingRowContextDefaults {
  textAlign: MetroWayfindingTextAlign;
  facilityDirection?: MetroWayfindingIconDirection;
}

const metroWayfindingLeftBoundaryArrows = new Set([
  'west',
  'north-west',
  'south-west',
  'u-turn-left',
  'turn-left-up',
  'turn-left-down',
]);
const metroWayfindingRightBoundaryArrows = new Set([
  'east',
  'north-east',
  'south-east',
  'u-turn-right',
  'turn-right-up',
  'turn-right-down',
]);

export function resolveMetroWayfindingFacilityDefaultDirection(
  iconId: string,
): MetroWayfindingIconDirection | undefined {
  if (iconId === 'exit') return 'up';
  // 这些图标的素材有明确朝向，默认朝左（水平翻转后的图形）。
  if (['stairs', 'escalator', 'wheelchair-lift', 'wheelchair'].includes(iconId)) {
    return 'left';
  }
  return undefined;
}

export function resolveMetroWayfindingArrowBoundarySide(
  iconId: string,
): 'left' | 'right' | 'up' | undefined {
  if (metroWayfindingLeftBoundaryArrows.has(iconId)) return 'left';
  if (metroWayfindingRightBoundaryArrows.has(iconId)) return 'right';
  if (iconId === 'north') return 'up';
  return undefined;
}

export function resolveMetroWayfindingRowContextDefaults(
  row: readonly MetroWayfindingElement[],
  index: number,
): MetroWayfindingRowContextDefaults {
  return resolveMetroWayfindingContextDefaults(row, index - 1, index + 1);
}

export function resolveMetroWayfindingInsertionContextDefaults(
  row: readonly MetroWayfindingElement[],
  insertionIndex: number,
): MetroWayfindingRowContextDefaults {
  const normalizedIndex = Math.max(0, Math.min(row.length, insertionIndex));
  return resolveMetroWayfindingContextDefaults(row, normalizedIndex - 1, normalizedIndex);
}

function resolveMetroWayfindingContextDefaults(
  row: readonly MetroWayfindingElement[],
  previousStartIndex: number,
  nextStartIndex: number,
): MetroWayfindingRowContextDefaults {
  const previousFlexIndex = findPreviousFlexSpaceIndex(row, previousStartIndex);
  const nextFlexIndex = findNextFlexSpaceIndex(row, nextStartIndex);
  const previousArrow = findPreviousArrowBeforeFlex(row, previousStartIndex);
  const nextArrow = findNextArrowBeforeFlex(row, nextStartIndex);
  const previousArrowSide = previousArrow
    ? resolveMetroWayfindingArrowBoundarySide(previousArrow.iconId)
    : undefined;
  const nextArrowSide = nextArrow
    ? resolveMetroWayfindingArrowBoundarySide(nextArrow.iconId)
    : undefined;

  if (nextFlexIndex >= 0 && previousArrowSide === 'left') {
    return { textAlign: 'left', facilityDirection: 'left' };
  }
  if (nextFlexIndex >= 0 && previousArrowSide === 'up') {
    return { textAlign: 'left' };
  }
  if (previousFlexIndex >= 0 && nextArrowSide === 'right') {
    return { textAlign: 'right', facilityDirection: 'right' };
  }
  if (previousFlexIndex >= 0 && nextArrowSide === 'up') {
    return { textAlign: 'right' };
  }
  return { textAlign: 'center' };
}

export function applyMetroWayfindingRowContextDefaults(
  row: readonly MetroWayfindingElement[],
): MetroWayfindingElement[] {
  return row.map((element, index) => {
    const defaults = resolveMetroWayfindingRowContextDefaults(row, index);
    if (element.type === 'text') {
      return { ...element, align: defaults.textAlign };
    }
    if (element.type === 'facility') {
      const fallbackDirection = resolveMetroWayfindingFacilityDefaultDirection(element.iconId);
      if (!fallbackDirection) return element;
      return {
        ...element,
        direction: element.direction ?? defaults.facilityDirection ?? fallbackDirection,
      };
    }
    return element;
  });
}

function findPreviousFlexSpaceIndex(
  row: readonly MetroWayfindingElement[],
  startIndex: number,
): number {
  for (let cursor = Math.min(startIndex, row.length - 1); cursor >= 0; cursor -= 1) {
    const element = row[cursor];
    if (element?.type === 'space' && element.mode === 'flex') return cursor;
    if (element?.type === 'arrow') return -1;
  }
  return -1;
}

function findNextFlexSpaceIndex(
  row: readonly MetroWayfindingElement[],
  startIndex: number,
): number {
  for (let cursor = Math.max(startIndex, 0); cursor < row.length; cursor += 1) {
    const element = row[cursor];
    if (element?.type === 'space' && element.mode === 'flex') return cursor;
    if (element?.type === 'arrow') return -1;
  }
  return -1;
}

function findPreviousArrowBeforeFlex(
  row: readonly MetroWayfindingElement[],
  startIndex: number,
): MetroWayfindingArrowElement | undefined {
  for (let cursor = Math.min(startIndex, row.length - 1); cursor >= 0; cursor -= 1) {
    const element = row[cursor];
    if (element?.type === 'space' && element.mode === 'flex') return undefined;
    if (element?.type === 'arrow') return element;
  }
  return undefined;
}

function findNextArrowBeforeFlex(
  row: readonly MetroWayfindingElement[],
  startIndex: number,
): MetroWayfindingArrowElement | undefined {
  for (let cursor = Math.max(startIndex, 0); cursor < row.length; cursor += 1) {
    const element = row[cursor];
    if (element?.type === 'space' && element.mode === 'flex') return undefined;
    if (element?.type === 'arrow') return element;
  }
  return undefined;
}

export interface MetroWayfindingLayoutSummaryRow {
  label: string;
  content: string;
}

export interface MetroWayfindingLayoutSummary {
  modeLabel: string;
  sizeLabel: string;
  rows: MetroWayfindingLayoutSummaryRow[];
}

export interface MetroWayfindingLayoutSizing {
  elementWidths: number[];
  flexWidth: number;
  textScaleX: number;
  layoutScale: number;
  totalDisplayWidth: number;
  isWidthInsufficient: boolean;
  hasUnresolvedOverflow: boolean;
}

export interface MetroWayfindingVerticalLayoutSizing {
  elementHeights: number[];
  flexHeight: number;
  textScaleY: number;
  totalDisplayHeight: number;
  isHeightInsufficient: boolean;
}

export interface MetroWayfindingCombinationSizing {
  width: number;
  contentX: number;
  contentWidth: number;
  elementWidths: number[];
  flexWidth: number;
  textScaleX: number;
  layoutScale: number;
  totalDisplayWidth: number;
}

export const emptyMetroWayfindingLayout: MetroWayfindingLayout = {
  backgroundColor: METRO_WAYFINDING_BACKGROUND,
  foregroundColor: METRO_WAYFINDING_FOREGROUND,
  mode: 'single',
  dividerBetweenRows: false,
  rows: [[]],
};

export function createMetroWayfindingId(prefix = 'metro'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createMetroWayfindingTextRow(
  kind: MetroWayfindingTextRow['kind'],
): MetroWayfindingTextRow {
  return kind === 'main'
    ? {
        id: createMetroWayfindingId('text-main'),
        kind,
        segments: [{ kind: 'text', value: '' }],
      }
    : { id: createMetroWayfindingId('text-secondary'), kind, value: '', bold: false };
}

export function duplicateMetroWayfindingElement(
  element: MetroWayfindingElement,
): MetroWayfindingElement {
  if (element.type === 'combination') {
    return {
      ...element,
      id: createMetroWayfindingId(element.type),
      children: element.children.map(
        (child) => duplicateMetroWayfindingElement(child) as MetroWayfindingCombinationChild,
      ),
    };
  }
  if (element.type !== 'text') {
    return { ...element, id: createMetroWayfindingId(element.type) };
  }
  return {
    ...element,
    id: createMetroWayfindingId(element.type),
    rows: element.rows.map((row) =>
      row.kind === 'main'
        ? {
            ...row,
            id: createMetroWayfindingId('text-main'),
            segments: row.segments.map((segment) => ({ ...segment })),
          }
        : { ...row, id: createMetroWayfindingId('text-secondary') },
    ),
  };
}

export function resolveMetroWayfindingTextMetrics(
  rows: MetroWayfindingTextRow[],
): MetroWayfindingTextMetrics {
  const mainRowCount = rows.filter((row) => row.kind === 'main').length;
  const secondaryRowCount = rows.length - mainRowCount;
  const heightFactor =
    mainRowCount + (secondaryRowCount * 2) / 3 + (Math.max(rows.length, 1) + 1) / 6;
  const mainFontSize = METRO_WAYFINDING_TEXT_HEIGHT / Math.max(heightFactor, 1 / 3);
  return {
    mainFontSize,
    secondaryFontSize: Math.min(METRO_WAYFINDING_SECONDARY_TEXT_MAX_HEIGHT, (mainFontSize * 2) / 3),
    spacing: mainFontSize / 6,
    contentHeight: METRO_WAYFINDING_TEXT_HEIGHT,
  };
}

export function resolveMetroWayfindingLayoutSizing(
  elements: MetroWayfindingElement[],
  canvasWidth: number,
): MetroWayfindingLayoutSizing {
  const safeCanvasWidth = Math.max(Number.isFinite(canvasWidth) ? canvasWidth : 0, 0);
  const innerWidth = Math.max(0, safeCanvasWidth - METRO_WAYFINDING_PADDING * 2);
  const naturalElementWidths = elements.map(resolveMetroWayfindingElementWidth);
  const gapWidth = Math.max(elements.length - 1, 0) * METRO_WAYFINDING_GAP;
  let textWidth = 0;
  let nonTextWidth = 0;
  let flexCount = 0;
  const flexibleCombinationIndexes: number[] = [];

  elements.forEach((element, index) => {
    if (element.type === 'space' && element.mode === 'flex') {
      flexCount += 1;
    } else if (
      element.type === 'text' ||
      element.type === 'largeText' ||
      element.type === 'combination'
    ) {
      textWidth += naturalElementWidths[index] ?? 0;
      if (
        element.type === 'combination' &&
        element.children.some((child) => child.type === 'space' && child.mode === 'flex')
      ) {
        flexibleCombinationIndexes.push(index);
      }
    } else {
      nonTextWidth += naturalElementWidths[index] ?? 0;
    }
  });

  const naturalFixedWidth = textWidth + nonTextWidth + gapWidth;
  const isWidthInsufficient = textWidth > 0 && naturalFixedWidth > innerWidth;
  const textScaleX = isWidthInsufficient
    ? Math.max(0, Math.min(1, (innerWidth - nonTextWidth - gapWidth) / textWidth))
    : 1;
  const layoutScale =
    textWidth === 0 && naturalFixedWidth > innerWidth && naturalFixedWidth > 0
      ? innerWidth / naturalFixedWidth
      : 1;
  const displayedFixedWidth = (nonTextWidth + textWidth * textScaleX + gapWidth) * layoutScale;
  const remainingWidth = Math.max(0, innerWidth - displayedFixedWidth);
  const flexSlotCount = flexCount + flexibleCombinationIndexes.length;
  const flexWidth = flexSlotCount > 0 ? remainingWidth / flexSlotCount : 0;
  const elementWidths = [...naturalElementWidths];
  flexibleCombinationIndexes.forEach((index) => {
    const scale = Math.max(textScaleX * layoutScale, Number.EPSILON);
    elementWidths[index] = (elementWidths[index] ?? 0) + flexWidth / scale;
  });
  const totalDisplayWidth = displayedFixedWidth + flexWidth * flexSlotCount;

  return {
    elementWidths,
    flexWidth,
    textScaleX,
    layoutScale,
    totalDisplayWidth,
    isWidthInsufficient,
    hasUnresolvedOverflow: totalDisplayWidth > innerWidth + 0.001,
  };
}

export function resolveMetroWayfindingVerticalLayoutSizing(
  elements: MetroWayfindingElement[],
  canvasHeight: number,
): MetroWayfindingVerticalLayoutSizing {
  const safeCanvasHeight = Math.max(Number.isFinite(canvasHeight) ? canvasHeight : 0, 0);
  const innerHeight = Math.max(0, safeCanvasHeight - METRO_WAYFINDING_PADDING * 2);
  const elementHeights = elements.map(resolveMetroWayfindingVerticalElementHeight);
  const gapHeight = Math.max(elements.length - 1, 0) * METRO_WAYFINDING_GAP;
  const verticalTextHeight = elements.reduce(
    (height, element, index) =>
      height +
      (element.type === 'text' && element.writingMode === 'vertical' ? elementHeights[index]! : 0),
    0,
  );
  const nonVerticalTextHeight = elements.reduce(
    (height, element, index) =>
      height +
      (element.type === 'space' && element.mode === 'flex'
        ? 0
        : element.type === 'text' && element.writingMode === 'vertical'
          ? 0
          : elementHeights[index]!),
    0,
  );
  const naturalFixedHeight = nonVerticalTextHeight + verticalTextHeight + gapHeight;
  const isHeightInsufficient = naturalFixedHeight > innerHeight + 0.001;
  const textScaleY =
    isHeightInsufficient && verticalTextHeight > 0
      ? Math.max(
          0,
          Math.min(1, (innerHeight - nonVerticalTextHeight - gapHeight) / verticalTextHeight),
        )
      : 1;
  const displayedFixedHeight = nonVerticalTextHeight + verticalTextHeight * textScaleY + gapHeight;
  const flexCount = elements.filter(
    (element) => element.type === 'space' && element.mode === 'flex',
  ).length;
  const flexHeight =
    flexCount > 0 ? Math.max(0, innerHeight - displayedFixedHeight) / flexCount : 0;
  const totalDisplayHeight = displayedFixedHeight + flexHeight * flexCount;
  return {
    elementHeights,
    flexHeight,
    textScaleY,
    totalDisplayHeight,
    isHeightInsufficient,
  };
}

export function resolveMetroWayfindingVerticalElementHeight(
  element: MetroWayfindingElement,
): number {
  if (element.type === 'space') {
    return element.mode === 'fixed' ? Math.max(1, element.units) * METRO_WAYFINDING_GAP : 0;
  }
  if (element.type === 'divider') {
    return METRO_WAYFINDING_DIVIDER_WIDTH;
  }
  if (element.type === 'largeText') {
    return METRO_WAYFINDING_TEXT_HEIGHT;
  }
  if (element.type === 'combination') {
    return METRO_WAYFINDING_HEIGHT * normalizeMetroWayfindingCombinationScale(element.scale);
  }
  if (element.type === 'facility' || element.type === 'arrow') {
    return METRO_WAYFINDING_TEXT_HEIGHT;
  }
  if (element.type !== 'text') {
    return 0;
  }
  const rows = element.rows.filter(hasMetroWayfindingTextRowContent);
  if (rows.length === 0) {
    return 0;
  }
  const metrics = resolveMetroWayfindingTextMetrics(rows);
  if (element.writingMode !== 'vertical') {
    return rows.reduce(
      (height, row, index) =>
        height +
        (row.kind === 'main' ? metrics.mainFontSize : metrics.secondaryFontSize) +
        (index < rows.length - 1 ? metrics.spacing : 0),
      0,
    );
  }
  const rowHeights = rows.map((row) =>
    row.kind === 'main'
      ? measureMetroWayfindingMainSegments(row.segments, metrics.mainFontSize)
      : measureMetroWayfindingSecondaryText(row.value, metrics.secondaryFontSize, row.bold),
  );
  return Math.max(0, ...rowHeights);
}

export function resolveMetroWayfindingElementWidth(element: MetroWayfindingElement): number {
  if (element.type === 'facility' || element.type === 'arrow' || element.type === 'divider') {
    return element.type === 'divider' ? METRO_WAYFINDING_DIVIDER_WIDTH : 85;
  }
  if (element.type === 'largeText') {
    if (element.frameShape === 'circle') {
      return 85;
    }
    return resolveMetroWayfindingLargeTextWidth(element, element.frameShape === 'none' ? 0 : 85);
  }
  if (element.type === 'combination') {
    return (
      resolveMetroWayfindingCombinationSizing(element).width *
      normalizeMetroWayfindingCombinationScale(element.scale)
    );
  }
  if (element.type === 'space') {
    return element.mode === 'fixed' ? Math.max(1, element.units) * METRO_WAYFINDING_GAP : 0;
  }
  const metrics = resolveMetroWayfindingTextMetrics(element.rows);
  const rowWidths = element.rows.map((row) =>
    row.kind === 'main'
      ? measureMetroWayfindingMainSegments(row.segments, metrics.mainFontSize)
      : measureMetroWayfindingSecondaryText(row.value, metrics.secondaryFontSize, row.bold),
  );
  return Math.max(0, ...rowWidths);
}

export function resolveMetroWayfindingCombinationSizing(
  element: MetroWayfindingCombinationElement,
  targetWidth?: number,
): MetroWayfindingCombinationSizing {
  const contentX =
    METRO_WAYFINDING_COMBINATION_PADDING +
    (element.frameFillMode === 'stripe' && element.stripePosition === 'left'
      ? METRO_WAYFINDING_COMBINATION_STRIPE_WIDTH
      : 0);
  const rightInset =
    METRO_WAYFINDING_COMBINATION_PADDING +
    (element.frameFillMode === 'stripe' && element.stripePosition === 'right'
      ? METRO_WAYFINDING_COMBINATION_STRIPE_WIDTH
      : 0);
  const elementWidths = element.children.map((child) =>
    child.type === 'largeText' && child.frameShape === 'none'
      ? resolveMetroWayfindingLargeTextWidth(child, 0)
      : resolveMetroWayfindingElementWidth(child),
  );
  const gapWidth = Math.max(element.children.length - 1, 0) * METRO_WAYFINDING_COMBINATION_GAP;
  let fixedWidth = 0;
  let flexCount = 0;

  element.children.forEach((child, index) => {
    if (child.type === 'space' && child.mode === 'flex') {
      flexCount += 1;
    } else {
      fixedWidth += elementWidths[index] ?? 0;
    }
  });

  const minimumContentWidth = Math.max(
    0,
    METRO_WAYFINDING_COMBINATION_MIN_WIDTH - contentX - rightInset,
  );
  const naturalContentWidth = Math.max(
    minimumContentWidth,
    fixedWidth + gapWidth + flexCount * METRO_WAYFINDING_COMBINATION_FLEX_MIN_WIDTH,
  );
  const naturalWidth = contentX + naturalContentWidth + rightInset;
  const width = Math.max(
    naturalWidth,
    Number.isFinite(targetWidth) ? Number(targetWidth) : naturalWidth,
  );
  const contentWidth = Math.max(0, width - contentX - rightInset);
  const flexWidth =
    flexCount > 0
      ? Math.max(
          METRO_WAYFINDING_COMBINATION_FLEX_MIN_WIDTH,
          (contentWidth - fixedWidth - gapWidth) / flexCount,
        )
      : 0;
  return {
    width,
    contentX,
    contentWidth,
    elementWidths,
    flexWidth,
    textScaleX: 1,
    layoutScale: 1,
    totalDisplayWidth: fixedWidth + gapWidth + flexWidth * flexCount,
  };
}

type MetroWayfindingLargeTextLike = Pick<
  MetroWayfindingLargeTextElement,
  'value' | 'suffix' | 'suffixes'
>;

/**
 * 大文本的下角标列表——**唯一真源入口**。
 *
 * 新数据取 `suffixes`（支持任意位置）；旧存档只有 `suffix`，这里把它兜底成
 * 「末尾一项」，因此老工程文件读进来照样显示。顺带排序、把 `at` 收敛到
 * [0, 码点数]、丢弃空值——任何渲染 / 估算 / 编辑都只信这个结果，
 * **不要**各自去读 `element.suffix`（中间角标会整体丢失）。
 */
export function resolveMetroLargeTextSuffixes(
  element: MetroWayfindingLargeTextLike,
): MetroWayfindingLargeTextSuffix[] {
  const length = Array.from(element.value).length;
  const raw = element.suffixes?.length
    ? element.suffixes
    : element.suffix
      ? [{ at: length, value: element.suffix }]
      : [];
  return (
    raw
      // 只过滤「根本不是字符串」的脏项；**刻意保留空串**——编辑时刚插入、还没
      // 输入的角标必须是可见的 chip，否则用户一插入它就被吃掉。
      .filter((item) => typeof item?.value === 'string')
      .map((item) => ({
        at: Math.max(0, Math.min(length, Math.round(Number(item.at) || 0))),
        value: item.value.slice(0, 24),
      }))
      .sort((left, right) => left.at - right.at)
  );
}

/**
 * 把大文本切成「正文块 / 下角标」交替的片段序列。
 * 渲染（DOM 预览 + SVG 导出）与内联编辑 UI 共用，保证两者排布一致。
 */
export function splitMetroLargeTextRuns(
  element: MetroWayfindingLargeTextLike,
): MetroWayfindingLargeTextRun[] {
  const characters = Array.from(element.value);
  const runs: MetroWayfindingLargeTextRun[] = [];
  let cursor = 0;
  for (const suffix of resolveMetroLargeTextSuffixes(element)) {
    const text = characters.slice(cursor, suffix.at).join('');
    if (text) runs.push({ kind: 'text', value: text });
    runs.push({ kind: 'suffix', value: suffix.value });
    cursor = suffix.at;
  }
  const tail = characters.slice(cursor).join('');
  if (tail) runs.push({ kind: 'text', value: tail });
  return runs;
}

/** 大文本的字面内容（正文 + 所有下角标按顺序拼回），供摘要 / 搜索 / 校验用。 */
export function concatMetroLargeTextValue(element: MetroWayfindingLargeTextLike): string {
  return splitMetroLargeTextRuns(element)
    .map((run) => run.value)
    .join('');
}

/**
 * 在**正文末尾**追加一个下角标字符，返回要 patch 的字段。
 *
 * 末尾已有角标则拼在它后面（`oth@one` + `oth@two` → 「12」），否则新建一个。
 * 泛型 + 只依赖 `value/suffix/suffixes`，因此组合框里的 largeText child 也能用。
 */
export function appendMetroLargeTextSuffix<T extends MetroWayfindingLargeTextLike>(
  element: T,
  addition: string,
): Pick<MetroWayfindingLargeTextElement, 'suffix' | 'suffixes'> {
  const length = Array.from(element.value).length;
  const suffixes = resolveMetroLargeTextSuffixes(element);
  const last = suffixes.at(-1);
  const next =
    last && last.at === length
      ? [
          ...suffixes.slice(0, -1),
          { at: length, value: `${last.value}${addition}`.slice(0, 24) },
        ]
      : [...suffixes, { at: length, value: addition.slice(0, 24) }];
  return { suffixes: next, suffix: next.filter((item) => item.at === length).at(-1)?.value ?? '' };
}

function resolveMetroWayfindingLargeTextWidth(
  element: MetroWayfindingLargeTextElement,
  minimumWidth: number,
): number {
  const mainFontSize =
    element.frameShape !== 'none'
      ? METRO_WAYFINDING_LARGE_TEXT_FRAMED_FONT_SIZE
      : METRO_WAYFINDING_LARGE_TEXT_UNFRAMED_FONT_SIZE;
  const suffixFontSize = METRO_WAYFINDING_LARGE_TEXT_SUFFIX_FONT_SIZE;
  const runs = splitMetroLargeTextRuns(element);
  // 每个下角标与**紧邻的正文**之间留 3px：末尾角标只挨一边 → 3px，
  // 夹在正文中间 → 两侧各 3px。角标彼此相邻时不额外加间距。
  let gap = 0;
  runs.forEach((run, index) => {
    if (run.kind !== 'suffix') return;
    const previous = runs[index - 1];
    const next = runs[index + 1];
    if (previous?.kind === 'text') gap += 3;
    if (next?.kind === 'text') gap += 3;
  });
  const contentWidth =
    runs.reduce(
      (width, run) =>
        width +
        estimateMetroWayfindingLargeTextWidth(
          run.value,
          run.kind === 'suffix' ? suffixFontSize : mainFontSize,
        ),
      0,
    ) + gap;
  return Math.max(minimumWidth, contentWidth > 0 ? contentWidth + 8 : 0);
}

export function measureMetroWayfindingMainSegments(
  segments: MetroWayfindingMainSegment[],
  fontSize: number,
): number {
  const contentWidth = segments.reduce(
    (width, segment) =>
      width +
      (segment.kind === 'line'
        ? fontSize * 1.12
        : segment.kind === 'boxed'
          ? Math.max(
              fontSize * 1.05,
              estimateMetroWayfindingTextWidth(segment.value, fontSize) + fontSize * 0.32,
            )
          : estimateMetroWayfindingTextWidth(segment.value, fontSize)),
    0,
  );
  return contentWidth + Math.max(segments.length - 1, 0) * fontSize * 0.12;
}

export function estimateMetroWayfindingTextWidth(value: string, fontSize: number): number {
  return (
    Array.from(value).reduce(
      (width, character) =>
        width +
        (isBasicLatinCharacter(character)
          ? arialCharacterWidthFactor(character)
          : metroWayfindingCharacterWidthFactor(character)),
      0,
    ) * fontSize
  );
}

export function measureMetroWayfindingSecondaryText(
  value: string,
  fontSize: number,
  _bold: boolean,
): number {
  return estimateMetroWayfindingTextWidth(value, fontSize);
}

export function estimateMetroWayfindingLargeTextWidth(value: string, fontSize: number): number {
  return estimateMetroWayfindingTextWidth(value, fontSize);
}

function isBasicLatinCharacter(character: string): boolean {
  const codePoint = character.codePointAt(0) ?? 0;
  return codePoint >= 0x20 && codePoint <= 0x7e;
}

function arialCharacterWidthFactor(character: string): number {
  if (character === ' ') return 0.278;
  if (/[0-9]/u.test(character)) return 0.556;
  if (/[MW]/u.test(character)) return character === 'W' ? 0.944 : 0.833;
  if (/[Iijl]/u.test(character)) return /[Iil]/u.test(character) ? 0.278 : 0.222;
  if (/[mw]/u.test(character)) return character === 'm' ? 0.833 : 0.722;
  if (/[frt]/u.test(character)) return character === 'f' ? 0.278 : 0.333;
  if (/[,.:;!'|]/u.test(character)) return 0.278;
  if (/[-+*/=()\[\]]/u.test(character)) return 0.584;
  if (/[A-Z]/u.test(character)) return 0.667;
  return 0.556;
}

function metroWayfindingCharacterWidthFactor(character: string): number {
  const codePoint = character.codePointAt(0) ?? 0;
  if (/\s/u.test(character)) return 0.34;
  if (
    (codePoint >= 0x2e80 && codePoint <= 0x9fff) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0xff01 && codePoint <= 0xff60) ||
    (codePoint >= 0xffe0 && codePoint <= 0xffe6)
  ) {
    return 1;
  }
  if (/[,.;:!?，。；：！？、]/u.test(character)) return 0.38;
  if (/[A-Z0-9]/u.test(character)) return 0.62;
  return 0.56;
}

/**
 * 线路编号归一化：去掉「号线 / 路 / Line」等前后缀与空白，得到纯编号文本。
 * 例：「1号线」→「1」、「Line 1」→「1」、「1路」→「1」。
 */
export function normalizeMetroWayfindingLineNumber(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase('zh-CN')
    .replace(/\s+/gu, '')
    .replace(/^line/iu, '')
    .replace(/(号线|路|line)$/iu, '');
}

/**
 * 线路编号展示文本：仅去掉「号线」后缀，保留名称其余部分。
 * 例：「1号线」→「1」、「京港地铁1号线」→「京港地铁1」。
 *
 * @deprecated 提取线路编号请统一用 {@link extractMetroWayfindingLineNumber}。
 * 本函数只剥「号线」，`S1线` 会原样返回 `S1线`、`京港地铁1号线` 会返回 `京港地铁1`，
 * 与色板 / chip 期望的纯编号（`S1`、`1`）不一致。仅在本就期望「完整展示名」时使用。
 */
export function formatMetroWayfindingLineNumber(value: string): string {
  return value.replace(/号线$/u, '').trim();
}

/**
 * 从线路名中提取「线路编号」——连续的数字和/或字母组合；若不存在则退化为名称首字。
 * 例：「2号线」→「2」、「S1线」→「S1」、「环线」→「环」、「京港地铁1号线」→「1」。
 *
 * 这是全项目唯一的线路编号提取入口：chip 内、色板、以及各来源的线路选项都应走这里，
 * 避免各处各写一套正则导致同一线路在不同位置显示成不同编号。
 */
export function extractMetroWayfindingLineNumber(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  // 先把「号线 / 路 / Line」这类类型后缀摘掉，避免 "Line 1" 被当成字母数字串 "Line1"。
  const withoutSuffix = trimmed
    .replace(/^\s*line\s*/iu, '')
    .replace(/\s*(号线|路)\s*$/u, '')
    .trim();
  // 全角 alphanumeric 先归一化为半角（如「Ｓ１」→「S1」），否则大写字母匹配不上。
  const normalized = withoutSuffix.normalize('NFKC');
  // 优先取「字母 + 数字」的组合（S1、T2、A1），其次「数字 + 可选字母」（1、2、4A）。
  const matches = normalized.match(/[A-Za-z]+[0-9]+[0-9A-Za-z]*|[0-9]+[0-9A-Za-z]*/gu);
  if (matches?.length) return matches[0]!;
  const alphanumeric = normalized.match(/[0-9A-Za-z]+/gu);
  if (alphanumeric?.length) return alphanumeric[0]!;
  // 没有编号的线路（如「环线」「机场线」）：退化为名称首字。
  return Array.from(normalized)[0] ?? '';
}

/**
 * 归一化「线路编号」用于比较：大小写、全半角、空白都不应影响同一编号的判定。
 */
export function normalizeMetroWayfindingLineNumberKey(value: string): string {
  return extractMetroWayfindingLineNumber(value).toLocaleUpperCase('zh-CN');
}

/**
 * 线路名中「线路编号之后的部分」：把归一化编号从名称中剥离后剩下的文字。
 * 例：「1号线」→「号线」、「京港地铁1号线」→「号线」、「1路」→「路」。
 */
export function resolveMetroWayfindingLineNameSuffix(value: string): string {
  const lineNumber = normalizeMetroWayfindingLineNumber(value);
  if (!lineNumber) return '';
  const index = value.toLocaleLowerCase('zh-CN').indexOf(lineNumber);
  if (index < 0) return '';
  return value.slice(index + lineNumber.length).trim();
}

export interface MetroWayfindingLineTemplateInput {
  /** 线路编号展示文本，通常是线路名去掉「号线」后缀。 */
  lineNumber: string;
  /** 线路英文副标题，缺省时回落为「Line <编号>」。 */
  secondaryName?: string;
  /** 线路标识色，会同时用于组合框填充色与色带颜色。 */
  color: MetroWayfindingColor;
  /** 线路完整名称，用于推导主行「编号之后的部分」；缺省时按「号线」处理。 */
  lineName?: string;
}

/**
 * 构建「线路编号」组合框子元素：一个编号大文本 + 一个「号线 / Line <编号>」主副双行文本。
 * 编号大文本沿用无外框样式（外框由组合框自身的填充模式承担）；
 * 双行文本的主行用普通文本书写线路编号「之后」的部分（如「号线」）——编号本身已由大文本承担，
 * 因此主行不再使用带圈线路段落；副行回落为「Line <编号>」。
 */
export function buildMetroWayfindingLineNumberTemplateChildren(
  input: MetroWayfindingLineTemplateInput,
): MetroWayfindingCombinationChild[] {
  const lineNumber = input.lineNumber.trim();
  const secondaryName = input.secondaryName?.trim() || `Line ${lineNumber}`.trim();
  const mainValue = resolveMetroWayfindingLineNameSuffix(input.lineName ?? `${lineNumber}号线`);

  const largeText: MetroWayfindingLargeTextElement = {
    id: createMetroWayfindingId('largeText'),
    type: 'largeText',
    value: lineNumber,
    suffix: '',
    frameShape: 'none',
    frameFillMode: 'none',
    frameStroke: false,
  };

  const text: MetroWayfindingTextElement = {
    id: createMetroWayfindingId('text'),
    type: 'text',
    align: 'left',
    writingMode: 'horizontal',
    rows: [
      {
        id: createMetroWayfindingId('text-main'),
        kind: 'main',
        segments: [{ kind: 'text', value: mainValue }],
      },
      {
        id: createMetroWayfindingId('text-secondary'),
        kind: 'secondary',
        value: secondaryName,
        bold: false,
      },
    ],
  };

  return [largeText, text];
}

/**
 * 组合框填充模式切换时的缩放倍数换算。
 *
 * 「无填充+色带」模式需要在组合框内为色带预留宽度，因此图形需要先放大再整体缩小：
 * 切入时缩放除以色带补偿系数，切出时乘以该系数还原。换算结果会钳制在
 * METRO_WAYFINDING_COMBINATION_MIN_SCALE / METRO_WAYFINDING_COMBINATION_MAX_SCALE 之间，
 * 并且只在跨越模式边界时生效，避免同模式内重复点击导致缩放漂移。
 */
export function resolveMetroWayfindingCombinationScaleForFillMode(
  scale: number,
  previousMode: MetroWayfindingCombinationFillMode,
  nextMode: MetroWayfindingCombinationFillMode,
): number {
  const wasStripe = previousMode === 'stripe';
  const isStripe = nextMode === 'stripe';
  if (wasStripe === isStripe) return normalizeMetroWayfindingCombinationScale(scale);
  const nextScale = isStripe
    ? scale / METRO_WAYFINDING_COMBINATION_STRIPE_SCALE_FACTOR
    : scale * METRO_WAYFINDING_COMBINATION_STRIPE_SCALE_FACTOR;
  return normalizeMetroWayfindingCombinationScale(nextScale);
}

export function createMetroWayfindingElement(
  type: MetroWayfindingElement['type'],
  iconId = 'stairs',
): MetroWayfindingElement {
  const id = createMetroWayfindingId(type);
  if (type === 'facility') {
    const icon = metroWayfindingFacilityOptions.find((option) => option.id === iconId);
    return {
      id,
      type,
      iconId,
      // 有变种的图标（楼梯）默认取默认变种 + 默认方向，即「双向 + 向左」组合。
      direction: resolveMetroWayfindingFacilityDefaultDirection(iconId),
      variant: resolveMetroFacilityDefaultVariant(iconId),
      frameShape: iconId === 'no-entry' ? 'none' : 'rectangle',
      frameFillMode: 'none',
      frameStroke: false,
      foregroundColor: icon?.defaultForegroundColor,
    };
  }
  if (type === 'arrow') {
    const arrowId = resolveMetroArrowIconAssetName(iconId) ?? 'south-west';
    return {
      id,
      type,
      iconId: arrowId,
      framed: false,
      frameFillMode: 'none',
      frameStroke: false,
    };
  }
  if (type === 'text') {
    return {
      id,
      type,
      align: 'center',
      writingMode: 'horizontal',
      rows: [createMetroWayfindingTextRow('main'), createMetroWayfindingTextRow('secondary')],
    };
  }
  if (type === 'largeText') {
    return {
      id,
      type,
      value: '',
      suffix: '',
      frameShape: 'rectangle',
      frameFillMode: 'none',
      frameStroke: false,
    };
  }
  if (type === 'combination') {
    return {
      id,
      type,
      scale: METRO_WAYFINDING_COMBINATION_DEFAULT_SCALE,
      children: [],
      frameFillMode: 'none',
      frameStroke: false,
      stripePosition: 'left',
    };
  }
  if (type === 'space') {
    return { id, type, mode: 'fixed', units: 1 };
  }
  return { id, type };
}

const metroWayfindingArrowReverseMap: Record<string, string> = {
  'south-west': 'south-east',
  west: 'east',
  'north-west': 'north-east',
  'north-east': 'north-west',
  east: 'west',
  'south-east': 'south-west',
  'turn-left-up': 'turn-right-up',
  'turn-right-up': 'turn-left-up',
  'turn-left-down': 'turn-right-down',
  'turn-right-down': 'turn-left-down',
  'u-turn-left': 'u-turn-right',
  'u-turn-right': 'u-turn-left',
};

function reverseMetroWayfindingElement(element: MetroWayfindingElement): MetroWayfindingElement {
  if (element.type === 'arrow') {
    return {
      ...element,
      iconId: metroWayfindingArrowReverseMap[element.iconId] ?? element.iconId,
    };
  }
  if (element.type === 'facility') {
    const fallbackDirection = resolveMetroWayfindingFacilityDefaultDirection(element.iconId);
    if (!fallbackDirection) return element;
    const effectiveDirection = element.direction ?? fallbackDirection;
    return {
      ...element,
      direction:
        effectiveDirection === 'left'
          ? 'right'
          : effectiveDirection === 'right'
            ? 'left'
            : effectiveDirection,
    };
  }
  if (element.type === 'text') {
    return {
      ...element,
      align:
        element.align === 'left' ? 'right' : element.align === 'right' ? 'left' : element.align,
    };
  }
  // 组合框是一个不可拆分的整体，内部元素不参与反排。
  return element;
}

export function reverseMetroWayfindingLayout(layout: MetroWayfindingLayout): MetroWayfindingLayout {
  if (layout.mode === 'vertical') return layout;
  return {
    ...layout,
    rows: layout.rows.map((row) => [...row].reverse().map(reverseMetroWayfindingElement)),
  };
}

export function parseMetroWayfindingLayout(value: string): MetroWayfindingLayout {
  try {
    const candidate = JSON.parse(value) as Partial<MetroWayfindingLayout> & {
      elements?: unknown;
      rows?: unknown;
    };
    const candidateRows = Array.isArray(candidate.rows)
      ? candidate.rows.slice(0, 2).map(normalizeMetroWayfindingElements)
      : [normalizeMetroWayfindingElements(candidate.elements)];
    const mode =
      candidate.mode === 'vertical'
        ? 'vertical'
        : candidate.mode === 'double' || (candidate.mode !== 'single' && candidateRows.length > 1)
          ? 'double'
          : 'single';
    const rows = candidateRows.length ? candidateRows : [[]];
    if (mode === 'double' && rows.length < 2) rows.push([]);
    return {
      backgroundColor: normalizeColor(candidate.backgroundColor, METRO_WAYFINDING_BACKGROUND),
      foregroundColor: normalizeColor(candidate.foregroundColor, METRO_WAYFINDING_FOREGROUND),
      mode,
      dividerBetweenRows: candidate.dividerBetweenRows === true,
      rows,
    };
  } catch {
    return emptyMetroWayfindingLayout;
  }
}

export function serializeMetroWayfindingLayout(layout: MetroWayfindingLayout): string {
  return JSON.stringify(layout);
}

export function summarizeMetroWayfindingLayout(
  layout: MetroWayfindingLayout,
  canvas?: Pick<MetroWayfindingProjectCanvas, 'widthM' | 'heightM' | 'pxPerMeter'>,
): MetroWayfindingLayoutSummary {
  const modeLabel =
    layout.mode === 'vertical' ? '竖向' : layout.mode === 'double' ? '双行' : '单行';
  const widthM = canvas?.widthM ?? (layout.mode === 'vertical' ? 1 : 0);
  const heightM = canvas?.heightM ?? (layout.mode === 'double' ? 2 : 1);
  const pxPerMeter = canvas?.pxPerMeter ?? 128;
  const sizeLabel = canvas
    ? `${widthM} × ${heightM} 格（${Math.round(widthM * pxPerMeter)} × ${Math.round(heightM * pxPerMeter)} px）`
    : '尺寸待定';
  const visibleRows = layout.rows.slice(0, layout.mode === 'double' ? 2 : 1);
  const rows = visibleRows.length
    ? visibleRows.map((elements, index) => ({
        label: layout.mode === 'vertical' ? '竖向内容' : `${index + 1} 行`,
        content: elements.map(summarizeMetroWayfindingElement).join(' → ') || '空白',
      }))
    : [{ label: layout.mode === 'vertical' ? '竖向内容' : '1 行', content: '空白' }];
  return { modeLabel, sizeLabel, rows };
}

export function buildMetroWayfindingProjectFileName(input: {
  title: string;
  canvas: Pick<MetroWayfindingProjectCanvas, 'widthM' | 'heightM'>;
  layout: MetroWayfindingLayout;
}): string {
  const summary = summarizeMetroWayfindingLayout(input.layout, {
    ...input.canvas,
    pxPerMeter: 128,
  });
  const descriptors = input.layout.rows
    .slice(0, input.layout.mode === 'double' ? 2 : 1)
    .flatMap((elements) =>
      elements.flatMap((element) => {
        if (element.type === 'text') {
          return element.rows
            .flatMap((row) =>
              row.kind === 'main' ? row.segments.map((segment) => segment.value) : [row.value],
            )
            .filter((value) => value.trim());
        }
        if (element.type === 'largeText') return [concatMetroLargeTextValue(element)];
        if (element.type === 'combination') {
          return element.children.flatMap(extractMetroWayfindingElementDescriptors);
        }
        if (element.type === 'facility' || element.type === 'arrow') {
          return [
            metroWayfindingIconOptions.find((option) => option.id === element.iconId)?.label ?? '',
          ];
        }
        return [];
      }),
    )
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index)
    .slice(0, 3);
  const safePart = (value: string, fallback: string) =>
    value
      .replace(/[\u0000-\u001f\\/:*?"<>|]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/^[_ .]+|[_ .]+$/g, '')
      .slice(0, 24) || fallback;
  const parts = [
    safePart(input.title, '地铁导视牌'),
    summary.modeLabel,
    `${input.canvas.widthM}x${input.canvas.heightM}格`,
    ...descriptors.map((value) => safePart(value, '元素')),
  ];
  return `${parts.join('_')}.yct-metro-wayfinding.json`;
}

function summarizeMetroWayfindingElement(element: MetroWayfindingElement): string {
  if (element.type === 'facility') {
    const label = metroWayfindingIconOptions.find((option) => option.id === element.iconId)?.label;
    const frameLabel =
      element.frameShape === 'none' ? '' : `，${element.frameShape === 'circle' ? '圆框' : '方框'}`;
    return `图标：${label ?? '设施'}${frameLabel}`;
  }
  if (element.type === 'arrow') {
    return `箭头：${metroWayfindingArrowOptions.find((option) => option.id === element.iconId)?.label ?? '方向'}`;
  }
  if (element.type === 'text') {
    const alignmentLabel = { left: '左对齐', center: '居中', right: '右对齐' }[element.align];
    const writingModeLabel = element.writingMode === 'vertical' ? '竖排' : '横排';
    const value = element.rows
      .map((row) =>
        row.kind === 'main'
          ? row.segments
              .map((segment) =>
                segment.kind === 'line' ? `[${segment.value || '线路'}]` : segment.value,
              )
              .join('')
          : row.value,
      )
      .map((value) => value.trim())
      .filter(Boolean)
      .join(' / ');
    return `文字（${writingModeLabel}·${alignmentLabel}）：${value || '空白'}`;
  }
  if (element.type === 'largeText') {
    return `大文字：${concatMetroLargeTextValue(element) || '空白'}`;
  }
  if (element.type === 'combination') {
    const content = element.children.map(summarizeMetroWayfindingElement).join(' + ');
    const fillLabel =
      element.frameFillMode === 'stripe'
        ? `色带·${{ left: '左', right: '右', bottom: '下' }[element.stripePosition]}`
        : { none: '无填充', inverse: '反色', color: '颜色填充' }[element.frameFillMode];
    return `组合框（${formatMetroWayfindingScale(element.scale)}·${fillLabel}）：${content || '空白'}`;
  }
  if (element.type === 'space') {
    return element.mode === 'flex' ? '弹性空白' : `固定空白：${element.units} 格`;
  }
  return `分割线：${METRO_WAYFINDING_DIVIDER_WIDTH} px`;
}

function extractMetroWayfindingElementDescriptors(element: MetroWayfindingElement): string[] {
  if (element.type === 'text') {
    return element.rows.flatMap((row) =>
      row.kind === 'main' ? row.segments.map((segment) => segment.value) : [row.value],
    );
  }
  if (element.type === 'largeText') return [concatMetroLargeTextValue(element)];
  if (element.type === 'facility' || element.type === 'arrow') {
    return [metroWayfindingIconOptions.find((option) => option.id === element.iconId)?.label ?? ''];
  }
  if (element.type === 'combination') {
    return element.children.flatMap(extractMetroWayfindingElementDescriptors);
  }
  return [];
}

export function createMetroWayfindingProjectFile(input: {
  templateId: string;
  templateVersion: number;
  canvas: MetroWayfindingProjectCanvas;
  layout: MetroWayfindingLayout;
  exportedAt?: string;
}): MetroWayfindingProjectFile {
  return {
    format: METRO_WAYFINDING_PROJECT_FORMAT,
    schemaVersion: METRO_WAYFINDING_PROJECT_SCHEMA_VERSION,
    template: {
      id: input.templateId,
      version: input.templateVersion,
    },
    canvas: { ...input.canvas },
    layout: input.layout,
    exportedAt: input.exportedAt ?? new Date().toISOString(),
  };
}

export function serializeMetroWayfindingProjectFile(project: MetroWayfindingProjectFile): string {
  return `${JSON.stringify(project, null, 2)}\n`;
}

export function normalizeColor(value: unknown, fallback: string): string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
    ? value.toUpperCase()
    : fallback;
}

function normalizeMetroWayfindingElements(value: unknown): MetroWayfindingElement[] {
  return Array.isArray(value)
    ? (value.map(normalizeMetroWayfindingElement).filter(Boolean) as MetroWayfindingElement[])
    : [];
}

function normalizeMetroWayfindingElement(value: unknown): MetroWayfindingElement | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const candidate = value as {
    id?: unknown;
    type?: unknown;
    iconId?: unknown;
    direction?: unknown;
    variant?: unknown;
    framed?: unknown;
    frameShape?: unknown;
    frameFillMode?: unknown;
    frameFillColor?: unknown;
    frameStroke?: unknown;
    backgroundColor?: unknown;
    foregroundColor?: unknown;
  };
  const id = typeof candidate.id === 'string' && candidate.id ? candidate.id.slice(0, 80) : null;
  if (!id) {
    return null;
  }
  const backgroundColor = normalizeOptionalColor(candidate.backgroundColor);
  const foregroundColor = normalizeOptionalColor(candidate.foregroundColor);
  if (candidate.type === 'icon' || candidate.type === 'facility' || candidate.type === 'arrow') {
    const candidateIconId =
      typeof candidate.iconId === 'string'
        ? migrateLegacyMetroFacilityIconId(candidate.iconId)
        : '';
    const candidateIcon = metroWayfindingIconOptions.find((item) => item.id === candidateIconId);
    const type =
      candidate.type === 'arrow' || (candidate.type === 'icon' && candidateIcon?.group === 'arrow')
        ? 'arrow'
        : 'facility';
    const options = type === 'arrow' ? metroWayfindingArrowOptions : metroWayfindingFacilityOptions;
    const fallbackIconId = type === 'arrow' ? 'south-west' : 'stairs';
    const iconId = options.some((item) => item.id === candidateIconId)
      ? candidateIconId
      : fallbackIconId;
    const icon = options.find((item) => item.id === iconId);
    if (type === 'arrow') {
      return {
        id,
        type,
        iconId,
        framed: candidate.framed === true,
        frameFillMode: normalizeMetroWayfindingFrameFillMode(candidate.frameFillMode),
        frameFillColor: normalizeOptionalColor(candidate.frameFillColor),
        frameStroke: candidate.frameStroke === true,
        backgroundColor,
        foregroundColor: foregroundColor ?? icon?.defaultForegroundColor,
      };
    }
    const direction = migrateLegacyMetroFacilityIconDirection(candidate.direction, iconId);
    const rawVariant = candidate.variant;
    const variant =
      rawVariant === 'two-way' || rawVariant === 'up' || rawVariant === 'down'
        ? rawVariant
        : migrateLegacyMetroFacilityIconVariant(
            typeof candidate.iconId === 'string' ? candidate.iconId : '',
            iconId,
            candidate.direction,
          );
    const variantOptions = resolveMetroFacilityVariantOptions(iconId);
    const normalizedVariant = variantOptions.length
      ? variant && variantOptions.includes(variant)
        ? variant
        : resolveMetroFacilityDefaultVariant(iconId)
      : undefined;
    return {
      id,
      type,
      iconId,
      direction,
      variant: normalizedVariant,
      frameShape: normalizeMetroWayfindingFrameShape(candidate.frameShape, candidate.framed),
      frameFillMode: normalizeMetroWayfindingFrameFillMode(candidate.frameFillMode),
      frameFillColor: normalizeOptionalColor(candidate.frameFillColor),
      frameStroke: candidate.frameStroke === true,
      backgroundColor,
      foregroundColor: foregroundColor ?? icon?.defaultForegroundColor,
    };
  }
  if (candidate.type === 'text') {
    const textCandidate = candidate as Partial<MetroWayfindingTextElement> & {
      mode?: unknown;
      main?: unknown;
      secondary?: unknown;
      secondMain?: unknown;
      secondSecondary?: unknown;
    };
    const rows = Array.isArray(textCandidate.rows)
      ? normalizeTextRows(textCandidate.rows, id)
      : migrateLegacyTextRows(textCandidate, id);
    return {
      id,
      type: 'text',
      align:
        textCandidate.align === 'left' || textCandidate.align === 'right'
          ? textCandidate.align
          : 'center',
      writingMode: textCandidate.writingMode === 'vertical' ? 'vertical' : 'horizontal',
      rows,
      backgroundColor,
      foregroundColor,
    };
  }
  if (candidate.type === 'largeText') {
    const largeText = candidate as Partial<MetroWayfindingLargeTextElement>;
    const value = normalizeString(largeText.value, 160);
    return {
      id,
      type: 'largeText',
      value,
      // legacy：旧工程只有「末尾角标」，保留字段以便回退到老版本时不丢内容；
      // 真正的读取入口是 `suffixes` + `resolveMetroLargeTextSuffixes`。
      suffix: normalizeString(largeText.suffix, 24),
      suffixes: normalizeMetroLargeTextSuffixes(largeText.suffixes, Array.from(value).length),
      frameShape: normalizeMetroWayfindingFrameShape(
        (largeText as { frameShape?: unknown }).frameShape,
        (largeText as { framed?: unknown }).framed,
      ),
      frameFillMode: normalizeMetroWayfindingFrameFillMode(
        (largeText as { frameFillMode?: unknown }).frameFillMode,
      ),
      frameFillColor: normalizeOptionalColor(
        (largeText as { frameFillColor?: unknown }).frameFillColor,
      ),
      frameStroke: (largeText as { frameStroke?: unknown }).frameStroke === true,
      backgroundColor,
      foregroundColor,
    };
  }
  if (candidate.type === 'combination') {
    const combination = candidate as Partial<MetroWayfindingCombinationElement>;
    return {
      id,
      type: 'combination',
      scale: normalizeMetroWayfindingCombinationScale(combination.scale),
      children: normalizeMetroWayfindingCombinationChildren(combination.children),
      frameFillMode: normalizeMetroWayfindingCombinationFillMode(combination.frameFillMode),
      frameFillColor: normalizeOptionalColor(combination.frameFillColor),
      frameStroke: combination.frameStroke === true,
      stripePosition:
        combination.stripePosition === 'right' || combination.stripePosition === 'bottom'
          ? combination.stripePosition
          : 'left',
      backgroundColor,
      foregroundColor,
    };
  }
  if (candidate.type === 'space') {
    const space = candidate as Partial<MetroWayfindingSpaceElement>;
    return {
      id,
      type: 'space',
      mode: space.mode === 'flex' ? 'flex' : 'fixed',
      units: Math.max(1, Math.min(32, Math.round(Number(space.units) || 1))),
      backgroundColor,
      foregroundColor,
    };
  }
  if (candidate.type === 'divider') {
    return { id, type: 'divider', backgroundColor, foregroundColor };
  }
  return null;
}

function normalizeMetroWayfindingFrameShape(
  frameShape: unknown,
  legacyFramed: unknown,
): MetroWayfindingFrameShape {
  return frameShape === 'rectangle' || frameShape === 'circle'
    ? frameShape
    : legacyFramed === true
      ? 'rectangle'
      : 'none';
}

function normalizeMetroWayfindingFrameFillMode(value: unknown): MetroWayfindingFrameFillMode {
  return value === 'inverse' || value === 'color' ? value : 'none';
}

function normalizeMetroWayfindingCombinationFillMode(
  value: unknown,
): MetroWayfindingCombinationFillMode {
  return value === 'stripe' ? value : normalizeMetroWayfindingFrameFillMode(value);
}

function normalizeMetroWayfindingCombinationScale(value: unknown): number {
  const scale = Number(value);
  return Math.max(
    METRO_WAYFINDING_COMBINATION_MIN_SCALE,
    Math.min(
      METRO_WAYFINDING_COMBINATION_MAX_SCALE,
      Number.isFinite(scale)
        ? Math.round(scale * 100) / 100
        : METRO_WAYFINDING_COMBINATION_DEFAULT_SCALE,
    ),
  );
}

function formatMetroWayfindingScale(value: number): string {
  return `${Math.round(normalizeMetroWayfindingCombinationScale(value) * 100) / 100} 倍`;
}

function normalizeMetroWayfindingCombinationChildren(
  value: unknown,
): MetroWayfindingCombinationChild[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, 32)
    .filter((child) => {
      if (!child || typeof child !== 'object') return false;
      const type = (child as { type?: unknown }).type;
      return (
        type === 'icon' ||
        type === 'facility' ||
        type === 'text' ||
        type === 'arrow' ||
        type === 'largeText' ||
        type === 'space'
      );
    })
    .map(normalizeMetroWayfindingElement)
    .filter(
      (element): element is MetroWayfindingCombinationChild =>
        element?.type === 'facility' ||
        element?.type === 'arrow' ||
        element?.type === 'text' ||
        element?.type === 'largeText' ||
        element?.type === 'space',
    );
}

function normalizeMainSegments(value: unknown): MetroWayfindingMainSegment[] {
  if (!Array.isArray(value)) {
    return [{ kind: 'text', value: '' }];
  }
  const segments = value
    .map((segment): MetroWayfindingMainSegment | null => {
      if (!segment || typeof segment !== 'object') {
        return null;
      }
      const candidate = segment as Partial<MetroWayfindingMainSegment>;
      if (candidate.kind === 'line') {
        return {
          kind: 'line',
          value: normalizeString(candidate.value, 20),
          color: normalizeColor(candidate.color, METRO_WAYFINDING_FOREGROUND),
        };
      }
      if (candidate.kind === 'boxed') {
        return { kind: 'boxed', value: normalizeString(candidate.value, 160) };
      }
      return { kind: 'text', value: normalizeString(candidate.value, 160) };
    })
    .filter((segment): segment is MetroWayfindingMainSegment => Boolean(segment));
  return segments.length ? segments : [{ kind: 'text', value: '' }];
}

function normalizeTextRows(value: unknown[], elementId: string): MetroWayfindingTextRow[] {
  const usedIds = new Set<string>();
  const rows = value
    .slice(0, 32)
    .map((row, index): MetroWayfindingTextRow | null => {
      if (!row || typeof row !== 'object') {
        return null;
      }
      const candidate = row as Partial<MetroWayfindingTextRow>;
      const fallbackId = legacyTextRowId(elementId, `row-${index + 1}`);
      const candidateId =
        typeof candidate.id === 'string' && candidate.id ? candidate.id.slice(0, 80) : fallbackId;
      const id = usedIds.has(candidateId) ? fallbackId : candidateId;
      usedIds.add(id);
      if (candidate.kind === 'secondary') {
        return {
          id,
          kind: 'secondary',
          value: normalizeString(candidate.value, 160),
          bold: false,
        };
      }
      if (candidate.kind === 'main') {
        return {
          id,
          kind: 'main',
          segments: normalizeMainSegments(candidate.segments),
        };
      }
      return null;
    })
    .filter((row): row is MetroWayfindingTextRow => Boolean(row));
  return rows.length
    ? rows
    : [
        {
          id: legacyTextRowId(elementId, 'main-1'),
          kind: 'main',
          segments: [{ kind: 'text', value: '' }],
        },
        {
          id: legacyTextRowId(elementId, 'secondary-1'),
          kind: 'secondary',
          value: '',
          bold: false,
        },
      ];
}

function migrateLegacyTextRows(
  candidate: {
    mode?: unknown;
    main?: unknown;
    secondary?: unknown;
    secondMain?: unknown;
    secondSecondary?: unknown;
  },
  elementId: string,
): MetroWayfindingTextRow[] {
  const firstMain: MetroWayfindingMainTextRow = {
    id: legacyTextRowId(elementId, 'main-1'),
    kind: 'main',
    segments: normalizeMainSegments(candidate.main),
  };
  if (candidate.mode !== 'double') {
    return [
      firstMain,
      {
        id: legacyTextRowId(elementId, 'secondary-1'),
        kind: 'secondary',
        value: normalizeString(candidate.secondary, 160),
        bold: false,
      },
    ];
  }
  return [
    firstMain,
    {
      id: legacyTextRowId(elementId, 'secondary-1'),
      kind: 'secondary',
      value: normalizeString(candidate.secondSecondary, 160),
      bold: false,
    },
    {
      id: legacyTextRowId(elementId, 'main-2'),
      kind: 'main',
      segments: normalizeMainSegments(candidate.secondMain),
    },
    {
      id: legacyTextRowId(elementId, 'secondary-2'),
      kind: 'secondary',
      value: normalizeString(candidate.secondary, 160),
      bold: false,
    },
  ];
}

function legacyTextRowId(elementId: string, suffix: string): string {
  return `${elementId.slice(0, 56)}-${suffix}`;
}

function normalizeString(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.slice(0, maxLength) : '';
}

/**
 * 归一化大文本的下角标列表：`at` 收敛到 [0, 正文码点数] 并排序，空值丢弃。
 * 空数组是合法结果（没有下角标），不要退化成 undefined——否则
 * `resolveMetroLargeTextSuffixes` 会误以为要走 legacy `suffix` 兜底。
 */
function normalizeMetroLargeTextSuffixes(
  value: unknown,
  length: number,
): MetroWayfindingLargeTextSuffix[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const raw = item as Partial<MetroWayfindingLargeTextSuffix>;
      const at = Math.round(Number(raw?.at) || 0);
      return { at: Math.max(0, Math.min(length, at)), value: normalizeString(raw?.value, 24) };
    })
    .filter((item) => item.value.length > 0)
    .sort((left, right) => left.at - right.at);
}

function normalizeOptionalColor(value: unknown): string | undefined {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
    ? value.toUpperCase()
    : undefined;
}
