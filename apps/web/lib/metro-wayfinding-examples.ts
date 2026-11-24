import type {
  MetroWayfindingColor,
  MetroWayfindingElement,
  MetroWayfindingLayout,
  MetroWayfindingLayoutSummary,
  MetroWayfindingMainSegment,
  MetroWayfindingProjectFile,
} from './metro-wayfinding';
import {
  extractMetroWayfindingLineNumber,
  METRO_WAYFINDING_FOREGROUND,
  METRO_WAYFINDING_PROJECT_FORMAT,
  METRO_WAYFINDING_PROJECT_SCHEMA_VERSION,
  METRO_WAYFINDING_TEMPLATE_ID,
  resolveMetroWayfindingLayoutSizing,
  summarizeMetroWayfindingLayout,
} from './metro-wayfinding';
import { toUppercasePinyin } from './chinese-pinyin';

export interface MetroWayfindingExampleSource {
  id: string;
  label: string;
  remark: string;
  category: 'entry' | 'transfer' | 'exit';
}

export interface MetroWayfindingExample {
  source: MetroWayfindingExampleSource;
  project: MetroWayfindingProjectFile;
  summary: MetroWayfindingLayoutSummary;
}

export interface MetroWayfindingExampleLine {
  id: string;
  name: string;
  secondaryName?: string;
  color: MetroWayfindingColor;
  terminalStations?: ReadonlyArray<{ name: string; secondaryName?: string }>;
}

export interface MetroWayfindingExampleExit {
  code: string;
  direction?: 'upwards' | 'downwards';
  orientation?: 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';
  status?: 'open' | 'closed' | 'reserved';
  description?: string;
  order?: number;
  /** 该出口是否带无障碍电梯/升降机；没有字段时由 description 关键词推断。 */
  hasAccessibleElevator?: boolean;
}

/**
 * 服务器线网的站内资料是按「线路 + 车站」存的：同一换乘站在不同线路下可能有
 * 不同的出口列表/方向。模板库据此区分「当前线路出口」与「当前线路没有的出口」。
 */
export interface MetroWayfindingExampleLineExits {
  lineId: string;
  lineName: string;
  exits: readonly MetroWayfindingExampleExit[];
  hasElevator?: boolean;
}

export interface MetroWayfindingExampleStation {
  name: string;
  secondaryName?: string;
  lines: readonly MetroWayfindingExampleLine[];
  /** 自定义线网：没有按线路拆分的出口，直接给全站出口。 */
  exits?: readonly MetroWayfindingExampleExit[];
  /** 服务器线网：每个线路一份出口资料。 */
  lineExits?: readonly MetroWayfindingExampleLineExits[];
  /** 地上站/地面站；用于选择进站/出站示例模板。 */
  overGround?: boolean;
}

interface MetroExampleBuilder {
  facility: (
    iconId: string,
    direction?: 'left' | 'right' | 'up' | 'down',
  ) => MetroWayfindingElement;
  arrow: (iconId: string) => MetroWayfindingElement;
  text: (
    main: string | Array<{ kind: 'text' | 'line' | 'boxed'; value: string; color?: string }>,
    secondary?: string,
    align?: 'left' | 'center' | 'right',
    writingMode?: 'horizontal' | 'vertical',
  ) => Extract<MetroWayfindingElement, { type: 'text' }>;
  large: (
    value: string,
    options?: {
      suffix?: string;
      frameShape?: 'none' | 'rectangle' | 'circle';
      frameFillMode?: 'none' | 'inverse' | 'color';
      frameFillColor?: string;
    },
  ) => MetroWayfindingElement;
  space: (mode?: 'fixed' | 'flex', units?: number) => MetroWayfindingElement;
  divider: () => MetroWayfindingElement;
  combination: (
    children: MetroWayfindingElement[],
    options?: Partial<Extract<MetroWayfindingElement, { type: 'combination' }>>,
  ) => MetroWayfindingElement;
}

