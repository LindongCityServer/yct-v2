import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { readRuntimeConfig } from './runtime-config';

export type PoiConflictDecisionKind = 'ignored' | 'duplicate';

export interface StoredPoiConflictDecision {
  id: string;
  submissionId: string;
  markerId: string;
  markerLabel?: string;
  submissionTitle?: string;
  decision: PoiConflictDecisionKind;
  decidedBy: string;
  decidedAt: string;
}

interface PoiConflictDecisionSnapshot {
  version: 1;
  decisions: StoredPoiConflictDecision[];
}

const emptySnapshot: PoiConflictDecisionSnapshot = {
  version: 1,
  decisions: [],
};

export async function listPoiConflictDecisions(): Promise<StoredPoiConflictDecision[]> {
  const snapshot = await readSnapshot();
  return [...snapshot.decisions].sort(comparePoiConflictDecisions);
}

export async function upsertPoiConflictDecision(
  decision: StoredPoiConflictDecision,
): Promise<StoredPoiConflictDecision[]> {
  const snapshot = await readSnapshot();
  const next = [
    ...snapshot.decisions.filter((item) => !isSameDecisionTarget(item, decision)),
    decision,
  ].sort(comparePoiConflictDecisions);
  await writeSnapshot({ version: 1, decisions: next });
  return next;
}

export async function deletePoiConflictDecision(input: {
  submissionId: string;
  markerId: string;
}): Promise<StoredPoiConflictDecision[]> {
  const snapshot = await readSnapshot();
  const next = snapshot.decisions
    .filter((item) => item.submissionId !== input.submissionId || item.markerId !== input.markerId)
    .sort(comparePoiConflictDecisions);
  await writeSnapshot({ version: 1, decisions: next });
  return next;
}

function isSameDecisionTarget(
  left: Pick<StoredPoiConflictDecision, 'submissionId' | 'markerId'>,
  right: Pick<StoredPoiConflictDecision, 'submissionId' | 'markerId'>,
): boolean {
  return left.submissionId === right.submissionId && left.markerId === right.markerId;
}

function comparePoiConflictDecisions(
  left: StoredPoiConflictDecision,
  right: StoredPoiConflictDecision,
): number {
  return right.decidedAt.localeCompare(left.decidedAt)
    || left.submissionId.localeCompare(right.submissionId)
    || left.markerId.localeCompare(right.markerId);
}

async function readSnapshot(): Promise<PoiConflictDecisionSnapshot> {
  const storePath = resolveStorePath();

  try {
    const source = await readFile(storePath, 'utf8');
    const parsed = JSON.parse(source) as PoiConflictDecisionSnapshot;
    return {
      version: 1,
      decisions: Array.isArray(parsed.decisions) ? parsed.decisions : [],
    };
  } catch {
    return emptySnapshot;
  }
}

async function writeSnapshot(snapshot: PoiConflictDecisionSnapshot): Promise<void> {
  const storePath = resolveStorePath();
  await mkdir(path.dirname(storePath), { recursive: true });
  await writeFile(storePath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
}

function resolveStorePath(): string {
  const config = readRuntimeConfig();
  return path.isAbsolute(config.poiConflictDecisionStorePath)
    ? config.poiConflictDecisionStorePath
    : path.join(/*turbopackIgnore: true*/ process.cwd(), config.poiConflictDecisionStorePath);
}
