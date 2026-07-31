import type {
  MaterialTransitNetworkEdge,
  MaterialTransitNetworkNode,
  MaterialTransitNetworkPathKind,
  MaterialTransitNetworkSnapshot,
} from '@yct/contracts';

export const RMP_TRANSIT_NETWORK_CURRENT_VERSION = 77;
export const RMP_TRANSIT_NETWORK_MAX_FILE_SIZE = 5 * 1024 * 1024;

interface RmpProject {
  version?: unknown;
  graph?: {
    nodes?: unknown;
    edges?: unknown;
  };
}

interface RmpGraphNode {
  key?: unknown;
  attributes?: unknown;
}

interface RmpGraphEdge {
  key?: unknown;
  source?: unknown;
  target?: unknown;
  attributes?: unknown;
}

interface RmpColorTuple {
  key: string;
  color: string;
}

export interface MaterialTransitNetworkLineMatch {
  lineKey: string;
  color: string;
  lineName?: string;
  secondaryLineName?: string;
  edgeIds: Set<string>;
  nodeIds: Set<string>;
  matchedStationCount: number;
}

export interface MaterialTransitNetworkPaletteOption {
  value: string;
  label: string;
}

export interface MaterialTransitNetworkNodeLineOption {
  id: string;
  lineKey: string;
  color: string;
  label: string;
  secondaryLabel?: string;
}

export type MaterialTransitNetworkDirection = 'east' | 'west' | 'north' | 'south';

export interface MaterialTransitNetworkRoute {
  line: MaterialTransitNetworkLineMatch;
  nodeIds: string[];
  steps: Array<{ edge: MaterialTransitNetworkEdge; reverse: boolean }>;
  currentNodeIndex: number;
}

export function parseRmpTransitNetworkProject(source: string): MaterialTransitNetworkSnapshot {
  let project: RmpProject;
  try {
    project = JSON.parse(source) as RmpProject;
  } catch {
    throw new Error('所选文件不是有效的 JSON。');
  }
  const version = readFiniteInteger(project.version);
  if (!version) {
    throw new Error('文件缺少有效的 RMP 项目版本。');
  }
  if (version > RMP_TRANSIT_NETWORK_CURRENT_VERSION) {
    throw new Error(
      `该项目使用 RMP v${version}，当前仅支持至 v${RMP_TRANSIT_NETWORK_CURRENT_VERSION}。`,
    );
  }
  if (
    !project.graph ||
    !Array.isArray(project.graph.nodes) ||
    !Array.isArray(project.graph.edges)
  ) {
    throw new Error('文件缺少 RMP 线网图结构。');
  }
  if (project.graph.nodes.length > 2_000 || project.graph.edges.length > 4_000) {
    throw new Error('RMP 项目过大，最多支持 2,000 个节点和 4,000 条连接。');
  }

  const nodes = project.graph.nodes
    .map(parseRmpNode)
    .filter((node): node is MaterialTransitNetworkNode => Boolean(node));
  const nodeById = new Map(nodes.map((node) => [node.id, node] as const));
  const edges = project.graph.edges
    .map((edge) => parseRmpEdge(edge, nodeById))
    .filter((edge): edge is MaterialTransitNetworkEdge => Boolean(edge));

  for (const edge of edges) {
    for (const nodeId of [edge.source, edge.target]) {
      const node = nodeById.get(nodeId);
      if (!node) continue;
      node.lineKeys = uniqueStrings([...node.lineKeys, ...edge.lineKeys]);
      node.lineColors = uniqueStrings([...node.lineColors, ...edge.colors]);
    }
  }

  if (!nodes.some((node) => node.kind === 'station' && node.names.length)) {
    throw new Error('RMP 项目中没有可识别的车站节点。');
  }
  if (!edges.length) {
    throw new Error('RMP 项目中没有带有效线路配色的连接。');
  }

  return { format: 'rmp', version, nodes, edges };
}