function createMetroExampleBuilder(): MetroExampleBuilder {
  let sequence = 0;
  const nextId = (prefix: string) => `example-${prefix}-${sequence++}`;
  const facility = (iconId: string, direction?: 'left' | 'right' | 'up' | 'down') => ({
    id: nextId('facility'),
    type: 'facility' as const,
    iconId,
    ...(direction ? { direction } : {}),
    frameShape: iconId === 'no-entry' ? ('none' as const) : ('rectangle' as const),
    frameFillMode: 'none' as const,
    frameStroke: false,
  });
  const arrow = (iconId: string) => ({
    id: nextId('arrow'),
    type: 'arrow' as const,
    iconId,
    framed: false,
    frameFillMode: 'none' as const,
    frameStroke: false,
  });
  const text = (
    main: string | Array<{ kind: 'text' | 'line' | 'boxed'; value: string; color?: string }>,
    secondary = '',
    align: 'left' | 'center' | 'right' = 'left',
    writingMode: 'horizontal' | 'vertical' = 'horizontal',
  ) => {
    const mainSegments: MetroWayfindingMainSegment[] =
      typeof main === 'string'
        ? [{ kind: 'text', value: main }]
        : main.map((segment): MetroWayfindingMainSegment =>
            segment.kind === 'line'
              ? {
                  kind: 'line',
                  value: segment.value,
                  color: segment.color ?? METRO_WAYFINDING_FOREGROUND,
                }
              : segment.kind === 'boxed'
                ? { kind: 'boxed', value: segment.value }
                : { kind: 'text', value: segment.value },
          );
    return {
      id: nextId('text'),
      type: 'text' as const,
      align,
      writingMode,
      rows: [
        { id: nextId('main'), kind: 'main' as const, segments: mainSegments },
        { id: nextId('secondary'), kind: 'secondary' as const, value: secondary, bold: false },
      ],
    };
  };
  const large = (
    value: string,
    options: {
      suffix?: string;
      frameShape?: 'none' | 'rectangle' | 'circle';
      frameFillMode?: 'none' | 'inverse' | 'color';
      frameFillColor?: string;
    } = {},
  ) => ({
    id: nextId('large'),
    type: 'largeText' as const,
    value,
    suffix: options.suffix ?? '',
    frameShape: options.frameShape ?? ('rectangle' as const),
    frameFillMode: options.frameFillMode ?? ('none' as const),
    ...(options.frameFillColor ? { frameFillColor: options.frameFillColor } : {}),
    frameStroke: false,
  });
  const space = (mode: 'fixed' | 'flex' = 'flex', units = 1) => ({
    id: nextId('space'),
    type: 'space' as const,
    mode,
    units,
  });
  const divider = () => ({ id: nextId('divider'), type: 'divider' as const });
  const combination = (
    children: MetroWayfindingElement[],
    options: Partial<Extract<MetroWayfindingElement, { type: 'combination' }>> = {},
  ) => ({
    id: nextId('combination'),
    type: 'combination' as const,
    scale: 0.65,
    children: children as Extract<MetroWayfindingElement, { type: 'combination' }>['children'],
    frameFillMode: 'none' as const,
    frameStroke: false,
    stripePosition: 'left' as const,
    ...options,
  });
  return { facility, arrow, text, large, space, divider, combination };
}

function createMetroExampleProject(
  layout: MetroWayfindingLayout,
  widthM: number,
  heightM: number,
): MetroWayfindingProjectFile {
  const canvas = {
    widthM,
    heightM,
    pxPerMeter: 128,
    alignToTile: false,
    tileSizePx: 128,
  };
  return {
    format: METRO_WAYFINDING_PROJECT_FORMAT,
    schemaVersion: METRO_WAYFINDING_PROJECT_SCHEMA_VERSION,
    template: { id: METRO_WAYFINDING_TEMPLATE_ID, version: 1 },
    canvas,
    layout,
    exportedAt: '',
  };
}

function buildMetroExampleLineSegments(
  lines: readonly MetroWayfindingExampleLine[],
): Array<{ kind: 'text' | 'line'; value: string; color?: string }> {
  if (!lines.length) return [{ kind: 'text', value: '' }];
  // 线路编号统一走 extractMetroWayfindingLineNumber：
  // 「2号线」→「2」、「S1线」→「S1」、「环线」→「环」。之前只去掉「号线」后缀，
  // 会把「S1线」整串当编号，与其他位置显示的编号对不上。
  return [
    ...lines.flatMap((line) => [
      {
        kind: 'line' as const,
        value: extractMetroWayfindingLineNumber(line.name),
        color: line.color,
      },
    ]),
    { kind: 'text', value: '号线' },
  ];
}

function buildMetroExampleLineSecondary(lines: readonly MetroWayfindingExampleLine[]): string {
  return lines
    .map(
      (line) =>
        line.secondaryName?.trim() || `Line ${extractMetroWayfindingLineNumber(line.name)}`.trim(),
    )
    .filter(Boolean)
    .join(' / ');
}

function buildMetroExampleTerminalText(
  terminal: { name: string; secondaryName?: string } | undefined,
): {
  main: string;
  secondary: string;
} {
  const secondaryName = terminal?.secondaryName?.trim() || toUppercasePinyin(terminal?.name ?? '');
  return {
    main: terminal ? `开往${terminal.name}` : '开往',
    secondary: secondaryName ? `To ${secondaryName}` : 'To ',
  };
}

/**
 * 本站就是线路终点站时，双向标识朝终点的那一侧不再写「开往」（对端不存在），
 * 改成「终点本站 / 本站 Terminus」，并由调用方把该侧地铁图标换成圆形外框。
 */
