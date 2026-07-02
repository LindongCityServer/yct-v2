import type {
  ApiItemResponse,
  TicketableServiceKind,
  TransitScreenGate,
  TransitScreenSnapshot,
  TransitScreenTrip,
  TravelScheduleQuery,
  TravelScheduleQueryResult,
  TravelScheduleServiceSummary,
  TravelScheduleTimeScope,
  TravelTripInstance,
} from '@yct/contracts';
import { createApiMeta } from './api-meta';
import { readRuntimeConfig } from './runtime-config';
import { readTransitScreenSnapshot } from './transit-screen';

const serviceLabels: Record<TicketableServiceKind, string> = {
  coach: '客运',
  ferry: '轮渡',
  flight: '航班',
  railway: '地方铁路',
  custom: '自定义',
};
const targetFlightAirport = '临东金桦';
const targetFlightOperator = '临东航空';

interface TravelScheduleSourceResult {
  meta: ReturnType<typeof createApiMeta>;
  trips: TravelTripInstance[];
  sourceFiles: string[];
}

interface FlightSegment {
  airportName: string;
  action: 'departure' | 'stopover' | 'arrival';
  time: string;
  dayOffset: number;
  position?: string;
}

export async function readTravelScheduleQuery(
  query: TravelScheduleQuery = {},
): Promise<ApiItemResponse<TravelScheduleQueryResult>> {
  const [screen, flight] = await Promise.all([readTransitScreenSnapshot(), readFlightTrips()]);
  const coachTrips =
    screen.item && screen.meta.sourceStatus === 'ready' ? buildCoachTripInstances(screen.item) : [];
  const trips = [...coachTrips, ...flight.trips];
  const filteredTrips = filterTrips(trips, query);
  const sourceMessages = [screen.meta.message, flight.meta.message].filter(Boolean);

  if (trips.length === 0) {
    return {
      meta:
        screen.meta.sourceStatus !== 'not_configured'
          ? screen.meta
          : flight.meta.sourceStatus !== 'not_configured'
            ? flight.meta
            : createApiMeta('not_configured', sourceMessages.join('；') || '班次数据源尚未配置。'),
      item: {
        services: buildServiceSummaries({
          coachSnapshot: screen.item,
          coachTrips,
          coachStatus: screen.meta.sourceStatus,
          coachMessage: screen.meta.message,
          flight,
        }),
        trips: [],
        stationOptions: [],
        sourceFiles: [...(screen.item?.sourceFiles ?? []), ...flight.sourceFiles],
      },
    };
  }

  return {
    meta: createApiMeta('ready', sourceMessages.join('；') || undefined),
    item: {
      services: buildServiceSummaries({
        coachSnapshot: screen.item,
        coachTrips,
        coachStatus: screen.meta.sourceStatus,
        coachMessage: screen.meta.message,
        flight,
      }),
      trips: filteredTrips,
      stationOptions: uniqueSorted(trips.flatMap((trip) => trip.stationNames)),
      sourceFiles: [...(screen.item?.sourceFiles ?? []), ...flight.sourceFiles],
      notice: screen.item?.notice,
    },
  };
}

function buildServiceSummaries(input: {
  coachSnapshot?: TransitScreenSnapshot;
  coachTrips: TravelTripInstance[];
  coachStatus: 'ready' | 'not_configured' | 'unavailable';
  coachMessage?: string;
  flight: TravelScheduleSourceResult;
}): TravelScheduleServiceSummary[] {
  const coachStationCount = input.coachSnapshot
    ? new Set(input.coachSnapshot.trips.flatMap((trip) => trip.stationNames)).size
    : 0;
  const flightStationCount = new Set(input.flight.trips.flatMap((trip) => trip.stationNames)).size;

  return [
    {
      serviceId: 'legacy-coach',
      kind: 'coach',
      label: serviceLabels.coach,
      status: input.coachStatus === 'ready' ? 'active' : 'not_connected',
      tripCount: input.coachTrips.length,
      stationCount: coachStationCount,
      message: input.coachStatus === 'ready' ? undefined : input.coachMessage,
    },
    {
      serviceId: 'future-ferry',
      kind: 'ferry',
      label: serviceLabels.ferry,
      status: 'not_connected',
      tripCount: 0,
      stationCount: 0,
      message: '轮渡班次尚未接入统一平台。',
    },
    {
      serviceId: 'haojin-flight',
      kind: 'flight',
      label: serviceLabels.flight,
      status: input.flight.meta.sourceStatus === 'ready' ? 'active' : 'not_connected',
      tripCount: input.flight.trips.length,
      stationCount: flightStationCount,
      message:
        input.flight.meta.sourceStatus === 'ready'
          ? undefined
          : (input.flight.meta.message ?? '航班班次尚未接入统一平台。'),
    },
  ];
}