export function listMaterialTransitNetworkPalette(
  snapshot: MaterialTransitNetworkSnapshot,
): MaterialTransitNetworkPaletteOption[] {
  const optionByColor = new Map<string, MaterialTransitNetworkPaletteOption>();
  for (const edge of snapshot.edges) {
    edge.colors.forEach((color, index) => {
      if (optionByColor.has(color)) return;
      const lineKey = edge.lineKeys[index] ?? edge.lineKeys[0] ?? color;
      const lineNames = resolveMaterialTransitNetworkLineNames(snapshot, lineKey);
      optionByColor.set(color, {
        value: color,
        label: `${formatMaterialTransitNetworkLineLabel(lineNames, lineKey)} · ${color}`,
      });
    });
  }
  return Array.from(optionByColor.values());
}

export function listMaterialTransitNetworkNodeLines(
  snapshot: MaterialTransitNetworkSnapshot,
  nodeId: string,
): MaterialTransitNetworkNodeLineOption[] {
  const optionById = new Map<string, MaterialTransitNetworkNodeLineOption>();
  for (const edge of snapshot.edges) {
    if (edge.source !== nodeId && edge.target !== nodeId) continue;
    edge.colors.forEach((color, index) => {
      const lineKey = edge.lineKeys[index] ?? edge.lineKeys[0];
      if (!lineKey) return;
      const id = lineKey;
      if (!optionById.has(id)) {
        const lineNames = resolveMaterialTransitNetworkLineNames(snapshot, lineKey);
        optionById.set(id, {
          id,
          lineKey,
          color,
          label: lineNames?.name ?? formatLineKey(lineKey),
          secondaryLabel: lineNames?.secondaryName,
        });
      }
    });
  }
  return Array.from(optionById.values());
}

export function listMaterialTransitNetworkLines(
  snapshot: MaterialTransitNetworkSnapshot,
): MaterialTransitNetworkNodeLineOption[] {
  const optionById = new Map<string, MaterialTransitNetworkNodeLineOption>();
  for (const edge of snapshot.edges) {
    edge.colors.forEach((color, index) => {
      const lineKey = edge.lineKeys[index] ?? edge.lineKeys[0];
      if (!lineKey) return;
      const id = lineKey;
      if (optionById.has(id)) return;
      optionById.set(id, {
        id,
        lineKey,
        color,
        label:
          resolveMaterialTransitNetworkLineNames(snapshot, lineKey)?.name ?? formatLineKey(lineKey),
        secondaryLabel: resolveMaterialTransitNetworkLineNames(snapshot, lineKey)?.secondaryName,
      });
    });
  }
  return Array.from(optionById.values());
}

export function listMaterialTransitNetworkNearbyStationNames(
  snapshot: MaterialTransitNetworkSnapshot,
  nodeId: string,
  maximumCount = 3,
): string[] {
  if (maximumCount <= 0) return [];
  const adjacentNodeIds = new Map<string, string[]>();
  for (const edge of snapshot.edges) {
    adjacentNodeIds.set(edge.source, [...(adjacentNodeIds.get(edge.source) ?? []), edge.target]);
    adjacentNodeIds.set(edge.target, [...(adjacentNodeIds.get(edge.target) ?? []), edge.source]);
  }
  const nodeById = new Map(snapshot.nodes.map((node) => [node.id, node] as const));
  const queue = [...(adjacentNodeIds.get(nodeId) ?? [])];
  const visited = new Set([nodeId]);
  const names: string[] = [];
  while (queue.length && visited.size <= snapshot.nodes.length && names.length < maximumCount) {
    const currentNodeId = queue.shift()!;
    if (visited.has(currentNodeId)) continue;
    visited.add(currentNodeId);
    const node = nodeById.get(currentNodeId);
    const primaryName = node?.kind === 'station' ? node.names[0]?.trim() : undefined;
    if (primaryName && !names.includes(primaryName)) names.push(primaryName);
    queue.push(...(adjacentNodeIds.get(currentNodeId) ?? []));
  }
  return names;
}

export function listMaterialTransitNetworkNodeDirections(
  snapshot: MaterialTransitNetworkSnapshot,
  nodeId: string,
): MaterialTransitNetworkDirection[] {
  const directions = new Set<MaterialTransitNetworkDirection>();
  for (const edge of snapshot.edges) {
    if (edge.source !== nodeId && edge.target !== nodeId) continue;
    const points = getMaterialTransitNetworkEdgePoints(snapshot, edge, edge.target === nodeId);
    const vector = findFirstVector(points);
    if (vector) directions.add(classifyDiagramDirection(vector));
  }
  return ['east', 'west', 'north', 'south'].filter((direction) =>
    directions.has(direction as MaterialTransitNetworkDirection),
  ) as MaterialTransitNetworkDirection[];
}

