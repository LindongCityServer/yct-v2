'use client';

import type { MouseEvent, ReactNode } from 'react';

export interface EmbeddedMapLocationMarker {
  coordinate: [number, number];
  id: string;
  label: string;
  tone?: 'bound' | 'default' | 'nearby' | 'road' | 'same-category' | 'station';
}

interface CoordinateBounds {
  maxX: number;
  maxZ: number;
  minX: number;
  minZ: number;
}

interface VisibleTile {
  displaySize: number;
  id: string;
  left: number;
  top: number;
  url: string;
}

const stageWidth = 260;
const stageHeight = 160;
const stagePadding = 18;

export function EmbeddedMapLocationPicker({
  ariaLabel,
  emptyContent,
  footer,
  markers = [],
  onChange,
  originalValue,
  referenceValue,
  tileTemplate,
  value,
}: Readonly<{
  ariaLabel: string;
  emptyContent?: ReactNode;
  footer?: ReactNode;
  markers?: EmbeddedMapLocationMarker[];
  onChange: (coordinate: [number, number]) => void;
  originalValue?: [number, number] | null;
  referenceValue?: [number, number] | null;
  tileTemplate?: string | null;
  value: [number, number] | null;
}>) {
  const fallbackCoordinate =
    value ?? originalValue ?? referenceValue ?? markers[0]?.coordinate ?? null;
  if (!fallbackCoordinate) {
    return (
      <div className="embedded-map-location-picker is-empty">
        {emptyContent ?? <span>请先输入坐标或选择一个参考地点。</span>}
      </div>
    );
  }

  const coordinates = [
    fallbackCoordinate,
    ...(originalValue ? [originalValue] : []),
    ...(referenceValue ? [referenceValue] : []),
    ...markers.map((marker) => marker.coordinate),
  ];
  const bounds = expandBounds(getCoordinateBounds(coordinates), 120);
  const tiles = buildVisibleTiles(bounds, tileTemplate ?? null);
  const project = (coordinate: [number, number]) => projectCoordinate(coordinate, bounds);
  const handlePick = (event: MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const point: [number, number] = [
      ((event.clientX - rect.left) / rect.width) * stageWidth,
      ((event.clientY - rect.top) / rect.height) * stageHeight,
    ];
    onChange(unprojectCoordinate(point, bounds));
  };

  return (
    <button
      className="embedded-map-location-picker"
      type="button"
      aria-label={ariaLabel}
      onClick={handlePick}
    >
      <span className="embedded-map-location-picker-stage" aria-hidden="true">
        {tiles.length > 0 ? (
          <span className="embedded-map-location-picker-tiles">
            {tiles.map((tile) => (
              <img
                draggable={false}
                key={tile.id}
                loading="lazy"
                onError={(event) => {
                  event.currentTarget.style.visibility = 'hidden';
                }}
                src={tile.url}
                style={{
                  height: `${(tile.displaySize / stageHeight) * 100}%`,
                  left: `${(tile.left / stageWidth) * 100}%`,
                  top: `${(tile.top / stageHeight) * 100}%`,
                  width: `${(tile.displaySize / stageWidth) * 100}%`,
                }}
              />
            ))}
          </span>
        ) : null}
        <svg viewBox={`0 0 ${stageWidth} ${stageHeight}`}>
          <rect
            className="embedded-map-location-picker-grid"
            x="0"
            y="0"
            width={stageWidth}
            height={stageHeight}
          />
          {markers.map((marker) => {
            const point = project(marker.coordinate);
            return (
              <circle
                className={`embedded-map-location-picker-context is-${marker.tone ?? 'default'}`}
                cx={point[0]}
                cy={point[1]}
                key={marker.id}
                r={marker.tone === 'bound' ? 5 : 4}
              >
                <title>{marker.label}</title>
              </circle>
            );
          })}
          {referenceValue ? (
            <circle
              className="embedded-map-location-picker-reference"
              cx={project(referenceValue)[0]}
              cy={project(referenceValue)[1]}
              r="6"
            />
          ) : null}
          {originalValue ? (
            <circle
              className="embedded-map-location-picker-original"
              cx={project(originalValue)[0]}
              cy={project(originalValue)[1]}
              r="6"
            />
          ) : null}
          <circle
            className="embedded-map-location-picker-current"
            cx={project(value ?? fallbackCoordinate)[0]}
            cy={project(value ?? fallbackCoordinate)[1]}
            r="5"
          />
        </svg>
      </span>
      {footer ? <span className="embedded-map-location-picker-footer">{footer}</span> : null}
    </button>
  );
}

export function projectEmbeddedMapCoordinate(
  coordinate: [number, number],
  bounds: CoordinateBounds,
): [number, number] {
  return projectCoordinate(coordinate, bounds);
}

