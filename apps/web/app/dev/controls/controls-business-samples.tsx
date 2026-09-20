'use client';

import { useState } from 'react';
import type { MapMarkerSnapshot } from '@yct/contracts';
import { PoiFacilityEditor } from '../../../components/poi-facility-editor';
import { WorldCoordinatePicker } from '../../../components/world-coordinate-picker';

export function ControlsBusinessSamples({
  markers,
  loaded,
}: Readonly<{
  markers: MapMarkerSnapshot['markers'];
  loaded: boolean;
}>) {
  const [markerId, setMarkerId] = useState('');
  const places = markers.filter((marker) => marker.geometry.type === 'Point');
  const selected =
    places.find((marker) => marker.id === markerId) ??
    places.find((marker) => marker.facilities?.length) ??
    places[0];
  const coordinate = selected?.geometry.type === 'Point' ? selected.geometry.coordinates : null;

  return (
    <section className="controls-card" id="controls-business">
      <h2>真实业务控件</h2>
      {selected ? (
        <>
          <label className="material-field">
            <span>公开地点</span>
            <select
              value={selected.id}
              onChange={(event) => setMarkerId(event.currentTarget.value)}
            >
              {places.map((marker) => (
                <option key={marker.id} value={marker.id}>
                  {marker.label}
                </option>
              ))}
            </select>
          </label>
          <WorldCoordinatePicker
            ariaLabel={selected.label}
            disabled
            value={{
              x: coordinate ? String(coordinate[0]) : '',
              y: '',
              z: coordinate ? String(coordinate[1]) : '',
            }}
            onChange={() => undefined}
          />
          <PoiFacilityEditor
            facilities={selected.facilities ?? []}
            disabled
            onChange={() => undefined}
          />
          {!selected.facilities?.length ? <p className="status-note">该地点暂无设施资料</p> : null}
        </>
      ) : (
        <p className="status-note">{loaded ? '暂无公开地点数据' : '尚未读取公开数据'}</p>
      )}
    </section>
  );
}