export function listMaterialTransitNetworkNodeLineDirections(
  snapshot: MaterialTransitNetworkSnapshot,
  nodeId: string,
  lineKey: string,
): MaterialTransitNetworkDirection[] {
  const directions = new Set<MaterialTransitNetworkDirection>();
  for (const edge of snapshot.edges) {
    if ((edge.source !== nodeId && edge.target !== nodeId) || !edge.lineKeys.includes(lineKey)) {
      continue;
    }
    const points = getMaterialTransitNetworkEdgePoints(snapshot, edge, edge.target === nodeId);
    const vector = findFirstVector(points);
    if (vector) directions.add(classifyDiagramDirection(vector));
  }
  return ['east', 'west', 'north', 'south'].filter((direction) =>
    directions.has(direction as MaterialTransitNetworkDirection),
  ) as MaterialTransitNetworkDirection[];
}

export function findMaterialTransitNetworkLineByKey(
  snapshot: MaterialTransitNetworkSnapshot,
  lineKey: string,
  nodeId?: string,
): MaterialTransitNetworkLineMatch | undefined {
  return collectMaterialTransitNetworkLineComponents(snapshot).find(
    (line) => line.lineKey === lineKey && (!nodeId || line.nodeIds.has(nodeId)),
  );
}

/**
 * 从当前站点按图上方向选定一条出边，并分别向线路两端追踪站序。
 * RMP 不保存运营意义上的上下行，因此这里的方向只用于确定“前方”是哪一侧。
 */
export function resolveMaterialTransitNetworkRoute(
  snapshot: MaterialTransitNetworkSnapshot,
  input: {
    nodeId: string;
    lineKey: string;
    direction: MaterialTransitNetworkDirection;
  },
): MaterialTransitNetworkRoute | undefined {
  const line = findMaterialTransitNetworkLineByKey(snapshot, input.lineKey, input.nodeId);
  if (!line) return undefined;
  const adjacency = createLineAdjacency(snapshot, line.edgeIds);
  const outgoing = (adjacency.get(input.nodeId) ?? []).filter((candidate) => {
    const points = getMaterialTransitNetworkEdgePoints(snapshot, candidate.edge, candidate.reverse);
    const vector = findFirstVector(points);
    return vector ? classifyDiagramDirection(vector) === input.direction : false;
  });
  const first = outgoing[0];
  if (!first) return undefined;

  const forward = findFarthestStationPath(snapshot, adjacency, input.nodeId, [first]);
  let backward = findFarthestStationPath(
    snapshot,
    adjacency,
    input.nodeId,
    (adjacency.get(input.nodeId) ?? []).filter((candidate) => candidate.edge.id !== first.edge.id),
  );
  if (backward.nodeIds.slice(1).some((nodeId) => forward.nodeIds.includes(nodeId))) {
    // 环线的两侧最终会在图上重新相遇，拼接两条路径会重复整圈。
    backward = { nodeIds: [input.nodeId], steps: [] };
  }
  const reversedBackwardSteps = [...backward.steps]
    .reverse()
    .map((step) => ({ edge: step.edge, reverse: !step.reverse }));
  const nodeIds = [...backward.nodeIds].reverse().concat(forward.nodeIds.slice(1));
  return {
    line,
    nodeIds,
    steps: [...reversedBackwardSteps, ...forward.steps],
    currentNodeIndex: backward.nodeIds.length - 1,
  };
}

