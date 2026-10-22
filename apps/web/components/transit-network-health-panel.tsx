'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type {
  TransitNetworkHealthModeStats,
  TransitNetworkHealthOperatorStats,
  TransitNetworkHealthPlaceCategoryStats,
  TransitNetworkHealthReport,
  TransitNetworkHealthScopeStats,
  TransitNetworkHealthSuggestion,
  TransitNetworkHealthSuggestionTarget,
} from '@yct/contracts';
import { useI18n, type CommonMessageKey } from '../lib/client-i18n';

type ActiveMode = 'all' | TransitNetworkHealthModeStats['mode'];
type SortDirection = 'ascending' | 'descending';
type OperatorSortKey =
  | 'operator'
  | 'stationCount'
  | 'lineCount'
  | 'averageConnectivity'
  | 'connectivityWeight'
  | 'averageLinesPerSegment'
  | 'sharedSegmentCount'
  | 'scheduleCoverageRate'
  | 'averageServiceSpanMinutes';

interface OperatorSortState {
  key: OperatorSortKey;
  direction: SortDirection;
}

const dimensionLabels: Record<
  TransitNetworkHealthSuggestion['dimension'],
  CommonMessageKey
> = {
  topology: 'transitHealth.dimension.topology',
  operations: 'transitHealth.dimension.operations',
  scale: 'transitHealth.dimension.scale',
  places: 'transitHealth.dimension.places',
  demand: 'transitHealth.dimension.demand',
  data_quality: 'transitHealth.dimension.data_quality',
};

