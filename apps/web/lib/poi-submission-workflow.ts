import { randomUUID } from 'node:crypto';
import type {
  MapGeometry,
  PoiSubmission,
  YctEvent,
  YctEventPayloadMap,
  YctEventType,
} from '@yct/contracts';
import { transitionPoiSubmissionStatus } from '@yct/domain';
import { publishDomainEvent } from './app-event-bus';
import {
  createLocalPoiSubmission,
  findLocalPoiSubmission,
  listPoiSubmissions,
  updateLocalPoiSubmission,
  withPoiSubmissionStatus,
} from './poi-submission-store';

export interface PoiSubmissionActionResult {
  ok: boolean;
  submission?: PoiSubmission;
  status?: number;
  error?: string;
  message?: string;
}

export async function listAdminPoiSubmissions(): Promise<PoiSubmission[]> {
  return listPoiSubmissions();
}

export async function submitPublicPoi(input: {
  title: string;
  categoryId: string;
  geometry: MapGeometry;
  actorId: string;
}): Promise<PoiSubmissionActionResult> {
  const draft = await createLocalPoiSubmission({
    title: input.title,
    categoryId: input.categoryId,
    geometry: input.geometry,
    visibility: 'public_pending_review',
    actorId: input.actorId,
  });

  const transition = transitionPoiSubmissionStatus(draft.status, 'pending_review');
  if (!transition.ok) {
    return invalidTransition(transition.reason);
  }

  const submittedAt = new Date().toISOString();
  const submitted = await updateLocalPoiSubmission(draft.id, (current) =>
    withPoiSubmissionStatus(current, 'pending_review', {
      submittedBy: input.actorId,
      submittedAt,
    }),
  );

  if (submitted) {
    await emitEvent(
      'PoiSubmitted',
      {
        type: 'user',
        id: input.actorId,
      },
      {
        poiId: submitted.id,
        title: submitted.title,
        categoryId: submitted.categoryId,
        geometry: submitted.geometry,
      },
    );
  }

  return { ok: true, submission: submitted };
}

export async function reviewPoiSubmission(input: {
  poiId: string;
  actorId: string;
  decision: 'approved' | 'rejected';
  reason?: string;
}): Promise<PoiSubmissionActionResult> {
  const submission = await findLocalPoiSubmission(input.poiId);
  if (!submission) {
    return notFound();
  }

  const nextStatus = input.decision === 'approved' ? 'approved' : 'rejected';
  const transition = transitionPoiSubmissionStatus(submission.status, nextStatus);
  if (!transition.ok) {
    return invalidTransition(transition.reason);
  }

  const reviewedAt = new Date().toISOString();
  const updated = await updateLocalPoiSubmission(input.poiId, (current) =>
    withPoiSubmissionStatus(current, nextStatus, {
      reviewedBy: input.actorId,
      reviewedAt,
      reviewReason: input.reason,
    }),
  );

  if (updated) {
    await emitEvent(
      'PoiReviewed',
      {
        type: 'admin',
        id: input.actorId,
      },
      {
        poiId: updated.id,
        decision: input.decision,
        reviewerId: input.actorId,
        reason: input.reason,
      },
    );
  }

  return { ok: true, submission: updated };
}

export async function publishPoiSubmission(input: {
  poiId: string;
  actorId: string;
}): Promise<PoiSubmissionActionResult> {
  const submission = await findLocalPoiSubmission(input.poiId);
  if (!submission) {
    return notFound();
  }

  const transition = transitionPoiSubmissionStatus(submission.status, 'published');
  if (!transition.ok) {
    return invalidTransition(transition.reason);
  }

  const publishedAt = new Date().toISOString();
  const updated = await updateLocalPoiSubmission(input.poiId, (current) =>
    withPoiSubmissionStatus(current, 'published', {
      visibility: 'public',
      publishedAt,
    }),
  );

  if (updated) {
    await emitEvent(
      'PoiPublished',
      {
        type: 'admin',
        id: input.actorId,
      },
      {
        poiId: updated.id,
        categoryId: updated.categoryId,
        geometry: updated.geometry,
        publishedAt,
      },
    );
  }

  return { ok: true, submission: updated };
}

function notFound(): PoiSubmissionActionResult {
  return {
    ok: false,
    status: 404,
    error: 'poi_submission_not_found',
    message: 'POI 投稿不存在。',
  };
}

function invalidTransition(reason?: string): PoiSubmissionActionResult {
  return {
    ok: false,
    status: 409,
    error: 'invalid_poi_submission_state',
    message: reason ?? '当前 POI 投稿状态不允许执行该操作。',
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
