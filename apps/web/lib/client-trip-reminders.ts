import type {
  TripReminder,
  TripReminderRouteSnapshot,
  TripReminderSource,
  TripReminderStatus,
} from '@yct/contracts';

export const tripReminderStorageKey = 'yct.tripReminders.v1';
export const tripReminderLegacyImportedAtKey = 'yct.tripReminders.legacyImportedAt';

export interface TripReminderState {
  reminders: TripReminder[];
  legacyImportedCount: number;
  summary: {
    total: number;
    scheduled: number;
    history: number;
    localOnly: number;
  };
}

export interface TripReminderDraft {
  title: string;
  remindAt: string;
  departure?: string;
  arrival?: string;
  lineName?: string;
  transportMode?: TripReminderRouteSnapshot['transportMode'];
  detail?: string;
  source?: TripReminderSource;
}

interface LegacyOrder {
  id?: unknown;
  type?: unknown;
  status?: unknown;
  date?: unknown;
  route?: {
    departure?: unknown;
    arrival?: unknown;
    time?: unknown;
    line?: unknown;
    id?: unknown;
    company?: unknown;
    price?: unknown;
    lines?: unknown;
  };
}

export function readTripReminderState(now = new Date()): TripReminderState {
  const storedReminders = readStoredReminders(now);
  const legacyImported = window.localStorage.getItem(tripReminderLegacyImportedAtKey);
  const legacyReminders = legacyImported ? [] : readLegacyOrderReminders(now);
  const reminders = sortReminders(mergeReminders(storedReminders, legacyReminders));

  if (legacyReminders.length > 0) {
    writeStoredReminders(reminders);
    window.localStorage.setItem(tripReminderLegacyImportedAtKey, new Date().toISOString());
  }

  return {
    reminders,
    legacyImportedCount: legacyReminders.length,
    summary: summarizeReminders(reminders, now),
  };
}

export function createTripReminder(draft: TripReminderDraft): TripReminder {
  const now = new Date().toISOString();
  const route = normalizeDraftRoute(draft);
  const reminder: TripReminder = {
    id: createLocalId(),
    title: normalizeTitle(draft.title, route),
    source: draft.source ?? 'manual',
    remindAt: new Date(draft.remindAt).toISOString(),
    status: 'scheduled',
    route,
    createdAt: now,
    updatedAt: now,
  };
  const state = readTripReminderState();
  writeStoredReminders(sortReminders([...state.reminders, reminder]));
  return reminder;
}

export function updateTripReminderStatus(id: string, status: TripReminderStatus): TripReminder[] {
  const now = new Date().toISOString();
  const reminders = readTripReminderState().reminders.map((reminder) =>
    reminder.id === id
      ? {
          ...reminder,
          status,
          updatedAt: now,
          completedAt: status === 'completed' ? now : reminder.completedAt,
        }
      : reminder,
  );
  writeStoredReminders(reminders);
  return sortReminders(reminders);
}

export function deleteTripReminder(id: string): TripReminder[] {
  const reminders = readTripReminderState().reminders.filter((reminder) => reminder.id !== id);
  writeStoredReminders(reminders);
  return sortReminders(reminders);
}

export function clearLocalTripReminders(): void {
  writeStoredReminders([]);
}

export function summarizeReminders(reminders: TripReminder[], now = new Date()) {
  const normalized = reminders.map((reminder) => withComputedStatus(reminder, now));
  return {
    total: normalized.length,
    scheduled: normalized.filter((reminder) => isActiveReminderStatus(reminder.status)).length,
    history: normalized.filter((reminder) => !isActiveReminderStatus(reminder.status)).length,
    localOnly: normalized.filter((reminder) => !reminder.syncedAt).length,
  };
}

export function splitTripReminders(reminders: TripReminder[], now = new Date()) {
  const normalized = reminders.map((reminder) => withComputedStatus(reminder, now));
  return {
    active: normalized.filter((reminder) => isActiveReminderStatus(reminder.status)),
    history: normalized.filter((reminder) => !isActiveReminderStatus(reminder.status)),
  };
}

export function formatTripReminderTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '时间未知';
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function toDatetimeLocalValue(date = new Date(Date.now() + 30 * 60 * 1000)): string {
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000);
  return offsetDate.toISOString().slice(0, 16);
}

export function statusLabel(status: TripReminderStatus): string {
  const labels: Record<TripReminderStatus, string> = {
    scheduled: '待提醒',
    notification_queued: '待推送',
    notified: '已提醒',
    sent: '已发送',
    ongoing: '进行中',
    completed: '已完成',
    cancelled: '已取消',
    expired: '已过期',
  };

  return labels[status];
}

