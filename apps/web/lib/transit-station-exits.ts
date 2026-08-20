import type {
  MapGeometry,
  MapMarkerSnapshot,
  TransitLineSnapshot,
  TransitStationExitSnapshot,
  TransitStationSnapshot,
} from '@yct/contracts';
import {
  getMapRoadMarkerKind,
  isMapRoadGeometryMarker,
  orderMapRoadCoordinates,
  projectPointOntoMapRoad,
} from './map-road-geometry';

export type TransitStationExitMarker = MapMarkerSnapshot['markers'][number];

export interface TransitStationExitLocationCandidate {
  id: string;
  label: string;
  kind: 'road' | 'place';
  distance: number;
  coordinate: [number, number];
  orientation?: string;
}

export function listTransitStationExitLocationCandidates(input: {
  station: TransitStationSnapshot | undefined;
  markers: TransitStationExitMarker[];
  radius?: number;
}): TransitStationExitLocationCandidate[] {
  const stationCoordinate = getStationCoordinate(input.station);
  if (!stationCoordinate) {
    return [];
  }

  const radius = Math.max(1, input.radius ?? 96);
  return input.markers
    .flatMap((marker) => {
      const candidate = getExitMarkerCandidate(marker, stationCoordinate);
      if (!candidate || candidate.distance > radius) {
        return [];
      }
      return [candidate];
    })
    .sort(
      (left, right) =>
        exitCandidatePriority(left) - exitCandidatePriority(right) ||
        left.distance - right.distance ||
        left.label.localeCompare(right.label, 'zh-CN'),
    )
    .slice(0, 24);
}

export function inferTransitStationExitDirection(input: {
  line: TransitLineSnapshot | undefined;
  station: TransitStationSnapshot | undefined;
  stations: TransitStationSnapshot[];
  coordinate: [number, number] | undefined;
}): TransitStationExitSnapshot['direction'] | undefined {
  const station = input.station;
  const coordinate = input.coordinate;
  if (!station || !coordinate || !input.line) {
    return undefined;
  }

  const stationIndex = input.line.stationSourceIds.indexOf(station.sourceId);
  if (stationIndex < 0) {
    return undefined;
  }

  const previous = getStationCoordinate(
    input.stations.find(
      (candidate) => candidate.sourceId === input.line?.stationSourceIds[stationIndex - 1],
    ),
  );
  const next = getStationCoordinate(
    input.stations.find(
      (candidate) => candidate.sourceId === input.line?.stationSourceIds[stationIndex + 1],
    ),
  );
  const stationCoordinate = getStationCoordinate(station);
  if (!stationCoordinate) {
    return undefined;
  }

  const tangent = resolveLineTangent(stationCoordinate, previous, next);
  if (!tangent) {
    return undefined;
  }

  const relative: [number, number] = [
    coordinate[0] - stationCoordinate[0],
    coordinate[1] - stationCoordinate[1],
  ];
  const projection = relative[0] * tangent[0] + relative[1] * tangent[1];
  if (Math.abs(projection) < 0.01) {
    return undefined;
  }
  return projection > 0 ? 'downwards' : 'upwards';
}

export function inferTransitStationExitOrientation(input: {
  station: TransitStationSnapshot | undefined;
  coordinate: [number, number] | undefined;
}): string | undefined {
  const stationCoordinate = getStationCoordinate(input.station);
  if (!stationCoordinate || !input.coordinate) {
    return undefined;
  }
  const deltaX = input.coordinate[0] - stationCoordinate[0];
  const deltaZ = input.coordinate[1] - stationCoordinate[1];
  if (Math.hypot(deltaX, deltaZ) < 0.01) {
    return undefined;
  }
  const horizontal = Math.abs(deltaX) >= Math.abs(deltaZ) * 0.45 ? (deltaX > 0 ? '东' : '西') : '';
  const vertical = Math.abs(deltaZ) >= Math.abs(deltaX) * 0.45 ? (deltaZ > 0 ? '南' : '北') : '';
  return `${horizontal}${vertical}` || undefined;
}

export function buildTransitStationExitDescription(
  candidates: TransitStationExitLocationCandidate[],
): string | undefined {
  const selected = candidates.slice(0, 2);
  if (selected.length === 0) {
    return undefined;
  }
  if (selected[0]?.kind === 'place') {
    return selected[0].label;
  }
  return selected
    .map((candidate) =>
      candidate.orientation ? `${candidate.label} ${candidate.orientation}` : candidate.label,
    )
    .join(' / ');
}

export function getTransitStationExitMarkerCoordinate(
  marker: TransitStationExitMarker | undefined,
): [number, number] | undefined {
  if (!marker) {
    return undefined;
  }
  return getMarkerRepresentativeCoordinate(marker.geometry);
}

export function resolveTransitStationExitRoadSide(
  marker: TransitStationExitMarker | undefined,
  exitCoordinate: [number, number] | undefined,
): string | undefined {
  if (!marker || !exitCoordinate || !isMapRoadGeometryMarker(marker)) {
    return undefined;
  }
  const projection = projectPointOntoMapRoad(
    exitCoordinate,
    orderMapRoadCoordinates(getGeometryCoordinates(marker.geometry)),
  );
  return projection ? resolveRoadSideLabel(exitCoordinate, projection) : undefined;
}

