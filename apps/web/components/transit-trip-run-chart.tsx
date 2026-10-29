'use client';

import {
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  formatWorkbenchMinutes,
  type WorkbenchEdge,
  type WorkbenchLinkMode,
  type WorkbenchStationRow,
  type WorkbenchTool,
  type WorkbenchTripStop,
} from '../lib/transit-trip-workbench';

// 右侧留给站名，站点多时也不与折线争空间。
const chartRight = 160;
const chartTop = 34;
// 底部留白避开右下角的缩放按钮，最后几个站名不会被遮住。
const chartBottom = 56;
const longPressDelay = 500;

/** 主工作台按同一套上下边距计算站点纵坐标，保证色带与折线对齐。 */
export const transitTripRunChartLayout = {
  top: chartTop,
  bottom: chartBottom,
};

export interface ChartTrip {
  id: string;
  label: string;
  /** 纯班次标签，用于 tooltip 展示车辆编号。 */
  tag: string;
  color: string;
  stops: WorkbenchTripStop[];
  selected: boolean;
}

interface DragState {
  kind: 'pan' | 'move';
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startViewportStart: number;
  startStationOffset: number;
  startMinutes: number;
  tripId?: string;
  stopIndex?: number;
  edge?: WorkbenchEdge;
  moved: boolean;
  rangeResized?: boolean;
  longPressTimer?: number;
  longPressTriggered?: boolean;
}

