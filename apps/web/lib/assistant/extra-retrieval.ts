import type {
  MapGeometry,
  TransitLineSpecialTripSnapshot,
  TransitServiceNotice,
} from '@yct/contracts';
import { readActiveOperationsForPoi } from '../content-poi-read-model';
import { getGeometryCenter } from '../map-spatial';
import { readTransitNetworkHealthReport } from '../transit-network-health';
import { readTransitServiceNotices } from '../transit-service-notices';
import { readTravelScheduleQuery } from '../travel-schedules';
import { planTravelJourneys } from '../travel-journey-planner';
import { getBeijingClockMinutes, getTransitClockMinutes } from '../transit-realtime';
import { resolveDirectionalDepartureTimes } from '../transit-departure-editor';

export interface ExtraReference {
  title: string;
  source: string;
  href?: string;
  asOf?: string;
  snippet: string;
  tone: string;
}

const journeyPattern = /(?:从|由)(.{2,20}?)(?:到|去|往)(.{2,20}?)(?:怎么|如何|坐|乘|换乘|走)/u;
const journeyPatternWithoutFrom =
  /^(.{2,20}?)(?:到|去)(.{2,20}?)(?:怎么走|怎么坐|如何走|如何坐|怎么换乘|如何换乘)/u;
const serviceNoticePattern = /(停运|停开|调整|班次|客运|班车|航班|船班)/u;
const healthPattern = /(线网|线路数据|数据不全|为什么.*(不显示|没有|缺)|健康检查)/u;

/** 起终点换乘方案：复用班次规划器，给出可执行的乘车方案。 */
export async function buildJourneyReferences(query: string): Promise<ExtraReference[]> {
  const match = query.match(journeyPattern) ?? query.match(journeyPatternWithoutFrom);
  if (!match) {
    return [];
  }

  const originText = cleanPlaceText(match[1] ?? '');
  const destinationText = cleanPlaceText(match[2] ?? '');
  return buildJourneyPlanReferences(originText, destinationText);
}

/** 起终点明确的换乘方案；问一问与工具调用共用，避免各算一套。 */
export async function buildJourneyPlanReferences(
  originText: string,
  destinationText: string,
  options: { serviceDate?: string } = {},
): Promise<ExtraReference[]> {
  if (!originText || !destinationText || originText === destinationText) {
    return [];
  }

  const serviceDate = options.serviceDate ?? formatServiceDate(new Date());
  const schedules = await readTravelScheduleQuery({ serviceDate, timeScope: 'all' });
  const trips = schedules.item?.trips ?? [];
  if (trips.length === 0) {
    return [];
  }

  const stationNames = new Set<string>();
  for (const trip of trips) {
    for (const name of trip.stationNames) {
      if (name) {
        stationNames.add(name);
      }
    }
  }
  const origin = resolveStationName(originText, stationNames);
  const destination = resolveStationName(destinationText, stationNames);
  if (!origin || !destination || origin === destination) {
    return [];
  }

  const plan = await planTravelJourneys({
    trips,
    serviceDate,
    originStationName: origin,
    destinationStationName: destination,
    transferOptions: schedules.item?.transferOptions,
  });
  if (plan.journeys.length === 0) {
    return [
      {
        title: `${origin} → ${destination}`,
        source: '换乘方案',
        href: `/travel/schedules?from=${encodeURIComponent(origin)}&to=${encodeURIComponent(destination)}`,
        snippet: `已按 ${serviceDate} 的班次检索，暂时没有可行方案。`,
        tone: 'schedule',
      },
    ];
  }

  return plan.journeys.slice(0, 2).map((journey) => ({
    title: `${origin} → ${destination}`,
    source: '换乘方案',
    href: `/travel/schedules?from=${encodeURIComponent(origin)}&to=${encodeURIComponent(destination)}`,
    snippet: [
      `出发 ${journey.departureTime}${journey.arrivalTime ? `，到达 ${journey.arrivalTime}` : ''}`,
      journey.durationMinutes === undefined ? undefined : `约 ${journey.durationMinutes} 分钟`,
      `换乘 ${journey.transferCount} 次`,
      journey.legs
        .map((leg) => {
          const nature = [leg.serviceNature, leg.routeNote].filter(Boolean).join('；');
          return `${leg.lineName} ${leg.fromStationName} → ${leg.toStationName}（${leg.departureTime}${
            leg.arrivalTime ? `-${leg.arrivalTime}` : ''
          }）${nature ? ` · ${nature}` : ''}`;
        })
        .join('；'),
      ticketingText(journey.ticketingStatus),
    ]
      .filter(Boolean)
      .join(' · '),
    tone: 'schedule',
  }));
}

