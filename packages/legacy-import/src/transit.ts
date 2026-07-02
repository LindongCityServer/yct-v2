import { readFile } from 'node:fs/promises';
import type {
  LegacyCoachRuntimeSegmentImportItemInput,
  LegacyCoachScreenGateImportItemInput,
  LegacyCoachScreenStationImportItemInput,
  LegacyCoachScreenTripImportItemInput,
  LegacyMetroStationDetailImportItemInput,
  LegacyTransitLineImportItemInput,
  LegacyTransitServiceNoticeImportItemInput,
  LegacyTransitStationImportItemInput,
} from '@yct/schemas';
import {
  legacyCoachRuntimeSegmentImportItemSchema,
  legacyCoachScreenGateImportItemSchema,
  legacyCoachScreenStationImportItemSchema,
  legacyCoachScreenTripImportItemSchema,
  legacyMetroStationDetailImportItemSchema,
  legacyTransitLineImportItemSchema,
  legacyTransitServiceNoticeImportItemSchema,
  legacyTransitStationImportItemSchema,
} from '@yct/schemas';
import { evaluateLegacyDataFile } from './evaluate';
import { buildLegacySourceId } from './ids';

export type LegacyTransitMode = 'metro' | 'tram' | 'bus' | 'coach' | 'ferry' | 'railway' | 'custom';

interface LegacyLineRecord {
  name?: string;
  color?: string;
  operator?: string | string[];
  fare?: string | number;
  firstLastBus?: {
    first?: string;
    last?: string;
  };
  stations?: LegacyStationRecord[];
}

interface LegacyCoachRouteRecord {
  tripId?: string;
  departureTime?: string;
  routeName?: string;
  viaText?: string;
  fare?: string;
  operator?: string;
  bookingUrl?: string;
  runtimeText?: string;
}

interface LegacyCoachStopNoticeRecord {
  periodText?: string;
  reason?: string;
}

interface LegacyCoachScreenGateRecord {
  stationId?: string;
  lineName?: string;
  gate?: string;
}

interface LegacyCoachRuntimeSegmentRecord {
  lineName?: string;
  intervalText?: string;
  durationText?: string;
  fareReduction?: string;
}

interface LegacyMetroStationDetailLineRecord {
  name?: string;
  stationTemplate?: LegacyMetroStationTemplateRecord[];
  stations?: LegacyMetroStationDetailRecord[];
}

interface LegacyMetroStationTemplateRecord extends LegacyMetroStationBaseRecord {
  name?: string;
}

interface LegacyMetroStationDetailRecord extends LegacyMetroStationBaseRecord {
  name?: string;
  template?: string;
  exits?: LegacyMetroStationExitGroupRecord[];
  transfer?: LegacyMetroStationTransferRecord[];
  surrounding_stations?: string[];
}

interface LegacyMetroStationBaseRecord {
  overGround?: boolean;
  layers?: LegacyMetroStationLayerRecord[];
  facilities?: LegacyMetroStationFacilityRecord[];
  facilitiesUpwards?: LegacyMetroStationFacilityRecord[];
}

interface LegacyMetroStationLayerRecord {
  floor?: string;
  type?: string;
}

interface LegacyMetroStationFacilityRecord {
  type?: string;
  location?: number;
  floor?: string;
  endFloor?: string;
  direction?: string;
  oneWay?: string;
}

interface LegacyMetroStationTransferRecord {
  line?: string;
  floor?: string;
  direction?: string;
  location?: number;
}

interface LegacyMetroStationExitGroupRecord {
  floor?: string;
  upwards?: LegacyMetroStationExitRecord[];
  downwards?: LegacyMetroStationExitRecord[];
}

interface LegacyMetroStationExitRecord {
  code?: string;
  description?: string;
}

type LegacyStationRecord =
  | string
  | {
      name?: string;
      nameEN?: string;
      coordinates?: {
        x?: number;
        y?: number;
      };
      oneWay?: string;
      status?: string;
      travelTime?: number;
      platformSide?: string;
      fareZone?: string;
      labelOffset?: {
        x?: number;
        y?: number;
      };
      trainPosition?: number;
    };

export interface LegacyTransitParseResult {
  lines: LegacyTransitLineImportItemInput[];
  stations: LegacyTransitStationImportItemInput[];
}

