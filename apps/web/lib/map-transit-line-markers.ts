import type {
  MapMarkerSnapshot,
  TransitLineSnapshot,
  TransitModeProfile,
  TransitStationSnapshot,
} from '@yct/contracts';
import { readLegacyTransitSnapshot } from './legacy-transit';
import { findPublishedTransitDataRevision } from './transit-data-store';
import { readTransitModeProfiles } from './transit-mode-profile-store';

export async function readTransitLinePoiMarkers(): Promise<MapMarkerSnapshot['markers']> {
  const snapshot = await readTransitSnapshotForMap();
  if (!snapshot) {
    return [];
  }

  const modeProfiles = await readTransitModeProfiles();
  const modeProfileByMode = new Map(modeProfiles.map((profile) => [profile.mode, profile]));
  const stationById = new Map(snapshot.stations.map((station) => [station.sourceId, station]));

  return snapshot.lines.map((line) => {
    const profile = modeProfileByMode.get(line.mode);
    const coordinates = collectLineCoordinates(line, stationById);
    return {
      id: `transit-line-${line.sourceId}`,
      label: line.name,
      categoryId: 'transit-line',
      geometry: {
        type: 'MultiPoint',
        coordinates,
      },
      symbolIcon: profile?.icon ?? 'route',
      accentColor: line.color ?? profile?.color,
      description: buildLineDescription(line, profile, coordinates.length),
      href: `/map/lines/${encodeURIComponent(line.sourceId)}`,
    };
  });
}

async function readTransitSnapshotForMap(): Promise<{
  lines: TransitLineSnapshot[];
  stations: TransitStationSnapshot[];
} | null> {
  const publishedRevision = await findPublishedTransitDataRevision();
  if (publishedRevision) {
    return {
      lines: publishedRevision.lines,
      stations: publishedRevision.stations,
    };
  }

  const legacy = await readLegacyTransitSnapshot();
  if (!legacy.snapshot) {
    return null;
  }

  return {
    lines: legacy.snapshot.lines,
    stations: legacy.snapshot.stations,
  };
}

function collectLineCoordinates(
  line: TransitLineSnapshot,
  stationById: Map<string, TransitStationSnapshot>,
): Array<[number, number]> {
  const seen = new Set<string>();
  const coordinates: Array<[number, number]> = [];

  for (const stationSourceId of line.stationSourceIds) {
    const station = stationById.get(stationSourceId);
    const x = station?.x;
    const z = station?.z;
    if (!Number.isFinite(x) || !Number.isFinite(z)) {
      continue;
    }

    const coordinate: [number, number] = [x as number, z as number];
    const key = `${coordinate[0]}:${coordinate[1]}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    coordinates.push(coordinate);
  }

  return coordinates;
}

function buildLineDescription(
  line: TransitLineSnapshot,
  profile: TransitModeProfile | undefined,
  coordinateCount: number,
): string {
  const parts = [
    profile?.label ?? line.mode,
    `${line.stationSourceIds.length} 站`,
    coordinateCount > 0 ? `已记录 ${coordinateCount} 个途径坐标` : '待补线路坐标',
  ];

  return parts.join(' · ');
}