export function findMaterialTransitNetworkLine(
  snapshot: MaterialTransitNetworkSnapshot,
  input: { name?: string; color?: string; stationNames: string[] },
): MaterialTransitNetworkLineMatch | undefined {
  const normalizedStationNames = new Set(
    input.stationNames.map(normalizeTransitNetworkName).filter(Boolean),
  );
  const groups = collectMaterialTransitNetworkLineComponents(snapshot);

  for (const group of groups) {
    group.matchedStationCount = Array.from(group.nodeIds).filter((nodeId) => {
      const node = snapshot.nodes.find((candidate) => candidate.id === nodeId);
      return node?.names.some((name) =>
        normalizedStationNames.has(normalizeTransitNetworkName(name)),
      );
    }).length;
  }

  const expectedColor = normalizeHexColor(input.color);
  const expectedName = normalizeTransitNetworkName(input.name);
  const ranked = groups.sort((left, right) => {
    const leftNameMatch =
      expectedName &&
      [left.lineName, left.secondaryLineName].some(
        (name) => normalizeTransitNetworkName(name) === expectedName,
      )
        ? 1
        : 0;
    const rightNameMatch =
      expectedName &&
      [right.lineName, right.secondaryLineName].some(
        (name) => normalizeTransitNetworkName(name) === expectedName,
      )
        ? 1
        : 0;
    const leftColorMatch = left.color === expectedColor ? 1 : 0;
    const rightColorMatch = right.color === expectedColor ? 1 : 0;
    return (
      rightNameMatch - leftNameMatch ||
      right.matchedStationCount - left.matchedStationCount ||
      rightColorMatch - leftColorMatch ||
      right.edgeIds.size - left.edgeIds.size
    );
  });
  const best = ranked[0];
  const nameMatched =
    expectedName &&
    [best?.lineName, best?.secondaryLineName].some(
      (name) => normalizeTransitNetworkName(name) === expectedName,
    );
  if (!best || (!nameMatched && best.matchedStationCount < 2)) return undefined;
  return best;
}

export function findMaterialTransitNetworkNodeByName(
  snapshot: MaterialTransitNetworkSnapshot,
  name: string,
  allowedNodeIds?: Set<string>,
): MaterialTransitNetworkNode | undefined {
  const normalizedName = normalizeTransitNetworkName(name);
  if (!normalizedName) return undefined;
  return snapshot.nodes.find(
    (node) =>
      node.kind === 'station' &&
      (!allowedNodeIds || allowedNodeIds.has(node.id)) &&
      node.names.some((candidate) => normalizeTransitNetworkName(candidate) === normalizedName),
  );
}

export function findMaterialTransitNetworkPath(
  snapshot: MaterialTransitNetworkSnapshot,
  allowedEdgeIds: Set<string>,
  startNodeId: string,
  endNodeId: string,
): Array<{ edge: MaterialTransitNetworkEdge; reverse: boolean }> | undefined {
  if (startNodeId === endNodeId) return [];
  const adjacency = new Map<
    string,
    Array<{ edge: MaterialTransitNetworkEdge; nextNodeId: string; reverse: boolean }>
  >();
  for (const edge of snapshot.edges) {
    if (!allowedEdgeIds.has(edge.id)) continue;
    appendAdjacency(adjacency, edge.source, { edge, nextNodeId: edge.target, reverse: false });
    appendAdjacency(adjacency, edge.target, { edge, nextNodeId: edge.source, reverse: true });
  }

  const queue = [startNodeId];
  const previous = new Map<
    string,
    { nodeId: string; edge: MaterialTransitNetworkEdge; reverse: boolean }
  >();
  const visited = new Set([startNodeId]);
  while (queue.length) {
    const nodeId = queue.shift()!;
    for (const candidate of adjacency.get(nodeId) ?? []) {
      if (visited.has(candidate.nextNodeId)) continue;
      visited.add(candidate.nextNodeId);
      previous.set(candidate.nextNodeId, {
        nodeId,
        edge: candidate.edge,
        reverse: candidate.reverse,
      });
      if (candidate.nextNodeId === endNodeId) {
        queue.length = 0;
        break;
      }
      queue.push(candidate.nextNodeId);
    }
  }
  if (!previous.has(endNodeId)) return undefined;

  const path: Array<{ edge: MaterialTransitNetworkEdge; reverse: boolean }> = [];
  let nodeId = endNodeId;
  while (nodeId !== startNodeId) {
    const step = previous.get(nodeId);
    if (!step) return undefined;
    path.push({ edge: step.edge, reverse: step.reverse });
    nodeId = step.nodeId;
  }
  return path.reverse();
}