export async function parseLegacyTransitFile(input: {
  filePath: string;
  mode: LegacyTransitMode;
  exportExpression: string;
  sourcePrefix: string;
}): Promise<LegacyTransitParseResult> {
  const source = await readFile(input.filePath, 'utf8');
  return parseLegacyTransitSource({
    source,
    sourcePath: input.filePath,
    mode: input.mode,
    exportExpression: input.exportExpression,
    sourcePrefix: input.sourcePrefix,
  });
}

export function parseLegacyTransitSource(input: {
  source: string;
  sourcePath: string;
  mode: LegacyTransitMode;
  exportExpression: string;
  sourcePrefix: string;
}): LegacyTransitParseResult {
  const rawValue = evaluateLegacyDataFile<LegacyLineRecord[] | Record<string, LegacyLineRecord>>(
    input.source,
    input.exportExpression,
  );
  const records = Array.isArray(rawValue) ? rawValue : Object.values(rawValue);
  const stationMap = new Map<string, LegacyTransitStationImportItemInput>();

  const lines = records.map((line, index) => {
    const stationSourceIds: string[] = [];
    const stops =
      line.stations?.map((station, sequence) => {
        const stationName = getLegacyStationName(station, index, sequence);
        const stationId = buildLegacySourceId('station', stationName);
        const stationRecord = normalizeLegacyStationRecord(station);
        if (!stationMap.has(stationId)) {
          stationMap.set(
            stationId,
            legacyTransitStationImportItemSchema.parse({
              sourceId: stationId,
              name: stationName,
              aliases: stationRecord?.nameEN ? [stationRecord.nameEN] : [],
              diagramX: stationRecord?.coordinates?.x,
              diagramY: stationRecord?.coordinates?.y,
              sourcePath: input.sourcePath,
            }),
          );
        }

        stationSourceIds.push(stationId);

        return {
          stationSourceId: stationId,
          sequence,
          oneWay: normalizeOneWay(stationRecord?.oneWay),
          status: stationRecord?.status,
          travelTime: stationRecord?.travelTime,
          platformSide: stationRecord?.platformSide,
          fareZone: stationRecord?.fareZone,
          labelOffset: stationRecord?.labelOffset,
          trainPosition: stationRecord?.trainPosition,
        };
      }) ?? [];

    return legacyTransitLineImportItemSchema.parse({
      sourceId: buildLegacySourceId(input.sourcePrefix, line.name ?? 'unnamed-line', index),
      mode: input.mode,
      name: line.name ?? `未命名线路 ${index + 1}`,
      stationSourceIds,
      stops,
      color: normalizeColor(line.color),
      operator: normalizeLegacyText(line.operator),
      fare: normalizeLegacyFare(line.fare),
      firstLastBus: line.firstLastBus,
      sourcePath: input.sourcePath,
    });
  });

  return {
    lines,
    stations: Array.from(stationMap.values()),
  };
}

export function parseLegacyCoachRouteSource(input: {
  source: string;
  sourcePath: string;
  sourcePrefix?: string;
}): LegacyTransitParseResult {
  const records = parseLegacyCoachRouteRecords(input.source);
  const groupedRoutes = new Map<string, LegacyCoachRouteRecord[]>();

  for (const record of records) {
    if (!record.routeName) {
      continue;
    }

    const key = `${record.routeName}\n${record.viaText ?? ''}`;
    const group = groupedRoutes.get(key) ?? [];
    group.push(record);
    groupedRoutes.set(key, group);
  }

  const stationMap = new Map<string, LegacyTransitStationImportItemInput>();
  const lines = Array.from(groupedRoutes.values()).map((routes, index) => {
    const firstRoute = routes[0];
    const routeName = firstRoute?.routeName ?? `未命名客运线路 ${index + 1}`;
    const stationNames = splitCoachStations(firstRoute?.viaText ?? routeName);
    const stationSourceIds = stationNames.map((stationName) => {
      const stationId = buildLegacySourceId('coach-station', stationName);
      if (!stationMap.has(stationId)) {
        stationMap.set(
          stationId,
          legacyTransitStationImportItemSchema.parse({
            sourceId: stationId,
            name: stationName,
            aliases: [],
            sourcePath: input.sourcePath,
          }),
        );
      }

      return stationId;
    });
    const departureTimes = uniqueValues(routes.map((route) => route.departureTime));

    return legacyTransitLineImportItemSchema.parse({
      sourceId: buildLegacySourceId(
        input.sourcePrefix ?? 'coach',
        `${routeName}-${firstRoute?.viaText ?? ''}`,
        index,
      ),
      mode: 'coach',
      name: routeName,
      stationSourceIds,
      stops: stationSourceIds.map((stationSourceId, sequence) => ({
        stationSourceId,
        sequence,
      })),
      operator: uniqueValues(routes.map((route) => route.operator)).join('、') || undefined,
      fare: uniqueValues(routes.map((route) => route.fare)).join('、') || undefined,
      firstLastBus: buildFirstLastBus(departureTimes),
      departureTimes,
      bookingUrl: uniqueValues(routes.map((route) => route.bookingUrl))[0],
      sourcePath: input.sourcePath,
    });
  });

  return {
    lines,
    stations: Array.from(stationMap.values()),
  };
}

