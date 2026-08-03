import type {
  MapMarkerSnapshot,
  TransitLineSnapshot,
  TransitModeProfile,
  TransitOperationStatus,
  TransitStationSnapshot,
} from '@yct/contracts';
import { appPath } from './app-paths';
import { readLegacyTransitSnapshot } from './legacy-transit';
import { createTimedCache } from './server-cache';
import {
  filterMapVisibleTransitSnapshot,
  readPublishedTransitEntitySnapshot,
} from './published-transit-read-model';
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
    const transitLineSegments = collectLineSegments(line, stationById).filter(
      (segment): segment is VisibleTransitLineSegment =>
        segment.operationStatus === 'operating' ||
        (segment.operationStatus === 'planned' && profile?.showPlannedSegments === true),
    );
    const coordinates = transitLineSegments.flatMap((segment) => segment.coordinates);
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
      transitLineSegments,
      description: buildLineDescription(line, profile, coordinates.length),
      href: appPath(`/map?marker=${encodeURIComponent(`transit-line-${line.sourceId}`)}`),
    };
  });
}

interface TransitLineSegmentCandidate {
  coordinates: Array<[number, number]>;
  operationStatus: TransitOperationStatus;
}

type VisibleTransitLineSegment = NonNullable<
  MapMarkerSnapshot['markers'][number]['transitLineSegments']
>[number];

function collectLineSegments(
  line: TransitLineSnapshot,
  stationById: Map<string, TransitStationSnapshot>,
): TransitLineSegmentCandidate[] {
  const pathByKey = new Map(
    (line.segmentPaths ?? []).map((path) => [
      `${path.fromStationSourceId}->${path.toStationSourceId}`,
      path,
    ]),
  );
  const routeNodeWaypointsByKey = new Map<string, Array<[number, number]>>();
  let previousRouteNodeStationId: string | undefined;
  let pendingRouteNodeWaypoints: Array<[number, number]> = [];
  for (const node of line.routeNodes ?? []) {
    if (node.kind === 'waypoint') {
      pendingRouteNodeWaypoints.push([node.x, node.z]);
      continue;
    }
    if (previousRouteNodeStationId) {
      routeNodeWaypointsByKey.set(
        `${previousRouteNodeStationId}->${node.stationSourceId}`,
        pendingRouteNodeWaypoints,
      );
    }
    previousRouteNodeStationId = node.stationSourceId;
    pendingRouteNodeWaypoints = [];
  }

  return line.stationSourceIds.slice(0, -1).flatMap((fromStationSourceId, index) => {
    const toStationSourceId = line.stationSourceIds[index + 1];
    if (!toStationSourceId) {
      return [];
    }
    const from = stationById.get(fromStationSourceId);
    const to = stationById.get(toStationSourceId);
    if (
      from?.x === undefined ||
      from.z === undefined ||
      to?.x === undefined ||
      to.z === undefined
    ) {
      return [];
    }
    const directPath = pathByKey.get(`${fromStationSourceId}->${toStationSourceId}`);
    const reversePath = directPath
      ? undefined
      : pathByKey.get(`${toStationSourceId}->${fromStationSourceId}`);
    const path = directPath ?? reversePath;
    const waypoints = path
      ? path.waypoints.map((waypoint) => [waypoint.x, waypoint.z] as [number, number])
      : [...(routeNodeWaypointsByKey.get(`${fromStationSourceId}->${toStationSourceId}`) ?? [])];
    if (reversePath) {
      waypoints.reverse();
    }
    return [
      {
        coordinates: [[from.x, from.z] as [number, number], ...waypoints, [to.x, to.z]],
        operationStatus: resolveVisibleSegmentOperationStatus(line, path),
      },
    ];
  });
}

async function readTransitSnapshotForMap(): Promise<{
  lines: TransitLineSnapshot[];
  stations: TransitStationSnapshot[];
} | null> {
  const publishedSnapshot = await readPublishedTransitEntitySnapshot();
  if (publishedSnapshot) {
    const publicSnapshot = filterMapVisibleTransitSnapshot(publishedSnapshot);
    return {
      lines: publicSnapshot.lines,
      stations: publicSnapshot.stations,
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

function resolveVisibleSegmentOperationStatus(
  line: TransitLineSnapshot,
  path: NonNullable<TransitLineSnapshot['segmentPaths']>[number] | undefined,
): TransitOperationStatus {
  const statuses: TransitOperationStatus[] = [
    line.operationStatus ?? 'operating',
    path?.operationStatus ?? 'operating',
  ];
  return statuses.includes('closed')
    ? 'closed'
    : statuses.includes('planned')
      ? 'planned'
      : 'operating';
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
