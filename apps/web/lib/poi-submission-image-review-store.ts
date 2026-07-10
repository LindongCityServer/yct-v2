import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { readRuntimeConfig } from './runtime-config';

export type PoiSubmissionImageReviewDecision = 'approved' | 'rejected';

export interface StoredPoiSubmissionImageReview {
  id: string;
  submissionId: string;
  imageUrl: string;
  decision: PoiSubmissionImageReviewDecision;
  reason?: string;
  reviewerId: string;
  reviewedAt: string;
}

interface PoiSubmissionImageReviewSnapshot {
  version: 1;
  reviews: StoredPoiSubmissionImageReview[];
}

const emptySnapshot: PoiSubmissionImageReviewSnapshot = {
  version: 1,
  reviews: [],
};

export async function listPoiSubmissionImageReviews(): Promise<StoredPoiSubmissionImageReview[]> {
  const snapshot = await readSnapshot();
  return [...snapshot.reviews].sort(compareImageReviews);
}

export async function upsertPoiSubmissionImageReview(
  review: StoredPoiSubmissionImageReview,
): Promise<StoredPoiSubmissionImageReview[]> {
  const snapshot = await readSnapshot();
  const next = [
    ...snapshot.reviews.filter((item) => !isSameImageReviewTarget(item, review)),
    review,
  ].sort(compareImageReviews);
  await writeSnapshot({ version: 1, reviews: next });
  return next;
}

export async function deletePoiSubmissionImageReview(input: {
  submissionId: string;
  imageUrl: string;
}): Promise<StoredPoiSubmissionImageReview[]> {
  const snapshot = await readSnapshot();
  const next = snapshot.reviews
    .filter((item) => item.submissionId !== input.submissionId || item.imageUrl !== input.imageUrl)
    .sort(compareImageReviews);
  await writeSnapshot({ version: 1, reviews: next });
  return next;
}

function isSameImageReviewTarget(
  left: Pick<StoredPoiSubmissionImageReview, 'submissionId' | 'imageUrl'>,
  right: Pick<StoredPoiSubmissionImageReview, 'submissionId' | 'imageUrl'>,
): boolean {
  return left.submissionId === right.submissionId && left.imageUrl === right.imageUrl;
}

function compareImageReviews(
  left: StoredPoiSubmissionImageReview,
  right: StoredPoiSubmissionImageReview,
): number {
  return right.reviewedAt.localeCompare(left.reviewedAt)
    || left.submissionId.localeCompare(right.submissionId)
    || left.imageUrl.localeCompare(right.imageUrl);
}

async function readSnapshot(): Promise<PoiSubmissionImageReviewSnapshot> {
  const storePath = resolveStorePath();

  try {
    const source = await readFile(storePath, 'utf8');
    const parsed = JSON.parse(source) as PoiSubmissionImageReviewSnapshot;
    return {
      version: 1,
      reviews: Array.isArray(parsed.reviews) ? parsed.reviews : [],
    };
  } catch {
    return emptySnapshot;
  }
}

async function writeSnapshot(snapshot: PoiSubmissionImageReviewSnapshot): Promise<void> {
  const storePath = resolveStorePath();
  await mkdir(path.dirname(storePath), { recursive: true });
  await writeFile(storePath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
}

function resolveStorePath(): string {
  const config = readRuntimeConfig();
  return path.isAbsolute(config.poiSubmissionImageReviewStorePath)
    ? config.poiSubmissionImageReviewStorePath
    : path.join(/*turbopackIgnore: true*/ process.cwd(), config.poiSubmissionImageReviewStorePath);
}