function buildMetroExampleTerminusText(station: { name: string; secondaryName?: string }): {
  main: string;
  secondary: string;
} {
  const stationName = station.name.trim();
  const secondaryName = station.secondaryName?.trim() || toUppercasePinyin(stationName);
  return {
    main: `终点${stationName}`,
    secondary: secondaryName ? `${secondaryName} Terminus` : 'Terminus',
  };
}

/** 出口是否带无障碍电梯/升降机：优先看数据字段，否则看描述关键词。 */
export function hasAccessibleElevatorExit(
  exit: Pick<MetroWayfindingExampleExit, 'description' | 'hasAccessibleElevator'>,
): boolean {
  if (exit.hasAccessibleElevator) return true;
  return /无障碍\s*(?:电梯|升降机|直梯)|(?:电梯|升降机|直梯)\s*无障碍/u.test(
    exit.description ?? '',
  );
}

/** 双侧/换乘分组时把 A1/A2 合并成 A；L1/L2 是独立出入口，保持原样。 */
function mergeExitCodeForGrouping(code: string): string {
  const text = code.normalize('NFKC').trim();
  const matched = /^([A-Za-z])(\d+)$/u.exec(text);
  if (!matched) return text;
  return matched[1]!.toUpperCase() === 'L' ? text : matched[1]!;
}

function mergeExitCodesForGrouping(codes: readonly string[]): string[] {
  return Array.from(new Set(codes.map(mergeExitCodeForGrouping)));
}

function mergeExitSides(sides: { left: string[]; right: string[] }): {
  left: string[];
  right: string[];
} {
  const left = mergeExitCodesForGrouping(sides.left);
  const leftSet = new Set(left);
  const right = mergeExitCodesForGrouping(sides.right).filter((code) => !leftSet.has(code));
  return { left, right };
}

/** 出口空位只吃“正常开放”的出口；暂停/预留不上海报。 */
function sortedUsableExits(
  exits: readonly MetroWayfindingExampleExit[] | undefined,
): MetroWayfindingExampleExit[] {
  return [...(exits ?? [])]
    .filter((exit) => exit.status !== 'closed' && exit.status !== 'reserved')
    .sort(
      (left, right) =>
        (left.order ?? Number.POSITIVE_INFINITY) - (right.order ?? Number.POSITIVE_INFINITY) ||
        left.code.localeCompare(right.code, 'zh-CN', { numeric: true, sensitivity: 'base' }),
    );
}

function uniqueExitsByCode(
  exits: readonly MetroWayfindingExampleExit[],
): MetroWayfindingExampleExit[] {
  const seen = new Set<string>();
  return exits.filter((exit) => {
    if (seen.has(exit.code)) return false;
    seen.add(exit.code);
    return true;
  });
}

/**
 * 当前线路 / 当前线路没有的出口。
 *
 * 服务器线网按「线路 + 车站」存 stationDetails；同一换乘站可能有多份出口列表。
 * 当前线路出口 = 当前线路那份详情里的 exits；其它线路出口 = 其它线路详情里、
 * 当前线路没有的编号。自定义线网没有按线路拆分，全部算当前线路。
 */
function resolveExitContext(
  station: MetroWayfindingExampleStation | undefined,
  selectedLineId: string | undefined,
): {
  current: readonly MetroWayfindingExampleExit[];
  other: readonly MetroWayfindingExampleExit[];
  hasElevator: boolean;
} {
  const lineExits = station?.lineExits ?? [];
  const currentEntry = lineExits.find((entry) => entry.lineId === selectedLineId) ?? lineExits[0];
  const current = currentEntry?.exits ?? station?.exits ?? [];
  const currentCodes = new Set(current.map((exit) => exit.code));
  const other = uniqueExitsByCode(
    lineExits
      .filter((entry) => entry !== currentEntry)
      .flatMap((entry) => entry.exits)
      .filter((exit) => !currentCodes.has(exit.code)),
  );
  return { current, other, hasElevator: Boolean(currentEntry?.hasElevator) };
}

/**
 * 双侧出口编号：按站内结构里的“站厅侧”（direction）分左右。
 * 上行侧→左、下行侧→右；没有方向信息的按自然序补到较短的一侧。
 */
function splitExitCodesByDirection(exits: readonly MetroWayfindingExampleExit[]): {
  left: string[];
  right: string[];
} {
  const usable = sortedUsableExits(exits);
  const upwards = usable.filter((exit) => exit.direction === 'upwards').map((exit) => exit.code);
  const downwards = usable
    .filter((exit) => exit.direction === 'downwards')
    .map((exit) => exit.code);
  const unknown = usable.filter((exit) => !exit.direction).map((exit) => exit.code);
  if (!upwards.length && !downwards.length) {
    const half = Math.ceil(unknown.length / 2);
    return { left: unknown.slice(0, half), right: unknown.slice(half) };
  }
  const left = [...upwards];
  const right = [...downwards];
  for (const code of unknown) {
    (left.length <= right.length ? left : right).push(code);
  }
  return { left, right };
}