/** 某个地点关联的运营公告。 */
export async function buildPoiOperationReferences(
  markerId: string,
  markerLabel: string,
): Promise<ExtraReference[]> {
  const result = await readActiveOperationsForPoi(markerId);
  return result.items.slice(0, 2).map((item) => ({
    title: `${markerLabel} · ${item.title}`,
    source: '地点公告',
    href: `/operations/${encodeURIComponent(item.id)}`,
    asOf: item.publishedAt,
    snippet: [
      item.excerpt,
      item.expiresAt ? `有效期至 ${formatShortDate(item.expiresAt)}` : undefined,
    ]
      .filter(Boolean)
      .join(' · '),
    tone: 'operation',
  }));
}

/** 客运停运/调整公告。 */
export async function buildServiceNoticeReferences(query: string): Promise<ExtraReference[]> {
  if (!serviceNoticePattern.test(query)) {
    return [];
  }

  const result = await readTransitServiceNotices();
  return selectServiceNoticeReferences(result.items, query.replace(/[？?！!。，,、；;：:\s]/g, ''));
}

/** 按关键词筛选客运公告；没有关键词时返回最近的公告。 */
export function selectServiceNoticeReferences(
  items: TransitServiceNotice[],
  keyword?: string,
): ExtraReference[] {
  const matches =
    keyword && keyword.length >= 2
      ? items.filter((notice) =>
          [notice.title, notice.reason, notice.periodText]
            .filter(Boolean)
            .some((value) => value.replace(/\s+/g, '').includes(keyword)),
        )
      : items;

  return matches.slice(0, 2).map((notice) => ({
    title: notice.title,
    source: '客运公告',
    // 客运公告没有独立详情页，直接带到按标题检索的班次查询页。
    href: `/travel/schedules?q=${encodeURIComponent(notice.title)}`,
    asOf: notice.startsAt,
    snippet: [notice.periodText, notice.reason].filter(Boolean).join(' · '),
    tone: 'operation',
  }));
}

/** 线网数据健康摘要，用于解释“为什么某条线路/站点没有数据”。 */
export async function buildNetworkHealthReference(query: string): Promise<ExtraReference[]> {
  if (!healthPattern.test(query)) {
    return [];
  }

  return [await buildNetworkHealthSummaryReference()];
}

export async function buildNetworkHealthSummaryReference(): Promise<ExtraReference> {
  const report = await readTransitNetworkHealthReport();
  const suggestion = report.suggestions[0];
  return {
    title: '线网数据健康',
    source: '线网',
    asOf: report.analyzedAt,
    snippet: [
      `收录 ${report.lineCount} 条线路、${report.stationCount} 个站点`,
      `不完整线路 ${report.incompleteLineCount} 条`,
      `换乘站 ${report.transferStationCount} 个`,
      suggestion ? `${suggestion.title}：${suggestion.detail}` : undefined,
    ]
      .filter(Boolean)
      .join(' · '),
    tone: 'line',
  };
}

const timetablePattern = /(下一班|下一趟|几点|首班|末班|首末班|还有车|发车时间)/u;

const routePlanActionPattern =
  '(?:怎么走|怎么坐|怎么去|怎么到|怎么前往|如何走|如何坐|如何到|如何前往|坐什么车|坐几路|哪路车|怎么过去|如何过去|前往|去往|的路线|路线规划|规划路线|路线|步行|驾车|开车|骑车)';
const routePlanPattern = new RegExp(
  `(?:从|由)\\s*(.{2,18}?)\\s*(?:到|去|往|前往|去往)\\s*(.{2,18}?)\\s*${routePlanActionPattern}`,
  'u',
);
/** 省略“从”的口语问法，例如“临东站到出生点怎么走”。 */
const routePlanPatternWithoutFrom = new RegExp(
  `(.{2,18}?)\\s*(?:到|去|往)\\s*(.{2,18}?)\\s*${routePlanActionPattern}`,
  'u',
);
/** 动作词放在句首的问法，例如“我如何从中鼎大厦前往中华早点”。 */
const routePlanPatternWithLeadingAction =
  /(?:怎么|如何|怎样|咋)(?:从|由)\s*(.{2,18}?)\s*(?:前往|去往|到|去|往)\s*(.{2,18}?)[？?]?$/u;

