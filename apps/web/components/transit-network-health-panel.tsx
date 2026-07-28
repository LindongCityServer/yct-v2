import type {
  TransitNetworkHealthOperatorStats,
  TransitNetworkHealthReport,
  TransitNetworkHealthSuggestion,
} from '@yct/contracts';

export function TransitNetworkHealthPanel({
  report,
}: Readonly<{
  report: TransitNetworkHealthReport;
}>) {
  return (
    <section className="transit-health-panel module-panel" aria-labelledby="transit-health-title">
      <header className="transit-health-header">
        <div>
          <p className="eyebrow">真实拓扑统计</p>
          <h1 id="transit-health-title">公共交通网络健康度</h1>
          <p>
            基于当前已发布线路的连续站序计算。建议仅为拓扑启发式，不包含客流、班次、道路条件或运营成本。
          </p>
        </div>
        <p className="transit-health-source">
          数据时间 {formatDateTime(report.analyzedAt)}
          {report.sourceMessage ? <span>{report.sourceMessage}</span> : null}
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
          <section className="transit-health-summary" aria-label="全网拓扑摘要">
            <Metric
              label="线路数"
              value={report.lineCount}
              note={`${report.topologyLineCount} 条形成连续站段`}
            />
            <Metric label="站点数" value={report.stationCount} note="按稳定站点 ID 去重" />
            <Metric
              label="站间路段"
              value={report.topologySegmentCount}
              note="相邻站点形成的无向边"
            />
            <Metric label="共线路段" value={report.sharedSegmentCount} note="承载两条及以上线路" />
            <Metric
              label="跨运营方站点"
              value={report.transferStationCount}
              note="共享同一稳定站点 ID"
            />
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
              <span className="muted">共 {report.operators.length} 个运营方</span>
            </div>
            <div className="transit-health-table-wrap">
              <table className="transit-health-table">
                <thead>
                  <tr>
                    <th scope="col">运营方</th>
                    <th scope="col" title="按该运营方线路覆盖的稳定站点 ID 去重">
                      站点
                    </th>
                    <th scope="col">线路</th>
                    <th scope="col" title="该运营方站点在全网中直接相邻的不同站点数平均值">
                      平均连接度
                    </th>
                    <th scope="col" title="相邻站间路段按承载的不同线路数加权后的平均值">
                      连接度权重
                    </th>
                    <th scope="col" title="该运营方经过路段承载的不同线路数平均值">
                      同路段线路数
                    </th>
                    <th scope="col">共线路段</th>
                  </tr>
                </thead>
                <tbody>
                  {report.operators.map((operator) => (
                    <OperatorRow key={operator.operator} operator={operator} />
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="transit-health-method" aria-labelledby="transit-health-method-title">
            <h2 id="transit-health-method-title">指标口径</h2>
            <dl>
              <div>
                <dt>平均连接度</dt>
                <dd>每个站点在全网中相邻的不同站点数平均值。</dd>
              </div>
              <div>
                <dt>连接度权重</dt>
                <dd>相邻站间路段按经过的不同线路数加权，再按站点取平均。</dd>
              </div>
              <div>
                <dt>同路段线路数</dt>
                <dd>该运营方经过的每个站间路段上，承载的不同线路数平均值。</dd>
              </div>
            </dl>
          </section>

          <section
            className="transit-health-section"
            aria-labelledby="transit-health-suggestions-title"
          >
            <div className="section-heading">
              <div>
                <p className="eyebrow">启发式</p>
                <h2 id="transit-health-suggestions-title">新线与优化建议</h2>
              </div>
              <span className="muted">需要结合客流、道路与运营约束复核</span>
            </div>
            {report.suggestions.length > 0 ? (
              <div className="transit-health-suggestions">
                {report.suggestions.map((suggestion) => (
                  <SuggestionCard key={suggestion.id} suggestion={suggestion} />
                ))}
              </div>
            ) : (
              <p className="transit-health-empty-suggestions">
                当前拓扑没有触发预设启发式阈值；这不代表线路服务质量已经得到验证。
              </p>
            )}
          </section>
        </>
      )}
    </section>
  );
}

function Metric({ label, value, note }: Readonly<{ label: string; value: number; note: string }>) {
  return (
    <div className="transit-health-metric">
      <span>{label}</span>
      <strong>{formatInteger(value)}</strong>
      <small>{note}</small>
    </div>
  );
}

function OperatorRow({ operator }: Readonly<{ operator: TransitNetworkHealthOperatorStats }>) {
  return (
    <tr>
      <th scope="row">
        <strong>{operator.operator}</strong>
        <small>
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
    </tr>
  );
}

function Rank({ rank }: Readonly<{ rank: number }>) {
  return <small className="transit-health-rank">第 {rank} 名</small>;
}

function SuggestionCard({
  suggestion,
}: Readonly<{
  suggestion: TransitNetworkHealthSuggestion;
}>) {
  return (
    <article className={`transit-health-suggestion is-${suggestion.priority}`}>
      <div>
        <span className="material-symbols-outlined" aria-hidden="true">
          {suggestion.priority === 'attention' ? 'priority_high' : 'lightbulb'}
        </span>
        <div>
          <h3>{suggestion.title}</h3>
          {suggestion.operator ? (
            <span className="transit-health-operator">{suggestion.operator}</span>
          ) : null}
        </div>
      </div>
      <p>{suggestion.detail}</p>
      <small>{suggestion.evidence}</small>
    </article>
  );
}

function formatInteger(value: number): string {
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 }).format(value);
}

function formatMetric(value: number): string {
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(value);
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
