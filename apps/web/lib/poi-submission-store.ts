import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  MapGeometry,
  PoiFacilitySnapshot,
  PoiSubmission,
  PoiSubmissionStatus,
  PoiVisibility,
} from '@yct/contracts';
import { readRuntimeConfig } from './runtime-config';

interface PoiSubmissionStoreSnapshot {
  version: 1;
  submissions: PoiSubmission[];
}

const emptySnapshot: PoiSubmissionStoreSnapshot = {
  version: 1,
  submissions: [],
};

export async function listPoiSubmissions(): Promise<PoiSubmission[]> {
  const snapshot = await readSnapshot();
  return [...snapshot.submissions].sort(comparePoiSubmissions);
}

export async function listPublishedPublicPoiSubmissions(): Promise<PoiSubmission[]> {
  const submissions = await listPoiSubmissions();
  return submissions.filter(
    (submission) => submission.status === 'published' && submission.visibility === 'public',
  );
}

export async function findLocalPoiSubmission(id: string): Promise<PoiSubmission | undefined> {
  const snapshot = await readSnapshot();
  return snapshot.submissions.find((submission) => submission.id === id);
}

export async function createLocalPoiSubmission(input: {
  title: string;
  categoryId: string;
  iconFileName?: string;
  description?: string;
  href?: string;
  imageUrl?: string;
  geometry: MapGeometry;
  parentMarkerId?: string;
  boundRegionMarkerIds?: string[];
  openingHours?: string;
  address?: string;
  addressRoadMarkerId?: string;
  facilities?: PoiFacilitySnapshot[];
  visibility: PoiVisibility;
  actorId: string;
}): Promise<PoiSubmission> {
  const snapshot = await readSnapshot();
  const submission: PoiSubmission = {
    id: `local_poi_${randomUUID()}`,
    profileId: 'default',
    title: input.title,
    categoryId: input.categoryId,
    iconFileName: input.iconFileName,
    description: input.description,
    href: input.href,
    imageUrl: input.imageUrl,
    geometry: input.geometry,
    parentMarkerId: input.parentMarkerId,
    boundRegionMarkerIds: input.boundRegionMarkerIds,
    openingHours: input.openingHours,
    address: input.address,
    addressRoadMarkerId: input.addressRoadMarkerId,
    facilities: input.facilities,
    visibility: input.visibility,
    status: 'draft',
    submittedBy: input.actorId,
  };

  await writeSnapshot({
    ...snapshot,
    submissions: [...snapshot.submissions, submission],
  });

  return submission;
}

export async function updateLocalPoiSubmission(
  id: string,
  updater: (submission: PoiSubmission) => PoiSubmission,
): Promise<PoiSubmission | undefined> {
  const snapshot = await readSnapshot();
  const existing = snapshot.submissions.find((submission) => submission.id === id);
  if (!existing) {
    return undefined;
  }

  const updated = updater(existing);
  await writeSnapshot({
    ...snapshot,
    submissions: snapshot.submissions.map((submission) =>
      submission.id === id ? updated : submission,
    ),
  });

  return updated;
}

export function withPoiSubmissionStatus(
  submission: PoiSubmission,
  status: PoiSubmissionStatus,
  patch: Partial<PoiSubmission> = {},
): PoiSubmission {
  return {
    ...submission,
    ...patch,
    status,
  };
}

function comparePoiSubmissions(left: PoiSubmission, right: PoiSubmission): number {
  const leftTime = left.submittedAt ?? left.reviewedAt ?? left.publishedAt ?? '';
  const rightTime = right.submittedAt ?? right.reviewedAt ?? right.publishedAt ?? '';
  return rightTime.localeCompare(leftTime) || left.title.localeCompare(right.title, 'zh-CN');
}

async function readSnapshot(): Promise<PoiSubmissionStoreSnapshot> {
  const storePath = resolveStorePath();

  try {
    const source = await readFile(storePath, 'utf8');
    const parsed = JSON.parse(source) as PoiSubmissionStoreSnapshot;
    return {
      version: 1,
      submissions: Array.isArray(parsed.submissions) ? parsed.submissions : [],
    };
  } catch {
    return emptySnapshot;
  }
}

async function writeSnapshot(snapshot: PoiSubmissionStoreSnapshot): Promise<void> {
  const storePath = resolveStorePath();
  await mkdir(path.dirname(storePath), { recursive: true });
  await writeFile(storePath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
}

function resolveStorePath(): string {
  const config = readRuntimeConfig();
  return path.isAbsolute(config.poiSubmissionStorePath)
    ? config.poiSubmissionStorePath
    : path.join(/*turbopackIgnore: true*/ process.cwd(), config.poiSubmissionStorePath);
}
