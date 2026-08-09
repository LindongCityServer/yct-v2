import {
  createMetroWayfindingId,
  METRO_WAYFINDING_COMBINATION_DEFAULT_SCALE,
  METRO_WAYFINDING_BACKGROUND,
  METRO_WAYFINDING_FOREGROUND,
  METRO_WAYFINDING_PROJECT_FORMAT,
  METRO_WAYFINDING_PROJECT_SCHEMA_VERSION,
  METRO_WAYFINDING_WARNING_FOREGROUND,
  parseMetroWayfindingLayout,
  summarizeMetroWayfindingLayout,
  type MetroWayfindingArrowElement,
  type MetroWayfindingCombinationChild,
  type MetroWayfindingCombinationElement,
  type MetroWayfindingElement,
  type MetroWayfindingFacilityElement,
  type MetroWayfindingLayout,
  type MetroWayfindingProjectCanvas,
  type MetroWayfindingTextAlign,
} from './metro-wayfinding';

export const METRO_WAYFINDING_IMPORT_MAX_FILES = 2;
export const METRO_WAYFINDING_IMPORT_MAX_FILE_BYTES = 2 * 1024 * 1024;
export const METRO_WAYFINDING_SEMANTIC_TARGET_STYLE = 'DB21/T 2573-2023 语义适配';

export type MetroWayfindingImportSource = 'yct' | 'nal-vitool' | 'chitose-signmaker';
export type MetroWayfindingImportMode = 'semantic' | 'source-style';

export interface MetroWayfindingImportFile {
  name: string;
  size: number;
  text: string;
}

export interface MetroWayfindingImportWarning {
  code: string;
  message: string;
  count: number;
}

export interface MetroWayfindingImportRowSource {
  fileName: string;
  label: string;
  summary: string;
}

export interface MetroWayfindingImportPreview {
  source: MetroWayfindingImportSource;
  sourceLabel: string;
  styleLabel: string;
  projectName: string;
  files: Array<{ name: string; size: number }>;
  canvas: MetroWayfindingProjectCanvas;
  layout: MetroWayfindingLayout;
  rowSources: MetroWayfindingImportRowSource[];
  warnings: MetroWayfindingImportWarning[];
}

type JsonObject = Record<string, unknown>;

interface ParsedImportDocument {
  source: MetroWayfindingImportSource;
  sourceLabel: string;
  styleLabel: string;
  projectName: string;
  fileName: string;
  canvasLength: number;
  canvas?: MetroWayfindingProjectCanvas;
  layout?: MetroWayfindingLayout;
  backgroundColor: string;
  foregroundColor: string;
  dividerBetweenRows: boolean;
  rows: MetroWayfindingElement[][];
  warnings: MetroWayfindingImportWarning[];
}

interface ElementColors {
  backgroundColor?: string;
  foregroundColor?: string;
}

type NalVisualSeries = 'classic' | 'experimental' | 'mixed' | 'unknown';

const CHITOSE_BACKGROUND = '#FFFFFF';
const CHITOSE_FOREGROUND = '#111111';
const CHITOSE_EXIT_BACKGROUND = '#FFD701';
const CHITOSE_FACILITY_BACKGROUND = '#333F48';
const NAL_BACKGROUND = '#092F52';
const NAL_LINE_10_COLOR = '#009BC0';
const NAL_EXIT_COLOR = '#009F3C';
const NAL_ACCENT_BLUE = '#00A0E9';
const NAL_ACCENT_PINK = '#E6007E';

const nalArrowAssetMap: Record<string, MetroWayfindingArrowElement['iconId']> = {
  'way@03.svg': 'west',
  'way@04.svg': 'east',
  'way@05.svg': 'north',
  'way@06.svg': 'south',
  'way@07.svg': 'north-west',
  'way@08.svg': 'north-east',
  'way@09.svg': 'south-west',
  'way@10.svg': 'south-east',
};

const nalExperimentalStyleAssets = new Set([
  'way@02.svg',
  'way@28.svg',
  'way@29.svg',
  'stn@23.svg',
  'stn@24.svg',
  'stn@26.svg',
  'stn@27.svg',
  'stn@28.svg',
  'stn@29.svg',
  'stn@31.svg',
  'stn@33.svg',
  'stn@34.svg',
  'oth@01.svg',
  'oth@03.svg',
  'oth@04.svg',
  'oth@A.svg',
  'oth@Dot.svg',
  'oth@06.svg',
  'oth@yl.svg',
]);

const nalClassicStyleAssets = new Set([
  'way@01.svg',
  'stn@01.svg',
  'stn@02.svg',
  'stn@05.svg',
  'stn@07.svg',
  'stn@08.svg',
  'stn@11.svg',
  'stn@12.svg',
  'stn@17.svg',
  'stn@18.svg',
  'oth@hub03.svg',
  'oth@hub04.svg',
  'oth@hub05.svg',
  'oth@cls01.svg',
  'oth@cls02.svg',
  'oth@bw.svg',
]);

const nalFacilityAssetMap: Record<
  string,
  { iconId: string; options?: Partial<MetroWayfindingFacilityElement> }