function buildCoachTripInstances(snapshot: TransitScreenSnapshot): TravelTripInstance[] {
  const stationNameById = new Map(
    snapshot.stations.map((station) => [station.stationId, station.name]),
  );
  const gatesByLine = groupGatesByLine(snapshot.gates);

  return snapshot.trips.map((trip) => {
    const gateText = formatGates(gatesByLine.get(trip.lineName) ?? [], stationNameById);

    return {
      tripInstanceId: trip.sourceId,
      tripCode: trip.tripId,
      serviceKind: 'coach',
      serviceLabel: serviceLabels.coach,
      departureTime: trip.departureTime,
      routeNote: undefined,
      lineName: trip.lineName,
      stationNames: trip.stationNames,
      originStationName: trip.stationNames[0],
      destinationStationName: trip.stationNames[trip.stationNames.length - 1],
      fareText: trip.fare,
      operator: trip.operator,
      bookingUrl: normalizeBookingUrl(trip.bookingUrl),
      runtimeText: trip.runtimeText,
      gateText,
      availability: trip.bookingUrl ? 'booking_reference' : 'query_only',
      sourcePath: trip.sourcePath,
    };
  });
}

async function readFlightTrips(): Promise<TravelScheduleSourceResult> {
  const config = readRuntimeConfig();
  try {
    const response = await fetch(config.flightDataUrl, { cache: 'no-store' });
    if (!response.ok) {
      return {
        meta: createApiMeta('unavailable', `航班数据源返回 ${response.status}。`),
        trips: [],
        sourceFiles: [config.flightDataUrl],
      };
    }

    const source = await response.text();
    const trips = parseFlightScheduleSource(source, config.flightDataUrl);
    return {
      meta: createApiMeta(
        'ready',
        trips.length > 0
          ? undefined
          : `航班数据已读取，但没有符合 ${targetFlightAirport} 或 ${targetFlightOperator} 范围的航班。`,
      ),
      trips,
      sourceFiles: [config.flightDataUrl],
    };
  } catch (error) {
    return {
      meta: createApiMeta(
        'unavailable',
        error instanceof Error ? error.message : '航班数据源暂不可用。',
      ),
      trips: [],
      sourceFiles: [config.flightDataUrl],
    };
  }
}

function parseFlightScheduleSource(source: string, sourcePath: string): TravelTripInstance[] {
  return source
    .split(/\r?\n/)
    .map((line) => parseFlightScheduleLine(line, sourcePath))
    .filter((trip): trip is TravelTripInstance => Boolean(trip))
    .sort(compareTrips);
}

