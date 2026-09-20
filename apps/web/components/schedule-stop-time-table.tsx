'use client';

import type { TravelTripStopTime } from '@yct/contracts';

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
  const isReadOnly = readOnly || !onChange;
  return (
    <div className="schedule-stop-time-table" role="table" aria-label="各站停站时刻">
      <div className="schedule-stop-time-row is-header" role="row">
        {['停站', '站点', '到达', '出发', '停车(分)'].map((label) => (
          <span role="columnheader" key={label}>
            {label}
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
              aria-label={`${stopTime.stationName} 是否停站`}
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
              aria-label={`${stopTime.stationName} 到达时间`}
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
              aria-label={`${stopTime.stationName} 出发时间`}
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
              aria-label={`${stopTime.stationName} 停车分钟`}
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
            暂无停站时刻
          </span>
        </div>
      ) : null}
    </div>
  );
}
