'use client';

import type { TravelTripStopTime } from '@yct/contracts';
import { useI18n, type CommonMessageKey } from '../lib/client-i18n';

const columnKeys: CommonMessageKey[] = [
  'scheduleStopTable.stop',
  'scheduleStopTable.station',
  'scheduleStopTable.arrival',
  'scheduleStopTable.departure',
  'scheduleStopTable.dwell',
];

export function ScheduleStopTimeTable({
  stopTimes,
  onChange,
  readOnly = false,
  disabled = false,
}: Readonly<{
  stopTimes: readonly TravelTripStopTime[];
  onChange?: (index: number, patch: Partial<TravelTripStopTime>) => void;
  readOnly?: boolean;
  disabled?: boolean;
}>) {
  const { t } = useI18n();
  const isReadOnly = readOnly || !onChange;
  return (
    <div className="schedule-stop-time-table" role="table" aria-label={t('scheduleStopTable.aria')}>
      <div className="schedule-stop-time-row is-header" role="row">
        {columnKeys.map((labelKey) => (
          <span role="columnheader" key={labelKey}>
            {t(labelKey)}
          </span>
        ))}
      </div>
      {stopTimes.map((stopTime, index) => (
        <div className="schedule-stop-time-row" role="row" key={`${stopTime.stationName}-${index}`}>
          <span role="cell">
            <input
              type="checkbox"
              checked={stopTime.isStop}
              disabled={disabled || isReadOnly}
              aria-label={t('scheduleStopTable.stopAria', { station: stopTime.stationName })}
              onChange={(event) => onChange?.(index, { isStop: event.currentTarget.checked })}
            />
          </span>
          <strong role="cell">{stopTime.stationName}</strong>
          <span role="cell">
            <input
              type="time"
              value={stopTime.arrivalTime ?? ''}
              readOnly={isReadOnly}
              disabled={disabled}
              aria-label={t('scheduleStopTable.arrivalAria', { station: stopTime.stationName })}
              onChange={(event) =>
                onChange?.(index, { arrivalTime: event.currentTarget.value || undefined })
              }
            />
          </span>
          <span role="cell">
            <input
              type="time"
              value={stopTime.departureTime ?? ''}
              readOnly={isReadOnly}
              disabled={disabled}
              aria-label={t('scheduleStopTable.departureAria', { station: stopTime.stationName })}
              onChange={(event) =>
                onChange?.(index, { departureTime: event.currentTarget.value || undefined })
              }
            />
          </span>
          <span role="cell">
            <input
              type="number"
              min={0}
              max={1440}
              value={stopTime.dwellMinutes ?? ''}
              readOnly={isReadOnly}
              disabled={disabled}
              aria-label={t('scheduleStopTable.dwellAria', { station: stopTime.stationName })}
              onChange={(event) =>
                onChange?.(index, {
                  dwellMinutes: event.currentTarget.value
                    ? Number(event.currentTarget.value)
                    : undefined,
                })
              }
            />
          </span>
        </div>
      ))}
      {stopTimes.length === 0 ? (
        <div role="row" className="status-note">
          <span role="cell" aria-colspan={5}>
            {t('scheduleStopTable.empty')}
          </span>
        </div>
      ) : null}
    </div>
  );
}
