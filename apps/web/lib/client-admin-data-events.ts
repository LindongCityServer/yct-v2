export type AdminDataResource =
  | 'all'
  | 'poi'
  | 'operations'
  | 'transit'
  | 'services'
  | 'materials'
  | 'membership'
  | 'translations'
  | 'audit'
  | 'administrative-areas'
  | 'map-settings';

export type AdminDataChangedReason =
  | 'submission_created'
  | 'status_changed'
  | 'record_created'
  | 'record_updated'
  | 'record_archived'
  | 'manual_refresh';

export interface AdminDataChangedPayload {
  resource: AdminDataResource;
  reason: AdminDataChangedReason;
  occurredAt: string;
}

const adminDataChangedEventName = 'yct:admin-data-changed';
const adminDataChangedStorageKey = 'yct:admin-data-changed:last-event';

export function publishAdminDataChanged(payload: AdminDataChangedPayload): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<AdminDataChangedPayload>(adminDataChangedEventName, { detail: payload }),
  );
  try {
    window.localStorage.setItem(
      adminDataChangedStorageKey,
      JSON.stringify({ ...payload, nonce: `${Date.now()}-${Math.random()}` }),
    );
  } catch {
    // 存储不可用时仍保留当前标签页内的事件通知。
  }
}

export function subscribeAdminDataChanged(
  resource: AdminDataResource,
  listener: (payload: AdminDataChangedPayload) => void,
  options: Readonly<{ includeSameWindow?: boolean }> = {},
): () => void {
  const includeSameWindow = options.includeSameWindow ?? true;
  const handleCustomEvent = (event: Event) => {
    const payload = (event as CustomEvent<AdminDataChangedPayload>).detail;
    if (payload?.resource === resource || payload?.resource === 'all' || resource === 'all') {
      listener(payload);
    }
  };
  const handleStorageEvent = (event: StorageEvent) => {
    if (event.key !== adminDataChangedStorageKey || !event.newValue) {
      return;
    }
    try {
      const payload = JSON.parse(event.newValue) as AdminDataChangedPayload;
      if (payload.resource === resource || payload.resource === 'all' || resource === 'all') {
        listener(payload);
      }
    } catch {
      // 忽略其他版本或损坏的本地事件记录。
    }
  };

  if (includeSameWindow) {
    window.addEventListener(adminDataChangedEventName, handleCustomEvent);
  }
  window.addEventListener('storage', handleStorageEvent);
  return () => {
    if (includeSameWindow) {
      window.removeEventListener(adminDataChangedEventName, handleCustomEvent);
    }
    window.removeEventListener('storage', handleStorageEvent);
  };
}
