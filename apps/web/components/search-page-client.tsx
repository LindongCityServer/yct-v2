'use client';

import type {
  ApiListResponse,
  LocaleCode,
  MapMarkerSnapshot,
  OperationsFeedItem,
  PoiCategory,
  ServiceEntryGroup,
  TravelScheduleQueryResult,
  TravelTripInstance,
} from '@yct/contracts';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { appPath } from '../lib/app-paths';
import { MaterialSymbol } from './material-symbol';
import {
  readAssistantEntryPreference,
  subscribeAssistantEntryPreferenceChanged,
} from '../lib/client-assistant-entry-preference';
import { publishGlobalSearchRequested } from '../lib/client-global-search-events';
import { useI18n, type CommonMessageKey } from '../lib/client-i18n';
import { useWikiSearch } from '../lib/client-wiki-search';
import { getMarkerCategoryLabel } from '../lib/map-marker-categories';
import { resolveMapMarkerIconUrl } from '../lib/map-marker-icon-url';
import { buildMapMarkerHref } from '../lib/map-marker-link';
import { resolveSearchImageSrc } from '../lib/search-image-src';
import { getSiteSocialLinkLabel, matchSiteSocialLinks } from '../lib/site-social-links';
import { faqAnswerText } from '../lib/faq-content';
import { getLocalizedFaqContent } from '../lib/faq-translations';
import { filterMapMarkers } from '../lib/map-marker-search';
import { normalizeTitleForSearch, TitleWithBreaks } from './title-with-breaks';

type SearchCategory = 'all' | 'operations' | 'poi' | 'schedules' | 'services' | 'wiki';
type LoadStatus = 'idle' | 'loading' | 'ready' | 'unavailable';

interface MapMarkerResponse {
  snapshot?: MapMarkerSnapshot;
  iconBaseUrl?: string;
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
  const faqContent = useMemo(() => getLocalizedFaqContent(locale), [locale]);
  const [query, setQuery] = useState(initialQuery);
  const [activeCategory, setActiveCategory] = useState<SearchCategory>('all');
  const [markers, setMarkers] = useState<MapMarkerSnapshot['markers']>([]);
  const [playerMarkers, setPlayerMarkers] = useState<MapMarkerSnapshot['markers']>([]);
  const [markerIconBaseUrl, setMarkerIconBaseUrl] = useState<string | undefined>();
  const [poiCategoryNames, setPoiCategoryNames] = useState<Map<string, string>>(new Map());
  const [markerStatus, setMarkerStatus] = useState<LoadStatus>('loading');
  const [scheduleResult, setScheduleResult] = useState<TravelScheduleQueryResult | null>(null);
  const [scheduleStatus, setScheduleStatus] = useState<LoadStatus>('idle');
  const [assistantEnabled, setAssistantEnabled] = useState(
    () => readAssistantEntryPreference().enabled,
  );
  const trimmedQuery = query.trim();
  const wikiSearch = useWikiSearch(trimmedQuery);
  const socialResults = useMemo(() => matchSiteSocialLinks(trimmedQuery), [trimmedQuery]);

