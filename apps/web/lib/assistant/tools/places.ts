import { readPublicMapMarkerSnapshot } from '../../map-marker-public-snapshot-store';
import {
  findTransitLineMarker,
  queryAlongLineMarkers,
  queryNearbyMarkers,
  readSpatialMarkerContext,
  type SpatialMarker,
  type SpatialPlaceItem,
} from '../../map-spatial-query';
import { readPoiCategories } from '../../poi-categories';
import { readTransitOverview } from '../../transit-data';
import { buildPlaceQueryCandidates } from '../place-synonyms';
import { buildMarkerSearchValues, buildMarkerSnippet, rankSearchMatches } from '../retrieval';
import {
  emptyToolResult,
  type AssistantTool,
  type AssistantToolReference,
  type AssistantToolResult,
} from './types';

interface SearchPlacesInput {
  query: string;
  limit?: number;
}

export const searchPlacesTool: AssistantTool<SearchPlacesInput> = {
  name: 'search_places',
  title: '搜索地点',
  description:
    '按名称或类别检索雨城通地图收录的地点（含商场、超市、医院、站点附属设施等）。返回地点名称、分类、地址和地图入口。',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: '地点名称或类别关键词，例如“尚瑞超市”“医院”。' },
      limit: { type: 'number', description: '返回条数，默认 6。', minimum: 1, maximum: 12 },
    },
    required: ['query'],
    additionalProperties: false,
  },
  async run(input, context): Promise<AssistantToolResult> {
    const query = input.query.trim();
    const limit = input.limit ?? 6;
    const snapshot = await readPublicMapMarkerSnapshot();
    if (!snapshot) {
      return emptyToolResult('地图地点数据暂不可用，无法检索地点。');
    }

    const categoryNames = new Map(
      (await readPoiCategories().catch(() => [])).map((category) => [category.id, category.name]),
    );
    const markers = snapshot.snapshot.markers.filter((marker) => marker.categoryId !== 'player');
    const placeCandidates = buildPlaceQueryCandidates(query);
    const matches = rankSearchMatches(
      markers,
      query,
      (marker) => buildMarkerSearchValues(marker, categoryNames, context.locale),
      limit,
      {
        allowLoose: true,
        getLooseValues: (marker) => [marker.label, ...Object.values(marker.localizedLabels ?? {})],
        extraCandidates: placeCandidates,
      },
    );

    if (matches.length === 0) {
      return emptyToolResult(`站内地图没有收录与“${query}”匹配的地点。`);
    }

    return {
      summary: [
        `找到 ${matches.length} 个与“${query}”相关的地点：`,
        ...matches.map((marker, index) => {
          const detail = buildMarkerSnippet(marker, categoryNames, context.locale);
          return `${index + 1}. ${marker.label}${detail ? `（${detail}）` : ''}`;
        }),
      ].join('\n'),
      references: matches.map((marker) => ({
        title: marker.label,
        source: '地点',
        href: `/map?marker=${encodeURIComponent(marker.id)}`,
        asOf: snapshot.snapshot.fetchedAt,
        color: marker.accentColor,
        tone: 'place',
        snippet: buildMarkerSnippet(marker, categoryNames, context.locale),
      })),
    };
  },
};

interface NearbyPlacesInput {
  anchor: string;
  radius?: number;
  categories?: string[];
  limit?: number;
}

export const nearbyPlacesTool: AssistantTool<NearbyPlacesInput> = {
  name: 'nearby_places',
  title: '周边地点',
  description:
    '以某个地点为圆心，按距离查找周边地点。适合“XX 附近有什么”“XX 周边有哪些超市”这类问题。距离单位是地图格。',
  inputSchema: {
    type: 'object',
    properties: {
      anchor: { type: 'string', description: '锚点地点名称或地点 ID。' },
      radius: {
        type: 'number',
        description: '搜索半径（地图格）；不传时按距离取最近的 N 个地点，与站内问一问一致。',
        minimum: 1,
        maximum: 2000,
      },
      categories: {
        type: 'array',
        description: '类别筛选，例如 ["超市","医院"]；留空表示不限。',
        items: { type: 'string' },
      },
      limit: { type: 'number', description: '返回条数，默认 6。', minimum: 1, maximum: 20 },
    },
    required: ['anchor'],
    additionalProperties: false,
  },
  async run(input, context): Promise<AssistantToolResult> {
    const anchorText = input.anchor.trim();
    const limit = input.limit ?? 6;
    // 不传半径时按距离取最近的 N 个地点，避免默认 300 格把站内已有的结果挡掉。
    const radius = input.radius ?? Number.POSITIVE_INFINITY;
    const spatial = await readSpatialMarkerContext(context.locale);
    if (!spatial) {
      return emptyToolResult('地图地点数据暂不可用，无法计算周边。');
    }

    const anchor = resolveAnchor(anchorText, spatial.markers);
    if (!anchor) {
      return emptyToolResult(`没有找到锚点地点“${anchorText}”，无法计算周边。`);
    }

    const result = queryNearbyMarkers(spatial, {
      anchor,
      radius,
      categories: resolveSpatialCategories(input.categories),
      limit,
    });
    if (!result || result.items.length === 0) {
      return emptyToolResult(
        Number.isFinite(radius)
          ? `“${anchor.label}”周边 ${radius} 格内没有收录其他地点。`
          : `“${anchor.label}”周边没有收录其他地点。`,
      );
    }

    return {
      summary: [
        Number.isFinite(radius)
          ? `“${anchor.label}”周边 ${radius} 格内找到 ${result.items.length} 个地点（按距离排序）：`
          : `“${anchor.label}”周边最近的 ${result.items.length} 个地点（不限半径）：`,
        ...formatPlaceLines(result.items, 'distance'),
      ].join('\n'),
      references: [
        {
          title: `${anchor.label}周边`,
          source: '周边',
          snippet: Number.isFinite(radius)
            ? `半径 ${radius} 格内共 ${result.items.length} 个地点，按距离排序`
            : `共 ${result.items.length} 个最近地点，按距离排序`,
          tone: 'place',
        },
        ...result.items.map((item) => toPlaceReference(item, '周边', `距${anchor.label}`)),
      ],
    };
  },
};

