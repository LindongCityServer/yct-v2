import type { DataSourceStatus, LocaleCode, TransitStationDetailSnapshot } from '@yct/contracts';
import { buildPageGuide } from './page-guide';
import { faqAnswerText } from '../faq-content';
import { getLocalizedFaqContent } from '../faq-translations';
import { getMarkerCategoryLabel } from '../map-marker-categories';
import {
  getMaterialWorkspaceGuide,
  rankMaterialGuides,
  resolveMaterialWorkspace,
  shouldStayInWorkspace,
} from './material-workspaces';
import { readPublicMapMarkerSnapshot } from '../map-marker-public-snapshot-store';
import { readOperationsFeed } from '../operations-content';
import { readPoiCategories } from '../poi-categories';
import { readServiceEntryGroups } from '../service-entries';
import { matchSiteSocialLinks } from '../site-social-links';
import { rankSocialPosts, readSocialPosts } from '../social-content';
import { buildSearchHaystack, normalizeSearchText, scoreSearchMatch } from '../text-search';
import { readTransitStationDetails } from '../transit-station-details';
import { readTransitOverview } from '../transit-data';
import { readTravelScheduleQuery } from '../travel-schedules';
import { searchWiki } from '../wiki-search';

export interface AssistantReference {
  id: number;
  title: string;
  source: string;
  href?: string;
  asOf?: string;
  snippet?: string;
  /** 线路/地点自身的标识色，用于引用 chip 着色。 */
  color?: string;
  /** 语义类型：line / station / place / operation / service / faq / wiki / social / page / schedule。 */
  tone?: string;
}

export interface AssistantRetrieval {
  references: AssistantReference[];
  contextText: string;
  sourceStatus: DataSourceStatus;
  asOf?: string;
  generatedAt: string;
}

export interface AssistantRetrievalOptions {
  pathname?: string;
  highlights?: Array<{ kind: string; title: string; detail?: string }>;
}

const maximumReferences = 10;
const maximumSnippetLength = 320;
const minimumMatchScore = 8;

/** 用户是否在问“当前页面/当前查看的内容”。 */
const pageReferencePattern =
  /这个页面|這頁|这页|当前页面|當前頁面|本页|本頁|此页|此頁|怎么用|怎麼用|能做什么|能做什麼|this page|what can i do/i;
const highlightReferencePattern =
  /这条|這條|这个|這個|这里|這裡|当前|當前|选中|選中|上面|刚才|剛才|它|this\b|current/i;

