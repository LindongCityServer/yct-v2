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

/** 右侧站名区宽度；站名贴在可见绘图区右边缘并右对齐。 */
const stationLabelWidth = 132;
/** 顶部时间刻度带高度。 */
const axisHeaderHeight = 26;
/** 底部默认留白，避开右下角的缩放按钮。 */
const defaultBottomInset = 56;
const longPressDelay = 500;

/**
 * 主工作台与运行图共用的布局：顶部留出标题栏与时间刻度，底部留出缩放条。
 * 画布本身铺满窗口，坐标轴贴可见区边缘，滚动边界仍以可见绘图区为准。
 */
export function resolveTransitTripRunChartLayout(input: {
  topInset: number;
  bottomInset?: number;
}) {
  return {
    top: input.topInset + axisHeaderHeight,
    bottom: input.bottomInset ?? defaultBottomInset,
  };
}

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
  bottomInset,
  height,
  leftGutter,
  linkMode,
  rightInset,
  rows,
  selectedTripId,
  stationOffset,
  stationScale,
  tool,
  topInset,
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
  /** 底部留白；默认避开右下角缩放条。 */
  bottomInset?: number;
  height: number;
  /** 可见绘图区左边界；桌面端为图层树宽度，移动端为小留白。 */
  leftGutter?: number;
  linkMode: WorkbenchLinkMode;
  /** 可见绘图区右边界；桌面端为属性面板宽度，站名画在它左侧。 */
  rightInset?: number;
  rows: WorkbenchStationRow[];
  selectedTripId: string | null;
  stationOffset: number;
  stationScale: number;
  tool: WorkbenchTool;
  /** 标题栏高度；时间刻度贴在这条线下方。 */
  topInset?: number;
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
  /** 点中任意班次端点时直接选中该班次，并回传停站下标供属性检查器同步。 */
  onSelectTrip?: (tripId: string, stopIndex?: number) => void;
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

  // 坐标轴贴可见区域边缘，折线与网格铺满整个窗口（含标题栏与面板下方）。
  const axisLeft = leftGutter ?? 16;
  const axisRight = width - (rightInset ?? 16);
  const axisTop = topInset ?? 0;
  const axisBottom = height - (bottomInset ?? defaultBottomInset);
  // 站点轴的有效可视高度：扣掉标题栏与底部缩放条，与父组件的 stationOffset 边界一致。
  const stationContentHeight = Math.max(80, axisBottom - (axisTop + axisHeaderHeight));
  const plotWidth = Math.max(1, width);
  const plotHeight = Math.max(1, height);
  const stationLabelX = axisRight - 12;
  const xFor = useCallback(
    (minutes: number) => ((minutes - viewport.start) / viewport.duration) * plotWidth,
    [plotWidth, viewport.duration, viewport.start],
  );
  const minutesFor = useCallback(
    (x: number) => viewport.start + (x / plotWidth) * viewport.duration,
    [plotWidth, viewport.duration, viewport.start],
  );
  const rowByName = useMemo(() => new Map(rows.map((row) => [row.stationName, row])), [rows]);
  const timeLines = useMemo(
    () => buildTimeLines(viewport.start, viewport.start + viewport.duration, plotWidth),
    [viewport.duration, viewport.start, plotWidth],
  );
  // 刻度只显示在可见红框内，但位置仍按全窗口时间映射，保证与折线一致。
  const visibleTimeLines = useMemo(
    () =>
      timeLines.filter((minutes) => {
        const x = xFor(minutes);
        return x >= axisLeft && x <= axisRight;
      }),
    [axisLeft, axisRight, timeLines, xFor],
  );
  // 站点密集时按最终像素间距抽稀站名，保证文字不重叠。
  const visibleStationLabels = useMemo(() => {
    const labels: WorkbenchStationRow[] = [];
    let lastY = Number.NEGATIVE_INFINITY;
    for (const row of rows) {
      if (row.y < axisTop - 2 || row.y > axisBottom + 2) {
        continue;
      }
      if (row.y - lastY < 18) {
        continue;
      }
      labels.push(row);
      lastY = row.y;
    }
    return labels;
  }, [axisBottom, axisTop, rows]);

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
      onSelectTrip?.(hitTripId, stopIndex);
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
      // 平移边界由父组件按可见区计算，这里只上报原始位移。
      onViewportChange({
        start: drag.startViewportStart + deltaMinutes,
        duration: viewport.duration,
      });
      // 纵向拖动同步平移站点轴，放大后才能看到远处的站。
      const maxOffset = Math.max(0, stationContentHeight * (stationScale - 1));
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
      const anchor = stationContentHeight / 2;
      const nextOffset = (stationOffset + anchor) * (nextScale / stationScale) - anchor;
      const maxOffset = Math.max(0, stationContentHeight * (nextScale - 1));
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
    const ratio = x / plotWidth;
    // 平移边界由父组件按可见区计算，这里只上报缩放后的锚点时刻。
    onViewportChange({
      start: anchorMinutes - ratio * duration,
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
        {rows.map((row, index) => (
          <rect
            className={index % 2 === 0 ? 'transit-trip-run-band' : 'transit-trip-run-band is-alt'}
            key={`band-${row.stationSourceId}`}
            x={0}
            y={row.bandTop}
            width={width}
            height={Math.max(0, row.bandBottom - row.bandTop)}
          />
        ))}
        {/* 顶部时间刻度带与右侧站名带：坐标贴可见边缘并带底色，保证叠在运行图上仍可读。 */}
        <rect
          className="transit-trip-run-axis-band"
          x={axisLeft}
          y={axisTop}
          width={Math.max(0, axisRight - axisLeft)}
          height={axisHeaderHeight}
        />
        <rect
          className="transit-trip-run-station-band"
          x={axisRight - stationLabelWidth}
          y={axisTop}
          width={stationLabelWidth}
          height={Math.max(0, axisBottom - axisTop)}
        />
        {visibleTimeLines.map((minutes) => (
          <line
            className={
              minutes % 60 === 0
                ? 'transit-trip-run-time-line is-hour'
                : 'transit-trip-run-time-line'
            }
            key={`time-${minutes}`}
            x1={xFor(minutes)}
            x2={xFor(minutes)}
            y1={0}
            y2={height}
          />
        ))}
        {rows.map((row) => (
          <line
            className="transit-trip-run-station-line"
            key={`station-line-${row.stationSourceId}`}
            x1={0}
            x2={width}
            y1={row.y}
            y2={row.y}
          />
        ))}
        <g>
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
                        <line x1={0} x2={first.x} y1={first.y} y2={first.y} />
                      )}
                      {(linkMode === 'after' || linkMode === 'all') && (
                        <line x1={last.x} x2={width} y1={last.y} y2={last.y} />
                      )}
                    </g>
                  );
                })
            : null}
          {/* 坐标文字画在折线与节点之后，避免被班次线条盖住。 */}
          {visibleTimeLines.map((minutes) => (
            <text
              className="transit-trip-run-time-label"
              key={`time-label-${minutes}`}
              x={xFor(minutes)}
              y={axisTop + 17}
              textAnchor="middle"
            >
              {formatWorkbenchMinutes(minutes)}
            </text>
          ))}
          {visibleStationLabels.map((row) => (
            <text
              className="transit-trip-run-station-label"
              key={`station-label-${row.stationSourceId}`}
              x={stationLabelX}
              y={row.y + 4}
              textAnchor="end"
            >
              {row.stationName}
            </text>
          ))}
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

/** 按最终像素间距挑选时间刻度步长，保证标签不重叠。 */
function buildTimeLines(start: number, end: number, plotWidth: number): number[] {
  const span = Math.max(1, end - start);
  const pxPerMinute = Math.max(0.001, plotWidth / span);
  const steps = [5, 10, 15, 20, 30, 60, 120, 180, 240, 360, 720];
  const step = steps.find((candidate) => candidate * pxPerMinute >= 62) ?? 720;
  const first = Math.max(0, Math.ceil(start / step) * step);
  const lines: number[] = [];
  for (let minutes = first; minutes <= end; minutes += step) {
    lines.push(minutes);
  }
  return lines;
}
