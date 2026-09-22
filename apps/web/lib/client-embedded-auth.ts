/**
 * 嵌入模式（被网页桌面容器的 iframe 嵌入）下的登录编排。
 *
 * 背景：嵌入容器的 iframe 默认不带 `allow-same-origin`，即使带上之后，
 * **iframe 内的导航也不是顶层导航**，而 `SameSite=Lax` 的 `yct.ldpass_state`
 * 只在顶层导航中发送。于是回调页读不到 state，判定 `state_invalid`，
 * 在界面上表现为「登录校验失败」。
 *
 * 修复方式：把登录整体移到**顶层弹窗**里完成（顶层导航才会发送 Lax Cookie），
 * 再用 `postMessage` 把结果通知回 iframe。
 *
 * 本模块只做编排与状态广播，**不承载任何凭据**：
 * 会话仍然由 HttpOnly Cookie 持有，iframe 内的同站请求会自动携带。
 */

import { appPath } from './app-paths';
import { detectEmbeddedContext } from './client-embedded-context';
import {
  embeddedAuthMessageSource,
  embeddedAuthMessageType,
  embeddedAuthMessageVersion,
  type EmbeddedAuthMessage,
} from './embedded-auth-protocol';

export {
  embeddedAuthMessageSource,
  embeddedAuthMessageType,
  embeddedAuthMessageVersion,
  type EmbeddedAuthMessage,
} from './embedded-auth-protocol';

/** iframe 侧广播的登录编排状态。 */
export const embeddedAuthChangedEventName = 'yct:embedded-auth-changed';

/** 弹窗被用户直接关闭（未回传结果）时广播。 */
export const embeddedAuthPopupClosedEventName = 'yct:embedded-auth-popup-closed';

/** 弹窗窗口名固定，重复点击会复用同一个窗口而不是叠加。 */
const embeddedLoginPopupName = 'yct-embedded-ldpass-login';

/** 弹窗尺寸。刻意不给 `noopener`，否则完成页拿不到 `window.opener`。 */
const embeddedLoginPopupFeatures = 'popup=yes,width=520,height=680,resizable=yes,scrollbars=yes';

const popupPollIntervalMs = 500;
const popupMaxLifetimeMs = 10 * 60 * 1000;

export type EmbeddedAuthPhase = 'idle' | 'required' | 'waiting' | 'succeeded' | 'failed';

export interface EmbeddedAuthState {
  /** 是否处于嵌入上下文。 */
  embedded: boolean;
  phase: EmbeddedAuthPhase;
  /** 结果码：state_invalid / session_error / popup_blocked / login_success / readonly ... */
  resultCode?: string;
  /** 由 login-required 事件带来的自定义提示文案。 */
  message?: string;
}

let currentState: EmbeddedAuthState = { embedded: false, phase: 'idle' };
let activePopup: Window | null = null;
let pollTimer: number | null = null;
let messageHandler: ((event: MessageEvent) => void) | null = null;

export function readEmbeddedAuthState(): EmbeddedAuthState {
  return { ...currentState };
}

export function publishEmbeddedAuthState(patch: Partial<EmbeddedAuthState>): void {
  if (typeof window === 'undefined') {
    return;
  }

  currentState = { ...currentState, ...patch };
  window.dispatchEvent(
    new CustomEvent<EmbeddedAuthState>(embeddedAuthChangedEventName, {
      detail: { ...currentState },
    }),
  );
}

export function subscribeEmbeddedAuthState(
  listener: (state: EmbeddedAuthState) => void,
): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const handleEvent = (event: Event) => {
    listener((event as CustomEvent<EmbeddedAuthState>).detail ?? readEmbeddedAuthState());
  };

  window.addEventListener(embeddedAuthChangedEventName, handleEvent);
  // 晚订阅的一方必须立刻拿到最近一次状态，否则重挂载后面板会整块消失。
  listener(readEmbeddedAuthState());

  return () => window.removeEventListener(embeddedAuthChangedEventName, handleEvent);
}

export function resetEmbeddedAuthState(): void {
  publishEmbeddedAuthState({ phase: 'idle', resultCode: undefined, message: undefined });
}

