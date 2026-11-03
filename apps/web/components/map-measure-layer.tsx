'use client';

import type { ReactElement } from 'react';
import type { MapCoordinate } from '../lib/map-spatial';
import type { MapMeasureMode } from '../lib/map-measure';

export interface MapMeasureProjectedPoint {
  left: number;
  top: number;
}

export function MapMeasureLayer({
  mode,
  points,
  previewPoint,
  locked,
  crosshair,
  project,
  viewportWidth,
  viewportHeight,
}: Readonly<{
  mode: MapMeasureMode;
  points: MapCoordinate[];
  previewPoint: MapCoordinate | null;
  locked: boolean;
  crosshair: MapMeasureProjectedPoint | null;
  project: (coordinate: MapCoordinate) => MapMeasureProjectedPoint;
  viewportWidth: number;
  viewportHeight: number;
}>): ReactElement {
  const projected = points.map(project);
  const preview = !locked && previewPoint ? project(previewPoint) : null;
  const closed = mode === 'area' ? [...projected, projected[0]!] : projected;

  return (
    <div className="map-measure-layer" aria-hidden="true">
      {projected.length >= 2 ? (
        <svg
          className="map-measure-svg"
          viewBox={`0 0 ${Math.max(1, viewportWidth)} ${Math.max(1, viewportHeight)}`}
        >
          {mode === 'area' ? (
            <polygon
              className={locked ? 'map-measure-area is-locked' : 'map-measure-area'}
              points={closed.map((point) => `${point.left},${point.top}`).join(' ')}
            />
          ) : (
            <polyline
              className="map-measure-line"
              points={closed.map((point) => `${point.left},${point.top}`).join(' ')}
            />
          )}
          {preview ? (
            <polyline
              className="map-measure-preview"
              points={[
                projected.at(-1)!,
                preview,
                ...(mode === 'area' && projected.length >= 2 ? [projected[0]!] : []),
              ]
                .map((point) => `${point.left},${point.top}`)
                .join(' ')}
            />
          ) : null}
          {projected.map((point, index) => (
            <circle
              className="map-measure-vertex"
              cx={point.left}
              cy={point.top}
              r={4}
              key={`vertex-${index}`}
            />
          ))}
        </svg>
      ) : null}
      {crosshair ? (
        <span
          className="map-measure-crosshair"
          style={{ left: `${crosshair.left}px`, top: `${crosshair.top}px` }}
        >
          <span />
        </span>
      ) : null}
    </div>
  );
}