> = {
  'stn@05.svg': { iconId: 'stairs', options: { frameShape: 'rectangle' } },
  'stn@31.svg': { iconId: 'stairs', options: { foregroundColor: NAL_ACCENT_BLUE } },
  'stn@29.svg': { iconId: 'escalator', options: { foregroundColor: NAL_ACCENT_BLUE } },
  'stn@01.svg': { iconId: 'elevator', options: { frameShape: 'rectangle' } },
  'stn@23.svg': { iconId: 'elevator', options: { foregroundColor: NAL_ACCENT_BLUE } },
  'stn@02.svg': { iconId: 'restroom', options: { frameShape: 'rectangle' } },
  'stn@24.svg': { iconId: 'restroom', options: { foregroundColor: NAL_ACCENT_BLUE } },
  'stn@26.svg': { iconId: 'mens-restroom', options: { foregroundColor: NAL_ACCENT_BLUE } },
  'stn@27.svg': { iconId: 'womens-restroom', options: { foregroundColor: NAL_ACCENT_PINK } },
  'stn@07.svg': { iconId: 'nursing-room', options: { frameShape: 'rectangle' } },
  'stn@33.svg': { iconId: 'nursing-room', options: { foregroundColor: NAL_ACCENT_PINK } },
  'stn@28.svg': { iconId: 'family-restroom', options: { foregroundColor: NAL_ACCENT_BLUE } },
  'stn@17.svg': { iconId: 'wheelchair-lift', options: { frameShape: 'rectangle' } },
  'stn@12.svg': { iconId: 'police', options: { frameShape: 'rectangle' } },
  'stn@11.svg': { iconId: 'service', options: { frameShape: 'rectangle' } },
  'stn@08.svg': { iconId: 'ticket', options: { frameShape: 'rectangle' } },
  'stn@18.svg': { iconId: 'wheelchair', options: { frameShape: 'rectangle' } },
  'stn@34.svg': { iconId: 'wheelchair', options: { foregroundColor: NAL_ACCENT_BLUE } },
  'way@01.svg': {
    iconId: 'exit',
    options: {
      frameShape: 'rectangle',
      frameFillMode: 'color',
      frameFillColor: NAL_EXIT_COLOR,
      foregroundColor: METRO_WAYFINDING_FOREGROUND,
    },
  },
  'way@02.svg': {
    iconId: 'exit',
    options: {
      frameShape: 'rectangle',
      frameFillMode: 'color',
      frameFillColor: NAL_EXIT_COLOR,
      foregroundColor: METRO_WAYFINDING_FOREGROUND,
    },
  },
  'way@28.svg': { iconId: 'exit', options: { foregroundColor: NAL_EXIT_COLOR } },
  'way@29.svg': { iconId: 'exit', options: { foregroundColor: NAL_EXIT_COLOR } },
  'way@24.svg': {
    iconId: 'no-entry',
    options: {
      frameShape: 'none',
      foregroundColor: METRO_WAYFINDING_WARNING_FOREGROUND,
    },
  },
  'cls@10.svg': { iconId: 'subway', options: { frameShape: 'rectangle' } },
  'cls@20.svg': {
    iconId: 'subway',
    options: {
      frameShape: 'rectangle',
      frameFillMode: 'color',
      frameFillColor: NAL_LINE_10_COLOR,
      foregroundColor: METRO_WAYFINDING_FOREGROUND,
    },
  },
  'oth@hub05.svg': { iconId: 'airplane', options: { frameShape: 'rectangle' } },
  'oth@04.svg': { iconId: 'airplane' },
  'oth@hub03.svg': { iconId: 'train', options: { frameShape: 'rectangle' } },
  'oth@03.svg': { iconId: 'train' },
  'oth@hub04.svg': { iconId: 'train', options: { frameShape: 'rectangle' } },
  'oth@01.svg': { iconId: 'train' },
};

export function parseMetroWayfindingImportFiles(
  files: readonly MetroWayfindingImportFile[],
): MetroWayfindingImportPreview {
  if (!files.length) {
    throw new Error('请选择工程文件。');
  }
  if (files.length > METRO_WAYFINDING_IMPORT_MAX_FILES) {
    throw new Error(`一次最多导入 ${METRO_WAYFINDING_IMPORT_MAX_FILES} 个工程文件。`);
  }
  for (const file of files) {
    if (file.size > METRO_WAYFINDING_IMPORT_MAX_FILE_BYTES) {
      throw new Error(`${file.name} 超过 2 MB，已停止解析。`);
    }
  }

  const parsed = files.map(parseImportDocument);
  const source = parsed[0]!.source;
  if (parsed.some((document) => document.source !== source)) {
    throw new Error('不能在一次导入中混合不同生成器的工程文件。');
  }
  if ((source === 'yct' || source === 'nal-vitool') && parsed.length > 1) {
    throw new Error(
      source === 'yct' ? 'YCT 工程文件请逐个导入。' : 'NaL 工程本身已包含全部层，请逐个导入。',
    );
  }

  const warningCollector = createWarningCollector();
  parsed.forEach((document) => warningCollector.addAll(document.warnings));

  if (source === 'yct') {
    const document = parsed[0]!;
    if (!document.layout || !document.canvas) {
      throw new Error('YCT 工程缺少画布或版式数据。');
    }
    return {
      source,
      sourceLabel: document.sourceLabel,
      styleLabel: document.styleLabel,
      projectName: document.projectName,
      files: files.map(({ name, size }) => ({ name, size })),
      canvas: document.canvas,
      layout: document.layout,
      rowSources: buildRowSources(document.fileName, document.layout.rows),
      warnings: warningCollector.values(),
    };
  }

  const flattenedRows = parsed.flatMap((document) =>
    document.rows.map((row, index) => ({
      row,
      fileName: document.fileName,
      label:
        document.rows.length > 1 ? `${document.fileName} · 第 ${index + 1} 行` : document.fileName,
    })),
  );
  if (flattenedRows.length > 2) {
    warningCollector.add(
      'row-limit',
      `当前模板最多保留两行，已忽略其余 ${flattenedRows.length - 2} 行。`,
    );
  }
  const retainedRows = flattenedRows.slice(0, 2);
  if (!retainedRows.length) {
    throw new Error('工程文件中没有可转换的导视元素。');
  }

  const lengths = parsed.map((document) => document.canvasLength);
  const canvasLength = Math.max(1, ...lengths);
  if (new Set(lengths).size > 1) {
    warningCollector.add('canvas-length-mismatch', '工程文件长度不同，已采用较长的画布长度。');
  }
  const backgroundColor = parsed[0]!.backgroundColor;
  const foregroundColor = parsed[0]!.foregroundColor;
  if (
    parsed.some(
      (document) =>
        document.backgroundColor !== backgroundColor ||
        document.foregroundColor !== foregroundColor,
    )
  ) {
    warningCollector.add('palette-mismatch', '各文件默认配色不同，已采用第一个文件的配色。');
  }

  const layout: MetroWayfindingLayout = {
    backgroundColor,
    foregroundColor,
    mode: retainedRows.length > 1 ? 'double' : 'single',
    dividerBetweenRows:
      retainedRows.length > 1 && parsed.some((document) => document.dividerBetweenRows),
    rows: retainedRows.map((item) => item.row),
  };
  const canvas: MetroWayfindingProjectCanvas = {
    widthM: canvasLength,
    heightM: retainedRows.length > 1 ? 2 : 1,
    pxPerMeter: 128,
    alignToTile: false,
    tileSizePx: 128,
  };
  const summary = summarizeMetroWayfindingLayout(layout, canvas);

  return {
    source,
    sourceLabel: parsed[0]!.sourceLabel,
    styleLabel: uniqueLabels(parsed.map((document) => document.styleLabel)).join(' / '),
    projectName: uniqueLabels(parsed.map((document) => document.projectName)).join(' + '),
    files: files.map(({ name, size }) => ({ name, size })),
    canvas,
    layout,
    rowSources: retainedRows.map((item, index) => ({
      fileName: item.fileName,
      label: item.label,
      summary: summary.rows[index]?.content ?? '空白',
    })),
    warnings: warningCollector.values(),
  };
}

