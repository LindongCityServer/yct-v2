'use client';

import type {
  ApiListResponse,
  MapMarkerSnapshot,
  OperationsFeedItem,
  ServiceEntryGroup,
  TravelScheduleQueryResult,
  TravelTripInstance,
} from '@yct/contracts';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { appPath } from '../lib/app-paths';
import { useI18n, type CommonMessageKey } from '../lib/client-i18n';
import { filterMapMarkers } from '../lib/map-marker-search';
import { normalizeTitleForSearch, TitleWithBreaks } from './title-with-breaks';

type SearchCategory = 'all' | 'operations' | 'poi' | 'schedules' | 'services';
type LoadStatus = 'idle' | 'loading' | 'ready' | 'unavailable';

interface MapMarkerResponse {
  snapshot?: MapMarkerSnapshot;
}

export function SearchPageClient({
  feed,
  initialQuery,
  serviceGroups,
}: Readonly<{
  feed: ApiListResponse<OperationsFeedItem>;
  initialQuery: string;
  serviceGroups: ServiceEntryGroup[];
}>) {
  const { locale, t } = useI18n();
  const [query, setQuery] = useState(initialQuery);
  const [activeCategory, setActiveCategory] = useState<SearchCategory>('all');
  const [markers, setMarkers] = useState<MapMarkerSnapshot['markers']>([]);
  const [markerStatus, setMarkerStatus] = useState<LoadStatus>('loading');
  const [scheduleResult, setScheduleResult] = useState<TravelScheduleQueryResult | null>(null);
  const [scheduleStatus, setScheduleStatus] = useState<LoadStatus>('idle');
  const trimmedQuery = query.trim();

  useEffect(() => {
    const controller = new AbortController();

    async function loadMarkers() {
      try {
        const response = await fetch(appPath('/api/map/markers'), {
          cache: 'no-store',
          signal: controller.signal,
        });
        const data = (await response.json()) as MapMarkerResponse;
        if (!response.ok || !data.snapshot) {
          setMarkerStatus('unavailable');
          return;
        }
        setMarkers(data.snapshot.markers.filter((marker) => marker.categoryId !== 'player'));
        setMarkerStatus('ready');
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setMarkerStatus('unavailable');
        }
      }
    }

    void loadMarkers();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!trimmedQuery) {
      setScheduleResult(null);
      setScheduleStatus('idle');
      return undefined;
    }

    const controller = new AbortController();
    setScheduleResult(null);
    setScheduleStatus('loading');
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: trimmedQuery, timeScope: 'all' });
        const response = await fetch(appPath(`/api/travel/schedules?${params.toString()}`), {
          cache: 'no-store',
          signal: controller.signal,
        });
        const data = (await response.json()) as TravelScheduleQueryResult;
        if (!response.ok) {
          setScheduleResult(null);
          setScheduleStatus('unavailable');
          return;
        }
        setScheduleResult(data);
        setScheduleStatus('ready');
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setScheduleResult(null);
          setScheduleStatus('unavailable');
        }
      }
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [trimmedQuery]);

  const poiResults = useMemo(
    () => (trimmedQuery ? filterMapMarkers(markers, trimmedQuery) : []),
    [markers, trimmedQuery],
  );
  const normalizedQuery = normalizeTitleForSearch(trimmedQuery);
  const operationResults = useMemo(() => {
    if (!normalizedQuery) {
      return [];
    }
    return feed.items
      .filter((item) =>
        [item.title, item.excerpt, item.categoryId, ...(item.customTags ?? [])]
          .filter(Boolean)
          .some((value) => normalizeTitleForSearch(value ?? '').includes(normalizedQuery)),
      )
      .sort((left, right) => toTime(right.publishedAt) - toTime(left.publishedAt));
  }, [feed.items, normalizedQuery]);
  const serviceResults = useMemo(() => {
    if (!normalizedQuery) {
      return [];
    }
    return serviceGroups.flatMap((group) =>
      group.items
        .filter((entry) =>
          [entry.title, entry.description, group.title, entry.href]
            .filter(Boolean)
            .some((value) => normalizeTitleForSearch(value ?? '').includes(normalizedQuery)),
        )
        .map((entry) => ({ entry, groupTitle: group.title })),
    );
  }, [normalizedQuery, serviceGroups]);
  const scheduleResults = scheduleResult?.trips ?? [];
  const totalResultCount =
    operationResults.length + poiResults.length + scheduleResults.length + serviceResults.length;
  const resultCounts: Record<SearchCategory, number> = {
    all: totalResultCount,
    operations: operationResults.length,
    poi: poiResults.length,
    schedules: scheduleResults.length,
    services: serviceResults.length,
  };
  const isLoading = markerStatus === 'loading' || scheduleStatus === 'loading';
  const hasQuery = trimmedQuery.length > 0;
  const shouldShowPoi = activeCategory === 'all' || activeCategory === 'poi';
  const shouldShowSchedules = activeCategory === 'all' || activeCategory === 'schedules';
  const shouldShowOperations = activeCategory === 'all' || activeCategory === 'operations';
  const shouldShowServices = activeCategory === 'all' || activeCategory === 'services';

  useEffect(() => {
    if (activeCategory !== 'all' && resultCounts[activeCategory] === 0) {
      setActiveCategory('all');
    }
  }, [
    activeCategory,
    resultCounts.operations,
    resultCounts.poi,
    resultCounts.schedules,
    resultCounts.services,
  ]);

  return (
    <div className="search-page-stack">
      <div className="search-box search-page-box">
        <span className="material-symbols-outlined" aria-hidden="true">
          search
        </span>
        <input
          autoFocus
          type="search"
          aria-label={t('search.placeholder')}
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder={t('search.placeholder')}
        />
        {query ? (
          <button
            className="search-clear-button"
            type="button"
            aria-label={t('search.clear')}
            onClick={() => setQuery('')}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              close
            </span>
          </button>
        ) : null}
      </div>

      <section className="module-panel search-results-panel" aria-labelledby="search-title">
        <div className="section-heading">
          <h1 id="search-title">{t('search.results')}</h1>
          {hasQuery ? (
            <span className="muted">
              {isLoading
                ? t('search.loading')
                : t('search.resultCount', { count: totalResultCount })}
            </span>
          ) : null}
        </div>

        {!hasQuery ? (
          <SearchEmpty icon="search" message={t('search.emptyPrompt')} />
        ) : totalResultCount > 0 ? (
          <>
            <div
              className="category-strip search-filter-strip"
              aria-label={t('search.resultFilters')}
            >
              {searchCategories.map((category) => (
                <button
                  className={
                    activeCategory === category.key
                      ? 'category-chip tone-primary is-active'
                      : 'category-chip tone-primary'
                  }
                  type="button"
                  disabled={resultCounts[category.key] === 0}
                  onClick={() => setActiveCategory(category.key)}
                  key={category.key}
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    {category.icon}
                  </span>
                  <span>
                    {t(category.labelKey)}
                    <small>{resultCounts[category.key]}</small>
                  </span>
                </button>
              ))}
            </div>

            <div className="search-result-groups">
              {shouldShowOperations && operationResults.length > 0 ? (
                <section className="search-result-group" aria-labelledby="search-operations-title">
                  <h2 id="search-operations-title">{t('search.resultGroup.operations')}</h2>
                  <div className="search-result-list">
                    {operationResults.map((item) => (
                      <Link
                        className="search-result-item"
                        href={appPath(`/operations/${encodeURIComponent(item.id)}`)}
                        key={item.id}
                      >
                        <span className="material-symbols-outlined" aria-hidden="true">
                          article
                        </span>
                        <span>
                          <strong>
                            <TitleWithBreaks title={item.title} segments={item.titleSegments} />
                          </strong>
                          <span className="muted">
                            {item.categoryId}
                            {item.displayDate ? ` · ${item.displayDate}` : ''}
                          </span>
                        </span>
                      </Link>
                    ))}
                  </div>
                </section>
              ) : null}

              {shouldShowPoi && poiResults.length > 0 ? (
                <section className="search-result-group" aria-labelledby="search-poi-title">
                  <h2 id="search-poi-title">{t('search.resultGroup.poi')}</h2>
                  <div className="search-result-list">
                    {poiResults.map((marker) => (
                      <Link
                        className="search-result-item"
                        href={appPath(`/map?marker=${encodeURIComponent(marker.id)}`)}
                        key={marker.id}
                      >
                        <span className="material-symbols-outlined" aria-hidden="true">
                          {marker.symbolIcon ?? 'location_on'}
                        </span>
                        <span>
                          <strong>
                            <TitleWithBreaks
                              title={
                                locale === 'zh-CN'
                                  ? marker.label
                                  : (marker.localizedLabels?.[locale] ?? marker.label)
                              }
                            />
                          </strong>
                          <span className="muted">{formatPoiSummary(marker)}</span>
                        </span>
                      </Link>
                    ))}
                  </div>
                </section>
              ) : null}

              {shouldShowSchedules && scheduleResults.length > 0 ? (
                <section className="search-result-group" aria-labelledby="search-schedules-title">
                  <h2 id="search-schedules-title">{t('search.resultGroup.schedules')}</h2>
                  <div className="search-result-list">
                    {scheduleResults.map((trip) => (
                      <Link
                        className="search-result-item"
                        href={appPath(
                          `/travel/schedules?q=${encodeURIComponent(trip.tripCode ?? trip.lineName)}`,
                        )}
                        key={trip.tripInstanceId}
                      >
                        <span className="material-symbols-outlined" aria-hidden="true">
                          departure_board
                        </span>
                        <span>
                          <strong>{formatTripTitle(trip)}</strong>
                          <span className="muted">{formatTripSummary(trip)}</span>
                        </span>
                      </Link>
                    ))}
                  </div>
                </section>
              ) : null}

              {shouldShowServices && serviceResults.length > 0 ? (
                <section className="search-result-group" aria-labelledby="search-services-title">
                  <h2 id="search-services-title">{t('search.resultGroup.services')}</h2>
                  <div className="search-result-list">
                    {serviceResults.map(({ entry, groupTitle }) => (
                      <a
                        className="search-result-item"
                        href={entry.href}
                        target={entry.openMode === 'new_tab' ? '_blank' : undefined}
                        rel={entry.openMode === 'new_tab' ? 'noreferrer' : undefined}
                        key={entry.id}
                      >
                        <span className="material-symbols-outlined" aria-hidden="true">
                          {entry.icon}
                        </span>
                        <span>
                          <strong>
                            <TitleWithBreaks title={entry.title} />
                          </strong>
                          <span className="muted">
                            {groupTitle}
                            {entry.description ? ` · ${entry.description}` : ''}
                          </span>
                        </span>
                      </a>
                    ))}
                  </div>
                </section>
              ) : null}
            </div>
          </>
        ) : isLoading ? (
          <SearchEmpty icon="progress_activity" message={t('search.loading')} />
        ) : (
          <SearchEmpty icon="inbox" message={t('search.noMatch', { query: trimmedQuery })} />
        )}

        {hasQuery && markerStatus === 'unavailable' && scheduleStatus === 'unavailable' ? (
          <p className="status-note">{t('search.unavailable')}</p>
        ) : null}
      </section>
    </div>
  );
}

