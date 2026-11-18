'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  cancelPendingDialogs,
  publishDialogResolved,
  subscribeDialogRequested,
  subscribeDialogResolved,
  type ClientDialogRequestedPayload,
} from '../lib/client-dialog-events';
import { useI18n } from '../lib/client-i18n';
import { Button, IconButton } from './ui/button';

export function ClientDialogBridge() {
  const [queue, setQueue] = useState<ClientDialogRequestedPayload[]>([]);
  const pathname = usePathname();
  const previousPath = useRef(pathname);
  useEffect(() => {
    const unsubscribeRequest = subscribeDialogRequested((request) => {
      setQueue((current) =>
        current.some((item) => item.requestId === request.requestId)
          ? current
          : [...current, request],
      );
    });
    const unsubscribeResolved = subscribeDialogResolved(({ requestId }) => {
      setQueue((current) => current.filter((item) => item.requestId !== requestId));
    });
    window.addEventListener('pagehide', cancelPendingDialogs);
    return () => {
      cancelPendingDialogs();
      unsubscribeRequest();
      unsubscribeResolved();
      window.removeEventListener('pagehide', cancelPendingDialogs);
    };
  }, []);
  useEffect(() => {
    if (previousPath.current !== pathname) cancelPendingDialogs();
    previousPath.current = pathname;
  }, [pathname]);
  const request = queue[0];
  return request ? <ClientDialog key={request.requestId} request={request} /> : null;
}

function ClientDialog({ request }: Readonly<{ request: ClientDialogRequestedPayload }>) {
  const ref = useRef<HTMLDialogElement>(null);
  const { locale } = useI18n();
  const labels =
    locale === 'en'
      ? { title: 'Confirm', confirm: 'Confirm', cancel: 'Cancel', close: 'Close' }
      : locale === 'zh-Hant'
        ? { title: '確認操作', confirm: '確認', cancel: '取消', close: '關閉' }
        : { title: '确认操作', confirm: '确认', cancel: '取消', close: '关闭' };
  const dismiss = (accepted = false) =>
    publishDialogResolved({ requestId: request.requestId, accepted });
  useEffect(() => {
    const dialog = ref.current;
    const previousFocus = document.activeElement;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal-panel client-dialog${request.kind === 'page' ? ' is-page' : ''}`}
      aria-labelledby={`${request.requestId}-title`}
      aria-describedby={request.kind === 'confirm' ? `${request.requestId}-message` : undefined}
      onCancel={(event) => {
        event.preventDefault();
        dismiss();
      }}
    >
      <div className="client-dialog-heading">
        <h2 id={`${request.requestId}-title`}>
          {request.kind === 'page' ? request.message : labels.title}
        </h2>
        <IconButton variant="icon" icon="close" label={labels.close} onClick={() => dismiss()} />
      </div>
      {request.kind === 'page' ? (
        <iframe src={request.url} title={request.message} />
      ) : (
        <>
          <p id={`${request.requestId}-message`}>{request.message}</p>
          <div className="client-dialog-actions">
            <Button variant="secondary" autoFocus onClick={() => dismiss()}>
              {labels.cancel}
            </Button>
            <Button variant="primary" onClick={() => dismiss(true)}>
              {labels.confirm}
            </Button>
          </div>
        </>
      )}
    </dialog>
  );
}