export function reorderMetroWayfindingImportRows(
  preview: MetroWayfindingImportPreview,
  fromIndex: number,
  toIndex: number,
): MetroWayfindingImportPreview {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= preview.layout.rows.length ||
    toIndex >= preview.layout.rows.length
  ) {
    return preview;
  }
  const rows = [...preview.layout.rows];
  const rowSources = [...preview.rowSources];
  [rows[fromIndex], rows[toIndex]] = [rows[toIndex]!, rows[fromIndex]!];
  [rowSources[fromIndex], rowSources[toIndex]] = [rowSources[toIndex]!, rowSources[fromIndex]!];
  return { ...preview, layout: { ...preview.layout, rows }, rowSources };
}

export function resolveMetroWayfindingImportPreview(
  preview: MetroWayfindingImportPreview,
  mode: MetroWayfindingImportMode,
): MetroWayfindingImportPreview {
  if (mode === 'source-style' || preview.source === 'yct') return preview;

  const styleOnlyWarnings = new Set([
    'nal-style-approximation',
    'chitose-style-approximation',
    'chitose-addon-approximation',
    'palette-mismatch',
  ]);
  return {
    ...preview,
    styleLabel: METRO_WAYFINDING_SEMANTIC_TARGET_STYLE,
    layout: {
      ...preview.layout,
      backgroundColor: METRO_WAYFINDING_BACKGROUND,
      foregroundColor: METRO_WAYFINDING_FOREGROUND,
      rows: preview.layout.rows.map((row) =>
        row.flatMap(normalizeImportedElementToSemanticElements),
      ),
    },
    warnings: preview.warnings.filter((warning) => !styleOnlyWarnings.has(warning.code)),
  };
}

function normalizeImportedElementToSemanticStyle(
  element: MetroWayfindingElement,
): MetroWayfindingElement {
  if (element.type === 'facility') {
    const isNoEntry = element.iconId === 'no-entry';
    return {
      ...element,
      frameShape: isNoEntry ? 'none' : 'rectangle',
      frameFillMode: 'none',
      frameFillColor: undefined,
      frameStroke: false,
      backgroundColor: undefined,
      foregroundColor: isNoEntry ? METRO_WAYFINDING_WARNING_FOREGROUND : undefined,
    };
  }
  if (element.type === 'arrow') {
    return {
      ...element,
      framed: false,
      frameFillMode: 'none',
      frameFillColor: undefined,
      frameStroke: false,
      backgroundColor: undefined,
      foregroundColor: undefined,
    };
  }
  if (element.type === 'largeText') {
    return {
      ...element,
      frameShape: element.value === '·' ? 'none' : 'rectangle',
      frameFillMode: 'none',
      frameFillColor: undefined,
      frameStroke: false,
      backgroundColor: undefined,
      foregroundColor: undefined,
    };
  }
  if (element.type === 'text') {
    return {
      ...element,
      rows: element.rows.map((row) => (row.kind === 'secondary' ? { ...row, bold: true } : row)),
      backgroundColor: undefined,
      foregroundColor: undefined,
    };
  }
  if (element.type === 'combination') {
    return {
      ...element,
      children: element.children.map(
        (child) =>
          normalizeImportedElementToSemanticStyle(child) as MetroWayfindingCombinationChild,
      ),
      frameFillMode: 'none',
      frameFillColor: undefined,
      frameStroke: false,
      stripePosition: 'left',
      backgroundColor: undefined,
      foregroundColor: undefined,
    };
  }
  return {
    ...element,
    backgroundColor: undefined,
    foregroundColor: undefined,
  };
}