function parseFlightScheduleLine(
  rawLine: string,
  sourcePath: string,
): TravelTripInstance | undefined {
  const line = rawLine.trim();
  if (!line.includes('【') || !line.includes('《航班结束》')) {
    return undefined;
  }

  const match = line.match(
    /【([^】]+)】\s*〈([^〉]*)〉\s*«([^»]*)»\s*〔([^〕]*)〕\s*『([^』]*)』([\s\S]*?)《航班结束》/,
  );
  if (!match) {
    return undefined;
  }

  const [, flightNumber, routeNote, daysText, aircraftModel, operator, body] = match;
  if (!flightNumber || !aircraftModel || !operator || !body) {
    return undefined;
  }

  const segments = parseFlightSegments(body);
  if (segments.length < 2 || !isRelevantFlight(operator, segments)) {
    return undefined;
  }

  const departureSegment =
    segments.find((segment) => segment.action === 'departure') ?? segments[0];
  const arrivalSegment =
    [...segments].reverse().find((segment) => segment.action === 'arrival') ??
    segments[segments.length - 1];
  if (!departureSegment || !arrivalSegment) {
    return undefined;
  }

  const routeName = `${departureSegment.airportName} - ${arrivalSegment.airportName}`;
  const fareText = parseFlightFareText(line);

  return {
    tripInstanceId: `flight:${flightNumber.trim()}:${departureSegment.time}`,
    tripCode: flightNumber.trim(),
    serviceKind: 'flight',
    serviceLabel: serviceLabels.flight,
    departureTime: departureSegment.time,
    arrivalTime: arrivalSegment.time,
    arrivalDayOffset: arrivalSegment.dayOffset,
    lineName: routeName,
    routeNote: routeNote?.trim() || undefined,
    stationNames: segments.map((segment) => segment.airportName),
    originStationName: departureSegment.airportName,
    destinationStationName: arrivalSegment.airportName,
    fareText,
    operator: operator.trim(),
    runtimeText: formatFlightRuntime(departureSegment, arrivalSegment),
    gateText: formatFlightPositions(segments),
    vehicleModelText: aircraftModel.trim(),
    operatingDays: parseOperatingDays(daysText),
    availability: 'query_only',
    sourcePath,
  };
}

function parseFlightSegments(value: string): FlightSegment[] {
  return Array.from(
    value.matchAll(/《([^《》]+?)(出发|经停|到达)》\s*\{([^}]+)\}\s*#\+(-?\d+)#\s*@([^@]*)@/g),
  ).flatMap((match) => {
    const [, airportName, actionText, timeText, dayOffsetText, position] = match;
    if (!airportName || !actionText || !timeText || !dayOffsetText) {
      return [];
    }

    return [
      {
        airportName: airportName.trim(),
        action: normalizeFlightAction(actionText),
        time: normalizeClockText(timeText),
        dayOffset: Number(dayOffsetText),
        position: position?.trim() || undefined,
      },
    ];
  });
}

function normalizeFlightAction(value: string): FlightSegment['action'] {
  if (value === '出发') {
    return 'departure';
  }

  if (value === '经停') {
    return 'stopover';
  }

  return 'arrival';
}

function isRelevantFlight(operator: string, segments: FlightSegment[]): boolean {
  return (
    operator.trim() === targetFlightOperator ||
    segments.some((segment) => segment.airportName === targetFlightAirport)
  );
}

function parseFlightFareText(line: string): string | undefined {
  const fares = Array.from(line.matchAll(/[§θ△]([^§θ△]+)[§θ△]/g))
    .map((match) => match[1]?.trim())
    .filter((fare): fare is string => Boolean(fare));
  return fares.length > 0 ? fares.join(' / ') : undefined;
}

function parseOperatingDays(value: string | undefined): string[] | undefined {
  const days = value
    ?.split(',')
    .map((day) => day.trim())
    .filter(Boolean);
  return days && days.length > 0 ? days : undefined;
}

function formatFlightRuntime(departure: FlightSegment, arrival: FlightSegment): string | undefined {
  const minutes = timeWithDayOffsetToMinutes(arrival) - timeWithDayOffsetToMinutes(departure);
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return undefined;
  }

  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  return hours > 0 ? `${hours}小时${restMinutes}分钟` : `${restMinutes}分钟`;
}

function formatFlightPositions(segments: FlightSegment[]): string | undefined {
  const parts = segments.flatMap((segment) => {
    if (!segment.position) {
      return [];
    }

    if (segment.action === 'departure') {
      return [`值机 ${segment.position}`];
    }

    if (segment.action === 'stopover') {
      return [`经停 ${segment.airportName} ${segment.position}`];
    }

    return [`到达 ${segment.position}`];
  });

  return parts.length > 0 ? parts.join(' / ') : undefined;
}

function timeWithDayOffsetToMinutes(segment: Pick<FlightSegment, 'time' | 'dayOffset'>): number {
  const match = segment.time.match(/^(\d{2}):(\d{2})$/);
  if (!match) {
    return Number.NaN;
  }

  return segment.dayOffset * 24 * 60 + Number(match[1]) * 60 + Number(match[2]);
}

