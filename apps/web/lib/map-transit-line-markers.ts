import type {
  MapMarkerSnapshot,
  TransitLineSnapshot,
  TransitModeProfile,
  TransitStationSnapshot,
} from '@yct/contracts';
import { appPath } from './app-paths';
import { readLegacyTransitSnapshot } from './legacy-transit';
import { createTimedCache } from './server-cache';
import { readPublishedTransitEntitySnapshot } from './published-transit-read-model';
import { readTransitModeProfiles } from './transit-mode-profile-store';

const transitLinePoiMarkerCache = createTimedCache<MapMarkerSnapshot['markers']>(60 * 1000);

export async function readTransitLinePoiMarkers(): Promise<MapMarkerSnapshot['markers']> {
  return transitLinePoiMarkerCache.read(
    'transit-line-poi-markers',
    readTransitLinePoiMarkersUncached,
  );
}

export function clearTransitLinePoiMarkerCache(): void {
  transitLinePoiMarkerCache.clear();
}

async function readTransitLinePoiMarkersUncached(): Promise<MapMarkerSnapshot['markers']> {
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
      href: appPath(`/map/lines/${encodeURIComponent(line.sourceId)}`),
    };
  });
}

async function readTransitSnapshotForMap(): Promise<{
  lines: TransitLineSnapshot[];
  stations: TransitStationSnapshot[];
} | null> {
  const publishedSnapshot = await readPublishedTransitEntitySnapshot();
  if (publishedSnapshot) {
    return {
      lines: publishedSnapshot.lines,
      stations: publishedSnapshot.stations,
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

  const appendCoordinate = (coordinate: [number, number] | undefined) => {
    if (!coordinate || !Number.isFinite(coordinate[0]) || !Number.isFinite(coordinate[1])) {
      return;
    }
    const key = `${coordinate[0]}:${coordinate[1]}`;
    if (!seen.has(key)) {
      seen.add(key);
      coordinates.push(coordinate);
    }
  };

  if (line.routeNodes?.length) {
    for (const node of line.routeNodes) {
      if (node.kind === 'waypoint') {
        appendCoordinate([node.x, node.z]);
        continue;
      }
      const station = stationById.get(node.stationSourceId);
      appendCoordinate(
        station?.x !== undefined && station.z !== undefined ? [station.x, station.z] : undefined,
      );
    }
    return coordinates;
  }

  const segmentPathByKey = new Map(
    (line.segmentPaths ?? []).map((path) => [
      `${path.fromStationSourceId}->${path.toStationSourceId}`,
      path,
    ]),
  );

  for (const [index, stationSourceId] of line.stationSourceIds.entries()) {
    const station = stationById.get(stationSourceId);
    appendCoordinate(
      station?.x !== undefined && station.z !== undefined ? [station.x, station.z] : undefined,
    );
    const nextStationSourceId = line.stationSourceIds[index + 1];
    const path = nextStationSourceId
      ? segmentPathByKey.get(`${stationSourceId}->${nextStationSourceId}`)
      : undefined;
    for (const waypoint of path?.waypoints ?? []) {
      appendCoordinate([waypoint.x, waypoint.z]);
    }
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
    coordinateCount > 0 ? `站点坐标直连 ${coordinateCount} 个点` : '待补线路坐标',
  ];

  return parts.join(' · ');
}
