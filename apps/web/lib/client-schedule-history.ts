import type {
  TicketableServiceKind,
  TravelScheduleHistoryItem,
  TravelScheduleHistoryReason,
  TravelTripInstance,
} from '@yct/contracts';

export const travelScheduleHistoryStorageKey = 'yct.travelScheduleHistory.v1';
const maxHistoryItems = 50;

export interface TravelScheduleHistoryState {
  items: TravelScheduleHistoryItem[];
  summary: {
    total: number;
    coach: number;
    ferry: number;
    flight: number;
    reminderLinked: number;
  };
}

export function readTravelScheduleHistoryState(): TravelScheduleHistoryState {
  const items = readStoredHistory();
  return {
    items,
    summary: summarizeHistory(items),
  };
}

export function saveTravelScheduleHistory(
  trip: TravelTripInstance,
  reason: TravelScheduleHistoryReason = 'saved',
): TravelScheduleHistoryItem {
  const now = new Date().toISOString();
  const existing = readStoredHistory();
  const current = existing.find((item) => item.tripInstanceId === trip.tripInstanceId);
  const item = toHistoryItem(trip, reason, now, current);
  const next = [
    item,
    ...existing.filter((entry) => entry.tripInstanceId !== trip.tripInstanceId),
  ].slice(0, maxHistoryItems);
  writeStoredHistory(next);
  return item;
}

export function clearTravelScheduleHistory(): void {
  window.localStorage.removeItem(travelScheduleHistoryStorageKey);
}

function readStoredHistory(): TravelScheduleHistoryItem[] {
  const source = window.localStorage.getItem(travelScheduleHistoryStorageKey);
  if (!source) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(source);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.flatMap((item) => {
      const normalized = normalizeHistoryItem(item);
      return normalized ? [normalized] : [];
    });
  } catch {
    return [];
  }
}

function writeStoredHistory(items: TravelScheduleHistoryItem[]): void {
  window.localStorage.setItem(travelScheduleHistoryStorageKey, JSON.stringify(items));
}

function toHistoryItem(
  trip: TravelTripInstance,
  reason: TravelScheduleHistoryReason,
  now: string,
  current?: TravelScheduleHistoryItem,
): TravelScheduleHistoryItem {
  return {
    id: current?.id ?? `schedule-history-${stableHash(trip.tripInstanceId)}`,
    tripInstanceId: trip.tripInstanceId,
    tripCode: trip.tripCode,
    serviceKind: trip.serviceKind,
    serviceLabel: trip.serviceLabel,
    lineName: trip.lineName,
    departureTime: trip.departureTime,
    arrivalTime: trip.arrivalTime,
    arrivalDayOffset: trip.arrivalDayOffset,
    stationNames: trip.stationNames,
    originStationName: trip.originStationName,
    destinationStationName: trip.destinationStationName,
    fareText: trip.fareText,
    operator: trip.operator,
    gateText: trip.gateText,
    vehicleTypeText: trip.vehicleTypeText,
    vehicleModelText: trip.vehicleModelText,
    operatingDays: trip.operatingDays,
    lastReason: reason,
    recordedAt: current?.recordedAt ?? now,
    updatedAt: now,
    reminderCreatedAt: reason === 'reminder' ? now : current?.reminderCreatedAt,
  };
}

function normalizeHistoryItem(value: unknown): TravelScheduleHistoryItem | null {
  if (!isObjectRecord(value)) {
    return null;
  }

  const tripInstanceId = normalizeString(value.tripInstanceId);
  const serviceKind = normalizeTicketableServiceKind(value.serviceKind);
  const serviceLabel = normalizeString(value.serviceLabel);
  const lineName = normalizeString(value.lineName);
  const departureTime = normalizeString(value.departureTime);
  const stationNames = normalizeStringArray(value.stationNames);
  const recordedAt = normalizeIsoDateTime(value.recordedAt);
  const updatedAt = normalizeIsoDateTime(value.updatedAt);

  if (
    !tripInstanceId ||
    !serviceKind ||
    !serviceLabel ||
    !lineName ||
    !departureTime ||
    stationNames.length === 0 ||
    !recordedAt ||
    !updatedAt
  ) {
    return null;
  }

  return {
    id: normalizeString(value.id) ?? `schedule-history-${stableHash(tripInstanceId)}`,
    tripInstanceId,
    tripCode: normalizeString(value.tripCode),
    serviceKind,
    serviceLabel,
    lineName,
    departureTime,
    arrivalTime: normalizeString(value.arrivalTime),
    arrivalDayOffset: normalizeNumber(value.arrivalDayOffset),
    stationNames,
    originStationName: normalizeString(value.originStationName),
    destinationStationName: normalizeString(value.destinationStationName),
    fareText: normalizeString(value.fareText),
    operator: normalizeString(value.operator),
    gateText: normalizeString(value.gateText),
    vehicleTypeText: normalizeString(value.vehicleTypeText),
    vehicleModelText: normalizeString(value.vehicleModelText),
    operatingDays: normalizeStringArray(value.operatingDays),
    lastReason: normalizeHistoryReason(value.lastReason) ?? 'saved',
    recordedAt,
    updatedAt,
    reminderCreatedAt: normalizeIsoDateTime(value.reminderCreatedAt),
  };
}

function summarizeHistory(
  items: TravelScheduleHistoryItem[],
): TravelScheduleHistoryState['summary'] {
  return {
    total: items.length,
    coach: items.filter((item) => item.serviceKind === 'coach').length,
    ferry: items.filter((item) => item.serviceKind === 'ferry').length,
    flight: items.filter((item) => item.serviceKind === 'flight').length,
    reminderLinked: items.filter((item) => Boolean(item.reminderCreatedAt)).length,
  };
}

function normalizeTicketableServiceKind(value: unknown): TicketableServiceKind | undefined {
  const kind = normalizeString(value);
  if (
    kind === 'coach' ||
    kind === 'ferry' ||
    kind === 'flight' ||
    kind === 'railway' ||
    kind === 'custom'
  ) {
    return kind;
  }

  return undefined;
}

function normalizeHistoryReason(value: unknown): TravelScheduleHistoryReason | undefined {
  const reason = normalizeString(value);
  return reason === 'saved' || reason === 'reminder' ? reason : undefined;
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.flatMap((item) => {
        const normalized = normalizeString(item);
        return normalized ? [normalized] : [];
      })
    : [];
}

function normalizeIsoDateTime(value: unknown): string | undefined {
  const text = normalizeString(value);
  if (!text) {
    return undefined;
  }

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function normalizeNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function normalizeString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function stableHash(value: string): string {
  let hash = 5381;
  for (const character of value) {
    hash = (hash * 33) ^ character.charCodeAt(0);
  }

  return (hash >>> 0).toString(36);
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
