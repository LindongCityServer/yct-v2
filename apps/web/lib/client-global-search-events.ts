export const globalSearchRequestedEventName = 'yct:global-search-requested';

export interface GlobalSearchRequestedPayload {
  query?: string;
  /** 打开后直接进入问一问模式，用于从搜索结果页跳转。 */
  ask?: boolean;
}

export function publishGlobalSearchRequested(payload: GlobalSearchRequestedPayload = {}): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<GlobalSearchRequestedPayload>(globalSearchRequestedEventName, {
      detail: payload,
    }),
  );
}

export function subscribeGlobalSearchRequested(
  listener: (payload: GlobalSearchRequestedPayload) => void,
): () => void {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  const handleEvent = (event: Event) => {
    listener((event as CustomEvent<GlobalSearchRequestedPayload>).detail ?? {});
  };

  window.addEventListener(globalSearchRequestedEventName, handleEvent);
  return () => window.removeEventListener(globalSearchRequestedEventName, handleEvent);
}
