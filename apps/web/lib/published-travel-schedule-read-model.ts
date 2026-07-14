import type {
  TravelScheduleRevision,
  TravelScheduleServiceSummary,
  TravelTripInstance,
} from '@yct/contracts';
import { listTravelScheduleRevisions } from './travel-schedule-revision-store';

export async function readPublishedTravelScheduleEntitySnapshot(): Promise<
  TravelScheduleRevision | undefined
> {
  const revisions = await listTravelScheduleRevisions();
  const decidedTripIds = new Set<string>();
  const selectedTrips: Array<{ revision: TravelScheduleRevision; trip: TravelTripInstance }> = [];

  for (const revision of revisions) {
    for (const trip of revision.trips) {
      if (decidedTripIds.has(trip.tripInstanceId)) {
        continue;
      }
      if (trip.approvalStatus === 'archived') {
        decidedTripIds.add(trip.tripInstanceId);
        continue;
      }
      if (trip.approvalStatus === 'published') {
        decidedTripIds.add(trip.tripInstanceId);
        selectedTrips.push({ revision, trip });
        continue;
      }
      if (!trip.approvalStatus && revision.status === 'published') {
        decidedTripIds.add(trip.tripInstanceId);
        selectedTrips.push({ revision, trip });
      }
    }
  }

  if (selectedTrips.length === 0) {
    return undefined;
  }

  const latestRevision = selectedTrips[0]?.revision;
  if (!latestRevision) {
    return undefined;
  }
  const trips = selectedTrips.map(({ trip }) => trip);
  const sourceRevisionIds = Array.from(
    new Set(selectedTrips.map(({ revision }) => revision.revisionId)),
  );
  const sourceFiles = Array.from(
    new Set(selectedTrips.flatMap(({ revision }) => revision.sourceFiles)),
  );
  const publishedAt = selectedTrips
    .map(({ revision, trip }) => trip.publishedAt ?? revision.publishedAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);

  return {
    ...latestRevision,
    revisionId: `published-items:${sourceRevisionIds.join(',')}`,
    status: 'published',
    trips,
    services: rebuildPublishedServiceSummaries(revisions, trips),
    stationOptions: Array.from(new Set(trips.flatMap((trip) => trip.stationNames))).sort(),
    sourceFiles,
    publishedAt,
  };
}

function rebuildPublishedServiceSummaries(
  revisions: TravelScheduleRevision[],
  trips: TravelTripInstance[],
): TravelScheduleServiceSummary[] {
  const templateByKind = new Map<
    TravelScheduleServiceSummary['kind'],
    TravelScheduleServiceSummary
  >();
  for (const revision of revisions) {
    for (const service of revision.services) {
      if (!templateByKind.has(service.kind)) {
        templateByKind.set(service.kind, service);
      }
    }
  }
  const kinds = Array.from(new Set(trips.map((trip) => trip.serviceKind)));
  return kinds
    .map((kind) => {
      const template = templateByKind.get(kind);
      const serviceTrips = trips.filter((trip) => trip.serviceKind === kind);
      return {
        serviceId: template?.serviceId ?? `published-${kind}`,
        kind,
        label: template?.label ?? serviceTrips[0]?.serviceLabel ?? kind,
        color: template?.color ?? '#168F78',
        icon: template?.icon ?? 'route',
        sortOrder: template?.sortOrder ?? 999,
        status: 'active' as const,
        tripCount: serviceTrips.length,
        stationCount: new Set(serviceTrips.flatMap((trip) => trip.stationNames)).size,
      };
    })
    .sort((left, right) => left.sortOrder - right.sortOrder);
}
