'use client';

import type { ReactNode } from 'react';
import {
  EmbeddedMapLocationPicker,
  type EmbeddedMapLocationMarker,
} from './embedded-map-location-picker';

export interface WorldCoordinateDraft {
  x: string;
  y: string;
  z: string;
}

export function WorldCoordinatePicker({
  actions,
  ariaLabel,
  disabled = false,
  emptyContent,
  freshTileTemplate,
  markers = [],
  onChange,
  originalValue,
  referenceValue,
  tileTemplate,
  value,
  yPlaceholder = '留空继承地图默认高度',
}: Readonly<{
  actions?: ReactNode;
  ariaLabel: string;
  disabled?: boolean;
  emptyContent?: ReactNode;
  freshTileTemplate?: string | null;
  markers?: EmbeddedMapLocationMarker[];
  onChange: (value: WorldCoordinateDraft) => void;
  originalValue?: [number, number] | null;
  referenceValue?: [number, number] | null;
  tileTemplate?: string | null;
  value: WorldCoordinateDraft;
  yPlaceholder?: string;
}>) {
  const currentCoordinate = parseCoordinate(value.x, value.z);
  const update = (key: keyof WorldCoordinateDraft, nextValue: string) =>
    onChange({ ...value, [key]: nextValue });

  return (
    <fieldset className="world-coordinate-picker" disabled={disabled}>
      <legend>世界坐标</legend>
      <div className="world-coordinate-picker-fields">
        {(['x', 'y', 'z'] as const).map((axis) => (
          <label key={axis}>
            <span>{axis.toUpperCase()} 坐标</span>
            <input
              type="number"
              step="any"
              inputMode="decimal"
              value={value[axis]}
              placeholder={axis === 'y' ? yPlaceholder : undefined}
              onChange={(event) => update(axis, event.currentTarget.value)}
            />
          </label>
        ))}
      </div>
      <EmbeddedMapLocationPicker
        ariaLabel={ariaLabel}
        emptyContent={emptyContent}
        footer={
          currentCoordinate
            ? `点击地图回填 X/Z · 当前 ${formatCoordinate(currentCoordinate)} · Y ${value.y.trim() || '继承默认值'}`
            : '请先输入 X/Z 或选择参考地点；Y 可在上方独立填写'
        }
        markers={markers}
        onChange={([x, z]) =>
          onChange({
            ...value,
            x: String(roundCoordinate(x)),
            z: String(roundCoordinate(z)),
          })
        }
        originalValue={originalValue}
        referenceValue={referenceValue}
        freshTileTemplate={freshTileTemplate}
        tileTemplate={tileTemplate}
        value={currentCoordinate}
      />
      {actions ? <div className="admin-poi-geometry-map-controls">{actions}</div> : null}
    </fieldset>
  );
}

function parseCoordinate(xValue: string, zValue: string): [number, number] | null {
  if (!xValue.trim() || !zValue.trim()) {
    return null;
  }
  const x = Number(xValue);
  const z = Number(zValue);
  return Number.isFinite(x) && Number.isFinite(z) ? [x, z] : null;
}

function roundCoordinate(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function formatCoordinate([x, z]: [number, number]): string {
  return `X ${roundCoordinate(x)} / Z ${roundCoordinate(z)}`;
}
