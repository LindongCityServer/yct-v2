import type {
  MapGeometry,
  MapNetworkDirection,
  MapSpatialProfile,
  MapTravelMode,
  TransitFareQuote,
  TransitLineRouteMode,
  TransitLineRouteNodeSnapshot,
  TransitLineSegmentPathSnapshot,
} from '@yct/contracts';
import { quoteTaxiFare, quoteTransitRouteFare } from '@yct/domain';
import { collectMapRoadConnectionProjections } from '../map-road-geometry';
import { getCoordinateChainDistance, getCoordinateDistance, squaredDistance } from '../map-spatial';
import {
  isTransitLineDirectionIncluded,
  type TransitLineTravelDirection,
} from '../transit-line-direction';
import { getTransitStationNameMatchKeys } from '../transit-station-detail-match';
import { resolveLegacySegmentMinutes } from '../transit-segment-minutes';
import { isTransitPoiMarkerCompatibleWithStation } from '../transit-station-mode';
import {
  dedupeValues,
  formatMarkerDisplayName,
  getDirectionalLineStops,
  getMarkerCenter,
  getMarkerStationNameMatchKeys,
  getRoadTraceCoordinates,
  interpolateCoordinate,
  isCoordinateInsideRegion,
  isCoordinateOnSegment,
  isExitMarkerIcon,
  isMetroStationPoi,
  isTransitStationPoi,
  isWayAccessMarkerIcon,
  normalizeMarkerSearchText,
  rectangleBoundsToMapCoordinates,
} from './helpers';
import {
  markerRoadAccessProjectionRange,
  playerRouteRecalculationDistance,
  routeTaxiTraceColor,
  routeTransportModeOptions,
  routeWalkTraceColor,
} from './types';
import type {
  CenterableMarker,
  EnabledRouteTransportModes,
  EndpointGroupMarker,
  LinearMarkerGeometry,
  PointMarker,
  RegionGeometry,
  ResolvedRoadRoute,
  ResolvedWalkRoute,
  RoadAccessCandidate,
  RoadConnectionCandidate,
  RoadRouteAccessOptions,
  RoadRouteEdge,
  RoadRouteGraph,
  RoadRouteInstructionSegment,
  RoadRouteNode,
  RoadRoutePath,
  RoadRouteSegment,
  RoadRouteStrategy,
  RouteEndpointKind,
  RoutePlanDraft,
  RoutePlanOption,
  RoutePlanRoadLabel,
  RoutePlanSortMode,
  RoutePlanStep,
  RoutePlanStepDetail,
  RoutePlanTraceSegment,
  RoutePlanningCache,
  RouteTransportMode,
  RouteTransportModeOption,
  RouteTraversalBarrier,
  SecondaryPoiLink,
  SecondaryPoiParentLink,
  TransitLineStopForMap,
  TransitModeProfileForMap,
  TransitOverviewLine,
  TransitRouteTransportMode,
  Translate,
} from './types';

export function getRouteTransportModeLabel(mode: RouteTransportMode, t: Translate): string {
  return t(`map.route.mode.${mode}` as Parameters<Translate>[0]);
}

export function buildRoutePlanOptions(input: {
  defaultDrivingSpeedKmh: number;
  draft: RoutePlanDraft;
  enabledModes: EnabledRouteTransportModes;
  markerRoadAccessIndex: ReadonlyMap<string, RoadAccessCandidate[]>;
  pointMarkers: PointMarker[];
  roadGraph?: RoadRouteGraph;
  secondaryPoiIndex: ReadonlyMap<string, SecondaryPoiLink[]>;
  secondaryPoiParentIndex: ReadonlyMap<string, SecondaryPoiParentLink>;
  t: Translate;
  transitLines: TransitOverviewLine[];
  modeProfiles: TransitModeProfileForMap[];
  roadTiming?: MapSpatialProfile['roadTiming'];
  taxiFare?: MapSpatialProfile['taxiFare'];
  transitFare?: MapSpatialProfile['transitFare'];
  traversalBarriers: RouteTraversalBarrier[];
}): RoutePlanOption[] {
  const roadGraph = input.roadGraph;
  const routeCache = createRoutePlanningCache(input.traversalBarriers);
  const draft = resolveRoutePlanDraftAccessPoints(
    input.draft,
    input.secondaryPoiIndex,
    input.secondaryPoiParentIndex,
    roadGraph,
    routeCache,
    input.t,
  );
  const options: RoutePlanOption[] = [];
  const endpointAccessDistance = getRouteEndpointAccessDistance(draft);
  const originRoadAccessCandidates = getRouteEndpointRoadAccessCandidates(
    draft,
    'origin',
    input.markerRoadAccessIndex,
  );
  const destinationRoadAccessCandidates = getRouteEndpointRoadAccessCandidates(
    draft,
    'destination',
    input.markerRoadAccessIndex,
  );

  if (input.enabledModes.walk) {
    const directWalkAccessOptions = {
      destinationAccessCandidates: destinationRoadAccessCandidates,
      originAccessCandidates: originRoadAccessCandidates,
    };
    const directWalkRoute = buildWalkRouteBetweenCoordinates(
      draft.origin,
      draft.destination,
      roadGraph,
      routeCache,
      input.t,
      directWalkAccessOptions,
    );
    const acceptedWalkRoutes: ResolvedWalkRoute[] = [];
    const directDistance = directWalkRoute.distance + endpointAccessDistance;
    const directMinutes =
      estimateResolvedWalkRouteMinutes(directWalkRoute) +
      estimateRouteMinutes(endpointAccessDistance, 72);
    const directCoordinates = buildRouteTraceCoordinates(draft, directWalkRoute.coordinates);
    const directRoadLabels = createRouteRoadLabelsFromSegments(directWalkRoute.roadSegments);
    if (!directWalkRoute.blockedByTraversalBarrier) {
      acceptedWalkRoutes.push(directWalkRoute);
      options.push({
        id: 'walk-direct',
        title: input.t('map.route.walkDirect'),
        summary: `${formatRoutePlanDistance(directDistance, input.t)} · ${input.t(
          directWalkRoute.usesRoadGraph
            ? 'map.route.summary.roadEstimate'
            : 'map.route.summary.directEstimate',
        )}`,
        icon: 'directions_walk',
        color:
          routeTransportModeOptions.find((option) => option.mode === 'walk')?.color ??
          'var(--yct-color-text-secondary)',
        coordinates: directCoordinates,
        traceSegments: [createRouteTraceSegment('walk', directCoordinates)],
        roadLabels: directRoadLabels,
        markerIds: getRouteEndpointMarkerIds(draft),
        modes: ['walk'],
        estimatedDistance: directDistance,
        estimatedMinutes: directMinutes,
        transferCount: 0,
        walkingDistance: directDistance,
        steps: [
          createRoutePlaceStep(input.t('map.route.depart', { name: draft.originLabel }), 'origin'),
          ...createRouteEndpointAccessSteps(draft, 'origin', input.t),
          createRouteWalkStep(
            input.t(
              directWalkRoute.usesRoadGraph
                ? 'map.route.walkRoadWithDistance'
                : 'map.route.walkWithDistance',
              {
                distance: formatRoutePlanDistance(directWalkRoute.distance, input.t),
                duration: formatRouteStepMinutes(
                  estimateRouteMinutes(
                    directWalkRoute.distance,
                    directWalkRoute.usesRoadGraph ? 64 : 72,
                  ),
                  input.t,
                ),
              },
            ),
            directWalkRoute.details,
          ),
          ...createRouteEndpointAccessSteps(draft, 'destination', input.t),
          createRoutePlaceStep(
            input.t('map.route.arrive', { name: draft.destinationLabel }),
            'destination',
          ),
        ],
        note: directWalkRoute.usesRoadGraph
          ? input.t('map.route.walkNote.road')
          : input.t('map.route.walkNote.direct'),
      });
    }

    const fewerTurnWalkRoute = buildWalkRouteBetweenCoordinates(
      draft.origin,
      draft.destination,
      roadGraph,
      routeCache,
      input.t,
      directWalkAccessOptions,
      'fewer-turns',
    );
    if (shouldAddFewerTurnWalkRoute(directWalkRoute, fewerTurnWalkRoute)) {
      acceptedWalkRoutes.push(fewerTurnWalkRoute);
      const fewerTurnDistance = fewerTurnWalkRoute.distance + endpointAccessDistance;
      const fewerTurnMinutes =
        estimateResolvedWalkRouteMinutes(fewerTurnWalkRoute) +
        estimateRouteMinutes(endpointAccessDistance, 72);
      const fewerTurnCoordinates = buildRouteTraceCoordinates(
        draft,
        fewerTurnWalkRoute.coordinates,
      );
      options.push({
        id: 'walk-fewer-turns',
        title: input.t('map.route.walkFewerTurns'),
        summary: `${formatRoutePlanDistance(fewerTurnDistance, input.t)} · ${input.t(
          'map.route.summary.roadEstimate',
        )}`,
        icon: 'conversion_path',
        color:
          routeTransportModeOptions.find((option) => option.mode === 'walk')?.color ??
          'var(--yct-color-text-secondary)',
        coordinates: fewerTurnCoordinates,
        traceSegments: [createRouteTraceSegment('walk', fewerTurnCoordinates)],
        roadLabels: createRouteRoadLabelsFromSegments(fewerTurnWalkRoute.roadSegments),
        markerIds: getRouteEndpointMarkerIds(draft),
        modes: ['walk'],
        estimatedDistance: fewerTurnDistance,
        estimatedMinutes: fewerTurnMinutes,
        transferCount: 0,
        walkingDistance: fewerTurnDistance,
        steps: [
          createRoutePlaceStep(input.t('map.route.depart', { name: draft.originLabel }), 'origin'),
          ...createRouteEndpointAccessSteps(draft, 'origin', input.t),
          createRouteWalkStep(
            input.t('map.route.walkRoadWithDistance', {
              distance: formatRoutePlanDistance(fewerTurnWalkRoute.distance, input.t),
              duration: formatRouteStepMinutes(
                estimateRouteMinutes(fewerTurnWalkRoute.distance, 64),
                input.t,
              ),
            }),
            fewerTurnWalkRoute.details,
          ),
          ...createRouteEndpointAccessSteps(draft, 'destination', input.t),
          createRoutePlaceStep(
            input.t('map.route.arrive', { name: draft.destinationLabel }),
            'destination',
          ),
        ],
        note: input.t('map.route.walkNote.road'),
      });
    }

    const fewestSegmentWalkRoute = buildWalkRouteBetweenCoordinates(
      draft.origin,
      draft.destination,
      roadGraph,
      routeCache,
      input.t,
      directWalkAccessOptions,
      'fewest-segments',
    );
    if (shouldAddAlternativeWalkRoute(directWalkRoute, fewestSegmentWalkRoute)) {
      acceptedWalkRoutes.push(fewestSegmentWalkRoute);
      const fewestSegmentDistance = fewestSegmentWalkRoute.distance + endpointAccessDistance;
      const fewestSegmentMinutes =
        estimateResolvedWalkRouteMinutes(fewestSegmentWalkRoute) +
        estimateRouteMinutes(endpointAccessDistance, 72);
      const fewestSegmentCoordinates = buildRouteTraceCoordinates(
        draft,
        fewestSegmentWalkRoute.coordinates,
      );
      options.push({
        id: 'walk-fewest-segments',
        title: input.t('map.route.walkFewestSegments'),
        summary: `${formatRoutePlanDistance(fewestSegmentDistance, input.t)} · ${input.t(
          'map.route.summary.roadEstimate',
        )}`,
        icon: 'conversion_path',
        color:
          routeTransportModeOptions.find((option) => option.mode === 'walk')?.color ??
          'var(--yct-color-text-secondary)',
        coordinates: fewestSegmentCoordinates,
        traceSegments: [createRouteTraceSegment('walk', fewestSegmentCoordinates)],
        roadLabels: createRouteRoadLabelsFromSegments(fewestSegmentWalkRoute.roadSegments),
        markerIds: getRouteEndpointMarkerIds(draft),
        modes: ['walk'],
        estimatedDistance: fewestSegmentDistance,
        estimatedMinutes: fewestSegmentMinutes,
        transferCount: 0,
        walkingDistance: fewestSegmentDistance,
        steps: [
          createRoutePlaceStep(input.t('map.route.depart', { name: draft.originLabel }), 'origin'),
          ...createRouteEndpointAccessSteps(draft, 'origin', input.t),
          createRouteWalkStep(
            input.t('map.route.walkRoadWithDistance', {
              distance: formatRoutePlanDistance(fewestSegmentWalkRoute.distance, input.t),
              duration: formatRouteStepMinutes(
                estimateRouteMinutes(fewestSegmentWalkRoute.distance, 64),
                input.t,
              ),
            }),
            fewestSegmentWalkRoute.details,
          ),
          ...createRouteEndpointAccessSteps(draft, 'destination', input.t),
          createRoutePlaceStep(
            input.t('map.route.arrive', { name: draft.destinationLabel }),
            'destination',
          ),
        ],
        note: input.t('map.route.walkNote.road'),
      });
    }

    for (const [alternativeIndex, strategy] of [
      [1, 'alternative-1'],
      [2, 'alternative-2'],
    ] as const) {
      const alternativeRoute = buildWalkRouteBetweenCoordinates(
        draft.origin,
        draft.destination,
        roadGraph,
        routeCache,
        input.t,
        directWalkAccessOptions,
        strategy,
      );
      if (!shouldAddDiversifiedWalkRoute(directWalkRoute, alternativeRoute, acceptedWalkRoutes)) {
        continue;
      }
      acceptedWalkRoutes.push(alternativeRoute);

      const distance = alternativeRoute.distance + endpointAccessDistance;
      const minutes =
        estimateResolvedWalkRouteMinutes(alternativeRoute) +
        estimateRouteMinutes(endpointAccessDistance, 72);
      const coordinates = buildRouteTraceCoordinates(draft, alternativeRoute.coordinates);
      options.push({
        id: `walk-alternative-${alternativeIndex}`,
        title: input.t(
          alternativeIndex === 1 ? 'map.route.walkAlternativeOne' : 'map.route.walkAlternativeTwo',
        ),
        summary: `${formatRoutePlanDistance(distance, input.t)} · ${input.t(
          'map.route.summary.roadEstimate',
        )}`,
        icon: 'alt_route',
        color:
          routeTransportModeOptions.find((option) => option.mode === 'walk')?.color ??
          'var(--yct-color-text-secondary)',
        coordinates,
        traceSegments: [createRouteTraceSegment('walk', coordinates)],
        roadLabels: createRouteRoadLabelsFromSegments(alternativeRoute.roadSegments),
        markerIds: getRouteEndpointMarkerIds(draft),
        modes: ['walk'],
        estimatedDistance: distance,
        estimatedMinutes: minutes,
        transferCount: 0,
        walkingDistance: distance,
        steps: [
          createRoutePlaceStep(input.t('map.route.depart', { name: draft.originLabel }), 'origin'),
          ...createRouteEndpointAccessSteps(draft, 'origin', input.t),
          createRouteWalkStep(
            input.t('map.route.walkRoadWithDistance', {
              distance: formatRoutePlanDistance(alternativeRoute.distance, input.t),
              duration: formatRouteStepMinutes(
                estimateRouteMinutes(alternativeRoute.distance, 64),
                input.t,
              ),
            }),
            alternativeRoute.details,
          ),
          ...createRouteEndpointAccessSteps(draft, 'destination', input.t),
          createRoutePlaceStep(
            input.t('map.route.arrive', { name: draft.destinationLabel }),
            'destination',
          ),
        ],
        note: input.t('map.route.walkNote.road'),
      });
    }
  }

  if (input.enabledModes.taxi && roadGraph) {
    const taxiOptionKeys = new Set<string>();
    const acceptedTaxiSegments: RoadRouteInstructionSegment[][] = [];
    for (const taxiStrategy of [
      'fewest-segments',
      'shortest',
      'alternative-1',
      'alternative-2',
    ] as const) {
      const drivingRoute = findRoadRouteBetweenCoordinates(
        draft.origin,
        draft.destination,
        roadGraph,
        routeCache,
        input.t,
        {
          destinationAccessCandidates: destinationRoadAccessCandidates,
          originAccessCandidates: originRoadAccessCandidates,
        },
        taxiStrategy,
        'taxi',
      );
      if (!drivingRoute) {
        continue;
      }
      if (isRoadRouteDirectAccessBlocked(drivingRoute, routeCache.traversalBarriers, 'walk')) {
        continue;
      }

      const taxiRoute = splitTaxiRoadRoute(draft, drivingRoute);
      if (taxiRoute.taxiDistance <= 0 || taxiRoute.taxiCoordinates.length < 2) {
        continue;
      }
      const taxiOptionKey = taxiRoute.taxiSegments
        .map((segment) => segment.roadId ?? segment.label)
        .join('|');
      if (taxiOptionKeys.has(taxiOptionKey)) {
        continue;
      }
      if (
        (taxiStrategy === 'alternative-1' || taxiStrategy === 'alternative-2') &&
        !isRoadRouteTopologicallyDistinct(taxiRoute.taxiSegments, acceptedTaxiSegments)
      ) {
        continue;
      }
      taxiOptionKeys.add(taxiOptionKey);
      acceptedTaxiSegments.push(taxiRoute.taxiSegments);

      const drivingSpeedBlocksPerMinute = Math.max(1, (input.defaultDrivingSpeedKmh * 1000) / 60);
      const taxiMinutes = estimateVehicleRouteMinutes(
        taxiRoute.taxiDistance,
        input.defaultDrivingSpeedKmh,
        drivingRoute.junctionCount,
        input.roadTiming?.taxiJunctionDelaySeconds ?? 8,
      );
      const taxiAccessMinutes = estimateRouteMinutes(taxiRoute.walkingDistance, 72);
      options.push({
        id:
          taxiStrategy === 'shortest'
            ? 'taxi-direct'
            : taxiStrategy === 'fewest-segments'
              ? 'taxi-fewest-segments'
              : `taxi-${taxiStrategy}`,
        title: input.t(
          taxiStrategy === 'shortest'
            ? 'map.route.taxiDirect'
            : taxiStrategy === 'fewest-segments'
              ? 'map.route.taxiFewestSegments'
              : taxiStrategy === 'alternative-1'
                ? 'map.route.taxiAlternativeOne'
                : 'map.route.taxiAlternativeTwo',
        ),
        summary: `${formatRoutePlanDistance(taxiRoute.taxiDistance, input.t)} · ${input.t(
          'map.route.summary.roadEstimate',
        )}`,
        icon: 'local_taxi',
        color: routeTaxiTraceColor,
        coordinates: taxiRoute.coordinates,
        traceSegments: taxiRoute.traceSegments,
        roadLabels: createRouteRoadLabelsFromSegments(taxiRoute.taxiSegments, routeTaxiTraceColor),
        markerIds: getRouteEndpointMarkerIds(draft),
        modes: ['taxi'],
        estimatedDistance: taxiRoute.taxiDistance + taxiRoute.walkingDistance,
        estimatedMinutes: taxiMinutes + taxiAccessMinutes,
        fare: input.taxiFare ? quoteTaxiFare(taxiRoute.taxiDistance, input.taxiFare) : undefined,
        transferCount: 0,
        walkingDistance: taxiRoute.walkingDistance,
        steps: [
          createRoutePlaceStep(input.t('map.route.depart', { name: draft.originLabel }), 'origin'),
          ...createTaxiRoadAccessSteps(taxiRoute.originWalkDistance, 'origin', input.t),
          createRouteTaxiStep(
            input.t('map.route.taxiWithDistance', {
              distance: formatRoutePlanDistance(taxiRoute.taxiDistance, input.t),
              duration: formatRouteStepMinutes(taxiMinutes, input.t),
            }),
            buildRoadRouteStepDetails(
              taxiRoute.taxiSegments,
              input.t,
              'taxi',
              drivingSpeedBlocksPerMinute,
            ),
          ),
          ...createTaxiRoadAccessSteps(taxiRoute.destinationWalkDistance, 'destination', input.t),
          createRoutePlaceStep(
            input.t('map.route.arrive', { name: draft.destinationLabel }),
            'destination',
          ),
        ],
        note: input.t('map.route.taxiNote', {
          speed: Math.round(input.defaultDrivingSpeedKmh),
        }),
      });
    }
  }

  options.push(...buildTransitRoutePlanOptions({ ...input, draft, roadGraph, routeCache }));

  return prepareRoutePlanOptions(options);
}

function createRoutePlanningCache(traversalBarriers: RouteTraversalBarrier[]): RoutePlanningCache {
  return {
    accessCandidatesByPair: new Map(),
    pathByNodePair: new Map(),
    roadRouteByPair: new Map(),
    traversalBarriers,
  };
}

function shouldAddFewerTurnWalkRoute(
  directRoute: ResolvedWalkRoute,
  fewerTurnRoute: ResolvedWalkRoute,
): boolean {
  if (!directRoute.usesRoadGraph || !fewerTurnRoute.usesRoadGraph) {
    return false;
  }

  if (areCoordinateChainsEquivalent(directRoute.coordinates, fewerTurnRoute.coordinates)) {
    return false;
  }

  const directTurns = countRoadRouteTurns(directRoute.roadSegments ?? []);
  const fewerTurns = countRoadRouteTurns(fewerTurnRoute.roadSegments ?? []);
  if (fewerTurns > directTurns) {
    return false;
  }

  return fewerTurnRoute.distance <= directRoute.distance * 1.55 + 240;
}

function shouldAddAlternativeWalkRoute(
  directRoute: ResolvedWalkRoute,
  alternativeRoute: ResolvedWalkRoute,
): boolean {
  if (!directRoute.usesRoadGraph || !alternativeRoute.usesRoadGraph) {
    return false;
  }
  if (areCoordinateChainsEquivalent(directRoute.coordinates, alternativeRoute.coordinates)) {
    return false;
  }
  const directTurns = countRoadRouteTurns(directRoute.roadSegments ?? []);
  const alternativeTurns = countRoadRouteTurns(alternativeRoute.roadSegments ?? []);
  return (
    alternativeTurns <= directTurns + 1 &&
    alternativeRoute.distance <= directRoute.distance * 1.4 + 180
  );
}

