import type {
  ApiListResponse,
  OperationsContentDetail,
  OperationsStrongReminderItem,
  OperationsStrongReminderRule,
  OperationsStrongReminderTone,
  TransitServiceNotice,
} from '@yct/contracts';
import { createApiMeta } from './api-meta';
import { appPath } from './app-paths';
import { readOperationsDetails } from './operations-content';
import { readOperationsStrongReminderRules } from './operations-reminder-rule-store';
import { readTransitServiceNotices } from './transit-service-notices';

const toneByCategoryId: Record<string, OperationsStrongReminderTone> = {
  地铁运营: 'metro',
  公交运营: 'bus',
  有轨运营: 'tram',
};

export async function readOperationsStrongReminderItems(): Promise<
  ApiListResponse<OperationsStrongReminderItem>
> {
  const response = await listOperationsStrongReminderCandidates();
  return {
    meta: response.meta,
    items: response.items,
  };
}

export async function listOperationsStrongReminderCandidates(
  input: {
    includeFuture?: boolean;
    now?: number;
  } = {},
): Promise<ApiListResponse<OperationsStrongReminderItem>> {
  const [rules, details, serviceNotices] = await Promise.all([
    readOperationsStrongReminderRules(),
    readOperationsDetails(),
    readTransitServiceNotices(),
  ]);
  const now = input.now ?? Date.now();
  const detailById = new Map(details.items.map((item) => [item.id, item]));
  const ruleItems = [...rules]
    .sort(compareReminderRules)
    .flatMap((rule) => resolveReminderRule(rule, detailById, now, input.includeFuture === true));
  const serviceNoticeItems = serviceNotices.items
    .flatMap((notice) => resolveServiceNoticeReminder(notice, now, input.includeFuture === true))
    .sort(compareServiceNoticeReminders);
  const items = [...ruleItems, ...serviceNoticeItems];

  return {
    meta: resolveReminderMeta({
      itemCount: items.length,
      rulesCount: rules.length,
      details,
      serviceNotices,
    }),
    items,
  };
}

function resolveReminderRule(
  rule: OperationsStrongReminderRule,
  detailById: Map<string, OperationsContentDetail>,
  now: number,
  includeFuture: boolean,
): OperationsStrongReminderItem[] {
  if (!shouldIncludeRule(rule, now, includeFuture)) {
    return [];
  }

  if (rule.sourceKind === 'content') {
    const detail = rule.contentId ? detailById.get(rule.contentId) : undefined;
    if (!detail || isExpiredContent(detail, now)) {
      return [];
    }

    const title = rule.title ?? detail.title;
    if (!title) {
      return [];
    }

    return [
      {
        id: `operations_reminder_item_${rule.id}`,
        ruleId: rule.id,
        sourceKind: rule.sourceKind,
        tone: rule.tone ?? inferReminderTone(detail.categoryId),
        label: rule.label ?? detail.categoryId,
        title,
        summary: rule.summary ?? detail.excerpt,
        href: normalizeHref(rule.href) ?? appPath(`/operations/${encodeURIComponent(detail.id)}`),
        contentId: detail.id,
        startsAt: rule.startsAt,
        endsAt: rule.endsAt,
        displayStartDate: toDisplayDate(rule.startsAt),
        displayEndDate: toDisplayDate(rule.endsAt),
      },
    ];
  }

  if (!rule.title) {
    return [];
  }

  return [
    {
      id: `operations_reminder_item_${rule.id}`,
      ruleId: rule.id,
      sourceKind: rule.sourceKind,
      tone: rule.tone ?? 'primary',
      label: rule.label,
      title: rule.title,
      summary: rule.summary,
      href: normalizeHref(rule.href),
      contentId: rule.contentId,
      startsAt: rule.startsAt,
      endsAt: rule.endsAt,
      displayStartDate: toDisplayDate(rule.startsAt),
      displayEndDate: toDisplayDate(rule.endsAt),
    },
  ];
}

function resolveServiceNoticeReminder(
  notice: TransitServiceNotice,
  now: number,
  includeFuture: boolean,
): OperationsStrongReminderItem[] {
  if (isExpiredTimeRange(notice.startsAt, notice.endsAt, now, includeFuture)) {
    return [];
  }

  const label = inferServiceNoticeLabel(notice);
  const title = normalizeRequiredText(notice.title) ?? `${label}提醒`;
  const summary = buildServiceNoticeSummary(notice);
  const href = inferServiceNoticeHref(notice);

  return [
    {
      id: `operations_reminder_item_${notice.id}`,
      ruleId: notice.id,
      sourceKind: 'service_notice',
      tone: inferServiceNoticeTone(notice),
      label,
      title,
      summary,
      href,
      startsAt: notice.startsAt,
      endsAt: notice.endsAt,
      displayStartDate: toDisplayDate(notice.startsAt),
      displayEndDate: toDisplayDate(notice.endsAt),
    },
  ];
}

