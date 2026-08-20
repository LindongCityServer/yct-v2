import type {
  TravelScheduleConflict,
  TravelTripInstance,
  TravelTripStopTime,
} from '@yct/contracts';

const minimumStationHeadwayMinutes = 3;

export interface ResolvedTravelStopTime extends TravelTripStopTime {
  sequence: number;
  arrivalMinutes?: number;
  departureMinutes?: number;
}

export function resolveTravelTripStopTimes(trip: TravelTripInstance): ResolvedTravelStopTime[] {
  const configured = trip.stopTimes?.length
    ? trip.stopTimes
    : trip.stationNames.map((stationName, index) => ({
        stationName,
        isStop: true,
        arrivalTime: index === trip.stationNames.length - 1 ? trip.arrivalTime : undefined,
        departureTime: index === 0 ? trip.departureTime : undefined,
        arrivalDayOffset:
          index === trip.stationNames.length - 1 ? trip.arrivalDayOffset : undefined,
        departureDayOffset: index === 0 ? 0 : undefined,
      }));

  return configured.map((stopTime, sequence) => ({
    ...stopTime,
    sequence,
    arrivalMinutes: toAbsoluteMinutes(stopTime.arrivalTime, stopTime.arrivalDayOffset),
    departureMinutes: toAbsoluteMinutes(stopTime.departureTime, stopTime.departureDayOffset),
  }));
}

export function normalizeTravelTripStopTimes(
  stopTimes: TravelTripStopTime[] | undefined,
): TravelTripStopTime[] | undefined {
  if (!stopTimes?.length) {
    return undefined;
  }

  return stopTimes.map((stopTime) => {
    const arrivalTime = normalizeClockTime(stopTime.arrivalTime);
    const departureTime = normalizeClockTime(stopTime.departureTime);
    const arrivalMinutes = toAbsoluteMinutes(arrivalTime, stopTime.arrivalDayOffset);
    const departureMinutes = toAbsoluteMinutes(departureTime, stopTime.departureDayOffset);
    const inferredDwellMinutes =
      arrivalMinutes !== undefined && departureMinutes !== undefined
        ? Math.max(0, departureMinutes - arrivalMinutes)
        : undefined;

    return {
      stationName: stopTime.stationName.trim(),
      isStop: stopTime.isStop,
      arrivalTime,
      departureTime,
      arrivalDayOffset: arrivalTime ? (stopTime.arrivalDayOffset ?? 0) : undefined,
      departureDayOffset: departureTime ? (stopTime.departureDayOffset ?? 0) : undefined,
      dwellMinutes: stopTime.isStop ? (stopTime.dwellMinutes ?? inferredDwellMinutes) : undefined,
    };
  });
}