function shouldAddDiversifiedWalkRoute(
  directRoute: ResolvedWalkRoute,
  candidate: ResolvedWalkRoute,
  acceptedRoutes: readonly ResolvedWalkRoute[],
): boolean {
  if (
    candidate.blockedByTraversalBarrier ||
    !directRoute.usesRoadGraph ||
    !candidate.usesRoadGraph ||
    candidate.distance > directRoute.distance * 1.85 + 320
  ) {
    return false;
  }

  const candidateSegments = candidate.roadSegments ?? [];
  return acceptedRoutes.every(
    (accepted) =>
      getRoadRouteSegmentOverlapRatio(candidateSegments, accepted.roadSegments ?? []) <= 0.82,
  );
}

function isRoadRouteTopologicallyDistinct(
  candidate: readonly RoadRouteInstructionSegment[],
  acceptedRoutes: readonly RoadRouteInstructionSegment[][],
): boolean {
  const candidateDistance = getRoadInstructionSegmentsDistance(candidate);
  const shortestAcceptedDistance = Math.min(
    ...acceptedRoutes.map(getRoadInstructionSegmentsDistance),
  );
  if (
    Number.isFinite(shortestAcceptedDistance) &&
    candidateDistance > shortestAcceptedDistance * 1.85 + 500
  ) {
    return false;
  }
  return acceptedRoutes.every(
    (accepted) => getRoadRouteSegmentOverlapRatio(candidate, accepted) <= 0.82,
  );
}

function getRoadRouteSegmentOverlapRatio(
  left: readonly RoadRouteInstructionSegment[],
  right: readonly RoadRouteInstructionSegment[],
): number {
  const leftEdges = collectRoadInstructionEdgeLengths(left);
  const rightEdges = collectRoadInstructionEdgeLengths(right);
  const leftDistance = sumMapValues(leftEdges);
  const rightDistance = sumMapValues(rightEdges);
  const comparableDistance = Math.min(leftDistance, rightDistance);
  if (comparableDistance <= 0) {
    return 0;
  }

  let sharedDistance = 0;
  for (const [key, distance] of leftEdges) {
    sharedDistance += Math.min(distance, rightEdges.get(key) ?? 0);
  }
  return sharedDistance / comparableDistance;
}

function collectRoadInstructionEdgeLengths(
  segments: readonly RoadRouteInstructionSegment[],
): Map<string, number> {
  const result = new Map<string, number>();
  for (const segment of segments) {
    if (segment.kind !== 'road' && segment.kind !== 'connection') {
      continue;
    }
    for (let index = 1; index < segment.coordinates.length; index += 1) {
      const from = segment.coordinates[index - 1];
      const to = segment.coordinates[index];
      if (!from || !to) {
        continue;
      }
      const fromKey = `${from[0].toFixed(1)},${from[1].toFixed(1)}`;
      const toKey = `${to[0].toFixed(1)},${to[1].toFixed(1)}`;
      const key = fromKey < toKey ? `${fromKey}>${toKey}` : `${toKey}>${fromKey}`;
      result.set(key, (result.get(key) ?? 0) + getCoordinateDistance(from, to));
    }
  }
  return result;
}

function getRoadInstructionSegmentsDistance(
  segments: readonly RoadRouteInstructionSegment[],
): number {
  return segments.reduce(
    (total, segment) =>
      total +
      (segment.kind === 'road' || segment.kind === 'connection'
        ? getCoordinateChainDistance(segment.coordinates)
        : 0),
    0,
  );
}

function sumMapValues(values: ReadonlyMap<string, number>): number {
  let total = 0;
  for (const value of values.values()) {
    total += value;
  }
  return total;
}

function areCoordinateChainsEquivalent(
  left: Array<[number, number]>,
  right: Array<[number, number]>,
): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((coordinate, index) => {
    const other = right[index];
    return Boolean(other && getCoordinateDistance(coordinate, other) < 0.5);
  });
}

export function buildRoutePlanCalculationKey(
  draft: RoutePlanDraft,
  enabledModes: EnabledRouteTransportModes,
): string {
  return JSON.stringify({
    destination: draft.destination,
    destinationId: draft.destinationId,
    destinationLabel: draft.destinationLabel,
    modes: routeTransportModeOptions.map(({ mode }) => [mode, enabledModes[mode]]),
    origin: draft.origin,
    originId: draft.originId,
    originLabel: draft.originLabel,
  });
}

export function updateRoutePlanDraftPlayerEndpoints(
  draft: RoutePlanDraft,
  pointMarkers: PointMarker[],
): RoutePlanDraft {
  let nextDraft = draft;

  for (const endpoint of ['origin', 'destination'] as const) {
    const markerId = endpoint === 'origin' ? nextDraft.originId : nextDraft.destinationId;
    if (!markerId) {
      continue;
    }

    const marker = pointMarkers.find(
      (candidate) => candidate.id === markerId && candidate.playerLocation,
    );
    if (!marker) {
      continue;
    }

    const latestCoordinate = marker.geometry.coordinates;
    const previousCoordinate =
      endpoint === 'origin'
        ? (nextDraft.originRaw ?? nextDraft.origin)
        : (nextDraft.destinationRaw ?? nextDraft.destination);
    if (
      getCoordinateDistance(previousCoordinate, latestCoordinate) < playerRouteRecalculationDistance
    ) {
      continue;
    }

    if (nextDraft === draft) {
      nextDraft = { ...draft };
    }

    if (endpoint === 'origin') {
      nextDraft.origin = latestCoordinate;
      if (nextDraft.originRaw) {
        nextDraft.originRaw = latestCoordinate;
      }
    } else {
      nextDraft.destination = latestCoordinate;
      if (nextDraft.destinationRaw) {
        nextDraft.destinationRaw = latestCoordinate;
      }
    }
  }

  return nextDraft;
}

export function isPlayerLocationMarkerId(markerId: string | undefined): markerId is string {
  return Boolean(markerId?.startsWith('player-location-'));
}

export function getRouteOptionLimit(enabledModes: EnabledRouteTransportModes): number {
  const enabledCount = routeTransportModeOptions.filter(
    (option) => enabledModes[option.mode],
  ).length;
  return Math.min(16, Math.max(6, enabledCount + 5));
}

export function selectRoutePlanOptions(
  options: RoutePlanOption[],
  enabledModes: EnabledRouteTransportModes,
  limit: number,
  sortMode: RoutePlanSortMode,
): RoutePlanOption[] {
  const sorted = [...options].sort((left, right) => compareRoutePlanOptions(left, right, sortMode));
  const selected = new Map<string, RoutePlanOption>();

  for (const { mode } of routeTransportModeOptions) {
    if (!enabledModes[mode]) {
      continue;
    }
    const representative = sorted.find((option) => option.modes.includes(mode));
    if (representative) {
      selected.set(representative.id, representative);
    }
  }
  for (const option of sorted) {
    if (selected.size >= limit) {
      break;
    }
    selected.set(option.id, option);
  }

  return Array.from(selected.values())
    .sort((left, right) => compareRoutePlanOptions(left, right, sortMode))
    .slice(0, limit);
}

function prepareRoutePlanOptions(options: RoutePlanOption[]): RoutePlanOption[] {
  const deduped = mergeEquivalentTransitRouteOptions(options);
  return deduped.filter(
    (candidate) =>
      !deduped.some(
        (other) =>
          other.id !== candidate.id &&
          haveEquivalentRouteModes(other, candidate) &&
          dominatesRouteOption(other, candidate),
      ),
  );
}

function mergeEquivalentTransitRouteOptions(options: RoutePlanOption[]): RoutePlanOption[] {
  const mergedByKey = new Map<string, RoutePlanOption>();
  const result: RoutePlanOption[] = [];

  for (const option of options) {
    if (!option.serviceLabels?.length) {
      result.push(option);
      continue;
    }

    const key = JSON.stringify({
      fare: option.fare
        ? [option.fare.status, option.fare.totalAmount, option.fare.knownSubtotal]
        : null,
      markerIds: option.markerIds,
      minutes: option.estimatedMinutes,
      modes: [...option.modes].sort(),
      transfers: option.transferCount,
      walking: Math.round(option.walkingDistance),
    });
    const existing = mergedByKey.get(key);
    if (!existing) {
      const initial = { ...option, serviceLabels: [...option.serviceLabels] };
      mergedByKey.set(key, initial);
      result.push(initial);
      continue;
    }

    existing.serviceLabels = dedupeValues([
      ...(existing.serviceLabels ?? []),
      ...option.serviceLabels,
    ]);
    const summaryDetail = existing.summary.split(' · ').slice(1).join(' · ');
    existing.summary = `${formatMergedRouteServiceLabels(existing.serviceLabels)}${
      summaryDetail ? ` · ${summaryDetail}` : ''
    }`;
  }

  return result;
}

function formatMergedRouteServiceLabels(labels: string[]): string {
  if (labels.length <= 3) {
    return labels.join(' / ');
  }
  return `${labels.slice(0, 3).join(' / ')} +${labels.length - 3}`;
}

function haveEquivalentRouteModes(left: RoutePlanOption, right: RoutePlanOption): boolean {
  return [...left.modes].sort().join(',') === [...right.modes].sort().join(',');
}

function dominatesRouteOption(left: RoutePlanOption, right: RoutePlanOption): boolean {
  if (
    left.modes.length === 1 &&
    (left.modes[0] === 'walk' || left.modes[0] === 'taxi') &&
    !areCoordinateChainsEquivalent(left.coordinates, right.coordinates)
  ) {
    return false;
  }
  const noWorse =
    left.estimatedMinutes <= right.estimatedMinutes &&
    left.walkingDistance <= right.walkingDistance &&
    left.transferCount <= right.transferCount;
  const strictlyBetter =
    left.estimatedMinutes < right.estimatedMinutes ||
    left.walkingDistance < right.walkingDistance ||
    left.transferCount < right.transferCount;
  return noWorse && strictlyBetter;
}

function compareRoutePlanOptions(
  left: RoutePlanOption,
  right: RoutePlanOption,
  mode: RoutePlanSortMode = 'time',
): number {
  const criteria: Record<RoutePlanSortMode, Array<(option: RoutePlanOption) => number>> = {
    time: [
      (option) => option.estimatedMinutes,
      (option) => option.walkingDistance,
      (option) => option.transferCount,
    ],
    walking: [
      (option) => option.walkingDistance,
      (option) => option.estimatedMinutes,
      (option) => option.transferCount,
    ],
    transfers: [
      (option) => option.transferCount,
      (option) => option.estimatedMinutes,
      (option) => option.walkingDistance,
    ],
    fare: [
      getSortableRouteFare,
      (option) => option.estimatedMinutes,
      (option) => option.walkingDistance,
    ],
  };
  for (const readValue of criteria[mode]) {
    const difference = readValue(left) - readValue(right);
    if (difference !== 0) {
      return difference;
    }
  }
  return (
    left.estimatedDistance - right.estimatedDistance ||
    left.title.localeCompare(right.title, 'zh-CN')
  );
}

function getSortableRouteFare(option: RoutePlanOption): number {
  if (!option.fare || option.fare.status === 'unavailable') {
    return Number.POSITIVE_INFINITY;
  }
  return option.fare.totalAmount ?? option.fare.knownSubtotal;
}

function splitTaxiRoadRoute(
  draft: RoutePlanDraft,
  route: ResolvedRoadRoute,
): {
  coordinates: Array<[number, number]>;
  destinationWalkDistance: number;
  originWalkDistance: number;
  taxiCoordinates: Array<[number, number]>;
  taxiDistance: number;
  taxiSegments: RoadRouteInstructionSegment[];
  traceSegments: RoutePlanTraceSegment[];
  walkingDistance: number;
} {
  const firstTaxiSegmentIndex = route.roadSegments.findIndex(isTaxiRoadSegment);
  let lastTaxiSegmentIndex = -1;
  for (let index = route.roadSegments.length - 1; index >= 0; index -= 1) {
    const segment = route.roadSegments[index];
    if (segment && isTaxiRoadSegment(segment)) {
      lastTaxiSegmentIndex = index;
      break;
    }
  }
  const originWalkSegments = route.roadSegments.slice(0, firstTaxiSegmentIndex);
  const taxiSegments = route.roadSegments.slice(firstTaxiSegmentIndex, lastTaxiSegmentIndex + 1);
  const destinationWalkSegments = route.roadSegments.slice(lastTaxiSegmentIndex + 1);
  const originWalkCoordinates = dedupeConsecutiveCoordinates([
    ...(draft.originRaw ? [draft.originRaw] : []),
    ...flattenRouteSegmentCoordinates(originWalkSegments),
  ]);
  const taxiCoordinates = flattenRouteSegmentCoordinates(taxiSegments);
  const destinationWalkCoordinates = dedupeConsecutiveCoordinates([
    ...flattenRouteSegmentCoordinates(destinationWalkSegments),
    ...(draft.destinationRaw ? [draft.destinationRaw] : []),
  ]);
  const originWalkDistance = getCoordinateChainDistance(originWalkCoordinates);
  const destinationWalkDistance = getCoordinateChainDistance(destinationWalkCoordinates);
  const taxiDistance = taxiSegments.reduce(
    (total, segment) => total + getCoordinateChainDistance(segment.coordinates),
    0,
  );
  const traceSegments = [
    originWalkCoordinates.length >= 2
      ? createRouteTraceSegment('walk', originWalkCoordinates)
      : undefined,
    taxiCoordinates.length >= 2
      ? createRouteTraceSegment('taxi', taxiCoordinates, routeTaxiTraceColor)
      : undefined,
    destinationWalkCoordinates.length >= 2
      ? createRouteTraceSegment('walk', destinationWalkCoordinates)
      : undefined,
  ].filter((segment): segment is RoutePlanTraceSegment => Boolean(segment));

  return {
    coordinates: dedupeConsecutiveCoordinates(
      traceSegments.flatMap((segment) => segment.coordinates),
    ),
    destinationWalkDistance,
    originWalkDistance,
    taxiCoordinates,
    taxiDistance,
    taxiSegments,
    traceSegments,
    walkingDistance: originWalkDistance + destinationWalkDistance,
  };
}

function isTaxiRoadSegment(segment: RoadRouteInstructionSegment): boolean {
  return segment.kind === 'road' || segment.kind === 'connection';
}

function flattenRouteSegmentCoordinates(
  segments: readonly RoadRouteInstructionSegment[],
): Array<[number, number]> {
  const coordinates: Array<[number, number]> = [];
  for (const segment of segments) {
    appendRouteSegmentCoordinates(coordinates, segment.coordinates);
  }
  return coordinates;
}

export function getRouteOptionBadges(
  option: RoutePlanOption,
  options: RoutePlanOption[],
  t: Translate,
): string[] {
  const badges: string[] = [];
  const minEstimatedMinutes = Math.min(...options.map((item) => item.estimatedMinutes));
  const minTransferCount = Math.min(...options.map((item) => item.transferCount));
  const minWalkingDistance = Math.min(...options.map((item) => item.walkingDistance));

  if (option.estimatedMinutes === minEstimatedMinutes) {
    badges.push(t('map.route.badge.fastest'));
  }

  if (
    option.transferCount === minTransferCount &&
    options.some((item) => item.transferCount !== minTransferCount)
  ) {
    badges.push(t('map.route.badge.fewestTransfers'));
  }

  if (
    Math.round(option.walkingDistance) === Math.round(minWalkingDistance) &&
    options.some((item) => Math.round(item.walkingDistance) !== Math.round(minWalkingDistance))
  ) {
    badges.push(t('map.route.badge.leastWalking'));
  }

  return badges;
}

function resolveRoutePlanDraftAccessPoints(
  draft: RoutePlanDraft,
  secondaryPoiIndex: ReadonlyMap<string, SecondaryPoiLink[]>,
  secondaryPoiParentIndex: ReadonlyMap<string, SecondaryPoiParentLink>,
  roadGraph: RoadRouteGraph | undefined,
  routeCache: RoutePlanningCache,
  t: Translate,
): RoutePlanDraft {
  if (
    draft.originId &&
    draft.destinationId &&
    areRouteEndpointsParentAndChild(draft.originId, draft.destinationId, secondaryPoiParentIndex)
  ) {
    return draft;
  }

  const originCandidates = listRouteEndpointAccessPoints({
    endpointCoordinate: draft.origin,
    endpointId: draft.originId,
    secondaryPoiIndex,
    secondaryPoiParentIndex,
  });
  const destinationCandidates = listRouteEndpointAccessPoints({
    endpointCoordinate: draft.destination,
    endpointId: draft.destinationId,
    secondaryPoiIndex,
    secondaryPoiParentIndex,
  });

  const pairs = originCandidates.flatMap((origin) =>
    destinationCandidates.map((destination) => {
      const betweenAccessPoints = buildWalkRouteBetweenCoordinates(
        origin.coordinate,
        destination.coordinate,
        roadGraph,
        routeCache,
        t,
      ).distance;
      const originAccessDistance = origin.accessId
        ? isDirectTraversalBlocked(
            draft.origin,
            origin.coordinate,
            routeCache.traversalBarriers,
            'walk',
          )
          ? Number.POSITIVE_INFINITY
          : getCoordinateDistance(draft.origin, origin.coordinate)
        : 0;
      const destinationAccessDistance = destination.accessId
        ? isDirectTraversalBlocked(
            draft.destination,
            destination.coordinate,
            routeCache.traversalBarriers,
            'walk',
          )
          ? Number.POSITIVE_INFINITY
          : getCoordinateDistance(draft.destination, destination.coordinate)
        : 0;
      const endpointAccessDistance = originAccessDistance + destinationAccessDistance;
      return {
        destination,
        directionDistance:
          getCoordinateDistance(origin.coordinate, draft.destination) +
          getCoordinateDistance(destination.coordinate, draft.origin),
        origin,
        totalWalkingDistance: betweenAccessPoints + endpointAccessDistance,
      };
    }),
  );
  pairs.sort(
    (left, right) =>
      left.totalWalkingDistance - right.totalWalkingDistance ||
      left.directionDistance - right.directionDistance,
  );
  const selected = pairs.find((pair) => Number.isFinite(pair.totalWalkingDistance));
  const origin = selected?.origin ?? { coordinate: draft.origin };
  const destination = selected?.destination ?? { coordinate: draft.destination };

  return {
    ...draft,
    origin: origin.coordinate,
    originAccessId: origin.accessId,
    originAccessLabel: origin.accessLabel,
    originRaw: origin.accessId ? draft.origin : undefined,
    destination: destination.coordinate,
    destinationAccessId: destination.accessId,
    destinationAccessLabel: destination.accessLabel,
    destinationRaw: destination.accessId ? draft.destination : undefined,
  };
}

interface RouteEndpointAccessPoint {
  coordinate: [number, number];
  accessId?: string;
  accessLabel?: string;
}

function listRouteEndpointAccessPoints(input: {
  endpointCoordinate: [number, number];
  endpointId?: string;
  secondaryPoiIndex: ReadonlyMap<string, SecondaryPoiLink[]>;
  secondaryPoiParentIndex: ReadonlyMap<string, SecondaryPoiParentLink>;
}): RouteEndpointAccessPoint[] {
  const parentEndpointChildPois = input.endpointId
    ? input.secondaryPoiIndex.get(input.endpointId)
    : undefined;
  const childParent = input.endpointId
    ? input.secondaryPoiParentIndex.get(input.endpointId)
    : undefined;
  if (
    childParent &&
    isRouteAccessSecondaryPoi({
      childLabel: childParent.childLabel,
      marker: childParent.marker,
      parent: childParent.parent,
    })
  ) {
    return [{ coordinate: input.endpointCoordinate }];
  }
  const childEndpointSiblingPois = childParent
    ? input.secondaryPoiIndex
        .get(childParent.parent.id)
        ?.filter((link) => link.marker.id !== input.endpointId)
    : undefined;
  const allChildPois = parentEndpointChildPois ?? childEndpointSiblingPois;
  const accessChildPois = allChildPois?.filter(isRouteAccessSecondaryPoi);
  const childPois = accessChildPois && accessChildPois.length > 0 ? accessChildPois : allChildPois;
  if (!childPois || childPois.length === 0) {
    return [{ coordinate: input.endpointCoordinate }];
  }

  const candidates: RouteEndpointAccessPoint[] = childPois.flatMap((link) => {
    const coordinate = getMarkerCenter(link.marker);
    return coordinate
      ? [
          {
            coordinate,
            accessId: link.marker.id,
            accessLabel: link.childLabel || formatMarkerDisplayName(link.marker.label),
          },
        ]
      : [];
  });

  return candidates.length > 0 ? candidates : [{ coordinate: input.endpointCoordinate }];
}

function areRouteEndpointsParentAndChild(
  leftId: string,
  rightId: string,
  secondaryPoiParentIndex: ReadonlyMap<string, SecondaryPoiParentLink>,
): boolean {
  const leftParent = secondaryPoiParentIndex.get(leftId)?.parent.id;
  const rightParent = secondaryPoiParentIndex.get(rightId)?.parent.id;
  return leftParent === rightId || rightParent === leftId;
}

export function isRouteAccessSecondaryPoi(link: SecondaryPoiLink): boolean {
  const text = normalizeMarkerSearchText(`${link.childLabel} ${link.marker.label}`);
  const isMetroParent = isMetroStationPoi(link.parent);

  if (isExitMarkerIcon(link.marker.iconFileName)) {
    return isMetroParent;
  }

  if (isWayAccessMarkerIcon(link.marker.iconFileName)) {
    return true;
  }

  if (isMetroParent) {
    return /出入口|出口|站口|[a-z]\d?口/.test(text);
  }

  return (
    !link.marker.iconFileName && /出入口|入口|出口|[东西南北]门|正门|侧门|大门|门岗/.test(text)
  );
}

export function buildRouteTraceCoordinates(
  draft: RoutePlanDraft,
  coordinates: Array<[number, number]>,
): Array<[number, number]> {
  return dedupeConsecutiveCoordinates([
    ...(draft.originRaw ? [draft.originRaw] : []),
    ...coordinates,
    ...(draft.destinationRaw ? [draft.destinationRaw] : []),
  ]);
}

export function createRouteTraceSegment(
  kind: RoutePlanTraceSegment['kind'],
  coordinates: Array<[number, number]>,
  color = routeWalkTraceColor,
): RoutePlanTraceSegment {
  return {
    kind,
    color,
    coordinates: dedupeConsecutiveCoordinates(coordinates),
  };
}