export function getMaterialTransitNetworkEdgePoints(
  snapshot: MaterialTransitNetworkSnapshot,
  edge: MaterialTransitNetworkEdge,
  reverse = false,
): Array<[number, number]> {
  const source = snapshot.nodes.find((node) => node.id === edge.source);
  const target = snapshot.nodes.find((node) => node.id === edge.target);
  if (!source || !target) return [];
  const points = createEdgePoints(source, target, edge);
  return reverse ? points.reverse() : points;
}

export function resolveMaterialTransitNetworkDirection(
  snapshot: MaterialTransitNetworkSnapshot,
  line: MaterialTransitNetworkLineMatch,
  input: {
    currentNodeId: string;
    previousStationName?: string;
    nextStationName?: string;
  },
): MaterialTransitNetworkDirection | undefined {
  const currentNode = snapshot.nodes.find((node) => node.id === input.currentNodeId);
  if (!currentNode || !line.nodeIds.has(currentNode.id)) return undefined;

  const nextNode = input.nextStationName
    ? findMaterialTransitNetworkNodeByName(snapshot, input.nextStationName, line.nodeIds)
    : undefined;
  if (nextNode) {
    const points = getPathPoints(snapshot, line.edgeIds, currentNode.id, nextNode.id);
    const vector = findFirstVector(points);
    if (vector) return classifyDiagramDirection(vector);
  }

  const previousNode = input.previousStationName
    ? findMaterialTransitNetworkNodeByName(snapshot, input.previousStationName, line.nodeIds)
    : undefined;
  if (!previousNode) return undefined;
  const points = getPathPoints(snapshot, line.edgeIds, previousNode.id, currentNode.id);
  const vector = findLastVector(points);
  return vector ? classifyDiagramDirection(vector) : undefined;
}

export function normalizeTransitNetworkName(value: string | undefined): string {
  return (value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase('zh-CN')
    .replace(/[\s·・•()（）\[\]【】_-]+/gu, '');
}

function parseRmpNode(value: unknown): MaterialTransitNetworkNode | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const node = value as RmpGraphNode;
  if (typeof node.key !== 'string' || !node.key || !isRecord(node.attributes)) return undefined;
  const attributes = node.attributes;
  if (attributes.visible === false) return undefined;
  const x = readFiniteNumber(attributes.x);
  const y = readFiniteNumber(attributes.y);
  if (x === undefined || y === undefined) return undefined;
  const type = typeof attributes.type === 'string' ? attributes.type : '';
  const specific = type && isRecord(attributes[type]) ? attributes[type] : {};
  const names = Array.isArray(specific.names)
    ? uniqueStrings(
        specific.names
          .filter((name): name is string => typeof name === 'string')
          .map((name) => name.trim())
          .filter(Boolean),
      ).slice(0, 8)
    : [];
  const colorTuples = extractRmpColorTuples(specific);
  return {
    id: node.key.slice(0, 120),
    kind: node.key.startsWith('stn_') ? 'station' : 'junction',
    names,
    x,
    y,
    lineKeys: uniqueStrings(colorTuples.map((tuple) => tuple.key)).slice(0, 24),
    lineColors: uniqueStrings(colorTuples.map((tuple) => tuple.color)).slice(0, 24),
  };
}

function parseRmpEdge(
  value: unknown,
  nodeById: Map<string, MaterialTransitNetworkNode>,
): MaterialTransitNetworkEdge | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const edge = value as RmpGraphEdge;
  if (
    typeof edge.key !== 'string' ||
    typeof edge.source !== 'string' ||
    typeof edge.target !== 'string' ||
    !nodeById.has(edge.source) ||
    !nodeById.has(edge.target) ||
    !isRecord(edge.attributes) ||
    edge.attributes.visible === false
  ) {
    return undefined;
  }
  const attributes = edge.attributes;
  const style = typeof attributes.style === 'string' ? attributes.style : '';
  const styleAttributes = style && isRecord(attributes[style]) ? attributes[style] : attributes;
  const colorTuples = extractRmpColorTuples(styleAttributes).slice(0, 4);
  if (!colorTuples.length) return undefined;
  const rawPathKind = typeof attributes.type === 'string' ? attributes.type : '';
  const pathKind = normalizePathKind(rawPathKind);
  const pathAttributes =
    rawPathKind && isRecord(attributes[rawPathKind]) ? attributes[rawPathKind] : {};
  const startFrom = pathAttributes.startFrom === 'to' ? 'to' : 'from';
  return {
    id: edge.key.slice(0, 120),
    source: edge.source,
    target: edge.target,
    lineKeys: colorTuples.map((tuple) => tuple.key),
    colors: colorTuples.map((tuple) => tuple.color),
    pathKind,
    startFrom,
    offsetFrom: readFiniteNumber(pathAttributes.offsetFrom),
    offsetTo: readFiniteNumber(pathAttributes.offsetTo),
    roundCornerFactor: readFiniteNumber(pathAttributes.roundCornerFactor),
  };
}