export function TransitTripRunChart({
  height,
  leftGutter,
  linkMode,
  rows,
  selectedTripId,
  stationOffset,
  stationScale,
  tool,
  trips,
  viewport,
  onAddPoint,
  onInteractionStart,
  onMoveStop,
  onRemovePoint,
  onResizeRange,
  onSelectTrip,
  onStationViewportChange,
  onViewportChange,
}: Readonly<{
  height: number;
  /** 覆盖左侧留白；折叠班次面板后可以让时间轴左移。 */
  leftGutter?: number;
  linkMode: WorkbenchLinkMode;
  rows: WorkbenchStationRow[];
  selectedTripId: string | null;
  stationOffset: number;
  stationScale: number;
  tool: WorkbenchTool;
  trips: ChartTrip[];
  viewport: { start: number; duration: number };
  onAddPoint: (tripId: string, stopIndex: number, edge: WorkbenchEdge, minutes: number) => void;
  /** 开始一次会改动草稿的指针操作，用于合并撤销历史。 */
  onInteractionStart?: () => void;
  onMoveStop: (
    tripId: string,
    stopIndex: number,
    edge: WorkbenchEdge,
    minutes: number,
    linkMode: WorkbenchLinkMode,
  ) => void;
  onRemovePoint: (tripId: string, stopIndex: number) => void;
  onResizeRange: (tripId: string, startStationName: string, endStationName: string) => void;
  /** 点中任意班次端点时直接选中该班次，不再要求先在列表里选中。 */
  onSelectTrip?: (tripId: string) => void;
  onStationViewportChange: (next: { scale: number; offset: number }) => void;
  onViewportChange: (next: { start: number; duration: number }) => void;
}>) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const [width, setWidth] = useState(960);
  const [hover, setHover] = useState<{ x: number; y: number; text: string } | null>(null);

  useEffect(() => {
    const element = stageRef.current;
    if (!element || typeof ResizeObserver === 'undefined') {
      return undefined;
    }
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry && entry.contentRect.width > 0) {
        setWidth(Math.round(entry.contentRect.width));
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // 左侧给悬浮班次面板让位；窄屏或面板折叠时时间轴起点左移。
  const chartLeft = leftGutter ?? (width >= 900 ? 440 : 150);
  const plotWidth = Math.max(120, width - chartLeft - chartRight);
  const plotHeight = Math.max(80, height - chartTop - chartBottom);
  const xFor = useCallback(
    (minutes: number) => chartLeft + ((minutes - viewport.start) / viewport.duration) * plotWidth,
    [chartLeft, plotWidth, viewport.duration, viewport.start],
  );
  const minutesFor = useCallback(
    (x: number) => viewport.start + ((x - chartLeft) / plotWidth) * viewport.duration,
    [chartLeft, plotWidth, viewport.duration, viewport.start],
  );
  const rowByName = useMemo(() => new Map(rows.map((row) => [row.stationName, row])), [rows]);
  const timeLines = useMemo(
    () => buildTimeLines(viewport.start, viewport.start + viewport.duration),
    [viewport.duration, viewport.start],
  );

  const localPoint = (event: { clientX: number; clientY: number }) => {
    const rect = stageRef.current?.getBoundingClientRect();
    return {
      x: event.clientX - (rect?.left ?? 0),
      y: event.clientY - (rect?.top ?? 0),
    };
  };

  const nearestRow = (y: number): WorkbenchStationRow | null => {
    let best: WorkbenchStationRow | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const row of rows) {
      const distance = Math.abs(row.y - y);
      if (distance < bestDistance) {
        best = row;
        bestDistance = distance;
      }
    }
    const tolerance = Math.max(18, (plotHeight / Math.max(1, rows.length * 2)) * stationScale);
    return bestDistance <= tolerance ? best : null;
  };

  const locateStop = (trip: ChartTrip, stationName: string) =>
    trip.stops.findIndex((stop) => stop.stationName === stationName);

  const pickEdge = (stop: WorkbenchTripStop, minutes: number): WorkbenchEdge => {
    const arrivalDistance =
      stop.arrivalMinutes === undefined
        ? Number.POSITIVE_INFINITY
        : Math.abs(stop.arrivalMinutes - minutes);
    const departureDistance =
      stop.departureMinutes === undefined
        ? Number.POSITIVE_INFINITY
        : Math.abs(stop.departureMinutes - minutes);
    return arrivalDistance <= departureDistance ? 'arrival' : 'departure';
  };

  const focusTrip = (tripId?: string) =>
    tripId ? (trips.find((trip) => trip.id === tripId) ?? null) : null;

  const handlePointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = localPoint(event);
    const target =
      event.target instanceof Element
        ? event.target.closest<SVGElement>('[data-stop-index]')
        : null;
    const hitTripId = target?.dataset.tripId;
    const stopIndex = target?.dataset.stopIndex ? Number(target.dataset.stopIndex) : undefined;
    const edge = target?.dataset.edge as WorkbenchEdge | undefined;
    // 画图工具不要求先命中端点：以左侧列表选中的班次作为落点目标。
    const activeTripId = hitTripId ?? (tool === 'draw' ? (selectedTripId ?? undefined) : undefined);

    const drag: DragState = {
      kind: tool === 'move' && hitTripId && stopIndex !== undefined ? 'move' : 'pan',
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startViewportStart: viewport.start,
      startStationOffset: stationOffset,
      startMinutes: minutesFor(point.x),
      tripId: activeTripId,
      stopIndex,
      edge,
      moved: false,
    };

    if (hitTripId && stopIndex !== undefined) {
      onSelectTrip?.(hitTripId);
    }

    // 只有真正会改草稿的操作才记一条撤销历史；纯平移不算。
    if (drag.kind === 'move' || (tool === 'draw' && activeTripId)) {
      onInteractionStart?.();
    }

    if (tool === 'draw') {
      drag.longPressTimer = window.setTimeout(() => {
        const current = dragRef.current;
        if (!current || current.pointerId !== event.pointerId || current.moved) {
          return;
        }
        current.longPressTriggered = true;
        const row = nearestRow(point.y);
        const trip = focusTrip(current.tripId);
        if (!row || !trip) {
          return;
        }
        const index = locateStop(trip, row.stationName);
        if (index < 0) {
          return;
        }
        onRemovePoint(trip.id, index);
        navigator.vibrate?.(20);
      }, longPressDelay);
    }

    dragRef.current = drag;
  };

  const clearLongPress = (drag: DragState) => {
    if (drag.longPressTimer) {
      window.clearTimeout(drag.longPressTimer);
      drag.longPressTimer = undefined;
    }
  };

  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const point = localPoint(event);
    const row = nearestRow(point.y);
    if (row) {
      const hoverTarget =
        event.target instanceof Element ? event.target.closest<SVGElement>('[data-trip-id]') : null;
      const hoverTrip = focusTrip(hoverTarget?.dataset.tripId ?? selectedTripId ?? undefined);
      setHover({
        x: point.x,
        y: point.y,
        text: `${row.stationName} · ${formatWorkbenchMinutes(
          Math.round(minutesFor(point.x)),
        )}${hoverTrip ? ` · 标签：${hoverTrip.tag}` : ''}`,
      });
    } else {
      setHover(null);
    }

    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    if (
      Math.abs(event.clientX - drag.startClientX) > 4 ||
      Math.abs(event.clientY - drag.startClientY) > 4
    ) {
      drag.moved = true;
      clearLongPress(drag);
    }

    if (drag.kind === 'pan') {
      if (!drag.moved) {
        return;
      }
      const deltaMinutes = ((drag.startClientX - event.clientX) / plotWidth) * viewport.duration;
      const nextStart = clampViewportStart(drag.startViewportStart + deltaMinutes);
      onViewportChange({ start: nextStart, duration: viewport.duration });
      // 纵向拖动同步平移站点轴，放大后才能看到远处的站。
      const maxOffset = Math.max(0, plotHeight * (stationScale - 1));
      const nextOffset = Math.min(
        Math.max(drag.startStationOffset - (event.clientY - drag.startClientY), 0),
        maxOffset,
      );
      onStationViewportChange({ scale: stationScale, offset: nextOffset });
      return;
    }

    const trip = focusTrip(drag.tripId);
    if (!trip || drag.stopIndex === undefined) {
      return;
    }
    const stop = trip.stops[drag.stopIndex];
    if (!stop) {
      return;
    }

    // 首末端点纵向拖到其它站线时，改的是交路起终点，而不是自由漂移。
    // 首站可能只渲染一个到达点，所以不限制 edge。
    const isStartEdge = drag.stopIndex === 0;
    const isEndEdge = drag.stopIndex === trip.stops.length - 1;
    if ((isStartEdge || isEndEdge) && row && !drag.rangeResized) {
      const first = trip.stops[0]?.stationName;
      const last = trip.stops.at(-1)?.stationName;
      if (row.stationName !== first && row.stationName !== last) {
        drag.rangeResized = true;
        onResizeRange(
          trip.id,
          isStartEdge ? row.stationName : (first ?? row.stationName),
          isStartEdge ? (last ?? row.stationName) : row.stationName,
        );
        return;
      }
    }
    if (drag.rangeResized) {
      return;
    }

    onMoveStop(
      trip.id,
      drag.stopIndex,
      drag.edge ?? 'departure',
      Math.round(minutesFor(point.x)),
      linkMode,
    );
  };

  const handlePointerUp = (event: ReactPointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    clearLongPress(drag);
    const point = localPoint(event);
    if (tool === 'draw' && !drag.moved && !drag.longPressTriggered) {
      const row = nearestRow(point.y);
      const trip = focusTrip(drag.tripId);
      if (row && trip) {
        const index = locateStop(trip, row.stationName);
        if (index >= 0) {
          const minutes = Math.round(minutesFor(point.x));
          onAddPoint(trip.id, index, pickEdge(trip.stops[index]!, minutes), minutes);
        }
      }
    }
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleContextMenu = (event: ReactMouseEvent<SVGSVGElement>) => {
    event.preventDefault();
    if (tool !== 'draw') {
      return;
    }
    const point = localPoint(event);
    const row = nearestRow(point.y);
    const trip = focusTrip(selectedTripId ?? undefined);
    if (!row || !trip) {
      return;
    }
    const index = locateStop(trip, row.stationName);
    if (index >= 0) {
      onInteractionStart?.();
      onRemovePoint(trip.id, index);
      navigator.vibrate?.(20);
    }
  };

  const handleWheel = (event: ReactWheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    // Shift + 滚轮缩放站点轴，普通滚轮缩放时间轴。
    if (event.shiftKey) {
      const nextScale = Math.min(4, Math.max(0.6, stationScale * (event.deltaY < 0 ? 1.18 : 0.85)));
      const anchor = plotHeight / 2;
      const nextOffset = (stationOffset + anchor) * (nextScale / stationScale) - anchor;
      const maxOffset = Math.max(0, plotHeight * (nextScale - 1));
      onStationViewportChange({
        scale: nextScale,
        offset: Math.min(Math.max(nextOffset, 0), maxOffset),
      });
      return;
    }
    const rect = stageRef.current?.getBoundingClientRect();
    const x = event.clientX - (rect?.left ?? 0);
    const anchorMinutes = minutesFor(x);
    const factor = event.deltaY < 0 ? 0.82 : 1.22;
    const duration = Math.min(1440, Math.max(30, viewport.duration * factor));
    const ratio = (x - chartLeft) / plotWidth;
    onViewportChange({
      start: clampViewportStart(anchorMinutes - ratio * duration),
      duration,
    });
  };

  return (
    <div
      className={`transit-trip-run-chart is-tool-${tool}`}
      ref={stageRef}
      style={{ height }}
      role="application"
      aria-label="班次运行图"
    >
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={() => setHover(null)}
        onContextMenu={handleContextMenu}
        onWheel={handleWheel}
      >
        <defs>
          <clipPath id="transit-trip-run-plot-clip">
            <rect x={chartLeft} y={0} width={plotWidth} height={height} />
          </clipPath>
        </defs>
        {rows.map((row, index) => (
          <rect
            className={index % 2 === 0 ? 'transit-trip-run-band' : 'transit-trip-run-band is-alt'}
            key={`band-${row.stationSourceId}`}
            x={chartLeft}
            y={row.bandTop}
            width={plotWidth}
            height={Math.max(0, row.bandBottom - row.bandTop)}
          />
        ))}
        {timeLines.map((minutes) => (
          <g key={`time-${minutes}`}>
            <line
              className={
                minutes % 60 === 0
                  ? 'transit-trip-run-time-line is-hour'
                  : 'transit-trip-run-time-line'
              }
              x1={xFor(minutes)}
              x2={xFor(minutes)}
              y1={chartTop - 8}
              y2={height - chartBottom}
            />
            <text
              className="transit-trip-run-time-label"
              x={xFor(minutes)}
              y={chartTop - 14}
              textAnchor="middle"
            >
              {formatWorkbenchMinutes(minutes)}
            </text>
          </g>
        ))}
        {rows.map((row) => (
          <g key={`station-${row.stationSourceId}`}>
            <line
              className="transit-trip-run-station-line"
              x1={chartLeft}
              x2={chartLeft + plotWidth}
              y1={row.y}
              y2={row.y}
            />
            <text
              className="transit-trip-run-station-label"
              x={chartLeft + plotWidth + 12}
              y={row.y + 4}
              textAnchor="start"
            >
              {row.stationName}
            </text>
          </g>
        ))}
        <g clipPath="url(#transit-trip-run-plot-clip)">
          {trips.map((trip) => {
            const points = buildTripPoints(trip, rowByName, xFor);
            if (points.length < 2) {
              return null;
            }
            return (
              <polyline
                className={
                  trip.selected
                    ? 'transit-trip-run-trip-line is-selected'
                    : 'transit-trip-run-trip-line'
                }
                key={`line-${trip.id}`}
                points={points.map((point) => `${point.x},${point.y}`).join(' ')}
                style={{ stroke: trip.color }}
              >
                <title>{trip.label}</title>
              </polyline>
            );
          })}
          {trips.map((trip) =>
            trip.stops.map((stop, index) => {
              const row = rowByName.get(stop.stationName);
              if (!row) {
                return null;
              }
              const handles: Array<{ edge: WorkbenchEdge; minutes: number }> = [];
              if (stop.isStop) {
                if (stop.arrivalMinutes !== undefined) {
                  handles.push({ edge: 'arrival', minutes: stop.arrivalMinutes });
                }
                if (
                  stop.departureMinutes !== undefined &&
                  stop.departureMinutes !== stop.arrivalMinutes
                ) {
                  handles.push({ edge: 'departure', minutes: stop.departureMinutes });
                }
              } else {
                const minutes = stop.arrivalMinutes ?? stop.departureMinutes;
                if (minutes !== undefined) {
                  handles.push({ edge: 'arrival', minutes });
                }
              }
              return handles.map((handle) => (
                <circle
                  className={
                    stop.isStop ? 'transit-trip-run-node' : 'transit-trip-run-node is-passing'
                  }
                  data-trip-id={trip.id}
                  data-stop-index={index}
                  data-edge={handle.edge}
                  key={`${trip.id}-${index}-${handle.edge}`}
                  r={trip.selected ? 5 : 3.4}
                  style={{ stroke: trip.color }}
                  cx={xFor(handle.minutes)}
                  cy={row.y}
                />
              ));
            }),
          )}
          {linkMode !== 'none' && trips.some((trip) => trip.selected)
            ? trips
                .filter((trip) => trip.selected)
                .map((trip) => {
                  const points = buildTripPoints(trip, rowByName, xFor);
                  if (points.length < 2) {
                    return null;
                  }
                  const first = points[0]!;
                  const last = points.at(-1)!;
                  return (
                    <g key={`extend-${trip.id}`} className="transit-trip-run-extend">
                      {(linkMode === 'before' || linkMode === 'all') && (
                        <line x1={chartLeft} x2={first.x} y1={first.y} y2={first.y} />
                      )}
                      {(linkMode === 'after' || linkMode === 'all') && (
                        <line x1={last.x} x2={chartLeft + plotWidth} y1={last.y} y2={last.y} />
                      )}
                    </g>
                  );
                })
            : null}
        </g>
      </svg>
      {hover ? (
        <div className="transit-trip-run-tooltip" style={{ left: hover.x + 14, top: hover.y + 14 }}>
          {hover.text}
        </div>
      ) : null}
    </div>
  );
}

function buildTripPoints(
  trip: ChartTrip,
  rowByName: Map<string, WorkbenchStationRow>,
  xFor: (minutes: number) => number,
): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = [];
  for (const stop of trip.stops) {
    const row = rowByName.get(stop.stationName);
    if (!row) {
      continue;
    }
    if (stop.arrivalMinutes !== undefined) {
      points.push({ x: xFor(stop.arrivalMinutes), y: row.y });
    }
    if (stop.isStop && stop.departureMinutes !== undefined) {
      if (stop.arrivalMinutes === undefined || stop.departureMinutes !== stop.arrivalMinutes) {
        points.push({ x: xFor(stop.departureMinutes), y: row.y });
      }
    }
  }
  return points;
}

function buildTimeLines(start: number, end: number): number[] {
  const span = Math.max(1, end - start);
  const step = span > 600 ? 60 : span > 300 ? 30 : span > 120 ? 15 : 10;
  const first = Math.max(0, Math.ceil(start / step) * step);
  const lines: number[] = [];
  for (let minutes = first; minutes <= end; minutes += step) {
    lines.push(minutes);
  }
  return lines;
}

function clampViewportStart(value: number): number {
  return Math.min(Math.max(value, -120), 24 * 60);
}