function parseImportDocument(file: MetroWayfindingImportFile): ParsedImportDocument {
  let value: unknown;
  try {
    value = JSON.parse(file.text);
  } catch {
    throw new Error(`${file.name} 不是有效的 JSON 工程文件。`);
  }
  if (!isObject(value)) {
    throw new Error(`${file.name} 的工程根节点无效。`);
  }
  if (value.format === METRO_WAYFINDING_PROJECT_FORMAT) {
    return parseYctDocument(file.name, value);
  }
  if (value.type === 'nalvitool') {
    return parseNalDocument(file.name, value);
  }
  if (Array.isArray(value.columns) || Array.isArray(value.zones)) {
    return parseChitoseDocument(file.name, value);
  }
  throw new Error(`${file.name} 不是受支持的地铁导视工程格式。`);
}

function parseYctDocument(fileName: string, root: JsonObject): ParsedImportDocument {
  if (root.schemaVersion !== METRO_WAYFINDING_PROJECT_SCHEMA_VERSION) {
    throw new Error(`${fileName} 使用了暂不支持的 YCT 工程版本。`);
  }
  if (!isObject(root.layout) || !isObject(root.canvas)) {
    throw new Error(`${fileName} 缺少 YCT 画布或版式数据。`);
  }
  const layout = parseMetroWayfindingLayout(JSON.stringify(root.layout));
  const canvas: MetroWayfindingProjectCanvas = {
    widthM: clampNumber(root.canvas.widthM, 1, 100, layout.mode === 'vertical' ? 1 : 8),
    heightM: clampNumber(
      root.canvas.heightM,
      1,
      100,
      layout.mode === 'vertical' ? 8 : layout.mode === 'double' ? 2 : 1,
    ),
    pxPerMeter: clampNumber(root.canvas.pxPerMeter, 32, 512, 128),
    alignToTile: root.canvas.alignToTile === true,
    tileSizePx: clampNumber(root.canvas.tileSizePx, 32, 512, 128),
  };
  return {
    source: 'yct',
    sourceLabel: 'YCT 地铁导视工程',
    styleLabel: '当前模板',
    projectName: stripJsonExtension(fileName),
    fileName,
    canvasLength: layout.mode === 'vertical' ? canvas.heightM : canvas.widthM,
    canvas,
    layout,
    backgroundColor: layout.backgroundColor,
    foregroundColor: layout.foregroundColor,
    dividerBetweenRows: layout.dividerBetweenRows,
    rows: layout.rows,
    warnings: [],
  };
}

function parseNalDocument(fileName: string, root: JsonObject): ParsedImportDocument {
  const warningCollector = createWarningCollector();
  const definitions = isObject(root.definitions) ? root.definitions : {};
  const layers = isObject(root.layers) ? root.layers : {};
  const layerEntries = Object.entries(layers)
    .filter((entry): entry is [string, unknown[]] => Array.isArray(entry[1]))
    .sort(([left], [right]) => layerIndex(left) - layerIndex(right));
  const importedAssetNames = layerEntries.flatMap(([, rawGroups]) =>
    rawGroups
      .filter(isObject)
      .flatMap((group) =>
        Array.isArray(group.elements)
          ? group.elements.filter(isString).map((asset) => asset.split(/[\\/]/u).at(-1) ?? asset)
          : [],
      ),
  );
  const hasExperimentalStyle = importedAssetNames.some(
    (assetName) => assetName.startsWith('line@') || nalExperimentalStyleAssets.has(assetName),
  );
  const hasClassicStyle = importedAssetNames.some(
    (assetName) =>
      assetName.startsWith('cls@') ||
      assetName.startsWith('clss@') ||
      nalClassicStyleAssets.has(assetName),
  );
  const styleLabel =
    hasExperimentalStyle && hasClassicStyle
      ? '北京地铁混合系列（经典 / 实验）'
      : hasExperimentalStyle
        ? '北京地铁实验系列（线路号色带）'
        : hasClassicStyle
          ? '北京地铁经典系列（车头标）'
          : '北京地铁系列（未检测到系列特征）';
  const visualSeries: NalVisualSeries =
    hasExperimentalStyle && hasClassicStyle
      ? 'mixed'
      : hasExperimentalStyle
        ? 'experimental'
        : hasClassicStyle
          ? 'classic'
          : 'unknown';
  if (hasExperimentalStyle && hasClassicStyle) {
    warningCollector.add(
      'nal-mixed-series',
      '工程同时包含经典系列与实验系列组件，已逐元素保留可识别的系列样式。',
    );
  }
  const rows = layerEntries.map(([, rawGroups]) =>
    parseNalGroups(rawGroups as unknown[], definitions, warningCollector, visualSeries),
  );
  warningCollector.add(
    'nal-style-approximation',
    '字体、双色图标和分组间距已按当前模板近似转换；线路组件已按经典填充框或实验色带恢复。',
  );
  return {
    source: 'nal-vitool',
    sourceLabel: 'NaL 导向标志设计器',
    styleLabel,
    projectName: stripJsonExtension(fileName),
    fileName,
    canvasLength: clampNumber(root['size-l'], 1, 100, 8),
    backgroundColor: root.mode === 'a' ? NAL_BACKGROUND : METRO_WAYFINDING_BACKGROUND,
    foregroundColor: METRO_WAYFINDING_FOREGROUND,
    dividerBetweenRows: root.group === true,
    rows,
    warnings: warningCollector.values(),
  };
}

function parseNalGroups(
  rawGroups: unknown[],
  definitions: JsonObject,
  warnings: ReturnType<typeof createWarningCollector>,
  visualSeries: NalVisualSeries,
): MetroWayfindingElement[] {
  const groups = rawGroups.filter(isObject);
  const result: MetroWayfindingElement[] = [];
  groups.forEach((group, groupIndex) => {
    if (groupIndex > 0) {
      result.push(createSpaceElement('flex'));
    }
    const assets = Array.isArray(group.elements) ? group.elements.filter(isString) : [];
    assets.forEach((asset) => {
      if ((asset.split(/[\\/]/u).at(-1) ?? asset) === 'oth@one.svg') {
        const previousElement = result.at(-1);
        if (previousElement?.type === 'largeText') {
          result[result.length - 1] = {
            ...previousElement,
            suffix: `${previousElement.suffix}1`.slice(0, 24),
          };
        } else {
          const detachedSuffix = createLargeTextElement('');
          detachedSuffix.suffix = '1';
          result.push(detachedSuffix);
        }
        return;
      }
      const elements = parseNalAsset(asset, definitions, warnings, visualSeries);
      result.push(...elements);
    });
  });
  return result;
}