function readStoredReminders(now: Date): TripReminder[] {
  const parsed = readJsonArray(window.localStorage.getItem(tripReminderStorageKey));
  return parsed.flatMap((item) => {
    const reminder = normalizeTripReminder(item);
    return reminder ? [withComputedStatus(reminder, now)] : [];
  });
}

function readLegacyOrderReminders(now: Date): TripReminder[] {
  const parsed = readJsonArray(window.localStorage.getItem('orders'));
  return parsed.flatMap((item, index) => {
    const reminder = normalizeLegacyOrderReminder(item, index, now);
    return reminder ? [reminder] : [];
  });
}

function writeStoredReminders(reminders: TripReminder[]): void {
  window.localStorage.setItem(tripReminderStorageKey, JSON.stringify(sortReminders(reminders)));
}

function readJsonArray(value: string | null): unknown[] {
  if (!value) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeTripReminder(item: unknown): TripReminder | null {
  if (!isObjectRecord(item)) {
    return null;
  }

  const id = normalizeString(item.id);
  const title = normalizeString(item.title);
  const remindAt = normalizeIsoDateTime(item.remindAt);
  const source = normalizeReminderSource(item.source);
  const status = normalizeReminderStatus(item.status);

  if (!id || !title || !remindAt || !source || !status) {
    return null;
  }

  return {
    id,
    userId: normalizeString(item.userId),
    localDeviceId: normalizeString(item.localDeviceId),
    title,
    source,
    remindAt,
    status,
    route: normalizeRouteSnapshot(item.route),
    legacyOrderId: normalizeString(item.legacyOrderId),
    createdAt: normalizeIsoDateTime(item.createdAt),
    updatedAt: normalizeIsoDateTime(item.updatedAt),
    completedAt: normalizeIsoDateTime(item.completedAt),
    syncedAt: normalizeIsoDateTime(item.syncedAt),
  };
}

function normalizeLegacyOrderReminder(
  item: unknown,
  index: number,
  now: Date,
): TripReminder | null {
  if (!isObjectRecord(item)) {
    return null;
  }

  const order = item as LegacyOrder;
  const route = isObjectRecord(order.route) ? order.route : {};
  const remindAt = normalizeLegacyDateTime(order.date, route.time);
  if (!remindAt) {
    return null;
  }

  const routeSnapshot: TripReminderRouteSnapshot = {
    departure: normalizeString(route.departure),
    arrival: normalizeString(route.arrival),
    lineName: normalizeString(route.line),
    transportMode: normalizeLegacyMode(order.type),
    detail: normalizeLegacyDetail(route),
  };
  const legacyOrderId = normalizeString(order.id) ?? `${index}-${stableHash(JSON.stringify(item))}`;
  const status = normalizeLegacyStatus(order.status, remindAt, now);

  return {
    id: `legacy-order-${stableHash(legacyOrderId)}`,
    title: normalizeTitle(normalizeString(route.line) ?? '', routeSnapshot),
    source: 'legacy_order',
    remindAt,
    status,
    route: routeSnapshot,
    legacyOrderId,
    createdAt: remindAt,
    updatedAt: new Date().toISOString(),
  };
}

function normalizeDraftRoute(draft: TripReminderDraft): TripReminderRouteSnapshot | undefined {
  const route: TripReminderRouteSnapshot = {
    departure: normalizeString(draft.departure),
    arrival: normalizeString(draft.arrival),
    lineName: normalizeString(draft.lineName),
    transportMode: draft.transportMode,
    detail: normalizeString(draft.detail),
  };

  return route.departure || route.arrival || route.lineName || route.transportMode || route.detail
    ? route
    : undefined;
}

function normalizeRouteSnapshot(value: unknown): TripReminderRouteSnapshot | undefined {
  if (!isObjectRecord(value)) {
    return undefined;
  }

  const route: TripReminderRouteSnapshot = {
    departure: normalizeString(value.departure),
    arrival: normalizeString(value.arrival),
    lineName: normalizeString(value.lineName),
    transportMode: normalizeLegacyMode(value.transportMode),
    detail: normalizeString(value.detail),
  };

  return route.departure || route.arrival || route.lineName || route.transportMode || route.detail
    ? route
    : undefined;
}

function normalizeLegacyDateTime(dateValue: unknown, timeValue: unknown): string | undefined {
  const date = normalizeString(dateValue);
  if (!date) {
    return undefined;
  }

  const time = normalizeString(timeValue);
  const normalizedTime = normalizeClockTime(time) ?? '00:00';
  const parsed = new Date(`${date}T${normalizedTime}:00`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function normalizeClockTime(value: string | undefined): string | undefined {
  const match = value?.match(/^(\d{1,2}):(\d{2})/);
  if (!match) {
    return undefined;
  }

  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

function normalizeLegacyDetail(route: NonNullable<LegacyOrder['route']>): string | undefined {
  const parts = [
    normalizeString(route.id),
    normalizeString(route.company),
    normalizeString(route.price),
    Array.isArray(route.lines)
      ? route.lines
          .map((item) => normalizeString(item))
          .filter(Boolean)
          .join(' / ')
      : undefined,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(' · ') : undefined;
}

function normalizeTitle(title: string, route?: TripReminderRouteSnapshot): string {
  const cleanTitle = normalizeString(title);
  if (cleanTitle) {
    return cleanTitle;
  }

  if (route?.departure && route.arrival) {
    return `${route.departure} → ${route.arrival}`;
  }

  return route?.departure ?? route?.arrival ?? route?.lineName ?? '本地行程提醒';
}

function normalizeReminderSource(value: unknown): TripReminderSource | undefined {
  const source = normalizeString(value);
  const knownSources: TripReminderSource[] = [
    'manual',
    'route_plan',
    'schedule',
    'ticket',
    'legacy_order',
  ];
  return knownSources.find((item) => item === source);
}

function normalizeReminderStatus(value: unknown): TripReminderStatus | undefined {
  const status = normalizeString(value);
  const knownStatuses: TripReminderStatus[] = [
    'scheduled',
    'notification_queued',
    'notified',
    'sent',
    'ongoing',
    'completed',
    'cancelled',
    'expired',
  ];
  return knownStatuses.find((item) => item === status);
}

function normalizeLegacyStatus(value: unknown, remindAt: string, now: Date): TripReminderStatus {
  const status = normalizeString(value)?.toLowerCase();
  if (status === 'completed') {
    return 'completed';
  }
  if (status === 'ongoing') {
    return 'ongoing';
  }
  if (status === 'refunded' || status === 'cancelled' || status === 'canceled') {
    return 'cancelled';
  }
  if (status === 'sent' || status === 'notified') {
    return 'notified';
  }

  return new Date(remindAt).getTime() < now.getTime() ? 'expired' : 'scheduled';
}

function normalizeLegacyMode(value: unknown): TripReminderRouteSnapshot['transportMode'] {
  const mode = normalizeString(value)?.toLowerCase();
  if (
    mode === 'metro' ||
    mode === 'bus' ||
    mode === 'coach' ||
    mode === 'tram' ||
    mode === 'ferry' ||
    mode === 'flight' ||
    mode === 'railway'
  ) {
    return mode;
  }

  return undefined;
}

function normalizeIsoDateTime(value: unknown): string | undefined {
  const text = normalizeString(value);
  if (!text) {
    return undefined;
  }

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function normalizeString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function withComputedStatus(reminder: TripReminder, now: Date): TripReminder {
  if (reminder.status !== 'scheduled') {
    return reminder;
  }

  return new Date(reminder.remindAt).getTime() < now.getTime()
    ? { ...reminder, status: 'expired' }
    : reminder;
}

function isActiveReminderStatus(status: TripReminderStatus): boolean {
  return status === 'scheduled' || status === 'notification_queued' || status === 'ongoing';
}

function mergeReminders(primary: TripReminder[], incoming: TripReminder[]): TripReminder[] {
  const seen = new Set<string>();
  const reminders: TripReminder[] = [];

  for (const reminder of [...primary, ...incoming]) {
    const key = reminder.legacyOrderId ? `legacy:${reminder.legacyOrderId}` : reminder.id;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    reminders.push(reminder);
  }

  return reminders;
}

function sortReminders(reminders: TripReminder[]): TripReminder[] {
  return [...reminders].sort((left, right) => {
    const leftActive = isActiveReminderStatus(left.status);
    const rightActive = isActiveReminderStatus(right.status);
    if (leftActive !== rightActive) {
      return leftActive ? -1 : 1;
    }

    const leftTime = new Date(left.remindAt).getTime();
    const rightTime = new Date(right.remindAt).getTime();
    return leftActive ? leftTime - rightTime : rightTime - leftTime;
  });
}

function stableHash(value: string): string {
  let hash = 5381;
  for (const character of value) {
    hash = (hash * 33) ^ character.charCodeAt(0);
  }

  return (hash >>> 0).toString(36);
}

function createLocalId(): string {
  return `local-trip-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
