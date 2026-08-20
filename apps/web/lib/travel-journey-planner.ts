import { createHash, randomUUID } from 'node:crypto';
import type {
  TravelJourneyLeg,
  TravelJourneyOption,
  TravelJourneyPlanResult,
  TravelJourneyTransfer,
  TravelJourneyTransferOption,
  TravelTripInstance,
  YctEventPayloadMap,
  YctEventType,
} from '@yct/contracts';
import { publishDomainEvent } from './app-event-bus';
import { resolveTravelTripStopTimes } from './travel-schedule-timing';

const minimumTransferMinutes = 5;
const maximumTransferMinutes = 180;
const maximumLegCount = 3;
const maximumJourneyCount = 12;

interface RideEdge {
  trip: TravelTripInstance;
  fromStationName: string;
  toStationName: string;
  departureMinutes: number;
  arrivalMinutes?: number;
  stationCount: number;
}

export async function planTravelJourneys(input: {
  trips: TravelTripInstance[];
  serviceDate: string;
  originStationName: string;
  destinationStationName: string;
  transferOptions?: TravelJourneyTransferOption[];
  actorId?: string;
}): Promise<TravelJourneyPlanResult> {
  const edges = input.trips.flatMap(buildTripRideEdges);
  const journeys = findJourneyOptions({
    edges,
    serviceDate: input.serviceDate,
    originStationName: input.originStationName,
    destinationStationName: input.destinationStationName,
    transferOptions: input.transferOptions,
  });
  const result: TravelJourneyPlanResult = {
    serviceDate: input.serviceDate,
    originStationName: input.originStationName,
    destinationStationName: input.destinationStationName,
    journeys,
    searchedTripCount: input.trips.length,
  };
  const plannedAt = new Date().toISOString();

  await emitEvent('TravelJourneyPlanned', input.actorId, {
    journeyPlanId: `journey_plan_${randomUUID()}`,
    serviceDate: input.serviceDate,
    originStationName: input.originStationName,
    destinationStationName: input.destinationStationName,
    optionCount: journeys.length,
    directOptionCount: journeys.filter((journey) => journey.transferCount === 0).length,
    plannedAt,
  });

  return result;
}

function buildTripRideEdges(trip: TravelTripInstance): RideEdge[] {
  const stopTimes = resolveTravelTripStopTimes(trip);
  const edges: RideEdge[] = [];

  for (let fromIndex = 0; fromIndex < stopTimes.length - 1; fromIndex += 1) {
    const from = stopTimes[fromIndex];
    if (!from?.isStop || from.departureMinutes === undefined) {
      continue;
    }

    for (let toIndex = fromIndex + 1; toIndex < stopTimes.length; toIndex += 1) {
      const to = stopTimes[toIndex];
      if (!to?.isStop) {
        continue;
      }
      const arrivalMinutes = to.arrivalMinutes ?? to.departureMinutes;
      if (arrivalMinutes !== undefined && arrivalMinutes <= from.departureMinutes) {
        continue;
      }

      edges.push({
        trip,
        fromStationName: from.stationName,
        toStationName: to.stationName,
        departureMinutes: from.departureMinutes,
        arrivalMinutes,
        stationCount: toIndex - fromIndex + 1,
      });
    }
  }

  return edges;
}