function filterTrips(
  trips: TravelTripInstance[],
  query: TravelScheduleQuery,
): TravelTripInstance[] {
  const serviceKind = query.serviceKind ?? 'all';
  const timeScope = query.timeScope ?? 'all';
  const stationName = normalizeQueryValue(query.stationName);
  const searchText = normalizeQueryValue(query.query);
  const currentMinutes = getCurrentAdjustedMinutes();

  return trips
    .filter((trip) => serviceKind === 'all' || trip.serviceKind === serviceKind)
    .filter(
      (trip) =>
        !stationName || trip.stationNames.some((name) => normalizeQueryValue(name) === stationName),
    )
    .filter((trip) => filterByTime(trip, timeScope, currentMinutes))
    .filter((trip) => {
      if (!searchText) {
        return true;
      }

      return normalizeQueryValue(buildTripSearchText(trip)).includes(searchText);
    })
    .sort(compareTrips);
}

function groupGatesByLine(gates: TransitScreenGate[]): Map<string, TransitScreenGate[]> {
  const map = new Map<string, TransitScreenGate[]>();
  for (const gate of gates) {
    const group = map.get(gate.lineName) ?? [];
    group.push(gate);
    map.set(gate.lineName, group);
  }
  return map;
}

function formatGates(
  gates: TransitScreenGate[],
  stationNameById: Map<string, string>,
): string | undefined {
  if (gates.length === 0) {
    return undefined;
  }

  return gates
    .map((gate) => {
      const stationName = stationNameById.get(gate.stationId);
      return stationName ? `${stationName} ${gate.gate}` : gate.gate;
    })
    .join('、');
}

function filterByTime(
  trip: Pick<TransitScreenTrip, 'departureTime'>,
  timeScope: TravelScheduleTimeScope,
  currentMinutes: number,
): boolean {
  if (timeScope === 'all') {
    return true;
  }

  const tripMinutes = parseAdjustedTime(trip.departureTime);
  return timeScope === 'upcoming' ? tripMinutes >= currentMinutes : tripMinutes < currentMinutes;
}

function compareTrips(left: TravelTripInstance, right: TravelTripInstance): number {
  return (
    parseAdjustedTime(left.departureTime) - parseAdjustedTime(right.departureTime) ||
    left.lineName.localeCompare(right.lineName, 'zh-CN', { numeric: true }) ||
    left.tripInstanceId.localeCompare(right.tripInstanceId, 'zh-CN', { numeric: true })
  );
}

function parseAdjustedTime(value: string): number {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return Number.MAX_SAFE_INTEGER;
  }

  return getAdjustedMinutes(Number(match[1]), Number(match[2]));
}

function getCurrentAdjustedMinutes(): number {
  const now = new Date();
  return getAdjustedMinutes(now.getHours(), now.getMinutes());
}

function getAdjustedMinutes(hours: number, minutes: number): number {
  const total = hours * 60 + minutes;
  return total < 180 ? total + 24 * 60 : total;
}

function buildTripSearchText(trip: TravelTripInstance): string {
  return [
    trip.tripInstanceId,
    trip.tripCode,
    trip.serviceLabel,
    trip.departureTime,
    trip.arrivalTime,
    trip.lineName,
    trip.routeNote,
    ...trip.stationNames,
    trip.fareText,
    trip.operator,
    trip.runtimeText,
    trip.gateText,
    trip.vehicleTypeText,
    trip.vehicleModelText,
    ...(trip.operatingDays ?? []),
  ]
    .filter(Boolean)
    .join(' ');
}

function normalizeQueryValue(value: string | undefined): string {
  return (value ?? '')
    .replace(/[|\s\u3000]+/g, '')
    .trim()
    .toLowerCase();
}

function normalizeBookingUrl(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  try {
    return new URL(value, 'https://yct.shangxiaoguan.top/').toString();
  } catch {
    return value;
  }
}

function normalizeClockText(value: string): string {
  const match = value.trim().match(/^(\d{1,2}):(\d{1,2})$/);
  if (!match) {
    return value.trim();
  }

  return `${match[1]?.padStart(2, '0')}:${match[2]?.padStart(2, '0')}`;
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((left, right) =>
    left.localeCompare(right, 'zh-CN', { numeric: true }),
  );
}