interface AlongLinePlacesInput {
  line: string;
  corridor?: number;
  categories?: string[];
  limit?: number;
}

export const alongLinePlacesTool: AssistantTool<AlongLinePlacesInput> = {
  name: 'along_line_places',
  title: '沿线地点',
  description:
    '查找某条公交/地铁线路沿途的地点，按沿线里程排序。适合“XX 路沿线有哪些商场”“这条线经过哪里”。',
  inputSchema: {
    type: 'object',
    properties: {
      line: { type: 'string', description: '线路名称，例如“3 路”。' },
      corridor: {
        type: 'number',
        description: '线路两侧的搜索走廊（地图格），默认 300。',
        minimum: 1,
        maximum: 1000,
      },
      categories: {
        type: 'array',
        description: '类别筛选，例如 ["商场","医院"]；留空表示不限。',
        items: { type: 'string' },
      },
      limit: { type: 'number', description: '返回条数，默认 8。', minimum: 1, maximum: 20 },
    },
    required: ['line'],
    additionalProperties: false,
  },
  async run(input, context): Promise<AssistantToolResult> {
    const lineText = input.line.trim();
    const limit = input.limit ?? 8;
    const corridor = input.corridor ?? 300;
    const spatial = await readSpatialMarkerContext(context.locale);
    if (!spatial) {
      return emptyToolResult('地图地点数据暂不可用，无法计算沿线。');
    }

    const overview = await readTransitOverview();
    const line = overview.lines
      .filter((entry) => entry.name.includes(lineText) || lineText.includes(entry.name))
      .sort((left, right) => right.name.length - left.name.length)[0];
    const lineMarker = findTransitLineMarker(spatial.markers, {
      lineId: line?.id,
      label: line?.name ?? lineText,
    });
    if (!lineMarker) {
      return emptyToolResult(`没有找到线路“${lineText}”的地图走向，无法计算沿线地点。`);
    }

    const result = queryAlongLineMarkers(spatial, {
      line: lineMarker,
      corridor,
      categories: resolveSpatialCategories(input.categories),
      limit,
    });
    if (!result || result.items.length === 0) {
      return emptyToolResult(`“${lineMarker.label}”沿线 ${corridor} 格内没有收录其他地点。`);
    }

    return {
      summary: [
        `“${lineMarker.label}”沿线 ${corridor} 格内找到 ${result.items.length} 个地点（按里程排序）：`,
        ...formatPlaceLines(result.items, 'mileage'),
      ].join('\n'),
      references: [
        {
          title: `${lineMarker.label}沿线`,
          source: '沿线',
          snippet: `走廊 ${corridor} 格内共 ${result.items.length} 个地点，按沿线里程排序`,
          tone: 'place',
        },
        ...result.items.map((item) => toPlaceReference(item, '沿线', `距线路`)),
      ],
    };
  },
};

/** 口语类别（“商场”“美食”）要映射到站内分类名（“商业”“餐饮”），与问一问保持同一套同义词。 */
function resolveSpatialCategories(categories: string[] | undefined): string[] | undefined {
  if (!categories || categories.length === 0) {
    return undefined;
  }

  const expanded = new Set<string>();
  for (const category of categories) {
    expanded.add(category);
    for (const candidate of buildPlaceQueryCandidates(category)) {
      expanded.add(candidate);
    }
  }
  return [...expanded];
}

/** 锚点优先按 ID 命中，其次按名称精确/包含匹配。 */
function resolveAnchor(text: string, markers: SpatialMarker[]) {
  const byId = markers.find((marker) => marker.id === text);
  if (byId) {
    return byId;
  }

  const normalized = text.toLocaleLowerCase();
  const exact = markers.find(
    (marker) =>
      marker.label.toLocaleLowerCase() === normalized ||
      Object.values(marker.localizedLabels ?? {}).some(
        (label) => label.toLocaleLowerCase() === normalized,
      ),
  );
  if (exact) {
    return exact;
  }

  return markers
    .filter(
      (marker) =>
        marker.categoryId !== 'player' &&
        marker.label.length >= 2 &&
        (marker.label.includes(text) || text.includes(marker.label)),
    )
    .sort((left, right) => right.label.length - left.label.length)[0];
}

function formatPlaceLines(items: SpatialPlaceItem[], mode: 'distance' | 'mileage'): string[] {
  return items.map((item, index) => {
    const metrics =
      mode === 'mileage' && item.mileage !== undefined
        ? `沿线 ${item.mileage} 格，距线路 ${item.distance} 格`
        : `距离 ${item.distance} 格`;
    return `${index + 1}. ${item.label}${item.categoryLabel ? `（${item.categoryLabel}）` : ''} · ${metrics}${
      item.address ? ` · ${item.address}` : ''
    }`;
  });
}

function toPlaceReference(
  item: SpatialPlaceItem,
  source: string,
  distanceLabel: string,
): AssistantToolReference {
  return {
    title: item.label,
    source,
    href: `/map?marker=${encodeURIComponent(item.id)}`,
    snippet: [item.categoryLabel, `${distanceLabel} ${item.distance} 格`, item.address]
      .filter(Boolean)
      .join(' · '),
    tone: 'place',
  };
}
