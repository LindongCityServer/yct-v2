import type { MaterialTransitStationExit, MaterialTransitStationProfile } from '@yct/contracts';
import sampleStationExits from './data/shenyang-sample-station-exits.json';

export interface ShenyangSampleExit {
  code: string;
  description?: string;
  direction?: 'upwards' | 'downwards';
  orientation?: 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';
  status?: 'open' | 'closed' | 'reserved';
  order?: number;
  lineKeys?: string[];
  hasAccessibleElevator?: boolean;
  facilities?: Array<{ symbolIcon: string; description: string }>;
}

export interface ShenyangSampleLineGroup {
  lineKey: string;
  lineName: string;
  exits: ShenyangSampleExit[];
}

export interface ShenyangSampleStationProfile {
  nodeId: string;
  stationName: string;
  lineGroups: ShenyangSampleLineGroup[];
}

interface ShenyangSampleStationExitsFile {
  version: number;
  generatedAt: string;
  source: string;
  stations: ShenyangSampleStationProfile[];
}

const stationExitsFile = sampleStationExits as ShenyangSampleStationExitsFile;
const profilesByName = new Map(
  stationExitsFile.stations.map((profile) => [profile.stationName, profile] as const),
);
const profilesByNodeId = new Map(
  stationExitsFile.stations.map((profile) => [profile.nodeId, profile] as const),
);
export const SHENYANG_SAMPLE_STATION_PROFILES = stationExitsFile.stations;

export function getShenyangSampleStationProfile(
  stationName: string,
): ShenyangSampleStationProfile | undefined {
  return profilesByName.get(stationName.trim());
}

export function getShenyangSampleStationProfileByNodeId(
  nodeId: string,
): ShenyangSampleStationProfile | undefined {
  return profilesByNodeId.get(nodeId);
}

export const SHENYANG_SAMPLE_STATION_EXITS_SOURCE = stationExitsFile.source;

const line3GroundStationNames = new Set([
  '李达',
  '铁西汽车工厂',
  '马贝',
  '中德大街',
  '细河悠谷',
  '翟家',
  '工业大学',
  '宁官',
  '余良',
]);

export function isShenyangSampleGroundStation(stationName: string): boolean {
  return line3GroundStationNames.has(stationName.trim());
}

function toMaterialExit(exit: ShenyangSampleExit, index: number): MaterialTransitStationExit {
  return {
    code: exit.code,
    description: exit.description,
    direction: exit.direction,
    orientation: exit.orientation,
    status: exit.status,
    order: exit.order ?? index,
    lineKeys: exit.lineKeys,
  };
}

/**
 * 给「管理车站资料」和旧版模板库兜底用的 profile：
 * - `exits` 是平铺去重，资料面板靠它统计“已填出口”；
 * - `lineGroups` 保留按线路分组的出口；
 * - 沈阳 3 号线李达—余良补 `structure.overGround`，与地上站语义一致。
 */
export function buildShenyangSamplePanelProfiles(): MaterialTransitStationProfile[] {
  return stationExitsFile.stations.map((profile) => {
    const byCode = new Map<string, MaterialTransitStationExit>();
    const lineGroups = profile.lineGroups.map((group) => ({
      lineKey: group.lineKey,
      lineName: group.lineName,
      exits: group.exits.map((exit, index) => {
        const mapped = toMaterialExit(exit, index);
        if (!byCode.has(mapped.code)) byCode.set(mapped.code, mapped);
        return mapped;
      }),
    }));
    const isLine3Ground =
      line3GroundStationNames.has(profile.stationName) &&
      profile.lineGroups.some((group) => group.lineName === '3号线');
    return {
      nodeId: profile.nodeId,
      exits: Array.from(byCode.values()),
      lineGroups,
      structure: {
        position: isLine3Ground ? ('ground' as const) : ('underground' as const),
        overGround: isLine3Ground,
        platforms: profile.lineGroups.map((group) => ({ lineKeys: [group.lineKey] })),
      },
    };
  });
}
