import type { TicketableServiceKind, TravelScheduleTimeScope } from '@yct/contracts';
import { faqAnswerText } from '../../faq-content';
import { getLocalizedFaqContent } from '../../faq-translations';
import { readOperationDetail, readOperationsFeed } from '../../operations-content';
import { readServiceEntryGroups } from '../../service-entries';
import { readTravelScheduleQuery } from '../../travel-schedules';
import { rankSearchMatches } from '../retrieval';
import { emptyToolResult, type AssistantTool, type AssistantToolResult } from './types';

type SiteContentScope = 'all' | 'operations' | 'services' | 'faq';

interface SearchSiteContentInput {
  query: string;
  scope?: SiteContentScope;
  limit?: number;
}

/** 运营公告、服务目录与 FAQ 的统一检索，补齐 MCP 只有出行/地点工具的缺口。 */
export const searchSiteContentTool: AssistantTool<SearchSiteContentInput> = {
  name: 'search_site_content',
  title: '搜索站内内容',
  description:
    '检索运营公告、服务目录和常见问题（FAQ）。适合“最近有什么公告”“哪里能买票”“怎么安装应用”“为什么找不到数据”这类站内信息问题。',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: '检索关键词，建议 2-30 个字。' },
      scope: {
        type: 'string',
        description:
          '检索范围：operations 运营公告、services 服务目录、faq 常见问题、all 全部（默认）。',
        enum: ['all', 'operations', 'services', 'faq'],
      },
      limit: { type: 'number', description: '返回条数，默认 6。', minimum: 1, maximum: 20 },
    },
    required: ['query'],
    additionalProperties: false,
  },
  async run(input, context): Promise<AssistantToolResult> {
    const query = input.query.trim();
    const scope = input.scope ?? 'all';
    const limit = input.limit ?? 6;
    const perScope = scope === 'all' ? Math.max(2, Math.ceil(limit / 3)) : limit;
    const references: AssistantToolResult['references'] = [];
    const sections: string[] = [];

    if (scope === 'all' || scope === 'operations') {
      const feed = await readOperationsFeed();
      const matches = rankSearchMatches(
        feed.items,
        query,
        (item) => [
          item.title,
          item.excerpt,
          item.categoryId,
          ...(item.tags ?? []),
          ...(item.customTags ?? []),
        ],
        perScope,
      );
      if (matches.length > 0) {
        sections.push(
          ...matches.map(
            (item) => `[运营] ${item.title}${item.excerpt ? `：${item.excerpt}` : ''}`,
          ),
        );
        references.push(
          ...matches.map((item) => ({
            title: item.title,
            source: '运营',
            href: `/operations/${encodeURIComponent(item.id)}`,
            asOf: item.publishedAt,
            snippet: item.excerpt,
            tone: 'operation',
          })),
        );
      }
    }

    if (scope === 'all' || scope === 'services') {
      const groups = await readServiceEntryGroups();
      const entries = groups.items.flatMap((group) =>
        group.items.map((entry) => ({ entry, groupTitle: group.title })),
      );
      const matches = rankSearchMatches(
        entries,
        query,
        ({ entry, groupTitle }) => [entry.title, entry.description, groupTitle, entry.href],
        perScope,
      );
      if (matches.length > 0) {
        sections.push(
          ...matches.map(
            ({ entry, groupTitle }) =>
              `[服务] ${entry.title}：${[groupTitle, entry.description].filter(Boolean).join(' · ')}`,
          ),
        );
        references.push(
          ...matches.map(({ entry, groupTitle }) => ({
            title: entry.title,
            source: '服务',
            href: entry.href,
            asOf: entry.publishedAt,
            snippet: [groupTitle, entry.description].filter(Boolean).join(' · '),
            tone: 'service',
          })),
        );
      }
    }

    if (scope === 'all' || scope === 'faq') {
      const faqContent = getLocalizedFaqContent(context.locale);
      const items = faqContent.groups.flatMap((group) =>
        group.items.map((item) => ({ item, groupTitle: group.title })),
      );
      const matches = rankSearchMatches(
        items,
        query,
        ({ item }) => [item.question, faqAnswerText(item.answer), ...(item.keywords ?? [])],
        perScope,
      );
      if (matches.length > 0) {
        sections.push(
          ...matches.map(
            ({ item }) => `[FAQ] ${item.question}：${faqAnswerText(item.answer).slice(0, 200)}`,
          ),
        );
        references.push(
          ...matches.map(({ item }) => ({
            title: item.question,
            source: 'FAQ',
            href: `/services/faq#${encodeURIComponent(item.id)}`,
            snippet: faqAnswerText(item.answer).slice(0, 240),
            tone: 'faq',
          })),
        );
      }
    }

    if (references.length === 0) {
      return emptyToolResult(`站内没有检索到与“${query}”相关的运营公告、服务或常见问题。`);
    }

    return {
      summary: [
        `找到 ${references.length} 条站内内容：`,
        ...sections.map((line, index) => `${index + 1}. ${line}`),
      ].join('\n'),
      references,
    };
  },
};

interface OperationDetailInput {
  id: string;
}

