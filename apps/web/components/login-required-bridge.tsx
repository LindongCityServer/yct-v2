'use client';

import { useEffect, useRef } from 'react';
import { appPath } from '../lib/app-paths';
import {
  getDefaultLoginRequiredMessage,
  loginRequiredNoticeDurationMs,
  subscribeLoginRequired,
} from '../lib/client-auth-events';
import { isEmbeddedContext, publishEmbeddedAuthState } from '../lib/client-embedded-auth';
import { publishToastRequested } from '../lib/client-toast-events';

export function LoginRequiredBridge() {
  const redirectTimer = useRef<number | null>(null);

  useEffect(() => {
    const clearRedirectTimer = () => {
      if (redirectTimer.current !== null) {
        window.clearTimeout(redirectTimer.current);
        redirectTimer.current = null;
      }
    };

    const unsubscribe = subscribeLoginRequired((payload) => {
      clearRedirectTimer();
      const message = payload.message?.trim() || getDefaultLoginRequiredMessage();

      if (isEmbeddedContext()) {
        // 嵌入模式：iframe 内的导航不是顶层导航，`SameSite=Lax` 的 `yct.ldpass_state`
        // 不会随导航发送，回调页必然判定 state_invalid（表现为「登录校验失败」）。
        //
        // 这里也不能顺手 `window.open` —— 本回调由 fetch 401 异步触发，
        // 异步调用栈里的 window.open 会被浏览器的弹窗拦截器拦掉。
        // 因此只广播「需要登录」，由 EmbeddedAuthBridge 渲染按钮，等真实用户手势再开窗。
        publishEmbeddedAuthState({ phase: 'required', resultCode: undefined, message });
        return;
      }

      publishToastRequested({
        dedupeKey: 'auth-login-required',
        durationMs: payload.durationMs ?? loginRequiredNoticeDurationMs,
        message,
        tone: 'warning',
      });
      redirectTimer.current = window.setTimeout(
        () => {
          window.location.assign(appPath('/api/auth/ldpass/start'));
        },
        Math.max(0, payload.durationMs ?? loginRequiredNoticeDurationMs),
      );
    });

    return () => {
      clearRedirectTimer();
      unsubscribe();
    };
  }, []);

  return null;
}
