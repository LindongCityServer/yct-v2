'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { appPath } from '../lib/app-paths';
import { subscribeEditorDraftChanged, type VisualEditorKind } from '../lib/client-editor-events';
import { SecondaryPageHeader } from './app-shell';

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
  workspace = false,
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
  workspace?: boolean;
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
    <main
      className={`visual-editor-page is-${editorKind}-editor${workspace ? ' is-workspace' : ''}`}
      aria-busy={isBusy}
    >
      <SecondaryPageHeader
        backHref={backHref}
        backLabel={backLabel}
        onBack={requestBack}
        secondaryActions={
          <>
            {status ? <span className="visual-editor-page-status">{status}</span> : null}
            {actions ??
              (onSave ? (
                <button
                  className="secondary-action-button is-primary"
                  type="button"
                  aria-busy={isBusy}
                  disabled={isBusy}
                  onClick={onSave}
                >
                  <span
                    className={`material-symbols-outlined${isBusy ? ' busy-state-indicator' : ''}`}
                    aria-hidden="true"
                  >
                    {isBusy ? 'progress_activity' : 'save'}
                  </span>
                  <span>{isBusy ? '保存中' : '保存'}</span>
                </button>
              ) : null)}
          </>
        }
        title={title}
      />
      <div className="visual-editor-page-body">{children}</div>
    </main>
  );
}