function shouldIncludeRule(
  rule: OperationsStrongReminderRule,
  now: number,
  includeFuture: boolean,
): boolean {
  if (!rule.enabled) {
    return false;
  }

  const startsAt = toTime(rule.startsAt);
  const endsAt = toTime(rule.endsAt);
  if (!includeFuture && startsAt > 0 && startsAt > now) {
    return false;
  }
  if (endsAt > 0 && endsAt < now) {
    return false;
  }
  return true;
}

function isExpiredTimeRange(
  startsAtValue: string | undefined,
  endsAtValue: string | undefined,
  now: number,
  includeFuture: boolean,
): boolean {
  const startsAt = toTime(startsAtValue);
  const endsAt = toTime(endsAtValue);
  if (!includeFuture && startsAt > 0 && startsAt > now) {
    return true;
  }
  if (endsAt > 0 && endsAt < now) {
    return true;
  }
  return false;
}

function isExpiredContent(detail: OperationsContentDetail, now: number): boolean {
  const expiresAt = toTime(detail.expiresAt);
  return expiresAt > 0 && expiresAt < now;
}

function inferReminderTone(categoryId: string): OperationsStrongReminderTone {
  return toneByCategoryId[categoryId] ?? 'primary';
}

function normalizeHref(href: string | undefined): string | undefined {
  if (!href) {
    return undefined;
  }

  if (/^https?:\/\//i.test(href)) {
    return href;
  }

  if (href.startsWith('/')) {
    return appPath(href);
  }

  return undefined;
}

function compareReminderRules(
  left: OperationsStrongReminderRule,
  right: OperationsStrongReminderRule,
): number {
  if (left.sortOrder !== right.sortOrder) {
    return left.sortOrder - right.sortOrder;
  }

  return (right.updatedAt ?? '').localeCompare(left.updatedAt ?? '');
}

function compareServiceNoticeReminders(
  left: OperationsStrongReminderItem,
  right: OperationsStrongReminderItem,
): number {
  const leftStartsAt = toTime(left.startsAt);
  const rightStartsAt = toTime(right.startsAt);
  if (leftStartsAt !== rightStartsAt) {
    return rightStartsAt - leftStartsAt;
  }

  const leftEndsAt = toTime(left.endsAt);
  const rightEndsAt = toTime(right.endsAt);
  if (leftEndsAt !== rightEndsAt) {
    return rightEndsAt - leftEndsAt;
  }

  return left.ruleId.localeCompare(right.ruleId);
}

function resolveReminderMeta(input: {
  itemCount: number;
  rulesCount: number;
  details: ApiListResponse<OperationsContentDetail>;
  serviceNotices: ApiListResponse<TransitServiceNotice>;
}) {
  if (
    input.itemCount > 0 ||
    input.rulesCount > 0 ||
    input.details.meta.sourceStatus === 'ready' ||
    input.serviceNotices.meta.sourceStatus === 'ready'
  ) {
    return createApiMeta('ready');
  }

  if (input.serviceNotices.meta.sourceStatus === 'unavailable') {
    return createApiMeta('unavailable', input.serviceNotices.meta.message);
  }

  if (input.details.meta.sourceStatus === 'unavailable') {
    return createApiMeta('unavailable', input.details.meta.message);
  }

  if (input.serviceNotices.meta.sourceStatus === 'not_configured') {
    return createApiMeta('not_configured', input.serviceNotices.meta.message);
  }

  return createApiMeta(input.details.meta.sourceStatus, input.details.meta.message);
}

function inferServiceNoticeTone(notice: TransitServiceNotice): OperationsStrongReminderTone {
  switch (notice.mode) {
    case 'metro':
      return 'metro';
    case 'bus':
      return 'bus';
    case 'tram':
      return 'tram';
    case 'ferry':
      return 'ferry';
    case 'coach':
      return 'coach';
    case 'railway':
      return 'railway';
    default:
      return 'warning';
  }
}

function inferServiceNoticeLabel(notice: TransitServiceNotice): string {
  switch (notice.mode) {
    case 'metro':
      return '地铁调整';
    case 'bus':
      return '公交调整';
    case 'tram':
      return '有轨调整';
    case 'ferry':
      return '轮渡调整';
    case 'coach':
      return '客运调整';
    case 'railway':
      return '地方铁路调整';
    default:
      return '运营调整';
  }
}

function buildServiceNoticeSummary(notice: TransitServiceNotice): string | undefined {
  const reason = normalizeOptionalText(notice.reason);
  const periodText = normalizeOptionalText(notice.periodText);
  if (reason && periodText) {
    return `${periodText} · ${reason}`;
  }

  return reason ?? periodText;
}

function inferServiceNoticeHref(notice: TransitServiceNotice): string | undefined {
  switch (notice.mode) {
    case 'coach':
      return appPath('/travel/schedules');
    default:
      return appPath('/travel');
  }
}

function normalizeRequiredText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeOptionalText(value: string | undefined): string | undefined {
  return normalizeRequiredText(value);
}

function toDisplayDate(value: string | undefined): string | undefined {
  return value?.slice(0, 10);
}

function toTime(value: string | undefined): number {
  if (!value) {
    return 0;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}