  useEffect(() => {
    const sync = () => setAssistantEnabled(readAssistantEntryPreference().enabled);
    sync();
    return subscribeAssistantEntryPreferenceChanged(sync);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function loadMarkers() {
      try {
        const [response, categoriesResponse, playersResponse] = await Promise.all([
          fetch(appPath('/api/map/markers'), {
            cache: 'no-store',
            signal: controller.signal,
          }),
          fetch(appPath('/api/map/poi-categories'), {
            cache: 'no-store',
            signal: controller.signal,
          }),
          fetch(appPath('/api/map/player-locations'), {
            cache: 'no-store',
            signal: controller.signal,
          }),
        ]);
        const data = (await response.json()) as MapMarkerResponse;
        if (!response.ok || !data.snapshot) {
          setMarkerStatus('unavailable');
          return;
        }
        setMarkers(data.snapshot.markers.filter((marker) => marker.categoryId !== 'player'));
        setMarkerIconBaseUrl(data.iconBaseUrl);
        setMarkerStatus('ready');

        if (playersResponse.ok) {
          const playersPayload = (await playersResponse.json()) as {
            snapshot?: MapMarkerSnapshot;
          };
          if (playersPayload.snapshot?.markers) {
            setPlayerMarkers(playersPayload.snapshot.markers);
          }
        }

        if (categoriesResponse.ok) {
          const categoryPayload = (await categoriesResponse.json()) as { items?: PoiCategory[] };
          if (Array.isArray(categoryPayload.items)) {
            setPoiCategoryNames(
              new Map(categoryPayload.items.map((category) => [category.id, category.name])),
            );
          }
        }
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
    () => (trimmedQuery ? filterMapMarkers([...markers, ...playerMarkers], trimmedQuery) : []),
    [markers, playerMarkers, trimmedQuery],
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
        .map((entry) => {
          if (entry.id !== 'default-faq') {
            return {
              entry,
              groupTitle: group.title,
              title: entry.title,
              description: entry.description,
            };
          }

          return {
            entry,
            groupTitle: group.title,
            title: faqContent.serviceTitle,
            description: faqContent.serviceDescription,
          };
        })
        .filter(({ entry, groupTitle, title, description }) =>
          [title, description, groupTitle, entry.href]
            .filter(Boolean)
            .some((value) => normalizeTitleForSearch(value ?? '').includes(normalizedQuery)),
        ),
    );
  }, [faqContent.serviceDescription, faqContent.serviceTitle, normalizedQuery, serviceGroups]);
  const faqResults = useMemo(() => {
    if (!normalizedQuery) {
      return [];
    }

    return faqContent.groups.flatMap((group) =>
      group.items
        .filter((item) =>
          [item.question, faqAnswerText(item.answer), group.title, ...(item.keywords ?? [])].some(
            (value) => normalizeTitleForSearch(value).includes(normalizedQuery),
          ),
        )
        .map((item) => ({ item, groupTitle: group.title })),
    );
  }, [faqContent.groups, normalizedQuery]);
  const scheduleResults = scheduleResult?.trips ?? [];
  const wikiResults = wikiSearch.results;
  const totalResultCount =
    operationResults.length +
    poiResults.length +
    scheduleResults.length +
    serviceResults.length +
    faqResults.length +
    wikiResults.length +
    socialResults.length;
  const resultCounts: Record<SearchCategory, number> = {
    all: totalResultCount,
    operations: operationResults.length,
    poi: poiResults.length,
    schedules: scheduleResults.length,
    services: serviceResults.length + faqResults.length + socialResults.length,
    wiki: wikiResults.length,
  };
  const isLoading =
    markerStatus === 'loading' || scheduleStatus === 'loading' || wikiSearch.status === 'loading';
  const hasQuery = trimmedQuery.length > 0;
  const shouldShowPoi = activeCategory === 'all' || activeCategory === 'poi';
  const shouldShowSchedules = activeCategory === 'all' || activeCategory === 'schedules';
  const shouldShowOperations = activeCategory === 'all' || activeCategory === 'operations';
  const shouldShowServices = activeCategory === 'all' || activeCategory === 'services';
  const shouldShowWiki = activeCategory === 'all' || activeCategory === 'wiki';
  const shouldShowSocial = activeCategory === 'all' || activeCategory === 'services';

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
    resultCounts.wiki,
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

      {trimmedQuery && assistantEnabled ? (
        <div className="search-ask-row">
          <button
            className="search-ask-chip"
            type="button"
            onClick={() => publishGlobalSearchRequested({ query: trimmedQuery, ask: true })}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              forum
            </span>
            <span>{t('globalSearch.action.askThis')}</span>
          </button>
        </div>
      ) : null}

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
                <section
                  className="search-result-group search-result-group-operations"
                  aria-labelledby="search-operations-title"
                >
                  <h2 id="search-operations-title">{t('search.resultGroup.operations')}</h2>
                  <div className="search-result-list">
                    {operationResults.map((item) => {
                      const cover =
                        item.coverImageUrl ?? item.migratedImagePath ?? item.legacyImagePath;
                      return (
                        <Link
                          className={`search-result-item${cover ? ' has-thumb' : ''}`}
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
                          {cover ? (
                            <img
                              className="search-result-thumb is-trailing"
                              src={resolveSearchImageSrc(cover)}
                              alt=""
                              loading="lazy"
                              decoding="async"
                              referrerPolicy="no-referrer"
                            />
                          ) : null}
                        </Link>
                      );
                    })}
                  </div>
                </section>
              ) : null}

              {shouldShowPoi && poiResults.length > 0 ? (
                <section
                  className="search-result-group search-result-group-poi"
                  aria-labelledby="search-poi-title"
                >
                  <h2 id="search-poi-title">{t('search.resultGroup.poi')}</h2>
                  <div className="search-result-list">
                    {poiResults.map((marker) => {
                      const thumbnail = marker.imageUrls?.[0] ?? marker.imageUrl;
                      const isPlayer = marker.categoryId === 'player';
                      const iconUrl = isPlayer
                        ? undefined
                        : resolveMapMarkerIconUrl(marker.iconFileName, markerIconBaseUrl);
                      const categoryName = isPlayer
                        ? t('search.resultGroup.player')
                        : getMarkerCategoryLabel(marker.categoryId, poiCategoryNames, locale);
                      return (
                        <Link
                          className={`search-result-item${thumbnail ? ' has-thumb' : ''}`}
                          href={appPath(buildMapMarkerHref(marker))}
                          key={marker.id}
                        >
                          {iconUrl ? (
                            <img
                              className="search-result-icon"
                              src={iconUrl}
                              alt=""
                              loading="lazy"
                              decoding="async"
                            />
                          ) : (
                            <MaterialSymbol
                              name={isPlayer ? 'person_pin' : (marker.symbolIcon ?? 'location_on')}
                              aria-hidden="true"
                            />
                          )}
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
                            <span className="muted">{formatPoiSummary(marker, categoryName)}</span>
                          </span>
                          {thumbnail ? (
                            <img
                              className="search-result-thumb is-trailing"
                              src={resolveSearchImageSrc(thumbnail)}
                              alt=""
                              loading="lazy"
                              decoding="async"
                              referrerPolicy="no-referrer"
                            />
                          ) : null}
                        </Link>
                      );
                    })}
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
                    {serviceResults.map(({ entry, groupTitle, title, description }) => (
                      <a
                        className="search-result-item"
                        href={appPath(entry.href)}
                        target={entry.openMode === 'new_tab' ? '_blank' : undefined}
                        rel={entry.openMode === 'new_tab' ? 'noreferrer' : undefined}
                        key={entry.id}
                      >
                        <MaterialSymbol name={entry.icon} aria-hidden="true" />
                        <span>
                          <strong>
                            <TitleWithBreaks title={title} />
                          </strong>
                          <span className="muted">
                            {groupTitle}
                            {description ? ` · ${description}` : ''}
                          </span>
                        </span>
                      </a>
                    ))}
                  </div>
                </section>
              ) : null}

              {shouldShowServices && faqResults.length > 0 ? (
                <section className="search-result-group" aria-labelledby="search-faq-title">
                  <h2 id="search-faq-title">{faqContent.serviceTitle}</h2>
                  <div className="search-result-list">
                    {faqResults.map(({ item, groupTitle }) => (
                      <Link
                        className="search-result-item"
                        href={appPath(`/services/faq#${item.id}`)}
                        key={item.id}
                      >
                        <span className="material-symbols-outlined" aria-hidden="true">
                          help
                        </span>
                        <span>
                          <strong>{item.question}</strong>
                          <span className="muted">
                            {groupTitle} · {faqAnswerText(item.answer)}
                          </span>
                        </span>
                      </Link>
                    ))}
                  </div>
                </section>
              ) : null}

              {shouldShowSocial && socialResults.length > 0 ? (
                <section className="search-result-group" aria-labelledby="search-social-title">
                  <h2 id="search-social-title">{t('search.resultGroup.social')}</h2>
                  <div className="search-result-list">
                    {socialResults.map((link) => (
                      <a
                        className="search-result-item"
                        href={link.href}
                        target="_blank"
                        rel="noreferrer"
                        key={link.id}
                      >
                        <span className="material-symbols-outlined" aria-hidden="true">
                          link
                        </span>
                        <span>
                          <strong>{getSiteSocialLinkLabel(link, locale)}</strong>
                          <span className="muted">{t('search.social.description')}</span>
                        </span>
                      </a>
                    ))}
                  </div>
                </section>
              ) : null}

              {shouldShowWiki && wikiResults.length > 0 ? (
                <section className="search-result-group" aria-labelledby="search-wiki-title">
                  <h2 id="search-wiki-title">{t('search.resultGroup.wiki')}</h2>
                  <div className="search-result-list">
                    {wikiResults.map((item) => (
                      <a
                        className={`search-result-item${item.thumbnailUrl ? ' has-thumb' : ''}`}
                        href={item.href}
                        target="_blank"
                        rel="noreferrer"
                        key={item.href}
                      >
                        <span className="material-symbols-outlined" aria-hidden="true">
                          menu_book
                        </span>
                        <span>
                          <strong>{item.title}</strong>
                          <span className="muted">
                            {item.snippet}
                            {item.updatedAt
                              ? ` · ${t('search.wiki.updatedAt')} ${formatWikiTime(
                                  item.updatedAt,
                                  locale,
                                )}`
                              : ''}
                          </span>
                        </span>
                        {item.thumbnailUrl ? (
                          <img
                            className="search-result-thumb is-trailing"
                            src={item.thumbnailUrl}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            referrerPolicy="no-referrer"
                          />
                        ) : null}
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
  { key: 'wiki', labelKey: 'search.category.wiki', icon: 'menu_book' },
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

function formatPoiSummary(
  marker: MapMarkerSnapshot['markers'][number],
  categoryName?: string,
): string {
  return [
    categoryName ?? marker.categoryId,
    marker.address,
    marker.floorLabel,
    marker.description,
    marker.openingHours,
    marker.facilities?.map((facility) => facility.description).join('、'),
  ]
    .filter(Boolean)
    .join(' · ');
}

function formatWikiTime(value: string, locale: LocaleCode): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(
    locale === 'en' ? 'en' : locale === 'zh-Hant' ? 'zh-Hant' : 'zh-CN',
    {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    },
  ).format(date);
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