/** 出口太多、单行放不下时：把连续大文本区域换成两行方框文本，按第一行/第二行交替排。 */
function buildExitGrid(
  codes: readonly string[],
  b: MetroExampleBuilder,
  align: 'left' | 'center' | 'right' = 'center',
): Extract<MetroWayfindingElement, { type: 'text' }> {
  const rows: string[][] = [[], []];
  codes.forEach((code, index) => {
    rows[index % 2]!.push(code);
  });
  const visibleRows = rows.filter((row) => row.length);
  const element = b.text(
    (visibleRows[0] ?? []).map((value) => ({ kind: 'boxed' as const, value })),
    '',
    align,
  );
  element.rows = visibleRows.map((row, index) => ({
    id: `${element.id}-row-${index}`,
    kind: 'main' as const,
    segments: row.map((value) => ({ kind: 'boxed' as const, value })),
  }));
  return element;
}

function splitExitCodeForLargeText(code: string): { main: string; suffix: string } {
  const text = code.normalize('NFKC').trim();
  const matched = text.match(/^([A-Za-z]+|\d+)([\s\S]*)$/u);
  return matched ? { main: matched[1]!, suffix: matched[2] ?? '' } : { main: text, suffix: '' };
}

function buildExitLargeText(code: string, b: MetroExampleBuilder): MetroWayfindingElement {
  const { main, suffix } = splitExitCodeForLargeText(code);
  return b.large(main, suffix ? { suffix } : undefined);
}

/**
 * 生成一组出口大文本：每个大文本只放一个编号；出口编号按「第一段连续字母/数字 + 下标」
 * 拆开（C1 → C₁、L1 → L₁）。是否换成两行方框文本由整行宽度决定，不按个数阈值。
 */
function buildExitSlots(
  codes: readonly string[],
  b: MetroExampleBuilder,
): MetroWayfindingElement[] {
  if (!codes.length) return [];
  return codes.map((code) => buildExitLargeText(code, b));
}

function isExitSlotLargeText(
  element: MetroWayfindingElement,
): element is Extract<MetroWayfindingElement, { type: 'largeText' }> {
  return (
    element.type === 'largeText' &&
    element.frameShape === 'rectangle' &&
    /^[A-Za-z]\d*$/u.test(element.value)
  );
}

function exitSlotCode(element: Extract<MetroWayfindingElement, { type: 'largeText' }>): string {
  return `${element.value}${element.suffix ?? ''}`;
}

/**
 * 出口大文本不按数量阈值换行：先把每个出口都排成大文本，等整行自然宽度已经要压缩
 * 一般文本时，才把这组连续大文本换成两行方框文本。分隔线左侧左对齐、右侧右对齐。
 */
function fitExitSlotRowsForWidth(
  elements: MetroWayfindingElement[],
  b: MetroExampleBuilder,
  widthM: number,
): MetroWayfindingElement[] {
  const sizing = resolveMetroWayfindingLayoutSizing(elements, widthM * 128);
  if (!sizing.isWidthInsufficient) return elements;
  const dividerIndex = elements.findIndex((element) => element.type === 'divider');
  const result: MetroWayfindingElement[] = [];
  let index = 0;
  while (index < elements.length) {
    const element = elements[index]!;
    if (!isExitSlotLargeText(element)) {
      result.push(element);
      index += 1;
      continue;
    }
    const start = index;
    const codes: string[] = [];
    while (index < elements.length && isExitSlotLargeText(elements[index]!)) {
      codes.push(
        exitSlotCode(elements[index]! as Extract<MetroWayfindingElement, { type: 'largeText' }>),
      );
      index += 1;
    }
    if (codes.length <= 1) {
      result.push(...elements.slice(start, index));
      continue;
    }
    const align = dividerIndex < 0 ? 'center' : start > dividerIndex ? 'right' : 'left';
    result.push(buildExitGrid(codes, b, align));
  }
  return result;
}

const exitDirectionEnglish: Record<string, string> = {
  东: 'East',
  南: 'South',
  西: 'West',
  北: 'North',
};

/** 「East Side」统一成「East-side」。 */
function normalizeExitEnglish(text: string): string {
  return text
    .replace(/\b(East|South|West|North)\s+Side\b/gi, (_match, direction: string) => {
      return `${direction}-side`;
    })
    .trim();
}

