'use client';

import { useEffect, useMemo, useState } from 'react';
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

const dimensionLabels: Record<TransitNetworkHealthSuggestion['dimension'], string> = {
  topology: '拓扑衔接',
  operations: '运营时间',
  scale: '空间规模',
  places: '地点覆盖',
  demand: '需求代理',
  data_quality: '数据质量',
};

export function TransitNetworkHealthPanel({
  report,
}: Readonly<{
  report: TransitNetworkHealthReport;
}>) {
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
  const scopeLabel = activeModeStats?.label ?? '全部交通方式';
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
          <p className="eyebrow">线网规划分析</p>
          <h1 id="transit-health-title">公共交通网络健康度</h1>
          <p>
            综合已发布线路拓扑、运营时间、道路节点与分类地点密度。潜在需求为规划代理值，不能替代真实客流、班次、运能和成本数据。
          </p>
        </div>
        <p className="transit-health-source">
          <span>{isOnline ? '在线快照' : '离线快照'}</span>
          数据时间 {formatDateTime(report.analyzedAt)}
          {report.sourceMessage ? <span>{report.sourceMessage}</span> : null}
          {report.planningSourceMessage ? <span>{report.planningSourceMessage}</span> : null}
        </p>
      </header>

      {report.lineCount === 0 ? (
        <div className="empty-state">
          <span className="material-symbols-outlined" aria-hidden="true">
            account_tree
          </span>
          <p>尚无已发布的公共交通线路，暂时不能生成网络统计。</p>
        </div>
      ) : (
        <>
          <fieldset className="transit-health-mode-filter" aria-label="按交通方式筛选">
            <legend className="sr-only">交通方式</legend>
            <button
              type="button"
              className={activeMode === 'all' ? 'is-active' : undefined}
              aria-pressed={activeMode === 'all'}
              onClick={() => setActiveMode('all')}
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                commute
              </span>
              全部
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
          </fieldset>

          <div className="transit-health-scope-row">
            <div className="transit-health-active-scope" aria-live="polite">
              <span className="material-symbols-outlined" aria-hidden="true">
                filter_alt
              </span>
              当前统计范围：<strong>{scopeLabel}</strong>
            </div>
            <label className="transit-health-demand-toggle">
              <input
                type="checkbox"
                role="switch"
                checked={considerExistingNetwork}
                onChange={(event) => setConsiderExistingNetwork(event.target.checked)}
              />
              <span aria-hidden="true" />
              <strong>{considerExistingNetwork ? '需求分析考虑已有线路' : '仅分析地点潜力'}</strong>
            </label>
          </div>

          <section className="transit-health-summary" aria-label={`${scopeLabel}摘要`}>
            <Metric
              label="线路数"
              value={formatInteger(scope.lineCount)}
              note={`${scope.topologyLineCount} 条形成连续站段`}
            />
            <Metric
              label="站点数"
              value={formatInteger(scope.stationCount)}
              note={`${formatPercent(scope.spatial.stationLocationCoverageRate)} 可定位`}
            />
            <Metric
              label="线网长度"
              value={formatMapDistance(scope.spatial.approximateRouteLength)}
              note={`${scope.spatial.locatedSegmentCount} 个已定位站段估算`}
            />
            <Metric
              label="时刻覆盖"
              value={formatPercent(scope.operating.scheduleCoverageRate)}
              note={`${scope.operating.scheduledLineCount}/${scope.lineCount} 条线路`}
            />
            <Metric
              label="平均运营时长"
              value={formatDuration(scope.operating.averageServiceSpanMinutes)}
              note={`${scope.operating.lateEndLineCount} 条服务至 22:00 后`}
            />
            <Metric
              label="规划地点覆盖"
              value={formatPercent(scope.planning.placeCoverageRate)}
              note={`${scope.planning.coveredPlaceCount}/${scope.planning.analyzedPlaceCount} 个地点`}
            />
            <Metric
              label="道路节点覆盖"
              value={formatPercent(scope.spatial.roadNodeCoverageRate)}
              note={`${scope.spatial.roadCount} 条道路样本`}
            />
            <Metric
              label={considerExistingNetwork ? '需求达成率' : '潜在需求总量'}
              value={
                considerExistingNetwork
                  ? formatPercent(scope.planning.demandAttainmentRate)
                  : formatMetric(scope.planning.totalDemandProxyScore)
              }
              note={
                considerExistingNetwork
                  ? `${formatMetric(scope.planning.attainedDemandProxyScore)}/${formatMetric(scope.planning.totalDemandProxyScore)} 加权需求已触达`
                  : '按真实分类地点密度加权，不考虑线路覆盖'
              }
            />
          </section>

          <section
            className="transit-health-section transit-health-visuals"
            aria-labelledby="transit-health-visuals-title"
          >
            <div className="section-heading">
              <div>
                <p className="eyebrow">统计图</p>
                <h2 id="transit-health-visuals-title">规模、运营与覆盖</h2>
              </div>
              <span className="muted">地点与距离仅使用已定位站点样本</span>
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
                <p className="eyebrow">运营方</p>
                <h2 id="transit-health-operators-title">指标与排行</h2>
              </div>
              <span className="muted">共 {scope.operators.length} 个运营方 · 点击列名排序</span>
            </div>
            <div className="transit-health-table-wrap">
              <table className="transit-health-table">
                <thead>
                  <tr>
                    <SortableHeader
                      label="运营方"
                      sortKey="operator"
                      sort={sort}
                      onSort={changeSort}
                    />
                    <SortableHeader
                      label="站点"
                      title="按该运营方线路覆盖的稳定站点 ID 去重"
                      sortKey="stationCount"
                      sort={sort}
                      onSort={changeSort}
                    />
                    <SortableHeader
                      label="线路"
                      sortKey="lineCount"
                      sort={sort}
                      onSort={changeSort}
                    />
                    <SortableHeader
                      label="平均连接度"
                      title="该运营方站点在全网中直接相邻的不同站点数平均值"
                      sortKey="averageConnectivity"
                      sort={sort}
                      onSort={changeSort}
                    />
                    <SortableHeader
                      label="连接度权重"
                      title="相邻站间路段按承载的不同线路数加权后的平均值"
                      sortKey="connectivityWeight"
                      sort={sort}
                      onSort={changeSort}
                    />
                    <SortableHeader
                      label="同路段线路数"
                      sortKey="averageLinesPerSegment"
                      sort={sort}
                      onSort={changeSort}
                    />
                    <SortableHeader
                      label="共线路段"
                      sortKey="sharedSegmentCount"
                      sort={sort}
                      onSort={changeSort}
                    />
                    <SortableHeader
                      label="时刻覆盖"
                      sortKey="scheduleCoverageRate"
                      sort={sort}
                      onSort={changeSort}
                    />
                    <SortableHeader
                      label="平均运营时长"
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
                    />
                  ))}
                </tbody>
              </table>
            </div>
            {activeMode === 'bus' || activeMode === 'all' ? (
              <p className="transit-health-table-note">
                公交线路由全网统一分配，运营商的连通片区数仅作归属统计，不作为脱网或强制接驳判断依据。
              </p>
            ) : null}
          </section>

          <section className="transit-health-method" aria-labelledby="transit-health-method-title">
            <div className="section-heading">
              <div>
                <p className="eyebrow">口径</p>
                <h2 id="transit-health-method-title">统计项目与分析来源</h2>
              </div>
              <span className="muted">不使用模拟客流</span>
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
                <dt>拓扑连接</dt>
                <dd>按连续站序形成无向边，计算连接度、共线路段、换乘站与连通片区。</dd>
              </div>
              <div>
                <dt>运营时间</dt>
                <dd>优先读取首末班，缺失时使用发车时刻表边界；跨午夜线路按次日计算。</dd>
              </div>
              <div>
                <dt>线网空间规模</dt>
                <dd>以站名和交通方式绑定地图坐标，估算站段直线长度、站间距与覆盖范围。</dd>
              </div>
              <div>
                <dt>地点覆盖</dt>
                <dd>统计居住、就业、教育、医疗、生活、文体和对外交通地点进入站点服务圈的比例。</dd>
              </div>
              <div>
                <dt>潜在需求代理</dt>
                <dd>
                  可切换纯地点聚集或已有线路触达口径；需求达成率按分类权重计算，只用于规划复核，不等同于客流预测。
                </dd>
              </div>
              <div>
                <dt>道路覆盖</dt>
                <dd>
                  以地图道路节点衡量线网覆盖边界；道路节点不是完整道路几何，不用于精确里程计算。
                </dd>
              </div>
            </dl>
          </section>

          <section
            className="transit-health-section"
            aria-labelledby="transit-health-suggestions-title"
          >
            <div className="section-heading">
              <div>
                <p className="eyebrow">多维启发式</p>
                <h2 id="transit-health-suggestions-title">线网优化建议</h2>
              </div>
              <span className="muted">相同建议已跨运营商合并</span>
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
              <p className="transit-health-empty-suggestions">
                当前切片没有触发预设启发式阈值；这不代表线路服务质量已经得到验证。
              </p>
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
}: Readonly<{
  operator: TransitNetworkHealthOperatorStats;
  modeLabelById: Map<TransitNetworkHealthModeStats['mode'], string>;
}>) {
  return (
    <tr>
      <th scope="row">
        <strong>{operator.operator}</strong>
        <small>
          {operator.modes.map((mode) => modeLabelById.get(mode) ?? mode).join(' / ')} ·{' '}
          {operator.componentCount} 个片区 · {operator.transferStationCount} 个跨运营方站点
        </small>
      </th>
      <td>
        {formatInteger(operator.stationCount)} <Rank rank={operator.ranks.stationCount} />
      </td>
      <td>
        {formatInteger(operator.lineCount)} <Rank rank={operator.ranks.lineCount} />
      </td>
      <td>
        {formatMetric(operator.averageConnectivity)}{' '}
        <Rank rank={operator.ranks.averageConnectivity} />
      </td>
      <td>
        {formatMetric(operator.connectivityWeight)}{' '}
        <Rank rank={operator.ranks.connectivityWeight} />
      </td>
      <td>
        {formatMetric(operator.averageLinesPerSegment)}{' '}
        <Rank rank={operator.ranks.averageLinesPerSegment} />
      </td>
      <td>{formatInteger(operator.sharedSegmentCount)}</td>
      <td>
        {formatPercent(operator.scheduleCoverageRate)}{' '}
        <Rank rank={operator.ranks.scheduleCoverageRate} />
      </td>
      <td>
        {operator.scheduledLineCount > 0 ? formatDuration(operator.averageServiceSpanMinutes) : '—'}{' '}
        {operator.scheduledLineCount > 0 ? (
          <Rank rank={operator.ranks.averageServiceSpanMinutes} />
        ) : null}
      </td>
    </tr>
  );
}

