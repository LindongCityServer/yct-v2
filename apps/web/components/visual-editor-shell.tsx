'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { appPath } from '../lib/app-paths';
import { subscribeEditorDraftChanged, type VisualEditorKind } from '../lib/client-editor-events';

export function VisualEditorShell({
  actions,
  backLabel = '返回',
  backHref,
  children,
  editorKind,
  isBusy = false,
  isDirty = false,
  onBack,
  onSave,
  sessionId,
  status,
  title,
}: Readonly<{
  actions?: ReactNode;
  backLabel?: string;
  backHref: string;
  children: ReactNode;
  editorKind: VisualEditorKind;
  isBusy?: boolean;
  isDirty?: boolean;
  onBack?: () => void;
  onSave?: () => void;
  sessionId: string;
  status?: string;
  title: string;
}>) {
  const [eventDirty, setEventDirty] = useState(false);
  const approvedNavigationRef = useRef(false);
  const dirty = isDirty || eventDirty;

  useEffect(
    () =>
      subscribeEditorDraftChanged(sessionId, ({ dirty: nextDirty }) => {
        setEventDirty(nextDirty);
      }),
    [sessionId],
  );

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty || approvedNavigationRef.current) {
        return;
      }
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    if (!onSave) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (!isBusy) onSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isBusy, onSave]);

  const requestBack = () => {
    if (onBack) {
      onBack();
      return;
    }
    if (dirty && !window.confirm('当前编辑尚未保存，确定离开吗？')) {
      return;
    }
    approvedNavigationRef.current = true;
    window.location.assign(appPath(backHref));
  };

  return (
    <main className={`visual-editor-page is-${editorKind}-editor`} aria-busy={isBusy}>
      <header className="visual-editor-page-header">
        <button
          className="visual-editor-page-back"
          type="button"
          disabled={isBusy}
          onClick={requestBack}
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            arrow_back
          </span>
          <span>{backLabel}</span>
        </button>
        <div className="visual-editor-page-heading">
          <h1>{title}</h1>
          {status ? <span className="visual-editor-page-status">{status}</span> : null}
        </div>
        {actions ? <div className="visual-editor-page-actions">{actions}</div> : null}
      </header>
      <div className="visual-editor-page-body">{children}</div>
    </main>
  );
}
