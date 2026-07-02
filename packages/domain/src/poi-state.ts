import type { PoiSubmissionStatus } from '@yct/contracts';
import type { StateTransitionResult } from './content-state';

const poiSubmissionTransitions: Record<PoiSubmissionStatus, PoiSubmissionStatus[]> = {
  draft: ['pending_review', 'archived'],
  pending_review: ['approved', 'rejected', 'archived'],
  approved: ['published', 'archived'],
  rejected: ['draft', 'archived'],
  published: ['archived'],
  archived: [],
};

export function transitionPoiSubmissionStatus(
  current: PoiSubmissionStatus,
  next: PoiSubmissionStatus,
): StateTransitionResult<PoiSubmissionStatus> {
  if (current === next) {
    return { ok: true, status: next };
  }

  if (!poiSubmissionTransitions[current].includes(next)) {
    return {
      ok: false,
      status: current,
      reason: `POI 投稿不能从 ${current} 转换到 ${next}`,
    };
  }

  return { ok: true, status: next };
}
