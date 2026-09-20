import { detectEmbeddedContext } from './client-embedded-context';

export interface ClientDialogRequestedPayload {
  requestId: string;
  kind: 'confirm' | 'page';
  message: string;
  url?: string;
}

export interface ClientDialogResolvedPayload {
  requestId: string;
  accepted: boolean;
  reason?: 'lifecycle';
}

const requestedEventName = 'yct:dialog-requested';
const resolvedEventName = 'yct:dialog-resolved';
const pending = new Map<
  string,
  {
    payload: ClientDialogRequestedPayload;
    resolve: (accepted: boolean | undefined) => void;
  }
>();
let sequence = 0;

function requestDialog(
  payload: Omit<ClientDialogRequestedPayload, 'requestId'>,
): Promise<boolean | undefined> {
  // 原生确认框会阻塞重复点击；异步版本也只接受同一操作的一次请求。
  if (
    [...pending.values()].some(
      ({ payload: item }) =>
        item.kind === payload.kind && item.message === payload.message && item.url === payload.url,
    )
  )
    return Promise.resolve(undefined);
  return new Promise((resolve) => {
    const requestId = `dialog-${++sequence}`;
    const request = { ...payload, requestId };
    pending.set(requestId, { payload: request, resolve });
    window.dispatchEvent(
      new CustomEvent<ClientDialogRequestedPayload>(requestedEventName, { detail: request }),
    );
  });
}

export function requestConfirmation(
  message: string,
  options: Readonly<{ presentation?: 'auto' | 'in-app' }> = {},
): Promise<boolean | undefined> {
  if (typeof window === 'undefined') return Promise.resolve(undefined);
  if (options.presentation !== 'in-app' && !detectEmbeddedContext().embedded) {
    try {
      return Promise.resolve(window.confirm(message));
    } catch {
      // 禁止原生对话框的宿主仍可使用站内确认框。
    }
  }
  return requestDialog({ kind: 'confirm', message });
}

export function requestPageWindow(
  url: string,
  title: string,
  options: Readonly<{ presentation?: 'auto' | 'in-app' }> = {},
): void {
  const target = new URL(url, window.location.href);
  if (target.origin !== window.location.origin || !['http:', 'https:'].includes(target.protocol))
    return;
  if (options.presentation === 'in-app' || detectEmbeddedContext().embedded) {
    void requestDialog({ kind: 'page', message: title, url: target.href });
  } else {
    window.open(target.href, '_blank', 'noopener,noreferrer');
  }
}

export function publishDialogResolved(payload: ClientDialogResolvedPayload): void {
  const request = pending.get(payload.requestId);
  if (!request) return;
  pending.delete(payload.requestId);
  // 切页或卸载不是用户选择“取消”，不能触发调用方的取消分支副作用。
  request.resolve(payload.reason === 'lifecycle' ? undefined : payload.accepted);
  window.dispatchEvent(
    new CustomEvent<ClientDialogResolvedPayload>(resolvedEventName, { detail: payload }),
  );
}

export function cancelPendingDialogs(): void {
  for (const requestId of pending.keys())
    publishDialogResolved({ requestId, accepted: false, reason: 'lifecycle' });
}

export function subscribeDialogRequested(
  listener: (payload: ClientDialogRequestedPayload) => void,
): () => void {
  const handle = (event: Event) =>
    listener((event as CustomEvent<ClientDialogRequestedPayload>).detail);
  window.addEventListener(requestedEventName, handle);
  for (const { payload } of pending.values()) listener(payload);
  return () => window.removeEventListener(requestedEventName, handle);
}

export function subscribeDialogResolved(
  listener: (payload: ClientDialogResolvedPayload) => void,
): () => void {
  const handle = (event: Event) =>
    listener((event as CustomEvent<ClientDialogResolvedPayload>).detail);
  window.addEventListener(resolvedEventName, handle);
  return () => window.removeEventListener(resolvedEventName, handle);
}