function createRouteRoadLabelsFromSegments(
  segments: readonly RoadRouteInstructionSegment[] | undefined,
  color = routeWalkTraceColor,
): RoutePlanRoadLabel[] {
  const labels: RoutePlanRoadLabel[] = [];
  let activeLabel: RoutePlanRoadLabel | undefined;

  for (const segment of segments ?? []) {
    if (segment.kind !== 'road' || segment.coordinates.length < 2) {
      activeLabel = undefined;
      continue;
    }

    const label = formatMarkerDisplayName(segment.label);
    if (!label) {
      activeLabel = undefined;
      continue;
    }

    const roadId = segment.roadId ?? `road:${normalizeMarkerSearchText(label)}`;
    const previousCoordinate = activeLabel?.coordinates.at(-1);
    const firstCoordinate = segment.coordinates[0];
    if (
      activeLabel &&
      activeLabel.roadId === roadId &&
      previousCoordinate &&
      firstCoordinate &&
      areCoordinatesClose(previousCoordinate, firstCoordinate)
    ) {
      activeLabel.coordinates = dedupeConsecutiveCoordinates([
        ...activeLabel.coordinates,
        ...segment.coordinates,
      ]);
      continue;
    }

    activeLabel = {
      color,
      coordinates: [...segment.coordinates],
      id: `route-road-label-${encodeURIComponent(roadId)}-${labels.length}`,
      label,
      roadId,
    };
    labels.push(activeLabel);
  }

  return labels.filter((label) => getCoordinateChainDistance(label.coordinates) > 0);
}

function combineRouteRoadLabels(
  ...groups: Array<RoutePlanRoadLabel[] | undefined>
): RoutePlanRoadLabel[] {
  return groups.flatMap((group) => group ?? []);
}

function compactRouteTraceSegments(segments: RoutePlanTraceSegment[]): RoutePlanTraceSegment[] {
  return segments.filter((segment) => segment.coordinates.length >= 2);
}

function getRouteEndpointAccessDistance(draft: RoutePlanDraft): number {
  return (
    getRouteSingleEndpointAccessDistance(draft, 'origin') +
    getRouteSingleEndpointAccessDistance(draft, 'destination')
  );
}

function getRouteSingleEndpointAccessDistance(
  draft: RoutePlanDraft,
  endpoint: RouteEndpointKind,
): number {
  const raw = endpoint === 'origin' ? draft.originRaw : draft.destinationRaw;
  const access = endpoint === 'origin' ? draft.origin : draft.destination;
  return raw ? getCoordinateDistance(raw, access) : 0;
}

function createRouteEndpointAccessSteps(
  draft: RoutePlanDraft,
  endpoint: RouteEndpointKind,
  t?: Translate,
): RoutePlanStep[] {
  const accessLabel =
    endpoint === 'origin' ? draft.originAccessLabel : draft.destinationAccessLabel;
  if (!accessLabel) {
    return [];
  }

  const distance = getRouteSingleEndpointAccessDistance(draft, endpoint);
  const minutes = estimateRouteMinutes(distance, 72);
  const label =
    endpoint === 'origin'
      ? t
        ? t('map.route.walkToAccess', {
            access: accessLabel,
            distance: formatRoutePlanDistance(distance, t),
            duration: formatRouteStepMinutes(minutes, t),
          })
        : `步行至 ${accessLabel} ${formatRoutePlanDistance(distance)} ${formatRouteStepMinutes(
            minutes,
          )}`
      : t
        ? t('map.route.walkFromAccess', {
            access: accessLabel,
            distance: formatRoutePlanDistance(distance, t),
            duration: formatRouteStepMinutes(minutes, t),
          })
        : `经 ${accessLabel} 步行至终点 ${formatRoutePlanDistance(
            distance,
          )} ${formatRouteStepMinutes(minutes)}`;

  return [createRouteWalkStep(label)];
}

function formatRouteWalkStepLabel(
  usesRoadGraph: boolean,
  distance: number,
  minutes: number,
  t?: Translate,
): string {
  if (!t) {
    return `${usesRoadGraph ? '沿道路步行' : '步行'} ${formatRoutePlanDistance(
      distance,
    )} ${formatRouteStepMinutes(minutes)}`;
  }

  return t(usesRoadGraph ? 'map.route.walkRoadWithDistance' : 'map.route.walkWithDistance', {
    distance: formatRoutePlanDistance(distance, t),
    duration: formatRouteStepMinutes(minutes, t),
  });
}

function createRoutePlaceStep(
  label: string,
  role?: RoutePlanStep['role'],
  icon?: string,
  color?: string,
): RoutePlanStep {
  const resolvedIcon =
    icon ?? (role === 'origin' ? 'location_on' : role === 'destination' ? 'flag' : undefined);
  return { kind: 'place', label, role, icon: resolvedIcon, color };
}

function createRouteWalkStep(label: string, details?: RoutePlanStepDetail[]): RoutePlanStep {
  return {
    kind: 'walk',
    label,
    details: details?.length ? details : [createRouteStepDetail('directions_walk', label)],
  };
}

function createRouteTransitStep(
  label: string,
  color?: string,
  details?: RoutePlanStepDetail[],
): RoutePlanStep {
  return { kind: 'transit', label, color, details };
}

function createRouteTransferStep(label: string, details?: RoutePlanStepDetail[]): RoutePlanStep {
  return { kind: 'transfer', label, role: 'transfer', details };
}

function createRouteStepDetail(
  icon: string,
  label: string,
  meta?: string,
  kind?: RoutePlanStepDetail['kind'],
): RoutePlanStepDetail {
  return { icon, label, meta, kind };
}

export function getRouteStepMarkerText(step: RoutePlanStep, t: Translate): string {
  if (step.role === 'origin') {
    return t('map.route.marker.origin');
  }
  if (step.role === 'destination') {
    return t('map.route.marker.destination');
  }
  return '';
}

export function buildRoadRouteGraph(
  roadMarkers: EndpointGroupMarker[],
  junctionSnapTolerance: number,
  mapDefaultY: number,
  verticalTolerance: number,
  worldId: string,
): RoadRouteGraph | undefined {
  const nodes: RoadRouteNode[] = [];
  const adjacency = new Map<string, RoadRouteEdge[]>();
  const baseRoadSegments: RoadRouteSegment[] = [];
  const markerById = new Map(roadMarkers.map((marker) => [marker.id, marker]));

  for (const marker of roadMarkers) {
    if (marker.spatial?.worldId && marker.spatial.worldId !== worldId) {
      continue;
    }
    if (marker.geometry.coordinates.length < 2) {
      continue;
    }

    const roadLabel = formatMarkerDisplayName(marker.label);
    const coordinates = getRoadTraceCoordinates(marker);
    const coordinateYs = resolveRoadCoordinateYs(marker, coordinates, mapDefaultY);
    coordinates.forEach((coordinate, index) => {
      const node: RoadRouteNode = {
        id: `${marker.id}:${index}`,
        coordinate,
        y: coordinateYs[index] ?? mapDefaultY,
        roadId: marker.id,
        roadLabel,
      };
      nodes.push(node);
      adjacency.set(node.id, []);
    });
  }

  if (nodes.length < 2 || nodes.length > 1200) {
    return undefined;
  }

  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const nodesByRoadId = new Map<string, RoadRouteNode[]>();
  for (const node of nodes) {
    const roadNodes = nodesByRoadId.get(node.roadId) ?? [];
    roadNodes.push(node);
    nodesByRoadId.set(node.roadId, roadNodes);
  }

  for (const roadNodes of nodesByRoadId.values()) {
    for (let index = 1; index < roadNodes.length; index += 1) {
      const previous = roadNodes[index - 1];
      const current = roadNodes[index];
      if (previous && current) {
        baseRoadSegments.push({
          end: current.coordinate,
          endY: current.y,
          endIsRoadTerminus: index === roadNodes.length - 1,
          endNodeId: current.id,
          id: `${previous.id}->${current.id}`,
          allowedModes: resolveRoadAllowedModes(markerById.get(previous.roadId)),
          direction: markerById.get(previous.roadId)?.spatial?.direction ?? 'both',
          roadId: previous.roadId,
          roadLabel: previous.roadLabel,
          start: previous.coordinate,
          startY: previous.y,
          startIsRoadTerminus: index === 1,
          startNodeId: previous.id,
          verticalConnector: Boolean(
            markerById.get(previous.roadId)?.spatial?.verticalConnectorKind,
          ),
        });
      }
    }
  }

  const baseRoadSegmentsById = new Map(baseRoadSegments.map((segment) => [segment.id, segment]));
  const connectionCandidates = collectRoadConnectionCandidates(
    baseRoadSegments,
    junctionSnapTolerance,
  );
  const segmentPointsById = new Map<
    string,
    Array<{ coordinate: [number, number]; nodeId: string; ratio: number }>
  >();
  const resolvedConnections: Array<{
    allowedModes: MapTravelMode[];
    distance: number;
    leftCoordinate: [number, number];
    leftNodeId: string;
    leftRoadLabel: string;
    rightCoordinate: [number, number];
    rightNodeId: string;
    rightRoadLabel: string;
  }> = [];
  const resolvedConnectionKeys = new Set<string>();
  const nodeIdsBySegmentPointKey = new Map<string, string>();
  let virtualNodeIndex = 0;

  const ensureSegmentPointNode = (
    segment: RoadRouteSegment,
    coordinate: [number, number],
  ): { coordinate: [number, number]; nodeId: string; ratio: number } => {
    if (areCoordinatesClose(segment.start, coordinate)) {
      return { coordinate: segment.start, nodeId: segment.startNodeId, ratio: 0 };
    }
    if (areCoordinatesClose(segment.end, coordinate)) {
      return { coordinate: segment.end, nodeId: segment.endNodeId, ratio: 1 };
    }

    const key = `${segment.id}:${coordinate[0].toFixed(3)}:${coordinate[1].toFixed(3)}`;
    const existingNodeId = nodeIdsBySegmentPointKey.get(key);
    if (existingNodeId) {
      return {
        coordinate,
        nodeId: existingNodeId,
        ratio: getRoadSegmentRatio(segment, coordinate),
      };
    }

    const nodeId = `road-virtual:${virtualNodeIndex}`;
    virtualNodeIndex += 1;
    nodes.push({
      coordinate,
      id: nodeId,
      roadId: segment.roadId,
      roadLabel: segment.roadLabel,
      y: interpolateNumber(segment.startY, segment.endY, getRoadSegmentRatio(segment, coordinate)),
    });
    nodesById.set(nodeId, nodes[nodes.length - 1]!);
    adjacency.set(nodeId, []);
    nodeIdsBySegmentPointKey.set(key, nodeId);
    return {
      coordinate,
      nodeId,
      ratio: getRoadSegmentRatio(segment, coordinate),
    };
  };

  for (const candidate of connectionCandidates) {
    const leftSegment = baseRoadSegmentsById.get(candidate.leftSegmentId);
    const rightSegment = baseRoadSegmentsById.get(candidate.rightSegmentId);
    if (!leftSegment || !rightSegment) {
      continue;
    }
    const leftY = interpolateNumber(
      leftSegment.startY,
      leftSegment.endY,
      getRoadSegmentRatio(leftSegment, candidate.leftCoordinate),
    );
    const rightY = interpolateNumber(
      rightSegment.startY,
      rightSegment.endY,
      getRoadSegmentRatio(rightSegment, candidate.rightCoordinate),
    );
    const allowedModes = intersectRoadAllowedModes(
      leftSegment.allowedModes,
      rightSegment.allowedModes,
    );
    if (Math.abs(leftY - rightY) > verticalTolerance || allowedModes.length === 0) {
      continue;
    }

    const leftPoint = ensureSegmentPointNode(leftSegment, candidate.leftCoordinate);
    const rightPoint = ensureSegmentPointNode(rightSegment, candidate.rightCoordinate);
    const leftSegmentPoints = segmentPointsById.get(leftSegment.id) ?? [];
    const rightSegmentPoints = segmentPointsById.get(rightSegment.id) ?? [];
    leftSegmentPoints.push(leftPoint);
    rightSegmentPoints.push(rightPoint);
    segmentPointsById.set(leftSegment.id, leftSegmentPoints);
    segmentPointsById.set(rightSegment.id, rightSegmentPoints);
    const connectionKey = `${leftPoint.nodeId}->${rightPoint.nodeId}`;
    if (resolvedConnectionKeys.has(connectionKey)) {
      continue;
    }
    resolvedConnectionKeys.add(connectionKey);
    resolvedConnections.push({
      allowedModes,
      distance: candidate.distance,
      leftCoordinate: leftPoint.coordinate,
      leftNodeId: leftPoint.nodeId,
      leftRoadLabel: candidate.leftRoadLabel,
      rightCoordinate: rightPoint.coordinate,
      rightNodeId: rightPoint.nodeId,
      rightRoadLabel: candidate.rightRoadLabel,
    });
  }

  const roadSegments: RoadRouteSegment[] = [];
  for (const segment of baseRoadSegments) {
    const segmentPoints = [
      { coordinate: segment.start, nodeId: segment.startNodeId, ratio: 0 },
      ...(segmentPointsById.get(segment.id) ?? []),
      { coordinate: segment.end, nodeId: segment.endNodeId, ratio: 1 },
    ]
      .sort((left, right) => left.ratio - right.ratio)
      .filter((point, index, array) => {
        const previous = array[index - 1];
        return !previous || previous.nodeId !== point.nodeId;
      });

    for (let index = 1; index < segmentPoints.length; index += 1) {
      const previous = segmentPoints[index - 1];
      const current = segmentPoints[index];
      if (!previous || !current || areCoordinatesClose(previous.coordinate, current.coordinate)) {
        continue;
      }

      const previousNode = nodesById.get(previous.nodeId);
      const currentNode = nodesById.get(current.nodeId);
      if (!previousNode || !currentNode) {
        continue;
      }

      if (
        Math.abs(previousNode.y - currentNode.y) > verticalTolerance &&
        !segment.verticalConnector
      ) {
        continue;
      }
      roadSegments.push({
        allowedModes: segment.allowedModes,
        direction: segment.direction,
        end: current.coordinate,
        endY: currentNode.y,
        endIsRoadTerminus: segment.endIsRoadTerminus && current.ratio === 1,
        endNodeId: current.nodeId,
        id: `${segment.id}:${index - 1}`,
        roadId: segment.roadId,
        roadLabel: segment.roadLabel,
        start: previous.coordinate,
        startY: previousNode.y,
        startIsRoadTerminus: segment.startIsRoadTerminus && previous.ratio === 0,
        startNodeId: previous.nodeId,
        verticalConnector: segment.verticalConnector,
      });
      addRoadRouteGraphEdge(adjacency, previousNode, currentNode, {
        allowedModes: segment.allowedModes,
        coordinates: [previous.coordinate, current.coordinate],
        direction: segment.direction,
        distance: getCoordinateDistance(previous.coordinate, current.coordinate),
        kind: 'road',
        label: segment.roadLabel,
        roadId: segment.roadId,
        reverseLabel: segment.roadLabel,
      });
    }
  }

  for (const connection of resolvedConnections) {
    const leftNode = nodesById.get(connection.leftNodeId);
    const rightNode = nodesById.get(connection.rightNodeId);
    if (!leftNode || !rightNode) {
      continue;
    }

    addRoadRouteGraphEdge(adjacency, leftNode, rightNode, {
      allowedModes: connection.allowedModes,
      coordinates: [connection.leftCoordinate, connection.rightCoordinate],
      direction: 'both',
      distance: connection.distance,
      kind: 'connection',
      label: connection.rightRoadLabel,
      reverseLabel: connection.leftRoadLabel,
    });
  }

  return {
    adjacency,
    defaultY: mapDefaultY,
    nodes,
    nodesById,
    roadSegments,
    verticalTolerance,
    worldId,
  };
}

function resolveRoadCoordinateYs(
  marker: EndpointGroupMarker,
  orderedCoordinates: Array<[number, number]>,
  mapDefaultY: number,
): number[] {
  const defaultY = marker.spatial?.defaultY ?? mapDefaultY;
  const yByCoordinate = new Map(
    marker.geometry.coordinates.map((coordinate, index) => [
      `${coordinate[0]}:${coordinate[1]}`,
      marker.spatial?.coordinateY?.[index] ?? defaultY,
    ]),
  );
  return orderedCoordinates.map(
    (coordinate) => yByCoordinate.get(`${coordinate[0]}:${coordinate[1]}`) ?? defaultY,
  );
}

function resolveRoadAllowedModes(marker: EndpointGroupMarker | undefined): MapTravelMode[] {
  if (marker?.spatial?.allowedModes?.length) {
    return marker.spatial.allowedModes;
  }
  return marker?.spatial?.networkKind === 'pedestrian'
    ? ['walk']
    : ['walk', 'taxi', 'bus', 'coach'];
}

function intersectRoadAllowedModes(
  left: readonly MapTravelMode[],
  right: readonly MapTravelMode[],
): MapTravelMode[] {
  const rightModes = new Set(right);
  return left.filter((mode) => rightModes.has(mode));
}

function interpolateNumber(start: number, end: number, ratio: number): number {
  return start + (end - start) * ratio;
}

function collectRoadConnectionCandidates(
  roadSegments: RoadRouteSegment[],
  junctionSnapTolerance: number,
): RoadConnectionCandidate[] {
  const segmentsById = new Map(roadSegments.map((segment) => [segment.id, segment]));
  return collectMapRoadConnectionProjections(roadSegments, junctionSnapTolerance).flatMap(
    (candidate) => {
      const left = segmentsById.get(candidate.leftSegmentId);
      const right = segmentsById.get(candidate.rightSegmentId);
      return left && right
        ? [
            {
              distance: candidate.distance,
              leftCoordinate: candidate.leftCoordinate,
              leftRoadLabel: left.roadLabel,
              leftSegmentId: left.id,
              rightCoordinate: candidate.rightCoordinate,
              rightRoadLabel: right.roadLabel,
              rightSegmentId: right.id,
            },
          ]
        : [];
    },
  );
}

function createRouteTaxiStep(label: string, details?: RoutePlanStepDetail[]): RoutePlanStep {
  return {
    kind: 'taxi',
    label,
    details: details?.length ? details : [createRouteStepDetail('local_taxi', label)],
  };
}

function projectPointOntoSegment(
  start: [number, number],
  end: [number, number],
  point: [number, number],
): { coordinate: [number, number]; ratio: number } {
  const deltaX = end[0] - start[0];
  const deltaZ = end[1] - start[1];
  const lengthSquared = deltaX * deltaX + deltaZ * deltaZ;
  const ratio = lengthSquared
    ? clampNumber(
        ((point[0] - start[0]) * deltaX + (point[1] - start[1]) * deltaZ) / lengthSquared,
        0,
        1,
      )
    : 0;
  return {
    coordinate: interpolateCoordinate(start, end, ratio),
    ratio,
  };
}

function getRoadSegmentRatio(segment: RoadRouteSegment, coordinate: [number, number]): number {
  return projectPointOntoSegment(segment.start, segment.end, coordinate).ratio;
}

function areCoordinatesClose(
  left: [number, number],
  right: [number, number],
  tolerance = 0.01,
): boolean {
  return getCoordinateDistance(left, right) <= tolerance;
}

function addRoadRouteGraphEdge(
  adjacency: Map<string, RoadRouteEdge[]>,
  from: RoadRouteNode,
  to: RoadRouteNode,
  input: {
    allowedModes: MapTravelMode[];
    coordinates: Array<[number, number]>;
    direction: MapNetworkDirection;
    distance: number;
    kind: 'connection' | 'road';
    label: string;
    roadId?: string;
    reverseLabel?: string;
  },
) {
  if (input.direction !== 'reverse') {
    adjacency.get(from.id)?.push({
      allowedModes: input.allowedModes,
      coordinates: input.coordinates,
      distance: input.distance,
      kind: input.kind,
      label: input.label,
      roadId: input.roadId,
      to: to.id,
    });
  }
  if (input.direction !== 'forward') {
    adjacency.get(to.id)?.push({
      allowedModes: input.allowedModes,
      coordinates: [...input.coordinates].reverse() as Array<[number, number]>,
      distance: input.distance,
      kind: input.kind,
      label: input.reverseLabel ?? input.label,
      roadId: input.roadId,
      to: from.id,
    });
  }
}

function findRoadRoutePath(
  graph: RoadRouteGraph,
  originId: string,
  destinationId: string,
  strategy: RoadRouteStrategy = 'shortest',
  travelMode: MapTravelMode = 'walk',
): RoadRoutePath | undefined {
  if (strategy === 'alternative-1' || strategy === 'alternative-2') {
    return findDiversifiedRoadRoutePath(
      graph,
      originId,
      destinationId,
      travelMode,
      strategy === 'alternative-1' ? 1 : 2,
    );
  }
  if (strategy === 'fewest-segments') {
    return findFewestSegmentRoadRoutePath(graph, originId, destinationId, travelMode);
  }
  if (strategy === 'fewer-turns') {
    return findFewerTurnRoadRoutePath(graph, originId, destinationId, travelMode);
  }

  if (originId === destinationId) {
    const node = graph.nodesById.get(originId);
    return node
      ? {
          coordinates: [node.coordinate],
          distance: 0,
          nodes: [node],
          segments: [],
        }
      : undefined;
  }

  const distances = new Map<string, number>();
  const previous = new Map<string, string>();
  const unvisited = new Set(graph.nodes.map((node) => node.id));

  for (const node of graph.nodes) {
    distances.set(node.id, node.id === originId ? 0 : Number.POSITIVE_INFINITY);
  }

  while (unvisited.size > 0) {
    const currentId = findNearestUnvisitedRoadRouteNode(unvisited, distances);
    if (!currentId) {
      break;
    }
    if (currentId === destinationId) {
      break;
    }

    unvisited.delete(currentId);
    const currentDistance = distances.get(currentId) ?? Number.POSITIVE_INFINITY;
    if (!Number.isFinite(currentDistance)) {
      break;
    }

    for (const edge of graph.adjacency.get(currentId) ?? []) {
      if (!edge.allowedModes.includes(travelMode)) {
        continue;
      }
      if (!unvisited.has(edge.to)) {
        continue;
      }
      const nextDistance = currentDistance + edge.distance;
      if (nextDistance < (distances.get(edge.to) ?? Number.POSITIVE_INFINITY)) {
        distances.set(edge.to, nextDistance);
        previous.set(edge.to, currentId);
      }
    }
  }

  const distance = distances.get(destinationId);
  if (distance === undefined || !Number.isFinite(distance)) {
    return undefined;
  }

  const pathIds = [destinationId];
  let currentId = destinationId;
  while (currentId !== originId) {
    const previousId = previous.get(currentId);
    if (!previousId) {
      return undefined;
    }
    pathIds.push(previousId);
    currentId = previousId;
  }

  const nodes = pathIds
    .reverse()
    .map((id) => graph.nodesById.get(id))
    .filter((node): node is RoadRouteNode => Boolean(node));
  if (nodes.length < 2) {
    return undefined;
  }

  const coordinates: Array<[number, number]> = [];
  const segments: RoadRouteInstructionSegment[] = [];
  for (let index = 1; index < pathIds.length; index += 1) {
    const previousId = pathIds[index - 1];
    const currentId = pathIds[index];
    const edge = previousId
      ? graph.adjacency.get(previousId)?.find((item) => item.to === currentId)
      : undefined;
    if (!edge) {
      continue;
    }

    appendRouteSegmentCoordinates(coordinates, edge.coordinates);
    segments.push({
      coordinates: edge.coordinates,
      kind: edge.kind,
      label: edge.label,
      roadId: edge.roadId,
    });
  }

  return { coordinates, distance, nodes, segments };
}