export function parseLegacyCoachStopNoticeSource(input: {
  source: string;
  sourcePath: string;
  sourcePrefix?: string;
}): LegacyTransitServiceNoticeImportItemInput[] {
  return parseLegacyCoachStopNoticeRecords(input.source)
    .filter((record) => record.periodText && record.reason)
    .map((record, index) => {
      const parsedPeriod = parseCoachStopPeriod(record.periodText ?? '');
      return legacyTransitServiceNoticeImportItemSchema.parse({
        sourceId: buildLegacySourceId(
          input.sourcePrefix ?? 'coach-notice',
          record.periodText ?? 'notice',
          index,
        ),
        mode: 'coach',
        title: '客运班次调整',
        periodText: record.periodText,
        reason: record.reason,
        startsAt: parsedPeriod.startsAt,
        endsAt: parsedPeriod.endsAt,
        sourcePath: input.sourcePath,
      });
    });
}

export function parseLegacyCoachScreenStationSource(input: {
  source: string;
  sourcePath: string;
}): LegacyCoachScreenStationImportItemInput[] {
  const lines = input.source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const stations: LegacyCoachScreenStationImportItemInput[] = [];

  for (let index = 0; index < lines.length; index += 2) {
    const stationId = lines[index];
    const name = lines[index + 1];
    if (!stationId || !name) {
      continue;
    }

    stations.push(
      legacyCoachScreenStationImportItemSchema.parse({
        stationId,
        name,
        sourcePath: input.sourcePath,
      }),
    );
  }

  return stations;
}

export function parseLegacyCoachScreenTripSource(input: {
  source: string;
  sourcePath: string;
  sourcePrefix?: string;
}): LegacyCoachScreenTripImportItemInput[] {
  return parseLegacyCoachRouteRecords(input.source)
    .filter((record) => record.tripId && record.departureTime && record.routeName && record.viaText)
    .map((record, index) =>
      legacyCoachScreenTripImportItemSchema.parse({
        sourceId: buildLegacySourceId(
          input.sourcePrefix ?? 'coach-screen-trip',
          `${record.tripId}-${record.routeName}-${record.departureTime}`,
          index,
        ),
        tripId: record.tripId,
        departureTime: normalizeCoachDepartureTime(record.departureTime ?? ''),
        lineName: record.routeName,
        stationNames: splitCoachStations(record.viaText ?? ''),
        fare: record.fare?.replace(/\s+/g, ''),
        operator: record.operator,
        bookingUrl: record.bookingUrl,
        runtimeText: record.runtimeText,
        sourcePath: input.sourcePath,
      }),
    );
}

export function parseLegacyCoachScreenGateSource(input: {
  source: string;
  sourcePath: string;
  sourcePrefix?: string;
}): LegacyCoachScreenGateImportItemInput[] {
  return parseLegacyCoachScreenGateRecords(input.source)
    .filter((record) => record.stationId && record.lineName && record.gate)
    .map((record, index) =>
      legacyCoachScreenGateImportItemSchema.parse({
        sourceId: buildLegacySourceId(
          input.sourcePrefix ?? 'coach-screen-gate',
          `${record.stationId}-${record.lineName}-${record.gate}`,
          index,
        ),
        stationId: record.stationId,
        lineName: record.lineName,
        gate: record.gate,
        sourcePath: input.sourcePath,
      }),
    );
}

