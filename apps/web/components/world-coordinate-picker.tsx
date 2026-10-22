'use client';

import type { ReactNode } from 'react';
import { useI18n } from '../lib/client-i18n';
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
  yPlaceholder,
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
  const { t } = useI18n();
  const currentCoordinate = parseCoordinate(value.x, value.z);
  const update = (key: keyof WorldCoordinateDraft, nextValue: string) =>
    onChange({ ...value, [key]: nextValue });

  return (
    <fieldset className="world-coordinate-picker" disabled={disabled}>
      <legend>{t('worldCoordinate.title')}</legend>
      <div className="world-coordinate-picker-fields">
        {(['x', 'y', 'z'] as const).map((axis) => (
          <label key={axis}>
            <span>{t('worldCoordinate.axis', { axis: axis.toUpperCase() })}</span>
            <input
              type="number"
              step="any"
              inputMode="decimal"
              value={value[axis]}
              placeholder={
                axis === 'y' ? (yPlaceholder ?? t('worldCoordinate.yPlaceholder')) : undefined
              }
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
            ? t('worldCoordinate.footerPick', {
                coordinate: formatCoordinate(currentCoordinate),
                y: value.y.trim() || t('worldCoordinate.yInherited'),
              })
            : t('worldCoordinate.footerEmpty')
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
