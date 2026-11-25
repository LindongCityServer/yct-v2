import type { MaterialTransitNetworkSnapshot } from '@yct/contracts';
import { parseMaterialTransitLineDisplay } from './material-line-display';
import { extractMetroWayfindingLineNumber } from './metro-wayfinding';
import {
  listMaterialTransitNetworkLineStations,
  listMaterialTransitNetworkLines,
  normalizeTransitNetworkName,
} from './rmp-transit-network';

/**
 * 线路图换乘解析层。
 *
 * 设计口径：
 * - **面向线路，不面向站**：输入是「当前线路 + 该线站序 + 线网」，输出是整条线路的换乘
 *   摘要。当前站在哪、有没有被选中，都不参与换乘推导（只影响高亮 / 下一站）。
 * - **一次判定**：对当前线路的每个站问一次「还有哪些线路经过这里」。服务器线网按
 *   `同类型线路 + 同名站点` 建一次索引；RMP 先建 `stationId → lineKeys`，
 *   再顺便建 `站名 → lineKeys` 兜底（换乘站被拆成两个同名节点时仍能识别）。
 * - **服务器 / RMP 同一套输出**：渲染字段 `transferLines` 与结构化的
 *   `stationTransfers` 都由本模块产出，服务端物料解析和工作台套用共用，
 *   避免前后端各写一套换乘规则（历史上就是两套推导不一致）。
 *
 * 输出格式与渲染器 `parseMetroLineMapTransfers` 对齐：
 * `站名=编号:颜色,编号:颜色;站名=编号`（站名去空白、最多 4 条换乘线路）。
 */

export interface LineMapTransferLine {
  /** 展示用线路编号（`2号线` → `2`）。 */
  number: string;
  /** `#RRGGBB`；线网没有配色的线路为 `''`，此时只写编号。 */
  color: string;
  /** 线路展示名，便于调用方展示/调试。 */
  name?: string;
  /** RMP 线路键或服务器线路 ID。 */
  lineKey?: string;
}

export interface LineMapStationTransfer {
  /** 服务器线网为 `stationSourceId`，RMP 为节点 ID。 */
  stationId?: string;
  stationName: string;
  lines: LineMapTransferLine[];
}

export interface LineMapTransferResult {
  /** 渲染字段 `transferLines` 的字符串。 */
  transferLines: string;
  /** 结构化的逐站换乘信息（测试、提示与后续渲染共用）。 */
  stationTransfers: LineMapStationTransfer[];
  /** 当前线路可识别的站点数。 */
  stationCount: number;
  /**
   * 线路是否解析成功。
   * - `false`：没选线路 / 线网里找不到该线路 —— 调用方应提示「先选线路」；
   * - `true` 且 `transferLines` 为空：线路存在但没有换乘站 —— 调用方应提示
   *   「该线路没有换乘站」，而不是误报缺少选择。
   */
  hasLine: boolean;
}

export interface LineMapServerLine {
  id: string;
  name: string;
  /** `metro` / `tram` / `custom` / `bus` …；只有同类型线路才算换乘。 */
  mode: string;
  color?: string;
  /** 线路站序（优先使用带 ID 的形态）。 */
  stations?: ReadonlyArray<{ stationId?: string; stationName: string }>;
  /** 兼容只有站名的调用方（服务端 `TransitLineSummary.stationNames`）。 */
  stationNames?: readonly string[];
}

export interface LineMapServerTransferInput {
  source: 'server';
  line: LineMapServerLine | undefined;
  lines: ReadonlyArray<LineMapServerLine>;
}

export interface LineMapRmpTransferInput {
  source: 'rmp';
  lineKey: string;
  snapshot: MaterialTransitNetworkSnapshot | undefined;
}

export type LineMapTransferInput = LineMapServerTransferInput | LineMapRmpTransferInput;

/** 与渲染器一致：单站最多标注 4 条换乘线路。 */
const MAX_TRANSFER_LINES_PER_STATION = 4;

export function resolveLineMapTransfers(input: LineMapTransferInput): LineMapTransferResult {
  return input.source === 'server'
    ? resolveServerLineMapTransfers(input)
    : resolveRmpLineMapTransfers(input);
}

