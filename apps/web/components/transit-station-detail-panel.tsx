'use client';

import type { TransitStationDetailSnapshot } from '@yct/contracts';
import type { TransitLineSummary } from '../lib/legacy-transit';
import { useI18n } from '../lib/client-i18n';

type Translate = ReturnType<typeof useI18n>['t'];

export function TransitStationDetailPanel({
  detail,
  line,
}: Readonly<{
  detail: TransitStationDetailSnapshot;
  line?: TransitLineSummary;
}>) {
  const { t } = useI18n();

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
          <span>{detail.overGround ? t('stationDetail.ground') : t('stationDetail.underground')}</span>
        </span>
      </section>

      <section className="station-detail-section" aria-labelledby="station-layer-title">
        <div className="section-heading">
          <h3 id="station-layer-title">{t('stationDetail.layers.title')}</h3>
          <span className="muted">{t('stationDetail.layers.count', { count: detail.layers.length })}</span>
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
          <EmptyStationBlock label={t('stationDetail.layers.empty')} icon="layers_clear" />
        )}
      </section>

      <section className="station-detail-section" aria-labelledby="station-exit-title">
        <div className="section-heading">
          <h3 id="station-exit-title">{t('stationDetail.exits.title')}</h3>
          <span className="muted">{t('stationDetail.exits.count', { count: detail.exits.length })}</span>
        </div>
        {detail.exits.length > 0 ? (
          <div className="station-exit-grid">
            {detail.exits.map((exit) => (
              <div className="station-exit-item" key={exit.code}>
                <strong>{exit.code}</strong>
                <span>{exit.description ?? t('stationDetail.exits.noDescription')}</span>
                <span className="muted">{formatExitMeta(exit.floor, exit.direction, t)}</span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyStationBlock label={t('stationDetail.exits.empty')} icon="door_open" />
        )}
      </section>

      <section className="station-detail-section" aria-labelledby="station-facility-title">
        <div className="section-heading">
          <h3 id="station-facility-title">{t('stationDetail.facilities.title')}</h3>
          <span className="muted">
            {t('stationDetail.facilities.count', { count: detail.facilities.length })}
          </span>
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
                  <span className="muted">{formatFacilityMeta(facility, t)}</span>
                </span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyStationBlock label={t('stationDetail.facilities.empty')} icon="info" />
        )}
      </section>

      <section className="station-detail-section" aria-labelledby="station-transfer-title">
        <div className="section-heading">
          <h3 id="station-transfer-title">{t('stationDetail.related.title')}</h3>
          <span className="muted">
            {t('stationDetail.related.count', {
              count: detail.transfers.length + detail.surroundingStationNames.length,
            })}
          </span>
        </div>
        <div className="station-related-grid">
          {detail.transfers.length > 0 ? (
            <div className="station-related-card">
              <span className="material-symbols-outlined" aria-hidden="true">
                sync_alt
              </span>
              <div>
                <strong>{t('stationDetail.related.transfers')}</strong>
                <p>{formatTransfers(detail.transfers, t)}</p>
              </div>
            </div>
          ) : null}
          {detail.surroundingStationNames.length > 0 ? (
            <div className="station-related-card">
              <span className="material-symbols-outlined" aria-hidden="true">
                near_me
              </span>
              <div>
                <strong>{t('stationDetail.related.surrounding')}</strong>
                <p>{detail.surroundingStationNames.join('、')}</p>
              </div>
            </div>
          ) : null}
          {detail.transfers.length === 0 && detail.surroundingStationNames.length === 0 ? (
            <EmptyStationBlock label={t('stationDetail.related.empty')} icon="near_me_disabled" />
          ) : null}
        </div>
      </section>

      {detail.sourcePath ? (
        <p className="operation-source-note">
          {t('stationDetail.source', { source: detail.sourcePath })}
        </p>
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

function formatExitMeta(
  floor: string | undefined,
  direction: string | undefined,
  t: Translate,
): string {
  const directionLabel =
    direction === 'upwards'
      ? t('stationDetail.direction.up')
      : direction === 'downwards'
        ? t('stationDetail.direction.down')
        : '';
  return [floor, directionLabel].filter(Boolean).join(' · ') || t('stationDetail.direction.unknown');
}

function formatFacilityMeta(facility: Facility, t: Translate): string {
  return (
    [
      facility.floor,
      facility.endFloor ? t('stationDetail.facilities.toFloor', { floor: facility.endFloor }) : undefined,
      Number.isFinite(facility.location)
        ? t('stationDetail.location', { location: facility.location ?? '' })
        : undefined,
      facility.direction,
      facility.oneWay,
    ]
      .filter(Boolean)
      .join(' · ') || t('stationDetail.facilities.locationUnknown')
  );
}

function formatTransfers(transfers: Transfer[], t: Translate): string {
  return transfers
    .map((transfer) =>
      [transfer.line, transfer.floor, transfer.direction, formatLocation(transfer.location, t)]
        .filter(Boolean)
        .join(' · '),
    )
    .join('；');
}

function formatLocation(location: number | undefined, t: Translate): string | undefined {
  return Number.isFinite(location)
    ? t('stationDetail.location', { location: location ?? '' })
    : undefined;
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