function findJourneyOptions(input: {
  edges: RideEdge[];
  serviceDate: string;
  originStationName: string;
  destinationStationName: string;
  transferOptions?: TravelJourneyTransferOption[];
}): TravelJourneyOption[] {
  const origin = normalizeStationName(input.originStationName);
  const destination = normalizeStationName(input.destinationStationName);
  if (!origin || !destination || origin === destination) {
    return [];
  }

  const edgesByOrigin = new Map<string, RideEdge[]>();
  for (const edge of input.edges) {
    const key = normalizeStationName(edge.fromStationName);
    const entries = edgesByOrigin.get(key) ?? [];
    entries.push(edge);
    edgesByOrigin.set(key, entries);
  }

  const transfersByOrigin = new Map<string, TravelJourneyTransferOption[]>();
  for (const transfer of input.transferOptions ?? []) {
    const from = normalizeStationName(transfer.fromStationName);
    const to = normalizeStationName(transfer.toStationName);
    if (!from || !to || from === to || transfer.totalMinutes <= 0) {
      continue;
    }
    const entries = transfersByOrigin.get(from) ?? [];
    entries.push(transfer);
    transfersByOrigin.set(from, entries);
  }

  const candidates: Array<{ legs: RideEdge[]; transfers: TravelJourneyTransfer[] }> = [];
  const search = (
    stationName: string,
    legs: RideEdge[],
    transferSegments: TravelJourneyTransfer[],
    visitedStations: Set<string>,
  ) => {
    if (legs.length >= maximumLegCount) {
      return;
    }

    const previous = legs.at(-1);
    const originCandidates: Array<{
      stationName: string;
      transfer?: TravelJourneyTransferOption;
    }> = [{ stationName }];
    if (previous) {
      for (const transfer of transfersByOrigin.get(stationName) ?? []) {
        const transferDestination = normalizeStationName(transfer.toStationName);
        if (
          transferDestination &&
          !visitedStations.has(transferDestination) &&
          !originCandidates.some((candidate) => candidate.stationName === transferDestination)
        ) {
          originCandidates.push({ stationName: transferDestination, transfer });
        }
      }
    }

    for (const originCandidate of originCandidates) {
      for (const edge of edgesByOrigin.get(originCandidate.stationName) ?? []) {
        const transferMinutes = originCandidate.transfer?.totalMinutes ?? minimumTransferMinutes;
        if (
          previous &&
          (previous.arrivalMinutes === undefined ||
            edge.departureMinutes < previous.arrivalMinutes + transferMinutes ||
            edge.departureMinutes > previous.arrivalMinutes + maximumTransferMinutes)
        ) {
          continue;
        }
        if (legs.some((leg) => leg.trip.tripInstanceId === edge.trip.tripInstanceId)) {
          continue;
        }

        const nextStation = normalizeStationName(edge.toStationName);
        if (visitedStations.has(nextStation)) {
          continue;
        }
        const nextLegs = [...legs, edge];
        const nextTransfers = originCandidate.transfer
          ? [
              ...transferSegments,
              toJourneyTransfer(originCandidate.transfer),
            ]
          : transferSegments;
        if (nextStation === destination) {
          candidates.push({ legs: nextLegs, transfers: nextTransfers });
          continue;
        }
        if (edge.arrivalMinutes === undefined) {
          continue;
        }
        search(
          nextStation,
          nextLegs,
          nextTransfers,
          new Set([...visitedStations, originCandidate.stationName, nextStation]),
        );
      }
    }
  };

  search(origin, [], [], new Set([origin]));

  const unique = new Map<string, TravelJourneyOption>();
  for (const candidate of candidates) {
    const option = toJourneyOption(
      candidate.legs,
      candidate.transfers,
      input.serviceDate,
      input.originStationName,
      input.destinationStationName,
    );
    const previous = unique.get(option.journeyId);
    if (!previous || getTransferMinutes(option) < getTransferMinutes(previous)) {
      unique.set(option.journeyId, option);
    }
  }

  return [...unique.values()]
    .sort((left, right) => {
      if (left.arrivalDayOffset !== undefined && right.arrivalDayOffset !== undefined) {
        const leftArrival = toOptionMinutes(left.arrivalTime, left.arrivalDayOffset);
        const rightArrival = toOptionMinutes(right.arrivalTime, right.arrivalDayOffset);
        if (leftArrival !== rightArrival) {
          return leftArrival - rightArrival;
        }
      }
      return left.transferCount - right.transferCount;
    })
    .slice(0, maximumJourneyCount);
}

