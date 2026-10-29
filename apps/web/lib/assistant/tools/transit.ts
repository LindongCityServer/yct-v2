import { readTransitOverview } from '../../transit-data';
import { readTransitStationDetails } from '../../transit-station-details';
import {
  buildJourneyPlanReferences,
  buildLineTimetableReference,
  buildNetworkHealthSummaryReference,
} from '../extra-retrieval';
import { buildStationSnippet, rankSearchMatches } from '../retrieval';
import { emptyToolResult, type AssistantTool, type AssistantToolResult } from './types';

interface SearchTransitInput {
  query: string;
  kind?: 'line' | 'station' | 'all';
  limit?: number;
}

export const searchTransitTool: AssistantTool<SearchTransitInput> = {
  name: 'search_transit',
  title: '搜索线路与站点',
  description:
    '检索公交/地铁线路和站点详情，返回线路经过的站点、票价、运营方，或站点的设施、出口与换乘信息。',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: '线路名或站点名，例如“3 路”“中心站”。' },
      kind: {
        type: 'string',
        description: '检索范围：line 只查线路，station 只查站点，all 两者都查（默认）。',
        enum: ['line', 'station', 'all'],
      },
      limit: { type: 'number', description: '每类返回条数，默认 4。', minimum: 1, maximum: 10 },
    },
    required: ['query'],
    additionalProperties: false,
  },
  async run(input): Promise<AssistantToolResult> {
    const query = input.query.trim();
    const kind = input.kind ?? 'all';
    const limit = input.limit ?? 4;
    const [overview, stations] = await Promise.all([
      readTransitOverview(),
      readTransitStationDetails(),
    ]);

    const references: AssistantToolResult['references'] = [];

    if (kind !== 'station') {
      const lines = rankSearchMatches(
        overview.lines,
        query,
        (line) => [
          line.name,
          line.operator,
          line.firstStationName,
          line.lastStationName,
          ...line.stationNames,
        ],
        limit,
      );
      for (const line of lines) {
        const stationNames = line.stationNames.slice(0, 40);
        references.push({
          title: line.name,
          source: '线路',
          href: `/map?line=${encodeURIComponent(line.id)}`,
          color: line.color,
          tone: 'line',
          snippet: [
            line.firstStationName && line.lastStationName
              ? `${line.firstStationName} → ${line.lastStationName}`
              : undefined,
            stationNames.length > 0
              ? `经过 ${line.stationNames.length} 站：${stationNames.join(' → ')}${
                  line.stationNames.length > stationNames.length ? ' …' : ''
                }`
              : line.operator,
            line.fare,
          ]
            .filter(Boolean)
            .join(' · '),
        });
      }
    }

    if (kind !== 'line') {
      const matches = rankSearchMatches(
        stations.items,
        query,
        (station) => [station.lineName, station.stationName],
        limit,
      );
      const lineIds = new Map(overview.lines.map((line) => [line.name, line.id]));
      for (const station of matches) {
        const lineId = lineIds.get(station.lineName);
        references.push({
          title: `${station.lineName} · ${station.stationName}`,
          source: '站点',
          href: lineId ? `/map?line=${encodeURIComponent(lineId)}` : undefined,
          tone: 'station',
          snippet: buildStationSnippet(station),
        });
      }
    }

    if (references.length === 0) {
      return emptyToolResult(`站内没有收录与“${query}”匹配的线路或站点。`);
    }

    return {
      summary: [
        `找到 ${references.length} 条与“${query}”相关的线路/站点：`,
        ...references.map(
          (reference, index) =>
            `${index + 1}. [${reference.source}] ${reference.title}${
              reference.snippet ? `：${reference.snippet}` : ''
            }`,
        ),
      ].join('\n'),
      references,
    };
  },
};

interface LineTimetableInput {
  line: string;
}