export function detectTravelScheduleConflicts(
  trips: TravelTripInstance[],
): TravelScheduleConflict[] {
  const conflicts: TravelScheduleConflict[] = [];
  const stationPassages = new Map<
    string,
    Array<{ trip: TravelTripInstance; minutes: number; sequence: number }>
  >();

  for (const trip of trips) {
    const stopTimes = resolveTravelTripStopTimes(trip);
    let previousMinutes: number | undefined;

    for (const stopTime of stopTimes) {
      const arrivalMinutes = stopTime.arrivalMinutes;
      const departureMinutes = stopTime.departureMinutes;
      const passageMinutes = arrivalMinutes ?? departureMinutes;

      if (
        arrivalMinutes !== undefined &&
        departureMinutes !== undefined &&
        departureMinutes < arrivalMinutes
      ) {
        conflicts.push({
          conflictId: `time-order:${trip.tripInstanceId}:${stopTime.sequence}`,
          kind: 'time_order',
          severity: 'error',
          message: `${trip.tripCode ?? trip.lineName} 在 ${stopTime.stationName} 的出发时刻早于到达时刻。`,
          stationName: stopTime.stationName,
          tripInstanceIds: [trip.tripInstanceId],
        });
      }
      if (
        arrivalMinutes !== undefined &&
        departureMinutes !== undefined &&
        stopTime.dwellMinutes !== undefined &&
        departureMinutes - arrivalMinutes !== stopTime.dwellMinutes
      ) {
        conflicts.push({
          conflictId: `dwell-mismatch:${trip.tripInstanceId}:${stopTime.sequence}`,
          kind: 'time_order',
          severity: 'warning',
          message: `${trip.tripCode ?? trip.lineName} 在 ${stopTime.stationName} 的停车分钟数与到发时刻不一致。`,
          stationName: stopTime.stationName,
          tripInstanceIds: [trip.tripInstanceId],
        });
      }

      if (passageMinutes === undefined) {
        conflicts.push({
          conflictId: `missing-time:${trip.tripInstanceId}:${stopTime.sequence}`,
          kind: 'missing_time',
          severity: 'warning',
          message: `${trip.tripCode ?? trip.lineName} 在 ${stopTime.stationName} 缺少可绘制的到发时刻。`,
          stationName: stopTime.stationName,
          tripInstanceIds: [trip.tripInstanceId],
        });
        continue;
      }

      if (previousMinutes !== undefined && passageMinutes < previousMinutes) {
        conflicts.push({
          conflictId: `route-order:${trip.tripInstanceId}:${stopTime.sequence}`,
          kind: 'time_order',
          severity: 'error',
          message: `${trip.tripCode ?? trip.lineName} 到达 ${stopTime.stationName} 的时刻早于上一站。`,
          stationName: stopTime.stationName,
          tripInstanceIds: [trip.tripInstanceId],
        });
      }
      previousMinutes = departureMinutes ?? arrivalMinutes;

      const passages = stationPassages.get(stopTime.stationName) ?? [];
      passages.push({ trip, minutes: passageMinutes, sequence: stopTime.sequence });
      stationPassages.set(stopTime.stationName, passages);
    }
  }

  for (const [stationName, passages] of stationPassages) {
    const sorted = passages.sort((left, right) => left.minutes - right.minutes);
    for (let index = 1; index < sorted.length; index += 1) {
      const previous = sorted[index - 1];
      const current = sorted[index];
      if (
        !previous ||
        !current ||
        previous.trip.tripInstanceId === current.trip.tripInstanceId ||
        current.minutes - previous.minutes >= minimumStationHeadwayMinutes
      ) {
        continue;
      }

      conflicts.push({
        conflictId: `headway:${stationName}:${previous.trip.tripInstanceId}:${current.trip.tripInstanceId}`,
        kind: 'station_headway',
        severity: 'warning',
        message: `${stationName} 的两班车间隔不足 ${minimumStationHeadwayMinutes} 分钟。`,
        stationName,
        tripInstanceIds: [previous.trip.tripInstanceId, current.trip.tripInstanceId],
      });
    }
  }

  return conflicts;
}

export function toAbsoluteMinutes(time: string | undefined, dayOffset = 0): number | undefined {
  const normalized = normalizeClockTime(time);
  if (!normalized) {
    return undefined;
  }

  const [hours, minutes] = normalized.split(':').map(Number);
  return (dayOffset ?? 0) * 24 * 60 + (hours ?? 0) * 60 + (minutes ?? 0);
}

export function formatAbsoluteMinutes(minutes: number): { time: string; dayOffset: number } {
  const safeMinutes = Math.max(0, Math.round(minutes));
  const dayOffset = Math.floor(safeMinutes / (24 * 60));
  const minutesInDay = safeMinutes % (24 * 60);
  return {
    time: `${String(Math.floor(minutesInDay / 60)).padStart(2, '0')}:${String(minutesInDay % 60).padStart(2, '0')}`,
    dayOffset,
  };
}

function normalizeClockTime(value: string | undefined): string | undefined {
  const match = value?.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return undefined;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return undefined;
  }
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}
