'use client';

import type { MapMarkerSnapshot } from '@yct/contracts';
import { useEffect, useMemo, useState } from 'react';
import { appPath } from '../lib/app-paths';
import { useI18n } from '../lib/client-i18n';

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
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const { t } = useI18n();

  useEffect(() => {
    let cancelled = false;
    void fetch(appPath('/api/map/markers'), { cache: 'no-store' })
      .then(async (response) => {
        const data = (await response.json()) as MarkerResponse;
        if (!response.ok || !data.snapshot) {
          throw new Error(data.message ?? '');
        }
        if (!cancelled) {
          setMarkers(data.snapshot.markers);
          setLoadState('ready');
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : '');
          setLoadState('error');
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

  const statusText =
    loadState === 'loading'
      ? t('contentPoiBinding.loading')
      : loadState === 'error'
        ? errorMessage || t('contentPoiBinding.unavailable')
        : '';

  return (
    <fieldset className="content-poi-binding-editor">
      <legend>{t('contentPoiBinding.title')}</legend>
      <p className="muted">{t('contentPoiBinding.hint')}</p>
      {selectedMarkers.length > 0 ? (
        <div
          className="content-poi-binding-selected"
          aria-label={t('contentPoiBinding.selectedAria')}
        >
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
        placeholder={t('contentPoiBinding.searchPlaceholder')}
        aria-label={t('contentPoiBinding.searchAria')}
      />
      {statusText ? <small className="muted">{statusText}</small> : null}
      <div
        className="content-poi-binding-options"
        role="listbox"
        aria-label={t('contentPoiBinding.optionsAria')}
      >
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
        {loadState === 'ready' && filteredMarkers.length === 0 ? (
          <p className="muted">{t('contentPoiBinding.empty')}</p>
        ) : null}
      </div>
    </fieldset>
  );
}