export async function buildAssistantRetrieval(
  rawQuery: string,
  locale: LocaleCode,
  options: AssistantRetrievalOptions = {},
): Promise<AssistantRetrieval> {
  const query = rawQuery.trim();
  const normalizedQuery = normalizeSearchText(query);
  const references: AssistantReference[] = [];
  const seen = new Set<string>();
  const statuses: DataSourceStatus[] = [];

  if (!normalizedQuery) {
    return {
      references,
      contextText: '',
      sourceStatus: 'not_configured',
      generatedAt: new Date().toISOString(),
    };
  }

  const addReference = (reference: Omit<AssistantReference, 'id'>) => {
    if (references.length >= maximumReferences) {
      return;
    }

    const key = `${reference.source}:${reference.href ?? reference.title}`;
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    references.push({
      ...reference,
      id: references.length + 1,
      snippet: reference.snippet?.trim().slice(0, maximumSnippetLength) || undefined,
    });
  };

  const wantsSchedule =
    /班次|船|航班|车次|列车|大巴|客运|出发|到达|时刻|ferry|flight|train|schedule|departure|arrival/i.test(
      query,
    );
  const schedulePromise = wantsSchedule
    ? readTravelScheduleQuery({ query, timeScope: 'all' })
    : Promise.resolve(null);
  const wikiQuery = buildWikiQuery(query);

  const [
    operationsResult,
    servicesResult,
    transitResult,
    stationsResult,
    markersResult,
    scheduleResult,
    categoriesResult,
    wikiResult,
    socialPostsResult,
  ] = await Promise.allSettled([
    readOperationsFeed(),
    readServiceEntryGroups(),
    readTransitOverview(),
    readTransitStationDetails(),
    readPublicMapMarkerSnapshot(),
    schedulePromise,
    readPoiCategories(),
    searchWiki(wikiQuery, 3),
    readSocialPosts(),
  ]);

  const categoryNames = new Map<string, string>(
    categoriesResult.status === 'fulfilled'
      ? categoriesResult.value.map((category) => [category.id, category.name])
      : [],
  );

  const highlights = options.highlights ?? [];
  const workspaceId = resolveMaterialWorkspace(options.pathname);
  const workspaceGuide = workspaceId ? getMaterialWorkspaceGuide(workspaceId) : undefined;
  // 物料工作台内默认只答工作台操作；用户明确问外部数据时才放开服务器语料。
  const workspaceScoped = workspaceGuide ? shouldStayInWorkspace(workspaceGuide, query) : false;
  const referencesPage = pageReferencePattern.test(query);
  const referencesHighlight =
    referencesPage ||
    highlightReferencePattern.test(query) ||
    highlights.some((highlight) => query.includes(highlight.title));

  if (options.pathname && referencesPage) {
    const guide = buildPageGuide(options.pathname, locale);
    if (guide) {
      addReference({
        title: `${guide.title}（当前页面）`,
        source: '当前页面',
        snippet: guide.summary,
        tone: 'page',
      });
    }
  }

  // 工作台内问题只带工作台语料；用户明确问了服务器数据时才走全站资料。
  if (workspaceGuide && workspaceScoped) {
    addReference({
      title: workspaceGuide.title,
      source: '物料工作台',
      snippet: workspaceGuide.summary,
      tone: 'service',
    });
    for (const entry of rankMaterialGuides(workspaceGuide, query, 4)) {
      addReference({
        title: entry.title,
        source: '物料工作台',
        snippet: entry.content,
        tone: 'service',
      });
    }
  }

  if (workspaceScoped) {
    return {
      references,
      contextText: buildContextText(references),
      sourceStatus: 'ready',
      asOf: undefined,
      generatedAt: new Date().toISOString(),
    };
  }

  for (const link of matchSiteSocialLinks(query).slice(0, 3)) {
    addReference({
      title: link.label,
      source: '社交',
      href: link.href,
      snippet:
        locale === 'en'
          ? `${link.labelEn} · official community link`
          : `${link.label} · 官方社交与社区入口`,
      tone: 'social',
    });
  }

  if (socialPostsResult.status === 'fulfilled') {
    for (const post of rankSocialPosts(socialPostsResult.value, query)) {
      addReference({
        title: post.title,
        source: 'B站动态',
        href: post.href,
        asOf: post.publishedAt,
        snippet: post.text,
        tone: 'social',
      });
    }
  }

  // Wiki 对“临东历史/线路由来”这类问题最相关，优先占用引用名额。
  if (wikiResult.status === 'fulfilled') {
    for (const item of wikiResult.value) {
      addReference({
        title: item.title,
        source: 'Wiki',
        href: item.href,
        asOf: item.updatedAt,
        snippet: item.snippet,
        tone: 'wiki',
      });
    }
  }

  if (referencesHighlight) {
    for (const highlight of highlights) {
      if (highlight.kind === 'line' && transitResult.status === 'fulfilled') {
        const line = transitResult.value.lines.find((entry) => {
          if (entry.name === highlight.title) {
            return true;
          }
          return locale === 'zh-CN' ? false : entry.localizedName?.[locale] === highlight.title;
        });
        if (line) {
          const stationNames = line.stationNames.slice(0, 40);
          addReference({
            title: line.name,
            source: '线路',
            href: `/map?line=${encodeURIComponent(line.id)}`,
            color: line.color,
            tone: 'line',
            snippet: [
              stationNames.length > 0
                ? `经过 ${line.stationNames.length} 站：${stationNames.join(' → ')}${
                    line.stationNames.length > stationNames.length ? ' …' : ''
                  }`
                : undefined,
              line.operator,
              line.fare,
            ]
              .filter(Boolean)
              .join(' · '),
          });
        }
        continue;
      }

      if (
        highlight.kind === 'marker' &&
        markersResult.status === 'fulfilled' &&
        markersResult.value
      ) {
        const marker = markersResult.value.snapshot.markers.find(
          (entry) =>
            entry.label === highlight.title ||
            Object.values(entry.localizedLabels ?? {}).includes(highlight.title),
        );
        if (marker) {
          addReference({
            title: marker.label,
            source: '地点',
            href: `/map?marker=${encodeURIComponent(marker.id)}`,
            asOf: markersResult.value.snapshot.fetchedAt,
            color: marker.accentColor,
            tone: 'place',
            snippet: buildMarkerSnippet(marker, categoryNames, locale),
          });
        }
        continue;
      }

      if (highlight.kind === 'station' && stationsResult.status === 'fulfilled') {
        const station = stationsResult.value.items.find(
          (entry) => entry.stationName === highlight.title,
        );
        if (station) {
          addReference({
            title: `${station.lineName} · ${station.stationName}`,
            source: '站点',
            tone: 'station',
            snippet: [
              `站内设施 ${station.facilities.length} 项`,
              station.transfers.length > 0
                ? `可换乘 ${station.transfers.length} 条线路`
                : undefined,
            ]
              .filter(Boolean)
              .join(' · '),
          });
        }
      }
    }
  }

  if (scheduleResult.status === 'fulfilled' && scheduleResult.value) {
    statuses.push(scheduleResult.value.meta.sourceStatus);
    const trips = scheduleResult.value.item?.trips ?? [];
    for (const trip of trips.slice(0, 3)) {
      addReference({
        title: [trip.tripCode, trip.lineName].filter(Boolean).join(' · '),
        source: '班次',
        href: `/travel/schedules?q=${encodeURIComponent(trip.tripCode ?? trip.lineName)}`,
        asOf: trip.publishedAt,
        tone: 'schedule',
        snippet: [
          trip.serviceLabel,
          [
            trip.originStationName ?? trip.stationNames[0],
            trip.destinationStationName ?? trip.stationNames.at(-1),
          ]
            .filter(Boolean)
            .join(' - '),
          [trip.departureTime, trip.arrivalTime].filter(Boolean).join(' - '),
          trip.fareText,
        ]
          .filter(Boolean)
          .join(' · '),
      });
    }
  }

  if (operationsResult.status === 'fulfilled') {
    statuses.push(operationsResult.value.meta.sourceStatus);
    const matches = rankSearchMatches(
      operationsResult.value.items,
      query,
      (item) => [
        item.title,
        item.excerpt,
        item.categoryId,
        ...(item.customTags ?? []),
        ...(item.tags ?? []),
      ],
      2,
    );
    for (const item of matches) {
      addReference({
        title: item.title,
        source: '运营',
        href: `/operations/${encodeURIComponent(item.id)}`,
        asOf: item.publishedAt,
        snippet: item.excerpt,
        tone: 'operation',
      });
    }
  }

  if (servicesResult.status === 'fulfilled') {
    statuses.push(servicesResult.value.meta.sourceStatus);
    const entries = servicesResult.value.items.flatMap((group) =>
      group.items.map((entry) => ({ entry, groupTitle: group.title })),
    );
    const matches = rankSearchMatches(
      entries,
      query,
      ({ entry, groupTitle }) => [entry.title, entry.description, groupTitle, entry.href],
      2,
    );
    for (const { entry, groupTitle } of matches) {
      addReference({
        title: entry.title,
        source: '服务',
        href: entry.href,
        asOf: entry.publishedAt,
        snippet: [groupTitle, entry.description].filter(Boolean).join(' · '),
        tone: 'service',
      });
    }
  }

  if (transitResult.status === 'fulfilled') {
    statuses.push(transitResult.value.meta.sourceStatus);
    const matches = rankSearchMatches(
      transitResult.value.lines,
      query,
      (line) => [
        line.name,
        line.operator,
        line.firstStationName,
        line.lastStationName,
        ...line.stationNames,
      ],
      2,
    );
    for (const line of matches) {
      addReference({
        title: line.name,
        source: '线路',
        href: `/map?line=${encodeURIComponent(line.id)}`,
        color: line.color,
        tone: 'line',
        snippet: [
          line.firstStationName && line.lastStationName
            ? `${line.firstStationName} → ${line.lastStationName}`
            : undefined,
          line.operator,
          line.fare,
        ]
          .filter(Boolean)
          .join(' · '),
      });
    }
  }

  if (stationsResult.status === 'fulfilled') {
    statuses.push(stationsResult.value.meta.sourceStatus);
    const matches = rankSearchMatches(
      stationsResult.value.items,
      query,
      (station) => [station.lineName, station.stationName],
      2,
    );
    for (const station of matches) {
      addReference({
        title: `${station.lineName} · ${station.stationName}`,
        source: '站点',
        tone: 'station',
        snippet: buildStationSnippet(station),
      });
    }
  }

  if (markersResult.status === 'fulfilled' && markersResult.value) {
    statuses.push(markersResult.value.meta.sourceStatus);
    const matches = rankSearchMatches(
      markersResult.value.snapshot.markers.filter((marker) => marker.categoryId !== 'player'),
      query,
      (marker) => [
        marker.label,
        marker.secondaryLabel,
        marker.address,
        marker.description,
        marker.floorLabel,
        marker.parentLabel,
        getMarkerCategoryLabel(marker.categoryId, categoryNames, locale),
        ...Object.values(marker.localizedLabels ?? {}),
        ...(marker.facilities?.flatMap((facility) => [facility.description, facility.symbolIcon]) ??
          []),
      ],
      3,
    );
    for (const marker of matches) {
      addReference({
        title: marker.label,
        source: '地点',
        href: `/map?marker=${encodeURIComponent(marker.id)}`,
        asOf: markersResult.value.snapshot.fetchedAt,
        color: marker.accentColor,
        tone: 'place',
        snippet: buildMarkerSnippet(marker, categoryNames, locale),
      });
    }
  }

  const faqContent = getLocalizedFaqContent(locale);
  const faqEntries = faqContent.groups.flatMap((group) =>
    group.items.map((item) => ({ item, groupTitle: group.title })),
  );
  const faqMatches = rankSearchMatches(
    faqEntries,
    query,
    ({ item, groupTitle }) => [
      item.question,
      faqAnswerText(item.answer),
      groupTitle,
      ...(item.keywords ?? []),
    ],
    3,
  );
  for (const { item } of faqMatches) {
    addReference({
      title: item.question,
      source: 'FAQ',
      href: `/services/faq#${item.id}`,
      snippet: faqAnswerText(item.answer),
      tone: 'faq',
    });
  }

  const sourceStatus: DataSourceStatus =
    references.length > 0
      ? 'ready'
      : statuses.includes('unavailable')
        ? 'unavailable'
        : 'not_configured';
  const asOf = references
    .map((reference) => reference.asOf)
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => right.localeCompare(left))[0];

  return {
    references,
    contextText: buildContextText(references),
    sourceStatus,
    asOf,
    generatedAt: new Date().toISOString(),
  };
}