/** 单段中文 → 英文/拼音：优先把「XX路东」转成「XX East-side」。 */
function buildEnglishExitDescription(text: string): string {
  const riverBank = /^(.*?(?:河|江))\s*(?:河)?([东南西北])(?:岸|侧|边|部|面)?$/u.exec(text);
  const bankDirection = riverBank?.[2] ? exitDirectionEnglish[riverBank[2]] : undefined;
  if (riverBank?.[1] && bankDirection) {
    return `${toUppercasePinyin(riverBank[1].trim())} ${bankDirection}-side`.trim();
  }
  const match = /^(.*?)\s*路?\s*(东|南|西|北)\s*侧?$/u.exec(text);
  const direction = match?.[2] ? exitDirectionEnglish[match[2]] : undefined;
  if (match?.[1] && direction) {
    return `${toUppercasePinyin(match[1].trim())} ${direction}-side`.trim();
  }
  return toUppercasePinyin(text);
}

function splitMixedExitDescription(segment: string): { han: string; latin: string } {
  const han = (segment.match(/\p{Script=Han}[\p{Script=Han}\s、，,·\-—]*/gu) ?? []).join('').trim();
  const latin = (segment.match(/[A-Za-z][A-Za-z0-9\s'&.\-]*/gu) ?? []).join(' ').trim();
  return { han, latin };
}

/**
 * 出口描述拆成「中文主行 + 英文副行」的配对列表：
 * - 每段中文一个主行，英文副行紧跟在它后面。
 * - `/` 分隔的中英对（如「青年大街 路东/QINGNIANDAJIE East Side」）→ 一行中文 + 一行英文。
 * - 多段中文（如「建业街 路东/普济路 路北」）→ 两对，各自生成英文。
 * - 没有描述 → 一对「出口 / EXIT」。
 */
function splitSpacedDescription(part: string): string[] {
  const tokens = part.split(/\s+/u).filter(Boolean);
  if (tokens.length < 2) return [part];
  const segments: string[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    let segment = tokens[index]!;
    const next = tokens[index + 1];
    const nextIsRoadSide = next && /^(?:路[东南西北]|路[东南西北]侧|[东南西北]侧)$/u.test(next);
    const nextIsRiverBank =
      next &&
      /(?:河|江|湖|山|海|岛|桥)$/u.test(segment) &&
      /^(?:河)?[东南西北](?:岸|侧|边|部|面)?$/u.test(next);
    if (nextIsRoadSide || nextIsRiverBank) {
      segment += ` ${next}`;
      index += 1;
    }
    segments.push(segment);
  }
  return segments;
}

function buildExitDescriptionRows(
  description?: string,
): Array<{ main: string; secondary: string }> {
  const text = description?.trim() ?? '';
  if (!text || isPlaceholderExitDescription(text)) {
    return [{ main: '出口', secondary: 'EXIT' }];
  }
  const parts = text
    .split(/\s*[/／]\s*/u)
    .filter(Boolean)
    .flatMap((part) => (/[A-Za-z]/.test(part) ? [part] : splitSpacedDescription(part)));
  const rows: Array<{ main: string; secondary: string }> = [];
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index]!;
    const hasHan = /\p{Script=Han}/u.test(part);
    const hasLatin = /[A-Za-z]/.test(part);
    if (hasHan && hasLatin) {
      const split = splitMixedExitDescription(part);
      if (split.han.length <= 1 && split.latin.length <= 2) {
        rows.push({ main: part, secondary: '' });
        continue;
      }
      if (split.han) {
        const latinIsDirectionOnly = /^(East|South|West|North)[\s-]*Side$/iu.test(split.latin);
        rows.push({
          main: split.han,
          secondary: latinIsDirectionOnly
            ? buildEnglishExitDescription(split.han)
            : normalizeExitEnglish(split.latin),
        });
      } else if (split.latin) {
        rows.push({ main: '出口', secondary: normalizeExitEnglish(split.latin) });
      }
      continue;
    }
    if (hasHan) {
      const next = parts[index + 1];
      if (next && /[A-Za-z]/.test(next) && !/\p{Script=Han}/u.test(next)) {
        rows.push({ main: part, secondary: normalizeExitEnglish(next) });
        index += 1;
      } else {
        rows.push({ main: part, secondary: buildEnglishExitDescription(part) });
      }
      continue;
    }
    if (hasLatin) {
      const previous = rows.at(-1);
      if (previous && !previous.secondary) {
        previous.secondary = normalizeExitEnglish(part);
      } else {
        rows.push({ main: '出口', secondary: normalizeExitEnglish(part) });
      }
    }
  }
  return rows.length ? rows : [{ main: '出口', secondary: 'EXIT' }];
}

/** 数据源用「北口/南口…」填方位占位，不是真实出口描述，模板里应按无描述处理。 */
function isPlaceholderExitDescription(description: string): boolean {
  return /^(?:东|南|西|北|东北|东南|西南|西北)口$/u.test(description.trim());
}

/** 每个中文主行后面紧跟它的英文副行；文本元素左对齐。 */
function buildExitDescriptionElement(
  description: string | undefined,
  b: MetroExampleBuilder,
): Extract<MetroWayfindingElement, { type: 'text' }> {
  const rows = buildExitDescriptionRows(description);
  const first = rows[0] ?? { main: '出口', secondary: 'EXIT' };
  const element = b.text(first.main, '', 'left');
  element.rows = rows.flatMap((row, index) => {
    const mainRow = {
      id: `${element.id}-main-${index}`,
      kind: 'main' as const,
      segments: [{ kind: 'text' as const, value: row.main }],
    };
    return row.secondary
      ? [
          mainRow,
          {
            id: `${element.id}-secondary-${index}`,
            kind: 'secondary' as const,
            value: row.secondary,
            bold: false,
          },
        ]
      : [mainRow];
  });
  return element;
}

export function buildMetroWayfindingTemplateExamples(
  station: MetroWayfindingExampleStation | undefined,
  selectedLineId?: string,
): MetroWayfindingExample[] {
  const stationName = station?.name ?? '';
  const lines = [...(station?.lines ?? [])].sort((left, right) =>
    left.name.localeCompare(right.name, 'zh-CN', { numeric: true, sensitivity: 'base' }),
  );
  const primaryLine = lines[0];
  const secondaryLine = lines[1];
  const isTransferStation = lines.length > 1;
  const selectedLine = lines.find((line) => line.id === selectedLineId) ?? primaryLine;
  const linePair = secondaryLine ? [primaryLine!, secondaryLine] : primaryLine ? [primaryLine] : [];
  const lineSegments = buildMetroExampleLineSegments(linePair);
  const lineSecondary = buildMetroExampleLineSecondary(linePair);
  const selectedLineSegments = selectedLine ? buildMetroExampleLineSegments([selectedLine]) : [];
  const selectedLineSecondary = selectedLine ? buildMetroExampleLineSecondary([selectedLine]) : '';
  const b = createMetroExampleBuilder();
  const exitContext = resolveExitContext(station, selectedLine?.id);
  const currentExitCodes = sortedUsableExits(exitContext.current).map((exit) => exit.code);
  const otherExitCodes = sortedUsableExits(exitContext.other).map((exit) => exit.code);
  const groupedCurrentExitCodes = mergeExitCodesForGrouping(currentExitCodes);
  const groupedOtherExitCodes = mergeExitCodesForGrouping(otherExitCodes);
  const exitSides = mergeExitSides(splitExitCodesByDirection(exitContext.current));
  const sortedCurrentExits = sortedUsableExits(exitContext.current);
  const elevatorExit = sortedCurrentExits.find(hasAccessibleElevatorExit)?.code;
  const firstExitCode = currentExitCodes[0] ?? '';
  const examples: MetroWayfindingExample[] = [];
  let index = 0;
  const add = (
    category: MetroWayfindingExampleSource['category'],
    remark: string,
    elements: MetroWayfindingElement[],
    widthM: number,
    heightM = 1,
    backgroundColor = '#262626',
  ) => {
    const fittedElements = fitExitSlotRowsForWidth(elements, b, widthM);
    const layout: MetroWayfindingLayout = {
      backgroundColor,
      foregroundColor: METRO_WAYFINDING_FOREGROUND,
      mode: heightM > 1 && widthM <= 2 ? 'vertical' : 'single',
      dividerBetweenRows: false,
      rows: [fittedElements],
    };
    const project = createMetroExampleProject(layout, widthM, heightM);
    examples.push({
      source: {
        id: `metro-wayfinding-template-${index}`,
        label: `模板 ${index + 1}`,
        remark,
        category,
      },
      project,
      summary: summarizeMetroWayfindingLayout(layout, project.canvas),
    });
    index += 1;
  };

  // 进站相关
  add(
    'entry',
    '乘车与自动售票',
    [
      b.arrow('west'),
      b.facility('subway'),
      b.text(
        isTransferStation ? lineSegments : '乘车',
        isTransferStation ? lineSecondary : 'To Subway',
      ),
      b.space(),
      b.divider(),
      b.space(),
      b.text('自动售票', 'Automatic Ticketing', 'right'),
      b.facility('ticket'),
      b.arrow('east'),
    ],
    7,
  );
  add(
    'entry',
    '进站线路标识',
    [
      b.arrow('west'),
      b.facility('subway'),
      b.text(
        isTransferStation && selectedLine ? selectedLineSegments : '乘车',
        isTransferStation && selectedLine ? selectedLineSecondary : 'To Subway',
      ),
      b.space(),
    ],
    4,
  );
  if (station?.overGround) {
    add(
      'entry',
      '空调候车室',
      [
        b.arrow('west'),
        b.facility('waiting-room'),
        b.text('空调候车室', 'Air-conditioned Waiting Room', 'left'),
        b.space(),
      ],
      5,
    );
  }
  add(
    'entry',
    '无障碍电梯',
    [
      b.arrow('west'),
      b.facility('elevator'),
      b.text('无障碍电梯', 'Accessible Elevator'),
      b.space(),
    ],
    4,
  );
  if (selectedLine) {
    const currentStationName = stationName.trim();
    const terminals = (selectedLine.terminalStations ?? []).filter((terminal) =>
      terminal.name.trim(),
    );
    const terminusTerminal = terminals.find(
      (terminal) => terminal.name.trim() === currentStationName,
    );
    const onwardTerminals = terminals.filter(
      (terminal) => terminal.name.trim() !== currentStationName,
    );
    // 本站是终点站时，朝终点的一侧没有「开往」对象；至少要有一个对端终点，
    // 这块双向牌才排得满，否则整条示例不出。
    if (!terminusTerminal || onwardTerminals.length) {
      const terminalA = buildMetroExampleTerminalText(onwardTerminals[0]);
      const terminalB = terminusTerminal
        ? buildMetroExampleTerminusText({
            name: currentStationName,
            secondaryName: station?.secondaryName ?? terminusTerminal.secondaryName,
          })
        : buildMetroExampleTerminalText(onwardTerminals[1]);
      const leftSubwayMark = b.facility('subway');
      // 终点站那一侧：地铁图标改圆形外框，与「开往」一侧区分。
      const rightSubwayMark = b.facility('subway');
      if (terminusTerminal && rightSubwayMark.type === 'facility') {
        rightSubwayMark.frameShape = 'circle';
      }
      add(
        'entry',
        '双向线路标识',
        [
          b.arrow('west'),
          leftSubwayMark,
          b.text(terminalA.main, terminalA.secondary),
          b.space(),
          b.divider(),
          b.space(),
          b.text(terminalB.main, terminalB.secondary, 'right'),
          rightSubwayMark,
          b.arrow('east'),
        ],
        9,
      );
    }
  }
  add(
    'entry',
    '站外线路标识',
    (() => {
      const subwayMark = b.facility('subway');
      if (subwayMark.type === 'facility') {
        subwayMark.frameShape = 'none';
        subwayMark.foregroundColor = '#E53935';
      }
      const subwayWordmark = b.text('地 铁', 'METRO', 'center');
      subwayWordmark.foregroundColor = '#E53935';
      const graySpace = b.space('fixed');
      if (graySpace.type === 'space') graySpace.backgroundColor = '#4A4E54';
      const stationSecondaryName = station?.secondaryName?.trim() || toUppercasePinyin(stationName);
      const stationMainName = stationName ? `${stationName}站` : '';
      const stationLabel = b.text(
        stationMainName,
        stationName
          ? `${stationSecondaryName}${/\bstation$/iu.test(stationSecondaryName) ? '' : ' Station'}`
          : '',
        'center',
        'vertical',
      );
      const lineLabels = linePair.map((line) => {
        const label = b.text(
          '',
          [line.name, line.secondaryName || buildMetroExampleLineSecondary([line])]
            .filter(Boolean)
            .join(' '),
          'center',
        );
        label.rows = label.rows.filter((row) => row.kind === 'secondary');
        label.backgroundColor = line.color;
        return label;
      });
      return [
        subwayMark,
        subwayWordmark,
        graySpace,
        b.space('fixed'),
        b.large(''),
        stationLabel,
        b.space(),
        ...lineLabels,
        b.space('fixed', 16),
      ];
    })(),
    1,
    8,
  );

  // 只有换乘站才提供换乘相关模板。
  if (lines.length > 1 && selectedLine) {
    const selectedLineNumber = extractMetroWayfindingLineNumber(selectedLine.name);
    add(
      'transfer',
      '换乘线路',
      [
        b.arrow('west'),
        b.facility('subway'),
        b.text(
          [{ kind: 'text', value: '换乘' }, ...selectedLineSegments],
          `Transfer to ${selectedLineSecondary || 'Line '}`,
        ),
        b.space(),
      ],
      4,
    );
    add(
      'transfer',
      '线路与出口方向',
      [
        b.arrow('north'),
        b.facility('subway'),
        b.text(selectedLineSegments, selectedLineSecondary),
        b.space(),
        b.divider(),
        b.space(),
        b.text('出口', 'EXIT', 'right'),
        ...buildExitSlots(groupedCurrentExitCodes, b),
        b.facility('exit', 'up'),
        b.arrow('north'),
      ],
      9,
    );
    add(
      'transfer',
      '线路号与双侧出口',
      [
        b.arrow('west'),
        b.large(selectedLineNumber, {
          frameShape: 'circle',
          frameFillMode: 'color',
          frameFillColor: selectedLine.color,
        }),
        b.text('号线', selectedLineSecondary),
        ...buildExitSlots(groupedOtherExitCodes, b),
        b.text('出口', 'EXIT'),
        b.divider(),
        b.text('出口', 'EXIT', 'right'),
        ...buildExitSlots(groupedCurrentExitCodes, b),
        b.arrow('east'),
      ],
      9,
      1,
      '#0A124D',
    );
    const elevator = b.facility('elevator');
    if (elevator.type === 'facility') {
      elevator.frameFillMode = 'inverse';
    }
    add(
      'transfer',
      '组合线路号与无障碍电梯',
      [
        b.combination(
          [
            b.large(selectedLineNumber, { frameShape: 'none' }),
            b.text('号线', selectedLineSecondary, 'left'),
          ],
          { frameFillMode: 'color', frameFillColor: selectedLine.color, frameStroke: true },
        ),
        elevator,
        b.text('无障碍电梯', 'Accessible Elevator'),
      ],
      10,
      1,
      '#0A124D',
    );
    add(
      'transfer',
      '线路色换乘出口',
      [
        b.arrow('west'),
        b.text(
          [{ kind: 'text', value: '换乘' }, ...selectedLineSegments],
          `Transfer to ${selectedLineSecondary || 'Line '}`,
        ),
        ...buildExitSlots(groupedOtherExitCodes, b),
        b.text('出口', 'EXIT'),
      ],
      9,
      1,
      selectedLine.color,
    );
    add(
      'transfer',
      '竖向线路与下楼',
      [
        b.space('fixed'),
        b.large(selectedLineNumber, {
          frameShape: 'circle',
          frameFillMode: 'inverse',
        }),
        b.text('号线', selectedLineSecondary, 'center'),
        b.divider(),
        b.text('由此下楼', 'Downstairs', 'center', 'vertical'),
      ],
      1,
      4,
      selectedLine.color,
    );
  }

  // 出站相关
  add(
    'exit',
    '出口与卫生间',
    [
      b.arrow('west'),
      b.facility('exit', 'left'),
      b.divider(),
      b.facility('nursing-room'),
      b.facility('restroom'),
      b.arrow('north'),
    ],
    4,
  );
  add(
    'exit',
    '出口、电梯与卫生间',
    [
      b.arrow('west'),
      b.facility('exit', 'left'),
      b.facility('elevator'),
      b.divider(),
      b.facility('restroom'),
      b.arrow('north'),
    ],
    4,
  );
  if (!station?.overGround) {
    add(
      'exit',
      '出口与上楼',
      [
        b.arrow('north'),
        b.facility('exit', 'up'),
        b.facility('escalator', 'left'),
        b.text('出口', 'EXIT', 'left'),
      ],
      9,
    );
  }
  const doubleExitLeftSide = [
    b.arrow('west'),
    b.facility('exit', 'left'),
    ...buildExitSlots(exitSides.left, b),
    b.text('出口', 'EXIT'),
  ];
  const doubleExitRightSide = [
    b.text('出口', 'EXIT', 'right'),
    ...buildExitSlots(exitSides.right, b),
    b.facility('exit', 'right'),
    b.arrow('east'),
  ];
  const doubleExitElements =
    exitSides.left.length && exitSides.right.length
      ? [...doubleExitLeftSide, b.space(), b.divider(), b.space(), ...doubleExitRightSide]
      : exitSides.left.length
        ? doubleExitLeftSide
        : exitSides.right.length
          ? doubleExitRightSide
          : doubleExitLeftSide;
  add('exit', '双侧出口编号', doubleExitElements, 9);
  if (elevatorExit) {
    add(
      'exit',
      '出口编号与电梯',
      [
        b.arrow('west'),
        b.facility('exit', 'left'),
        ...buildExitSlots([elevatorExit], b),
        b.facility('elevator'),
        b.space(),
      ],
      4,
    );
  }
  add(
    'exit',
    '卫生间',
    [b.arrow('west'), b.facility('restroom'), b.text('卫生间', 'Restrooms'), b.space()],
    4,
  );
  for (const exit of sortedCurrentExits) {
    const withElevatorIcon = hasAccessibleElevatorExit(exit);
    add(
      'exit',
      `出口编号与站内设施 · ${exit.code}`,
      [
        b.facility('exit', 'up'),
        ...buildExitSlots([exit.code], b),
        buildExitDescriptionElement(exit.description, b),
        ...(withElevatorIcon ? [b.space(), b.facility('elevator')] : []),
      ],
      5,
    );
  }
  add(
    'exit',
    '出口方向',
    [
      b.arrow('west'),
      b.facility('exit', 'left'),
      ...buildExitSlots(firstExitCode ? [firstExitCode] : [], b),
      b.text('出口', 'EXIT'),
      b.space(),
    ],
    4,
  );
  return examples;
}