export function TransitNetworkHealthPanel({
  report,
}: Readonly<{
  report: TransitNetworkHealthReport;
}>) {
  const { t, locale } = useI18n();
  const [isOnline, setIsOnline] = useState(true);
  const [activeMode, setActiveMode] = useState<ActiveMode>('all');
  const [considerExistingNetwork, setConsiderExistingNetwork] = useState(true);
  const [sort, setSort] = useState<OperatorSortState>({
    key: 'lineCount',
    direction: 'descending',
  });
  const [targetDialogSuggestion, setTargetDialogSuggestion] =
    useState<TransitNetworkHealthSuggestion>();
  const activeModeStats = report.modes.find((mode) => mode.mode === activeMode);
  const scope: TransitNetworkHealthScopeStats = activeModeStats ?? report;
  const scopeLabel = activeModeStats?.label ?? t('transitHealth.scopeAll');
  const modeLabelById = new Map(report.modes.map((mode) => [mode.mode, mode.label]));
  const sortedOperators = useMemo(
    () => sortOperators(scope.operators, sort),
    [scope.operators, sort],
  );

  useEffect(() => {
    const updateOnlineState = () => setIsOnline(navigator.onLine);
    updateOnlineState();
    window.addEventListener('online', updateOnlineState);
    window.addEventListener('offline', updateOnlineState);
    return () => {
      window.removeEventListener('online', updateOnlineState);
      window.removeEventListener('offline', updateOnlineState);
    };
  }, []);

  function changeSort(key: OperatorSortKey): void {
    setSort((current) => ({
      key,
      direction:
        current.key === key
          ? current.direction === 'descending'
            ? 'ascending'
            : 'descending'
          : key === 'operator'
            ? 'ascending'
            : 'descending',
    }));
  }

  return (
    <section className="transit-health-panel module-panel" aria-labelledby="transit-health-title">
      <header className="transit-health-header">
        <div>
          <p className="eyebrow">{t('transitHealth.analysisEyebrow')}</p>
          <h1 id="transit-health-title">{t('page.transitNetworkHealth')}</h1>
          <p>{t('transitHealth.subtitle')}</p>
        </div>
        <p className="transit-health-source">
          <span>{isOnline ? t('transitHealth.onlineSnapshot') : t('transitHealth.offlineSnapshot')}</span>
          {t('transitHealth.dataTime')} {formatDateTime(report.analyzedAt, locale)}
          {report.sourceMessage ? <span>{report.sourceMessage}</span> : null}
          {report.planningSourceMessage ? <span>{report.planningSourceMessage}</span> : null}
        </p>
      </header>

      {report.lineCount === 0 ? (
        <div className="empty-state">
          <span className="material-symbols-outlined" aria-hidden="true">
            account_tree
          </span>
          <p>{t('transitHealth.noLines')}</p>
        </div>
      ) : (
        <>
          <fieldset
            className="segmented-control transit-health-mode-filter"
            aria-label={t('transitHealth.filterAria')}
          >
            <legend className="sr-only">{t('transitHealth.modeLegend')}</legend>
            <div>
              <button
                type="button"
                className={activeMode === 'all' ? 'is-active' : undefined}
                aria-pressed={activeMode === 'all'}
                onClick={() => setActiveMode('all')}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  commute
                </span>
                {t('search.category.all')}
                <small>{report.lineCount}</small>
              </button>
              {report.modes.map((mode) => (
                <button
                  key={mode.mode}
                  type="button"
                  className={activeMode === mode.mode ? 'is-active' : undefined}
                  aria-pressed={activeMode === mode.mode}
                  onClick={() => setActiveMode(mode.mode)}
                >
                  <span
                    className="material-symbols-outlined"
                    aria-hidden="true"
                    style={{ color: mode.color }}
                  >
                    {mode.icon}
                  </span>
                  {mode.label}
                  <small>{mode.lineCount}</small>
                </button>
              ))}
            </div>
          </fieldset>

          <div className="transit-health-scope-row">
            <div className="transit-health-active-scope" aria-live="polite">
              <span className="material-symbols-outlined" aria-hidden="true">
                filter_alt
              </span>
              {t('transitHealth.scopeCurrent')}<strong>{scopeLabel}</strong>
            </div>
            <div className="transit-health-demand-toggle">
              <strong id="transit-health-demand-toggle-label">
                {considerExistingNetwork
                  ? t('transitHealth.demandWithLines')
                  : t('transitHealth.demandPotentialOnly')}
              </strong>
              <label className="switch-control">
                <input
                  type="checkbox"
                  role="switch"
                  checked={considerExistingNetwork}
                  onChange={(event) => setConsiderExistingNetwork(event.target.checked)}
                  aria-labelledby="transit-health-demand-toggle-label"
                />
                <span aria-hidden="true" />
              </label>
            </div>
          </div>

          <section className="transit-health-summary" aria-label={scopeLabel}>
            <Metric
              label={t('transitHealth.mLines')}
              value={formatInteger(scope.lineCount, locale)}
              note={t('transitHealth.mTopologyNote', { count: scope.topologyLineCount })}
            />
            <Metric
              label={t('transitHealth.mStations')}
              value={formatInteger(scope.stationCount, locale)}
              note={t('transitHealth.mLocatedNote', {
                rate: formatPercent(scope.spatial.stationLocationCoverageRate, locale),
              })}
            />
            <Metric
              label={t('transitHealth.mLength')}
              value={formatMapDistance(scope.spatial.approximateRouteLength, locale)}
              note={t('transitHealth.mLocatedSegNote', {
                count: scope.spatial.locatedSegmentCount,
              })}
            />
            <Metric
              label={t('transitHealth.mCoverage')}
              value={formatPercent(scope.operating.scheduleCoverageRate, locale)}
              note={t('transitHealth.mScheduledNote', {
                scheduled: scope.operating.scheduledLineCount,
                total: scope.lineCount,
              })}
            />
            <Metric
              label={t('transitHealth.mServiceSpan')}
              value={formatDuration(scope.operating.averageServiceSpanMinutes, locale)}
              note={t('transitHealth.mLateNote', { count: scope.operating.lateEndLineCount })}
            />
            <Metric
              label={t('transitHealth.mPlaceCoverage')}
              value={formatPercent(scope.planning.placeCoverageRate, locale)}
              note={t('transitHealth.mPlacesNote', {
                covered: scope.planning.coveredPlaceCount,
                total: scope.planning.analyzedPlaceCount,
              })}
            />
            <Metric
              label={t('transitHealth.mRoadCoverage')}
              value={formatPercent(scope.spatial.roadNodeCoverageRate, locale)}
              note={t('transitHealth.mRoadsNote', { count: scope.spatial.roadCount })}
            />
            <Metric
              label={
                considerExistingNetwork
                  ? t('transitHealth.mDemandAttainment')
                  : t('transitHealth.mPotentialDemand')
              }
              value={
                considerExistingNetwork
                  ? formatPercent(scope.planning.demandAttainmentRate, locale)
                  : formatMetric(scope.planning.totalDemandProxyScore, locale)
              }
              note={
                considerExistingNetwork
                  ? t('transitHealth.mAttainedNote', {
                      attained: formatMetric(scope.planning.attainedDemandProxyScore, locale),
                      total: formatMetric(scope.planning.totalDemandProxyScore, locale),
                    })
                  : t('transitHealth.mPotentialHint')
              }
            />
          </section>

          <section
            className="transit-health-section transit-health-visuals"
            aria-labelledby="transit-health-visuals-title"
          >
            <div className="section-heading">
              <div>
                <p className="eyebrow">{t('transitHealth.chartEyebrow')}</p>
                <h2 id="transit-health-visuals-title">{t('transitHealth.chartTitle')}</h2>
              </div>
              <span className="muted">{t('transitHealth.locatedSampleHint')}</span>
            </div>
            <div className="transit-health-chart-grid">
              <ModeCompositionChart modes={report.modes} activeMode={activeMode} />
              <OperatingHoursChart modes={report.modes} activeMode={activeMode} />
              <PlaceCoverageChart
                categories={scope.planning.placeCategories}
                coverageRate={scope.planning.placeCoverageRate}
                coveredCount={scope.planning.coveredPlaceCount}
                totalCount={scope.planning.analyzedPlaceCount}
              />
              <DemandHotspotChart scope={scope} considerExistingNetwork={considerExistingNetwork} />
              <OperatorScaleChart operators={scope.operators} />
            </div>
          </section>

          <section
            className="transit-health-section"
            aria-labelledby="transit-health-operators-title"
          >
            <div className="section-heading">
              <div>
                <p className="eyebrow">{t('transitHealth.opEyebrow')}</p>
                <h2 id="transit-health-operators-title">{t('transitHealth.opTitle')}</h2>
              </div>
              <span className="muted">
                {t('transitHealth.opCountHint', { count: scope.operators.length })}
              </span>
            </div>
            <div className="transit-health-table-wrap">
              <table className="transit-health-table">
                <thead>
                  <tr>
                    <SortableHeader
                      label={t('transitHealth.colOperator')}
                      sortKey="operator"
                      sort={sort}
                      onSort={changeSort}
                    />
                    <SortableHeader
                      label={t('transitHealth.colStations')}
                      title={t('transitHealth.colStationsTitle')}
                      sortKey="stationCount"
                      sort={sort}
                      onSort={changeSort}
                    />
                    <SortableHeader
                      label={t('transitHealth.colLines')}
                      sortKey="lineCount"
                      sort={sort}
                      onSort={changeSort}
                    />
                    <SortableHeader
                      label={t('transitHealth.colAvgConnectivity')}
                      title={t('transitHealth.colConnectivityTitle')}
                      sortKey="averageConnectivity"
                      sort={sort}
                      onSort={changeSort}
                    />
                    <SortableHeader
                      label={t('transitHealth.colConnectivityWeight')}
                      title={t('transitHealth.colWeightTitle')}
                      sortKey="connectivityWeight"
                      sort={sort}
                      onSort={changeSort}
                    />
                    <SortableHeader
                      label={t('transitHealth.colLinesPerSegment')}
                      sortKey="averageLinesPerSegment"
                      sort={sort}
                      onSort={changeSort}
                    />
                    <SortableHeader
                      label={t('transitHealth.colSharedSegments')}
                      sortKey="sharedSegmentCount"
                      sort={sort}
                      onSort={changeSort}
                    />
                    <SortableHeader
                      label={t('transitHealth.colScheduleCoverage')}
                      sortKey="scheduleCoverageRate"
                      sort={sort}
                      onSort={changeSort}
                    />
                    <SortableHeader
                      label={t('transitHealth.colServiceSpan')}
                      sortKey="averageServiceSpanMinutes"
                      sort={sort}
                      onSort={changeSort}
                    />
                  </tr>
                </thead>
                <tbody>
                  {sortedOperators.map((operator) => (
                    <OperatorRow
                      key={operator.operator}
                      operator={operator}
                      modeLabelById={modeLabelById}
                      t={t}
                      locale={locale}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            {activeMode === 'bus' || activeMode === 'all' ? (
              <p className="transit-health-table-note">{t('transitHealth.opTableNote')}</p>
            ) : null}
          </section>

          <section className="transit-health-method" aria-labelledby="transit-health-method-title">
            <div className="section-heading">
              <div>
                <p className="eyebrow">{t('transitHealth.methodEyebrow')}</p>
                <h2 id="transit-health-method-title">{t('transitHealth.methodTitle')}</h2>
              </div>
              <span className="muted">{t('transitHealth.noMockHint')}</span>
            </div>
            <div className="transit-health-source-list">
              {report.analysisSources.map((source) => (
                <article key={source.id} className={`is-${source.status}`}>
                  <span className="material-symbols-outlined" aria-hidden="true">
                    {source.status === 'ready'
                      ? 'check_circle'
                      : source.status === 'partial'
                        ? 'pending'
                        : 'error'}
                  </span>
                  <div>
                    <h3>{source.label}</h3>
                    <p>{source.detail}</p>
                  </div>
                </article>
              ))}
            </div>
            <dl>
              <div>
                <dt>{t('transitHealth.dmTopology')}</dt>
                <dd>{t('transitHealth.dmTopologyDetail')}</dd>
              </div>
              <div>
                <dt>{t('transitHealth.dmOperations')}</dt>
                <dd>{t('transitHealth.dmOperationsDetail')}</dd>
              </div>
              <div>
                <dt>{t('transitHealth.dmScale')}</dt>
                <dd>{t('transitHealth.dmScaleDetail')}</dd>
              </div>
              <div>
                <dt>{t('transitHealth.dmPlaces')}</dt>
                <dd>{t('transitHealth.dmPlacesDetail')}</dd>
              </div>
              <div>
                <dt>{t('transitHealth.dmDemand')}</dt>
                <dd>{t('transitHealth.dmDemandDetail')}</dd>
              </div>
              <div>
                <dt>{t('transitHealth.dmRoads')}</dt>
                <dd>{t('transitHealth.dmRoadsDetail')}</dd>
              </div>
            </dl>
          </section>

          <section
            className="transit-health-section"
            aria-labelledby="transit-health-suggestions-title"
          >
            <div className="section-heading">
              <div>
                <p className="eyebrow">{t('transitHealth.sugEyebrow')}</p>
                <h2 id="transit-health-suggestions-title">{t('transitHealth.sugTitle')}</h2>
              </div>
              <span className="muted">{t('transitHealth.sugMergedHint')}</span>
            </div>
            {scope.suggestions.length > 0 ? (
              <div className="transit-health-suggestions">
                {scope.suggestions.map((suggestion) => (
                  <SuggestionCard
                    key={suggestion.id}
                    suggestion={suggestion}
                    onShowTargets={() => setTargetDialogSuggestion(suggestion)}
                  />
                ))}
              </div>
            ) : (
              <p className="transit-health-empty-suggestions">{t('transitHealth.sugEmpty')}</p>
            )}
          </section>
        </>
      )}
      {targetDialogSuggestion ? (
        <SuggestionTargetsDialog
          suggestion={targetDialogSuggestion}
          onClose={() => setTargetDialogSuggestion(undefined)}
        />
      ) : null}
    </section>
  );
}

function Metric({ label, value, note }: Readonly<{ label: string; value: string; note: string }>) {
  return (
    <div className="transit-health-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}

function SortableHeader({
  label,
  title,
  sortKey,
  sort,
  onSort,
}: Readonly<{
  label: string;
  title?: string;
  sortKey: OperatorSortKey;
  sort: OperatorSortState;
  onSort: (key: OperatorSortKey) => void;
}>) {
  const active = sort.key === sortKey;
  return (
    <th scope="col" title={title} aria-sort={active ? sort.direction : 'none'}>
      <button type="button" onClick={() => onSort(sortKey)}>
        <span>{label}</span>
        <span className="material-symbols-outlined" aria-hidden="true">
          {active
            ? sort.direction === 'ascending'
              ? 'arrow_upward'
              : 'arrow_downward'
            : 'unfold_more'}
        </span>
      </button>
    </th>
  );
}

function OperatorRow({
  operator,
  modeLabelById,
  t,
  locale,
}: Readonly<{
  operator: TransitNetworkHealthOperatorStats;
  modeLabelById: Map<TransitNetworkHealthModeStats['mode'], string>;
  t: ReturnType<typeof useI18n>['t'];
  locale: string;
}>) {
  return (
    <tr>
      <th scope="row">
        <strong>{operator.operator}</strong>
        <small>
          {operator.modes.map((mode) => modeLabelById.get(mode) ?? mode).join(' / ')} ·{' '}
          {t('transitHealth.opComponentsNote', {
            count: operator.componentCount,
            transfer: operator.transferStationCount,
          })}
        </small>
      </th>
      <td>
        {formatInteger(operator.stationCount, locale)} <Rank rank={operator.ranks.stationCount} />
      </td>
      <td>
        {formatInteger(operator.lineCount, locale)} <Rank rank={operator.ranks.lineCount} />
      </td>
      <td>
        {formatMetric(operator.averageConnectivity, locale)}{' '}
        <Rank rank={operator.ranks.averageConnectivity} />
      </td>
      <td>
        {formatMetric(operator.connectivityWeight, locale)}{' '}
        <Rank rank={operator.ranks.connectivityWeight} />
      </td>
      <td>
        {formatMetric(operator.averageLinesPerSegment, locale)}{' '}
        <Rank rank={operator.ranks.averageLinesPerSegment} />
      </td>
      <td>{formatInteger(operator.sharedSegmentCount, locale)}</td>
      <td>
        {formatPercent(operator.scheduleCoverageRate, locale)}{' '}
        <Rank rank={operator.ranks.scheduleCoverageRate} />
      </td>
      <td>
        {operator.scheduledLineCount > 0
          ? formatDuration(operator.averageServiceSpanMinutes, locale)
          : '—'}{' '}
        {operator.scheduledLineCount > 0 ? (
          <Rank rank={operator.ranks.averageServiceSpanMinutes} />
        ) : null}
      </td>
    </tr>
  );
}

function Rank({ rank }: Readonly<{ rank: number }>) {
  const { t } = useI18n();
  return <small className="transit-health-rank">{t('transitHealth.rankLabel', { rank })}</small>;
}

function ModeCompositionChart({
  modes,
  activeMode,
}: Readonly<{ modes: TransitNetworkHealthModeStats[]; activeMode: ActiveMode }>) {
  const { t, locale } = useI18n();
  const total = modes.reduce((sum, mode) => sum + mode.lineCount, 0);
  const details = modes.map((mode) => `${mode.label} ${mode.lineCount}`).join('，');
  return (
    <article className="transit-health-chart">
      <header>
        <div>
          <h3>{t('transitHealth.cModeTitle')}</h3>
          <p>{t('transitHealth.cModeSubtitle')}</p>
        </div>
        <span className="material-symbols-outlined" aria-hidden="true">
          donut_large
        </span>
      </header>
      <div className="transit-health-pie-layout">
        <div
          className="transit-health-donut"
          style={{ backgroundImage: buildModeConicGradient(modes) }}
          role="img"
          aria-label={t('transitHealth.cTotalLines', { count: total, details })}
        >
          <strong>{total}</strong>
          <span>{t('transitHealth.cLinesUnit')}</span>
        </div>
        <div className="transit-health-pie-legend">
          {modes.map((mode) => (
            <div
              key={mode.mode}
              className={activeMode !== 'all' && activeMode !== mode.mode ? 'is-muted' : undefined}
            >
              <i style={{ backgroundColor: mode.color }} />
              <span>{mode.label}</span>
              <strong>
                {mode.lineCount} · {formatPercent(mode.lineCount / Math.max(total, 1), locale)}
              </strong>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}

function OperatingHoursChart({
  modes,
  activeMode,
}: Readonly<{ modes: TransitNetworkHealthModeStats[]; activeMode: ActiveMode }>) {
  const { t, locale } = useI18n();
  const maximum = Math.max(1, ...modes.map((mode) => mode.operating.averageServiceSpanMinutes));
  return (
    <article className="transit-health-chart">
      <header>
        <div>
          <h3>{t('transitHealth.cHoursTitle')}</h3>
          <p>{t('transitHealth.cHoursSubtitle')}</p>
        </div>
        <span className="material-symbols-outlined" aria-hidden="true">
          schedule
        </span>
      </header>
      <div className="transit-health-bars">
        {modes.map((mode) => (
          <ChartBar
            key={mode.mode}
            label={mode.label}
            value={mode.operating.averageServiceSpanMinutes}
            valueLabel={
              mode.operating.scheduledLineCount > 0
                ? formatDuration(mode.operating.averageServiceSpanMinutes, locale)
                : t('transitHealth.cNoSchedule')
            }
            maximum={maximum}
            color={mode.color}
            muted={activeMode !== 'all' && activeMode !== mode.mode}
          />
        ))}
      </div>
    </article>
  );
}

function PlaceCoverageChart({
  categories,
  coverageRate,
  coveredCount,
  totalCount,
}: Readonly<{
  categories: TransitNetworkHealthPlaceCategoryStats[];
  coverageRate: number;
  coveredCount: number;
  totalCount: number;
}>) {
  const { t, locale } = useI18n();
  return (
    <article className="transit-health-chart">
      <header>
        <div>
          <h3>{t('transitHealth.cPlaceTitle')}</h3>
          <p>{t('transitHealth.cPlaceSubtitle')}</p>
        </div>
        <span className="material-symbols-outlined" aria-hidden="true">
          location_on
        </span>
      </header>
      <div className="transit-health-ratio-summary">
        <RatioDonut value={coverageRate} label={t('transitHealth.cPlaceRate')} />
        <p>
          <strong>{coveredCount}</strong> / {totalCount} {t('transitHealth.cPlaceEntered')}
        </p>
      </div>
      <div className="transit-health-bars">
        {categories.map((category) => (
          <ChartBar
            key={category.category}
            label={category.label}
            value={category.coverageRate}
            valueLabel={`${formatPercent(category.coverageRate, locale)} · ${
              category.coveredPlaceCount
            }/${category.placeCount}`}
            maximum={1}
            color="var(--yct-color-primary)"
            muted={category.placeCount === 0}
          />
        ))}
      </div>
    </article>
  );
}

function DemandHotspotChart({
  scope,
  considerExistingNetwork,
}: Readonly<{
  scope: TransitNetworkHealthScopeStats;
  considerExistingNetwork: boolean;
}>) {
  const { t, locale } = useI18n();
  const stationHotspots = scope.planning.demandHotspots.slice(0, 7);
  const potentialHotspots = scope.planning.potentialDemandHotspots.slice(0, 7);
  const values = considerExistingNetwork ? stationHotspots : potentialHotspots;
  const maximum = Math.max(1, ...values.map((hotspot) => hotspot.demandProxyScore));
  return (
    <article className="transit-health-chart">
      <header>
        <div>
          <h3>
            {considerExistingNetwork
              ? t('transitHealth.cHotspotTitle1')
              : t('transitHealth.cHotspotTitle2')}
          </h3>
          <p>
            {considerExistingNetwork
              ? t('transitHealth.cHotspotSub1')
              : t('transitHealth.cHotspotSub2')}
          </p>
        </div>
        <span className="material-symbols-outlined" aria-hidden="true">
          local_fire_department
        </span>
      </header>
      {considerExistingNetwork ? (
        <div className="transit-health-ratio-summary">
          <RatioDonut
            value={scope.planning.demandAttainmentRate}
            label={t('transitHealth.cDemandRate')}
          />
          <p>
            {t('transitHealth.cAttained', {
              attained: formatMetric(scope.planning.attainedDemandProxyScore, locale),
              total: formatMetric(scope.planning.totalDemandProxyScore, locale),
            })}
          </p>
        </div>
      ) : null}
      {values.length > 0 ? (
        <div className="transit-health-bars">
          {considerExistingNetwork
            ? stationHotspots.map((hotspot) => (
                <ChartBar
                  key={`${hotspot.mode}-${hotspot.stationName}`}
                  label={hotspot.stationName}
                  value={hotspot.demandProxyScore}
                  valueLabel={t('transitHealth.cNearbyCount', {
                    value: formatMetric(hotspot.demandProxyScore, locale),
                    count: hotspot.nearbyPlaceCount,
                  })}
                  maximum={maximum}
                  color="var(--yct-color-warning, #b87900)"
                />
              ))
            : potentialHotspots.map((hotspot) => (
                <ChartBar
                  key={hotspot.placeName}
                  label={t('transitHealth.cAround', { place: hotspot.placeName })}
                  value={hotspot.demandProxyScore}
                  valueLabel={t('transitHealth.cNearbyCount', {
                    value: formatMetric(hotspot.demandProxyScore, locale),
                    count: hotspot.nearbyPlaceCount,
                  })}
                  maximum={maximum}
                  color={
                    hotspot.servedByNetwork
                      ? 'var(--yct-color-primary)'
                      : 'var(--yct-color-warning, #b87900)'
                  }
                />
              ))}
        </div>
      ) : (
        <p className="transit-health-chart-empty">{t('transitHealth.cHotspotEmpty')}</p>
      )}
    </article>
  );
}

function OperatorScaleChart({
  operators,
}: Readonly<{ operators: TransitNetworkHealthOperatorStats[] }>) {
  const { t, locale } = useI18n();
  const items = [...operators]
    .sort((left, right) => right.stationCount - left.stationCount)
    .slice(0, 8);
  const maximum = Math.max(1, ...items.map((operator) => operator.stationCount));
  return (
    <article className="transit-health-chart is-wide">
      <header>
        <div>
          <h3>{t('transitHealth.cOperatorTitle')}</h3>
          <p>{t('transitHealth.cOperatorSubtitle')}</p>
        </div>
        <span className="material-symbols-outlined" aria-hidden="true">
          domain
        </span>
      </header>
      <div className="transit-health-bars is-operator-bars">
        {items.map((operator) => (
          <ChartBar
            key={operator.operator}
            label={operator.operator}
            value={operator.stationCount}
            valueLabel={t('transitHealth.cOperatorBarLabel', {
              stations: operator.stationCount,
              lines: operator.lineCount,
            })}
            maximum={maximum}
            color="var(--yct-color-primary)"
          />
        ))}
      </div>
    </article>
  );
}

function RatioDonut({ value, label }: Readonly<{ value: number; label: string }>) {
  const { locale } = useI18n();
  const percentage = Math.max(0, Math.min(1, value));
  return (
    <div
      className="transit-health-donut is-ratio"
      style={{
        backgroundImage: `conic-gradient(var(--yct-color-primary) 0deg ${percentage * 360}deg, color-mix(in srgb, var(--yct-color-text-muted) 14%, transparent) ${percentage * 360}deg 360deg)`,
      }}
      role="img"
      aria-label={`${label} ${formatPercent(percentage, locale)}`}
    >
      <strong>{formatPercent(percentage, locale)}</strong>
      <span>{label}</span>
    </div>
  );
}

function ChartBar({
  label,
  value,
  valueLabel,
  maximum,
  color,
  muted = false,
}: Readonly<{
  label: string;
  value: number;
  valueLabel: string;
  maximum: number;
  color: string;
  muted?: boolean;
}>) {
  const width = value > 0 ? Math.max(2, (value / maximum) * 100) : 0;
  return (
    <div className={`transit-health-bar${muted ? ' is-muted' : ''}`}>
      <span title={label}>{label}</span>
      <div aria-hidden="true">
        <i style={{ width: `${width}%`, backgroundColor: color }} />
      </div>
      <strong>{valueLabel}</strong>
    </div>
  );
}

function SuggestionCard({
  suggestion,
  onShowTargets,
}: Readonly<{
  suggestion: TransitNetworkHealthSuggestion;
  onShowTargets: () => void;
}>) {
  const { t } = useI18n();
  const operatorText = formatOperatorGroup(suggestion.operators, t);
  const targets = suggestion.targets ?? [];
  return (
    <article className={`transit-health-suggestion is-${suggestion.priority}`}>
      <div className="transit-health-suggestion-heading">
        <span className="material-symbols-outlined" aria-hidden="true">
          {suggestion.priority === 'attention' ? 'priority_high' : suggestionIcon(suggestion)}
        </span>
        <div>
          <span className="transit-health-dimension">
            {t(dimensionLabels[suggestion.dimension])}
          </span>
          <h3>{suggestion.title}</h3>
          {operatorText ? <span className="transit-health-operator">{operatorText}</span> : null}
        </div>
      </div>
      <p>{suggestion.detail}</p>
      <small>{suggestion.evidence}</small>
      {targets.length > 0 ? (
        <div className="transit-health-target-preview">
          <span>{suggestion.targetLabel ?? t('transitHealth.targetItem')}</span>
          <ul>
            {targets.slice(0, 3).map((target, index) => (
              <li key={`${target.kind}-${target.label}-${index}`}>
                <span className="material-symbols-outlined" aria-hidden="true">
                  {suggestionTargetIcon(target.kind)}
                </span>
                <span title={target.label}>{target.label}</span>
              </li>
            ))}
          </ul>
          <button type="button" className="secondary-action-button" onClick={onShowTargets}>
            <span className="material-symbols-outlined" aria-hidden="true">
              list_alt
            </span>
            <span>
              {t('transitHealth.viewAllTargets', {
                count: suggestion.targetCount ?? targets.length,
              })}
            </span>
          </button>
        </div>
      ) : null}
    </article>
  );
}

function SuggestionTargetsDialog({
  suggestion,
  onClose,
}: Readonly<{
  suggestion: TransitNetworkHealthSuggestion;
  onClose: () => void;
}>) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const targets = suggestion.targets ?? [];
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredTargets = normalizedQuery
    ? targets.filter((target) =>
        `${target.label} ${target.detail ?? ''} ${t(targetKindKey(target.kind))}`
          .toLocaleLowerCase()
          .includes(normalizedQuery),
      )
    : targets;

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement;
    document.body.style.overflow = 'hidden';
    dialog?.showModal();
    // 命中项较多时直接把焦点送入搜索框；否则由浏览器聚焦首个可聚焦元素（关闭按钮）
    if (targets.length > 8) {
      searchInputRef.current?.focus();
    }
    return () => {
      document.body.style.overflow = previousOverflow;
      dialog?.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
    // 弹窗打开/关闭与焦点交接只在挂载/卸载时执行一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return createPortal(
    <dialog
      ref={dialogRef}
      className="modal-panel transit-health-target-dialog"
      aria-labelledby="transit-health-target-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <header>
        <div>
          <span>{t(dimensionLabels[suggestion.dimension])}</span>
          <h2 id="transit-health-target-dialog-title">{suggestion.title}</h2>
          <p>
            {suggestion.targetLabel ?? t('transitHealth.dialogTargetLabel')} ·{' '}
            {t('transitHealth.itemCount', {
              count: suggestion.targetCount ?? targets.length,
            })}
          </p>
        </div>
        <button
          type="button"
          className="icon-button"
          onClick={onClose}
          title={t('transitHealth.dialogClose')}
          aria-label={t('transitHealth.dialogCloseAria')}
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            close
          </span>
        </button>
      </header>
      {targets.length > 8 ? (
        <label className="transit-health-target-search">
          <span className="material-symbols-outlined" aria-hidden="true">
            search
          </span>
          <span className="sr-only">{t('transitHealth.searchTargets')}</span>
          <input
            ref={searchInputRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('transitHealth.searchPlaceholder')}
          />
        </label>
      ) : null}
      <div className="transit-health-target-dialog-body">
        {filteredTargets.length > 0 ? (
          <ol>
            {filteredTargets.map((target, index) => (
              <li key={`${target.kind}-${target.label}-${index}`}>
                <span className="material-symbols-outlined" aria-hidden="true">
                  {suggestionTargetIcon(target.kind)}
                </span>
                <div>
                  <span>{t(targetKindKey(target.kind))}</span>
                  <strong>{target.label}</strong>
                  {target.detail ? <small>{target.detail}</small> : null}
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="transit-health-target-empty">{t('transitHealth.noMatchedTargets')}</p>
        )}
      </div>
    </dialog>,
    document.body,
  );
}

function suggestionTargetIcon(kind: TransitNetworkHealthSuggestionTarget['kind']): string {
  switch (kind) {
    case 'operator':
      return 'domain';
    case 'line':
      return 'route';
    case 'station':
      return 'pin_drop';
    case 'segment':
      return 'conversion_path';
    case 'place':
      return 'location_on';
    case 'category':
      return 'category';
    case 'road':
      return 'add_road';
  }
}

function targetKindKey(
  kind: TransitNetworkHealthSuggestionTarget['kind'],
): CommonMessageKey {
  const keys: Record<
    TransitNetworkHealthSuggestionTarget['kind'],
    CommonMessageKey
  > = {
    operator: 'transitHealth.kindOperator',
    line: 'transitHealth.kindLine',
    station: 'transitHealth.kindStation',
    segment: 'transitHealth.kindSegment',
    place: 'transitHealth.kindPlace',
    category: 'transitHealth.kindCategory',
    road: 'transitHealth.kindRoad',
  };
  return keys[kind];
}

function suggestionIcon(suggestion: TransitNetworkHealthSuggestion): string {
  switch (suggestion.dimension) {
    case 'operations':
      return 'schedule';
    case 'scale':
      return 'straighten';
    case 'places':
      return 'location_on';
    case 'demand':
      return 'monitoring';
    case 'data_quality':
      return 'data_check';
    default:
      return 'account_tree';
  }
}

function formatOperatorGroup(
  operators: string[] | undefined,
  t: ReturnType<typeof useI18n>['t'],
): string | undefined {
  if (!operators || operators.length === 0) {
    return undefined;
  }
  if (operators.length <= 3) {
    return operators.join('、');
  }
  return `${operators.slice(0, 3).join('、')} ${t('transitHealth.moreOperators', {
    count: operators.length,
    remaining: operators.length - 3,
  })}`;
}

function sortOperators(
  operators: TransitNetworkHealthOperatorStats[],
  sort: OperatorSortState,
): TransitNetworkHealthOperatorStats[] {
  const direction = sort.direction === 'ascending' ? 1 : -1;
  return [...operators].sort((left, right) => {
    const comparison =
      sort.key === 'operator'
        ? left.operator.localeCompare(right.operator, 'zh-CN')
        : left[sort.key] - right[sort.key];
    return comparison * direction || left.operator.localeCompare(right.operator, 'zh-CN');
  });
}

function formatInteger(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value);
}

function formatMetric(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
}

function formatPercent(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDuration(minutes: number, locale: string): string {
  if (!minutes) {
    return '—';
  }
  const roundedMinutes = Math.round(minutes);
  const hours = Math.floor(roundedMinutes / 60);
  const remainingMinutes = roundedMinutes % 60;
  if (locale.startsWith('zh')) {
    return remainingMinutes > 0 ? `${hours}小时${remainingMinutes}分` : `${hours}小时`;
  }
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

function formatMapDistance(value: number, locale: string): string {
  if (!value) {
    return '—';
  }
  if (locale.startsWith('zh')) {
    return value >= 10_000
      ? `${formatMetric(value / 10_000, locale)}万`
      : formatInteger(value, locale);
  }
  return value >= 1000
    ? `${formatInteger(value / 1000, locale)} km`
    : `${formatInteger(value, locale)} m`;
}

function buildModeConicGradient(modes: TransitNetworkHealthModeStats[]): string {
  const total = modes.reduce((sum, mode) => sum + mode.lineCount, 0);
  if (total === 0) {
    return 'conic-gradient(var(--yct-color-border) 0deg 360deg)';
  }
  let currentDegrees = 0;
  const segments = modes.map((mode) => {
    const startDegrees = currentDegrees;
    currentDegrees += (mode.lineCount / total) * 360;
    return `${mode.color} ${startDegrees}deg ${currentDegrees}deg`;
  });
  return `conic-gradient(${segments.join(', ')})`;
}

function formatDateTime(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