function getExitMarkerCandidate(
  marker: TransitStationExitMarker,
  stationCoordinate: [number, number],
): TransitStationExitLocationCandidate | undefined {
  if (isMapRoadGeometryMarker(marker)) {
    const coordinates = getGeometryCoordinates(marker.geometry);
    const orderedCoordinates = orderMapRoadCoordinates(coordinates);
    const projection = projectPointOntoMapRoad(stationCoordinate, orderedCoordinates);
    if (!projection) {
      return undefined;
    }
    return {
      id: marker.id,
      label: marker.label,
      kind: 'road',
      distance: projection.distance,
      coordinate: projection.coordinate,
      orientation: resolveRoadSideLabel(stationCoordinate, projection),
    };
  }

  const normalizedCategory = (marker.categoryId ?? '').toLowerCase();
  const isExitMarker =
    marker.spatial?.dynamicSymbol?.kind === 'metro_exit' ||
    /出入口|出口|站口|[a-z]\d?口/i.test(marker.label);
  if (
    !getMarkerRepresentativeCoordinate(marker.geometry) ||
    normalizedCategory === 'player' ||
    normalizedCategory.includes('transit-line') ||
    getMapRoadMarkerKind(marker) !== undefined ||
    (isTransitStationReferenceMarker(marker) && !isExitMarker)
  ) {
    return undefined;
  }

  const coordinate = getMarkerRepresentativeCoordinate(marker.geometry);
  if (!coordinate) {
    return undefined;
  }
  return {
    id: marker.id,
    label: marker.label,
    kind: 'place',
    distance: distanceBetweenCoordinates(stationCoordinate, coordinate),
    coordinate,
  };
}

function exitCandidatePriority(candidate: TransitStationExitLocationCandidate): number {
  return candidate.kind === 'road' ? 0 : 1;
}

function resolveLineTangent(
  station: [number, number],
  previous: [number, number] | undefined,
  next: [number, number] | undefined,
): [number, number] | undefined {
  const vector = next
    ? [next[0] - station[0], next[1] - station[1]]
    : previous
      ? [station[0] - previous[0], station[1] - previous[1]]
      : undefined;
  if (!vector) {
    return undefined;
  }
  const length = Math.hypot(vector[0], vector[1]);
  return length > 0.001 ? [vector[0] / length, vector[1] / length] : undefined;
}

function resolveRoadSideLabel(
  stationCoordinate: [number, number],
  projection: {
    coordinate: [number, number];
    segmentStart: [number, number];
    segmentEnd: [number, number];
  },
): string | undefined {
  if (distanceBetweenCoordinates(stationCoordinate, projection.coordinate) < 0.5) {
    return undefined;
  }
  const deltaX = Math.abs(projection.segmentEnd[0] - projection.segmentStart[0]);
  const deltaZ = Math.abs(projection.segmentEnd[1] - projection.segmentStart[1]);
  if (deltaX >= deltaZ) {
    return stationCoordinate[0] < projection.coordinate[0] ? '路西' : '路东';
  }
  return stationCoordinate[1] < projection.coordinate[1] ? '路北' : '路南';
}

function getStationCoordinate(
  station: TransitStationSnapshot | undefined,
): [number, number] | undefined {
  return station?.x !== undefined && station.z !== undefined ? [station.x, station.z] : undefined;
}

function getMarkerRepresentativeCoordinate(geometry: MapGeometry): [number, number] | undefined {
  if (geometry.type === 'Point') {
    return geometry.coordinates;
  }
  if (geometry.type === 'Rectangle') {
    return [
      (geometry.bounds.minX + geometry.bounds.maxX) / 2,
      (geometry.bounds.minZ + geometry.bounds.maxZ) / 2,
    ];
  }
  if (geometry.type === 'MultiRectangle') {
    if (geometry.rectangles.length === 0) {
      return undefined;
    }
    const minX = Math.min(...geometry.rectangles.map((item) => item.minX));
    const maxX = Math.max(...geometry.rectangles.map((item) => item.maxX));
    const minZ = Math.min(...geometry.rectangles.map((item) => item.minZ));
    const maxZ = Math.max(...geometry.rectangles.map((item) => item.maxZ));
    return [(minX + maxX) / 2, (minZ + maxZ) / 2];
  }
  const coordinates = getGeometryCoordinates(geometry);
  if (coordinates.length === 0) {
    return undefined;
  }
  const minX = Math.min(...coordinates.map(([x]) => x));
  const maxX = Math.max(...coordinates.map(([x]) => x));
  const minZ = Math.min(...coordinates.map(([, z]) => z));
  const maxZ = Math.max(...coordinates.map(([, z]) => z));
  return [(minX + maxX) / 2, (minZ + maxZ) / 2];
}

function getGeometryCoordinates(geometry: MapGeometry): Array<[number, number]> {
  if (geometry.type === 'MultiPoint' || geometry.type === 'LineString') {
    return geometry.coordinates;
  }
  if (geometry.type === 'Polygon') {
    return geometry.coordinates.flat();
  }
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.flat(2);
  }
  if (geometry.type === 'Point') {
    return [geometry.coordinates];
  }
  if (geometry.type === 'Rectangle') {
    return [
      [geometry.bounds.minX, geometry.bounds.minZ],
      [geometry.bounds.maxX, geometry.bounds.maxZ],
    ];
  }
  return geometry.rectangles.flatMap((rectangle) => [
    [rectangle.minX, rectangle.minZ],
    [rectangle.maxX, rectangle.maxZ],
  ]);
}

function isTransitStationReferenceMarker(marker: TransitStationExitMarker): boolean {
  const text = [marker.categoryId, marker.iconFileName, marker.symbolIcon]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return /(station|metro|subway|bus|tram|rail|ferry)/.test(text);
}

function distanceBetweenCoordinates(left: [number, number], right: [number, number]): number {
  return Math.hypot(left[0] - right[0], left[1] - right[1]);
}