function extractRmpColorTuples(value: unknown, depth = 0): RmpColorTuple[] {
  if (depth > 10 || value === null || value === undefined) return [];
  if (Array.isArray(value)) {
    const color = normalizeHexColor(value[2]);
    if (typeof value[0] === 'string' && typeof value[1] === 'string' && color) {
      return [{ key: `${value[0]}:${value[1]}`.slice(0, 120), color }];
    }
    return value.flatMap((item) => extractRmpColorTuples(item, depth + 1));
  }
  if (!isRecord(value)) return [];
  return Object.values(value).flatMap((item) => extractRmpColorTuples(item, depth + 1));
}

function createEdgePoints(
  source: MaterialTransitNetworkNode,
  target: MaterialTransitNetworkNode,
  edge: MaterialTransitNetworkEdge,
): Array<[number, number]> {
  const start: [number, number] = [source.x, source.y];
  const end: [number, number] = [target.x, target.y];
  const startFrom = edge.startFrom ?? 'from';
  if (edge.pathKind === 'perpendicular') {
    const corner: [number, number] =
      startFrom === 'from' ? [target.x, source.y] : [source.x, target.y];
    return compactPoints([start, corner, end]);
  }
  if (edge.pathKind === 'rotate-perpendicular') {
    const sqrtHalf = Math.SQRT1_2;
    const rx1 = source.x * sqrtHalf + source.y * sqrtHalf;
    const ry1 = -source.x * sqrtHalf + source.y * sqrtHalf;
    const rx2 = target.x * sqrtHalf + target.y * sqrtHalf;
    const ry2 = -target.x * sqrtHalf + target.y * sqrtHalf;
    const rx = startFrom === 'from' ? rx2 : rx1;
    const ry = startFrom === 'from' ? ry1 : ry2;
    return compactPoints([
      start,
      [rx * sqrtHalf - ry * sqrtHalf, rx * sqrtHalf + ry * sqrtHalf],
      end,
    ]);
  }
  if (edge.pathKind === 'diagonal') {
    const [x1, y1, x2, y2] =
      startFrom === 'from'
        ? [source.x, source.y, target.x, target.y]
        : [target.x, target.y, source.x, source.y];
    const horizontal = Math.abs(x2 - x1) >= Math.abs(y2 - y1);
    const corner: [number, number] = horizontal
      ? [x2 + Math.abs(y2 - y1) * (x2 > x1 ? -1 : 1), y1]
      : [x1, y2 + Math.abs(x2 - x1) * (y2 > y1 ? -1 : 1)];
    const points = compactPoints([[x1, y1], corner, [x2, y2]]);
    return startFrom === 'from' ? points : points.reverse();
  }
  return [start, end];
}

function compactPoints(points: Array<[number, number]>): Array<[number, number]> {
  return points.filter(
    (point, index) =>
      index === 0 || point[0] !== points[index - 1]![0] || point[1] !== points[index - 1]![1],
  );
}

function getPathPoints(
  snapshot: MaterialTransitNetworkSnapshot,
  allowedEdgeIds: Set<string>,
  startNodeId: string,
  endNodeId: string,
): Array<[number, number]> {
  const path = findMaterialTransitNetworkPath(snapshot, allowedEdgeIds, startNodeId, endNodeId);
  if (!path) return [];
  const points: Array<[number, number]> = [];
  for (const step of path) {
    for (const point of getMaterialTransitNetworkEdgePoints(snapshot, step.edge, step.reverse)) {
      const previous = points.at(-1);
      if (!previous || previous[0] !== point[0] || previous[1] !== point[1]) points.push(point);
    }
  }
  return points;
}

