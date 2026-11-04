'use client';

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
} from 'react';
import type { CommonMessageKey } from '../lib/client-i18n';
import type { MapCoordinate } from '../lib/map-spatial';
import {
  formatMeasureValue,
  getMeasurePerimeter,
  getMeasureSegmentDistances,
  type MapMeasureAreaReason,
  type MapMeasureAreaValidation,
  type MapMeasureMode,
} from '../lib/map-measure';
import { SegmentedControl } from './segmented-control';

type Translate = (key: CommonMessageKey, values?: Record<string, string | number>) => string;

const distanceKilometerThreshold = 1000;
const areaHectareThreshold = 10_000;
const squareBlocksPerHectare = 10_000;
/** 拖动时面板与视口边缘的最小留白。 */
const dragViewportInset = 8;
/** 小于该位移视为点击，不写入拖动位置，避免轻微抖动改变布局。 */
const dragActivationDistance = 3;

interface MeasurePanelPosition {
  left: number;
  top: number;
}

interface DragState {
  offsetX: number;
  offsetY: number;
  originX: number;
  originY: number;
  pointerId: number;
  startLeft: number;
  startTop: number;
}

export function MapMeasurePanel({
  mode,
  points,
  locked,
  validation,
  notice,
  t,
  onAddPoint,
  onChangeMode,
  onClear,
  onExit,
  onFinish,
  onRestart,
  onUndo,
}: Readonly<{
  mode: MapMeasureMode;
  points: MapCoordinate[];
  locked: boolean;
  validation: MapMeasureAreaValidation;
  notice: string;
  t: Translate;
  onAddPoint: () => void;
  onChangeMode: (mode: MapMeasureMode) => void;
  onClear: () => void;
  onExit: () => void;
  onFinish: () => void;
  onRestart: () => void;
  onUndo: () => void;
}>): ReactElement {
  const segments = getMeasureSegmentDistances(points);
  const totalDistance = segments.reduce((total, value) => total + value, 0);
  const hasConfirmedPoints = points.length > 0;
  const panelRef = useRef<HTMLElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const [position, setPosition] = useState<MeasurePanelPosition | null>(null);

  const formatDistance = (value: number): string =>
    value >= distanceKilometerThreshold
      ? t('map.hud.scale.kilometers', { value: formatMeasureValue(value / 1000) })
      : t('map.hud.scale.blocks', { value: formatMeasureValue(value) });

  const formatArea = (value: number): string =>
    value >= areaHectareThreshold
      ? t('map.measure.unit.hectares', {
          value: formatMeasureValue(value / squareBlocksPerHectare),
        })
      : t('map.measure.unit.squareBlocks', { value: formatMeasureValue(value) });

  const formatAreaReason = (reason: MapMeasureAreaReason): string => {
    if (reason === 'duplicatePoint') {
      return t('map.measure.invalid.duplicate');
    }
    if (reason === 'collinear') {
      return t('map.measure.invalid.collinear');
    }
    if (reason === 'selfIntersecting') {
      return t('map.measure.invalid.selfIntersecting');
    }
    return t('map.measure.points.areaNeed');
  };

  const hint = notice
    ? notice
    : locked
      ? t('map.measure.finished')
      : !hasConfirmedPoints
        ? t('map.measure.hint')
        : mode === 'distance' && points.length === 1
          ? t('map.measure.points.distanceNeed')
          : mode === 'area' && points.length < 3
            ? t('map.measure.points.areaNeed')
            : t('map.measure.hint');

  // 窗口尺寸变化后把面板拉回可视范围，避免拖动位置在旋转屏幕后跑到视口外。
  useEffect(() => {
    if (!position) {
      return undefined;
    }
    const clampPosition = () => {
      setPosition((current) => (current ? clampPanelPosition(panelRef.current, current) : current));
    };
    window.addEventListener('resize', clampPosition);
    return () => window.removeEventListener('resize', clampPosition);
  }, [position]);

  const handleDragStart = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0 || (event.target as Element).closest('button')) {
      return;
    }
    const panel = panelRef.current;
    const parent = panel?.offsetParent;
    if (!panel || !(parent instanceof HTMLElement)) {
      return;
    }
    const panelRect = panel.getBoundingClientRect();
    const parentRect = parent.getBoundingClientRect();
    dragRef.current = {
      offsetX: event.clientX - panelRect.left,
      offsetY: event.clientY - panelRect.top,
      originX: event.clientX,
      originY: event.clientY,
      pointerId: event.pointerId,
      startLeft: panelRect.left - parentRect.left,
      startTop: panelRect.top - parentRect.top,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  };

  const handleDragMove = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    if (
      Math.abs(event.clientX - drag.originX) < dragActivationDistance &&
      Math.abs(event.clientY - drag.originY) < dragActivationDistance
    ) {
      return;
    }
    const parent = panelRef.current?.offsetParent;
    if (!(parent instanceof HTMLElement)) {
      return;
    }
    const parentRect = parent.getBoundingClientRect();
    setPosition(
      clampPanelPosition(panelRef.current, {
        left: event.clientX - parentRect.left - drag.offsetX,
        top: event.clientY - parentRect.top - drag.offsetY,
      }),
    );
    event.preventDefault();
    event.stopPropagation();
  };

  const handleDragEnd = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <section
      ref={panelRef}
      className={position ? 'map-measure-panel is-positioned' : 'map-measure-panel'}
      role="region"
      aria-label={t('map.measure.panelAria')}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      style={
        position
          ? {
              left: `${position.left}px`,
              top: `${position.top}px`,
              bottom: 'auto',
              transform: 'none',
            }
          : undefined
      }
    >
      <header
        className="map-measure-header"
        title={t('map.measure.dragHint')}
        onPointerDown={handleDragStart}
        onPointerMove={handleDragMove}
        onPointerUp={handleDragEnd}
        onPointerCancel={handleDragEnd}
      >
        <span>
          <span className="material-symbols-outlined is-grip" aria-hidden="true">
            open_with
          </span>
          <span className="material-symbols-outlined" aria-hidden="true">
            straighten
          </span>
          <strong>{t('map.measure.panelAria')}</strong>
        </span>
        <button
          className="icon-action-button"
          type="button"
          aria-label={t('map.measure.exit')}
          onClick={onExit}
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            close
          </span>
        </button>
      </header>

      <SegmentedControl
        className="map-measure-mode"
        ariaLabel={t('map.measure.modeAria')}
        value={mode}
        onChange={(value) => onChangeMode(value as MapMeasureMode)}
        options={[
          { value: 'distance', label: t('map.measure.mode.distance') },
          { value: 'area', label: t('map.measure.mode.area') },
        ]}
      />

      <div className="map-measure-actions" role="toolbar" aria-label={t('map.measure.panelAria')}>
        <button
          className="map-measure-button is-primary"
          type="button"
          disabled={locked}
          aria-label={t('map.measure.addPoint')}
          title={t('map.measure.addPoint')}
          onClick={onAddPoint}
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            add_location_alt
          </span>
        </button>
        <span className="map-measure-divider" aria-hidden="true" />
        <button
          className="map-measure-button"
          type="button"
          disabled={locked || !hasConfirmedPoints}
          aria-label={t('map.measure.undo')}
          title={t('map.measure.undo')}
          onClick={onUndo}
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            undo
          </span>
        </button>
        <button
          className="map-measure-button"
          type="button"
          disabled={!hasConfirmedPoints}
          aria-label={t('map.measure.clear')}
          title={t('map.measure.clear')}
          onClick={onClear}
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            delete_sweep
          </span>
        </button>
        {mode === 'area' ? (
          locked ? (
            <button
              className="map-measure-button"
              type="button"
              aria-label={t('map.measure.restart')}
              title={t('map.measure.restart')}
              onClick={onRestart}
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                refresh
              </span>
            </button>
          ) : (
            <button
              className="map-measure-button"
              type="button"
              disabled={!validation.valid}
              aria-label={t('map.measure.finish')}
              title={t('map.measure.finish')}
              onClick={onFinish}
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                check
              </span>
            </button>
          )
        ) : null}
        <span className="map-measure-divider" aria-hidden="true" />
        <button
          className="map-measure-button"
          type="button"
          aria-label={t('map.measure.exit')}
          title={t('map.measure.exit')}
          onClick={onExit}
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            close
          </span>
        </button>
      </div>

      <p className="map-measure-hint">{hint}</p>

      <div className="map-measure-results" aria-live="polite">
        {mode === 'distance' ? (
          <>
            <strong>{t('map.measure.total', { value: formatDistance(totalDistance) })}</strong>
            {segments.length > 0 ? (
              <details className="map-measure-segments">
                <summary>
                  {t('map.measure.segments', { count: segments.length })}
                  <span className="material-symbols-outlined" aria-hidden="true">
                    expand_more
                  </span>
                </summary>
                <ul className="map-measure-segment-list">
                  {segments.map((value, index) => (
                    <li key={`segment-${index}`}>
                      {t('map.measure.segment', {
                        index: index + 1,
                        value: formatDistance(value),
                      })}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </>
        ) : (
          <>
            <strong>
              {t('map.measure.perimeter', {
                value: formatDistance(points.length >= 3 ? getMeasurePerimeter(points) : 0),
              })}
            </strong>
            {validation.valid ? (
              <strong>
                {t('map.measure.area', { value: formatArea(validation.summary.area) })}
              </strong>
            ) : null}
            {!validation.valid && points.length >= 3 ? (
              <p className="map-measure-warning">{formatAreaReason(validation.reason)}</p>
            ) : null}
          </>
        )}
        <p className="map-measure-note">{t('map.measure.projectionNote')}</p>
      </div>
    </section>
  );
}

/** 将面板位置限制在父容器可视范围内；父容器缺失时退回窗口尺寸。 */
function clampPanelPosition(
  panel: HTMLElement | null,
  position: MeasurePanelPosition,
): MeasurePanelPosition {
  const parent = panel?.offsetParent;
  const parentWidth = parent instanceof HTMLElement ? parent.clientWidth : window.innerWidth;
  const parentHeight = parent instanceof HTMLElement ? parent.clientHeight : window.innerHeight;
  const panelWidth = panel?.offsetWidth ?? 0;
  const panelHeight = panel?.offsetHeight ?? 0;
  const maxLeft = Math.max(dragViewportInset, parentWidth - panelWidth - dragViewportInset);
  const maxTop = Math.max(dragViewportInset, parentHeight - panelHeight - dragViewportInset);

  return {
    left: Math.min(Math.max(position.left, dragViewportInset), maxLeft),
    top: Math.min(Math.max(position.top, dragViewportInset), maxTop),
  };
}
