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
import { listPoiSubmissionImageReviews } from './poi-submission-image-review-store';

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
  description?: string;
  href?: string;
  imageUrl?: string;
  geometry: MapGeometry;
  actorId: string;
}): Promise<PoiSubmissionActionResult> {
  const draft = await createLocalPoiSubmission({
    title: input.title,
    categoryId: input.categoryId,
    description: input.description,
    href: input.href,
    imageUrl: input.imageUrl,
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
        description: submitted.description,
        href: submitted.href,
        imageUrl: submitted.imageUrl,
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

export async function updatePoiSubmissionByAdmin(input: {
  poiId: string;
  actorId: string;
  title: string;
  categoryId: string;
  description?: string;
  href?: string;
  geometry?: Extract<MapGeometry, { type: 'Point' }>;
}): Promise<PoiSubmissionActionResult> {
  const submission = await findLocalPoiSubmission(input.poiId);
  if (!submission) {
    return notFound();
  }

  if (submission.status !== 'pending_review') {
    return {
      ok: false,
      status: 409,
      error: 'invalid_poi_submission_state',
      message: '当前仅允许修正待审核的 POI 投稿。',
    };
  }

  const patch = {
    title: input.title.trim(),
    categoryId: input.categoryId.trim(),
    description: normalizeOptionalText(input.description),
    href: normalizeOptionalText(input.href),
    geometry: input.geometry ?? submission.geometry,
  };
  if (input.geometry && submission.geometry.type !== 'Point') {
    return {
      ok: false,
      status: 409,
      error: 'poi_submission_geometry_edit_unsupported',
      message: '当前简化修正入口只允许调整点状 POI 坐标。',
    };
  }

  const changedFields = getChangedPoiSubmissionFields(submission, patch);
  if (changedFields.length === 0) {
    return { ok: true, submission };
  }

  const updated = await updateLocalPoiSubmission(input.poiId, (current) => ({
    ...current,
    ...patch,
  }));

  if (updated) {
    await emitEvent(
      'PoiSubmissionUpdated',
      {
        type: 'admin',
        id: input.actorId,
      },
      {
        poiId: updated.id,
        updatedBy: input.actorId,
        updatedAt: new Date().toISOString(),
        changedFields,
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

  if (submission.imageUrl) {
    const imageReview = (await listPoiSubmissionImageReviews()).find(
      (review) => review.submissionId === submission.id && review.imageUrl === submission.imageUrl,
    );
    if (imageReview?.decision === 'rejected') {
      return invalidImageReview();
    }
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
        description: updated.description,
        href: updated.href,
        imageUrl: updated.imageUrl,
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

function invalidImageReview(): PoiSubmissionActionResult {
  return {
    ok: false,
    status: 409,
    error: 'poi_submission_image_rejected',
    message: '投稿图片已被标记为不合格，请先更换图片或重置图片审核状态后再发布。',
  };
}

function normalizeOptionalText(value: string | undefined): string | undefined {
  const normalized = value?.trim() ?? '';
  return normalized || undefined;
}

function getChangedPoiSubmissionFields(
  submission: PoiSubmission,
  patch: Pick<PoiSubmission, 'title' | 'categoryId' | 'description' | 'href'> & {
    geometry: MapGeometry;
  },
): Array<'title' | 'categoryId' | 'description' | 'href' | 'geometry'> {
  const textFields = (['title', 'categoryId', 'description', 'href'] as const).filter(
    (field) => (submission[field] ?? '') !== (patch[field] ?? ''),
  );
  const geometryChanged =
    submission.geometry.type === 'Point' &&
    patch.geometry.type === 'Point' &&
    (submission.geometry.coordinates[0] !== patch.geometry.coordinates[0] ||
      submission.geometry.coordinates[1] !== patch.geometry.coordinates[1]);

  return geometryChanged ? [...textFields, 'geometry'] : textFields;
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