export function unprojectEmbeddedMapCoordinate(
  point: [number, number],
  bounds: CoordinateBounds,
): [number, number] {
  return unprojectCoordinate(point, bounds);
}

function getCoordinateBounds(coordinates: Array<[number, number]>): CoordinateBounds {
  return coordinates.reduce(
    (bounds, [x, z]) => ({
      maxX: Math.max(bounds.maxX, x),
      maxZ: Math.max(bounds.maxZ, z),
      minX: Math.min(bounds.minX, x),
      minZ: Math.min(bounds.minZ, z),
    }),
    {
      maxX: Number.NEGATIVE_INFINITY,
      maxZ: Number.NEGATIVE_INFINITY,
      minX: Number.POSITIVE_INFINITY,
      minZ: Number.POSITIVE_INFINITY,
    },
  );
}

function expandBounds(bounds: CoordinateBounds, padding: number): CoordinateBounds {
  return {
    maxX: bounds.maxX + padding,
    maxZ: bounds.maxZ + padding,
    minX: bounds.minX - padding,
    minZ: bounds.minZ - padding,
  };
}

function projectCoordinate(
  coordinate: [number, number],
  bounds: CoordinateBounds,
): [number, number] {
  const view = buildView(bounds);
  return [
    stageWidth / 2 + (coordinate[0] - view.centerX) * view.scale,
    stageHeight / 2 + (coordinate[1] - view.centerZ) * view.scale,
  ];
}

function unprojectCoordinate(point: [number, number], bounds: CoordinateBounds): [number, number] {
  const view = buildView(bounds);
  return [
    view.centerX + (point[0] - stageWidth / 2) / view.scale,
    view.centerZ + (point[1] - stageHeight / 2) / view.scale,
  ];
}

function buildView(bounds: CoordinateBounds): {
  centerX: number;
  centerZ: number;
  scale: number;
  zoom: number;
} {
  const spanX = Math.max(1, bounds.maxX - bounds.minX);
  const spanZ = Math.max(1, bounds.maxZ - bounds.minZ);
  const scale = Math.min(
    (stageWidth - stagePadding * 2) / spanX,
    (stageHeight - stagePadding * 2) / spanZ,
  );
  return {
    centerX: (bounds.minX + bounds.maxX) / 2,
    centerZ: (bounds.minZ + bounds.maxZ) / 2,
    scale,
    zoom: Math.log2(scale),
  };
}

function buildVisibleTiles(bounds: CoordinateBounds, tileTemplate: string | null): VisibleTile[] {
  if (!tileTemplate) {
    return [];
  }

  const view = buildView(bounds);
  const tileZoom = Math.min(3, Math.max(-7, Math.round(view.zoom)));
  const tileScale = 2 ** tileZoom;
  const tileSize = 256;
  const displaySize = tileSize * (view.scale / tileScale);
  const worldMinX = view.centerX - stageWidth / (2 * view.scale);
  const worldMaxX = view.centerX + stageWidth / (2 * view.scale);
  const worldMinZ = view.centerZ - stageHeight / (2 * view.scale);
  const worldMaxZ = view.centerZ + stageHeight / (2 * view.scale);
  const minTileX = Math.floor((worldMinX * tileScale) / tileSize) - 1;
  const maxTileX = Math.floor((worldMaxX * tileScale) / tileSize) + 1;
  const minTileZ = Math.floor((worldMinZ * tileScale) / tileSize) - 1;
  const maxTileZ = Math.floor((worldMaxZ * tileScale) / tileSize) + 1;
  const tiles: VisibleTile[] = [];

  for (let tileX = minTileX; tileX <= maxTileX; tileX += 1) {
    for (let tileZ = minTileZ; tileZ <= maxTileZ; tileZ += 1) {
      tiles.push({
        displaySize,
        id: `${tileZoom}:${tileX}:${tileZ}`,
        left:
          stageWidth / 2 + (tileX * tileSize * view.scale) / tileScale - view.centerX * view.scale,
        top:
          stageHeight / 2 + (tileZ * tileSize * view.scale) / tileScale - view.centerZ * view.scale,
        url: buildTileUrl(tileTemplate, tileZoom, tileX, tileZ),
      });
    }
  }

  return tiles;
}

function buildTileUrl(template: string, zoom: number, tileX: number, tileZ: number): string {
  return template
    .replaceAll('{z}', String(zoom))
    .replaceAll('{xd}', String(Math.floor(tileX / 10)))
    .replaceAll('{yd}', String(Math.floor(tileZ / 10)))
    .replaceAll('{x}', String(tileX))
    .replaceAll('{y}', String(tileZ));
}