export const lineTimetableTool: AssistantTool<LineTimetableInput> = {
  name: 'line_timetable',
  title: '线路发车时刻',
  description:
    '查询某条线路的首末班和上下行下一班发车时间。时间以北京时间计算，可直接回答“末班车还有吗”。',
  inputSchema: {
    type: 'object',
    properties: {
      line: { type: 'string', description: '线路名称，例如“3 路”。' },
    },
    required: ['line'],
    additionalProperties: false,
  },
  async run(input): Promise<AssistantToolResult> {
    const lineText = input.line.trim();
    const overview = await readTransitOverview();
    const query = normalizeTransitLineName(lineText);
    const matches = overview.lines
      .map((line) => ({ line, name: normalizeTransitLineName(line.name) }))
      .map((entry) => ({ ...entry, score: getTransitLineMatchScore(entry.name, query) }))
      .filter((entry) => entry.score > 0)
      .sort(
        (left, right) =>
          right.score - left.score ||
          left.name.length - right.name.length ||
          left.name.localeCompare(right.name, 'zh-CN'),
      );

    if (matches.length === 0) {
      return emptyToolResult(`站内没有收录线路“${lineText}”。`);
    }

    // 同一匹配层级可能有多条线路（例如“181”同时命中主线和支线），全部返回；
    // 但用户明确写“181路”时，精确匹配会优先，不会混入支线。
    const bestScore = matches[0]!.score;
    const bestMatches = matches.filter((entry) => entry.score === bestScore).slice(0, 4);
    const references = bestMatches.map((entry) => buildLineTimetableReference(entry.line));
    return {
      summary: [
        bestMatches.length > 1
          ? `找到 ${bestMatches.length} 条与“${lineText}”相关的线路：`
          : undefined,
        ...references.map(
          (reference, index) =>
            `${bestMatches.length > 1 ? `${index + 1}. ` : ''}${reference.title}：${reference.snippet}`,
        ),
      ]
        .filter(Boolean)
        .join('\n'),
      references,
    };
  },
};

function normalizeTransitLineName(value: string): string {
  return value.replace(/[\s\u3000]+/g, '').toLocaleLowerCase();
}

function getTransitLineMatchScore(name: string, query: string): number {
  if (!name || !query) {
    return 0;
  }
  if (name === query) {
    return 3;
  }
  if (name.startsWith(query) || query.startsWith(name)) {
    return 2;
  }
  return name.includes(query) || query.includes(name) ? 1 : 0;
}

interface JourneyPlanInput {
  origin: string;
  destination: string;
  serviceDate?: string;
}

export const journeyPlanTool: AssistantTool<JourneyPlanInput> = {
  name: 'plan_journey',
  title: '换乘方案',
  description:
    '按班次数据规划从起点站到终点站的乘车方案，返回出发/到达时间、耗时、换乘次数和购票状态。',
  inputSchema: {
    type: 'object',
    properties: {
      origin: { type: 'string', description: '起点站名称。' },
      destination: { type: 'string', description: '终点站名称。' },
      serviceDate: {
        type: 'string',
        description: '乘车日期，格式 YYYY-MM-DD；留空表示今天（北京时间）。',
      },
    },
    required: ['origin', 'destination'],
    additionalProperties: false,
  },
  async run(input): Promise<AssistantToolResult> {
    const references = await buildJourneyPlanReferences(input.origin, input.destination, {
      serviceDate: input.serviceDate,
    });
    if (references.length === 0) {
      return emptyToolResult(
        `没有查到“${input.origin}”到“${input.destination}”的可行班次方案，可能是站名不匹配或当日无班次。`,
      );
    }

    return {
      summary: references
        .map((reference, index) => `${index + 1}. ${reference.title}：${reference.snippet}`)
        .join('\n'),
      references,
    };
  },
};

export const networkHealthTool: AssistantTool = {
  name: 'network_health',
  title: '线网数据健康',
  description:
    '报告当前收录的线路数、站点数、不完整线路和换乘站数量，用于解释“为什么某条线路没有数据”。',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
    additionalProperties: false,
  },
  async run(): Promise<AssistantToolResult> {
    const reference = await buildNetworkHealthSummaryReference();
    return {
      summary: `${reference.title}：${reference.snippet}`,
      references: [reference],
    };
  },
};
