'use client';

import { useEffect, useRef } from 'react';
import { appPath } from '../lib/app-paths';
import {
  getDefaultLoginRequiredMessage,
  loginRequiredNoticeDurationMs,
  subscribeLoginRequired,
} from '../lib/client-auth-events';
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
      publishToastRequested({
        dedupeKey: 'auth-login-required',
        durationMs: payload.durationMs ?? loginRequiredNoticeDurationMs,
        message: payload.message?.trim() || getDefaultLoginRequiredMessage(),
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
