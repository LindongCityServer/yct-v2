import type { YctEventType } from '@yct/contracts';
import { getAppEventBus } from './app-event-bus';
import { listContentAssetRecords } from './content-asset-store';
import { listContentRecords } from './content-store';
import { listPoiSubmissions } from './poi-submission-store';
import { createTimedCache } from './server-cache';
import { listServiceEntries } from './service-entry-store';
import { listTransitDataRevisions } from './transit-data-store';
import { listTravelScheduleRevisions } from './travel-schedule-revision-store';

export interface AdminPendingReviewSummary {
  contents: number;
  contentAssets: number;
  services: number;
  transit: number;
  poi: number;
}

const summaryCache = createTimedCache<AdminPendingReviewSummary>(15_000);
const invalidationEventTypes = [
  'ContentSubmitted',
  'ContentReviewed',
  'ContentPublished',
  'ContentArchived',
  'ContentAssetImported',
  'ContentAssetUploaded',
  'ContentAssetReviewed',
  'ServiceEntrySubmitted',
  'ServiceEntryReviewed',
  'ServiceEntryPublished',
  'ServiceEntryArchived',
  'ServiceEntryDeleted',
  'TransitDataRevisionSubmitted',
  'TransitDataRevisionReviewed',
  'TransitDataRevisionPublished',
  'TransitDataRevisionArchived',
  'TransitLineApprovalChanged',
  'TravelScheduleRevisionSubmitted',
  'TravelScheduleRevisionReviewed',
  'TravelScheduleRevisionArchived',
  'TravelScheduleTripApprovalChanged',
  'TravelSchedulePublished',
  'PoiSubmitted',
  'PoiReviewed',
  'PoiPublished',
  'PoiArchived',
] as const satisfies readonly YctEventType[];

let listenersRegistered = false;

export function readAdminPendingReviewSummary(): Promise<AdminPendingReviewSummary> {
  ensureInvalidationListenersRegistered();
  return summaryCache.read('admin-pending-review', readSummaryUncached);
}

function ensureInvalidationListenersRegistered(): void {
  if (listenersRegistered) {
    return;
  }
  listenersRegistered = true;
  const eventBus = getAppEventBus();
  for (const eventType of invalidationEventTypes) {
    eventBus.subscribe(eventType, async () => summaryCache.clear());
  }
}

async function readSummaryUncached(): Promise<AdminPendingReviewSummary> {
  const [contents, contentAssets, services, transit, schedules, poi] = await Promise.all([
    listContentRecords(),
    listContentAssetRecords(),
    listServiceEntries(),
    listTransitDataRevisions(),
    listTravelScheduleRevisions(),
    listPoiSubmissions(),
  ]);

  return {
    contents: contents.filter((record) => record.revision.status === 'pending_review').length,
    contentAssets: contentAssets.filter((record) => record.asset.status === 'pending_review')
      .length,
    services: services.filter((entry) => entry.status === 'pending_review').length,
    transit:
      transit.reduce(
        (count, revision) =>
          count +
          revision.lines.filter(
            (line) =>
              (line.approvalStatus ?? normalizeRevisionItemStatus(revision.status)) ===
              'pending_review',
          ).length,
        0,
      ) +
      schedules.reduce(
        (count, revision) =>
          count +
          revision.trips.filter(
            (trip) =>
              (trip.approvalStatus ?? normalizeRevisionItemStatus(revision.status)) ===
              'pending_review',
          ).length,
        0,
      ),
    poi: poi.filter((submission) => submission.status === 'pending_review').length,
  };
}

function normalizeRevisionItemStatus(
  status:
    | 'imported'
    | 'validation_failed'
    | 'pending_review'
    | 'approved'
    | 'rejected'
    | 'published'
    | 'superseded'
    | 'archived',
): 'imported' | 'pending_review' | 'approved' | 'rejected' | 'published' | 'archived' {
  if (status === 'validation_failed') {
    return 'imported';
  }
  if (status === 'superseded') {
    return 'published';
  }
  return status;
}
