'use client';

import Link from 'next/link';
import type { CSSProperties } from 'react';
import { useMemo, useState } from 'react';
import type { TransitModeProfile, TransitStationDetailSnapshot } from '@yct/contracts';
import { appPath } from '../lib/app-paths';
import { useI18n } from '../lib/client-i18n';
import type { TransitLineStopSummary, TransitLineSummary } from '../lib/legacy-transit';
import { TitleWithBreaks } from './title-with-breaks';

type Translate = ReturnType<typeof useI18n>['t'];

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

type DirectionKey = 'forward' | 'reverse';
type TransitMode = TransitLineSummary['mode'];

export function TransitLineDetailPanel({
  line,
  modeProfiles = fallbackModeProfiles,
  stationDetails = [],
}: Readonly<{
  line: TransitLineSummary;
  modeProfiles?: TransitModeProfile[];
  stationDetails?: TransitStationDetailSnapshot[];
}>) {
  const { t } = useI18n();
  const [direction, setDirection] = useState<DirectionKey>('forward');
  const modeProfileByMode = useMemo(() => buildModeProfileMap(modeProfiles), [modeProfiles]);
  const lineProfile = modeProfileByMode.get(line.mode);
  const lineColor = line.color ?? lineProfile?.color ?? fallbackModeProfile(line.mode).color;
  const directionLabels = getDirectionLabels(line, t);
  const detailByStationName = useMemo(
    () => new Map(stationDetails.map((detail) => [detail.stationName, detail])),
    [stationDetails],
  );
  const stationStops = useMemo(
    () => getDirectionalStationStops(line, direction),
    [direction, line],
  );

  return (
    <article
      className="transit-line-detail"
      style={{ '--line-detail-color': lineColor } as CSSProperties}
    >
      <section
        className="line-detail-card line-detail-identity-card"
        aria-label={t('lineDetail.overviewAria')}
      >
        <div className="line-detail-title-row">
          <span className="line-mode-icon material-symbols-outlined" aria-hidden="true">
            {modeIcon(line.mode, modeProfileByMode)}
          </span>
          <LineBadge line={line} modeProfile={lineProfile} t={t} />
        </div>
        <dl className="line-attribute-list">
          <div>
            <dt>{t('lineDetail.firstLast')}</dt>
            <dd>{formatFirstLastBus(line, t)}</dd>
          </div>
          <div>
            <dt>{t('lineDetail.operator')}</dt>
            <dd>{line.operator ?? t('lineDetail.toBeAdded')}</dd>
          </div>
          <div>
            <dt>{t('lineDetail.extraAttributes')}</dt>
            <dd>{formatExtraAttributes(line, t)}</dd>
          </div>
        </dl>
      </section>

      <section
        className="line-detail-card station-sequence"
        aria-labelledby="station-sequence-title"
      >
        <div
          className="line-direction-switch"
          role="tablist"
          aria-label={t('lineDetail.directionAria')}
        >
          <button
            className={direction === 'forward' ? 'is-active' : ''}
            type="button"
            role="tab"
            aria-selected={direction === 'forward'}
            onClick={() => setDirection('forward')}
          >
            {directionLabels.forward}
          </button>
          <button
            className={direction === 'reverse' ? 'is-active' : ''}
            type="button"
            role="tab"
            aria-selected={direction === 'reverse'}
            onClick={() => setDirection('reverse')}
          >
            {directionLabels.reverse}
          </button>
        </div>
        <h2 id="station-sequence-title" className="sr-only">
          {t('lineDetail.stationList')}
        </h2>
        {stationStops.length > 0 ? (
          <ol className="station-timeline">
            {stationStops.map((stop, index) => {
              const stationName = stop.stationName;
              return (
                <li key={`${stationName}-${stop.sequence}-${index}`}>
                  <span className="station-node" aria-hidden="true" />
                  <span className="station-copy">
                    <strong>
                      {detailByStationName.has(stationName) ? (
                        <Link
                          className="station-detail-link"
                          href={appPath(`/search?q=${encodeURIComponent(stationName)}`)}
                        >
                          <TitleWithBreaks title={stationName} />
                        </Link>
                      ) : (
                        <TitleWithBreaks title={stationName} />
                      )}
                    </strong>
                    {stop.oneWay ? (
                      <span className="station-stop-direction">
                        {formatTransitStopOneWayLabel(stop.oneWay, t)}
                      </span>
                    ) : null}
                    <StationDetailSummary detail={detailByStationName.get(stationName)} t={t} />
                  </span>
                </li>
              );
            })}
          </ol>
        ) : (
          <div className="empty-state">
            <span className="material-symbols-outlined" aria-hidden="true">
              route
            </span>
            <p>{t('lineDetail.stationListEmpty')}</p>
          </div>
        )}
      </section>

      {line.sourcePath ? (
        <p className="operation-source-note">
          {t('lineDetail.source', { source: line.sourcePath })}
        </p>
      ) : null}
    </article>
  );
}

