'use client';

import type { CSSProperties } from 'react';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { TransitModeProfile } from '@yct/contracts';
import type { TransitLineSummary, TransitModeSummary } from '../lib/legacy-transit';
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

type TransitMode = TransitLineSummary['mode'];
type ModeFilter = TransitMode | 'all';

export function TransitLineBrowser({
  summary,
  lines,
  modeProfiles = fallbackModeProfiles,
}: Readonly<{
  summary: TransitModeSummary[];
  lines: TransitLineSummary[];
  modeProfiles?: TransitModeProfile[];
}>) {
  const [activeMode, setActiveMode] = useState<ModeFilter>('all');
  const modeProfileByMode = useMemo(() => buildModeProfileMap(modeProfiles), [modeProfiles]);
  const sortedLines = useMemo(() => {
    return [...lines]
      .filter((line) => activeMode === 'all' || line.mode === activeMode)
      .sort((left, right) => {
        const modeCompare =
          modeOrder(left.mode, modeProfileByMode) - modeOrder(right.mode, modeProfileByMode);
        return modeCompare || left.name.localeCompare(right.name, 'zh-CN', { numeric: true });
      });
  }, [activeMode, lines, modeProfileByMode]);

  const availableModes = useMemo(
    () =>
      summary
        .filter((item) => lines.some((line) => line.mode === item.mode))
        .sort(
          (left, right) =>
            modeOrder(left.mode, modeProfileByMode) - modeOrder(right.mode, modeProfileByMode),
        ),
    [lines, modeProfileByMode, summary],
  );

  return (
    <div className="transit-overview">
      <div className="transit-summary-strip" aria-label="旧线路数据摘要">
        {availableModes.map((item) => (
          <div className="transit-summary-item" key={item.mode}>
            <span>{modeProfileByMode.get(item.mode)?.label ?? item.label}</span>
            <strong>{item.lineCount}</strong>
            <span className="muted">{item.stationCount} 站</span>
          </div>
        ))}
      </div>

      <div className="category-strip transit-filter-strip" aria-label="线路筛选">
        <button
          className={
            activeMode === 'all'
              ? 'category-chip tone-primary is-active'
              : 'category-chip tone-primary'
          }
          type="button"
          onClick={() => setActiveMode('all')}
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            route
          </span>
          <span>全部</span>
        </button>
        {availableModes.map((item) => (
          <button
            className={
              activeMode === item.mode
                ? `category-chip tone-${item.mode} is-active`
                : `category-chip tone-${item.mode}`
            }
            type="button"
            key={item.mode}
            onClick={() => setActiveMode(item.mode)}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              {modeIcon(item.mode, modeProfileByMode)}
            </span>
            <span>{modeProfileByMode.get(item.mode)?.label ?? item.label}</span>
          </button>
        ))}
      </div>

      <div className="line-list" aria-label="线路列表">
        {sortedLines.map((line) => (
          <Link
            className="line-list-item"
            href={`/map/lines/${encodeURIComponent(line.id)}`}
            key={line.id}
          >
            <span className="line-list-title">
              <span className="line-mode-icon material-symbols-outlined" aria-hidden="true">
                {modeIcon(line.mode, modeProfileByMode)}
              </span>
              <LineBadge line={line} modeProfile={modeProfileByMode.get(line.mode)} />
            </span>
            <span className="line-list-detail">
              {line.firstStationName && line.lastStationName
                ? `${line.firstStationName} - ${line.lastStationName}`
                : `${line.stationCount} 站`}
              {line.stopMetadataCount > 0 ? ` · ${line.stopMetadataCount} 项停靠属性` : ''}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
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

function modeOrder(
  mode: TransitMode,
  modeProfileByMode: Map<TransitMode, TransitModeProfile>,
): number {
  return modeProfileByMode.get(mode)?.sortOrder ?? fallbackModeProfile(mode).sortOrder;
}

function modeIcon(
  mode: TransitMode,
  modeProfileByMode: Map<TransitMode, TransitModeProfile>,
): string {
  return modeProfileByMode.get(mode)?.icon ?? fallbackModeProfile(mode).icon;
}