/**
 * 起终点明确时，给出地图路线规划的预填链接。
 * 路线规划本身在地图前端，这里不重复计算，只把起终点带过去。
 */
export function buildMapRoutePlanReferences(
  query: string,
  markers: Array<{ id: string; label: string; geometry: MapGeometry }>,
): ExtraReference[] {
  const match =
    query.match(routePlanPattern) ??
    query.match(routePlanPatternWithoutFrom) ??
    query.match(routePlanPatternWithLeadingAction);
  if (!match) {
    return [];
  }

  const points = markers.filter(
    (marker) => marker.geometry.type === 'Point' && !marker.id.startsWith('transit-line-'),
  );
  const originText = cleanPlaceText(match[1] ?? '');
  const destinationText = cleanPlaceText(match[2] ?? '');
  const origin = resolveRoutePlace(originText, points);
  const destination = resolveRoutePlace(destinationText, points);
  if (origin && destination && origin.id !== destination.id) {
    const originCoordinate = getGeometryCenter(origin.geometry);
    const destinationCoordinate = getGeometryCenter(destination.geometry);
    if (originCoordinate && destinationCoordinate) {
      const params = new URLSearchParams({
        r: '1',
        o: `${Math.round(originCoordinate[0])}, ${Math.round(originCoordinate[1])}`,
        d: `${Math.round(destinationCoordinate[0])}, ${Math.round(destinationCoordinate[1])}`,
        oi: origin.id,
        di: destination.id,
        ol: origin.label,
        dl: destination.label,
      });

      return [
        {
          title: `路线规划：${origin.label} → ${destination.label}`,
          source: '路线规划',
          href: `/map?${params.toString()}`,
          snippet: '已预填起点和终点，打开地图后可选择步行、公交、驾车等方案并查看距离与用时。',
          tone: 'line',
        },
      ];
    }
  }

  // 只识别出一端时，先把该点定位到地图上，用户打开后点“路线”按钮就能继续。
  const single = origin ?? destination;
  const singleCoordinate = single ? getGeometryCenter(single.geometry) : undefined;
  if (single && singleCoordinate) {
    const role = origin ? '起点' : '终点';
    const params = new URLSearchParams({
      x: String(Math.round(singleCoordinate[0])),
      z: String(Math.round(singleCoordinate[1])),
      label: single.label,
    });
    return [
      {
        title: `在地图上定位：${single.label}`,
        source: '路线规划',
        href: `/map?${params.toString()}`,
        snippet: `已在图中定位到${role}“${single.label}”。打开地图后点“路线”按钮把它设为${role}，再选择另一个地点，就能查看步行、公交、驾车等方案与用时。`,
        tone: 'line',
      },
    ];
  }

  // 两端都解析不出坐标时，至少给出路线规划入口，而不是只写操作步骤。
  return [
    {
      title: '打开地图路线规划',
      source: '路线规划',
      href: '/map',
      snippet: `站内地点里没有找到“${originText || destinationText}”的可用坐标，无法直接预填起点和终点。打开地图后点“路线”按钮，填入起终点即可查看步行、公交、驾车等方案。`,
      tone: 'line',
    },
  ];
}

const currentLocationDestinationPatterns = [
  /(?:从我这|从当前位置|从我的位置|从这里)\s*(?:去|到|往)\s*([^\s，。！？?!]{2,16})/u,
  /(?:怎么去|怎么到|如何去|如何到|如何前往|怎样去|去往|带我过去|带我去)\s*([^\s，。！？?!]{2,16})/u,
];

/** 起点省略时，用当前登录账号最后记录的位置作为起点，生成地图路线规划入口。 */
export function buildCurrentLocationRouteReferences(
  query: string,
  markers: Array<{ id: string; label: string; geometry: MapGeometry }>,
  currentLocation: { playerName: string; x: number; z: number },
): ExtraReference[] {
  const destination = resolveQueryDestination(query, markers);
  if (!destination) {
    return [];
  }

  const params = new URLSearchParams({
    r: '1',
    o: `${Math.round(currentLocation.x)}, ${Math.round(currentLocation.z)}`,
    d: `${Math.round(destination.x)}, ${Math.round(destination.z)}`,
    ol: '我的位置',
    dl: destination.label,
  });

  return [
    {
      title: `路线规划：我的位置 → ${destination.label}`,
      source: '路线规划',
      href: `/map?${params.toString()}`,
      snippet: `起点用的是你最后记录的位置（${currentLocation.playerName}），终点是“${destination.label}”。打开地图后可以选择步行、公交、驾车等方案并查看距离与用时。`,
      tone: 'line',
    },
  ];
}

