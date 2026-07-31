'use client';

import { useEffect, useRef, useState } from 'react';
import { appPath } from '../lib/app-paths';
import {
  getDefaultLoginRequiredMessage,
  loginRequiredNoticeDurationMs,
  subscribeLoginRequired,
} from '../lib/client-auth-events';

export function LoginRequiredBridge() {
  const [message, setMessage] = useState('');
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
      setMessage(payload.message?.trim() || getDefaultLoginRequiredMessage());
      redirectTimer.current = window.setTimeout(
        () => {
          setMessage('');
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

  return message ? (
    <div className="login-required-notice" role="alert" aria-live="assertive">
      {message}
    </div>
  ) : null;
}
