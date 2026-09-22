'use client';

import { useEffect } from 'react';
import { registerToastSink } from '../../lib/client-toast-events';
import {
  resolveConfiguredEmbedHostOrigins,
  type EmbeddedHostAdapter,
} from '../../lib/embedded-host-adapters';
import {
  isKjOsHostReadyMessage,
  kjOsAppMessageSource,
  kjOsAppReadyType,
  kjOsMessageVersion,
  kjOsToastType,
  type KjOsAppReadyMessage,
  type KjOsToastMessage,
} from '../../lib/kj-os-bridge-protocol';

/** KJ OS 默认部署地址；可用 NEXT_PUBLIC_YCT_EMBED_HOST_ORIGINS 覆盖。 */
const defaultKjOsOrigins = ['https://kj.sgguo.com'];

/** 握手与 iframe 加载存在竞态，重试几次即可覆盖，无需长轮询。 */
const appReadyRetryDelaysMs = [0, 400, 1200, 3000];

type KjOsAppMessage = KjOsAppReadyMessage | KjOsToastMessage;

export const kjOsEmbeddedHost: EmbeddedHostAdapter = {
  id: 'kj-os',
  resolveOrigins: () =>
    resolveConfiguredEmbedHostOrigins(
      process.env.NEXT_PUBLIC_YCT_EMBED_HOST_ORIGINS,
      defaultKjOsOrigins,
    ),
};

/**
 * KJ OS 桥接（应用侧）。
 *
 * 目前只做一件事：把雨城通的 toast 请求转交宿主，由壳代调 `KJ.showToast`，
 * 让提示浮在 OS 层、与其他 KJ 应用观感一致。
 *
 * 之所以必须绕这一圈：雨城通在**跨源 iframe** 里，既拿不到宿主的 `KJ` 对象，
 * 也访问不了宿主的 DOM——postMessage 是两个源之间唯一的通道。
 *
 * 宿主未就绪时 sink 返回 `false`，toast 自动落回应用自己的浮层，
 * 不会因为壳没响应就把提示丢掉。
 */
export function KjOsBridge() {
  useEffect(() => {
    // 顶层窗口没有宿主可通信，非嵌入场景完全不参与。
    if (window.self === window.top) {
      return;
    }

    const allowedOrigins = kjOsEmbeddedHost.resolveOrigins();
    let hostReady = false;

    const handleMessage = (event: MessageEvent) => {
      // 只接受「真正的父窗口」发来的消息，且来源必须在白名单内。
      // 消息本身不含凭据，这层校验是为了防止同页其他 iframe 冒名。
      if (event.source !== window.parent) {
        return;
      }
      if (!allowedOrigins.has(event.origin)) {
        return;
      }
      if (isKjOsHostReadyMessage(event.data)) {
        hostReady = true;
      }
    };

    // targetOrigin 只能是 '*'：跨源 iframe 读不到父窗口的真实来源，写死会让消息被
    // 静默丢弃。payload 不含任何凭据，且接收侧会校验 `event.source` 必须等于它自己的 iframe。
    const postToHost = (payload: KjOsAppMessage) => {
      try {
        window.parent.postMessage(payload, '*');
      } catch (_) {
        // 宿主窗口可能已关闭，忽略。
      }
    };

    const requestHostReady = () => {
      if (hostReady) {
        return;
      }
      postToHost({
        source: kjOsAppMessageSource,
        type: kjOsAppReadyType,
        version: kjOsMessageVersion,
      });
    };

    const retryTimers = appReadyRetryDelaysMs.map((delay) =>
      window.setTimeout(requestHostReady, delay),
    );

    const unregisterSink = registerToastSink((payload) => {
      if (!hostReady) {
        return false;
      }
      postToHost({
        source: kjOsAppMessageSource,
        type: kjOsToastType,
        version: kjOsMessageVersion,
        message: payload.message,
        tone: payload.tone ?? 'info',
      });
      return true;
    });

    window.addEventListener('message', handleMessage);

    return () => {
      for (const timer of retryTimers) {
        window.clearTimeout(timer);
      }
      unregisterSink();
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  return null;
}