export function parseLegacyCoachRuntimeSegmentSource(input: {
  source: string;
  sourcePath: string;
  sourcePrefix?: string;
}): LegacyCoachRuntimeSegmentImportItemInput[] {
  return parseLegacyCoachRuntimeSegmentRecords(input.source)
    .filter((record) => record.lineName && record.intervalText && record.durationText)
    .flatMap((record, index) => {
      const [fromStationName, toStationName] = splitCoachStations(record.intervalText ?? '');
      if (!fromStationName || !toStationName) {
        return [];
      }

      return [
        legacyCoachRuntimeSegmentImportItemSchema.parse({
          sourceId: buildLegacySourceId(
            input.sourcePrefix ?? 'coach-runtime-segment',
            `${record.lineName}-${record.intervalText}`,
            index,
          ),
          lineName: record.lineName,
          fromStationName,
          toStationName,
          durationMinutes: parseDurationMinutes(record.durationText ?? ''),
          fareReduction: record.fareReduction?.replace(/\s+/g, ''),
          sourcePath: input.sourcePath,
        }),
      ];
    });
}

export function parseLegacyMetroStationDetailSource(input: {
  source: string;
  sourcePath: string;
  sourcePrefix?: string;
}): LegacyMetroStationDetailImportItemInput[] {
  const normalizedSource = input.source.replace(
    /\bwindow\.stationDetail\s*=/,
    'const stationDetail =',
  );
  const lineRecords = evaluateLegacyDataFile<LegacyMetroStationDetailLineRecord[]>(
    normalizedSource,
    'stationDetail',
  );

  return lineRecords.flatMap((line, lineIndex) => {
    const lineName = normalizeLegacyString(line.name) ?? `未命名线路 ${lineIndex + 1}`;
    const templateByName = new Map(
      (line.stationTemplate ?? [])
        .map((template) => [normalizeLegacyString(template.name), template] as const)
        .filter((entry): entry is [string, LegacyMetroStationTemplateRecord] => Boolean(entry[0])),
    );

    return (line.stations ?? [])
      .filter((station) => normalizeLegacyString(station.name))
      .map((station, stationIndex) => {
        const stationName = normalizeLegacyString(station.name) ?? `未命名站点 ${stationIndex + 1}`;
        const template = station.template ? templateByName.get(station.template) : undefined;
        const merged = mergeStationTemplate(template, station);
        return legacyMetroStationDetailImportItemSchema.parse({
          sourceId: buildLegacySourceId(
            input.sourcePrefix ?? 'metro-station-detail',
            `${lineName}-${stationName}`,
            stationIndex,
          ),
          lineName,
          stationName,
          overGround: merged.overGround,
          layers: normalizeStationLayers(merged.layers),
          facilities: normalizeStationFacilities(merged.facilities),
          transfers: normalizeStationTransfers(station.transfer),
          exits: normalizeStationExits(station.exits),
          surroundingStationNames: uniqueValues(station.surrounding_stations ?? []),
          sourcePath: input.sourcePath,
        });
      });
  });
}

function normalizeColor(color: string | undefined): string | undefined {
  if (!color) {
    return undefined;
  }

  const trimmed = color.trim();
  return /^#[0-9A-Fa-f]{6}$/.test(trimmed) ? trimmed : undefined;
}

function normalizeLegacyText(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    const normalized = value.map((item) => item.trim()).filter(Boolean);
    return normalized.length > 0 ? normalized.join('、') : undefined;
  }

  const trimmed = value?.trim();
  return trimmed || undefined;
}

function normalizeLegacyFare(value: string | number | undefined): string | undefined {
  if (typeof value === 'number') {
    return `${value}元`;
  }

  const trimmed = value?.trim();
  return trimmed || undefined;
}

