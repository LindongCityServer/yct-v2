'use client';

import Link from 'next/link';
import type { CSSProperties } from 'react';
import { useMemo, useState } from 'react';
import type { TransitModeProfile, TransitStationDetailSnapshot } from '@yct/contracts';
import type { TransitLineSummary } from '../lib/legacy-transit';
import { TitleWithBreaks } from './title-with-breaks';

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
  const [direction, setDirection] = useState<DirectionKey>('forward');
  const modeProfileByMode = useMemo(() => buildModeProfileMap(modeProfiles), [modeProfiles]);
  const lineProfile = modeProfileByMode.get(line.mode);
  const lineColor = line.color ?? lineProfile?.color ?? fallbackModeProfile(line.mode).color;
  const directionLabels = getDirectionLabels(line);
  const detailByStationName = useMemo(
    () => new Map(stationDetails.map((detail) => [detail.stationName, detail])),
    [stationDetails],
  );
  const stationNames = useMemo(() => {
    return direction === 'forward' ? line.stationNames : [...line.stationNames].reverse();
  }, [direction, line.stationNames]);

  return (
    <article
      className="transit-line-detail"
      style={{ '--line-detail-color': lineColor } as CSSProperties}
    >
      <section className="line-detail-card line-detail-identity-card" aria-label="线路概览">
        <div className="line-detail-title-row">
          <span className="line-mode-icon material-symbols-outlined" aria-hidden="true">
            {modeIcon(line.mode, modeProfileByMode)}
          </span>
          <LineBadge line={line} modeProfile={lineProfile} />
        </div>
        <dl className="line-attribute-list">
          <div>
            <dt>首末车时间</dt>
            <dd>{formatFirstLastBus(line)}</dd>
          </div>
          <div>
            <dt>运营单位</dt>
            <dd>{line.operator ?? '待补充'}</dd>
          </div>
          <div>
            <dt>其他线路属性</dt>
            <dd>{formatExtraAttributes(line)}</dd>
          </div>
        </dl>
      </section>

      <section
        className="line-detail-card station-sequence"
        aria-labelledby="station-sequence-title"
      >
        <div className="line-direction-switch" role="tablist" aria-label="线路方向">
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
          站点列表
        </h2>
        {stationNames.length > 0 ? (
          <ol className="station-timeline">
            {stationNames.map((stationName, index) => (
              <li key={`${stationName}-${index}`}>
                <span className="station-node" aria-hidden="true" />
                <span className="station-copy">
                  <strong>
                    {detailByStationName.has(stationName) ? (
                      <Link
                        className="station-detail-link"
                        href={`/travel/stations/${encodeURIComponent(line.name)}/${encodeURIComponent(stationName)}`}
                      >
                        <TitleWithBreaks title={stationName} />
                      </Link>
                    ) : (
                      <TitleWithBreaks title={stationName} />
                    )}
                  </strong>
                  <StationDetailSummary detail={detailByStationName.get(stationName)} />
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <div className="empty-state">
            <span className="material-symbols-outlined" aria-hidden="true">
              route
            </span>
            <p>这条线路暂未导入站点列表</p>
          </div>
        )}
      </section>

      {line.sourcePath ? (
        <p className="operation-source-note">数据来源：{line.sourcePath}</p>
      ) : null}
    </article>
  );
}

function StationDetailSummary({
  detail,
}: Readonly<{
  detail?: TransitStationDetailSnapshot;
}>) {
  if (!detail) {
    return null;
  }

  const transferLines = detail.transfers.map((transfer) => transfer.line).filter(Boolean);
  const items = [
    detail.exits.length > 0 ? `${detail.exits.length} 个出入口` : undefined,
    detail.facilities.length > 0 ? `${countFacilityTypes(detail)} 类设施` : undefined,
    transferLines.length > 0 ? `换乘 ${Array.from(new Set(transferLines)).join('、')}` : undefined,
    detail.surroundingStationNames.length > 0
      ? `周边 ${detail.surroundingStationNames.length} 站`
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
}: Readonly<{
  line: TransitLineSummary;
  modeProfile?: TransitModeProfile;
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
          <TitleWithBreaks title={metroMatch[2] || '号线'} />
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

function getDirectionLabels(line: TransitLineSummary): Record<DirectionKey, string> {
  const first = line.firstStationName ?? '第一站';
  const last = line.lastStationName ?? '最后一站';

  return {
    forward: `${last}方向`,
    reverse: `${first}方向`,
  };
}

function formatFirstLastBus(line: TransitLineSummary): string {
  const first = line.firstLastBus?.first;
  const last = line.firstLastBus?.last;

  if (first && last) {
    return `${first}-${last}`;
  }

  return first ?? last ?? '待补充';
}

function formatExtraAttributes(line: TransitLineSummary): string {
  const values = [
    line.fare ? `票价 ${line.fare}` : undefined,
    line.departureTimes?.length ? `${line.departureTimes.length} 个班次` : undefined,
    line.stopMetadataCount > 0 ? `${line.stopMetadataCount} 项停靠属性` : undefined,
    `${line.stationCount} 站`,
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