const searchCategories: Array<{ key: SearchCategory; labelKey: CommonMessageKey; icon: string }> = [
  { key: 'all', labelKey: 'search.category.all', icon: 'select_all' },
  { key: 'operations', labelKey: 'search.category.operations', icon: 'article' },
  { key: 'poi', labelKey: 'search.category.poi', icon: 'location_on' },
  { key: 'schedules', labelKey: 'search.category.schedules', icon: 'departure_board' },
  { key: 'services', labelKey: 'search.category.services', icon: 'apps' },
];

function SearchEmpty({ icon, message }: Readonly<{ icon: string; message: string }>) {
  return (
    <div className="empty-state">
      <span className="material-symbols-outlined" aria-hidden="true">
        {icon}
      </span>
      <p>{message}</p>
    </div>
  );
}

function formatPoiSummary(marker: MapMarkerSnapshot['markers'][number]): string {
  return [
    marker.categoryId,
    marker.address,
    marker.description,
    marker.openingHours,
    marker.facilities?.map((facility) => facility.description).join('、'),
  ]
    .filter(Boolean)
    .join(' · ');
}

function formatTripTitle(trip: TravelTripInstance): string {
  return [trip.tripCode, trip.lineName].filter(Boolean).join(' · ');
}

function formatTripSummary(trip: TravelTripInstance): string {
  const route = [
    trip.originStationName ?? trip.stationNames[0],
    trip.destinationStationName ?? trip.stationNames.at(-1),
  ]
    .filter(Boolean)
    .join(' - ');
  const time = [trip.departureTime, trip.arrivalTime].filter(Boolean).join(' - ');
  return [trip.serviceLabel, route, time, trip.operator, trip.fareText].filter(Boolean).join(' · ');
}

function toTime(value: string | undefined): number {
  if (!value) {
    return 0;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}
