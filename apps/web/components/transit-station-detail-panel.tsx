import type { TransitStationDetailSnapshot } from '@yct/contracts';
import type { TransitLineSummary } from '../lib/legacy-transit';

export function TransitStationDetailPanel({
  detail,
  line,
}: Readonly<{
  detail: TransitStationDetailSnapshot;
  line?: TransitLineSummary;
}>) {
  return (
    <article className="station-detail-page">
      <section className="station-detail-hero" aria-labelledby="station-detail-title">
        <div>
          <span className="station-detail-kicker">{detail.lineName}</span>
          <h2 id="station-detail-title">{detail.stationName}</h2>
        </div>
        <span className="station-detail-mode">
          <span className="material-symbols-outlined" aria-hidden="true">
            {line?.mode === 'metro' ? 'subway' : 'train'}
          </span>
          <span>{detail.overGround ? '地面站' : '地下站'}</span>
        </span>
      </section>

      <section className="station-detail-section" aria-labelledby="station-layer-title">
        <div className="section-heading">
          <h3 id="station-layer-title">站内层级</h3>
          <span className="muted">{detail.layers.length} 层</span>
        </div>
        {detail.layers.length > 0 ? (
          <div className="station-layer-list">
            {detail.layers.map((layer) => (
              <div className="station-layer-item" key={`${layer.floor}-${layer.type}`}>
                <strong>{layer.floor}</strong>
                <span>{layer.type}</span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyStationBlock label="暂无站内层级数据" icon="layers_clear" />
        )}
      </section>

      <section className="station-detail-section" aria-labelledby="station-exit-title">
        <div className="section-heading">
          <h3 id="station-exit-title">出入口</h3>
          <span className="muted">{detail.exits.length} 个</span>
        </div>
        {detail.exits.length > 0 ? (
          <div className="station-exit-grid">
            {detail.exits.map((exit) => (
              <div className="station-exit-item" key={exit.code}>
                <strong>{exit.code}</strong>
                <span>{exit.description ?? '暂无描述'}</span>
                <span className="muted">{formatExitMeta(exit.floor, exit.direction)}</span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyStationBlock label="暂无出入口数据" icon="door_open" />
        )}
      </section>

      <section className="station-detail-section" aria-labelledby="station-facility-title">
        <div className="section-heading">
          <h3 id="station-facility-title">站内设施</h3>
          <span className="muted">{detail.facilities.length} 项</span>
        </div>
        {detail.facilities.length > 0 ? (
          <div className="station-facility-list">
            {detail.facilities.map((facility, index) => (
              <div
                className="station-facility-item"
                key={`${facility.type}-${facility.floor ?? 'floor'}-${facility.location ?? index}`}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  {facilityIcon(facility.type)}
                </span>
                <span>
                  <strong>{facility.type}</strong>
                  <span className="muted">{formatFacilityMeta(facility)}</span>
                </span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyStationBlock label="暂无设施数据" icon="info" />
        )}
      </section>

      <section className="station-detail-section" aria-labelledby="station-transfer-title">
        <div className="section-heading">
          <h3 id="station-transfer-title">换乘与周边</h3>
          <span className="muted">
            {detail.transfers.length + detail.surroundingStationNames.length} 项
          </span>
        </div>
        <div className="station-related-grid">
          {detail.transfers.length > 0 ? (
            <div className="station-related-card">
              <span className="material-symbols-outlined" aria-hidden="true">
                sync_alt
              </span>
              <div>
                <strong>换乘线路</strong>
                <p>{formatTransfers(detail.transfers)}</p>
              </div>
            </div>
          ) : null}
          {detail.surroundingStationNames.length > 0 ? (
            <div className="station-related-card">
              <span className="material-symbols-outlined" aria-hidden="true">
                near_me
              </span>
              <div>
                <strong>周边站点</strong>
                <p>{detail.surroundingStationNames.join('、')}</p>
              </div>
            </div>
          ) : null}
          {detail.transfers.length === 0 && detail.surroundingStationNames.length === 0 ? (
            <EmptyStationBlock label="暂无换乘或周边站点数据" icon="near_me_disabled" />
          ) : null}
        </div>
      </section>

      {detail.sourcePath ? (
        <p className="operation-source-note">数据来源：{detail.sourcePath}</p>
      ) : null}
    </article>
  );
}

type Facility = TransitStationDetailSnapshot['facilities'][number];
type Transfer = TransitStationDetailSnapshot['transfers'][number];

function EmptyStationBlock({ label, icon }: Readonly<{ label: string; icon: string }>) {
  return (
    <div className="station-empty-block">
      <span className="material-symbols-outlined" aria-hidden="true">
        {icon}
      </span>
      <span>{label}</span>
    </div>
  );
}

function formatExitMeta(floor: string | undefined, direction: string | undefined): string {
  const directionLabel = direction === 'upwards' ? '上行' : direction === 'downwards' ? '下行' : '';
  return [floor, directionLabel].filter(Boolean).join(' · ') || '方向待补';
}

function formatFacilityMeta(facility: Facility): string {
  return (
    [
      facility.floor,
      facility.endFloor ? `至 ${facility.endFloor}` : undefined,
      Number.isFinite(facility.location) ? `位置 ${facility.location}` : undefined,
      facility.direction,
      facility.oneWay,
    ]
      .filter(Boolean)
      .join(' · ') || '位置待补'
  );
}

function formatTransfers(transfers: Transfer[]): string {
  return transfers
    .map((transfer) =>
      [transfer.line, transfer.floor, transfer.direction, formatLocation(transfer.location)]
        .filter(Boolean)
        .join(' · '),
    )
    .join('；');
}

function formatLocation(location: number | undefined): string | undefined {
  return Number.isFinite(location) ? `位置 ${location}` : undefined;
}

function facilityIcon(type: string): string {
  if (/电梯|升降/i.test(type)) {
    return 'elevator';
  }
  if (/扶梯|楼梯/i.test(type)) {
    return 'stairs';
  }
  if (/卫生|厕所|洗手/i.test(type)) {
    return 'wc';
  }
  if (/客服|服务|问询/i.test(type)) {
    return 'support_agent';
  }
  if (/闸机|进站|出站/i.test(type)) {
    return 'confirmation_number';
  }

  return 'info';
}