function StationDetailSummary({
  detail,
  t,
}: Readonly<{
  detail?: TransitStationDetailSnapshot;
  t: Translate;
}>) {
  if (!detail) {
    return null;
  }

  const transferLines = detail.transfers.map((transfer) => transfer.line).filter(Boolean);
  const items = [
    detail.exits.length > 0
      ? t('lineDetail.summary.exits', { count: detail.exits.length })
      : undefined,
    detail.facilities.length > 0
      ? t('lineDetail.summary.facilities', { count: countFacilityTypes(detail) })
      : undefined,
    transferLines.length > 0
      ? t('lineDetail.summary.transfer', { lines: Array.from(new Set(transferLines)).join('、') })
      : undefined,
    detail.surroundingStationNames.length > 0
      ? t('lineDetail.summary.surrounding', {
          count: detail.surroundingStationNames.length,
        })
      : undefined,
  ].filter((item): item is string => Boolean(item));

  if (items.length === 0) {
    return null;
  }

  return <span className="station-detail-summary">{items.join(' · ')}</span>;
}

function countFacilityTypes(detail: TransitStationDetailSnapshot): number {
  return new Set(detail.facilities.map((facility) => facility.type)).size;
}

function LineBadge({
  line,
  modeProfile,
  t,
}: Readonly<{
  line: TransitLineSummary;
  modeProfile?: TransitModeProfile;
  t: Translate;
}>) {
  const tone = line.color ?? modeProfile?.color ?? fallbackModeProfile(line.mode).color;
  const metroMatch = line.mode === 'metro' ? line.name.match(/^(\d+)(.*)$/) : null;

  if (metroMatch) {
    return (
      <span
        className="line-badge is-metro-token"
        style={{ '--line-badge-color': tone } as CSSProperties}
      >
        <span className="line-metro-token">{metroMatch[1]}</span>
        <span>
          <TitleWithBreaks title={metroMatch[2] || t('lineDetail.metroSuffix')} />
        </span>
      </span>
    );
  }

  return (
    <span
      className={line.mode === 'tram' ? 'line-badge is-outline' : 'line-badge'}
      style={{ '--line-badge-color': tone } as CSSProperties}
    >
      <span>
        <TitleWithBreaks title={line.name} />
      </span>
    </span>
  );
}

function getDirectionLabels(line: TransitLineSummary, t: Translate): Record<DirectionKey, string> {
  const first = line.firstStationName ?? t('lineDetail.firstStation');
  const last = line.lastStationName ?? t('lineDetail.lastStation');

  return {
    forward: t('lineDetail.directionTo', { station: formatDirectionTerminalName(last) }),
    reverse: t('lineDetail.directionTo', { station: formatDirectionTerminalName(first) }),
  };
}

function getDirectionalStationStops(
  line: TransitLineSummary,
  direction: DirectionKey,
): TransitLineStopSummary[] {
  const sourceStops: TransitLineStopSummary[] =
    line.stationStops.length > 0
      ? line.stationStops
      : line.stationNames.map((stationName, sequence) => ({
          stationName,
          sequence,
        }));
  const filteredStops = sourceStops.filter((stop) =>
    isStationStopVisibleInDirection(stop, direction),
  );
  const sortedStops = [...filteredStops].sort((left, right) => left.sequence - right.sequence);

  return direction === 'forward' ? sortedStops : sortedStops.reverse();
}

function isStationStopVisibleInDirection(
  stop: TransitLineStopSummary,
  direction: DirectionKey,
): boolean {
  return direction === 'forward' ? stop.oneWay !== 'up' : stop.oneWay !== 'down';
}

function formatTransitStopOneWayLabel(
  oneWay: TransitLineStopSummary['oneWay'],
  t: Translate,
): string {
  // 旧版 YCT 数据中 down 表示和数据记录方向相同，up 表示反向。
  return oneWay === 'down' ? t('lineDetail.oneWay.forward') : t('lineDetail.oneWay.reverse');
}

function formatDirectionTerminalName(name: string): string {
  return name.replace(/\s+/g, '').replace(/\|/g, '');
}

function formatFirstLastBus(line: TransitLineSummary, t: Translate): string {
  const first = line.firstLastBus?.first;
  const last = line.firstLastBus?.last;

  if (first && last) {
    return `${first}-${last}`;
  }

  return first ?? last ?? t('lineDetail.toBeAdded');
}

function formatExtraAttributes(line: TransitLineSummary, t: Translate): string {
  const values = [
    line.fare ? t('lineDetail.extra.fare', { fare: line.fare }) : undefined,
    line.departureTimes?.length
      ? t('lineDetail.extra.departures', { count: line.departureTimes.length })
      : undefined,
    line.stopMetadataCount > 0
      ? t('lineDetail.extra.stopMetadata', { count: line.stopMetadataCount })
      : undefined,
    t('lineDetail.extra.stations', { count: line.stationCount }),
  ].filter((value): value is string => Boolean(value));

  return values.join(' · ');
}

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

function modeIcon(
  mode: TransitMode,
  modeProfileByMode: Map<TransitMode, TransitModeProfile>,
): string {
  return modeProfileByMode.get(mode)?.icon ?? fallbackModeProfile(mode).icon;
}