/** 运营公告正文，供 MCP 客户端在检索到摘要后继续读取细节。 */
export const operationDetailTool: AssistantTool<OperationDetailInput> = {
  name: 'get_operation_detail',
  title: '运营公告详情',
  description: '按 ID 读取一条运营公告的完整正文；先用 search_site_content 或其它工具拿到公告 ID。',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: '运营公告的内容 ID。' },
    },
    required: ['id'],
    additionalProperties: false,
  },
  async run(input): Promise<AssistantToolResult> {
    const id =
      input.id
        .replace(/^.*\/operations\//u, '')
        .split(/[?#]/u)[0]
        ?.trim() ?? '';
    const detail = await readOperationDetail(id);
    if (!detail.item) {
      return emptyToolResult(`没有找到 ID 为“${id}”的运营公告，可能尚未发布或已经归档。`);
    }

    const item = detail.item;
    return {
      summary: [
        `《${item.title}》`,
        item.publishedAt ? `发布时间：${item.publishedAt}` : undefined,
        item.expiresAt ? `有效期至：${item.expiresAt}` : undefined,
        '',
        item.markdown.slice(0, 4000),
      ]
        .filter((line): line is string => line !== undefined)
        .join('\n'),
      references: [
        {
          title: item.title,
          source: '运营',
          href: `/operations/${encodeURIComponent(item.id)}`,
          asOf: item.publishedAt,
          snippet: item.excerpt,
          tone: 'operation',
        },
      ],
    };
  },
};

interface QueryTravelSchedulesInput {
  query?: string;
  origin?: string;
  destination?: string;
  serviceDate?: string;
  serviceKind?: TicketableServiceKind | 'all';
  timeScope?: TravelScheduleTimeScope;
  limit?: number;
}

/** 客运班次列表：补齐 plan_journey 只能给起终点方案、无法按站点或日期浏览班次的缺口。 */
export const queryTravelSchedulesTool: AssistantTool<QueryTravelSchedulesInput> = {
  name: 'query_travel_schedules',
  title: '客运班次列表',
  description:
    '按站点、起终点、日期或班次号查询客运/船班/航班班次列表，返回发车时间、票价、班次性质与备注。适合“明天有哪些船班”“某站有哪些班次”这类问题。',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: '班次号、线路名或关键词。' },
      origin: { type: 'string', description: '起点站名称。' },
      destination: { type: 'string', description: '终点站名称。' },
      serviceDate: { type: 'string', description: '乘车日期，格式 YYYY-MM-DD；留空表示今天。' },
      serviceKind: {
        type: 'string',
        description: '班次类型；留空表示全部。',
        enum: ['all', 'coach', 'ferry', 'flight', 'railway', 'custom'],
      },
      timeScope: {
        type: 'string',
        description: '时间范围：all 全部、upcoming 未出发、past 已出发；默认 all。',
        enum: ['all', 'upcoming', 'past'],
      },
      limit: { type: 'number', description: '返回条数，默认 8。', minimum: 1, maximum: 20 },
    },
    required: [],
    additionalProperties: false,
  },
  async run(input): Promise<AssistantToolResult> {
    const limit = input.limit ?? 8;
    const result = await readTravelScheduleQuery({
      query: input.query,
      originStationName: input.origin,
      destinationStationName: input.destination,
      serviceDate: input.serviceDate,
      serviceKind: input.serviceKind,
      timeScope: input.timeScope ?? 'all',
    });
    const trips = result.item?.trips ?? [];
    if (trips.length === 0) {
      return emptyToolResult(
        result.item?.notice ?? '没有查到符合条件的客运班次，可能是站名不匹配或当日无班次。',
      );
    }

    const limited = trips.slice(0, limit);
    return {
      summary: [
        `找到 ${trips.length} 个班次${limited.length < trips.length ? `（列出前 ${limited.length} 个）` : ''}：`,
        ...limited.map((trip) => {
          const route = [
            trip.originStationName ?? trip.stationNames[0],
            trip.destinationStationName ?? trip.stationNames.at(-1),
          ]
            .filter(Boolean)
            .join(' → ');
          return [
            `${trip.tripCode ?? trip.lineName}`,
            trip.serviceNature,
            route,
            `${trip.departureTime}${trip.arrivalTime ? ` - ${trip.arrivalTime}` : ''}`,
            trip.routeNote,
            trip.fareText,
          ]
            .filter(Boolean)
            .join(' · ');
        }),
      ].join('\n'),
      references: limited.map((trip) => ({
        title:
          [trip.serviceNature, trip.tripCode ?? trip.lineName].filter(Boolean).join(' · ') ||
          trip.serviceLabel,
        source: '班次',
        href: `/travel/schedules?q=${encodeURIComponent(trip.tripCode ?? trip.lineName)}`,
        asOf: trip.publishedAt,
        snippet: buildTripSnippet(trip),
        tone: 'schedule',
      })),
    };
  },
};

function buildTripSnippet(trip: {
  serviceLabel?: string;
  serviceNature?: string;
  routeNote?: string;
  originStationName?: string;
  destinationStationName?: string;
  stationNames: string[];
  departureTime: string;
  arrivalTime?: string;
  fareText?: string;
  ticketing?: { status?: string; availableCapacity?: number };
}): string {
  return [
    trip.serviceNature,
    trip.serviceLabel,
    [
      trip.originStationName ?? trip.stationNames[0],
      trip.destinationStationName ?? trip.stationNames.at(-1),
    ]
      .filter(Boolean)
      .join(' → '),
    [trip.departureTime, trip.arrivalTime].filter(Boolean).join(' - '),
    trip.routeNote,
    trip.fareText,
    trip.ticketing?.status === 'order_available'
      ? '可在线购票'
      : trip.ticketing?.status === 'legacy_reference_only'
        ? '仅可查询班次'
        : undefined,
    trip.ticketing?.availableCapacity === undefined
      ? undefined
      : `余票 ${trip.ticketing.availableCapacity}`,
  ]
    .filter(Boolean)
    .join(' · ');
}