function findDiversifiedRoadRoutePath(
  graph: RoadRouteGraph,
  originId: string,
  destinationId: string,
  travelMode: MapTravelMode,
  alternativeIndex: number,
): RoadRoutePath | undefined {
  const shortest = findRoadRoutePath(graph, originId, destinationId, 'shortest', travelMode);
  if (!shortest) {
    return undefined;
  }

  const previousPaths = [shortest];
  for (let index = 0; index < alternativeIndex; index += 1) {
    const penalizedEdgeKeys = new Set<string>();
    const penalizedRoadIds = new Set<string>();
    for (const path of previousPaths) {
      collectRoadRoutePathPenaltyKeys(path, graph, penalizedEdgeKeys, penalizedRoadIds);
    }
    const nextPath = findPenalizedRoadRoutePath(
      graph,
      originId,
      destinationId,
      travelMode,
      penalizedEdgeKeys,
      penalizedRoadIds,
    );
    if (!nextPath) {
      return undefined;
    }
    previousPaths.push(nextPath);
  }

  return previousPaths.at(-1);
}

function findPenalizedRoadRoutePath(
  graph: RoadRouteGraph,
  originId: string,
  destinationId: string,
  travelMode: MapTravelMode,
  penalizedEdgeKeys: ReadonlySet<string>,
  penalizedRoadIds: ReadonlySet<string>,
): RoadRoutePath | undefined {
  if (originId === destinationId) {
    return findRoadRoutePath(graph, originId, destinationId, 'shortest', travelMode);
  }

  const scores = new Map<string, number>();
  const previous = new Map<string, string>();
  const unvisited = new Set(graph.nodes.map((node) => node.id));
  for (const node of graph.nodes) {
    scores.set(node.id, node.id === originId ? 0 : Number.POSITIVE_INFINITY);
  }

  while (unvisited.size > 0) {
    const currentId = findNearestUnvisitedRoadRouteNode(unvisited, scores);
    if (!currentId) {
      break;
    }
    if (currentId === destinationId) {
      break;
    }
    unvisited.delete(currentId);
    const currentScore = scores.get(currentId) ?? Number.POSITIVE_INFINITY;
    if (!Number.isFinite(currentScore)) {
      break;
    }

    for (const edge of graph.adjacency.get(currentId) ?? []) {
      if (!edge.allowedModes.includes(travelMode) || !unvisited.has(edge.to)) {
        continue;
      }
      const exactEdgePenalty = penalizedEdgeKeys.has(getRoadRouteEdgeKey(currentId, edge))
        ? edge.distance * 6 + 240
        : 0;
      const sameRoadPenalty =
        edge.roadId && penalizedRoadIds.has(edge.roadId) ? edge.distance * 1.5 : 0;
      const nextScore = currentScore + edge.distance + exactEdgePenalty + sameRoadPenalty;
      if (nextScore < (scores.get(edge.to) ?? Number.POSITIVE_INFINITY)) {
        scores.set(edge.to, nextScore);
        previous.set(edge.to, currentId);
      }
    }
  }

  if (!Number.isFinite(scores.get(destinationId) ?? Number.POSITIVE_INFINITY)) {
    return undefined;
  }

  const pathIds = [destinationId];
  let currentId = destinationId;
  while (currentId !== originId) {
    const previousId = previous.get(currentId);
    if (!previousId) {
      return undefined;
    }
    pathIds.push(previousId);
    currentId = previousId;
  }
  pathIds.reverse();

  const nodes = pathIds
    .map((id) => graph.nodesById.get(id))
    .filter((node): node is RoadRouteNode => Boolean(node));
  if (nodes.length < 2) {
    return undefined;
  }

  const coordinates: Array<[number, number]> = [];
  const segments: RoadRouteInstructionSegment[] = [];
  let distance = 0;
  for (let index = 1; index < pathIds.length; index += 1) {
    const fromId = pathIds[index - 1];
    const toId = pathIds[index];
    const edge = fromId ? graph.adjacency.get(fromId)?.find((item) => item.to === toId) : undefined;
    if (!edge) {
      return undefined;
    }
    appendRouteSegmentCoordinates(coordinates, edge.coordinates);
    distance += edge.distance;
    segments.push({
      coordinates: edge.coordinates,
      kind: edge.kind,
      label: edge.label,
      roadId: edge.roadId,
    });
  }

  return { coordinates, distance, nodes, segments };
}

function collectRoadRoutePathPenaltyKeys(
  path: RoadRoutePath,
  graph: RoadRouteGraph,
  edgeKeys: Set<string>,
  roadIds: Set<string>,
): void {
  for (let index = 1; index < path.nodes.length; index += 1) {
    const fromId = path.nodes[index - 1]?.id;
    const toId = path.nodes[index]?.id;
    const edge = fromId ? graph.adjacency.get(fromId)?.find((item) => item.to === toId) : undefined;
    if (!fromId || !edge) {
      continue;
    }
    edgeKeys.add(getRoadRouteEdgeKey(fromId, edge));
    if (edge.roadId) {
      roadIds.add(edge.roadId);
    }
  }
}

function getRoadRouteEdgeKey(fromId: string, edge: RoadRouteEdge): string {
  return `${fromId}>${edge.to}|${edge.roadId ?? edge.label}|${edge.kind}`;
}

function findFewestSegmentRoadRoutePath(
  graph: RoadRouteGraph,
  originId: string,
  destinationId: string,
  travelMode: MapTravelMode,
): RoadRoutePath | undefined {
  const originNode = graph.nodesById.get(originId);
  if (!originNode) {
    return undefined;
  }
  if (originId === destinationId) {
    return {
      coordinates: [originNode.coordinate],
      distance: 0,
      nodes: [originNode],
      segments: [],
    };
  }

  const segmentWeight = 100_000;
  const distances = new Map<string, number>();
  const segmentCounts = new Map<string, number>();
  const previous = new Map<string, string>();
  const unvisited = new Set(graph.nodes.map((node) => node.id));
  for (const node of graph.nodes) {
    distances.set(node.id, node.id === originId ? 0 : Number.POSITIVE_INFINITY);
    segmentCounts.set(node.id, node.id === originId ? 0 : Number.POSITIVE_INFINITY);
  }

  while (unvisited.size > 0) {
    let currentId: string | undefined;
    let bestScore = Number.POSITIVE_INFINITY;
    for (const nodeId of unvisited) {
      const count = segmentCounts.get(nodeId) ?? Number.POSITIVE_INFINITY;
      const distance = distances.get(nodeId) ?? Number.POSITIVE_INFINITY;
      const score = count * segmentWeight + distance;
      if (score < bestScore) {
        bestScore = score;
        currentId = nodeId;
      }
    }
    if (!currentId || !Number.isFinite(bestScore)) {
      break;
    }
    unvisited.delete(currentId);
    if (currentId === destinationId) {
      break;
    }

    const currentCount = segmentCounts.get(currentId) ?? Number.POSITIVE_INFINITY;
    const currentDistance = distances.get(currentId) ?? Number.POSITIVE_INFINITY;
    for (const edge of graph.adjacency.get(currentId) ?? []) {
      if (!edge.allowedModes.includes(travelMode) || !unvisited.has(edge.to)) {
        continue;
      }
      const nextCount = currentCount + 1;
      const nextDistance = currentDistance + edge.distance;
      const nextScore = nextCount * segmentWeight + nextDistance;
      const existingCount = segmentCounts.get(edge.to) ?? Number.POSITIVE_INFINITY;
      const existingDistance = distances.get(edge.to) ?? Number.POSITIVE_INFINITY;
      if (nextScore < existingCount * segmentWeight + existingDistance) {
        segmentCounts.set(edge.to, nextCount);
        distances.set(edge.to, nextDistance);
        previous.set(edge.to, currentId);
      }
    }
  }

  const distance = distances.get(destinationId);
  if (distance === undefined || !Number.isFinite(distance)) {
    return undefined;
  }
  const pathIds = [destinationId];
  let currentId = destinationId;
  while (currentId !== originId) {
    const previousId = previous.get(currentId);
    if (!previousId) {
      return undefined;
    }
    pathIds.push(previousId);
    currentId = previousId;
  }

  const nodes = pathIds
    .reverse()
    .map((id) => graph.nodesById.get(id))
    .filter((node): node is RoadRouteNode => Boolean(node));
  if (nodes.length < 2) {
    return undefined;
  }

  const coordinates: Array<[number, number]> = [];
  const segments: RoadRouteInstructionSegment[] = [];
  for (let index = 1; index < pathIds.length; index += 1) {
    const previousId = pathIds[index - 1];
    const currentId = pathIds[index];
    const edge = previousId
      ? graph.adjacency.get(previousId)?.find((item) => item.to === currentId)
      : undefined;
    if (!edge) {
      continue;
    }
    appendRouteSegmentCoordinates(coordinates, edge.coordinates);
    segments.push({
      coordinates: edge.coordinates,
      kind: edge.kind,
      label: edge.label,
      roadId: edge.roadId,
    });
  }
  return { coordinates, distance, nodes, segments };
}

function findFewerTurnRoadRoutePath(
  graph: RoadRouteGraph,
  originId: string,
  destinationId: string,
  travelMode: MapTravelMode,
): RoadRoutePath | undefined {
  const originNode = graph.nodesById.get(originId);
  if (!originNode) {
    return undefined;
  }
  if (originId === destinationId) {
    return {
      coordinates: [originNode.coordinate],
      distance: 0,
      nodes: [originNode],
      segments: [],
    };
  }

  type State = {
    distance: number;
    edge?: RoadRouteEdge;
    key: string;
    nodeId: string;
    previousKey?: string;
    score: number;
  };

  const startKey = `${originId}|`;
  const states = new Map<string, State>([
    [
      startKey,
      {
        distance: 0,
        key: startKey,
        nodeId: originId,
        score: 0,
      },
    ],
  ]);
  const unsettled = new Set([startKey]);
  const settled = new Set<string>();
  let destinationKey: string | undefined;

  while (unsettled.size > 0) {
    const currentKey = findNearestUnsettledRoadRouteState(unsettled, states);
    if (!currentKey) {
      break;
    }
    unsettled.delete(currentKey);
    settled.add(currentKey);

    const current = states.get(currentKey);
    if (!current) {
      continue;
    }
    if (current.nodeId === destinationId) {
      destinationKey = currentKey;
      break;
    }

    for (const edge of graph.adjacency.get(current.nodeId) ?? []) {
      if (!edge.allowedModes.includes(travelMode)) {
        continue;
      }
      const nextKey = `${edge.to}|${current.nodeId}`;
      if (settled.has(nextKey)) {
        continue;
      }

      const turnPenalty = current.edge ? getRoadRouteTurnPenalty(current.edge, edge) : 0;
      const nextScore = current.score + edge.distance + turnPenalty;
      const existing = states.get(nextKey);
      if (existing && existing.score <= nextScore) {
        continue;
      }

      states.set(nextKey, {
        distance: current.distance + edge.distance,
        edge,
        key: nextKey,
        nodeId: edge.to,
        previousKey: currentKey,
        score: nextScore,
      });
      unsettled.add(nextKey);
    }
  }

  if (!destinationKey) {
    return undefined;
  }

  const edges: RoadRouteEdge[] = [];
  const pathNodeIds: string[] = [];
  let currentKey: string | undefined = destinationKey;
  while (currentKey) {
    const state = states.get(currentKey);
    if (!state) {
      return undefined;
    }
    pathNodeIds.push(state.nodeId);
    if (state.edge) {
      edges.push(state.edge);
    }
    currentKey = state.previousKey;
  }

  const nodes = pathNodeIds
    .reverse()
    .map((id) => graph.nodesById.get(id))
    .filter((node): node is RoadRouteNode => Boolean(node));
  const orderedEdges = edges.reverse();
  if (nodes.length < 2 || orderedEdges.length === 0) {
    return undefined;
  }

  const coordinates: Array<[number, number]> = [];
  const segments: RoadRouteInstructionSegment[] = [];
  let distance = 0;
  for (const edge of orderedEdges) {
    appendRouteSegmentCoordinates(coordinates, edge.coordinates);
    distance += edge.distance;
    segments.push({
      coordinates: edge.coordinates,
      kind: edge.kind,
      label: edge.label,
      roadId: edge.roadId,
    });
  }

  return { coordinates, distance, nodes, segments };
}

function findNearestUnsettledRoadRouteState(
  unsettled: Set<string>,
  states: Map<string, { score: number }>,
): string | undefined {
  let bestKey: string | undefined;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const key of unsettled) {
    const score = states.get(key)?.score ?? Number.POSITIVE_INFINITY;
    if (score < bestScore) {
      bestKey = key;
      bestScore = score;
    }
  }
  return bestKey;
}

function getRoadRouteTurnPenalty(previousEdge: RoadRouteEdge, nextEdge: RoadRouteEdge): number {
  const previousVector = getCoordinateChainVector(previousEdge.coordinates);
  const nextVector = getCoordinateChainVector(nextEdge.coordinates);
  const previousLength = Math.hypot(previousVector[0], previousVector[1]);
  const nextLength = Math.hypot(nextVector[0], nextVector[1]);
  if (previousLength === 0 || nextLength === 0) {
    return 0;
  }

  const cosine = clampNumber(
    (previousVector[0] * nextVector[0] + previousVector[1] * nextVector[1]) /
      (previousLength * nextLength),
    -1,
    1,
  );
  const angle = Math.acos(cosine);
  const anglePenalty = Math.pow(angle / Math.PI, 1.25) * 920;
  const roadChangePenalty = previousEdge.label === nextEdge.label ? 0 : 120;
  const connectionPenalty = nextEdge.kind === 'connection' ? 80 : 0;
  return anglePenalty + roadChangePenalty + connectionPenalty;
}

function getCoordinateChainVector(coordinates: Array<[number, number]>): [number, number] {
  const start = coordinates[0];
  const end = coordinates.at(-1);
  if (!start || !end) {
    return [0, 0];
  }
  return [end[0] - start[0], end[1] - start[1]];
}

function buildRoadRouteStepDetails(
  segments: RoadRouteInstructionSegment[],
  t?: Translate,
  travelMode: 'walk' | 'taxi' = 'walk',
  blocksPerMinute = 64,
): RoutePlanStepDetail[] {
  const groups: Array<{
    distance: number;
    end: [number, number];
    label: string;
    kind: RoadRouteInstructionSegment['kind'];
    start: [number, number];
    vector: [number, number];
  }> = [];

  for (const segment of segments) {
    if (segment.coordinates.length < 2) {
      continue;
    }

    const distance = getCoordinateChainDistance(segment.coordinates);
    if (distance <= 0) {
      continue;
    }

    const start = segment.coordinates[0];
    const end = segment.coordinates[segment.coordinates.length - 1];
    if (!start || !end) {
      continue;
    }

    const vector: [number, number] = [end[0] - start[0], end[1] - start[1]];
    const lastGroup = groups.at(-1);
    if (
      lastGroup &&
      lastGroup.label === segment.label &&
      ((lastGroup.kind === 'road' && segment.kind === 'road') ||
        (lastGroup.kind === 'connection' && segment.kind === 'road'))
    ) {
      lastGroup.distance += distance;
      lastGroup.kind = 'road';
      lastGroup.end = end;
      lastGroup.vector = vector;
    } else {
      groups.push({
        distance,
        end,
        kind: segment.kind,
        label: segment.label,
        start,
        vector,
      });
    }
  }

  return compactShortRoadInstructionGroups(groups).map((group, index, compactedGroups) =>
    createRouteStepDetail(
      index === 0
        ? travelMode === 'taxi'
          ? 'local_taxi'
          : 'directions_walk'
        : getTurnInstructionIcon(compactedGroups[index - 1]?.vector, group.vector),
      formatRoadRouteStepLabel(group.kind, group.label, t),
      `${formatRoutePlanDistance(group.distance, t)} ${formatRouteStepMinutes(
        estimateRouteMinutes(
          group.distance,
          travelMode === 'taxi'
            ? blocksPerMinute
            : group.kind === 'road' || group.kind === 'connection'
              ? 64
              : 72,
        ),
        t,
      )}`,
      'process',
    ),
  );
}

function compactShortRoadInstructionGroups(
  groups: Array<{
    distance: number;
    end: [number, number];
    label: string;
    kind: RoadRouteInstructionSegment['kind'];
    start: [number, number];
    vector: [number, number];
  }>,
): typeof groups {
  const compacted = groups.map((group) => ({ ...group }));
  const shortSegmentDistance = 24;
  for (let index = 1; index < compacted.length - 1; index += 1) {
    const current = compacted[index];
    const next = compacted[index + 1];
    if (
      !current ||
      !next ||
      current.distance > shortSegmentDistance ||
      (current.kind !== 'road' && current.kind !== 'connection') ||
      (next.kind !== 'road' && next.kind !== 'connection')
    ) {
      continue;
    }

    // 很短的中间路段只会制造一次“刚转弯又转弯”的噪声，合并到下一条指令。
    next.distance += current.distance;
    next.start = current.start;
    next.vector = [next.end[0] - next.start[0], next.end[1] - next.start[1]];
    compacted.splice(index, 1);
    index -= 1;
  }
  return compacted;
}

function formatRoadRouteStepLabel(
  kind: RoadRouteInstructionSegment['kind'],
  label: string,
  t?: Translate,
): string {
  if (kind === 'approach') {
    return t ? t('map.route.road.approach', { road: label }) : `接近 ${label}`;
  }
  if (kind === 'connection') {
    return t ? t('map.route.road.connection', { road: label }) : `连接到 ${label}`;
  }
  if (kind === 'depart') {
    return t ? t('map.route.road.depart') : '前往终点';
  }
  return label;
}

export function getTurnInstructionText(icon: string, t?: Translate): string | undefined {
  switch (icon) {
    case 'straight':
      return t ? t('map.route.turn.straight') : '直行';
    case 'turn_left':
      return t ? t('map.route.turn.left') : '左转';
    case 'turn_right':
      return t ? t('map.route.turn.right') : '右转';
    case 'turn_slight_left':
      return t ? t('map.route.turn.slightLeft') : '向左前方';
    case 'turn_slight_right':
      return t ? t('map.route.turn.slightRight') : '向右前方';
    default:
      return undefined;
  }
}

function buildWalkRouteBetweenCoordinates(
  origin: [number, number],
  destination: [number, number],
  roadGraph?: RoadRouteGraph,
  routeCache?: RoutePlanningCache,
  t?: Translate,
  accessOptions?: RoadRouteAccessOptions,
  strategy: RoadRouteStrategy = 'shortest',
): ResolvedWalkRoute {
  const roadRoute = roadGraph
    ? findRoadRouteBetweenCoordinates(
        origin,
        destination,
        roadGraph,
        routeCache,
        t,
        accessOptions,
        strategy,
      )
    : undefined;
  if (
    roadRoute &&
    !isRoadRouteDirectAccessBlocked(roadRoute, routeCache?.traversalBarriers ?? [], 'walk')
  ) {
    return {
      blockedByTraversalBarrier: false,
      coordinates: roadRoute.coordinates,
      distance: roadRoute.distance,
      details: roadRoute.details,
      roadSegments: roadRoute.roadSegments,
      usesRoadGraph: true,
    };
  }

  const distance = getCoordinateDistance(origin, destination);
  const blockedByTraversalBarrier = isDirectTraversalBlocked(
    origin,
    destination,
    routeCache?.traversalBarriers ?? [],
    'walk',
  );
  const minutes = estimateRouteMinutes(distance, 72);
  return {
    blockedByTraversalBarrier,
    coordinates: [origin, destination],
    distance: blockedByTraversalBarrier ? Number.POSITIVE_INFINITY : distance,
    details: blockedByTraversalBarrier
      ? []
      : [
          createRouteStepDetail(
            'directions_walk',
            t ? t('map.route.walkStraight') : '直线步行',
            `${formatRoutePlanDistance(distance, t)} ${formatRouteStepMinutes(minutes, t)}`,
            'process',
          ),
        ],
    roadSegments: [],
    usesRoadGraph: false,
  };
}

function isDirectTraversalBlocked(
  origin: [number, number],
  destination: [number, number],
  barriers: RouteTraversalBarrier[],
  mode: MapTravelMode,
): boolean {
  return barriers.some(
    (barrier) =>
      barrier.blockedModes.includes(mode) &&
      doesCoordinateSegmentCrossRegion(origin, destination, barrier.geometry),
  );
}

function isRoadRouteDirectAccessBlocked(
  route: ResolvedRoadRoute,
  barriers: RouteTraversalBarrier[],
  mode: MapTravelMode,
): boolean {
  return route.roadSegments.some(
    (segment) =>
      (segment.kind === 'approach' || segment.kind === 'depart') &&
      segment.coordinates.some((coordinate, index) => {
        const next = segment.coordinates[index + 1];
        return Boolean(next && isDirectTraversalBlocked(coordinate, next, barriers, mode));
      }),
  );
}

function doesCoordinateSegmentCrossRegion(
  origin: [number, number],
  destination: [number, number],
  region: RegionGeometry,
): boolean {
  if (isCoordinateInsideRegion(origin, region) || isCoordinateInsideRegion(destination, region)) {
    return true;
  }

  return getRegionBoundaryRings(region).some((ring) => {
    for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
      const start = ring[previous];
      const end = ring[index];
      if (start && end && doCoordinateSegmentsIntersect(origin, destination, start, end)) {
        return true;
      }
    }
    return false;
  });
}

function getRegionBoundaryRings(region: RegionGeometry): Array<Array<[number, number]>> {
  if (region.type === 'Rectangle') {
    return [rectangleBoundsToMapCoordinates(region.bounds)];
  }
  if (region.type === 'MultiRectangle') {
    return region.rectangles.map(rectangleBoundsToMapCoordinates);
  }
  if (region.type === 'Polygon') {
    return region.coordinates;
  }
  return region.coordinates.flat();
}

