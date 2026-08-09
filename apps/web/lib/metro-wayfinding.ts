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
export const METRO_WAYFINDING_COMBINATION_MIN_WIDTH = 85;
export const METRO_WAYFINDING_COMBINATION_PADDING = 8;
export const METRO_WAYFINDING_COMBINATION_STRIPE_WIDTH = 24;
export const METRO_WAYFINDING_COMBINATION_STRIPE_TOP = 20;
export const METRO_WAYFINDING_COMBINATION_FLEX_MIN_WIDTH = 16;
export const METRO_WAYFINDING_PROJECT_FORMAT = 'yct.metro-wayfinding.project';
export const METRO_WAYFINDING_PROJECT_SCHEMA_VERSION = 1;

export const metroWayfindingBackgroundPalette = [
  { value: '#262626', label: '深灰色' },
  { value: '#F2C94C', label: '黄色' },
  { value: '#FFFFFF', label: '白色' },
  { value: '#4A4E54', label: '灰色' },
  { value: '#0A124D', label: '深蓝色' },
  { value: '#085E41', label: '深绿色' },
] as const;

export const metroWayfindingForegroundPalette = [
  { value: '#FFFFFF', label: '白色' },
  { value: '#F2C94C', label: '黄色' },
  { value: '#111111', label: '黑色' },
  { value: '#8ED8FF', label: '浅蓝色' },
  { value: METRO_WAYFINDING_WARNING_FOREGROUND, label: '警告红' },
] as const;

export type MetroWayfindingColor = string;
export type MetroWayfindingIconGroup = 'facility' | 'arrow';
export type MetroWayfindingIconDirection = 'left' | 'right' | 'up' | 'down';
export type MetroFacilityIconAssetName =
  | 'stairs-up'
  | 'stairs-down'
  | 'escalator'
  | 'escalator-and-stairs'
  | 'accessible-elevator'
  | 'restroom'
  | 'mens-restroom'
  | 'womens-restroom'
  | 'third-restroom'
  | 'nursing-room'
  | 'wheelchair-lift'
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
  defaultForegroundColor?: string;
}

export const metroWayfindingIconOptions: MetroWayfindingIconOption[] = [
  {
    id: 'stairs',
    label: '上楼',
    symbol: 'stairs',
    group: 'facility',
    assetName: 'stairs-up',
  },
  {
    id: 'stairs-down',
    label: '下楼',
    symbol: 'stairs',
    group: 'facility',
    assetName: 'stairs-down',
  },
  {
    id: 'escalator',
    label: '扶梯',
    symbol: 'escalator',
    group: 'facility',
    assetName: 'escalator',
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
    label: '第三卫生间',
    symbol: 'family_restroom',
    group: 'facility',
    assetName: 'third-restroom',
  },
  {
    id: 'wheelchair-lift',
    label: '轮椅升降机',
    symbol: 'elevator',
    group: 'facility',
    assetName: 'wheelchair-lift',
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
  { id: 'wheelchair', label: '轮椅', symbol: 'accessible', group: 'facility' },
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
): MetroFacilityIconAssetName | undefined {
  const option = metroWayfindingIconOptions.find((item) => item.id === iconId);
  return option?.assetNameByDirection?.[direction ?? 'right'] ?? option?.assetName;
}

export function resolveMetroArrowIconAssetName(
  iconId: string,
): MetroArrowIconAssetName | undefined {
  return metroWayfindingArrowOptions.some((option) => option.id === iconId)
    ? (iconId as MetroArrowIconAssetName)
    : undefined;
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

export interface MetroWayfindingLargeTextElement {
  id: string;
  type: 'largeText';
  value: string;
  suffix: string;
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
    : { id: createMetroWayfindingId('text-secondary'), kind, value: '', bold: true };
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
    const mainFontSize =
      element.frameShape !== 'none'
        ? METRO_WAYFINDING_LARGE_TEXT_FRAMED_FONT_SIZE
        : METRO_WAYFINDING_LARGE_TEXT_UNFRAMED_FONT_SIZE;
    const suffixGap = element.value && element.suffix ? 3 : 0;
    const contentWidth =
      estimateMetroWayfindingLargeTextWidth(element.value, mainFontSize) +
      suffixGap +
      estimateMetroWayfindingLargeTextWidth(
        element.suffix,
        METRO_WAYFINDING_LARGE_TEXT_SUFFIX_FONT_SIZE,
      );
    return Math.max(85, contentWidth + 8);
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
  const elementWidths = element.children.map(resolveMetroWayfindingElementWidth);
  const gapWidth = Math.max(element.children.length - 1, 0) * METRO_WAYFINDING_GAP;
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
  bold: boolean,
): number {
  return estimateMetroWayfindingTextWidth(value, fontSize) * (bold ? 1.06 : 1);
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
        if (element.type === 'largeText') return [`${element.value}${element.suffix}`];
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
    return `大文字：${`${element.value}${element.suffix}` || '空白'}`;
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
  if (element.type === 'largeText') return [`${element.value}${element.suffix}`];
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
    const candidateIconId = typeof candidate.iconId === 'string' ? candidate.iconId : '';
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
    return {
      id,
      type,
      iconId,
      direction:
        candidate.direction === 'left' ||
        candidate.direction === 'right' ||
        candidate.direction === 'up' ||
        candidate.direction === 'down'
          ? candidate.direction
          : undefined,
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
    return {
      id,
      type: 'largeText',
      value: normalizeString(largeText.value, 160),
      suffix: normalizeString(largeText.suffix, 24),
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
        type === 'largeText' ||
        type === 'space'
      );
    })
    .map(normalizeMetroWayfindingElement)
    .filter(
      (element): element is MetroWayfindingCombinationChild =>
        element?.type === 'facility' ||
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
          bold: true,
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
          bold: true,
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
        bold: true,
      },
    ];
  }
  return [
    firstMain,
    {
      id: legacyTextRowId(elementId, 'secondary-1'),
      kind: 'secondary',
      value: normalizeString(candidate.secondSecondary, 160),
      bold: true,
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
      bold: true,
    },
  ];
}

function legacyTextRowId(elementId: string, suffix: string): string {
  return `${elementId.slice(0, 56)}-${suffix}`;
}

function normalizeString(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.slice(0, maxLength) : '';
}

function normalizeOptionalColor(value: unknown): string | undefined {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
    ? value.toUpperCase()
    : undefined;
}