function Rank({ rank }: Readonly<{ rank: number }>) {
  return <small className="transit-health-rank">第 {rank} 名</small>;
}

function ModeCompositionChart({
  modes,
  activeMode,
}: Readonly<{ modes: TransitNetworkHealthModeStats[]; activeMode: ActiveMode }>) {
  const total = modes.reduce((sum, mode) => sum + mode.lineCount, 0);
  return (
    <article className="transit-health-chart">
      <header>
        <div>
          <h3>交通方式构成</h3>
          <p>线路数量及其全网占比</p>
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
          aria-label={`共 ${total} 条线路，${modes.map((mode) => `${mode.label} ${mode.lineCount} 条`).join('，')}`}
        >
          <strong>{total}</strong>
          <span>条线路</span>
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
                {mode.lineCount} · {formatPercent(mode.lineCount / Math.max(total, 1))}
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
  const maximum = Math.max(1, ...modes.map((mode) => mode.operating.averageServiceSpanMinutes));
  return (
    <article className="transit-health-chart">
      <header>
        <div>
          <h3>平均运营时长</h3>
          <p>只统计具有可解析首末时刻的线路</p>
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
                ? formatDuration(mode.operating.averageServiceSpanMinutes)
                : '缺少时刻'
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
  return (
    <article className="transit-health-chart">
      <header>
        <div>
          <h3>分类地点覆盖</h3>
          <p>进入站点服务圈的分类地点比例</p>
        </div>
        <span className="material-symbols-outlined" aria-hidden="true">
          location_on
        </span>
      </header>
      <div className="transit-health-ratio-summary">
        <RatioDonut value={coverageRate} label="地点覆盖率" />
        <p>
          <strong>{coveredCount}</strong> / {totalCount} 个规划地点进入当前交通方式的站点服务圈。
        </p>
      </div>
      <div className="transit-health-bars">
        {categories.map((category) => (
          <ChartBar
            key={category.category}
            label={category.label}
            value={category.coverageRate}
            valueLabel={`${formatPercent(category.coverageRate)} · ${category.coveredPlaceCount}/${category.placeCount}`}
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
  const stationHotspots = scope.planning.demandHotspots.slice(0, 7);
  const potentialHotspots = scope.planning.potentialDemandHotspots.slice(0, 7);
  const values = considerExistingNetwork ? stationHotspots : potentialHotspots;
  const maximum = Math.max(1, ...values.map((hotspot) => hotspot.demandProxyScore));
  return (
    <article className="transit-health-chart">
      <header>
        <div>
          <h3>{considerExistingNetwork ? '沿线需求热点' : '纯地点潜在需求中心'}</h3>
          <p>
            {considerExistingNetwork
              ? '按现有站点触达的分类地点密度加权'
              : '忽略现有线路，仅按分类地点空间聚集度计算'}
          </p>
        </div>
        <span className="material-symbols-outlined" aria-hidden="true">
          local_fire_department
        </span>
      </header>
      {considerExistingNetwork ? (
        <div className="transit-health-ratio-summary">
          <RatioDonut value={scope.planning.demandAttainmentRate} label="需求达成率" />
          <p>
            已触达 <strong>{formatMetric(scope.planning.attainedDemandProxyScore)}</strong> /{' '}
            {formatMetric(scope.planning.totalDemandProxyScore)} 加权需求代理值。
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
                  valueLabel={`${formatMetric(hotspot.demandProxyScore)} · ${hotspot.nearbyPlaceCount} 个地点`}
                  maximum={maximum}
                  color="var(--yct-color-warning, #b87900)"
                />
              ))
            : potentialHotspots.map((hotspot) => (
                <ChartBar
                  key={hotspot.placeName}
                  label={`${hotspot.placeName}周边`}
                  value={hotspot.demandProxyScore}
                  valueLabel={`${formatMetric(hotspot.demandProxyScore)} · ${hotspot.nearbyPlaceCount} 个地点`}
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
        <p className="transit-health-chart-empty">当前缺少可计算的需求热点样本。</p>
      )}
    </article>
  );
}

function OperatorScaleChart({
  operators,
}: Readonly<{ operators: TransitNetworkHealthOperatorStats[] }>) {
  const items = [...operators]
    .sort((left, right) => right.stationCount - left.stationCount)
    .slice(0, 8);
  const maximum = Math.max(1, ...items.map((operator) => operator.stationCount));
  return (
    <article className="transit-health-chart is-wide">
      <header>
        <div>
          <h3>运营方覆盖规模</h3>
          <p>按稳定站点 ID 去重，展示站点数前八名</p>
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
            valueLabel={`${operator.stationCount} 站 · ${operator.lineCount} 线`}
            maximum={maximum}
            color="var(--yct-color-primary)"
          />
        ))}
      </div>
    </article>
  );
}

function RatioDonut({ value, label }: Readonly<{ value: number; label: string }>) {
  const percentage = Math.max(0, Math.min(1, value));
  return (
    <div
      className="transit-health-donut is-ratio"
      style={{
        backgroundImage: `conic-gradient(var(--yct-color-primary) 0deg ${percentage * 360}deg, color-mix(in srgb, var(--yct-color-text-muted) 14%, transparent) ${percentage * 360}deg 360deg)`,
      }}
      role="img"
      aria-label={`${label} ${formatPercent(percentage)}`}
    >
      <strong>{formatPercent(percentage)}</strong>
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
  const operatorText = formatOperatorGroup(suggestion.operators);
  const targets = suggestion.targets ?? [];
  return (
    <article className={`transit-health-suggestion is-${suggestion.priority}`}>
      <div className="transit-health-suggestion-heading">
        <span className="material-symbols-outlined" aria-hidden="true">
          {suggestion.priority === 'attention' ? 'priority_high' : suggestionIcon(suggestion)}
        </span>
        <div>
          <span className="transit-health-dimension">{dimensionLabels[suggestion.dimension]}</span>
          <h3>{suggestion.title}</h3>
          {operatorText ? <span className="transit-health-operator">{operatorText}</span> : null}
        </div>
      </div>
      <p>{suggestion.detail}</p>
      <small>{suggestion.evidence}</small>
      {targets.length > 0 ? (
        <div className="transit-health-target-preview">
          <span>{suggestion.targetLabel ?? '命中项目'}</span>
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
          <button type="button" onClick={onShowTargets}>
            <span className="material-symbols-outlined" aria-hidden="true">
              list_alt
            </span>
            查看全部 {suggestion.targetCount ?? targets.length} 项
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
  const [query, setQuery] = useState('');
  const targets = suggestion.targets ?? [];
  const normalizedQuery = query.trim().toLocaleLowerCase('zh-CN');
  const filteredTargets = normalizedQuery
    ? targets.filter((target) =>
        `${target.label} ${target.detail ?? ''} ${suggestionTargetKindLabel(target.kind)}`
          .toLocaleLowerCase('zh-CN')
          .includes(normalizedQuery),
      )
    : targets;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  return createPortal(
    <div
      className="transit-health-target-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        className="transit-health-target-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="transit-health-target-dialog-title"
      >
        <header>
          <div>
            <span>{dimensionLabels[suggestion.dimension]}</span>
            <h2 id="transit-health-target-dialog-title">{suggestion.title}</h2>
            <p>
              {suggestion.targetLabel ?? '命中项目'} · 共 {suggestion.targetCount ?? targets.length}{' '}
              项
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            title="关闭"
            aria-label="关闭命中项目列表"
            autoFocus={targets.length <= 8}
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
            <span className="sr-only">搜索命中项目</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索线路、站点、路段或地点"
              autoFocus
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
                    <span>{suggestionTargetKindLabel(target.kind)}</span>
                    <strong>{target.label}</strong>
                    {target.detail ? <small>{target.detail}</small> : null}
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="transit-health-target-empty">没有匹配的命中项目。</p>
          )}
        </div>
      </section>
    </div>,
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

function suggestionTargetKindLabel(kind: TransitNetworkHealthSuggestionTarget['kind']): string {
  const labels: Record<TransitNetworkHealthSuggestionTarget['kind'], string> = {
    operator: '运营方',
    line: '线路',
    station: '站点',
    segment: '站间路段',
    place: '地点',
    category: '地点类别',
    road: '道路',
  };
  return labels[kind];
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

function formatOperatorGroup(operators: string[] | undefined): string | undefined {
  if (!operators || operators.length === 0) {
    return undefined;
  }
  if (operators.length <= 3) {
    return operators.join('、');
  }
  return `${operators.slice(0, 3).join('、')} 等 ${operators.length} 家运营方`;
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

function formatInteger(value: number): string {
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 }).format(value);
}

function formatMetric(value: number): string {
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(value);
}

function formatPercent(value: number): string {
  return new Intl.NumberFormat('zh-CN', {
    style: 'percent',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDuration(minutes: number): string {
  if (!minutes) {
    return '—';
  }
  const roundedMinutes = Math.round(minutes);
  const hours = Math.floor(roundedMinutes / 60);
  const remainingMinutes = roundedMinutes % 60;
  return remainingMinutes > 0 ? `${hours}小时${remainingMinutes}分` : `${hours}小时`;
}

function formatMapDistance(value: number): string {
  if (!value) {
    return '—';
  }
  return value >= 10_000 ? `${formatMetric(value / 10_000)}万` : formatInteger(value);
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

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