function doCoordinateSegmentsIntersect(
  firstStart: [number, number],
  firstEnd: [number, number],
  secondStart: [number, number],
  secondEnd: [number, number],
): boolean {
  const firstSideStart = getCoordinateOrientation(firstStart, firstEnd, secondStart);
  const firstSideEnd = getCoordinateOrientation(firstStart, firstEnd, secondEnd);
  const secondSideStart = getCoordinateOrientation(secondStart, secondEnd, firstStart);
  const secondSideEnd = getCoordinateOrientation(secondStart, secondEnd, firstEnd);

  if (firstSideStart * firstSideEnd < 0 && secondSideStart * secondSideEnd < 0) {
    return true;
  }
  return (
    (firstSideStart === 0 && isCoordinateOnSegment(secondStart, firstStart, firstEnd)) ||
    (firstSideEnd === 0 && isCoordinateOnSegment(secondEnd, firstStart, firstEnd)) ||
    (secondSideStart === 0 && isCoordinateOnSegment(firstStart, secondStart, secondEnd)) ||
    (secondSideEnd === 0 && isCoordinateOnSegment(firstEnd, secondStart, secondEnd))
  );
}

function getCoordinateOrientation(
  [originX, originZ]: [number, number],
  [targetX, targetZ]: [number, number],
  [pointX, pointZ]: [number, number],
): -1 | 0 | 1 {
  const cross = (targetX - originX) * (pointZ - originZ) - (targetZ - originZ) * (pointX - originX);
  if (Math.abs(cross) <= 1e-9) {
    return 0;
  }
  return cross < 0 ? -1 : 1;
}

function buildWalkRouteToTransitStop(input: {
  markerRoadAccessIndex: ReadonlyMap<string, RoadAccessCandidate[]>;
  mode: RouteTransportMode;
  origin: [number, number];
  originRoadAccessCandidates?: RoadAccessCandidate[];
  roadGraph?: RoadRouteGraph;
  routeCache?: RoutePlanningCache;
  secondaryPoiIndex: ReadonlyMap<string, SecondaryPoiLink[]>;
  stop: TransitRouteStop;
  t: Translate;
}): ResolvedWalkRoute {
  const access = resolveTransitStopAccessPoint(
    input.stop,
    input.mode,
    input.origin,
    input.secondaryPoiIndex,
  );
  if (!access) {
    return buildWalkRouteBetweenCoordinates(
      input.origin,
      input.stop.center,
      input.roadGraph,
      input.routeCache,
      input.t,
      {
        destinationAccessCandidates: getIndexedMarkerRoadAccessCandidates(
          input.markerRoadAccessIndex,
          input.stop.marker.id,
        ),
        originAccessCandidates: input.originRoadAccessCandidates,
      },
    );
  }

  const externalRoute = buildWalkRouteBetweenCoordinates(
    input.origin,
    access.coordinate,
    input.roadGraph,
    input.routeCache,
    input.t,
    {
      destinationAccessCandidates: getIndexedMarkerRoadAccessCandidates(
        input.markerRoadAccessIndex,
        access.markerId,
      ),
      originAccessCandidates: input.originRoadAccessCandidates,
    },
  );
  return appendTransitStopAccessSegment({
    access,
    externalRoute,
    markerIds: [access.markerId],
    mode: input.mode,
    stopCoordinate: input.stop.center,
    t: input.t,
    type: 'enter',
  });
}

function buildWalkRouteFromTransitStop(input: {
  destination: [number, number];
  destinationRoadAccessCandidates?: RoadAccessCandidate[];
  markerRoadAccessIndex: ReadonlyMap<string, RoadAccessCandidate[]>;
  mode: RouteTransportMode;
  roadGraph?: RoadRouteGraph;
  routeCache?: RoutePlanningCache;
  secondaryPoiIndex: ReadonlyMap<string, SecondaryPoiLink[]>;
  stop: TransitRouteStop;
  t: Translate;
}): ResolvedWalkRoute {
  const access = resolveTransitStopAccessPoint(
    input.stop,
    input.mode,
    input.destination,
    input.secondaryPoiIndex,
  );
  if (!access) {
    return buildWalkRouteBetweenCoordinates(
      input.stop.center,
      input.destination,
      input.roadGraph,
      input.routeCache,
      input.t,
      {
        destinationAccessCandidates: input.destinationRoadAccessCandidates,
        originAccessCandidates: getIndexedMarkerRoadAccessCandidates(
          input.markerRoadAccessIndex,
          input.stop.marker.id,
        ),
      },
    );
  }

  const externalRoute = buildWalkRouteBetweenCoordinates(
    access.coordinate,
    input.destination,
    input.roadGraph,
    input.routeCache,
    input.t,
    {
      destinationAccessCandidates: input.destinationRoadAccessCandidates,
      originAccessCandidates: getIndexedMarkerRoadAccessCandidates(
        input.markerRoadAccessIndex,
        access.markerId,
      ),
    },
  );
  return prependTransitStopAccessSegment({
    access,
    externalRoute,
    markerIds: [access.markerId],
    mode: input.mode,
    stopCoordinate: input.stop.center,
    t: input.t,
    type: 'exit',
  });
}

function resolveTransitStopAccessPoint(
  stop: TransitRouteStop,
  mode: RouteTransportMode,
  reference: [number, number],
  secondaryPoiIndex: ReadonlyMap<string, SecondaryPoiLink[]>,
): { coordinate: [number, number]; label: string; markerId: string } | undefined {
  if (mode !== 'metro') {
    return undefined;
  }

  const links = secondaryPoiIndex.get(stop.marker.id)?.filter(isRouteAccessSecondaryPoi) ?? [];
  return links
    .map((link) => {
      const coordinate = getMarkerCenter(link.marker);
      return coordinate
        ? {
            coordinate,
            label: link.childLabel || formatMarkerDisplayName(link.marker.label),
            markerId: link.marker.id,
            distance: getCoordinateDistance(coordinate, reference),
          }
        : undefined;
    })
    .filter(
      (
        item,
      ): item is {
        coordinate: [number, number];
        label: string;
        markerId: string;
        distance: number;
      } => Boolean(item),
    )
    .sort((left, right) => left.distance - right.distance)[0];
}

function appendTransitStopAccessSegment(input: {
  access: { coordinate: [number, number]; label: string };
  externalRoute: ResolvedWalkRoute;
  markerIds?: string[];
  mode: RouteTransportMode;
  stopCoordinate: [number, number];
  t: Translate;
  type: 'enter' | 'exit';
}): ResolvedWalkRoute {
  const internalDistance = getCoordinateDistance(input.access.coordinate, input.stopCoordinate);
  const internalMinutes = estimateRouteMinutes(internalDistance, 72);
  return {
    blockedByTraversalBarrier: input.externalRoute.blockedByTraversalBarrier,
    coordinates: dedupeConsecutiveCoordinates([
      ...input.externalRoute.coordinates,
      input.stopCoordinate,
    ]),
    details: [
      ...input.externalRoute.details,
      createRouteStepDetail(
        getTransitAccessDetailIcon(input.mode),
        input.t('map.route.metroEnterViaAccess', { access: input.access.label }),
        `${formatRoutePlanDistance(internalDistance, input.t)} ${formatRouteStepMinutes(
          internalMinutes,
          input.t,
        )}`,
        'process',
      ),
    ],
    distance: input.externalRoute.distance + internalDistance,
    markerIds: dedupeValues([...(input.externalRoute.markerIds ?? []), ...(input.markerIds ?? [])]),
    roadSegments: input.externalRoute.roadSegments,
    usesRoadGraph: input.externalRoute.usesRoadGraph,
  };
}

function prependTransitStopAccessSegment(input: {
  access: { coordinate: [number, number]; label: string };
  externalRoute: ResolvedWalkRoute;
  markerIds?: string[];
  mode: RouteTransportMode;
  stopCoordinate: [number, number];
  t: Translate;
  type: 'enter' | 'exit';
}): ResolvedWalkRoute {
  const internalDistance = getCoordinateDistance(input.stopCoordinate, input.access.coordinate);
  const internalMinutes = estimateRouteMinutes(internalDistance, 72);
  return {
    blockedByTraversalBarrier: input.externalRoute.blockedByTraversalBarrier,
    coordinates: dedupeConsecutiveCoordinates([
      input.stopCoordinate,
      ...input.externalRoute.coordinates,
    ]),
    details: [
      createRouteStepDetail(
        getTransitAccessDetailIcon(input.mode),
        input.t('map.route.metroExitViaAccess', { access: input.access.label }),
        `${formatRoutePlanDistance(internalDistance, input.t)} ${formatRouteStepMinutes(
          internalMinutes,
          input.t,
        )}`,
        'process',
      ),
      ...input.externalRoute.details,
    ],
    distance: internalDistance + input.externalRoute.distance,
    markerIds: dedupeValues([...(input.markerIds ?? []), ...(input.externalRoute.markerIds ?? [])]),
    roadSegments: input.externalRoute.roadSegments,
    usesRoadGraph: input.externalRoute.usesRoadGraph,
  };
}

function getTransitAccessDetailIcon(mode: RouteTransportMode): string {
  return mode === 'metro' ? 'subway' : 'directions_walk';
}

// 登乘/离开的导航口令按交通方式区分：地铁为封闭站厅（进站/出站），轮渡为码头（上船/下船），其余为车辆（上车/下车）
function formatTransitBoardStepLabel(
  mode: TransitRouteTransportMode,
  name: string,
  t: Translate,
): string {
  if (mode === 'metro') {
    return t('map.route.boardMetro', { name });
  }
  if (mode === 'ferry') {
    return t('map.route.boardFerry', { name });
  }
  return t('map.route.board', { name });
}

function formatTransitAlightStepLabel(
  mode: TransitRouteTransportMode,
  name: string,
  t: Translate,
): string {
  if (mode === 'metro') {
    return t('map.route.alightMetro', { name });
  }
  if (mode === 'ferry') {
    return t('map.route.alightFerry', { name });
  }
  return t('map.route.alight', { name });
}

export function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getTurnInstructionIcon(
  previous: [number, number] | undefined,
  current: [number, number],
): string {
  if (!previous) {
    return 'directions_walk';
  }

  const previousLength = Math.hypot(previous[0], previous[1]);
  const currentLength = Math.hypot(current[0], current[1]);
  if (previousLength === 0 || currentLength === 0) {
    return 'straight';
  }

  const cross = previous[0] * current[1] - previous[1] * current[0];
  const dot = previous[0] * current[0] + previous[1] * current[1];
  const angle = Math.atan2(cross, dot);
  const absoluteAngle = Math.abs(angle);
  if (absoluteAngle < 0.35) {
    return 'straight';
  }
  if (absoluteAngle < 1.05) {
    return angle > 0 ? 'turn_slight_right' : 'turn_slight_left';
  }
  return angle > 0 ? 'turn_right' : 'turn_left';
}

function findNearestUnvisitedRoadRouteNode(
  unvisited: Set<string>,
  distances: Map<string, number>,
): string | undefined {
  let nearestId: string | undefined;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const id of unvisited) {
    const distance = distances.get(id) ?? Number.POSITIVE_INFINITY;
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestId = id;
    }
  }
  return nearestId;
}

export function dedupeConsecutiveCoordinates(
  coordinates: Array<[number, number]>,
): Array<[number, number]> {
  return coordinates.filter((coordinate, index) => {
    const previous = coordinates[index - 1];
    return !previous || previous[0] !== coordinate[0] || previous[1] !== coordinate[1];
  });
}

export interface TransitRouteStop {
  center: [number, number];
  index: number;
  marker: PointMarker;
  stop: TransitLineStopForMap;
}

export interface TransitSegmentRouteMeasurement {
  distance: number;
  junctionCount: number;
  travelMinutes?: number;
}

export interface TransitSegmentRouteResolution {
  coordinates: Array<[number, number]>;
  distance: number;
  measurements: TransitSegmentRouteMeasurement[];
  resolved: boolean;
  usesRoadGraph: boolean;
}

type RailFareDistanceGraph = ReadonlyMap<string, ReadonlyMap<string, number>>;

interface TransitLineDirectionCandidate {
  color: string;
  direction: 'forward' | 'reverse';
  icon: string;
  line: TransitOverviewLine;
  mode: RouteTransportModeOption & { mode: TransitRouteTransportMode };
  modeLabel: string;
  stops: TransitRouteStop[];
  terminalName: string;
}

function buildTransitRoutePlanOptions(input: {
  draft: RoutePlanDraft;
  enabledModes: EnabledRouteTransportModes;
  markerRoadAccessIndex: ReadonlyMap<string, RoadAccessCandidate[]>;
  modeProfiles: TransitModeProfileForMap[];
  pointMarkers: PointMarker[];
  roadGraph?: RoadRouteGraph;
  roadTiming?: MapSpatialProfile['roadTiming'];
  routeCache: RoutePlanningCache;
  secondaryPoiIndex: ReadonlyMap<string, SecondaryPoiLink[]>;
  t: Translate;
  transitFare?: MapSpatialProfile['transitFare'];
  transitLines: TransitOverviewLine[];
}): RoutePlanOption[] {
  const profileByMode = new Map(input.modeProfiles.map((profile) => [profile.mode, profile]));
  const stationMarkerIndex = buildTransitStationMarkerIndex(input.pointMarkers);
  const lineCandidates: TransitLineDirectionCandidate[] = [];
  const railFareDistanceGraph = buildRailFareDistanceGraph(
    input.transitLines,
    input.pointMarkers,
    stationMarkerIndex,
  );

  for (const mode of routeTransportModeOptions) {
    if (!isTransitRouteTransportMode(mode.mode) || !input.enabledModes[mode.mode]) {
      continue;
    }

    const profile = profileByMode.get(mode.mode);
    for (const line of input.transitLines.filter((item) => item.mode === mode.mode)) {
      if ((line.operationStatus ?? 'operating') !== 'operating') {
        continue;
      }
      for (const direction of ['forward', 'reverse'] as const) {
        const stops = getDirectionalLineStops(line, direction)
          .map((stop): Omit<TransitRouteStop, 'index'> | undefined => {
            const marker = findTransitStationMarker(
              stop,
              stationMarkerIndex,
              input.pointMarkers,
              mode.mode,
            );
            const center = marker ? getMarkerCenter(marker) : undefined;
            return marker && center ? { center, marker, stop } : undefined;
          })
          .filter((stop): stop is Omit<TransitRouteStop, 'index'> => Boolean(stop))
          .map((stop, index): TransitRouteStop => ({ ...stop, index }));

        if (stops.length < 2) {
          continue;
        }

        const terminalStop = stops.at(-1)?.stop;
        lineCandidates.push({
          color: line.color ?? profile?.color ?? mode.color,
          direction,
          icon: profile?.icon ?? mode.icon,
          line,
          mode: { ...mode, mode: mode.mode },
          modeLabel: getRouteTransportModeLabel(mode.mode, input.t),
          stops,
          // 方向终点必须取当前候选方向的最后一站；不能回退到线路的正向终点，
          // 否则中文界面缺少 displayStationName 时，反向方案会被标成相反方向。
          terminalName: formatMarkerDisplayName(
            terminalStop?.displayStationName ?? terminalStop?.stationName ?? line.name,
          ),
        });
      }
    }
  }

  const directOptions = lineCandidates
    .map((candidate) =>
      buildDirectTransitLineOption(
        candidate,
        input.draft,
        input.t,
        input.markerRoadAccessIndex,
        input.secondaryPoiIndex,
        input.roadGraph,
        input.routeCache,
        input.roadTiming,
        input.transitFare,
        railFareDistanceGraph,
      ),
    )
    .filter((option): option is RoutePlanOption => Boolean(option));
  const transferOptions = buildTransferTransitLineOptions(
    lineCandidates,
    input.draft,
    input.t,
    input.markerRoadAccessIndex,
    input.secondaryPoiIndex,
    input.roadGraph,
    input.routeCache,
    input.roadTiming,
    input.transitFare,
    railFareDistanceGraph,
  );

  return [...directOptions, ...transferOptions].sort(compareRoutePlanOptions);
}

function buildRailFareDistanceGraph(
  lines: TransitOverviewLine[],
  pointMarkers: PointMarker[],
  stationMarkerIndex: Map<string, PointMarker[]>,
): RailFareDistanceGraph {
  const graph = new Map<string, Map<string, number>>();
  const addEdge = (leftId: string, rightId: string, distance: number) => {
    const left = graph.get(leftId) ?? new Map<string, number>();
    const right = graph.get(rightId) ?? new Map<string, number>();
    left.set(rightId, Math.min(left.get(rightId) ?? Number.POSITIVE_INFINITY, distance));
    right.set(leftId, Math.min(right.get(leftId) ?? Number.POSITIVE_INFINITY, distance));
    graph.set(leftId, left);
    graph.set(rightId, right);
  };

  for (const line of lines) {
    if (
      (line.operationStatus ?? 'operating') !== 'operating' ||
      !isContinuousRailRouteMode(line.mode as RouteTransportMode)
    ) {
      continue;
    }
    const mode = line.mode as 'metro' | 'tram';
    const stops = getDirectionalLineStops(line, 'forward')
      .map((stop): Omit<TransitRouteStop, 'index'> | undefined => {
        const marker = findTransitStationMarker(stop, stationMarkerIndex, pointMarkers, mode);
        const center = marker ? getMarkerCenter(marker) : undefined;
        return marker && center ? { center, marker, stop } : undefined;
      })
      .filter((stop): stop is Omit<TransitRouteStop, 'index'> => Boolean(stop))
      .map((stop, index): TransitRouteStop => ({ ...stop, index }));
    for (let index = 1; index < stops.length; index += 1) {
      const previous = stops[index - 1];
      const current = stops[index];
      if (!previous || !current) {
        continue;
      }
      if (getTransitSegmentOperationStatus(line, previous, current) !== 'operating') {
        continue;
      }
      const configured = getConfiguredTransitSegment(line, previous, current, 'forward');
      const distance = getCoordinateChainDistance([
        previous.center,
        ...(configured?.waypoints ?? []),
        current.center,
      ]);
      addEdge(previous.marker.id, current.marker.id, Math.max(0, distance));
    }
  }
  return graph;
}

function findRailFareDistance(
  graph: RailFareDistanceGraph | undefined,
  originId: string,
  destinationId: string,
): number | undefined {
  if (!graph?.has(originId) || !graph.has(destinationId)) {
    return undefined;
  }
  const distances = new Map<string, number>([[originId, 0]]);
  const unvisited = new Set(graph.keys());
  while (unvisited.size > 0) {
    let currentId: string | undefined;
    let currentDistance = Number.POSITIVE_INFINITY;
    for (const id of unvisited) {
      const distance = distances.get(id) ?? Number.POSITIVE_INFINITY;
      if (distance < currentDistance) {
        currentId = id;
        currentDistance = distance;
      }
    }
    if (!currentId || !Number.isFinite(currentDistance)) {
      return undefined;
    }
    if (currentId === destinationId) {
      return currentDistance;
    }
    unvisited.delete(currentId);
    for (const [nextId, edgeDistance] of graph.get(currentId) ?? []) {
      if (!unvisited.has(nextId)) {
        continue;
      }
      const nextDistance = currentDistance + edgeDistance;
      if (nextDistance < (distances.get(nextId) ?? Number.POSITIVE_INFINITY)) {
        distances.set(nextId, nextDistance);
      }
    }
  }
  return undefined;
}

function isContinuousRailRouteMode(mode: RouteTransportMode): mode is 'metro' | 'tram' {
  return mode === 'metro' || mode === 'tram';
}