function parseNalAsset(
  asset: string,
  definitions: JsonObject,
  warnings: ReturnType<typeof createWarningCollector>,
  visualSeries: NalVisualSeries,
): MetroWayfindingElement[] {
  const assetName = asset.split(/[\\/]/u).at(-1) ?? asset;
  const definition = resolveNalTextDefinition(assetName, definitions);
  if (assetName.startsWith('custom_') || definition) {
    if (!definition) {
      warnings.add('nal-missing-definition', `缺少自定义文本 ${assetName} 的定义，已忽略。`);
      return [];
    }
    // originalSvg 仅作为源工程内嵌图形保留，不参与 JSON 语义转换。
    const chineseLines = readNalTextLines(definition, 'cn');
    const englishLines = readNalTextLines(definition, 'en');
    if (!chineseLines.length && !englishLines.length) {
      warnings.add('nal-empty-definition', `自定义文本 ${assetName} 没有可读文字，已忽略。`);
      return [];
    }
    return [
      createMultilineTextElement(
        chineseLines,
        englishLines,
        definition.drct === 'end' ? 'right' : definition.drct === 'start' ? 'left' : 'center',
      ),
    ];
  }
  if (assetName === 'oth@space.svg') {
    return [createSpaceElement('fixed')];
  }
  if (assetName === 'oth@bw.svg' || assetName === 'oth@yl.svg') {
    return [
      createDividerElement(assetName === 'oth@yl.svg' ? '#FFF100' : METRO_WAYFINDING_FOREGROUND),
    ];
  }
  if (assetName === 'line@12.svg' || assetName === 'clss@10.svg') {
    const series = assetName.startsWith('line@')
      ? 'experimental'
      : assetName.startsWith('clss@')
        ? 'classic'
        : visualSeries === 'classic'
          ? 'classic'
          : 'experimental';
    return [createRouteCombinationElement('10', '号线', 'Line 10', NAL_LINE_10_COLOR, series)];
  }
  const facilityMapping = nalFacilityAssetMap[assetName];
  if (facilityMapping) {
    return [createFacilityElement(facilityMapping.iconId, facilityMapping.options)];
  }
  const arrowId = nalArrowAssetMap[assetName];
  if (arrowId) {
    return [createArrowElement(arrowId)];
  }
  if (assetName === 'oth@A.svg') return [createLargeTextElement('A')];
  if (assetName === 'oth@Dot.svg') return [createLargeTextElement('·')];
  if (assetName === 'oth@06.svg') return [createLargeTextElement('B')];
  if (assetName === 'oth@cls01.svg') return [createLargeTextElement('A', 'rectangle')];
  if (assetName === 'oth@cls02.svg') return [createLargeTextElement('B', 'rectangle')];

  warnings.add('nal-unknown-asset', `未识别 NaL 组件 ${assetName}，已忽略。`);
  return [];
}

function resolveNalTextDefinition(
  assetName: string,
  definitions: JsonObject,
): JsonObject | undefined {
  const directDefinition = definitions[assetName];
  if (isObject(directDefinition)) return directDefinition;

  return Object.values(definitions).find((value): value is JsonObject => {
    if (!isObject(value)) return false;
    const definitionFileName = asString(value.file).split(/[\\/]/u).at(-1);
    return definitionFileName === assetName;
  });
}

function readNalTextLines(definition: JsonObject, language: 'cn' | 'en'): string[] {
  const directText = asString(definition[language]).trim();
  if (directText) return [directText];

  return Object.entries(definition)
    .filter(([key]) => new RegExp(`^c-${language}\\d+$`, 'u').test(key))
    .sort(([left], [right]) => left.localeCompare(right, undefined, { numeric: true }))
    .map(([, value]) => asString(value).trim())
    .filter(Boolean);
}

function parseChitoseDocument(fileName: string, root: JsonObject): ParsedImportDocument {
  const warningCollector = createWarningCollector();
  const addonId = asString(root.addonId) || 'default';
  const columns = Array.isArray(root.columns) ? root.columns.filter(isObject) : [];
  const rowContainers = columns.length
    ? columns
    : [{ zones: Array.isArray(root.zones) ? root.zones : [] }];
  const rows = rowContainers.map((container) =>
    parseChitoseZones(Array.isArray(container.zones) ? container.zones : [], warningCollector),
  );
  if (rows.every((row) => row.length === 0)) {
    throw new Error(`${fileName} 中没有可转换的标牌组件。`);
  }
  if (addonId !== 'default') {
    warningCollector.add(
      'chitose-addon-approximation',
      `附加风格 ${addonId} 没有完整映射，已保留可识别的文本、图标和颜色。`,
    );
  }
  warningCollector.add(
    'chitose-style-approximation',
    '标牌描边、字宽和组件固定宽度已按当前地铁导视模板近似转换。',
  );
  const styleName = addonId === 'default' ? '重庆轨道交通 2017' : `附加风格 ${addonId}`;
  const signStyle = asString(root.signStyleId);
  return {
    source: 'chitose-signmaker',
    sourceLabel: 'Chitose.City Sign Maker',
    styleLabel: signStyle ? `${styleName} · ${signStyle}` : styleName,
    projectName: asString(root.projectName) || stripJsonExtension(fileName),
    fileName,
    canvasLength: resolveChitoseCanvasLength(root.canvasWidth),
    backgroundColor: CHITOSE_BACKGROUND,
    foregroundColor: CHITOSE_FOREGROUND,
    dividerBetweenRows: rows.length > 1,
    rows,
    warnings: warningCollector.values(),
  };
}