const wikiQuestionPattern =
  /是什么|是甚麼|是谁|是誰|怎么样|怎麼樣|为什么|為什麼|为啥|為啥|怎么|怎麼|如何|请问|請問|帮我|幫我|我想|我要|能不能|可不可以|可以吗|可以嗎|有哪些|有什么|有什麼|哪里|哪裡|哪些|在哪|在哪儿|多少|多久|吗|嗎|呢/g;

/** Wiki 检索需要去掉疑问词，否则 MediaWiki 难以命中中文短语。 */
function buildWikiQuery(query: string): string {
  const segments = query
    .replace(/[？?！!。，,、；;：:]/g, ' ')
    .replace(wikiQuestionPattern, ' ')
    .split(/\s+/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length >= 2);

  if (segments.length === 0) {
    return query.trim();
  }

  return [...segments].sort((left, right) => right.length - left.length)[0].slice(0, 60);
}

function buildMarkerSnippet(
  marker: {
    categoryId?: string;
    address?: string;
    floorLabel?: string;
    description?: string;
    openingHours?: string;
    facilities?: Array<{ description: string }>;
  },
  categoryNames: Map<string, string>,
  locale: LocaleCode,
): string {
  const facilities = marker.facilities
    ?.map((facility) => facility.description)
    .filter(Boolean)
    .slice(0, 8)
    .join('、');

  return [
    getMarkerCategoryLabel(marker.categoryId, categoryNames, locale),
    marker.floorLabel ? `位置：${marker.floorLabel}` : undefined,
    marker.address,
    marker.description,
    marker.openingHours,
    facilities ? `设施：${facilities}` : undefined,
  ]
    .filter(Boolean)
    .join(' · ');
}