function normalizeLegacyString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function parseLegacyCoachRouteRecords(source: string): LegacyCoachRouteRecord[] {
  const records: LegacyCoachRouteRecord[] = [];
  let current: LegacyCoachRouteRecord = {};

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      if (hasCoachRouteValue(current)) {
        records.push(current);
        current = {};
      }
      continue;
    }

    const match = line.match(/^\[([^\]]+)\]\s*(.*)$/);
    if (!match) {
      continue;
    }

    const key = match[1]?.trim();
    const value = match[2]?.trim();
    if (!key || !value) {
      continue;
    }

    if (key === '班次' && hasCoachRouteValue(current)) {
      records.push(current);
      current = {};
    }

    if (key === '班次') {
      current.tripId = value;
    } else if (key === '发车时间') {
      current.departureTime = normalizeCoachDepartureTime(value);
    } else if (key === '线路') {
      current.routeName = value;
    } else if (key === '途径') {
      current.viaText = value;
    } else if (key === '票价') {
      current.fare = value.replace(/\s+/g, '');
    } else if (key === '公司') {
      current.operator = value;
    } else if (key === '链接') {
      current.bookingUrl = value;
    } else if (key === '运行时长') {
      current.runtimeText = value;
    }
  }

  if (hasCoachRouteValue(current)) {
    records.push(current);
  }

  return records;
}

function parseLegacyCoachScreenGateRecords(source: string): LegacyCoachScreenGateRecord[] {
  return parseBracketBlocks(source).map((block) => ({
    stationId: block['车站'],
    lineName: block['线路'],
    gate: block['检票口'],
  }));
}

function parseLegacyCoachRuntimeSegmentRecords(source: string): LegacyCoachRuntimeSegmentRecord[] {
  return parseBracketBlocks(source).map((block) => ({
    lineName: block['线路'],
    intervalText: block['区间'],
    durationText: block['用时'],
    fareReduction: block['减价'],
  }));
}

function mergeStationTemplate(
  template: LegacyMetroStationTemplateRecord | undefined,
  station: LegacyMetroStationDetailRecord,
): LegacyMetroStationBaseRecord {
  return {
    overGround: station.overGround ?? template?.overGround,
    layers: station.layers ?? template?.layers ?? [],
    facilities:
      station.facilities ??
      station.facilitiesUpwards ??
      template?.facilities ??
      template?.facilitiesUpwards ??
      [],
  };
}

function normalizeStationLayers(layers: LegacyMetroStationLayerRecord[] | undefined) {
  return (layers ?? []).flatMap((layer) => {
    const floor = normalizeLegacyString(layer.floor);
    const type = normalizeLegacyString(layer.type);
    return floor && type ? [{ floor, type }] : [];
  });
}

function normalizeStationFacilities(facilities: LegacyMetroStationFacilityRecord[] | undefined) {
  return (facilities ?? []).flatMap((facility) => {
    const type = normalizeLegacyString(facility.type);
    if (!type) {
      return [];
    }

    return [
      {
        type,
        location: Number.isFinite(facility.location) ? facility.location : undefined,
        floor: normalizeLegacyString(facility.floor),
        endFloor: normalizeLegacyString(facility.endFloor),
        direction: normalizeLegacyString(facility.direction),
        oneWay: normalizeLegacyString(facility.oneWay),
      },
    ];
  });
}

function normalizeStationTransfers(transfers: LegacyMetroStationTransferRecord[] | undefined) {
  return (transfers ?? []).flatMap((transfer) => {
    const line = normalizeLegacyString(transfer.line);
    if (!line) {
      return [];
    }

    return [
      {
        line,
        floor: normalizeLegacyString(transfer.floor),
        direction: normalizeLegacyString(transfer.direction),
        location: Number.isFinite(transfer.location) ? transfer.location : undefined,
      },
    ];
  });
}

function normalizeStationExits(exits: LegacyMetroStationExitGroupRecord[] | undefined) {
  return (exits ?? []).flatMap((group) => [
    ...normalizeStationExitDirection(group, 'upwards'),
    ...normalizeStationExitDirection(group, 'downwards'),
  ]);
}

function normalizeStationExitDirection(
  group: LegacyMetroStationExitGroupRecord,
  direction: 'upwards' | 'downwards',
) {
  return (group[direction] ?? []).flatMap((exit) => {
    const code = normalizeLegacyString(exit.code);
    if (!code) {
      return [];
    }

    return [
      {
        code,
        description: normalizeLegacyString(exit.description),
        floor: normalizeLegacyString(group.floor),
        direction,
      },
    ];
  });
}