function findFirstVector(points: Array<[number, number]>): [number, number] | undefined {
  const start = points[0];
  if (!start) return undefined;
  for (const point of points.slice(1)) {
    const vector: [number, number] = [point[0] - start[0], point[1] - start[1]];
    if (Math.abs(vector[0]) > 0.001 || Math.abs(vector[1]) > 0.001) return vector;
  }
  return undefined;
}

function findLastVector(points: Array<[number, number]>): [number, number] | undefined {
  const end = points.at(-1);
  if (!end) return undefined;
  for (let index = points.length - 2; index >= 0; index -= 1) {
    const point = points[index];
    if (!point) continue;
    const vector: [number, number] = [end[0] - point[0], end[1] - point[1]];
    if (Math.abs(vector[0]) > 0.001 || Math.abs(vector[1]) > 0.001) return vector;
  }
  return undefined;
}

function classifyDiagramDirection(vector: [number, number]): MaterialTransitNetworkDirection {
  if (Math.abs(vector[0]) >= Math.abs(vector[1])) return vector[0] < 0 ? 'west' : 'east';
  return vector[1] < 0 ? 'north' : 'south';
}

function collectMaterialTransitNetworkLineComponents(
  snapshot: MaterialTransitNetworkSnapshot,
): MaterialTransitNetworkLineMatch[] {
  const edgesByLineKey = new Map<
    string,
    Array<{ edge: MaterialTransitNetworkEdge; color: string }>
  >();
  for (const edge of snapshot.edges) {
    edge.colors.forEach((color, index) => {
      const lineKey = edge.lineKeys[index] ?? edge.lineKeys[0];
      if (!lineKey) return;
      const candidates = edgesByLineKey.get(lineKey) ?? [];
      if (!candidates.some((candidate) => candidate.edge.id === edge.id)) {
        candidates.push({ edge, color });
        edgesByLineKey.set(lineKey, candidates);
      }
    });
  }

  const components: MaterialTransitNetworkLineMatch[] = [];
  for (const [lineKey, candidates] of edgesByLineKey) {
    const candidatesByNode = new Map<
      string,
      Array<{ edge: MaterialTransitNetworkEdge; color: string }>
    >();
    for (const candidate of candidates) {
      appendAdjacency(candidatesByNode, candidate.edge.source, candidate);
      appendAdjacency(candidatesByNode, candidate.edge.target, candidate);
    }
    const visitedEdgeIds = new Set<string>();
    for (const firstCandidate of candidates) {
      if (visitedEdgeIds.has(firstCandidate.edge.id)) continue;
      const queue = [firstCandidate];
      const edgeIds = new Set<string>();
      const nodeIds = new Set<string>();
      const colorCounts = new Map<string, number>();
      while (queue.length) {
        const candidate = queue.shift()!;
        if (visitedEdgeIds.has(candidate.edge.id)) continue;
        visitedEdgeIds.add(candidate.edge.id);
        edgeIds.add(candidate.edge.id);
        nodeIds.add(candidate.edge.source);
        nodeIds.add(candidate.edge.target);
        colorCounts.set(candidate.color, (colorCounts.get(candidate.color) ?? 0) + 1);
        for (const nodeId of [candidate.edge.source, candidate.edge.target]) {
          for (const neighbor of candidatesByNode.get(nodeId) ?? []) {
            if (!visitedEdgeIds.has(neighbor.edge.id)) queue.push(neighbor);
          }
        }
      }
      const color = Array.from(colorCounts.entries()).sort(
        (left, right) => right[1] - left[1],
      )[0]?.[0];
      if (!color) continue;
      components.push({
        lineKey,
        color,
        lineName: resolveMaterialTransitNetworkLineNames(snapshot, lineKey)?.name,
        secondaryLineName: resolveMaterialTransitNetworkLineNames(snapshot, lineKey)?.secondaryName,
        edgeIds,
        nodeIds,
        matchedStationCount: 0,
      });
    }
  }
  return components;
}

function appendAdjacency<T>(map: Map<string, T[]>, key: string, value: T): void {
  map.set(key, [...(map.get(key) ?? []), value]);
}

