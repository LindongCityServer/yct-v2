/**
 * KJ OS 宿主 ↔ 雨城通 iframe 的 postMessage 协议。
 *
 * KJ OS 的 `KJ.*` API 只在 Shadow DOM 壳（宿主页面内）可用；雨城通运行在
 * **跨源 iframe** 里，两侧是两个不同的源，既不能互访 DOM，也不能直接调用对方的函数。
 * 因此壳扮演「能力代理」：应用发请求，壳代调 KJ API。
 *
 * 消息刻意不含任何凭据：会话仍由 HttpOnly Cookie 持有，iframe 内的同站请求自动携带。
 */

/** 宿主（KJ OS 壳）发出的消息标识。 */
export const kjOsHostMessageSource = 'kj-os';
/** 雨城通发出的消息标识。 */
export const kjOsAppMessageSource = 'yct';
export const kjOsMessageVersion = 1;

/** 宿主 → 应用：宿主已就绪，可以接收代理请求。 */
export const kjOsHostReadyType = 'kj:host-ready';
/** 应用 → 宿主：应用已挂载，请宿主回执就绪。 */
export const kjOsAppReadyType = 'kj:app-ready';
/** 应用 → 宿主：请求宿主代调 `KJ.showToast`。 */
export const kjOsToastType = 'kj:toast';

/**
 * KJ OS 的 toast 类型。
 *
 * KJ 另支持 `link` 类型，雨城通的四类色调与它一一对应，不需要额外映射。
 */
export type KjOsToastTone = 'info' | 'success' | 'warning' | 'error';

export interface KjOsHostReadyMessage {
  source: typeof kjOsHostMessageSource;
  type: typeof kjOsHostReadyType;
  version: number;
}

export interface KjOsAppReadyMessage {
  source: typeof kjOsAppMessageSource;
  type: typeof kjOsAppReadyType;
  version: number;
}

export interface KjOsToastMessage {
  source: typeof kjOsAppMessageSource;
  type: typeof kjOsToastType;
  version: number;
  message: string;
  tone: KjOsToastTone;
}

export function isKjOsHostReadyMessage(value: unknown): value is KjOsHostReadyMessage {
  const message = value as Partial<KjOsHostReadyMessage> | null;
  return (
    Boolean(message) &&
    typeof message === 'object' &&
    message?.source === kjOsHostMessageSource &&
    message?.type === kjOsHostReadyType &&
    message?.version === kjOsMessageVersion
  );
}
