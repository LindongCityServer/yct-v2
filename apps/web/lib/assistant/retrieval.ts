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
import { listPublishedMaterialTemplates } from '../material-workflow';
import { readOperationsFeed, readOperationDetail } from '../operations-content';
import {
  findSpatialMarker,
  findTransitLineMarker,
  matchesSpatialCategory,
  queryAlongLineMarkers,
  queryNearbyMarkers,
  toSpatialPlaceItem,
  type SpatialMarker,
  type SpatialMarkerContext,
  type SpatialPlaceItem,
} from '../map-spatial-query';
import { buildPlaceQueryCandidates } from './place-synonyms';
import { buildPlayerLocationReferences } from './player-retrieval';
import { buildEasterEggContext, isEasterEggQuery } from './easter-egg';
import type { CurrentPlayerLocation } from './current-location';
import { matchUiGuideEntries } from './ui-guide';
import {
  buildCurrentLocationRouteReferences,
  buildDestinationRouteReference,
  buildJourneyReferences,
  buildLineTimetableReferences,
  buildMapRoutePlanReferences,
  buildNetworkHealthReference,
  buildPoiOperationReferences,
  buildServiceNoticeReferences,
} from './extra-retrieval';
import { readPoiCategories } from '../poi-categories';
import { readServiceEntryGroups } from '../service-entries';
import { matchSiteSocialLinks } from '../site-social-links';
import { rankSocialPosts, readSocialPosts } from '../social-content';
import {
  buildSearchHaystack,
  buildSearchTokens,
  normalizeSearchText,
  scoreSearchMatch,
} from '../text-search';
import { readTransitStationDetails } from '../transit-station-details';
import { readTransitOverview } from '../transit-data';
import { readTravelScheduleQuery } from '../travel-schedules';
import { searchWikiWithStatus, type WikiSearchOutcome } from '../wiki-search';

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
  /** 只给模型看的正文摘录，不进入前端引用 chip。 */
  context?: string;
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
  /** 当前登录账号绑定的玩家最后记录位置，只用于本人相关的位置与路线问题。 */
  currentLocation?: CurrentPlayerLocation;
}

const maximumReferences = 10;
const maximumSnippetLength = 320;
const minimumMatchScore = 8;
/** 关键词兜底：站内搜索按整串包含匹配，长问句会漏掉“尚瑞超市”这类条目，这里允许单个关键词命中。 */
const minimumLooseMatchScore = 5;

/** 问句里的语气词、疑问词和泛化方位词，去掉后才是真正的检索关键词。 */
const queryNoisePattern =
  /有哪些|有什么|有没有|哪个|哪些|哪里|哪儿|怎么|怎样|如何|为什么|是不是|能不能|可不可以|请问|帮我|推荐|介绍|告诉|知道|地方|附近|周边|城里|市内|全市|全区|站内|这里|那里|这些|那些|一些|一个|多少|几个|吗|呢|吧|呀|啊/g;

/** 地点检索里太泛的关键词，命中它们不能说明地点相关。 */
const genericPlaceTokenPattern =
  /^(?:公交|线路|经过|调整|运营|公告|通知|地点|地址|道路|车站|城市|服务|设施|信息|情况|目前|现在|查询|查看|使用|相关)$/;

/** 地图已有的空间检索能力：周边按距离、沿线按里程。 */
const spatialNearbyPattern = /(附近|周边)/u;
const spatialAlongLinePattern = /(沿线|沿途|沿路)/u;

/** 用户是否在问“当前页面/当前查看的内容”。 */
const pageReferencePattern =
  /这个页面|這頁|这页|当前页面|當前頁面|本页|本頁|此页|此頁|怎么用|怎麼用|能做什么|能做什麼|this page|what can i do/i;
const highlightReferencePattern =
  /这条|這條|这个|這個|这里|這裡|当前|當前|选中|選中|上面|刚才|剛才|它|this\b|current/i;

/** 只有这些问法才会带上“当前账号位置”，避免普通问答暴露位置。 */
const currentLocationQuestionPattern =
  /我在哪|我在哪里|我现在在哪|我的位置|我的坐标|当前位置|我这|我这里|怎么去|怎么到|怎么走|如何到|如何前往|路线/u;
const askingWhereAmI = /我在哪|我在哪里|我现在在哪|我的位置|我的坐标|当前位置/u;