function buildStationSnippet(station: TransitStationDetailSnapshot): string {
  const facilities = [...station.facilities, ...(station.facilitiesUpwards ?? [])]
    .slice(0, 8)
    .map((facility) => [facility.type, facility.floor].filter(Boolean).join('@'))
    .filter(Boolean)
    .join('、');
  const exits = (station.exits ?? [])
    .slice(0, 6)
    .map((exit) => [exit.code, exit.floor, exit.description].filter(Boolean).join(' '))
    .filter(Boolean)
    .join('；');

  return [
    facilities ? `设施：${facilities}` : undefined,
    exits ? `出口：${exits}` : undefined,
    station.transfers.length > 0 ? `可换乘 ${station.transfers.length} 条线路` : undefined,
  ]
    .filter(Boolean)
    .join(' · ');
}

function rankSearchMatches<T>(
  items: T[],
  query: string,
  getValues: (item: T) => Array<string | undefined | null>,
  limit: number,
): T[] {
  return items
    .map((item) => ({
      item,
      score: scoreSearchMatch(buildSearchHaystack(getValues(item)), query),
    }))
    .filter((entry) => entry.score >= minimumMatchScore)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map((entry) => entry.item);
}

/** 把 ISO 时间转成模型和用户都能直接读的日期。 */
export function formatReferenceDate(value: string | undefined): string {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function buildContextText(references: AssistantReference[]): string {
  if (references.length === 0) {
    return '（站内没有检索到相关资料）';
  }

  return references
    .map((reference) => {
      const lines = [`[${reference.id}] ${reference.source}：${reference.title}`];
      if (reference.asOf) {
        lines.push(`时间：${formatReferenceDate(reference.asOf)}`);
      }
      if (reference.snippet) {
        lines.push(`摘要：${reference.snippet}`);
      }
      if (reference.href) {
        lines.push(`站内入口：${reference.href}`);
      }
      return lines.join('\n');
    })
    .join('\n\n');
}
