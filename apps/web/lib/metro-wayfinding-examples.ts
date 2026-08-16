import type {
  MetroWayfindingColor,
  MetroWayfindingElement,
  MetroWayfindingLayout,
  MetroWayfindingLayoutSummary,
  MetroWayfindingMainSegment,
  MetroWayfindingProjectFile,
} from './metro-wayfinding';
import {
  METRO_WAYFINDING_FOREGROUND,
  METRO_WAYFINDING_PROJECT_FORMAT,
  METRO_WAYFINDING_PROJECT_SCHEMA_VERSION,
  METRO_WAYFINDING_TEMPLATE_ID,
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

export interface MetroWayfindingExampleStation {
  name: string;
  secondaryName?: string;
  lines: readonly MetroWayfindingExampleLine[];
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
        { id: nextId('secondary'), kind: 'secondary' as const, value: secondary, bold: true },
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
  return [
    ...lines.flatMap((line) => [
      {
        kind: 'line' as const,
        value: line.name.replace(/号线$/u, '').trim(),
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
        line.secondaryName?.trim() || `Line ${line.name.replace(/号线$/u, '').trim()}`.trim(),
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
  const selectedLine = lines.find((line) => line.id === selectedLineId) ?? primaryLine;
  const linePair = secondaryLine ? [primaryLine!, secondaryLine] : primaryLine ? [primaryLine] : [];
  const lineSegments = buildMetroExampleLineSegments(linePair);
  const lineSecondary = buildMetroExampleLineSecondary(linePair);
  const b = createMetroExampleBuilder();
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
    const layout: MetroWayfindingLayout = {
      backgroundColor,
      foregroundColor: METRO_WAYFINDING_FOREGROUND,
      mode: heightM > 1 && widthM <= 2 ? 'vertical' : 'single',
      dividerBetweenRows: false,
      rows: [elements],
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
        lines.length > 1 ? lineSegments : '乘车',
        lines.length > 1 ? lineSecondary : 'To Subway',
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
        lines.length > 1 ? lineSegments : '乘车',
        lines.length > 1 ? lineSecondary : 'To Subway',
      ),
      b.space(),
    ],
    4,
  );
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
    const terminals = (selectedLine.terminalStations ?? []).filter(
      (terminal) => terminal.name && terminal.name !== stationName,
    );
    const terminalA = buildMetroExampleTerminalText(terminals[0]);
    const terminalB = buildMetroExampleTerminalText(terminals[1]);
    add(
      'entry',
      '双向线路标识',
      [
        b.arrow('west'),
        b.facility('subway'),
        b.text(terminalA.main, terminalA.secondary),
        b.space(),
        b.divider(),
        b.space(),
        b.text(terminalB.main, terminalB.secondary, 'right'),
        b.facility('subway'),
        b.arrow('east'),
      ],
      9,
    );
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
    const selectedLineNumber = selectedLine.name.replace(/号线$/u, '').trim();
    const selectedLineSegments = buildMetroExampleLineSegments([selectedLine]);
    const selectedLineSecondary = buildMetroExampleLineSecondary([selectedLine]);
    add(
      'transfer',
      '换乘线路',
      [
        b.arrow('west'),
        b.facility('subway'),
        b.text(
          [{ kind: 'text', value: '换乘' }, ...lineSegments],
          `Transfer to ${lineSecondary || 'Line '}`,
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
        b.text(lineSegments, lineSecondary),
        b.space(),
        b.divider(),
        b.space(),
        b.text('出口', 'EXIT', 'right'),
        b.large(''),
        b.large(''),
        b.large(''),
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
        b.large(''),
        b.large(''),
        b.large(''),
        b.text('出口', 'EXIT'),
        b.divider(),
        b.text('出口', 'EXIT', 'right'),
        b.large(''),
        b.large(''),
        b.large(''),
        b.arrow('east'),
      ],
      9,
      1,
      '#0A124D',
    );
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
        b.facility('elevator'),
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
        b.large(''),
        b.large(''),
        b.large(''),
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
  add(
    'exit',
    '双侧出口编号',
    [
      b.arrow('west'),
      b.facility('exit', 'left'),
      b.large(''),
      b.large(''),
      b.text('出口', 'EXIT'),
      b.space(),
      b.divider(),
      b.space(),
      b.text('出口', 'EXIT', 'right'),
      b.large(''),
      b.large(''),
      b.facility('exit', 'right'),
      b.arrow('east'),
    ],
    9,
  );
  add(
    'exit',
    '出口编号与电梯',
    [b.arrow('west'), b.facility('exit', 'left'), b.large(''), b.facility('elevator'), b.space()],
    4,
  );
  add(
    'exit',
    '卫生间',
    [b.arrow('west'), b.facility('restroom'), b.text('卫生间', 'Restrooms'), b.space()],
    4,
  );
  add(
    'exit',
    '出口编号与站内设施',
    [
      b.facility('exit', 'up'),
      b.large(''),
      b.text('', '', 'center'),
      b.space(),
      b.facility('elevator'),
    ],
    5,
  );
  add(
    'exit',
    '出口方向',
    [b.arrow('west'), b.facility('exit', 'left'), b.large(''), b.text('出口', 'EXIT'), b.space()],
    4,
  );
  return examples;
}
