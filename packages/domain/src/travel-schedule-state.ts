import type { TravelScheduleRevisionStatus } from '@yct/contracts';

const travelScheduleRevisionTransitions: Record<
  TravelScheduleRevisionStatus,
  TravelScheduleRevisionStatus[]
> = {
  imported: ['pending_review', 'archived'],
  validation_failed: ['archived'],
  pending_review: ['approved', 'rejected', 'archived'],
  approved: ['published', 'archived'],
  rejected: ['pending_review', 'archived'],
  published: ['superseded', 'archived'],
  superseded: ['archived'],
  archived: [],
};

export function transitionTravelScheduleRevisionStatus(
  current: TravelScheduleRevisionStatus,
  next: TravelScheduleRevisionStatus,
): { ok: true } | { ok: false; reason: string } {
  if (current === next) {
    return { ok: true };
  }

  if (!travelScheduleRevisionTransitions[current].includes(next)) {
    return {
      ok: false,
      reason: `班次数据版本不能从 ${current} 转换到 ${next}`,
    };
  }

  return { ok: true };
}

export function canPublishTravelScheduleRevision(input: {
  revisionStatus: TravelScheduleRevisionStatus;
  validationErrorCount: number;
}): { ok: true } | { ok: false; reason: string } {
  if (input.revisionStatus !== 'approved') {
    return {
      ok: false,
      reason: '只有审核通过的班次数据版本可以发布。',
    };
  }

  if (input.validationErrorCount > 0) {
    return {
      ok: false,
      reason: '班次数据仍存在校验错误，不能发布。',
    };
  }

  return { ok: true };
}

export function canRestoreTravelScheduleRevision(input: {
  revisionStatus: TravelScheduleRevisionStatus;
  validationErrorCount: number;
}): { ok: true } | { ok: false; reason: string } {
  if (input.revisionStatus !== 'superseded') {
    return {
      ok: false,
      reason: '只有已被替换的班次数据版本可以恢复为当前发布版本。',
    };
  }

  if (input.validationErrorCount > 0) {
    return {
      ok: false,
      reason: '班次数据仍存在校验错误，不能恢复发布。',
    };
  }

  return { ok: true };
}
