export type ClientToastTone = 'info' | 'success' | 'warning' | 'error';

export interface ClientToastRequestedPayload {
  dedupeKey?: string;
  durationMs?: number;
  message: string;
  tone?: ClientToastTone;
}

const toastRequestedEventName = 'yct:toast-requested';

export function publishToastRequested(payload: ClientToastRequestedPayload): void {
  if (typeof window === 'undefined' || !payload.message.trim()) {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<ClientToastRequestedPayload>(toastRequestedEventName, {
      detail: { ...payload, message: payload.message.trim() },
    }),
  );
}

export function subscribeToastRequested(
  listener: (payload: ClientToastRequestedPayload) => void,
): () => void {
  const handleEvent = (event: Event) => {
    const payload = (event as CustomEvent<ClientToastRequestedPayload>).detail;
    if (payload?.message?.trim()) {
      listener(payload);
    }
  };

  window.addEventListener(toastRequestedEventName, handleEvent);
  return () => window.removeEventListener(toastRequestedEventName, handleEvent);
}