/** 没有当前位置时，至少把目的地定位到地图上，让用户自己补起点。 */
export function buildDestinationRouteReference(
  query: string,
  markers: Array<{ id: string; label: string; geometry: MapGeometry }>,
): ExtraReference[] {
  const destination = resolveQueryDestination(query, markers);
  if (!destination) {
    return [];
  }

  const params = new URLSearchParams({
    x: String(Math.round(destination.x)),
    z: String(Math.round(destination.z)),
    label: destination.label,
  });

  return [
    {
      title: `在地图上定位：${destination.label}`,
      source: '路线规划',
      href: `/map?${params.toString()}`,
      snippet: `已在图上定位到“${destination.label}”。打开地图后点“路线”把它设为终点，再设置起点（登录并验证服务器账号后，可以直接用你的最后记录位置）。`,
      tone: 'line',
    },
  ];
}

function resolveQueryDestination(
  query: string,
  markers: Array<{ id: string; label: string; geometry: MapGeometry }>,
): { label: string; x: number; z: number } | undefined {
  // 问题里已经写清起终点时交给 buildMapRoutePlanReferences，避免重复给入口。
  if (
    routePlanPattern.test(query) ||
    routePlanPatternWithoutFrom.test(query) ||
    routePlanPatternWithLeadingAction.test(query)
  ) {
    return undefined;
  }

  const match = currentLocationDestinationPatterns
    .map((pattern) => query.match(pattern))
    .find((item) => item !== null);
  if (!match) {
    return undefined;
  }

  const destinationText = cleanPlaceText(match[1] ?? '');
  if (!destinationText) {
    return undefined;
  }

  const points = markers.filter(
    (marker) => marker.geometry.type === 'Point' && !marker.id.startsWith('transit-line-'),
  );
  const destination = resolveRoutePlace(destinationText, points);
  const coordinate = destination ? getGeometryCenter(destination.geometry) : undefined;
  if (!destination || !coordinate) {
    return undefined;
  }

  return { label: destination.label, x: coordinate[0], z: coordinate[1] };
}

function resolveRoutePlace<T extends { label: string }>(text: string, markers: T[]): T | undefined {
  if (!text) {
    return undefined;
  }
  const normalized = text.toLocaleLowerCase();
  const exact = markers.find((marker) => marker.label.toLocaleLowerCase() === normalized);
  if (exact) {
    return exact;
  }
  return markers
    .filter((marker) => text.includes(marker.label))
    .sort((left, right) => right.label.length - left.label.length)[0];
}

/** 线路发车时刻：站点看板同源的首末班与下一班。 */
export function buildLineTimetableReferences(
  query: string,
  lines: Array<{
    name: string;
    firstLastBus?: { first?: string; last?: string };
    departureTimes?: string[];
    departureTimesByDirection?: { down?: string[]; up?: string[] };
  }>,
): ExtraReference[] {
  if (!timetablePattern.test(query)) {
    return [];
  }

  const line = lines
    .filter((entry) => query.includes(entry.name))
    .sort((left, right) => right.name.length - left.name.length)[0];
  if (!line) {
    return [];
  }

  return [buildLineTimetableReference(line)];
}

export interface TimetableLine {
  id?: string;
  name: string;
  firstLastBus?: { first?: string; last?: string };
  departureTimes?: string[];
  departureTimesByDirection?: { down?: string[]; up?: string[] };
  /** 发车规则里的特殊班次标注，键为首站发车时刻（HH:mm）。 */
  specialTripsByDirection?: {
    down?: Record<string, TransitLineSpecialTripSnapshot>;
    up?: Record<string, TransitLineSpecialTripSnapshot>;
  };
}

