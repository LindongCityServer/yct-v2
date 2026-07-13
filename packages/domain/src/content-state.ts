import type {
  ContentAssetStatus,
  ContentPublishMode,
  ContentRevisionStatus,
  ISODateTimeString,
} from '@yct/contracts';

export interface StateTransitionResult<TStatus extends string> {
  ok: boolean;
  status: TStatus;
  reason?: string;
}

const contentRevisionTransitions: Record<ContentRevisionStatus, ContentRevisionStatus[]> = {
  draft: ['pending_review', 'archived'],
  pending_review: ['approved', 'rejected', 'archived'],
  approved: ['published', 'archived'],
  rejected: ['draft', 'archived'],
  published: ['archived'],
  archived: [],
};

const contentAssetTransitions: Record<ContentAssetStatus, ContentAssetStatus[]> = {
  pending_review: ['approved', 'rejected', 'archived'],
  approved: ['archived'],
  rejected: ['pending_review', 'archived'],
  archived: [],
};

export function transitionContentRevisionStatus(
  current: ContentRevisionStatus,
  next: ContentRevisionStatus,
): StateTransitionResult<ContentRevisionStatus> {
  if (current === next) {
    return { ok: true, status: next };
  }

  if (!contentRevisionTransitions[current].includes(next)) {
    return {
      ok: false,
      status: current,
      reason: `内容修订不能从 ${current} 转换到 ${next}`,
    };
  }

  return { ok: true, status: next };
}

export function transitionContentAssetStatus(
  current: ContentAssetStatus,
  next: ContentAssetStatus,
): StateTransitionResult<ContentAssetStatus> {
  if (current === next) {
    return { ok: true, status: next };
  }

  if (!contentAssetTransitions[current].includes(next)) {
    return {
      ok: false,
      status: current,
      reason: `内容素材不能从 ${current} 转换到 ${next}`,
    };
  }

  return { ok: true, status: next };
}

export function canPublishContentRevision(input: {
  revisionStatus: ContentRevisionStatus;
  assetStatuses: ContentAssetStatus[];
  publishMode: ContentPublishMode;
  scheduledAt?: ISODateTimeString;
  hasMeaningfulMarkdown?: boolean;
}): StateTransitionResult<ContentRevisionStatus> {
  if (input.revisionStatus !== 'approved') {
    return {
      ok: false,
      status: input.revisionStatus,
      reason: '只有审核通过的内容修订可以发布',
    };
  }

  const hasUnapprovedAsset = input.assetStatuses.some((status) => status !== 'approved');
  if (hasUnapprovedAsset) {
    return {
      ok: false,
      status: input.revisionStatus,
      reason: '内容包含未审核通过的图片或附件',
    };
  }

  if (input.hasMeaningfulMarkdown === false) {
    return {
      ok: false,
      status: input.revisionStatus,
      reason: '内容正文不能为空白',
    };
  }

  if (input.publishMode === 'scheduled' && !input.scheduledAt) {
    return {
      ok: false,
      status: input.revisionStatus,
      reason: '定时发布必须提供 scheduledAt',
    };
  }

  return { ok: true, status: 'published' };
}