function buildDirectTransitLineOption(
  candidate: TransitLineDirectionCandidate,
  draft: RoutePlanDraft,
  t: Translate,
  markerRoadAccessIndex: ReadonlyMap<string, RoadAccessCandidate[]>,
  secondaryPoiIndex: ReadonlyMap<string, SecondaryPoiLink[]>,
  roadGraph?: RoadRouteGraph,
  routeCache?: RoutePlanningCache,
  roadTiming?: MapSpatialProfile['roadTiming'],
  transitFare?: MapSpatialProfile['transitFare'],
  railFareDistanceGraph?: RailFareDistanceGraph,
): RoutePlanOption | undefined {
  const originStop = findNearestRouteLineStop(draft.origin, candidate.stops);
  const destinationStop = findNearestRouteLineStop(draft.destination, candidate.stops);
  if (!originStop || !destinationStop || originStop.index >= destinationStop.index) {
    return undefined;
  }
  if (originStop.marker.id === destinationStop.marker.id) {
    return undefined;
  }

  const segmentStops = candidate.stops.slice(originStop.index, destinationStop.index + 1);
  if (!areTransitStopsOperating(candidate.line, segmentStops)) {
    return undefined;
  }
  const originRoadAccessCandidates = getRouteEndpointRoadAccessCandidates(
    draft,
    'origin',
    markerRoadAccessIndex,
  );
  const destinationRoadAccessCandidates = getRouteEndpointRoadAccessCandidates(
    draft,
    'destination',
    markerRoadAccessIndex,
  );
  const accessRoute = buildWalkRouteToTransitStop({
    markerRoadAccessIndex,
    mode: candidate.mode.mode,
    origin: draft.origin,
    originRoadAccessCandidates,
    roadGraph,
    routeCache,
    secondaryPoiIndex,
    stop: originStop,
    t,
  });
  const egressRoute = buildWalkRouteFromTransitStop({
    destination: draft.destination,
    destinationRoadAccessCandidates,
    markerRoadAccessIndex,
    mode: candidate.mode.mode,
    roadGraph,
    routeCache,
    secondaryPoiIndex,
    stop: destinationStop,
    t,
  });
  if (accessRoute.blockedByTraversalBarrier || egressRoute.blockedByTraversalBarrier) {
    return undefined;
  }
  const accessDistance = accessRoute.distance;
  const egressDistance = egressRoute.distance;
  const endpointAccessDistance = getRouteEndpointAccessDistance(draft);
  const transitRoute = buildTransitSegmentRoute(
    segmentStops,
    candidate.mode.mode,
    candidate.line,
    candidate.direction,
    roadGraph,
    markerRoadAccessIndex,
    routeCache,
  );
  if (requiresTransitRoadRoute(candidate.mode.mode, candidate.line) && !transitRoute.resolved) {
    return undefined;
  }
  const transitDistance = transitRoute.distance;
  const chargeableTransitDistance = isContinuousRailRouteMode(candidate.mode.mode)
    ? (findRailFareDistance(
        railFareDistanceGraph,
        originStop.marker.id,
        destinationStop.marker.id,
      ) ?? transitDistance)
    : transitDistance;
  const fare = quoteTransitRouteFare(
    [
      {
        mode: candidate.mode.mode,
        lineId: candidate.line.id,
        lineName: candidate.line.name,
        distanceBlocks: chargeableTransitDistance,
        configuredFareText: candidate.line.fare,
      },
    ],
    transitFare,
  );
  const accessMinutes = estimateResolvedWalkRouteMinutes(accessRoute);
  const egressMinutes = estimateResolvedWalkRouteMinutes(egressRoute);
  const endpointAccessMinutes = estimateRouteMinutes(endpointAccessDistance, 72);
  const transitMinutes = estimateTransitSegmentMinutes(
    segmentStops,
    transitRoute,
    candidate.mode.mode,
    roadTiming,
  );
  const estimatedMinutes = endpointAccessMinutes + accessMinutes + egressMinutes + transitMinutes;
  const stationSpan = Math.max(1, destinationStop.index - originStop.index);
  const coordinates = buildRouteTraceCoordinates(draft, [
    ...accessRoute.coordinates,
    ...transitRoute.coordinates,
    ...egressRoute.coordinates,
  ]);
  const traceSegments = compactRouteTraceSegments([
    createRouteTraceSegment('walk', [
      ...(draft.originRaw ? [draft.originRaw] : []),
      ...accessRoute.coordinates,
    ]),
    createRouteTraceSegment('transit', transitRoute.coordinates, candidate.color),
    createRouteTraceSegment('walk', [
      ...egressRoute.coordinates,
      ...(draft.destinationRaw ? [draft.destinationRaw] : []),
    ]),
  ]);
  const labelMarkerIds = dedupeValues([originStop.marker.id, destinationStop.marker.id]);
  const transitStopAccessMarkerIds = dedupeValues([
    ...(accessRoute.markerIds ?? []),
    ...(egressRoute.markerIds ?? []),
  ]);
  const suppressLabelMarkerIds = [
    ...segmentStops.map((stop) => stop.marker.id),
    ...transitStopAccessMarkerIds,
  ].filter((id) => !labelMarkerIds.includes(id));
  const roadLabels = combineRouteRoadLabels(
    createRouteRoadLabelsFromSegments(accessRoute.roadSegments),
    createRouteRoadLabelsFromSegments(egressRoute.roadSegments),
  );

  return {
    id: `${candidate.mode.mode}-${candidate.line.id}-${candidate.direction}-${originStop.marker.id}-${destinationStop.marker.id}`,
    title: t
      ? t('map.route.directTitle', { mode: candidate.modeLabel })
      : `${candidate.modeLabel}直达`,
    summary: `${candidate.line.name} · ${
      t ? t('map.route.stationCount', { count: stationSpan }) : `${stationSpan}站`
    } · ${formatRoutePlanDistance(
      endpointAccessDistance + accessDistance + egressDistance,
      t,
    )}${t ? t('map.route.summary.walking') : '步行'}`,
    icon: candidate.icon,
    color: candidate.color,
    coordinates,
    traceSegments,
    roadLabels,
    markerIds: dedupeValues([
      ...getRouteEndpointMarkerIds(draft),
      ...(accessRoute.markerIds ?? []),
      ...segmentStops.map((stop) => stop.marker.id),
      ...(egressRoute.markerIds ?? []),
    ]),
    modes: [candidate.mode.mode],
    serviceLabels: [candidate.line.name],
    labelMarkerIds,
    suppressLabelMarkerIds,
    estimatedDistance: endpointAccessDistance + accessDistance + egressDistance + transitDistance,
    estimatedMinutes,
    fare,
    transferCount: 0,
    walkingDistance: endpointAccessDistance + accessDistance + egressDistance,
    steps: [
      createRoutePlaceStep(
        t ? t('map.route.depart', { name: draft.originLabel }) : `${draft.originLabel} 出发`,
        'origin',
      ),
      ...createRouteEndpointAccessSteps(draft, 'origin', t),
      createRouteWalkStep(
        formatRouteWalkStepLabel(accessRoute.usesRoadGraph, accessDistance, accessMinutes, t),
        accessRoute.details,
      ),
      createRoutePlaceStep(
        formatTransitBoardStepLabel(
          candidate.mode.mode,
          formatMarkerDisplayName(originStop.marker.label),
          t,
        ),
        'boarding',
        candidate.icon,
        candidate.color,
      ),
      createRouteTransitStep(
        t
          ? t('map.route.ride', {
              line: candidate.line.name,
              direction: candidate.terminalName,
              stops: stationSpan,
              duration: formatRouteStepMinutes(transitMinutes, t),
            })
          : `乘坐 ${candidate.line.name}（${candidate.terminalName}方向） ${stationSpan}站 ${formatRouteStepMinutes(
              transitMinutes,
            )}`,
        candidate.color,
        buildTransitStopStepDetails(segmentStops),
      ),
      createRoutePlaceStep(
        formatTransitAlightStepLabel(
          candidate.mode.mode,
          formatMarkerDisplayName(destinationStop.marker.label),
          t,
        ),
        'alighting',
        undefined,
        candidate.color,
      ),
      createRouteWalkStep(
        formatRouteWalkStepLabel(egressRoute.usesRoadGraph, egressDistance, egressMinutes, t),
        egressRoute.details,
      ),
      ...createRouteEndpointAccessSteps(draft, 'destination', t),
      createRoutePlaceStep(
        t
          ? t('map.route.arrive', { name: draft.destinationLabel })
          : `到达 ${draft.destinationLabel}`,
        'destination',
      ),
    ],
    note: getTransitRoutePlanNote(candidate.mode.mode, transitRoute.usesRoadGraph, t),
  };
}

function buildTransferTransitLineOptions(
  candidates: TransitLineDirectionCandidate[],
  draft: RoutePlanDraft,
  t: Translate,
  markerRoadAccessIndex: ReadonlyMap<string, RoadAccessCandidate[]>,
  secondaryPoiIndex: ReadonlyMap<string, SecondaryPoiLink[]>,
  roadGraph?: RoadRouteGraph,
  routeCache?: RoutePlanningCache,
  roadTiming?: MapSpatialProfile['roadTiming'],
  transitFare?: MapSpatialProfile['transitFare'],
  railFareDistanceGraph?: RailFareDistanceGraph,
): RoutePlanOption[] {
  const originCandidates = candidates
    .map((candidate) => ({
      candidate,
      originStop: findNearestRouteLineStop(draft.origin, candidate.stops),
    }))
    .filter(
      (
        item,
      ): item is {
        candidate: TransitLineDirectionCandidate;
        originStop: TransitRouteStop;
      } => Boolean(item.originStop && item.originStop.index < item.candidate.stops.length - 1),
    )
    .sort(
      (left, right) =>
        getCoordinateDistance(draft.origin, left.originStop.center) -
        getCoordinateDistance(draft.origin, right.originStop.center),
    )
    .slice(0, 12);
  const destinationCandidates = candidates
    .map((candidate) => ({
      candidate,
      destinationStop: findNearestRouteLineStop(draft.destination, candidate.stops),
    }))
    .filter(
      (
        item,
      ): item is {
        candidate: TransitLineDirectionCandidate;
        destinationStop: TransitRouteStop;
      } => Boolean(item.destinationStop && item.destinationStop.index > 0),
    )
    .sort(
      (left, right) =>
        getCoordinateDistance(draft.destination, left.destinationStop.center) -
        getCoordinateDistance(draft.destination, right.destinationStop.center),
    )
    .slice(0, 12);
  const options: RoutePlanOption[] = [];
  const originRoadAccessCandidates = getRouteEndpointRoadAccessCandidates(
    draft,
    'origin',
    markerRoadAccessIndex,
  );
  const destinationRoadAccessCandidates = getRouteEndpointRoadAccessCandidates(
    draft,
    'destination',
    markerRoadAccessIndex,
  );

  for (const originCandidate of originCandidates) {
    for (const destinationCandidate of destinationCandidates) {
      if (originCandidate.candidate.line.id === destinationCandidate.candidate.line.id) {
        continue;
      }

      const transfer = findTransferStopPair({
        fromCandidate: originCandidate.candidate,
        fromStartIndex: originCandidate.originStop.index + 1,
        toCandidate: destinationCandidate.candidate,
        toEndIndex: destinationCandidate.destinationStop.index - 1,
      });
      if (!transfer) {
        continue;
      }

      const firstSegment = originCandidate.candidate.stops.slice(
        originCandidate.originStop.index,
        transfer.fromStop.index + 1,
      );
      const secondSegment = destinationCandidate.candidate.stops.slice(
        transfer.toStop.index,
        destinationCandidate.destinationStop.index + 1,
      );
      if (firstSegment.length < 2 || secondSegment.length < 2) {
        continue;
      }
      if (
        !areTransitStopsOperating(originCandidate.candidate.line, firstSegment) ||
        !areTransitStopsOperating(destinationCandidate.candidate.line, secondSegment)
      ) {
        continue;
      }

      const accessRoute = buildWalkRouteToTransitStop({
        markerRoadAccessIndex,
        mode: originCandidate.candidate.mode.mode,
        origin: draft.origin,
        originRoadAccessCandidates,
        roadGraph,
        routeCache,
        secondaryPoiIndex,
        stop: originCandidate.originStop,
        t,
      });
      const egressRoute = buildWalkRouteFromTransitStop({
        destination: draft.destination,
        destinationRoadAccessCandidates,
        markerRoadAccessIndex,
        mode: destinationCandidate.candidate.mode.mode,
        roadGraph,
        routeCache,
        secondaryPoiIndex,
        stop: destinationCandidate.destinationStop,
        t,
      });
      const transferRoute = buildWalkRouteBetweenCoordinates(
        transfer.fromStop.center,
        transfer.toStop.center,
        roadGraph,
        routeCache,
        t,
        {
          destinationAccessCandidates: getIndexedMarkerRoadAccessCandidates(
            markerRoadAccessIndex,
            transfer.toStop.marker.id,
          ),
          originAccessCandidates: getIndexedMarkerRoadAccessCandidates(
            markerRoadAccessIndex,
            transfer.fromStop.marker.id,
          ),
        },
      );
      if (
        accessRoute.blockedByTraversalBarrier ||
        egressRoute.blockedByTraversalBarrier ||
        transferRoute.blockedByTraversalBarrier
      ) {
        continue;
      }
      const accessDistance = accessRoute.distance;
      const egressDistance = egressRoute.distance;
      const firstTransitRoute = buildTransitSegmentRoute(
        firstSegment,
        originCandidate.candidate.mode.mode,
        originCandidate.candidate.line,
        originCandidate.candidate.direction,
        roadGraph,
        markerRoadAccessIndex,
        routeCache,
      );
      const secondTransitRoute = buildTransitSegmentRoute(
        secondSegment,
        destinationCandidate.candidate.mode.mode,
        destinationCandidate.candidate.line,
        destinationCandidate.candidate.direction,
        roadGraph,
        markerRoadAccessIndex,
        routeCache,
      );
      if (
        (requiresTransitRoadRoute(
          originCandidate.candidate.mode.mode,
          originCandidate.candidate.line,
        ) &&
          !firstTransitRoute.resolved) ||
        (requiresTransitRoadRoute(
          destinationCandidate.candidate.mode.mode,
          destinationCandidate.candidate.line,
        ) &&
          !secondTransitRoute.resolved)
      ) {
        continue;
      }
      const firstTransitDistance = firstTransitRoute.distance;
      const secondTransitDistance = secondTransitRoute.distance;
      const usesContinuousRailFare =
        isContinuousRailRouteMode(originCandidate.candidate.mode.mode) &&
        isContinuousRailRouteMode(destinationCandidate.candidate.mode.mode);
      const continuousRailFareDistance = usesContinuousRailFare
        ? findRailFareDistance(
            railFareDistanceGraph,
            originCandidate.originStop.marker.id,
            destinationCandidate.destinationStop.marker.id,
          )
        : undefined;
      const fare = quoteTransitRouteFare(
        [
          {
            mode: originCandidate.candidate.mode.mode,
            lineId: originCandidate.candidate.line.id,
            lineName: originCandidate.candidate.line.name,
            distanceBlocks: continuousRailFareDistance ?? firstTransitDistance,
            configuredFareText: originCandidate.candidate.line.fare,
          },
          {
            mode: destinationCandidate.candidate.mode.mode,
            lineId: destinationCandidate.candidate.line.id,
            lineName: destinationCandidate.candidate.line.name,
            distanceBlocks: continuousRailFareDistance === undefined ? secondTransitDistance : 0,
            configuredFareText: destinationCandidate.candidate.line.fare,
          },
        ],
        transitFare,
      );
      const endpointAccessDistance = getRouteEndpointAccessDistance(draft);
      const transferDistance =
        transfer.fromStop.marker.id === transfer.toStop.marker.id ? 0 : transferRoute.distance;
      const accessMinutes = estimateResolvedWalkRouteMinutes(accessRoute);
      const egressMinutes = estimateResolvedWalkRouteMinutes(egressRoute);
      const endpointAccessMinutes = estimateRouteMinutes(endpointAccessDistance, 72);
      const transferWalkMinutes =
        transferDistance > 0 ? estimateResolvedWalkRouteMinutes(transferRoute) : 0;
      const firstTransitMinutes = estimateTransitSegmentMinutes(
        firstSegment,
        firstTransitRoute,
        originCandidate.candidate.mode.mode,
        roadTiming,
      );
      const secondTransitMinutes = estimateTransitSegmentMinutes(
        secondSegment,
        secondTransitRoute,
        destinationCandidate.candidate.mode.mode,
        roadTiming,
      );
      const firstStationSpan = Math.max(
        1,
        transfer.fromStop.index - originCandidate.originStop.index,
      );
      const secondStationSpan = Math.max(
        1,
        destinationCandidate.destinationStop.index - transfer.toStop.index,
      );
      const noteMode = shouldUseRoadGraphForTransitMode(originCandidate.candidate.mode.mode)
        ? originCandidate.candidate.mode.mode
        : destinationCandidate.candidate.mode.mode;
      const estimatedMinutes =
        endpointAccessMinutes +
        accessMinutes +
        egressMinutes +
        transferWalkMinutes +
        firstTransitMinutes +
        secondTransitMinutes +
        4;
      const coordinates = buildRouteTraceCoordinates(draft, [
        ...accessRoute.coordinates,
        ...firstTransitRoute.coordinates,
        ...transferRoute.coordinates,
        ...secondTransitRoute.coordinates,
        ...egressRoute.coordinates,
      ]);
      const traceSegments = compactRouteTraceSegments([
        createRouteTraceSegment('walk', [
          ...(draft.originRaw ? [draft.originRaw] : []),
          ...accessRoute.coordinates,
        ]),
        createRouteTraceSegment(
          'transit',
          firstTransitRoute.coordinates,
          originCandidate.candidate.color,
        ),
        createRouteTraceSegment('transfer', transferRoute.coordinates),
        createRouteTraceSegment(
          'transit',
          secondTransitRoute.coordinates,
          destinationCandidate.candidate.color,
        ),
        createRouteTraceSegment('walk', [
          ...egressRoute.coordinates,
          ...(draft.destinationRaw ? [draft.destinationRaw] : []),
        ]),
      ]);
      const labelMarkerIds = dedupeValues([
        originCandidate.originStop.marker.id,
        transfer.fromStop.marker.id,
        transfer.toStop.marker.id,
        destinationCandidate.destinationStop.marker.id,
      ]);
      const transitStopAccessMarkerIds = dedupeValues([
        ...(accessRoute.markerIds ?? []),
        ...(transferRoute.markerIds ?? []),
        ...(egressRoute.markerIds ?? []),
      ]);
      const suppressLabelMarkerIds = dedupeValues([
        ...firstSegment.map((stop) => stop.marker.id),
        ...secondSegment.map((stop) => stop.marker.id),
        ...transitStopAccessMarkerIds,
      ]).filter((id) => !labelMarkerIds.includes(id));
      const roadLabels = combineRouteRoadLabels(
        createRouteRoadLabelsFromSegments(accessRoute.roadSegments),
        createRouteRoadLabelsFromSegments(transferRoute.roadSegments),
        createRouteRoadLabelsFromSegments(egressRoute.roadSegments),
      );

      options.push({
        id: `transfer-${originCandidate.candidate.line.id}-${destinationCandidate.candidate.line.id}-${originCandidate.originStop.marker.id}-${transfer.fromStop.marker.id}-${destinationCandidate.destinationStop.marker.id}`,
        title: t('map.route.transferTitle', {
          firstMode: originCandidate.candidate.modeLabel,
          secondMode: destinationCandidate.candidate.modeLabel,
        }),
        summary: `${originCandidate.candidate.line.name} → ${destinationCandidate.candidate.line.name} · ${formatRoutePlanDistance(
          endpointAccessDistance + accessDistance + egressDistance + transferDistance,
          t,
        )}${t('map.route.summary.walking')}`,
        icon: 'transfer_within_a_station',
        color: originCandidate.candidate.color,
        coordinates,
        traceSegments,
        roadLabels,
        markerIds: dedupeValues([
          ...getRouteEndpointMarkerIds(draft),
          ...(accessRoute.markerIds ?? []),
          ...firstSegment.map((stop) => stop.marker.id),
          ...secondSegment.map((stop) => stop.marker.id),
          ...(egressRoute.markerIds ?? []),
        ]),
        modes: dedupeValues([
          originCandidate.candidate.mode.mode,
          destinationCandidate.candidate.mode.mode,
        ]),
        serviceLabels: [
          `${originCandidate.candidate.line.name} → ${destinationCandidate.candidate.line.name}`,
        ],
        labelMarkerIds,
        suppressLabelMarkerIds,
        estimatedDistance:
          endpointAccessDistance +
          accessDistance +
          egressDistance +
          transferDistance +
          firstTransitDistance +
          secondTransitDistance,
        estimatedMinutes,
        fare,
        transferCount: 1,
        walkingDistance:
          endpointAccessDistance + accessDistance + egressDistance + transferDistance,
        steps: [
          createRoutePlaceStep(t('map.route.depart', { name: draft.originLabel }), 'origin'),
          ...createRouteEndpointAccessSteps(draft, 'origin', t),
          createRouteWalkStep(
            formatRouteWalkStepLabel(accessRoute.usesRoadGraph, accessDistance, accessMinutes, t),
            accessRoute.details,
          ),
          createRoutePlaceStep(
            formatTransitBoardStepLabel(
              originCandidate.candidate.mode.mode,
              formatMarkerDisplayName(originCandidate.originStop.marker.label),
              t,
            ),
            'boarding',
            originCandidate.candidate.icon,
            originCandidate.candidate.color,
          ),
          createRouteTransitStep(
            t('map.route.ride', {
              line: originCandidate.candidate.line.name,
              direction: originCandidate.candidate.terminalName,
              stops: firstStationSpan,
              duration: formatRouteStepMinutes(firstTransitMinutes, t),
            }),
            originCandidate.candidate.color,
            buildTransitStopStepDetails(firstSegment),
          ),
          createRoutePlaceStep(
            t('map.route.transferAction', {
              name: formatMarkerDisplayName(transfer.fromStop.marker.label),
            }),
            'transfer',
            undefined,
            originCandidate.candidate.color,
          ),
          createRouteTransferStep(
            t('map.route.transferWalk', {
              distance: formatRoutePlanDistance(transferDistance, t),
              duration: formatRouteStepMinutes(transferWalkMinutes, t),
            }),
            transferRoute.details,
          ),
          createRoutePlaceStep(
            formatTransitBoardStepLabel(
              destinationCandidate.candidate.mode.mode,
              formatMarkerDisplayName(transfer.toStop.marker.label),
              t,
            ),
            'boarding',
            destinationCandidate.candidate.icon,
            destinationCandidate.candidate.color,
          ),
          createRouteTransitStep(
            t('map.route.ride', {
              line: destinationCandidate.candidate.line.name,
              direction: destinationCandidate.candidate.terminalName,
              stops: secondStationSpan,
              duration: formatRouteStepMinutes(secondTransitMinutes, t),
            }),
            destinationCandidate.candidate.color,
            buildTransitStopStepDetails(secondSegment),
          ),
          createRoutePlaceStep(
            formatTransitAlightStepLabel(
              destinationCandidate.candidate.mode.mode,
              formatMarkerDisplayName(destinationCandidate.destinationStop.marker.label),
              t,
            ),
            'alighting',
            undefined,
            destinationCandidate.candidate.color,
          ),
          createRouteWalkStep(
            formatRouteWalkStepLabel(egressRoute.usesRoadGraph, egressDistance, egressMinutes, t),
            egressRoute.details,
          ),
          ...createRouteEndpointAccessSteps(draft, 'destination', t),
          createRoutePlaceStep(
            t('map.route.arrive', { name: draft.destinationLabel }),
            'destination',
          ),
        ],
        note: getTransitRoutePlanNote(
          noteMode,
          firstTransitRoute.usesRoadGraph ||
            secondTransitRoute.usesRoadGraph ||
            accessRoute.usesRoadGraph ||
            transferRoute.usesRoadGraph ||
            egressRoute.usesRoadGraph,
          t,
          t('map.route.transitNote.transfer'),
        ),
      });
    }
  }

  return options;
}

export function buildTransitStationMarkerIndex(
  pointMarkers: PointMarker[],
): Map<string, PointMarker[]> {
  const index = new Map<string, PointMarker[]>();
  for (const marker of pointMarkers) {
    if (!isTransitStationPoi(marker)) {
      continue;
    }
    for (const key of getMarkerStationNameMatchKeys(marker)) {
      const current = index.get(key) ?? [];
      current.push(marker);
      index.set(key, current);
    }
  }
  return index;
}

export function findTransitStationMarker(
  stop: Pick<TransitLineStopForMap, 'stationName' | 'stationMarkerIds'>,
  stationMarkerIndex: Map<string, PointMarker[]>,
  pointMarkers: PointMarker[],
  mode: RouteTransportMode,
): PointMarker | undefined {
  const boundMarker = (stop.stationMarkerIds ?? [])
    .map((markerId) => pointMarkers.find((marker) => marker.id === markerId))
    .find((marker): marker is PointMarker =>
      Boolean(marker && matchesTransitMarkerMode(marker, mode)),
    );
  if (boundMarker) {
    return boundMarker;
  }

  for (const key of getTransitStationNameMatchKeys(stop.stationName)) {
    const marker = stationMarkerIndex
      .get(key)
      ?.find((item) => matchesTransitMarkerMode(item, mode));
    if (marker) {
      return marker;
    }
  }
  return undefined;
}