function normalizePathKind(value: string): MaterialTransitNetworkPathKind {
  if (value === 'simple') return 'simple';
  if (value === 'diagonal') return 'diagonal';
  if (value === 'perpendicular') return 'perpendicular';
  if (value === 'ro-perp' || value === 'rotate-perpendicular') return 'rotate-perpendicular';
  return 'unknown';
}

function normalizeHexColor(value: unknown): string | undefined {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
    ? value.toUpperCase()
    : undefined;
}

function formatLineKey(value: string): string {
  return value.split(':').at(-1) || value;
}

export function resolveMaterialTransitNetworkLineNames(
  snapshot: MaterialTransitNetworkSnapshot,
  lineKey: string,
): NonNullable<MaterialTransitNetworkSnapshot['lineNames']>[number] | undefined {
  const configuredNames = snapshot.lineNames?.find((line) => line.lineKey === lineKey);
  if (configuredNames) return configuredNames;
  const lineNumber = lineKey.match(/([0-9]+)$/u)?.[1];
  return lineNumber
    ? {
        lineKey,
        name: `${lineNumber}号线`,
        secondaryName: `Line ${lineNumber}`,
      }
    : undefined;
}

interface MaterialTransitNetworkAdjacentEdge {
  edge: MaterialTransitNetworkEdge;
  nextNodeId: string;
  reverse: boolean;
}

function createLineAdjacency(
  snapshot: MaterialTransitNetworkSnapshot,
  edgeIds: Set<string>,
): Map<string, MaterialTransitNetworkAdjacentEdge[]> {
  const adjacency = new Map<string, MaterialTransitNetworkAdjacentEdge[]>();
  for (const edge of snapshot.edges) {
    if (!edgeIds.has(edge.id)) continue;
    appendAdjacency(adjacency, edge.source, {
      edge,
      nextNodeId: edge.target,
      reverse: false,
    });
    appendAdjacency(adjacency, edge.target, {
      edge,
      nextNodeId: edge.source,
      reverse: true,
    });
  }
  return adjacency;
}

function findFarthestStationPath(
  snapshot: MaterialTransitNetworkSnapshot,
  adjacency: Map<string, MaterialTransitNetworkAdjacentEdge[]>,
  currentNodeId: string,
  firstCandidates: MaterialTransitNetworkAdjacentEdge[],
): {
  nodeIds: string[];
  steps: Array<{ edge: MaterialTransitNetworkEdge; reverse: boolean }>;
} {
  if (!firstCandidates.length) return { nodeIds: [currentNodeId], steps: [] };
  const visited = new Set([currentNodeId]);
  const queue = firstCandidates.map((candidate) => ({
    nodeId: candidate.nextNodeId,
    nodeIds: [currentNodeId, candidate.nextNodeId],
    steps: [{ edge: candidate.edge, reverse: candidate.reverse }],
  }));
  for (const candidate of firstCandidates) visited.add(candidate.nextNodeId);
  let best = {
    nodeIds: [currentNodeId],
    steps: [] as Array<{ edge: MaterialTransitNetworkEdge; reverse: boolean }>,
  };

  while (queue.length) {
    const current = queue.shift()!;
    const node = snapshot.nodes.find((candidate) => candidate.id === current.nodeId);
    if (
      node?.kind === 'station' &&
      node.names.length &&
      current.steps.length >= best.steps.length
    ) {
      best = { nodeIds: current.nodeIds, steps: current.steps };
    }
    for (const candidate of adjacency.get(current.nodeId) ?? []) {
      if (visited.has(candidate.nextNodeId)) continue;
      visited.add(candidate.nextNodeId);
      queue.push({
        nodeId: candidate.nextNodeId,
        nodeIds: [...current.nodeIds, candidate.nextNodeId],
        steps: [...current.steps, { edge: candidate.edge, reverse: candidate.reverse }],
      });
    }
  }
  return best;
}

function formatMaterialTransitNetworkLineLabel(
  lineNames: ReturnType<typeof resolveMaterialTransitNetworkLineNames>,
  lineKey: string,
): string {
  if (!lineNames) return formatLineKey(lineKey);
  return [lineNames.name, lineNames.secondaryName].filter(Boolean).join(' / ');
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}

function readFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readFiniteInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
