export const METRO_WAYFINDING_TEMPLATE_ID = 'system_material_metro_wayfinding';
export const METRO_WAYFINDING_BACKGROUND = '#262626';
export const METRO_WAYFINDING_FOREGROUND = '#FFFFFF';
export const METRO_WAYFINDING_GAP = 16;
export const METRO_WAYFINDING_PADDING = 22;
export const METRO_WAYFINDING_HEIGHT = 128;
export const METRO_WAYFINDING_TEXT_HEIGHT = 85;

export const metroWayfindingBackgroundPalette = [
  { value: '#262626', label: '深灰色' },
  { value: '#F2C94C', label: '黄色' },
  { value: '#FFFFFF', label: '白色' },
  { value: '#8A8A8A', label: '灰色' },
  { value: '#123A63', label: '深蓝色' },
  { value: '#14532D', label: '深绿色' },
] as const;

export const metroWayfindingForegroundPalette = [
  { value: '#FFFFFF', label: '白色' },
  { value: '#F2C94C', label: '黄色' },
  { value: '#111111', label: '黑色' },
  { value: '#8ED8FF', label: '浅蓝色' },
] as const;

export type MetroWayfindingColor = string;
export type MetroWayfindingIconGroup = 'facility' | 'arrow';
export type MetroWayfindingIconDirection = 'left' | 'right' | 'up' | 'down';
export type MetroFacilityIconAssetName =
  | 'stairs-up'
  | 'stairs-down'
  | 'escalator'
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
    defaultForegroundColor: '#E53935',
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

export type MetroWayfindingTextAlign = 'left' | 'center' | 'right';
export type MetroWayfindingSpaceMode = 'fixed' | 'flex';

export function resolveMetroFacilityIconAssetName(
  iconId: string,
  direction?: MetroWayfindingIconDirection,
): MetroFacilityIconAssetName | undefined {
  const option = metroWayfindingIconOptions.find((item) => item.id === iconId);
  return option?.assetNameByDirection?.[direction ?? 'right'] ?? option?.assetName;
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

export type MetroWayfindingMainSegment = MetroWayfindingTextSegment | MetroWayfindingLineSegment;

export interface MetroWayfindingMainTextRow {
  id: string;
  kind: 'main';
  segments: MetroWayfindingMainSegment[];
}

export interface MetroWayfindingSecondaryTextRow {
  id: string;
  kind: 'secondary';
  value: string;
}

export type MetroWayfindingTextRow = MetroWayfindingMainTextRow | MetroWayfindingSecondaryTextRow;

export interface MetroWayfindingIconElement {
  id: string;
  type: 'icon';
  iconId: string;
  direction?: MetroWayfindingIconDirection;
  framed: boolean;
  backgroundColor?: MetroWayfindingColor;
  foregroundColor?: MetroWayfindingColor;
}

export interface MetroWayfindingTextElement {
  id: string;
  type: 'text';
  align: MetroWayfindingTextAlign;
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
  framed: boolean;
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

export type MetroWayfindingElement =
  | MetroWayfindingIconElement
  | MetroWayfindingTextElement
  | MetroWayfindingLargeTextElement
  | MetroWayfindingSpaceElement
  | MetroWayfindingDividerElement;

export interface MetroWayfindingLayout {
  backgroundColor: MetroWayfindingColor;
  foregroundColor: MetroWayfindingColor;
  elements: MetroWayfindingElement[];
}

export const emptyMetroWayfindingLayout: MetroWayfindingLayout = {
  backgroundColor: METRO_WAYFINDING_BACKGROUND,
  foregroundColor: METRO_WAYFINDING_FOREGROUND,
  elements: [],
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
    : { id: createMetroWayfindingId('text-secondary'), kind, value: '' };
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
    secondaryFontSize: (mainFontSize * 2) / 3,
    spacing: mainFontSize / 6,
    contentHeight: METRO_WAYFINDING_TEXT_HEIGHT,
  };
}

export function createMetroWayfindingElement(
  type: MetroWayfindingElement['type'],
  iconId = 'stairs',
): MetroWayfindingElement {
  const id = createMetroWayfindingId(type);
  if (type === 'icon') {
    const icon = metroWayfindingIconOptions.find((option) => option.id === iconId);
    return {
      id,
      type,
      iconId,
      framed: false,
      foregroundColor: icon?.defaultForegroundColor,
    };
  }
  if (type === 'text') {
    return {
      id,
      type,
      align: 'center',
      rows: [createMetroWayfindingTextRow('main')],
    };
  }
  if (type === 'largeText') {
    return { id, type, value: '', suffix: '', framed: false };
  }
  if (type === 'space') {
    return { id, type, mode: 'fixed', units: 1 };
  }
  return { id, type };
}

export function parseMetroWayfindingLayout(value: string): MetroWayfindingLayout {
  try {
    const candidate = JSON.parse(value) as Partial<MetroWayfindingLayout>;
    const elements = Array.isArray(candidate.elements)
      ? candidate.elements.map(normalizeMetroWayfindingElement).filter(Boolean)
      : [];
    return {
      backgroundColor: normalizeColor(candidate.backgroundColor, METRO_WAYFINDING_BACKGROUND),
      foregroundColor: normalizeColor(candidate.foregroundColor, METRO_WAYFINDING_FOREGROUND),
      elements: elements as MetroWayfindingElement[],
    };
  } catch {
    return emptyMetroWayfindingLayout;
  }
}

export function serializeMetroWayfindingLayout(layout: MetroWayfindingLayout): string {
  return JSON.stringify(layout);
}

export function normalizeColor(value: unknown, fallback: string): string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
    ? value.toUpperCase()
    : fallback;
}

function normalizeMetroWayfindingElement(value: unknown): MetroWayfindingElement | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const candidate = value as Partial<MetroWayfindingElement> & { id?: unknown; type?: unknown };
  const id = typeof candidate.id === 'string' && candidate.id ? candidate.id.slice(0, 80) : null;
  if (!id) {
    return null;
  }
  const backgroundColor = normalizeOptionalColor(candidate.backgroundColor);
  const foregroundColor = normalizeOptionalColor(candidate.foregroundColor);
  if (candidate.type === 'icon') {
    const candidateIconId = typeof candidate.iconId === 'string' ? candidate.iconId : '';
    const iconId = metroWayfindingIconOptions.some((item) => item.id === candidateIconId)
      ? candidateIconId
      : 'stairs';
    const icon = metroWayfindingIconOptions.find((item) => item.id === iconId);
    return {
      id,
      type: 'icon',
      iconId,
      direction:
        candidate.direction === 'left' ||
        candidate.direction === 'right' ||
        candidate.direction === 'up' ||
        candidate.direction === 'down'
          ? candidate.direction
          : undefined,
      framed: candidate.framed === true,
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
      framed: largeText.framed === true,
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
      },
    ];
  }
  return [
    firstMain,
    {
      id: legacyTextRowId(elementId, 'secondary-1'),
      kind: 'secondary',
      value: normalizeString(candidate.secondSecondary, 160),
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