/** 反馈、报错与建议类问法，需要额外给一个可直接提交的 Issue 入口。 */
const feedbackIntentPattern =
  /反馈|报错|出错|错误|异常|打不开|加载不出|无法加载|白屏|卡住|闪退|崩溃|没反应|不能用|提(?:个|一个)?建议|功能建议|改进建议|意见反馈|bug|issue|crash|broken|not working/i;
/** 项目开源仓库；与设置页保持一致。 */
const feedbackIssueBaseUrl = 'https://github.com/LindongCityServer/yct-v2/issues/new';

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
    // 同名同类且摘要完全一致的地点对用户没有区分度，合并成一条。
    const contentKey = `${reference.source}|${reference.title}|${reference.snippet ?? ''}`;
    if (seen.has(key) || seen.has(contentKey)) {
      return;
    }

    seen.add(key);
    seen.add(contentKey);
    references.push({
      ...reference,
      id: references.length + 1,
      snippet: reference.snippet?.trim().slice(0, maximumSnippetLength) || undefined,
    });
  };

  const wantsSchedule =
    /班次|船|航班|车次|列车|大巴|客运|出发|到达|时刻|快线|夜线|直达|特快|ferry|flight|train|schedule|departure|arrival/i.test(
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
    searchWikiWithStatus(wikiQuery, 3),
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
    const workspaceHref =
      workspaceId === 'road-materials' ? '/services/road-materials' : '/services/transit-materials';
    addReference({
      title: workspaceGuide.title,
      source: '物料工作台',
      href: workspaceHref,
      snippet: workspaceGuide.summary,
      tone: 'service',
    });
    for (const entry of rankMaterialGuides(workspaceGuide, query, 4)) {
      addReference({
        title: entry.title,
        source: '物料工作台',
        href: workspaceHref,
        snippet: entry.content,
        tone: 'service',
      });
    }

    const templatePattern =
      workspaceId === 'road-materials' ? /路牌|地址牌|门牌/ : /公交|地铁|导视|站牌|线路图|站名/;
    const templates = (await listPublishedMaterialTemplates())
      .filter((item) => templatePattern.test(item.template.title))
      .slice(0, 12);
    if (templates.length > 0) {
      addReference({
        title: '当前可用模板',
        source: '物料工作台',
        href: workspaceHref,
        snippet: [...new Set(templates.map((item) => item.template.title))].join('、'),
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

  // 起终点换乘方案：有明确起终点时优先给出行程。
  for (const reference of await buildJourneyReferences(query)) {
    addReference(reference);
  }

  // 玩家位置：只有用户点名某个玩家时才返回，避免把在线列表暴露给随意提问。
  for (const reference of await buildPlayerLocationReferences(query)) {
    addReference(reference);
  }

  // 起终点明确时，直接把起终点带进地图已有的路线规划，不再重复算一套方案。
  const routePlanReferences =
    markersResult.status === 'fulfilled' && markersResult.value
      ? buildMapRoutePlanReferences(query, markersResult.value.snapshot.markers)
      : [];

  // 站内界面与图例是确定性内容，直接作为语料，避免回答“站内没有说明”。
  for (const entry of matchUiGuideEntries(query)) {
    addReference({
      title: entry.title,
      source: '站内说明',
      href: entry.href,
      snippet: entry.content,
      tone: 'page',
    });
  }

  // 问一问形象的彩蛋：只进入模型上下文，不在界面上生成引用来源。
  const easterEggContext = isEasterEggQuery(query) ? buildEasterEggContext() : '';

  // 当前账号绑定的玩家位置：只在问位置或路线时出现，路线入口用这份位置作为起点。
  const currentLocation = options.currentLocation;
  if (currentLocation && currentLocationQuestionPattern.test(query)) {
    addReference({
      title: `${currentLocation.playerName}（当前位置）`,
      source: '当前位置',
      href: `/map?x=${Math.round(currentLocation.x)}&z=${Math.round(currentLocation.z)}&label=${encodeURIComponent(currentLocation.playerName)}`,
      asOf: currentLocation.lastSeenAt,
      snippet: [
        `坐标 ${Math.round(currentLocation.x)}, ${Math.round(currentLocation.z)}`,
        '服务器记录的最后位置，以地图上的玩家标记为准',
      ].join(' · '),
      tone: 'place',
    });
  }
  const markerPoints =
    markersResult.status === 'fulfilled' && markersResult.value
      ? markersResult.value.snapshot.markers
      : [];
  if (currentLocation) {
    for (const reference of buildCurrentLocationRouteReferences(
      query,
      markerPoints,
      currentLocation,
    )) {
      addReference(reference);
    }
  } else {
    // 没有账号位置时，至少把目的地带到地图上，让用户自己补起点。
    for (const reference of buildDestinationRouteReference(query, markerPoints)) {
      addReference(reference);
    }
    if (askingWhereAmI.test(query)) {
      addReference({
        title: '在地图上查看当前位置',
        source: '当前位置',
        href: '/map',
        snippet:
          '还没有拿到你绑定的服务器账号位置记录：需要登录并验证服务器账号，并且服务器近期采集到过你的位置。也可以直接在地图上手动定位当前位置。',
        tone: 'place',
      });
    }
  }
  for (const reference of routePlanReferences) {
    addReference(reference);
  }

  // 路线问法无论能不能解析出起终点，都至少给一个地图入口，避免只回答操作步骤。
  if (
    /怎么走|怎么去|怎么到|如何去|如何到|如何前往|怎么前往|前往|去往|的路线|路线规划|规划路线|步行|驾车|开车|骑车|换乘/u.test(
      query,
    ) &&
    !references.some((reference) => reference.source === '路线规划')
  ) {
    addReference({
      title: '打开地图路线规划',
      source: '路线规划',
      href: '/map',
      snippet:
        '没有解析出可预填的起终点。打开地图后点“路线”按钮，设置起点和终点，即可查看步行、公交、驾车等方案。',
      tone: 'line',
    });
  }

  // 只有真正预填了起终点的深链才跳过线路/站点检索；兜底入口不算。
  const hasPrefilledRoutePlan = routePlanReferences.some((reference) =>
    (reference.href ?? '').includes('r=1'),
  );

  // 周边/沿线问题优先用空间数据，社交动态和 Wiki 会挤占引用名额。
  const spatialQueryIntent =
    spatialNearbyPattern.test(query) ||
    spatialAlongLinePattern.test(query) ||
    /(经过|途经|路过)/u.test(query) ||
    hasPrefilledRoutePlan;

  if (!spatialQueryIntent) {
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
  }

  if (feedbackIntentPattern.test(query)) {
    addReference({
      title: locale === 'en' ? 'Report an issue on GitHub' : '提交 Issue 反馈问题',
      source: '问题反馈',
      href: buildFeedbackIssueUrl(query, locale),
      snippet:
        locale === 'en'
          ? 'Submit a bug report or suggestion. Include the page URL, time, screenshot and steps to reproduce; never paste passwords or model API keys.'
          : '可直接提交问题或建议。请在 Issue 里附上页面地址、出现时间、截图和复现步骤；不要填写账号密码或模型 Key。',
      tone: 'page',
    });
  }

  if (socialPostsResult.status === 'fulfilled' && socialIntentPattern.test(query)) {
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
  if (wikiResult.status === 'fulfilled' && !spatialQueryIntent) {
    for (const item of wikiResult.value.results) {
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

  // 周边/沿线：复用地图同一套空间计算；只有拿到锚点和坐标时才启用。
  let spatialApplied = false;
  let focusPlace: { id: string; label: string } | undefined;
  if (markersResult.status === 'fulfilled' && markersResult.value) {
    const spatialContext: SpatialMarkerContext = {
      markers: markersResult.value.snapshot.markers,
      fetchedAt: markersResult.value.snapshot.fetchedAt,
      categoryNames,
      locale,
    };
    const mentionedLine =
      transitResult.status === 'fulfilled'
        ? transitResult.value.lines.find((entry) => query.includes(entry.name))
        : undefined;
    const lineLabel = mentionedLine?.name ?? query.match(/[A-Za-z]?\d+路/u)?.[0];
    const alongIntent = spatialAlongLinePattern.test(query) || /(经过|途经|路过)/u.test(query);
    // “中华路沿线”这类道路问法没有数字线路名，改用同名 road 采样点作为沿线锚点。
    const roadLabel =
      alongIntent && !lineLabel ? findRoadLabel(query, spatialContext.markers) : undefined;
    const wantsAlong = Boolean(lineLabel || roadLabel) && alongIntent;
    const wantsNearby = spatialNearbyPattern.test(query);
    const lineMarker =
      wantsAlong && lineLabel
        ? findTransitLineMarker(spatialContext.markers, {
            lineId: mentionedLine?.id,
            label: lineLabel,
          })
        : undefined;
    const roadMarker =
      wantsAlong && !lineMarker && roadLabel
        ? buildRoadAlongMarker(spatialContext.markers, roadLabel)
        : undefined;
    const alongTarget = lineMarker ?? roadMarker;
    const anchor = wantsNearby
      ? ([...new Set(highlights.filter((item) => item.kind === 'marker').map((item) => item.title))]
          .map((title) => findSpatialMarker(spatialContext.markers, { label: title }))
          .find(Boolean) ??
        spatialContext.markers
          .filter(
            (marker) =>
              marker.label.length >= 2 &&
              query.includes(marker.label) &&
              !['player', 'road', 'transit-line'].includes(marker.categoryId ?? ''),
          )
          .sort((left, right) => right.label.length - left.label.length)[0])
      : undefined;
    // 锚点名称本身可能带“超市/医院”等词，判断分类前先把它去掉。
    const anchorLabel = alongTarget?.label ?? anchor?.label;
    const placeCategories = buildPlaceQueryCandidates(
      anchorLabel ? query.split(anchorLabel).join(' ') : query,
    );

    if (alongTarget) {
      const along = queryAlongLineMarkers(spatialContext, {
        line: alongTarget,
        categories: placeCategories,
        limit: 3,
      });
      const alongItems = along?.items ?? [];
      // 道路只有路名采样点，几何连线不代表真实走向；优先按“道路名开头 + 分类筛选”，几何结果兜底。
      const roadNameItems =
        alongTarget.categoryId === 'road'
          ? queryPlacesByRoadName(spatialContext, alongTarget.label, placeCategories, 6)
          : [];
      const items = roadNameItems.length > 0 ? roadNameItems : alongItems;
      const fromRoadName = roadNameItems.length > 0;

      if (along || items.length > 0) {
        spatialApplied = true;
        const firstPlace = items[0];
        if (firstPlace) {
          focusPlace = { id: firstPlace.id, label: firstPlace.label };
        }
        const distanceUnit = alongTarget.categoryId === 'road' ? '距道路' : '距线路';
        addReference({
          title: `${alongTarget.label}沿线`,
          source: '沿线',
          snippet: [
            placeCategories.length > 0 ? `筛选：${placeCategories.join('、')}` : undefined,
            fromRoadName
              ? `按道路名匹配 ${items.length} 个地点`
              : `走廊 ${along?.corridor ?? 300} 格内共 ${items.length} 个地点，按沿线里程排序`,
          ]
            .filter(Boolean)
            .join(' · '),
          tone: 'place',
        });
        for (const item of items) {
          addReference({
            title: item.label,
            source: '沿线',
            href: `/map?marker=${encodeURIComponent(item.id)}`,
            snippet: [
              item.categoryLabel,
              !fromRoadName && item.mileage !== undefined ? `沿线 ${item.mileage} 格` : undefined,
              fromRoadName ? undefined : `${distanceUnit} ${item.distance} 格`,
              item.address,
            ]
              .filter(Boolean)
              .join(' · '),
            tone: 'place',
          });
        }
      }
    } else if (anchor) {
      const radiusMatch = query.match(/(\d{1,4})\s*(?:格|米|方块)/u);
      const radius = radiusMatch
        ? clampNumber(Number(radiusMatch[1]), 20, 5000)
        : Number.POSITIVE_INFINITY;
      const nearby = queryNearbyMarkers(spatialContext, {
        anchor,
        radius,
        categories: placeCategories,
        limit: 3,
      });
      if (nearby) {
        spatialApplied = true;
        if (anchor.id) {
          focusPlace = { id: anchor.id, label: anchor.label };
        }
        addReference({
          title: `${anchor.label}周边`,
          source: '周边',
          snippet: [
            placeCategories.length > 0 ? `筛选：${placeCategories.join('、')}` : undefined,
            Number.isFinite(radius)
              ? `半径 ${radius} 格内共 ${nearby.items.length} 个地点`
              : `共 ${nearby.items.length} 个最近地点`,
            '按距离排序',
          ]
            .filter(Boolean)
            .join(' · '),
          tone: 'place',
        });
        for (const item of nearby.items) {
          addReference({
            title: item.label,
            source: '周边',
            href: `/map?marker=${encodeURIComponent(item.id)}`,
            snippet: [item.categoryLabel, `距${anchor.label} ${item.distance} 格`, item.address]
              .filter(Boolean)
              .join(' · '),
            tone: 'place',
          });
        }
      }
    }
  }

  // 地点关联公告：优先用周边/沿线的锚点，其次用问题里点名的地点。
  if (!focusPlace && markersResult.status === 'fulfilled' && markersResult.value) {
    const labelMatched = markersResult.value.snapshot.markers
      .filter(
        (marker) =>
          marker.label.length >= 2 &&
          query.includes(marker.label) &&
          !['player', 'road', 'transit-line'].includes(marker.categoryId ?? ''),
      )
      .sort((left, right) => right.label.length - left.label.length)[0];
    if (labelMatched) {
      focusPlace = { id: labelMatched.id, label: labelMatched.label };
    }
  }

  if (focusPlace) {
    for (const reference of await buildPoiOperationReferences(focusPlace.id, focusPlace.label)) {
      addReference(reference);
    }
  }

  const [serviceNoticeReferences, healthReferences] = await Promise.all([
    buildServiceNoticeReferences(query),
    buildNetworkHealthReference(query),
  ]);
  for (const reference of [...serviceNoticeReferences, ...healthReferences]) {
    addReference(reference);
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
          trip.serviceNature,
          [
            trip.originStationName ?? trip.stationNames[0],
            trip.destinationStationName ?? trip.stationNames.at(-1),
          ]
            .filter(Boolean)
            .join(' - '),
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
      // 路线/空间问题里只保留会影响出行的公告（停运、调整、施工等）。
      {
        filter: (item) =>
          !spatialQueryIntent ||
          /(停运|停开|调整|施工|绕行|改道|封路|限行|接驳|站点)/u.test(
            `${item.title} ${item.excerpt ?? ''}`,
          ),
      },
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

    // 列表接口只有摘要，长公告里的具体项目/时间在正文中；命中前两条时补读正文。
    const topMatches = matches.slice(0, 2);
    const contexts = await Promise.all(
      topMatches.map((item) =>
        readOperationDetail(item.id)
          .then((detail) =>
            detail.item?.markdown ? extractRelevantParagraphs(detail.item.markdown, query) : '',
          )
          .catch(() => ''),
      ),
    );
    for (const [index, context] of contexts.entries()) {
      if (!context) {
        continue;
      }
      const item = topMatches[index];
      const reference = references.find(
        (entry) => entry.source === '运营' && entry.title === item.title,
      );
      if (reference) {
        reference.context = context;
      }
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

  let timetableApplied = false;

  if (transitResult.status === 'fulfilled') {
    statuses.push(transitResult.value.meta.sourceStatus);
    const lines = transitResult.value.lines;
    const timetableReferences = buildLineTimetableReferences(query, lines);
    timetableApplied = timetableReferences.length > 0;
    for (const reference of timetableReferences) {
      addReference(reference);
    }
    // 用户点名了具体线路时，只返回这条线，避免其他线路因站点名称里的泛词被带进来。
    // 已经有路线规划入口时不再重复列线路，给地点和公告留引用名额。
    const mentionedLines = lines.filter((line) => query.includes(line.name));
    const matches = hasPrefilledRoutePlan
      ? []
      : rankSearchMatches(
          mentionedLines.length > 0 ? mentionedLines : lines,
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
      const stationNames = line.stationNames.slice(0, 40);
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

  if (stationsResult.status === 'fulfilled' && !hasPrefilledRoutePlan) {
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

  if (
    markersResult.status === 'fulfilled' &&
    markersResult.value &&
    !spatialApplied &&
    !timetableApplied
  ) {
    statuses.push(markersResult.value.meta.sourceStatus);
    const placeMarkers = markersResult.value.snapshot.markers.filter(
      (marker) => marker.categoryId !== 'player',
    );
    const getMarkerValues = (marker: SpatialMarker) =>
      buildMarkerSearchValues(marker, categoryNames, locale);
    // 地点名称差异大（“尚瑞超市”对“有哪些超市”“工厂”对“产业设施”），允许关键词级兜底并补充分类名。
    const placeCandidates = buildPlaceQueryCandidates(query);
    const matches = rankSearchMatches(placeMarkers, query, getMarkerValues, 3, {
      allowLoose: true,
      getLooseValues: (marker) => [marker.label, ...Object.values(marker.localizedLabels ?? {})],
      extraCandidates: placeCandidates,
    });
    // 用户问的是某一类地点时，额外补两条同类地点，避免被线路名或站点名挤掉。
    const categoryMatches =
      placeCandidates.length > 0
        ? rankSearchMatches(placeMarkers, placeCandidates.join(' '), getMarkerValues, 2, {
            extraCandidates: placeCandidates,
          })
        : [];

    for (const marker of [...matches, ...categoryMatches]) {
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
    contextText: [buildContextText(references), easterEggContext, describeWikiStatus(wikiResult)]
      .filter(Boolean)
      .join('\n\n'),
    sourceStatus,
    asOf,
    generatedAt: new Date().toISOString(),
  };
}

/** 把 Wiki 的检索状态告诉模型，避免把超时或服务不可用说成“站内没有收录”。 */
function describeWikiStatus(wikiResult: PromiseSettledResult<WikiSearchOutcome>): string {
  const status = wikiResult.status === 'fulfilled' ? wikiResult.value.status : 'unavailable';
  if (status === 'timeout') {
    return 'Wiki 检索请求超时：不能据此判断站内没有收录 Wiki 条目。';
  }
  if (status === 'unavailable') {
    return 'Wiki 检索暂时不可用：不能据此判断站内没有收录 Wiki 条目。';
  }
  if (status === 'empty') {
    return 'Wiki 检索已完成，但没有匹配的 Wiki 条目。';
  }
  return '';
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

/** 从问题里找出站内已收录的道路名，支持“中华路沿线”这种没有数字线路名的问法。 */
function findRoadLabel(query: string, markers: SpatialMarker[]): string | undefined {
  const labels = new Set<string>();
  for (const marker of markers) {
    if (marker.categoryId === 'road' && marker.label.length >= 2 && query.includes(marker.label)) {
      labels.add(marker.label);
    }
  }
  return [...labels].sort((left, right) => right.length - left.length)[0];
}

/** 道路数据是多个同名采样点，按主方向排序后当作一条近似折线。 */
function buildRoadAlongMarker(markers: SpatialMarker[], label: string): SpatialMarker | undefined {
  const points: Array<[number, number]> = [];
  for (const marker of markers) {
    if (marker.categoryId !== 'road' || marker.label !== label) {
      continue;
    }
    if (marker.geometry.type === 'Point') {
      points.push([marker.geometry.coordinates[0], marker.geometry.coordinates[1]]);
    }
  }
  if (points.length < 2) {
    return undefined;
  }

  const xs = points.map((point) => point[0]);
  const zs = points.map((point) => point[1]);
  const xRange = Math.max(...xs) - Math.min(...xs);
  const zRange = Math.max(...zs) - Math.min(...zs);
  const chain = [...points].sort((left, right) =>
    xRange >= zRange ? left[0] - right[0] : left[1] - right[1],
  );

  return {
    id: `road-along-${encodeURIComponent(label)}`,
    label,
    categoryId: 'road',
    geometry: { type: 'MultiPoint', coordinates: chain },
  };
}

/** 道路沿线兜底：按“道路名开头”找地点，再套用同一套分类筛选。 */
function queryPlacesByRoadName(
  context: SpatialMarkerContext,
  roadLabel: string,
  categories: string[],
  limit: number,
): SpatialPlaceItem[] {
  return context.markers
    .filter(
      (marker) =>
        marker.categoryId !== 'player' &&
        marker.categoryId !== 'road' &&
        marker.label.startsWith(roadLabel) &&
        matchesSpatialCategory(marker, categories, context),
    )
    .slice(0, limit)
    .map((marker) => toSpatialPlaceItem(marker, context, { distance: 0 }));
}

/** 地点检索的打分字段；站内搜索与工具调用共用同一套字段，避免结果不一致。 */
export function buildMarkerSearchValues(
  marker: SpatialMarker,
  categoryNames: Map<string, string>,
  locale: LocaleCode,
): Array<string | undefined> {
  return [
    marker.label,
    marker.secondaryLabel,
    marker.categoryId,
    marker.address,
    marker.description,
    marker.floorLabel,
    marker.parentLabel,
    getMarkerCategoryLabel(marker.categoryId, categoryNames, locale),
    ...Object.values(marker.localizedLabels ?? {}),
    ...(marker.facilities?.flatMap((facility) => [facility.description, facility.symbolIcon]) ??
      []),
  ];
}

/** 设施类别 name 到可读标签；未知图标保留原始 id，避免丢失类别信息。 */
const facilityCategoryLabels: Record<string, string> = {
  elevator: '无障碍电梯',
  escalator: '自动扶梯',
  'escalator-and-stairs': '扶梯与楼梯',
  stairs: '楼梯',
  restroom: '卫生间',
  'mens-restroom': '男卫生间',
  'womens-restroom': '女卫生间',
  'accessible-restroom': '无障碍卫生间',
  'family-restroom': '家庭卫生间',
  'nursing-room': '母婴室',
  'wheelchair-lift': '轮椅升降机',
  'accessible-ramp': '无障碍坡道',
  wheelchair: '轮椅',
  'ticket-machine': '售票机',
  'passenger-service-center': '客服中心',
  'waiting-room': '候车室',
  'meeting-point': '集合点',
  exit: '出入口',
};

export function buildMarkerSnippet(
  marker: {
    categoryId?: string;
    address?: string;
    floorLabel?: string;
    description?: string;
    openingHours?: string;
    facilities?: Array<{ symbolIcon?: string; description: string }>;
  },
  categoryNames: Map<string, string>,
  locale: LocaleCode,
): string {
  const facilities = marker.facilities
    ?.map((facility) => {
      const label = facility.symbolIcon
        ? (facilityCategoryLabels[facility.symbolIcon] ?? facility.symbolIcon)
        : '';
      if (!label) {
        return facility.description;
      }
      return facility.description && facility.description !== label
        ? `${label}（${facility.description}）`
        : label;
    })
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

export function buildStationSnippet(station: TransitStationDetailSnapshot): string {
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

export function rankSearchMatches<T>(
  items: T[],
  query: string,
  getValues: (item: T) => Array<string | undefined | null>,
  limit: number,
  options: {
    allowLoose?: boolean;
    /** 关键词兜底时只看名称类字段，避免地址或描述里的泛词把无关条目带进来。 */
    getLooseValues?: (item: T) => Array<string | undefined | null>;
    /** 补充口语词对应的站内分类名，例如“工厂”对应“产业设施”。 */
    extraCandidates?: string[];
    /** 打分前的硬过滤，例如路线问题只保留会影响出行的公告。 */
    filter?: (item: T) => boolean;
  } = {},
): T[] {
  const candidates = buildQueryCandidates(query);
  // 疑问词只保留语义关键词，避免“有哪些 X”因为“哪些”误命中其他问句。
  const keywordQuery = query.replace(queryNoisePattern, ' ').trim() || query;
  const keywordTokens = options.allowLoose
    ? buildSearchTokens(keywordQuery).filter((token) => !genericPlaceTokenPattern.test(token))
    : [];
  const synonymCandidates = options.extraCandidates ?? [];
  const sourceItems = options.filter ? items.filter(options.filter) : items;
  const scored = sourceItems.map((item) => {
    const haystack = buildSearchHaystack(getValues(item));
    // 与站内搜索保持一致：整串（或去掉疑问词后的关键词）命中优先级最高。
    const directScore = matchScore(haystack, candidates, 100);
    // 用户原话里的关键词比“口语词映射出的分类名”更贴近意图，权重更高。
    const tokenScore = matchScore(haystack, keywordTokens, 80);
    const synonymScore = matchScore(haystack, synonymCandidates, 60);
    const score = Math.max(directScore, scoreSearchMatch(haystack, keywordQuery));
    const looseScore = Math.max(
      directScore,
      tokenScore,
      synonymScore,
      options.getLooseValues
        ? scoreSearchMatch(buildSearchHaystack(options.getLooseValues(item)), keywordQuery)
        : score,
    );
    return { item, score, looseScore };
  });

  const strict = scored
    .filter((entry) => entry.score >= minimumMatchScore)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
  if (!options.allowLoose || strict.length >= limit) {
    return strict.map((entry) => entry.item);
  }

  const chosen = new Set(strict.map((entry) => entry.item));
  const loose = scored
    .filter((entry) => entry.looseScore >= minimumLooseMatchScore && !chosen.has(entry.item))
    .sort((left, right) => right.looseScore - left.looseScore)
    .slice(0, limit - strict.length);

  return [...strict, ...loose].map((entry) => entry.item);
}

/** 只有明确在问动态/视频时才引入 B 站内容，避免每条问题都被社交动态占位。 */
const socialIntentPattern = /(动态|视频|b站|up主|混剪|十周年|作品|发布|照片)/i;

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** 命中候选词时按权重计分，越贴近用户原话权重越高。 */
function matchScore(haystack: string, candidates: string[], base: number): number {
  return candidates.reduce(
    (best, candidate) =>
      candidate && haystack.includes(candidate) ? Math.max(best, base + candidate.length) : best,
    0,
  );
}

/** 归一化检索候选：整串、去掉疑问词后的关键词、以及按空格切出的片段。 */
export function buildQueryCandidates(query: string): string[] {
  const candidates = new Set<string>();
  const normalize = (value: string) =>
    normalizeSearchText(value.replace(/[？?！!。，,、；;：:（）()【】[\]"'“”‘’]/g, ' '));

  const whole = normalize(query);
  if (whole) {
    candidates.add(whole);
  }

  const keywords = normalize(query.replace(queryNoisePattern, ' '));
  if (keywords) {
    candidates.add(keywords);
  }

  for (const segment of query.split(/\s+/)) {
    const normalized = normalize(segment);
    if (normalized) {
      candidates.add(normalized);
    }
  }

  return [...candidates].filter((candidate) => candidate.length >= 2);
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

/** 从长公告正文里挑出与问题最相关的段落，供模型回答具体项目与时间。 */
function extractRelevantParagraphs(markdown: string, query: string, limit = 3): string {
  const paragraphs = markdown
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // 按句子切分：长公告里一个段落可能包含多个项目，按句子才能挑到“临东大学”那一句。
    .split(/(?<=[。！？；])|\n+/u)
    .map((paragraph) =>
      paragraph
        .replace(/\*\*|`|>/g, '')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter((paragraph) => paragraph.length >= 12);
  if (paragraphs.length === 0) {
    return '';
  }

  // 中文问句用 2 字片段打分，避免依赖分词；“2026年”“临东大学”这类词都能命中。
  // 用段落频率做逆权重，避免“临东市服务器”这类全文高频词把真正相关的段落压下去。
  const bigrams = buildBigrams(query);
  const years = [...new Set(query.match(/20\d{2}/g) ?? [])];
  const documentFrequency = new Map<string, number>();
  for (const gram of bigrams) {
    documentFrequency.set(
      gram,
      paragraphs.reduce((count, paragraph) => (paragraph.includes(gram) ? count + 1 : count), 0),
    );
  }

  const scored = paragraphs.map((paragraph, index) => {
    const score = bigrams.reduce((total, gram) => {
      if (!paragraph.includes(gram)) {
        return total;
      }
      return total + 1 / (1 + (documentFrequency.get(gram) ?? 0));
    }, 0);
    // 年份是强限定词：“2026 年计划”不应被“2025 年年度报告”的开头段压过去。
    const yearBonus = years.some((year) => paragraph.includes(year)) ? 3 : 0;
    return { paragraph, index, score: score + yearBonus };
  });

  const matched = scored
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
  const selected = (matched.length > 0 ? matched : scored.slice(0, limit)).sort(
    (left, right) => left.index - right.index,
  );

  return selected.map((entry) => entry.paragraph.slice(0, 600)).join('\n');
}

function buildBigrams(query: string): string[] {
  const normalized = query.replace(/[^\p{Letter}\p{Number}]+/gu, '');
  const grams = new Set<string>();
  for (let index = 0; index + 2 <= normalized.length; index += 1) {
    const gram = normalized.slice(index, index + 2);
    // 纯数字片段在长文里噪音太大，只保留带文字的片段。
    if (!/^\d{2}$/u.test(gram)) {
      grams.add(gram);
    }
  }
  return [...grams].slice(0, 80);
}

/** 预填 Issue 标题与模板，减少用户提交反馈的门槛。 */
function buildFeedbackIssueUrl(query: string, locale: LocaleCode): string {
  const summary = query.replace(/\s+/g, ' ').trim().slice(0, 60);
  const title = `${locale === 'en' ? '[Feedback]' : '[问题反馈]'} ${summary}`.trim();
  const body =
    locale === 'en'
      ? [
          '**What happened**',
          '',
          '**Steps to reproduce**',
          '1. ',
          '',
          '**Page**',
          '',
          '**When**',
          '',
          '**Screenshot**',
          '',
        ].join('\n')
      : [
          '**问题描述**',
          '',
          '**复现步骤**',
          '1. ',
          '',
          '**页面地址**',
          '',
          '**出现时间**',
          '',
          '**截图**',
          '',
        ].join('\n');

  return `${feedbackIssueBaseUrl}?${new URLSearchParams({ title, body }).toString()}`;
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
      if (reference.context) {
        lines.push(`正文摘录：${reference.context}`);
      }
      if (reference.href) {
        lines.push(`站内入口：${reference.href}`);
      }
      return lines.join('\n');
    })
    .join('\n\n');
}
