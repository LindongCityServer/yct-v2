import { randomUUID } from 'node:crypto';
import type { YctEvent, YctEventPayloadMap, YctEventType } from '@yct/contracts';
import { publishDomainEvent } from './app-event-bus';
import {
  deletePoiConflictDecision,
  listPoiConflictDecisions,
  upsertPoiConflictDecision,
  type StoredPoiConflictDecision,
} from './poi-conflict-decision-store';

export type PoiConflictDecisionInput = 'ignored' | 'duplicate' | 'unresolved';

export interface PoiConflictDecisionUpdateResult {
  ok: boolean;
  decisions?: StoredPoiConflictDecision[];
  status?: number;
  error?: string;
  message?: string;
}

export async function listAdminPoiConflictDecisions(): Promise<StoredPoiConflictDecision[]> {
  return listPoiConflictDecisions();
}

export async function updatePoiConflictDecision(input: {
  submissionId: string;
  markerId: string;
  markerLabel?: string;
  submissionTitle?: string;
  decision: PoiConflictDecisionInput;
  actorId: string;
}): Promise<PoiConflictDecisionUpdateResult> {
  const decidedAt = new Date().toISOString();
  const decisions =
    input.decision === 'unresolved'
      ? await deletePoiConflictDecision({
          submissionId: input.submissionId,
          markerId: input.markerId,
        })
      : await upsertPoiConflictDecision({
          id: `poi_conflict_${input.submissionId}_${input.markerId}`,
          submissionId: input.submissionId,
          markerId: input.markerId,
          markerLabel: input.markerLabel,
          submissionTitle: input.submissionTitle,
          decision: input.decision,
          decidedBy: input.actorId,
          decidedAt,
        });

  await emitEvent(
    'PoiConflictDecisionUpdated',
    {
      type: 'admin',
      id: input.actorId,
    },
    {
      submissionId: input.submissionId,
      markerId: input.markerId,
      markerLabel: input.markerLabel,
      submissionTitle: input.submissionTitle,
      decision: input.decision,
      decidedBy: input.actorId,
      decidedAt,
    },
  );

  return {
    ok: true,
    decisions,
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
