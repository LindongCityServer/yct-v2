'use client';

import type {
  ApiListResponse,
  OperationsFeedItem,
  ServiceEntryGroup,
  TransitModeProfile,
  TransitStationDetailSnapshot,
} from '@yct/contracts';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { appPath } from '../lib/app-paths';
import { useI18n, type CommonMessageKey } from '../lib/client-i18n';
import type { TransitOverview } from '../lib/legacy-transit';
import { normalizeTitleForSearch, TitleWithBreaks } from './title-with-breaks';

type SearchCategory = 'all' | 'operations' | 'lines' | 'stations' | 'services';

const fallbackModeProfiles: TransitModeProfile[] = [
  { mode: 'metro', label: '地铁', color: '#2584E8', icon: 'subway', sortOrder: 0, enabled: true },
  { mode: 'tram', label: '有轨', color: '#C64255', icon: 'tram', sortOrder: 1, enabled: true },
  {
    mode: 'bus',
    label: '公交',
    color: '#F59B22',
    icon: 'directions_bus',
    sortOrder: 2,
    enabled: true,
  },
  {
    mode: 'coach',
    label: '客运',
    color: '#8BBF35',
    icon: 'airport_shuttle',
    sortOrder: 3,
    enabled: true,
  },
  {
    mode: 'ferry',
    label: '轮渡',
    color: '#168AA5',
    icon: 'directions_boat',
    sortOrder: 4,
    enabled: true,
  },
  {
    mode: 'railway',
    label: '地方铁路',
    color: '#8B5E34',
    icon: 'train',
    sortOrder: 5,
    enabled: true,
  },
  { mode: 'custom', label: '线路', color: '#168F78', icon: 'route', sortOrder: 6, enabled: true },
];