export function matchesTransitMarkerMode(marker: PointMarker, mode: RouteTransportMode): boolean {
  return (
    isTransitRouteTransportMode(mode) && isTransitPoiMarkerCompatibleWithStation(marker, [mode])
  );
}

function isTransitRouteTransportMode(mode: RouteTransportMode): mode is TransitRouteTransportMode {
  return mode !== 'walk' && mode !== 'taxi';
}

function createTaxiRoadAccessSteps(
  distance: number,
  endpoint: RouteEndpointKind,
  t: Translate,
): RoutePlanStep[] {
  if (distance <= 0.01) {
    return [];
  }
  const duration = formatRouteStepMinutes(estimateRouteMinutes(distance, 72), t);
  return [
    createRouteWalkStep(
      t(endpoint === 'origin' ? 'map.route.taxiWalkToPickup' : 'map.route.taxiWalkFromDropoff', {
        distance: formatRoutePlanDistance(distance, t),
        duration,
      }),
    ),
  ];
}

function findNearestRouteLineStop(
  point: [number, number],
  stops: TransitRouteStop[],
): TransitRouteStop | undefined {
  return stops
    .filter((stop) => (stop.stop.operationStatus ?? 'operating') === 'operating')
    .sort(
      (left, right) =>
        getCoordinateDistance(point, left.center) - getCoordinateDistance(point, right.center),
    )[0];
}

function findTransferStopPair(input: {
  fromCandidate: TransitLineDirectionCandidate;
  fromStartIndex: number;
  toCandidate: TransitLineDirectionCandidate;
  toEndIndex: number;
}): { fromStop: TransitRouteStop; toStop: TransitRouteStop } | undefined {
  const toStopsByStationKey = new Map<string, TransitRouteStop[]>();
  for (const stop of input.toCandidate.stops) {
    if (
      stop.index > input.toEndIndex ||
      (stop.stop.operationStatus ?? 'operating') !== 'operating'
    ) {
      continue;
    }
    for (const key of getTransferStopStationKeys(stop)) {
      const current = toStopsByStationKey.get(key) ?? [];
      current.push(stop);
      toStopsByStationKey.set(key, current);
    }
  }

  return input.fromCandidate.stops
    .filter(
      (stop) =>
        stop.index >= input.fromStartIndex &&
        (stop.stop.operationStatus ?? 'operating') === 'operating',
    )
    .map((fromStop) => {
      const candidates = new Map<string, TransitRouteStop>();
      for (const key of getTransferStopStationKeys(fromStop)) {
        for (const toStop of toStopsByStationKey.get(key) ?? []) {
          candidates.set(`${toStop.marker.id}\u0000${toStop.index}`, toStop);
        }
      }
      // 同一车站内优先选择同一点位，其次选择距离最近的点位，最后再比较站序。
      const toStop = Array.from(candidates.values()).sort(
        (left, right) =>
          Number(right.marker.id === fromStop.marker.id) -
            Number(left.marker.id === fromStop.marker.id) ||
          getCoordinateDistance(fromStop.center, left.center) -
            getCoordinateDistance(fromStop.center, right.center) ||
          left.index - right.index,
      )[0];
      return toStop ? { fromStop, toStop } : undefined;
    })
    .filter((pair): pair is { fromStop: TransitRouteStop; toStop: TransitRouteStop } =>
      Boolean(pair),
    )
    .sort(
      (left, right) =>
        Number(right.fromStop.marker.id === right.toStop.marker.id) -
          Number(left.fromStop.marker.id === left.toStop.marker.id) ||
        left.fromStop.index + left.toStop.index - (right.fromStop.index + right.toStop.index) ||
        getCoordinateDistance(left.fromStop.center, left.toStop.center) -
          getCoordinateDistance(right.fromStop.center, right.toStop.center),
    )[0];
}

/**
 * 换乘匹配同时接受同一点位和同一车站。
 * 同站不同 POI 可能分别停靠不同线路，站间步行连接由后续路线计算负责。
 */
function getTransferStopStationKeys(stop: TransitRouteStop): string[] {
  // 保留同一点位直接换乘的既有行为，同时允许同站不同 POI 通过步行连接换乘。
  const keys = [`marker:${stop.marker.id}`];
  const stationSourceId = stop.stop.stationSourceId?.trim();
  if (stationSourceId) {
    keys.push(`station:${stationSourceId}`);
    return keys;
  }

  keys.push(
    ...getTransitStationNameMatchKeys(stop.stop.stationName).map((key) => `station-name:${key}`),
  );
  return keys;
}

/** 途经站图标；字体子集扫描按变量名识别图标常量，名称需保留 icon 字样。 */
const transitStopStepIcon = 'radio_button_checked';

export function buildTransitStopStepDetails(stops: TransitRouteStop[]): RoutePlanStepDetail[] {
  return stops
    .slice(1, -1)
    .map((stop) =>
      createRouteStepDetail(
        transitStopStepIcon,
        formatMarkerDisplayName(stop.marker.label),
        undefined,
        'place_pass',
      ),
    );
}

export function buildTransitSegmentRoute(
  stops: TransitRouteStop[],
  mode: RouteTransportMode,
  line: TransitOverviewLine,
  direction: 'forward' | 'reverse',
  roadGraph?: RoadRouteGraph,
  markerRoadAccessIndex?: ReadonlyMap<string, RoadAccessCandidate[]>,
  routeCache?: RoutePlanningCache,
  options?: {
    /** 线路详情展示用：个别区间无法沿路解析时只退回该区间直线，不放弃整条线路的沿路走向。 */
    fallbackUnresolvedSegments?: boolean;
  },
): TransitSegmentRouteResolution {
  if (stops.length < 2) {
    return {
      coordinates: stops.map((stop) => stop.center),
      distance: 0,
      measurements: [],
      resolved: true,
      usesRoadGraph: false,
    };
  }

  const hasConfiguredLineGeometry = Boolean(line.segmentPaths?.length || line.routeNodes?.length);
  if (
    !hasConfiguredLineGeometry &&
    line.routeMode !== 'road' &&
    (!shouldUseRoadGraphForTransitMode(mode) || !roadGraph)
  ) {
    return {
      coordinates: stops.map((stop) => stop.center),
      distance: getTransitSegmentDistance(stops),
      measurements: buildStraightTransitSegmentMeasurements(stops),
      resolved: true,
      usesRoadGraph: false,
    };
  }

  const coordinates: Array<[number, number]> = [];
  let distance = 0;
  const measurements: TransitSegmentRouteMeasurement[] = [];
  let usesRoadGraph = false;
  let resolved = true;

  for (let index = 1; index < stops.length; index += 1) {
    const previous = stops[index - 1];
    const current = stops[index];
    if (!previous || !current) {
      continue;
    }

    const configuredSegment = getConfiguredTransitSegment(line, previous, current, direction);
    const controlCoordinates = [
      previous.center,
      ...(configuredSegment?.waypoints ?? []),
      current.center,
    ];
    const shouldFollowRoad =
      shouldUseRoadGraphForTransitMode(mode) ||
      configuredSegment?.mode === 'road' ||
      (!configuredSegment && line.routeMode === 'road');
    const roadResolution = shouldFollowRoad
      ? resolveTransitRoadControlPoints({
          controlCoordinates,
          current,
          markerRoadAccessIndex,
          previous,
          roadGraph,
          routeCache,
          travelMode: mode === 'coach' ? 'coach' : 'bus',
        })
      : undefined;
    if (shouldFollowRoad && !roadResolution?.resolved) {
      if (!options?.fallbackUnresolvedSegments) {
        resolved = false;
        return {
          coordinates: [],
          distance: 0,
          measurements,
          resolved: false,
          usesRoadGraph,
        };
      }
      // 该区间无法沿路解析：只让这一段回落为站间直线，其余区间继续沿路。
      appendRouteSegmentCoordinates(coordinates, controlCoordinates);
      const straightDistance = getCoordinateChainDistance(controlCoordinates);
      distance += straightDistance;
      measurements.push({
        distance: straightDistance,
        junctionCount: 0,
        travelMinutes: configuredSegment?.travelMinutes,
      });
      continue;
    }
    const segmentCoordinates = roadResolution?.coordinates ?? controlCoordinates;
    appendRouteSegmentCoordinates(coordinates, segmentCoordinates);
    distance += roadResolution?.distance ?? getCoordinateChainDistance(segmentCoordinates);
    measurements.push({
      distance: roadResolution?.distance ?? getCoordinateChainDistance(segmentCoordinates),
      junctionCount: roadResolution?.junctionCount ?? 0,
      travelMinutes: configuredSegment?.travelMinutes,
    });
    usesRoadGraph ||= Boolean(roadResolution?.resolved);
  }

  return {
    coordinates: dedupeConsecutiveCoordinates(coordinates),
    distance,
    measurements,
    resolved,
    usesRoadGraph,
  };
}

function resolveTransitRoadControlPoints(input: {
  controlCoordinates: Array<[number, number]>;
  current: TransitRouteStop;
  markerRoadAccessIndex?: ReadonlyMap<string, RoadAccessCandidate[]>;
  previous: TransitRouteStop;
  roadGraph?: RoadRouteGraph;
  routeCache?: RoutePlanningCache;
  travelMode: Extract<MapTravelMode, 'bus' | 'coach'>;
}): {
  coordinates: Array<[number, number]>;
  distance: number;
  junctionCount: number;
  resolved: boolean;
} {
  if (!input.roadGraph) {
    return { coordinates: [], distance: 0, junctionCount: 0, resolved: false };
  }

  const coordinates: Array<[number, number]> = [];
  let distance = 0;
  let junctionCount = 0;
  for (let index = 1; index < input.controlCoordinates.length; index += 1) {
    const origin = input.controlCoordinates[index - 1];
    const destination = input.controlCoordinates[index];
    if (!origin || !destination) {
      continue;
    }
    const accessOptions: RoadRouteAccessOptions = {};
    if (index === 1 && input.markerRoadAccessIndex) {
      accessOptions.originAccessCandidates = getIndexedMarkerRoadAccessCandidates(
        input.markerRoadAccessIndex,
        input.previous.marker.id,
      );
    }
    if (index === input.controlCoordinates.length - 1 && input.markerRoadAccessIndex) {
      accessOptions.destinationAccessCandidates = getIndexedMarkerRoadAccessCandidates(
        input.markerRoadAccessIndex,
        input.current.marker.id,
      );
    }
    const route = findRoadRouteBetweenCoordinates(
      origin,
      destination,
      input.roadGraph,
      input.routeCache,
      undefined,
      accessOptions,
      'shortest',
      input.travelMode,
    );
    if (!route) {
      return { coordinates: [], distance: 0, junctionCount: 0, resolved: false };
    }
    const roadSegments = route.roadSegments.filter(isTaxiRoadSegment);
    const roadCoordinates = flattenRouteSegmentCoordinates(roadSegments);
    const roadDistance = roadSegments.reduce(
      (total, segment) => total + getCoordinateChainDistance(segment.coordinates),
      0,
    );
    if (roadCoordinates.length < 2 || roadDistance <= 0.01) {
      return { coordinates: [], distance: 0, junctionCount: 0, resolved: false };
    }
    appendRouteSegmentCoordinates(coordinates, roadCoordinates);
    distance += roadDistance;
    junctionCount += route.junctionCount;
  }

  return {
    coordinates: dedupeConsecutiveCoordinates(coordinates),
    distance,
    junctionCount,
    resolved: true,
  };
}

function buildStraightTransitSegmentMeasurements(
  stops: TransitRouteStop[],
): TransitSegmentRouteMeasurement[] {
  return stops.slice(1).flatMap((current, index) => {
    const previous = stops[index];
    return previous
      ? [
          {
            distance: getCoordinateDistance(previous.center, current.center),
            junctionCount: 0,
          },
        ]
      : [];
  });
}

function requiresTransitRoadRoute(mode: RouteTransportMode, line: TransitOverviewLine): boolean {
  return shouldUseRoadGraphForTransitMode(mode) || line.routeMode === 'road';
}

export function getConfiguredTransitSegment(
  line: TransitOverviewLine,
  previous: TransitRouteStop,
  current: TransitRouteStop,
  direction: 'forward' | 'reverse',
):
  | {
      mode: TransitLineRouteMode;
      operationStatus: 'operating' | 'planned' | 'closed';
      travelMinutes?: number;
      waypoints: Array<[number, number]>;
    }
  | undefined {
  const fromStationSourceId = previous.stop.stationSourceId;
  const toStationSourceId = current.stop.stationSourceId;
  if (!fromStationSourceId || !toStationSourceId) {
    return undefined;
  }
  const operationStatus = getTransitSegmentOperationStatus(line, previous, current);
  const configuredPath = getTransitLineSegmentPath(line, previous, current);

  let segmentStartId: string | undefined;
  let pendingWaypoints: TransitLineRouteNodeSnapshot[] = [];
  for (const node of line.routeNodes ?? []) {
    if (node.kind === 'waypoint') {
      pendingWaypoints.push(node);
      continue;
    }
    if (segmentStartId === fromStationSourceId && node.stationSourceId === toStationSourceId) {
      return {
        mode: line.routeMode ?? 'straight',
        operationStatus,
        travelMinutes: configuredPath?.travelMinutes,
        waypoints: filterTransitRouteNodeWaypoints(pendingWaypoints, direction),
      };
    }
    if (segmentStartId === toStationSourceId && node.stationSourceId === fromStationSourceId) {
      return {
        mode: line.routeMode ?? 'straight',
        operationStatus,
        travelMinutes: configuredPath?.travelMinutes,
        waypoints: filterTransitRouteNodeWaypoints(pendingWaypoints, direction).reverse(),
      };
    }
    segmentStartId = node.stationSourceId;
    pendingWaypoints = [];
  }

  const reversePath =
    configuredPath?.fromStationSourceId === toStationSourceId &&
    configuredPath.toStationSourceId === fromStationSourceId;
  if (configuredPath) {
    const waypoints = filterTransitSegmentWaypoints(configuredPath.waypoints, direction).map(
      (waypoint) => [waypoint.x, waypoint.z] as [number, number],
    );
    return {
      mode: configuredPath.mode,
      operationStatus: configuredPath.operationStatus ?? 'operating',
      travelMinutes: configuredPath.travelMinutes,
      waypoints: reversePath ? waypoints.reverse() : waypoints,
    };
  }

  return undefined;
}

function areTransitStopsOperating(line: TransitOverviewLine, stops: TransitRouteStop[]): boolean {
  const originStop = stops[0];
  const destinationStop = stops.at(-1);
  if (
    (line.operationStatus ?? 'operating') !== 'operating' ||
    !originStop ||
    !destinationStop ||
    (originStop.stop.operationStatus ?? 'operating') !== 'operating' ||
    (destinationStop.stop.operationStatus ?? 'operating') !== 'operating'
  ) {
    return false;
  }
  for (let index = 1; index < stops.length; index += 1) {
    const previous = stops[index - 1];
    const current = stops[index];
    if (!previous || !current) {
      continue;
    }
    if (getTransitSegmentOperationStatus(line, previous, current) !== 'operating') {
      return false;
    }
  }
  return true;
}

function getTransitSegmentOperationStatus(
  line: TransitOverviewLine,
  previous: TransitRouteStop,
  current: TransitRouteStop,
): 'operating' | 'planned' | 'closed' {
  const fromStationSourceId = previous.stop.stationSourceId;
  const toStationSourceId = current.stop.stationSourceId;
  if (!fromStationSourceId || !toStationSourceId) {
    return 'operating';
  }
  const path = (line.segmentPaths ?? []).find(
    (candidate) =>
      (candidate.fromStationSourceId === fromStationSourceId &&
        candidate.toStationSourceId === toStationSourceId) ||
      (candidate.fromStationSourceId === toStationSourceId &&
        candidate.toStationSourceId === fromStationSourceId),
  );
  const statuses = [line.operationStatus ?? 'operating', path?.operationStatus ?? 'operating'];
  return statuses.includes('closed')
    ? 'closed'
    : statuses.includes('planned')
      ? 'planned'
      : 'operating';
}

function filterTransitSegmentWaypoints(
  waypoints: TransitLineSegmentPathSnapshot['waypoints'],
  direction: TransitLineTravelDirection,
): TransitLineSegmentPathSnapshot['waypoints'] {
  return waypoints.filter((waypoint) =>
    isTransitLineDirectionIncluded(waypoint.direction, direction),
  );
}

function filterTransitRouteNodeWaypoints(
  nodes: TransitLineRouteNodeSnapshot[],
  direction: TransitLineTravelDirection,
): Array<[number, number]> {
  return nodes.flatMap((node) =>
    node.kind === 'waypoint' && isTransitLineDirectionIncluded(node.direction, direction)
      ? ([[node.x, node.z]] as Array<[number, number]>)
      : [],
  );
}

export function shouldUseRoadGraphForTransitMode(mode: RouteTransportMode): boolean {
  return mode === 'bus' || mode === 'coach';
}

function findRoadRouteBetweenCoordinates(
  origin: [number, number],
  destination: [number, number],
  graph: RoadRouteGraph,
  routeCache?: RoutePlanningCache,
  t?: Translate,
  accessOptions?: RoadRouteAccessOptions,
  strategy: RoadRouteStrategy = 'shortest',
  travelMode: MapTravelMode = 'walk',
): ResolvedRoadRoute | undefined {
  const routeCacheKey = getRoadRouteCacheKey(
    origin,
    destination,
    accessOptions,
    strategy,
    travelMode,
  );
  const cachedRoute = routeCache?.roadRouteByPair.get(routeCacheKey);
  if (cachedRoute !== undefined) {
    return cachedRoute ?? undefined;
  }

  const originAccessCandidates =
    accessOptions?.originAccessCandidates !== undefined
      ? accessOptions.originAccessCandidates
      : findRoadAccessCandidates(origin, destination, graph, routeCache, 12, travelMode);
  const destinationAccessCandidates =
    accessOptions?.destinationAccessCandidates !== undefined
      ? accessOptions.destinationAccessCandidates
      : findRoadAccessCandidates(destination, origin, graph, routeCache, 12, travelMode);
  if (originAccessCandidates.length === 0 || destinationAccessCandidates.length === 0) {
    routeCache?.roadRouteByPair.set(routeCacheKey, null);
    return undefined;
  }

  const pathCache = routeCache?.pathByNodePair ?? new Map<string, RoadRoutePath | undefined>();
  let bestRoute: ResolvedRoadRoute | undefined;
  let bestRouteScore = Number.POSITIVE_INFINITY;

  for (const originAccess of originAccessCandidates) {
    for (const destinationAccess of destinationAccessCandidates) {
      const sameSegmentRoute = buildSameSegmentRoadRoute(
        origin,
        destination,
        originAccess,
        destinationAccess,
        t,
        travelMode,
      );
      const sameSegmentScore = sameSegmentRoute
        ? getRoadRouteStrategyScore(sameSegmentRoute, strategy)
        : Number.POSITIVE_INFINITY;
      if (sameSegmentRoute && sameSegmentScore < bestRouteScore) {
        bestRoute = sameSegmentRoute;
        bestRouteScore = sameSegmentScore;
      }

      for (const originNodeId of [originAccess.startNodeId, originAccess.endNodeId]) {
        for (const destinationNodeId of [
          destinationAccess.startNodeId,
          destinationAccess.endNodeId,
        ]) {
          const route = buildGraphRoadRouteCandidate({
            destination,
            destinationAccess,
            destinationNodeId,
            graph,
            origin,
            originAccess,
            originNodeId,
            pathCache,
            strategy,
            t,
            travelMode,
          });
          const routeScore = route
            ? getRoadRouteStrategyScore(route, strategy)
            : Number.POSITIVE_INFINITY;
          if (route && routeScore < bestRouteScore) {
            bestRoute = route;
            bestRouteScore = routeScore;
          }
        }
      }
    }
  }

  routeCache?.roadRouteByPair.set(routeCacheKey, bestRoute ?? null);
  return bestRoute;
}

function getRoadRouteStrategyScore(
  route: Pick<ResolvedRoadRoute, 'distance' | 'roadSegments'>,
  strategy: RoadRouteStrategy,
): number {
  if (strategy === 'shortest') {
    return route.distance;
  }

  if (strategy === 'fewest-segments') {
    return route.roadSegments.length * 100_000 + route.distance;
  }

  if (strategy === 'alternative-1' || strategy === 'alternative-2') {
    return route.distance;
  }

  return route.distance + countRoadRouteTurns(route.roadSegments) * 520;
}

function countRoadRouteTurns(segments: readonly RoadRouteInstructionSegment[]): number {
  let turns = 0;
  let previousVector: [number, number] | undefined;
  let previousLabel: string | undefined;

  for (const segment of segments) {
    if (segment.coordinates.length < 2) {
      continue;
    }

    const vector = getCoordinateChainVector(segment.coordinates);
    const vectorLength = Math.hypot(vector[0], vector[1]);
    if (vectorLength === 0) {
      continue;
    }

    if (previousVector) {
      const previousLength = Math.hypot(previousVector[0], previousVector[1]);
      const cosine = previousLength
        ? clampNumber(
            (previousVector[0] * vector[0] + previousVector[1] * vector[1]) /
              (previousLength * vectorLength),
            -1,
            1,
          )
        : 1;
      const angle = Math.acos(cosine);
      if (angle > Math.PI / 7 || (previousLabel && previousLabel !== segment.label)) {
        turns += 1;
      }
    }

    previousVector = vector;
    previousLabel = segment.label;
  }

  return turns;
}