/** 把结构化的逐站换乘格式化成渲染字段（`站名=编号:颜色,...;...`）。 */
export function formatLineMapTransferLines(
  stationTransfers: readonly LineMapStationTransfer[],
): string {
  // 环线 / 重复站名的线路会在站序里出现同名站：渲染器按站名查表，这里只保留第一条，
  // 否则同一站名会写入两条互相覆盖的记录。
  const writtenStationNames = new Set<string>();
  return stationTransfers
    .map((station) => {
      const stationName = normalizeLineMapStationName(station.stationName);
      if (!stationName || writtenStationNames.has(stationName)) {
        return '';
      }
      const tokens = station.lines
        .slice(0, MAX_TRANSFER_LINES_PER_STATION)
        .map((line) => (line.color ? `${line.number}:${line.color}` : line.number))
        .filter(Boolean);
      if (!tokens.length) {
        return '';
      }
      writtenStationNames.add(stationName);
      return `${stationName}=${tokens.join(',')}`;
    })
    .filter(Boolean)
    .join(';');
}

/** 换乘字段里的站名规则：去空白，和渲染器 `parseMetroLineMapTransfers` 完全一致。 */
export function normalizeLineMapStationName(value: string): string {
  return value.replace(/[\s\u3000]+/gu, '').trim();
}

function resolveServerLineMapTransfers(input: LineMapServerTransferInput): LineMapTransferResult {
  const lineStations = input.line ? listServerLineStations(input.line) : [];
  if (!input.line || !lineStations.length) {
    return emptyLineMapTransferResult(false);
  }
  // 只建一次「站名 → 其它同类型线路」索引：整张线网只扫一遍，而不是每站扫一遍。
  const transferLinesByStationName = new Map<string, LineMapTransferLine[]>();
  for (const candidate of input.lines) {
    if (candidate.id === input.line.id || candidate.mode !== input.line.mode) {
      continue;
    }
    const number = parseMaterialTransitLineDisplay(candidate.name).number.trim();
    if (!number) {
      continue;
    }
    const color = normalizeTransferColor(candidate.color);
    for (const station of listServerLineStations(candidate)) {
      const key = normalizeLineMapStationName(station.stationName);
      if (!key) {
        continue;
      }
      const entries = transferLinesByStationName.get(key) ?? [];
      if (entries.length >= MAX_TRANSFER_LINES_PER_STATION) {
        continue;
      }
      if (entries.some((entry) => entry.number === number)) {
        continue;
      }
      entries.push({ number, color, name: candidate.name, lineKey: candidate.id });
      transferLinesByStationName.set(key, entries);
    }
  }

  const stationTransfers = lineStations.flatMap((station) => {
    const lines =
      transferLinesByStationName.get(normalizeLineMapStationName(station.stationName)) ?? [];
    return lines.length ? [{ ...station, lines }] : [];
  });
  return buildLineMapTransferResult(stationTransfers, lineStations.length, true);
}

function resolveRmpLineMapTransfers(input: LineMapRmpTransferInput): LineMapTransferResult {
  const { snapshot, lineKey } = input;
  if (!snapshot || !lineKey) {
    return emptyLineMapTransferResult(false);
  }
  const optionByLineKey = new Map(
    listMaterialTransitNetworkLines(snapshot).map((option) => [option.lineKey, option] as const),
  );
  if (!optionByLineKey.has(lineKey)) {
    return emptyLineMapTransferResult(false);
  }
  const lineStations = listMaterialTransitNetworkLineStations(snapshot, lineKey);
  if (!lineStations.length) {
    return emptyLineMapTransferResult(false);
  }
  // 索引只建一次：stationId → lineKeys（含仅由边推导的情况），站名 → lineKeys（同名换乘站兜底）。
  const lineKeysByNodeId = createRmpNodeLineKeyIndex(snapshot);
  const lineKeysByStationName = createRmpStationNameLineKeyIndex(snapshot, lineKeysByNodeId);

  const stationTransfers = lineStations.flatMap((station) => {
    const nodeLineKeys = lineKeysByNodeId.get(station.id) ?? new Set<string>();
    const otherLineKeys = new Set<string>();
    for (const key of nodeLineKeys) {
      if (key !== lineKey) otherLineKeys.add(key);
    }
    if (!otherLineKeys.size) {
      // 换乘站被 RMP 拆成两个同名节点时，节点自身只有一条线的 lineKey，用站名兜底。
      const normalizedName = normalizeTransitNetworkName(station.name);
      for (const key of lineKeysByStationName.get(normalizedName) ?? []) {
        if (key !== lineKey) otherLineKeys.add(key);
      }
    }
    const lines = Array.from(otherLineKeys)
      .flatMap((key) => {
        const option = optionByLineKey.get(key);
        if (!option) {
          return [];
        }
        const number = resolveRmpTransferNumber(
          option.label,
          option.lineKey,
          option.hasConfiguredName,
        );
        return number
          ? [
              {
                number,
                color: normalizeTransferColor(option.color),
                name: option.label,
                lineKey: option.lineKey,
              },
            ]
          : [];
      })
      .filter(
        (line, index, lines) => lines.findIndex((item) => item.number === line.number) === index,
      )
      .slice(0, MAX_TRANSFER_LINES_PER_STATION);
    return lines.length ? [{ stationId: station.id, stationName: station.name, lines }] : [];
  });
  return buildLineMapTransferResult(stationTransfers, lineStations.length, true);
}