export function SearchPageClient({
  feed,
  transit,
  stationDetails,
  serviceGroups,
  initialQuery,
}: Readonly<{
  feed: ApiListResponse<OperationsFeedItem>;
  transit: TransitOverview;
  stationDetails: TransitStationDetailSnapshot[];
  serviceGroups: ServiceEntryGroup[];
  initialQuery: string;
}>) {
  const { t } = useI18n();
  const [query, setQuery] = useState(initialQuery);
  const [activeCategory, setActiveCategory] = useState<SearchCategory>('all');
  const normalizedQuery = normalizeTitleForSearch(query.trim());
  const modeProfileByMode = useMemo(
    () => buildModeProfileMap(transit.modeProfiles ?? fallbackModeProfiles),
    [transit.modeProfiles],
  );

  const operationResults = useMemo(() => {
    if (!normalizedQuery) {
      return [];
    }

    return feed.items
      .filter((item) =>
        [item.title, item.excerpt, item.categoryId]
          .filter(Boolean)
          .some((value) => normalizeTitleForSearch(value ?? '').includes(normalizedQuery)),
      )
      .sort((left, right) => toTime(right.publishedAt) - toTime(left.publishedAt));
  }, [feed.items, normalizedQuery]);

  const lineResults = useMemo(() => {
    if (!normalizedQuery) {
      return [];
    }

    return transit.lines.filter((line) =>
      [
        line.name,
        line.firstStationName,
        line.lastStationName,
        modeLabel(line.mode, modeProfileByMode),
      ]
        .filter(Boolean)
        .some((value) => normalizeTitleForSearch(value ?? '').includes(normalizedQuery)),
    );
  }, [modeProfileByMode, normalizedQuery, transit.lines]);

  const stationResults = useMemo(() => {
    if (!normalizedQuery) {
      return [];
    }

    return stationDetails.filter((detail) =>
      [
        detail.stationName,
        detail.lineName,
        ...detail.exits.map((exit) => exit.code),
        ...detail.exits.map((exit) => exit.description),
        ...detail.facilities.map((facility) => facility.type),
        ...detail.transfers.map((transfer) => transfer.line),
        ...detail.surroundingStationNames,
      ]
        .filter(Boolean)
        .some((value) => normalizeTitleForSearch(value ?? '').includes(normalizedQuery)),
    );
  }, [normalizedQuery, stationDetails]);

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
        .map((entry) => ({
          entry,
          groupTitle: group.title,
        })),
    );
  }, [normalizedQuery, serviceGroups]);

  const hasQuery = query.trim().length > 0;
  const totalResultCount =
    operationResults.length + lineResults.length + stationResults.length + serviceResults.length;
  const resultCounts: Record<SearchCategory, number> = {
    all: totalResultCount,
    operations: operationResults.length,
    lines: lineResults.length,
    stations: stationResults.length,
    services: serviceResults.length,
  };
  const hasResults =
    operationResults.length > 0 ||
    lineResults.length > 0 ||
    stationResults.length > 0 ||
    serviceResults.length > 0;
  const hasVisibleResults = hasResults && resultCounts[activeCategory] > 0;
  const shouldShowOperations = activeCategory === 'all' || activeCategory === 'operations';
  const shouldShowLines = activeCategory === 'all' || activeCategory === 'lines';
  const shouldShowStations = activeCategory === 'all' || activeCategory === 'stations';
  const shouldShowServices = activeCategory === 'all' || activeCategory === 'services';
  const translatedSearchCategories = useMemo(
    () =>
      searchCategories.map((category) => ({
        ...category,
        label: t(category.labelKey),
      })),
    [t],
  );

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
            <span className="muted">{t('search.resultCount', { count: totalResultCount })}</span>
          ) : null}
        </div>

        {!hasQuery ? (
          <div className="empty-state">
            <span className="material-symbols-outlined" aria-hidden="true">
              search
            </span>
            <p>{t('search.emptyPrompt')}</p>
          </div>
        ) : hasResults ? (
          <>
            <div className="category-strip search-filter-strip" aria-label={t('search.resultFilters')}>
              {translatedSearchCategories.map((category) => {
                const count = resultCounts[category.key];
                return (
                  <button
                    className={
                      activeCategory === category.key
                        ? 'category-chip tone-primary is-active'
                        : 'category-chip tone-primary'
                    }
                    type="button"
                    disabled={count === 0}
                    onClick={() => setActiveCategory(category.key)}
                    key={category.key}
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">
                      {category.icon}
                    </span>
                    <span>
                      {category.label}
                      <small>{count}</small>
                    </span>
                  </button>
                );
              })}
            </div>

            {hasVisibleResults ? (
              <div className="search-result-groups">
                {shouldShowOperations && operationResults.length > 0 ? (
                  <section
                    className="search-result-group"
                    aria-labelledby="search-operations-title"
                  >
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

                {shouldShowLines && lineResults.length > 0 ? (
                  <section className="search-result-group" aria-labelledby="search-lines-title">
                    <h2 id="search-lines-title">{t('search.resultGroup.lines')}</h2>
                    <div className="search-result-list">
                      {lineResults.map((line) => (
                        <Link
                          className="search-result-item"
                          href={appPath(
                            `/map?marker=${encodeURIComponent(`transit-line-${line.id}`)}`,
                          )}
                          key={line.id}
                        >
                          <span className="material-symbols-outlined" aria-hidden="true">
                            {modeIcon(line.mode, modeProfileByMode)}
                          </span>
                          <span>
                            <strong>
                              <TitleWithBreaks title={line.name} />
                            </strong>
                            <span className="muted">
                              {modeLabel(line.mode, modeProfileByMode)}
                              {line.firstStationName && line.lastStationName
                                ? ` · ${line.firstStationName} - ${line.lastStationName}`
                                : ` · ${t('search.stopCount', { count: line.stationCount })}`}
                            </span>
                          </span>
                        </Link>
                      ))}
                    </div>
                  </section>
                ) : null}

                {shouldShowStations && stationResults.length > 0 ? (
                  <section className="search-result-group" aria-labelledby="search-stations-title">
                    <h2 id="search-stations-title">{t('search.resultGroup.stations')}</h2>
                    <div className="search-result-list">
                      {stationResults.map((detail) => (
                        <Link
                          className="search-result-item"
                          href={appPath(
                            `/travel/stations/${encodeURIComponent(detail.lineName)}/${encodeURIComponent(detail.stationName)}`,
                          )}
                          key={detail.sourceId}
                        >
                          <span className="material-symbols-outlined" aria-hidden="true">
                            subway
                          </span>
                          <span>
                            <strong>
                              <TitleWithBreaks title={detail.stationName} />
                            </strong>
                            <span className="muted">
                              {detail.lineName}
                              {detail.exits.length > 0
                                ? ` · ${t('search.stationExitCount', { count: detail.exits.length })}`
                                : ''}
                              {detail.facilities.length > 0
                                ? ` · ${t('search.facilityCount', { count: detail.facilities.length })}`
                                : ''}
                            </span>
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
            ) : (
              <div className="empty-state">
                <span className="material-symbols-outlined" aria-hidden="true">
                  filter_alt_off
                </span>
                <p>{t('search.noCategoryResults')}</p>
              </div>
            )}
          </>
        ) : (
          <div className="empty-state">
            <span className="material-symbols-outlined" aria-hidden="true">
              inbox
            </span>
            <p>{t('search.noMatch', { query: query.trim() })}</p>
          </div>
        )}
      </section>
    </div>
  );
}

const searchCategories: Array<{ key: SearchCategory; labelKey: CommonMessageKey; icon: string }> = [
  { key: 'all', labelKey: 'search.category.all', icon: 'select_all' },
  { key: 'operations', labelKey: 'search.category.operations', icon: 'article' },
  { key: 'lines', labelKey: 'search.category.lines', icon: 'route' },
  { key: 'stations', labelKey: 'search.category.stations', icon: 'subway' },
  { key: 'services', labelKey: 'search.category.services', icon: 'apps' },
];

function toTime(value: string | undefined): number {
  if (!value) {
    return 0;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

type TransitMode = TransitOverview['lines'][number]['mode'];

function buildModeProfileMap(
  modeProfiles: TransitModeProfile[],
): Map<TransitMode, TransitModeProfile> {
  const map = new Map<TransitMode, TransitModeProfile>();
  for (const profile of fallbackModeProfiles) {
    map.set(profile.mode, profile);
  }
  for (const profile of modeProfiles) {
    map.set(profile.mode, profile);
  }
  return map;
}

function fallbackModeProfile(mode: TransitMode): TransitModeProfile {
  return fallbackModeProfiles.find((profile) => profile.mode === mode) ?? fallbackModeProfiles[6];
}

function modeLabel(
  mode: TransitMode,
  modeProfileByMode: Map<TransitMode, TransitModeProfile>,
): string {
  return modeProfileByMode.get(mode)?.label ?? fallbackModeProfile(mode).label;
}

function modeIcon(
  mode: TransitMode,
  modeProfileByMode: Map<TransitMode, TransitModeProfile>,
): string {
  return modeProfileByMode.get(mode)?.icon ?? fallbackModeProfile(mode).icon;
}