function parseChitoseZones(
  rawZones: unknown[],
  warnings: ReturnType<typeof createWarningCollector>,
): MetroWayfindingElement[] {
  const result: MetroWayfindingElement[] = [];
  rawZones.filter(isObject).forEach((zone) => {
    const category = asString(zone.category);
    const zoneColors = chitoseZoneColors(category, asString(zone.style));
    const components = Array.isArray(zone.components) ? zone.components.filter(isObject) : [];
    components.forEach((component) => {
      result.push(...parseChitoseComponent(component, category, zoneColors, warnings));
    });
  });
  return result;
}

function parseChitoseComponent(
  component: JsonObject,
  category: string,
  colors: ElementColors,
  warnings: ReturnType<typeof createWarningCollector>,
): MetroWayfindingElement[] {
  const classNames = asString(component.className).split(/\s+/u).filter(Boolean);
  const dataset = isObject(component.dataset) ? component.dataset : {};
  const markup = asString(component.innerHTML);
  const document = parseHtmlFragment(markup);
  const asset =
    asString(dataset.src) || document.querySelector('[data-src]')?.getAttribute('data-src') || '';
  const cn = document.querySelector('.textCN')?.textContent?.trim() ?? '';
  const en = document.querySelector('.textEN')?.textContent?.trim() ?? '';
  const largeText = document.querySelector('.largeText')?.textContent?.trim() ?? '';
  const align = resolveChitoseAlignment(dataset, document);
  const style = asString(component.style);
  const reversed = /flex-direction\s*:\s*row-reverse/iu.test(style);

  if (classNames.includes('arrow')) {
    const arrowId = mapChitoseArrowAsset(asset);
    if (!arrowId) {
      warnings.add('chitose-unknown-arrow', `未识别箭头 ${asset || '（无资源名）'}，已忽略。`);
      return [];
    }
    return [createArrowElement(arrowId, colors)];
  }
  if (classNames.includes('lineNumber')) {
    const lineNumber = largeText || asString(dataset.lineId).replace(/^L/iu, '');
    const lineColor =
      extractFirstCssColor(markup) || extractFirstCssColor(style) || METRO_WAYFINDING_FOREGROUND;
    return [
      createRouteCombinationElement(lineNumber, cn, en, lineColor, 'chongqing', align, colors),
    ];
  }
  if (classNames.includes('exitNumber')) {
    return largeText ? [createLargeTextElement(largeText, 'none', colors)] : [];
  }
  if (
    classNames.includes('toTrain') ||
    classNames.includes('exit') ||
    classNames.includes('facility')
  ) {
    const iconId = mapChitoseFacilityAsset(asset, classNames);
    const icon = iconId ? createChitoseFacilityElement(iconId, category, colors) : undefined;
    const text = cn || en ? createTextElement(cn, en, align, colors) : undefined;
    if (!icon) {
      warnings.add('chitose-unknown-facility', `未识别设施图标 ${asset || '（无资源名）'}。`);
    }
    const orderedElements: Array<MetroWayfindingElement | undefined> = reversed
      ? [text, icon]
      : [icon, text];
    return orderedElements.filter(isWayfindingElement);
  }
  if (classNames.includes('textBox')) {
    return [createTextElement(cn, en, align, colors)];
  }
  if (classNames.includes('largeText')) {
    const value = largeText || document.body.textContent?.trim() || '';
    return value ? [createLargeTextElement(value, 'none', colors)] : [];
  }
  if (classNames.includes('dividerBar')) {
    return [createDividerElement(colors.foregroundColor, colors.backgroundColor)];
  }
  if (classNames.includes('colorBar')) {
    warnings.add('chitose-color-bar', '独立色带已近似转换为细分割线。');
    return [
      createDividerElement(
        extractFirstCssColor(style) || extractFirstCssColor(markup) || '#8A8A8A',
        colors.backgroundColor,
      ),
    ];
  }
  if (classNames.includes('icon')) {
    if (asset.toLowerCase().includes('placeholder')) {
      return [createSpaceElement(/flex\s*:\s*1/iu.test(style) ? 'flex' : 'fixed', colors)];
    }
    const arrowId = mapChitoseArrowAsset(asset);
    if (arrowId) return [createArrowElement(arrowId, colors)];
    const iconId = mapChitoseFacilityAsset(asset, classNames);
    if (iconId) return [createChitoseFacilityElement(iconId, category, colors)];
  }

  warnings.add(
    'chitose-unknown-component',
    `未识别组件 ${asString(component.className) || asString(component.tagName) || 'unknown'}，已忽略。`,
  );
  return [];
}

function createChitoseFacilityElement(
  iconId: string,
  category: string,
  colors: ElementColors,
): MetroWayfindingFacilityElement {
  if (iconId === 'no-entry') {
    return createFacilityElement(iconId, {
      frameShape: 'none',
      foregroundColor: METRO_WAYFINDING_WARNING_FOREGROUND,
    });
  }
  const frameFillColor =
    colors.backgroundColor ??
    (category === 'facility' ? CHITOSE_FACILITY_BACKGROUND : CHITOSE_FOREGROUND);
  const foregroundColor =
    colors.foregroundColor ??
    (category === 'facility' || category === 'exit' ? CHITOSE_FOREGROUND : CHITOSE_BACKGROUND);
  return createFacilityElement(iconId, {
    frameShape: 'rectangle',
    frameFillMode: 'color',
    frameFillColor,
    foregroundColor,
  });
}