function toJourneyOption(
  edges: RideEdge[],
  transfers: TravelJourneyTransfer[],
  serviceDate: string,
  originStationName: string,
  destinationStationName: string,
): TravelJourneyOption {
  const first = edges[0]!;
  const last = edges.at(-1)!;
  const legs = edges.map(toJourneyLeg);
  const allOrderable = edges.every((edge) => edge.trip.ticketing?.status === 'order_available');
  const someOrderable = edges.some((edge) => edge.trip.ticketing?.status === 'order_available');
  const tripIds = edges.map((edge) => edge.trip.tripInstanceId).join('|');

  return {
    journeyId: `journey_${createHash('sha256').update(`${serviceDate}|${originStationName}|${destinationStationName}|${tripIds}`).digest('hex').slice(0, 24)}`,
    serviceDate,
    originStationName,
    destinationStationName,
    departureTime: formatMinuteTime(first.departureMinutes),
    arrivalTime:
      last.arrivalMinutes === undefined ? undefined : formatMinuteTime(last.arrivalMinutes),
    departureDayOffset: Math.floor(first.departureMinutes / (24 * 60)),
    arrivalDayOffset:
      last.arrivalMinutes === undefined ? undefined : Math.floor(last.arrivalMinutes / (24 * 60)),
    durationMinutes:
      last.arrivalMinutes === undefined ? undefined : last.arrivalMinutes - first.departureMinutes,
    transferCount: Math.max(0, edges.length - 1),
    ticketingStatus: allOrderable
      ? 'order_available'
      : someOrderable
        ? 'partially_available'
        : 'query_only',
    legs,
    transfers,
  };
}

function toJourneyTransfer(transfer: TravelJourneyTransferOption): TravelJourneyTransfer {
  return {
    fromStationName: transfer.fromStationName,
    toStationName: transfer.toStationName,
    mode: transfer.mode,
    modeLabel: transfer.modeLabel,
    routeDistanceBlocks: transfer.routeDistanceBlocks,
    bufferMinutes: transfer.bufferMinutes,
    transferMinutes: transfer.totalMinutes,
  };
}

function getTransferMinutes(option: TravelJourneyOption): number {
  return option.transfers.reduce((total, transfer) => total + transfer.transferMinutes, 0);
}

function toJourneyLeg(edge: RideEdge): TravelJourneyLeg {
  return {
    tripInstanceId: edge.trip.tripInstanceId,
    tripCode: edge.trip.tripCode,
    serviceKind: edge.trip.serviceKind,
    serviceLabel: edge.trip.serviceLabel,
    lineName: edge.trip.lineName,
    fromStationName: edge.fromStationName,
    toStationName: edge.toStationName,
    departureTime: formatMinuteTime(edge.departureMinutes),
    arrivalTime:
      edge.arrivalMinutes === undefined ? undefined : formatMinuteTime(edge.arrivalMinutes),
    departureDayOffset: Math.floor(edge.departureMinutes / (24 * 60)),
    arrivalDayOffset:
      edge.arrivalMinutes === undefined ? undefined : Math.floor(edge.arrivalMinutes / (24 * 60)),
    stationCount: edge.stationCount,
    ticketingStatus: edge.trip.ticketing?.status ?? 'ticketing_unavailable',
  };
}

function formatMinuteTime(minutes: number): string {
  const minutesInDay = minutes % (24 * 60);
  return `${String(Math.floor(minutesInDay / 60)).padStart(2, '0')}:${String(minutesInDay % 60).padStart(2, '0')}`;
}

function toOptionMinutes(time: string | undefined, dayOffset: number): number {
  if (!time) {
    return Number.MAX_SAFE_INTEGER;
  }
  const [hours, minutes] = time.split(':').map(Number);
  return dayOffset * 24 * 60 + (hours ?? 0) * 60 + (minutes ?? 0);
}

function normalizeStationName(value: string): string {
  return value.trim().toLocaleLowerCase('zh-Hans-CN');
}

async function emitEvent<TType extends YctEventType>(
  type: TType,
  actorId: string | undefined,
  payload: YctEventPayloadMap[TType],
): Promise<void> {
  await publishDomainEvent({
    eventId: `event_${randomUUID()}`,
    type,
    actor: actorId ? { type: 'user', id: actorId } : { type: 'anonymous' },
    payload,
  });
}