/** 单条线路的发车时刻引用；工具调用可直接按线路名取用。 */
export function buildLineTimetableReference(
  line: TimetableLine,
  now = getBeijingClockMinutes(),
): ExtraReference {
  const { down, up } = resolveDirectionalDepartureTimes(line);
  const downTimes = down
    .map(toClockMinutes)
    .filter((value): value is number => value !== undefined);
  const upTimes = up.map(toClockMinutes).filter((value): value is number => value !== undefined);
  const nextDown = nextDeparture(downTimes, now);
  const nextUp = nextDeparture(upTimes, now);
  const downLast = downTimes.at(-1);
  const upLast = upTimes.at(-1);
  const knownLast = toClockMinutes(line.firstLastBus?.last ?? '');
  const currentStatus =
    knownLast === undefined
      ? `当前 ${formatClock(now)}`
      : now > knownLast
        ? `当前 ${formatClock(now)}，今日末班已过`
        : `当前 ${formatClock(now)}，今日末班 ${line.firstLastBus?.last}`;
  const downStatus =
    downTimes.length === 0
      ? undefined
      : nextDown === undefined
        ? `下行末班 ${formatClock(downLast ?? 0)} 已过`
        : `下行下一班 ${formatClock(nextDown)}`;
  const upStatus =
    upTimes.length === 0
      ? undefined
      : nextUp === undefined
        ? `上行末班 ${formatClock(upLast ?? 0)} 已过`
        : `上行下一班 ${formatClock(nextUp)}`;
  const specialTrips = describeSpecialTrips(line);

  return {
    title: `${line.name} 发车时刻`,
    source: '时刻',
    href: `/map?line=${encodeURIComponent(line.id ?? line.name)}`,
    snippet: [
      line.firstLastBus?.first || line.firstLastBus?.last
        ? `首末班 ${line.firstLastBus?.first ?? '—'} - ${line.firstLastBus?.last ?? '—'}`
        : undefined,
      currentStatus,
      downTimes.length > 0 ? `下行 ${downTimes.length} 班` : undefined,
      downStatus,
      upTimes.length > 0 ? `上行 ${upTimes.length} 班` : undefined,
      upStatus,
      specialTrips.length > 0 ? `特殊班次：${specialTrips.join('；')}` : undefined,
    ]
      .filter(Boolean)
      .join(' · '),
    tone: 'line',
  };
}

/** 快线、夜线等特殊班次的标注；没有特殊班次时返回空数组。 */
function describeSpecialTrips(line: TimetableLine): string[] {
  const entries = [
    ...Object.entries(line.specialTripsByDirection?.down ?? {}).map(([time, trip]) => ({
      time,
      trip,
      direction: '下行',
    })),
    ...Object.entries(line.specialTripsByDirection?.up ?? {}).map(([time, trip]) => ({
      time,
      trip,
      direction: '上行',
    })),
  ];
  if (entries.length === 0) {
    return [];
  }

  return entries
    .sort((left, right) => left.time.localeCompare(right.time))
    .slice(0, 3)
    .map(({ time, trip, direction }) => {
      const shortTurn =
        trip.stationNames && trip.stationNames.length >= 2
          ? `短交路 ${trip.stationNames[0]} → ${trip.stationNames.at(-1)}`
          : undefined;
      const nature = `${trip.serviceNature ?? ''}${
        trip.routeNote ? `（${trip.routeNote}）` : ''
      }`.trim();
      return [`${direction} ${time}`, nature || undefined, shortTurn].filter(Boolean).join(' ');
    });
}

export function formatServiceDate(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function toClockMinutes(value: string): number | undefined {
  return getTransitClockMinutes(value);
}

function nextDeparture(times: number[], now: number): number | undefined {
  return times.filter((value) => value >= now).sort((left, right) => left - right)[0];
}

function formatClock(minutes: number): string {
  const normalized = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${pad(Math.floor(normalized / 60))}:${pad(normalized % 60)}`;
}

function cleanPlaceText(value: string): string {
  return value
    .replace(/^(请问|帮我|我想|我要|坐车|乘坐|坐公交|坐地铁|去)/u, '')
    .replace(
      /(怎么走|怎么坐|如何走|如何坐|怎么过去|如何过去|的路线|路线规划|规划路线|路线|换乘|坐车|公交|地铁|步行|驾车|开车|骑车)$/u,
      '',
    )
    .trim();
}

function resolveStationName(text: string, names: Set<string>): string | undefined {
  const candidates = [...names]
    .filter((name) => text.includes(name) || name.includes(text))
    .sort((left, right) => right.length - left.length);
  return candidates[0];
}

function ticketingText(status: string): string | undefined {
  if (status === 'order_available') {
    return '可在线购票';
  }
  if (status === 'partially_available') {
    return '部分区段可购票';
  }
  if (status === 'query_only') {
    return '仅可查询班次';
  }
  return undefined;
}

function formatShortDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