function mapChitoseFacilityAsset(asset: string, classNames: string[]): string | undefined {
  const name = asset.toLowerCase();
  if (name.includes('no_entry')) return 'no-entry';
  if (name.includes('accessible_restroom')) return 'family-restroom';
  if (name.includes('restroom')) return 'restroom';
  if (name.includes('accessible_elevator') || name.includes('elevator')) return 'elevator';
  if (name.includes('accessible_ramp')) return 'wheelchair';
  if (name.includes('accessible_passage') || name.includes('accessible')) return 'wheelchair';
  if (name.includes('stairs')) return 'stairs';
  if (name.includes('waiting')) return 'waiting';
  if (name.includes('nursing')) return 'nursing-room';
  if (name.includes('tickets')) return 'ticket';
  if (name.includes('exit')) return 'exit';
  if (name.includes('train') || name.includes('metro') || name.includes('monorail'))
    return 'subway';
  if (classNames.includes('exit')) return 'exit';
  if (classNames.includes('toTrain')) return 'subway';
  return undefined;
}

function mapChitoseArrowAsset(asset: string): MetroWayfindingArrowElement['iconId'] | undefined {
  const name = asset.toLowerCase();
  if (!name.includes('arrow')) return undefined;
  if (name.includes('leftdown')) return 'south-west';
  if (name.includes('rightdown')) return 'south-east';
  if (name.includes('leftup')) return 'north-west';
  if (name.includes('rightup')) return 'north-east';
  if (name.includes('left')) return 'west';
  if (name.includes('right')) return 'east';
  if (name.includes('down')) return 'south';
  return 'north';
}

function resolveChitoseAlignment(
  dataset: JsonObject,
  document: Document,
): MetroWayfindingTextAlign {
  const manualAlign = asString(dataset.manualAlign);
  if (manualAlign === 'left' || manualAlign === 'right' || manualAlign === 'center') {
    return manualAlign;
  }
  const styleAlign = document.querySelector<HTMLElement>('[style*="text-align"]')?.style.textAlign;
  return styleAlign === 'right' || styleAlign === 'center' ? styleAlign : 'left';
}

function chitoseZoneColors(category: string, style: string): ElementColors {
  const explicitBackground = extractFirstCssColor(style);
  if (category === 'exit') {
    return {
      backgroundColor: explicitBackground || CHITOSE_EXIT_BACKGROUND,
      foregroundColor: CHITOSE_FOREGROUND,
    };
  }
  if (category === 'facility') {
    return {
      backgroundColor: explicitBackground || CHITOSE_FACILITY_BACKGROUND,
      foregroundColor: METRO_WAYFINDING_FOREGROUND,
    };
  }
  return {
    backgroundColor:
      explicitBackground && explicitBackground !== CHITOSE_BACKGROUND
        ? explicitBackground
        : undefined,
    foregroundColor: undefined,
  };
}

function createTextElement(
  main: string,
  secondary: string,
  align: MetroWayfindingTextAlign,
  colors: ElementColors = {},
): Extract<MetroWayfindingElement, { type: 'text' }> {
  return createMultilineTextElement([main], [secondary], align, colors);
}

function createMultilineTextElement(
  mainLines: readonly string[],
  secondaryLines: readonly string[],
  align: MetroWayfindingTextAlign,
  colors: ElementColors = {},
): Extract<MetroWayfindingElement, { type: 'text' }> {
  const id = createMetroWayfindingId('text-import');
  return {
    id,
    type: 'text',
    align,
    writingMode: 'horizontal',
    rows: [
      ...mainLines.map((value) => ({
        id: createMetroWayfindingId('text-main-import'),
        kind: 'main' as const,
        segments: [{ kind: 'text' as const, value: value.slice(0, 160) }],
      })),
      ...secondaryLines.map((value) => ({
        id: createMetroWayfindingId('text-secondary-import'),
        kind: 'secondary' as const,
        value: value.slice(0, 160),
        bold: true,
      })),
    ],
    ...colors,
  };
}

function createRouteCombinationElement(
  lineNumber: string,
  suffix: string,
  secondary: string,
  color: string,
  style: 'classic' | 'experimental' | 'chongqing',
  align: MetroWayfindingTextAlign = 'left',
  colors: ElementColors = {},
): MetroWayfindingCombinationElement {
  const foregroundColor = colors.foregroundColor ?? resolveReadableForeground(color);
  const children: MetroWayfindingCombinationChild[] = [
    createLargeTextElement(lineNumber, 'none'),
    createTextElement(suffix, secondary, align),
  ];
  return {
    id: createMetroWayfindingId('combination-import'),
    type: 'combination',
    scale: METRO_WAYFINDING_COMBINATION_DEFAULT_SCALE,
    children,
    frameFillMode: style === 'classic' ? 'color' : 'stripe',
    frameFillColor: color,
    frameStroke: style === 'classic',
    stripePosition: style === 'experimental' ? 'bottom' : 'left',
    backgroundColor: colors.backgroundColor,
    foregroundColor,
  };
}

function createRouteTextElement(
  lineNumber: string,
  suffix: string,
  secondary: string,
  color: string,
): Extract<MetroWayfindingElement, { type: 'text' }> {
  const element = createTextElement('', secondary, 'left');
  element.rows[0] = {
    id: createMetroWayfindingId('text-main-import'),
    kind: 'main',
    segments: [
      { kind: 'line', value: lineNumber.slice(0, 20), color },
      { kind: 'text', value: suffix.slice(0, 160) },
    ],
  };
  return element;
}

