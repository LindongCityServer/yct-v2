'use client';

import type { ReactElement } from 'react';
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

  return (
    <section
      className="map-measure-panel"
      role="region"
      aria-label={t('map.measure.panelAria')}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <header className="map-measure-header">
        <span>
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

      <div className="map-measure-actions">
        <button
          className="map-measure-button is-primary"
          type="button"
          disabled={locked}
          onClick={onAddPoint}
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            add_location_alt
          </span>
          <span>{t('map.measure.addPoint')}</span>
        </button>
        <button
          className="map-measure-button"
          type="button"
          disabled={locked || !hasConfirmedPoints}
          onClick={onUndo}
        >
          {t('map.measure.undo')}
        </button>
        <button
          className="map-measure-button"
          type="button"
          disabled={!hasConfirmedPoints}
          onClick={onClear}
        >
          {t('map.measure.clear')}
        </button>
        {mode === 'area' ? (
          locked ? (
            <button className="map-measure-button" type="button" onClick={onRestart}>
              {t('map.measure.restart')}
            </button>
          ) : (
            <button
              className="map-measure-button"
              type="button"
              disabled={!validation.valid}
              onClick={onFinish}
            >
              {t('map.measure.finish')}
            </button>
          )
        ) : null}
        <button className="map-measure-button" type="button" onClick={onExit}>
          {t('map.measure.exit')}
        </button>
      </div>

      <p className="map-measure-hint">{hint}</p>

      <div className="map-measure-results" aria-live="polite">
        {mode === 'distance' ? (
          <>
            {segments.length > 0 ? (
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
            ) : null}
            <strong>{t('map.measure.total', { value: formatDistance(totalDistance) })}</strong>
          </>
        ) : (
          <>
            <strong>
              {t('map.measure.perimeter', {
                value: formatDistance(points.length >= 2 ? getMeasurePerimeter(points) : 0),
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