/**
 * RMP 线路编号：与 `resolveProjectTransitLineMaterialInput` 历史上的取值保持一致——
 * 配置过名称（或能从 lineKey 推导出名称）时取展示名里的编号，否则退回 lineKey 里的编号。
 */
function resolveRmpTransferNumber(
  label: string,
  lineKey: string,
  hasConfiguredName: boolean,
): string {
  const number = extractMetroWayfindingLineNumber(hasConfiguredName ? label : lineKey).trim();
  return number || label.trim();
}

function listServerLineStations(
  line: LineMapServerLine,
): Array<{ stationId?: string; stationName: string }> {
  if (line.stations?.length) {
    return line.stations
      .map((station) => ({
        stationId: station.stationId,
        stationName: station.stationName.trim(),
      }))
      .filter((station) => Boolean(station.stationName));
  }
  return (line.stationNames ?? [])
    .map((stationName) => ({ stationName: stationName.trim() }))
    .filter((station) => Boolean(station.stationName));
}

/** RMP 节点 → 线路键索引：节点自带 lineKeys 与相邻边的 lineKeys 取并集。 */
function createRmpNodeLineKeyIndex(
  snapshot: MaterialTransitNetworkSnapshot,
): Map<string, Set<string>> {
  const index = new Map<string, Set<string>>();
  const append = (nodeId: string, lineKeys: readonly string[]) => {
    if (!nodeId) return;
    const keys = index.get(nodeId) ?? new Set<string>();
    for (const lineKey of lineKeys) {
      if (lineKey) keys.add(lineKey);
    }
    index.set(nodeId, keys);
  };
  for (const node of snapshot.nodes) {
    append(node.id, node.lineKeys ?? []);
  }
  for (const edge of snapshot.edges) {
    append(edge.source, edge.lineKeys);
    append(edge.target, edge.lineKeys);
  }
  return index;
}

/** 站名 → 线路键索引：只收有站名的车站节点，用于同名换乘站兜底。 */
function createRmpStationNameLineKeyIndex(
  snapshot: MaterialTransitNetworkSnapshot,
  lineKeysByNodeId: Map<string, Set<string>>,
): Map<string, Set<string>> {
  const index = new Map<string, Set<string>>();
  for (const node of snapshot.nodes) {
    if (node.kind !== 'station') continue;
    const stationName = node.names[0];
    if (!stationName) continue;
    const normalizedName = normalizeTransitNetworkName(stationName);
    if (!normalizedName) continue;
    const keys = index.get(normalizedName) ?? new Set<string>();
    for (const lineKey of lineKeysByNodeId.get(node.id) ?? []) {
      keys.add(lineKey);
    }
    index.set(normalizedName, keys);
  }
  return index;
}

function buildLineMapTransferResult(
  stationTransfers: LineMapStationTransfer[],
  stationCount: number,
  hasLine: boolean,
): LineMapTransferResult {
  return {
    transferLines: formatLineMapTransferLines(stationTransfers),
    stationTransfers,
    stationCount,
    hasLine,
  };
}

function emptyLineMapTransferResult(hasLine: boolean): LineMapTransferResult {
  return { transferLines: '', stationTransfers: [], stationCount: 0, hasLine };
}

function normalizeTransferColor(value: string | undefined): string {
  return typeof value === 'string' && /^#[0-9A-Fa-f]{6}$/u.test(value) ? value.toUpperCase() : '';
}
