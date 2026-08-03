'use client';

import type { MapMarkerSnapshot } from '@yct/contracts';
import { useEffect, useMemo, useState } from 'react';
import { appPath } from '../lib/app-paths';

interface MarkerResponse {
  snapshot?: MapMarkerSnapshot;
}

export function OperationRelatedPois({ markerIds }: Readonly<{ markerIds?: string[] }>) {
  const ids = useMemo(() => Array.from(new Set(markerIds ?? [])).filter(Boolean), [markerIds]);
  const [markers, setMarkers] = useState<MapMarkerSnapshot['markers']>([]);

  useEffect(() => {
    if (ids.length === 0) {
      return;
    }
    let cancelled = false;
    void fetch(appPath('/api/map/markers'), { cache: 'no-store' })
      .then((response) => response.json() as Promise<MarkerResponse>)
      .then((data) => {
        if (!cancelled && data.snapshot) {
          setMarkers(data.snapshot.markers);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [ids]);

  const markerById = useMemo(
    () => new Map(markers.map((marker) => [marker.id, marker])),
    [markers],
  );
  if (ids.length === 0) {
    return null;
  }

  return (
    <section className="operation-related-pois" aria-labelledby="operation-related-pois-title">
      <div className="section-heading">
        <h2 id="operation-related-pois-title">相关地点</h2>
        <span className="muted">{ids.length} 个 POI</span>
      </div>
      <div className="operation-related-poi-list">
        {ids.map((id) => {
          const marker = markerById.get(id);
          return (
            <a
              className="operation-related-poi-link"
              href={appPath(`/map?marker=${encodeURIComponent(id)}`)}
              key={id}
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                location_on
              </span>
              <span>
                <strong>{marker?.label ?? '地图地点'}</strong>
                <small>{marker?.address ?? id}</small>
              </span>
              <span className="material-symbols-outlined" aria-hidden="true">
                arrow_outward
              </span>
            </a>
          );
        })}
      </div>
    </section>
  );
}