function normalizeImportedElementToSemanticElements(
  element: MetroWayfindingElement,
): MetroWayfindingElement[] {
  if (element.type === 'combination') {
    const lineNumber = element.children.find((child) => child.type === 'largeText')?.value.trim();
    const hasText = element.children.some((child) => child.type === 'text');
    if (lineNumber && hasText) {
      return [
        createRouteTextElement(
          lineNumber,
          '号线',
          `Line ${lineNumber}`,
          element.frameFillColor ?? NAL_LINE_10_COLOR,
        ),
      ];
    }
  }
  return [normalizeImportedElementToSemanticStyle(element)];
}

function createFacilityElement(
  iconId: string,
  options: Partial<MetroWayfindingFacilityElement> = {},
): MetroWayfindingFacilityElement {
  return {
    id: createMetroWayfindingId('facility-import'),
    type: 'facility',
    iconId,
    frameShape: 'none',
    frameFillMode: 'none',
    frameStroke: false,
    ...options,
  };
}

function createArrowElement(
  iconId: MetroWayfindingArrowElement['iconId'],
  colors: ElementColors = {},
): MetroWayfindingArrowElement {
  return {
    id: createMetroWayfindingId('arrow-import'),
    type: 'arrow',
    iconId,
    framed: false,
    frameFillMode: 'none',
    frameStroke: false,
    ...colors,
  };
}

function createLargeTextElement(
  value: string,
  frameShape: 'none' | 'rectangle' = 'none',
  colors: ElementColors = {},
): Extract<MetroWayfindingElement, { type: 'largeText' }> {
  return {
    id: createMetroWayfindingId('large-text-import'),
    type: 'largeText',
    value: value.slice(0, 160),
    suffix: '',
    frameShape,
    frameFillMode: 'none',
    frameStroke: false,
    ...colors,
  };
}

function createSpaceElement(
  mode: 'fixed' | 'flex',
  colors: ElementColors = {},
): Extract<MetroWayfindingElement, { type: 'space' }> {
  return {
    id: createMetroWayfindingId('space-import'),
    type: 'space',
    mode,
    units: 1,
    ...colors,
  };
}

function createDividerElement(
  foregroundColor = METRO_WAYFINDING_FOREGROUND,
  backgroundColor?: string,
): Extract<MetroWayfindingElement, { type: 'divider' }> {
  return {
    id: createMetroWayfindingId('divider-import'),
    type: 'divider',
    foregroundColor,
    backgroundColor,
  };
}

function resolveReadableForeground(color: string | undefined): string {
  if (!color) return METRO_WAYFINDING_FOREGROUND;
  const hex = color.trim().replace(/^#/u, '');
  if (!/^[0-9a-f]{6}$/iu.test(hex)) return METRO_WAYFINDING_FOREGROUND;
  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);
  const luminance = (red * 299 + green * 587 + blue * 114) / 1000;
  return luminance >= 168 ? CHITOSE_FOREGROUND : METRO_WAYFINDING_FOREGROUND;
}

function buildRowSources(
  fileName: string,
  rows: readonly MetroWayfindingElement[][],
): MetroWayfindingImportRowSource[] {
  const summary = summarizeMetroWayfindingLayout({
    backgroundColor: METRO_WAYFINDING_BACKGROUND,
    foregroundColor: METRO_WAYFINDING_FOREGROUND,
    mode: rows.length > 1 ? 'double' : 'single',
    dividerBetweenRows: false,
    rows: rows.map((row) => [...row]),
  });
  return rows.map((_, index) => ({
    fileName,
    label: rows.length > 1 ? `${fileName} · 第 ${index + 1} 行` : fileName,
    summary: summary.rows[index]?.content ?? '空白',
  }));
}

function resolveChitoseCanvasLength(value: unknown): number {
  const width = Number.parseFloat(asString(value));
  return Number.isFinite(width) ? Math.max(1, Math.min(100, Math.round(width / 90))) : 10;
}

function parseHtmlFragment(markup: string): Document {
  return new DOMParser().parseFromString(markup.slice(0, 512_000), 'text/html');
}

function extractFirstCssColor(value: string): string | undefined {
  const match = value.match(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/iu);
  return match ? cssColorToHex(match[0]) : undefined;
}

function cssColorToHex(value: string): string | undefined {
  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})(?:[0-9a-f]{2})?$/iu)?.[1];
  if (hex) {
    return `#${
      hex.length === 3
        ? hex
            .split('')
            .map((character) => `${character}${character}`)
            .join('')
        : hex
    }`.toUpperCase();
  }
  const rgb = value.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/iu);
  if (!rgb) return undefined;
  return `#${rgb
    .slice(1, 4)
    .map((channel) =>
      Math.max(0, Math.min(255, Number(channel)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`.toUpperCase();
}

function createWarningCollector() {
  const warnings = new Map<string, MetroWayfindingImportWarning>();
  return {
    add(code: string, message: string, count = 1) {
      const key = `${code}:${message}`;
      const current = warnings.get(key);
      warnings.set(key, { code, message, count: (current?.count ?? 0) + count });
    },
    addAll(values: readonly MetroWayfindingImportWarning[]) {
      values.forEach((warning) => this.add(warning.code, warning.message, warning.count));
    },
    values() {
      return [...warnings.values()];
    },
  };
}

function uniqueLabels(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function stripJsonExtension(value: string): string {
  return value.replace(/(?:\.yct-metro-wayfinding)?\.json$/iu, '');
}

function layerIndex(value: string): number {
  return Number(value.match(/\d+/u)?.[0] ?? Number.MAX_SAFE_INTEGER);
}

function clampNumber(value: unknown, minimum: number, maximum: number, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(minimum, Math.min(maximum, numeric)) : fallback;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isWayfindingElement(
  value: MetroWayfindingElement | undefined,
): value is MetroWayfindingElement {
  return value !== undefined;
}