export function findRoadAccessCandidates(
  point: [number, number],
  target: [number, number],
  graph: RoadRouteGraph,
  routeCache?: RoutePlanningCache,
  limit = 12,
  travelMode: MapTravelMode = 'walk',
): RoadAccessCandidate[] {
  const accessCacheKey = `${travelMode}:${formatCoordinateCacheKey(point)}->${formatCoordinateCacheKey(target)}:${limit}`;
  const cachedCandidates = routeCache?.accessCandidatesByPair.get(accessCacheKey);
  if (cachedCandidates) {
    return cachedCandidates;
  }

  const scoredCandidates = graph.roadSegments
    .filter((segment) => segment.allowedModes.includes(travelMode))
    .map((segment) => {
      const projection = projectPointToRoadSegment(point, segment);
      const directionPenalty = getRoadAccessDirectionPenalty(point, target, projection.coordinate);
      return {
        ...projection,
        score: projection.distanceToPoint + directionPenalty,
      };
    })
    .filter((candidate) => Math.abs(candidate.y - graph.defaultY) <= graph.verticalTolerance);
  const scoreCandidates = [...scoredCandidates]
    .sort((left, right) => left.score - right.score)
    .slice(0, limit);
  const distanceCandidates = [...scoredCandidates]
    .sort((left, right) => left.distanceToPoint - right.distanceToPoint)
    .slice(0, limit);
  const deduped = new Map<string, RoadAccessCandidate>();
  const addCandidate = (candidate: RoadAccessCandidate) => {
    const key = [
      candidate.startNodeId,
      candidate.endNodeId,
      candidate.coordinate[0].toFixed(2),
      candidate.coordinate[1].toFixed(2),
    ].join(':');
    if (!deduped.has(key)) {
      deduped.set(key, candidate);
    }
  };

  const scoreQuota = Math.ceil(limit * 0.6);
  for (const candidate of scoreCandidates) {
    addCandidate(candidate);
    if (deduped.size >= scoreQuota) {
      break;
    }
  }
  for (const candidate of distanceCandidates) {
    addCandidate(candidate);
    if (deduped.size >= limit) {
      break;
    }
  }
  for (const candidate of scoreCandidates) {
    addCandidate(candidate);
    if (deduped.size >= limit) {
      break;
    }
  }

  const result = Array.from(deduped.values());
  routeCache?.accessCandidatesByPair.set(accessCacheKey, result);
  return result;
}

export function getRoadRouteCacheKey(
  origin: [number, number],
  destination: [number, number],
  accessOptions?: RoadRouteAccessOptions,
  strategy: RoadRouteStrategy = 'shortest',
  travelMode: MapTravelMode = 'walk',
): string {
  return [
    strategy,
    travelMode,
    `${formatCoordinateCacheKey(origin)}->${formatCoordinateCacheKey(destination)}`,
    formatRoadAccessCandidatesCacheKey(accessOptions?.originAccessCandidates),
    formatRoadAccessCandidatesCacheKey(accessOptions?.destinationAccessCandidates),
  ].join('|');
}

function formatRoadAccessCandidatesCacheKey(candidates: RoadAccessCandidate[] | undefined): string {
  if (candidates === undefined) {
    return '*';
  }
  if (candidates.length === 0) {
    return 'none';
  }

  return candidates
    .map(
      (candidate) =>
        `${candidate.roadId}:${candidate.coordinate[0].toFixed(2)},${candidate.coordinate[1].toFixed(2)}`,
    )
    .join(';');
}

function formatCoordinateCacheKey(coordinate: [number, number]): string {
  return `${coordinate[0].toFixed(2)},${coordinate[1].toFixed(2)}`;
}

function projectPointToRoadSegment(
  point: [number, number],
  segment: RoadRouteSegment,
): RoadAccessCandidate {
  const deltaX = segment.end[0] - segment.start[0];
  const deltaZ = segment.end[1] - segment.start[1];
  const lengthSquared = deltaX * deltaX + deltaZ * deltaZ;
  const ratio = lengthSquared
    ? clampNumber(
        ((point[0] - segment.start[0]) * deltaX + (point[1] - segment.start[1]) * deltaZ) /
          lengthSquared,
        0,
        1,
      )
    : 0;
  const coordinate = interpolateCoordinate(segment.start, segment.end, ratio);
  const y = interpolateNumber(segment.startY, segment.endY, ratio);
  const totalDistance = getCoordinateDistance(segment.start, segment.end);
  const startDistance = totalDistance * ratio;
  return {
    allowedModes: segment.allowedModes,
    coordinate,
    direction: segment.direction,
    distanceToPoint: getCoordinateDistance(point, coordinate),
    endDistance: totalDistance - startDistance,
    endNodeId: segment.endNodeId,
    roadId: segment.roadId,
    roadLabel: segment.roadLabel,
    startDistance,
    startNodeId: segment.startNodeId,
    y,
  };
}

export function buildMarkerRoadAccessIndex(
  markers: PointMarker[],
  graph: RoadRouteGraph,
): Map<string, RoadAccessCandidate[]> {
  const index = new Map<string, RoadAccessCandidate[]>();
  for (const marker of markers) {
    if (marker.spatial?.worldId && marker.spatial.worldId !== graph.worldId) {
      continue;
    }
    const center = getMarkerCenter(marker);
    if (!center) {
      continue;
    }

    const candidates = buildMarkerRoadAccessCandidates(
      center,
      graph,
      marker.addressRoadMarkerId,
      marker.spatial?.coordinateY?.[0] ?? marker.spatial?.defaultY ?? graph.defaultY,
    );
    if (candidates.length > 0) {
      index.set(marker.id, candidates);
    }
  }
  return index;
}

export function getTransitLineSegmentPath(
  line: TransitOverviewLine,
  previous: TransitRouteStop,
  current: TransitRouteStop,
): TransitLineSegmentPathSnapshot | undefined {
  const fromStationSourceId = previous.stop.stationSourceId;
  const toStationSourceId = current.stop.stationSourceId;
  return (line.segmentPaths ?? []).find(
    (candidate) =>
      (candidate.fromStationSourceId === fromStationSourceId &&
        candidate.toStationSourceId === toStationSourceId) ||
      (candidate.fromStationSourceId === toStationSourceId &&
        candidate.toStationSourceId === fromStationSourceId),
  );
}

function buildMarkerRoadAccessCandidates(
  point: [number, number],
  graph: RoadRouteGraph,
  requiredRoadId?: string,
  pointY = graph.defaultY,
): RoadAccessCandidate[] {
  const nearestByRoad = new Map<string, RoadAccessCandidate>();
  for (const segment of graph.roadSegments) {
    if (requiredRoadId && segment.roadId !== requiredRoadId) {
      continue;
    }
    const projection = projectPointToRoadSegment(point, segment);
    if (Math.abs(projection.y - pointY) > graph.verticalTolerance) {
      continue;
    }
    const existing = nearestByRoad.get(segment.roadId);
    if (!existing || projection.distanceToPoint < existing.distanceToPoint) {
      nearestByRoad.set(segment.roadId, projection);
    }
  }

  const sorted = Array.from(nearestByRoad.values()).sort(
    (left, right) => left.distanceToPoint - right.distanceToPoint,
  );

  return sorted
    .filter(
      (candidate, index) =>
        index === 0 || candidate.distanceToPoint <= markerRoadAccessProjectionRange,
    )
    .slice(0, 8);
}

function getRoadAccessDirectionPenalty(
  point: [number, number],
  target: [number, number],
  accessPoint: [number, number],
): number {
  const accessVector: [number, number] = [accessPoint[0] - point[0], accessPoint[1] - point[1]];
  const targetVector: [number, number] = [target[0] - point[0], target[1] - point[1]];
  const accessLength = Math.hypot(accessVector[0], accessVector[1]);
  const targetLength = Math.hypot(targetVector[0], targetVector[1]);
  if (accessLength === 0 || targetLength === 0) {
    return 0;
  }

  const cosine =
    (accessVector[0] * targetVector[0] + accessVector[1] * targetVector[1]) /
    (accessLength * targetLength);
  return (1 - clampNumber(cosine, -1, 1)) * 18;
}

function buildSameSegmentRoadRoute(
  origin: [number, number],
  destination: [number, number],
  originAccess: RoadAccessCandidate,
  destinationAccess: RoadAccessCandidate,
  t?: Translate,
  travelMode: MapTravelMode = 'walk',
):
  | {
      coordinates: Array<[number, number]>;
      details: RoutePlanStepDetail[];
      distance: number;
      junctionCount: number;
      roadSegments: RoadRouteInstructionSegment[];
    }
  | undefined {
  const sameSegment =
    originAccess.roadId === destinationAccess.roadId &&
    originAccess.startNodeId === destinationAccess.startNodeId &&
    originAccess.endNodeId === destinationAccess.endNodeId;
  if (!sameSegment) {
    return undefined;
  }
  if (
    !originAccess.allowedModes.includes(travelMode) ||
    !isRoadAccessDirectionAllowed(originAccess, destinationAccess, travelMode)
  ) {
    return undefined;
  }

  const roadDistance = Math.abs(originAccess.startDistance - destinationAccess.startDistance);
  const instructionSegments: RoadRouteInstructionSegment[] = [];
  if (getCoordinateDistance(origin, originAccess.coordinate) > 0.01) {
    instructionSegments.push({
      coordinates: [origin, originAccess.coordinate],
      kind: 'approach',
      label: originAccess.roadLabel,
    });
  }
  if (roadDistance > 0.01) {
    instructionSegments.push({
      coordinates: [originAccess.coordinate, destinationAccess.coordinate],
      kind: 'road',
      label: originAccess.roadLabel,
      roadId: originAccess.roadId,
    });
  }
  if (getCoordinateDistance(destinationAccess.coordinate, destination) > 0.01) {
    instructionSegments.push({
      coordinates: [destinationAccess.coordinate, destination],
      kind: 'depart',
      label: destinationAccess.roadLabel,
    });
  }

  const coordinates = dedupeConsecutiveCoordinates([
    origin,
    originAccess.coordinate,
    destinationAccess.coordinate,
    destination,
  ]);
  const distance = originAccess.distanceToPoint + roadDistance + destinationAccess.distanceToPoint;

  return {
    coordinates,
    details: buildRoadRouteStepDetails(instructionSegments, t),
    distance,
    junctionCount: 0,
    roadSegments: instructionSegments,
  };
}

function isRoadAccessDirectionAllowed(
  origin: RoadAccessCandidate,
  destination: RoadAccessCandidate,
  travelMode: MapTravelMode,
): boolean {
  if (!origin.allowedModes.includes(travelMode) || !destination.allowedModes.includes(travelMode)) {
    return false;
  }
  const delta = destination.startDistance - origin.startDistance;
  return (
    Math.abs(delta) <= 0.01 ||
    origin.direction === 'both' ||
    (origin.direction === 'forward' && delta > 0) ||
    (origin.direction === 'reverse' && delta < 0)
  );
}

function canEnterRoadNodeFromAccess(
  access: RoadAccessCandidate,
  nodeId: string,
  travelMode: MapTravelMode,
): boolean {
  if (!access.allowedModes.includes(travelMode)) {
    return false;
  }
  return (
    access.direction === 'both' ||
    (access.direction === 'forward' && nodeId === access.endNodeId) ||
    (access.direction === 'reverse' && nodeId === access.startNodeId)
  );
}

function canLeaveRoadNodeToAccess(
  access: RoadAccessCandidate,
  nodeId: string,
  travelMode: MapTravelMode,
): boolean {
  if (!access.allowedModes.includes(travelMode)) {
    return false;
  }
  return (
    access.direction === 'both' ||
    (access.direction === 'forward' && nodeId === access.startNodeId) ||
    (access.direction === 'reverse' && nodeId === access.endNodeId)
  );
}

function buildGraphRoadRouteCandidate(input: {
  destination: [number, number];
  destinationAccess: RoadAccessCandidate;
  destinationNodeId: string;
  graph: RoadRouteGraph;
  origin: [number, number];
  originAccess: RoadAccessCandidate;
  originNodeId: string;
  pathCache: Map<string, RoadRoutePath | undefined>;
  strategy: RoadRouteStrategy;
  t?: Translate;
  travelMode: MapTravelMode;
}):
  | {
      coordinates: Array<[number, number]>;
      details: RoutePlanStepDetail[];
      distance: number;
      junctionCount: number;
      roadSegments: RoadRouteInstructionSegment[];
    }
  | undefined {
  const originNode = input.graph.nodesById.get(input.originNodeId);
  const destinationNode = input.graph.nodesById.get(input.destinationNodeId);
  if (!originNode || !destinationNode) {
    return undefined;
  }
  if (
    !canEnterRoadNodeFromAccess(input.originAccess, input.originNodeId, input.travelMode) ||
    !canLeaveRoadNodeToAccess(input.destinationAccess, input.destinationNodeId, input.travelMode)
  ) {
    return undefined;
  }

  const pathCacheKey = `${input.strategy}:${input.travelMode}:${input.originNodeId}->${input.destinationNodeId}`;
  if (!input.pathCache.has(pathCacheKey)) {
    input.pathCache.set(
      pathCacheKey,
      findRoadRoutePath(
        input.graph,
        input.originNodeId,
        input.destinationNodeId,
        input.strategy,
        input.travelMode,
      ),
    );
  }
  const roadPath = input.pathCache.get(pathCacheKey);
  if (!roadPath) {
    return undefined;
  }

  const instructionSegments: RoadRouteInstructionSegment[] = [];
  if (getCoordinateDistance(input.origin, input.originAccess.coordinate) > 0.01) {
    instructionSegments.push({
      coordinates: [input.origin, input.originAccess.coordinate],
      kind: 'approach',
      label: input.originAccess.roadLabel,
    });
  }
  if (
    input.originAccess.coordinate[0] !== originNode.coordinate[0] ||
    input.originAccess.coordinate[1] !== originNode.coordinate[1]
  ) {
    instructionSegments.push({
      coordinates: [input.originAccess.coordinate, originNode.coordinate],
      kind: 'road',
      label: input.originAccess.roadLabel,
      roadId: input.originAccess.roadId,
    });
  }
  instructionSegments.push(...roadPath.segments);
  if (
    destinationNode.coordinate[0] !== input.destinationAccess.coordinate[0] ||
    destinationNode.coordinate[1] !== input.destinationAccess.coordinate[1]
  ) {
    instructionSegments.push({
      coordinates: [destinationNode.coordinate, input.destinationAccess.coordinate],
      kind: 'road',
      label: input.destinationAccess.roadLabel,
      roadId: input.destinationAccess.roadId,
    });
  }
  if (getCoordinateDistance(input.destinationAccess.coordinate, input.destination) > 0.01) {
    instructionSegments.push({
      coordinates: [input.destinationAccess.coordinate, input.destination],
      kind: 'depart',
      label: input.destinationAccess.roadLabel,
    });
  }

  const accessDistance =
    input.originAccess.distanceToPoint +
    getCoordinateDistance(input.originAccess.coordinate, originNode.coordinate);
  const egressDistance =
    getCoordinateDistance(destinationNode.coordinate, input.destinationAccess.coordinate) +
    input.destinationAccess.distanceToPoint;
  const coordinates = dedupeConsecutiveCoordinates([
    input.origin,
    input.originAccess.coordinate,
    ...roadPath.coordinates,
    input.destinationAccess.coordinate,
    input.destination,
  ]);

  return {
    coordinates,
    details: buildRoadRouteStepDetails(instructionSegments, input.t),
    distance: accessDistance + roadPath.distance + egressDistance,
    junctionCount: countRoadPathJunctions(roadPath, input.graph),
    roadSegments: instructionSegments,
  };
}

export function countRoadPathJunctions(path: RoadRoutePath, graph: RoadRouteGraph): number {
  const junctionCoordinates = new Set<string>();
  for (const node of path.nodes) {
    if ((graph.adjacency.get(node.id)?.length ?? 0) < 3) {
      continue;
    }
    junctionCoordinates.add(formatCoordinateCacheKey(node.coordinate));
  }
  return junctionCoordinates.size;
}

export function appendRouteSegmentCoordinates(
  target: Array<[number, number]>,
  coordinates: Array<[number, number]>,
) {
  for (const coordinate of coordinates) {
    const previous = target.at(-1);
    if (previous && previous[0] === coordinate[0] && previous[1] === coordinate[1]) {
      continue;
    }
    target.push(coordinate);
  }
}

export function getTransitRoutePlanNote(
  mode: RouteTransportMode,
  usesRoadGraph: boolean,
  t?: Translate,
  fallbackNote?: string,
): string {
  const defaultFallbackNote =
    fallbackNote ??
    (t
      ? t('map.route.transitNote.default')
      : '已按真实线路站序生成候选；站间耗时优先使用旧数据 travelTime，缺失时仍按距离估算。');
  if (!shouldUseRoadGraphForTransitMode(mode)) {
    return defaultFallbackNote;
  }

  return usesRoadGraph
    ? t
      ? t('map.route.transitNote.road')
      : '公交/客运站间只沿旧地图道路中心线生成，并仅在中心线平面相交处推断路口；无法连通的候选已排除。站间耗时优先使用后台区间用时，其次使用旧数据 travelTime。'
    : t
      ? t('map.route.transitNote.fallbackRoad')
      : '公交/客运站间要求沿道路行驶；当前路网缺失或不连通时不会生成该候选。站间耗时优先使用后台区间用时，其次使用旧数据 travelTime。';
}

export function getTransitSegmentDistance(stops: TransitRouteStop[]): number {
  return stops.slice(1).reduce((total, stop, index) => {
    const previous = stops[index];
    return previous ? total + getCoordinateDistance(previous.center, stop.center) : total;
  }, 0);
}

export function estimateTransitSegmentMinutes(
  stops: TransitRouteStop[],
  route: TransitSegmentRouteResolution,
  mode: RouteTransportMode,
  roadTiming?: MapSpatialProfile['roadTiming'],
): number {
  const configuredMinutes = route.measurements.map((measurement) => measurement.travelMinutes);
  if (
    configuredMinutes.length === route.measurements.length &&
    configuredMinutes.every(
      (minutes): minutes is number =>
        typeof minutes === 'number' && Number.isFinite(minutes) && minutes > 0,
    )
  ) {
    return Math.max(1, Math.round(configuredMinutes.reduce((total, value) => total + value, 0)));
  }

  // 旧数据 travelTime 与工作台、班次标签共用同一套解析：值挂在出发站上，即区间用时。
  const legacyTravelTime = resolveLegacySegmentMinutes(
    stops.map((stop) => stop.stop.travelTime),
  ).totalMinutes;
  const segmentTravelTime = legacyTravelTime ?? 0;

  if (segmentTravelTime > 0 && configuredMinutes.every((minutes) => minutes === undefined)) {
    return Math.max(1, Math.round(segmentTravelTime));
  }

  const defaultBusSpeedKmh = roadTiming?.defaultBusSpeedKmh ?? 30;
  const busJunctionDelaySeconds = roadTiming?.busJunctionDelaySeconds ?? 12;
  const estimatedMinutes = route.measurements.reduce((total, measurement) => {
    if (measurement.travelMinutes !== undefined) {
      return total + measurement.travelMinutes;
    }
    if (shouldUseRoadGraphForTransitMode(mode)) {
      return (
        total +
        estimateVehicleRouteMinutes(
          measurement.distance,
          defaultBusSpeedKmh,
          measurement.junctionCount,
          busJunctionDelaySeconds,
        )
      );
    }
    return total + estimateRouteMinutes(measurement.distance, getTransitSpeedFactor(mode));
  }, 0);
  return Math.max(1, Math.round(estimatedMinutes));
}

export function getRouteEndpointMarkerIds(draft: RoutePlanDraft): string[] {
  return dedupeValues(
    [draft.originId, draft.originAccessId, draft.destinationId, draft.destinationAccessId].filter(
      (id): id is string => Boolean(id),
    ),
  );
}

function getRouteEndpointRoadAccessCandidates(
  draft: RoutePlanDraft,
  endpoint: RouteEndpointKind,
  markerRoadAccessIndex: ReadonlyMap<string, RoadAccessCandidate[]>,
): RoadAccessCandidate[] | undefined {
  const markerId =
    endpoint === 'origin'
      ? (draft.originAccessId ?? draft.originId)
      : (draft.destinationAccessId ?? draft.destinationId);
  return markerId
    ? getIndexedMarkerRoadAccessCandidates(markerRoadAccessIndex, markerId)
    : undefined;
}

function getIndexedMarkerRoadAccessCandidates(
  markerRoadAccessIndex: ReadonlyMap<string, RoadAccessCandidate[]>,
  markerId: string,
): RoadAccessCandidate[] {
  return markerRoadAccessIndex.get(markerId) ?? [];
}

function findNearestRouteStation<T extends { center: [number, number] }>(
  point: [number, number],
  candidates: T[],
): T | undefined {
  return [...candidates].sort(
    (left, right) =>
      getCoordinateDistance(point, left.center) - getCoordinateDistance(point, right.center),
  )[0];
}

export function estimateRouteMinutes(distance: number, blocksPerMinute: number): number {
  return Math.max(1, Math.round(distance / blocksPerMinute));
}

export function estimateVehicleRouteMinutes(
  distance: number,
  speedKmh: number,
  junctionCount: number,
  junctionDelaySeconds: number,
): number {
  const speedBlocksPerMinute = Math.max(1, (speedKmh * 1000) / 60);
  const movingMinutes = Math.max(0, distance) / speedBlocksPerMinute;
  const junctionMinutes = (Math.max(0, junctionCount) * Math.max(0, junctionDelaySeconds)) / 60;
  return Math.max(1, Math.round(movingMinutes + junctionMinutes));
}

function estimateResolvedWalkRouteMinutes(route: ResolvedWalkRoute): number {
  return route.distance <= 0
    ? 0
    : estimateRouteMinutes(route.distance, route.usesRoadGraph ? 64 : 72);
}

export function getTransitSpeedFactor(mode: RouteTransportMode): number {
  if (mode === 'metro' || mode === 'railway') {
    return 220;
  }

  if (mode === 'tram') {
    return 150;
  }

  if (mode === 'coach') {
    return 180;
  }

  if (mode === 'ferry') {
    return 130;
  }

  return 120;
}

export function formatRoutePlanDistance(distance: number, t?: Translate): string {
  const count = Math.max(0, Math.round(distance));
  return t ? t('map.route.distance.blocks', { count }) : `${count} 格`;
}

export function formatRoutePlanMinutes(minutes: number, t?: Translate): string {
  const count = Math.max(1, minutes);
  return t ? t('map.route.duration.short', { count }) : `约 ${count} 分`;
}

export function formatRoutePlanFare(fare: TransitFareQuote, t?: Translate): string {
  if (fare.status === 'unavailable') {
    return t ? t('map.route.fare.unavailable') : '票价待确认';
  }

  const amount = formatRouteFareAmount(fare.totalAmount ?? fare.knownSubtotal);
  if (fare.status === 'estimated') {
    return t ? t('map.route.fare.estimated', { amount }) : `预计 ${amount}`;
  }
  if (fare.status === 'partial') {
    return t ? t('map.route.fare.partial', { amount }) : `已知 ${amount} 起`;
  }
  return t ? t('map.route.fare.exact', { amount }) : amount;
}

function formatRouteFareAmount(amount: number): string {
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2).replace(/0+$/u, '');
}

export function formatRouteStepMinutes(minutes: number, t?: Translate): string {
  const count = Math.max(1, Math.round(minutes));
  return t ? t('map.route.duration.step', { count }) : `${count}分钟`;
}
