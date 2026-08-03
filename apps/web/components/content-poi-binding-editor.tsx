'use client';

import type { MapMarkerSnapshot } from '@yct/contracts';
import { useEffect, useMemo, useState } from 'react';
import { appPath } from '../lib/app-paths';

interface MarkerResponse {
  snapshot?: MapMarkerSnapshot;
  message?: string;
}

export function ContentPoiBindingEditor({
  selectedIds,
  onChange,
}: Readonly<{
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}>) {
  const [markers, setMarkers] = useState<MapMarkerSnapshot['markers']>([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('正在读取公开 POI');

  useEffect(() => {
    let cancelled = false;
    void fetch(appPath('/api/map/markers'), { cache: 'no-store' })
      .then(async (response) => {
        const data = (await response.json()) as MarkerResponse;
        if (!response.ok || !data.snapshot) {
          throw new Error(data.message ?? '公开 POI 暂不可用');
        }
        if (!cancelled) {
          setMarkers(data.snapshot.markers);
          setStatus('');
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setStatus(error instanceof Error ? error.message : '公开 POI 暂不可用');
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const poiMarkers = useMemo(
    () =>
      markers.filter(
        (marker) =>
          Boolean(marker.categoryId) &&
          !marker.playerLocation &&
          !marker.id.startsWith('transit-line-'),
      ),
    [markers],
  );
  const markerById = useMemo(
    () => new Map(poiMarkers.map((marker) => [marker.id, marker])),
    [poiMarkers],
  );
  const selectedMarkers = selectedIds.map((id) => markerById.get(id)).filter(Boolean);
  const filteredMarkers = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('zh-CN');
    return poiMarkers
      .filter((marker) => {
        if (!normalized) {
          return true;
        }
        return `${marker.label} ${marker.id} ${marker.address ?? ''}`
          .toLocaleLowerCase('zh-CN')
          .includes(normalized);
      })
      .slice(0, 40);
  }, [poiMarkers, query]);

  const toggle = (id: string) => {
    onChange(
      selectedIds.includes(id) ? selectedIds.filter((value) => value !== id) : [...selectedIds, id],
    );
  };

  return (
    <fieldset className="content-poi-binding-editor">
      <legend>关联 POI</legend>
      <p className="muted">只展示公开地图中的 POI；消息发布后才会在 POI 详情中生效。</p>
      {selectedMarkers.length > 0 ? (
        <div className="content-poi-binding-selected" aria-label="已关联 POI">
          {selectedMarkers.map((marker) => (
            <button type="button" key={marker!.id} onClick={() => toggle(marker!.id)}>
              <span>{marker!.label}</span>
              <span className="material-symbols-outlined" aria-hidden="true">
                close
              </span>
            </button>
          ))}
        </div>
      ) : null}
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.currentTarget.value)}
        placeholder="搜索 POI 名称、地址或 ID"
        aria-label="搜索关联 POI"
      />
      {status ? <small className="muted">{status}</small> : null}
      <div className="content-poi-binding-options" role="listbox" aria-label="可关联 POI">
        {filteredMarkers.map((marker) => {
          const selected = selectedIds.includes(marker.id);
          return (
            <button
              type="button"
              role="option"
              aria-selected={selected}
              className={selected ? 'is-selected' : ''}
              key={marker.id}
              onClick={() => toggle(marker.id)}
            >
              <span>{marker.label}</span>
              <small>{marker.address ?? marker.id}</small>
            </button>
          );
        })}
        {!status && filteredMarkers.length === 0 ? (
          <p className="muted">没有匹配的公开 POI。</p>
        ) : null}
      </div>
    </fieldset>
  );
}