export function isEmbeddedContext(): boolean {
  return detectEmbeddedContext().embedded;
}

/**
 * 弹窗目标地址。
 * 带 `embed=1`，回调页据此改走「postMessage 完成页」而不是 302 回账号页。
 */
export function buildEmbeddedLoginUrl(): string {
  return `${appPath('/api/auth/ldpass/start')}?embed=1`;
}

/**
 * 打开登录弹窗。
 *
 * **必须在用户手势的同步调用栈里执行**，否则会被浏览器的弹窗拦截器拦掉。
 * 这也是为什么不能沿用「fetch 401 → 延迟自动跳转」的既有逻辑：
 * 那条路径是异步的，`window.open` 必然被拦。
 */
export function openEmbeddedLoginPopup(): Window | null {
  if (typeof window === 'undefined') {
    return null;
  }

  let popup: Window | null = null;
  try {
    popup = window.open(
      buildEmbeddedLoginUrl(),
      embeddedLoginPopupName,
      embeddedLoginPopupFeatures,
    );
  } catch (_) {
    popup = null;
  }

  if (!popup) {
    publishEmbeddedAuthState({ phase: 'failed', resultCode: 'popup_blocked' });
    return null;
  }

  activePopup = popup;
  publishEmbeddedAuthState({ phase: 'waiting', resultCode: undefined });
  startPopupWatch();
  return popup;
}

export function closeEmbeddedLoginPopup(): void {
  stopPopupWatch();
  try {
    activePopup?.close();
  } catch (_) {
    // 跨源窗口可能拒绝关闭，忽略即可。
  }
  activePopup = null;
}

/**
 * 安装完成页消息监听。返回清理函数，重复安装会自动替换上一份监听。
 */
export function installEmbeddedAuthListener(): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  if (messageHandler) {
    window.removeEventListener('message', messageHandler);
    messageHandler = null;
  }

  const handleMessage = (event: MessageEvent) => {
    // 只接受「我们亲自打开的那个弹窗」发来的消息。
    // 持有 popup 引用本身就是最强约束，因此这里允许不透明来源
    // （iframe 未获 allow-same-origin 时 event.origin 为 'null'），
    // 换取在受限环境下也能拿到登录结果。消息内容不含任何凭据。
    if (!activePopup || event.source !== activePopup) {
      return;
    }

    const data = event.data as Partial<EmbeddedAuthMessage> | null;
    if (!data || typeof data !== 'object') {
      return;
    }
    if (data.source !== embeddedAuthMessageSource) {
      return;
    }
    if (data.type !== embeddedAuthMessageType) {
      return;
    }
    if (data.version !== embeddedAuthMessageVersion) {
      return;
    }

    const status = typeof data.status === 'string' && data.status ? data.status : 'unknown';
    publishEmbeddedAuthState({
      phase: data.ok === true ? 'succeeded' : 'failed',
      resultCode: status,
    });

    stopPopupWatch();
    try {
      activePopup?.close();
    } catch (_) {
      // 完成页通常已自行关闭。
    }
    activePopup = null;
  };

  messageHandler = handleMessage;
  window.addEventListener('message', handleMessage);

  return () => {
    if (messageHandler === handleMessage) {
      window.removeEventListener('message', handleMessage);
      messageHandler = null;
    }
  };
}

function startPopupWatch(): void {
  stopPopupWatch();

  const startedAt = Date.now();
  pollTimer = window.setInterval(() => {
    if (!activePopup) {
      stopPopupWatch();
      return;
    }

    if (activePopup.closed) {
      stopPopupWatch();
      activePopup = null;
      // 没有收到结果就说明用户自己关了窗口：回到「需要登录」并通知上层重拉一次状态。
      if (currentState.phase === 'waiting') {
        publishEmbeddedAuthState({ phase: 'required', resultCode: undefined });
        window.dispatchEvent(new CustomEvent(embeddedAuthPopupClosedEventName));
      }
      return;
    }

    if (Date.now() - startedAt > popupMaxLifetimeMs) {
      stopPopupWatch();
    }
  }, popupPollIntervalMs);
}

function stopPopupWatch(): void {
  if (pollTimer !== null) {
    window.clearInterval(pollTimer);
    pollTimer = null;
  }
}
