import { randomUUID } from 'node:crypto';
import type { YctEvent, YctEventPayloadMap, YctEventType } from '@yct/contracts';
import { publishDomainEvent } from './app-event-bus';
import {
  deletePoiSubmissionImageReview,
  listPoiSubmissionImageReviews,
  upsertPoiSubmissionImageReview,
  type StoredPoiSubmissionImageReview,
} from './poi-submission-image-review-store';

export type PoiSubmissionImageReviewInput = 'approved' | 'rejected' | 'unreviewed';

export interface PoiSubmissionImageReviewUpdateResult {
  ok: boolean;
  reviews?: StoredPoiSubmissionImageReview[];
  status?: number;
  error?: string;
  message?: string;
}

export async function listAdminPoiSubmissionImageReviews(): Promise<StoredPoiSubmissionImageReview[]> {
  return listPoiSubmissionImageReviews();
}

export async function updatePoiSubmissionImageReview(input: {
  submissionId: string;
  imageUrl: string;
  decision: PoiSubmissionImageReviewInput;
  reason?: string;
  actorId: string;
}): Promise<PoiSubmissionImageReviewUpdateResult> {
  const reviewedAt = new Date().toISOString();
  const reviews =
    input.decision === 'unreviewed'
      ? await deletePoiSubmissionImageReview({
          submissionId: input.submissionId,
          imageUrl: input.imageUrl,
        })
      : await upsertPoiSubmissionImageReview({
          id: `poi_image_review_${input.submissionId}_${encodeURIComponent(input.imageUrl)}`,
          submissionId: input.submissionId,
          imageUrl: input.imageUrl,
          decision: input.decision,
          reason: input.reason?.trim() || undefined,
          reviewerId: input.actorId,
          reviewedAt,
        });

  await emitEvent(
    'PoiSubmissionImageReviewed',
    {
      type: 'admin',
      id: input.actorId,
    },
    {
      submissionId: input.submissionId,
      imageUrl: input.imageUrl,
      decision: input.decision,
      reason: input.reason?.trim() || undefined,
      reviewerId: input.actorId,
      reviewedAt,
    },
  );

  return {
    ok: true,
    reviews,
  };
}

async function emitEvent<TType extends YctEventType>(
  type: TType,
  actor: YctEvent<TType>['actor'],
  payload: YctEventPayloadMap[TType],
): Promise<void> {
  await publishDomainEvent({
    eventId: `event_${randomUUID()}`,
    type,
    occurredAt: new Date().toISOString(),
    actor,
    payload,
  });
}