function parseLegacyCoachStopNoticeRecords(source: string): LegacyCoachStopNoticeRecord[] {
  const records: LegacyCoachStopNoticeRecord[] = [];
  let current: LegacyCoachStopNoticeRecord = {};

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      if (hasCoachStopNoticeValue(current)) {
        records.push(current);
        current = {};
      }
      continue;
    }

    const match = line.match(/^\[([^\]]+)\]\s*(.*)$/);
    if (!match) {
      continue;
    }

    const key = match[1]?.trim();
    const value = match[2]?.trim();
    if (!key || !value) {
      continue;
    }

    if (key === '时段' && hasCoachStopNoticeValue(current)) {
      records.push(current);
      current = {};
    }

    if (key === '时段') {
      current.periodText = value;
    } else if (key === '原因') {
      current.reason = value;
    }
  }

  if (hasCoachStopNoticeValue(current)) {
    records.push(current);
  }

  return records;
}

function parseBracketBlocks(source: string): Array<Record<string, string>> {
  const records: Array<Record<string, string>> = [];
  let current: Record<string, string> = {};

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      if (Object.keys(current).length > 0) {
        records.push(current);
        current = {};
      }
      continue;
    }

    const match = line.match(/^\[([^\]]+)\]\s*(.*)$/);
    if (!match) {
      continue;
    }

    const key = match[1]?.trim();
    const value = match[2]?.trim();
    if (key && value) {
      current[key] = value;
    }
  }

  if (Object.keys(current).length > 0) {
    records.push(current);
  }

  return records;
}

function hasCoachRouteValue(record: LegacyCoachRouteRecord): boolean {
  return Boolean(record.tripId || record.departureTime || record.routeName || record.viaText);
}

function hasCoachStopNoticeValue(record: LegacyCoachStopNoticeRecord): boolean {
  return Boolean(record.periodText || record.reason);
}

function parseCoachStopPeriod(periodText: string): { startsAt?: string; endsAt?: string } {
  const match = periodText
    .trim()
    .match(
      /^(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日\s*(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/,
    );
  if (!match) {
    return {};
  }

  const [, year, month, day, startHour, startMinute, endHour, endMinute] = match;
  return {
    startsAt: toChinaIsoDateTime(year, month, day, startHour, startMinute),
    endsAt: toChinaIsoDateTime(year, month, day, endHour, endMinute),
  };
}

function toChinaIsoDateTime(
  year: string | undefined,
  month: string | undefined,
  day: string | undefined,
  hour: string | undefined,
  minute: string | undefined,
): string | undefined {
  if (!year || !month || !day || !hour || !minute) {
    return undefined;
  }

  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour.padStart(2, '0')}:${minute.padStart(2, '0')}:00+08:00`;
}

function splitCoachStations(value: string): string[] {
  const stations = value
    .split(/\s+-\s+/)
    .map((station) => station.trim())
    .filter(Boolean);

  return stations.length > 0 ? stations : [value.trim()].filter(Boolean);
}

function uniqueValues(values: Array<string | undefined>): string[] {
  return Array.from(
    new Set(
      values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)),
    ),
  );
}

function normalizeCoachDepartureTime(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{1,2}):(\d{1,2})$/);
  if (!match) {
    return trimmed;
  }

  return `${match[1]?.padStart(2, '0')}:${match[2]?.padStart(2, '0')}`;
}

function parseDurationMinutes(value: string): number {
  const match = value.trim().match(/(\d+)/);
  return match ? Number(match[1]) : 0;
}

function buildFirstLastBus(
  departureTimes: string[],
): { first?: string; last?: string } | undefined {
  const sorted = [...departureTimes].sort(
    (left, right) => departureTimeToMinutes(left) - departureTimeToMinutes(right),
  );
  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  return first || last ? { first, last } : undefined;
}

function departureTimeToMinutes(value: string): number {
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return Number.MAX_SAFE_INTEGER;
  }

  return Number(match[1]) * 60 + Number(match[2]);
}

function normalizeLegacyStationRecord(
  station: LegacyStationRecord,
): Exclude<LegacyStationRecord, string> | undefined {
  return typeof station === 'string' ? undefined : station;
}

function getLegacyStationName(
  station: LegacyStationRecord,
  lineIndex: number,
  sequence: number,
): string {
  if (typeof station === 'string') {
    return station.trim() || `未命名站点 ${lineIndex + 1}-${sequence + 1}`;
  }

  return station.name?.trim() || `未命名站点 ${lineIndex + 1}-${sequence + 1}`;
}

function normalizeOneWay(value: string | undefined): 'up' | 'down' | undefined {
  const trimmed = value?.trim();
  return trimmed === 'up' || trimmed === 'down' ? trimmed : undefined;
}
