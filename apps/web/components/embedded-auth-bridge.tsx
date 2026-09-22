'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '../lib/client-i18n';
import {
  closeEmbeddedLoginPopup,
  installEmbeddedAuthListener,
  openEmbeddedLoginPopup,
  publishEmbeddedAuthState,
  resetEmbeddedAuthState,
  subscribeEmbeddedAuthState,
  type EmbeddedAuthState,
} from '../lib/client-embedded-auth';
import {
  detectEmbeddedContext,
  subscribeEmbeddedContextChanged,
} from '../lib/client-embedded-context';

/**
 * 嵌入模式下的登录浮层。
 *
 * 只负责两件事：
 * 1. 安装完成页消息监听，把弹窗结果落成状态；
 * 2. 在「需要登录 / 等待授权 / 失败」时渲染一个**可点击**的入口。
 *
 * 之所以必须由用户点击而不是自动开窗：`login-required` 由 fetch 401 异步触发，
 * 在异步回调里 `window.open` 会被浏览器的弹窗拦截器拦掉。
 */
export function EmbeddedAuthBridge() {
  const [state, setState] = useState<EmbeddedAuthState>({ embedded: false, phase: 'idle' });
  const router = useRouter();

  useEffect(() => installEmbeddedAuthListener(), []);

  useEffect(() => {
    const syncEmbedded = () =>
      publishEmbeddedAuthState({ embedded: detectEmbeddedContext().embedded });
    syncEmbedded();
    return subscribeEmbeddedContextChanged(syncEmbedded);
  }, []);

  useEffect(() => subscribeEmbeddedAuthState(setState), []);

  useEffect(() => {
    if (state.phase !== 'succeeded') {
      return;
    }
    // 刷新服务端组件数据（保留客户端状态与滚动位置），随后收起浮层。
    router.refresh();
    const timer = window.setTimeout(resetEmbeddedAuthState, 1200);
    return () => window.clearTimeout(timer);
  }, [state.phase, router]);

  if (!state.embedded || state.phase === 'idle' || state.phase === 'succeeded') {
    return null;
  }

  return <EmbeddedAuthPrompt state={state} />;
}

function EmbeddedAuthPrompt({ state }: Readonly<{ state: EmbeddedAuthState }>) {
  const { locale } = useI18n();
  const labels =
    locale === 'en'
      ? {
          title: 'Sign in required',
          hint: 'The web desktop container cannot read the sign-in cookie inside an embedded window. Complete the LDPASS sign-in in a separate window.',
          action: 'Open sign-in window',
          waiting: 'Waiting for sign-in',
          waitingHint: 'Finish the LDPASS sign-in in the new window, then come back here.',
          reopen: 'Reopen sign-in window',
          cancel: 'Cancel',
          retry: 'Retry',
          succeeded: 'Signed in',
          stateInvalid: 'The sign-in check did not pass. Please try again.',
          popupBlocked: 'The browser blocked the new window. Allow pop-ups and retry.',
          failed: 'Sign-in was not completed. Please try again.',
        }
      : locale === 'zh-Hant'
        ? {
            title: '需要登入',
            hint: '當前網頁桌面容器無法在嵌入視窗中讀取登入 Cookie，請另開視窗完成臨東通登入。',
            action: '開啟登入視窗',
            waiting: '等待登入',
            waitingHint: '請在新視窗完成臨東通登入，然後回到這裡。',
            reopen: '重新開啟登入視窗',
            cancel: '取消',
            retry: '重試',
            succeeded: '登入成功',
            stateInvalid: '登入校驗未通過，請重試。',
            popupBlocked: '瀏覽器已封鎖新視窗，請允許彈出視窗後重試。',
            failed: '登入未完成，請重試。',
          }
        : {
            title: '需要登录',
            hint: '当前网页桌面容器无法在嵌入窗口中读取登录 Cookie，请另开窗口完成临东通登录。',
            action: '打开登录窗口',
            waiting: '等待登录',
            waitingHint: '请在新窗口完成临东通登录，然后回到这里。',
            reopen: '重新打开登录窗口',
            cancel: '取消',
            retry: '重试',
            succeeded: '登录成功',
            stateInvalid: '登录校验未通过，请重试。',
            popupBlocked: '浏览器已拦截新窗口，请允许弹出窗口后重试。',
            failed: '登录未完成，请重试。',
          };

  const waiting = state.phase === 'waiting';
  const failed = state.phase === 'failed';
  const message = state.message?.trim()
    ? state.message.trim()
    : failed
      ? resolveFailureMessage(state.resultCode, labels)
      : waiting
        ? labels.waitingHint
        : labels.hint;

  const handleOpen = useCallback(() => {
    // 必须保持同步调用：任何 await / setTimeout 都会让弹窗被拦截器拦掉。
    openEmbeddedLoginPopup();
  }, []);

  return (
    <div
      className={`embedded-auth-prompt${failed ? ' is-error' : ''}`}
      role="alertdialog"
      aria-labelledby="embedded-auth-prompt-title"
      aria-describedby="embedded-auth-prompt-message"
    >
      <span className="material-symbols-outlined embedded-auth-prompt-icon" aria-hidden="true">
        {failed ? 'passkey' : 'login'}
      </span>
      <div className="embedded-auth-prompt-body">
        <p className="embedded-auth-prompt-title" id="embedded-auth-prompt-title">
          {failed ? labels.title : waiting ? labels.waiting : labels.title}
        </p>
        <p className="embedded-auth-prompt-message" id="embedded-auth-prompt-message">
          {message}
        </p>
      </div>
      <div className="embedded-auth-prompt-actions">
        {waiting ? (
          <button
            className="secondary-action-button"
            type="button"
            onClick={() => closeEmbeddedLoginPopup()}
          >
            <span>{labels.cancel}</span>
          </button>
        ) : null}
        <button className="primary-action-button" type="button" onClick={handleOpen}>
          <span>{waiting ? labels.reopen : failed ? labels.retry : labels.action}</span>
        </button>
      </div>
    </div>
  );
}

function resolveFailureMessage(
  resultCode: string | undefined,
  labels: { stateInvalid: string; popupBlocked: string; failed: string },
): string {
  if (resultCode === 'state_invalid') {
    return labels.stateInvalid;
  }
  if (resultCode === 'popup_blocked') {
    return labels.popupBlocked;
  }
  return labels.failed;
}
