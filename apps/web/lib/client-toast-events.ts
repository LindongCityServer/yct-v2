export type ClientToastTone = 'info' | 'success' | 'warning' | 'error';

export interface ClientToastRequestedPayload {
  dedupeKey?: string;
  durationMs?: number;
  message: string;
  tone?: ClientToastTone;
}

const toastRequestedEventName = 'yct:toast-requested';

/**
 * 外部 toast 接收端（宿主代理）。
 *
 * 嵌入宿主若能提供系统级 toast（例如 KJ OS 的 `KJ.showToast`），就注册一个 sink 接管展示。
 * sink 返回 `true` 表示已处理，本地浮层不再渲染——否则同一个提示会在应用窗口内
 * 和宿主层各弹一份。
 */
export type ClientToastSink = (payload: ClientToastRequestedPayload) => boolean;

let externalToastSink: ClientToastSink | null = null;

export function registerToastSink(sink: ClientToastSink): () => void {
  externalToastSink = sink;
  return () => {
    if (externalToastSink === sink) {
      externalToastSink = null;
    }
  };
}

export function publishToastRequested(payload: ClientToastRequestedPayload): void {
  if (typeof window === 'undefined' || !payload.message.trim()) {
    return;
  }

  const normalized = { ...payload, message: payload.message.trim() };

  // 宿主接管失败（未就绪或抛错）时落回本地浮层，不能让提示凭空消失。
  try {
    if (externalToastSink?.(normalized)) {
      return;
    }
  } catch (_) {
    // 忽略宿主代理异常，继续走本地浮层。
  }

  window.dispatchEvent(
    new CustomEvent<ClientToastRequestedPayload>(toastRequestedEventName, {
      detail: normalized,
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
