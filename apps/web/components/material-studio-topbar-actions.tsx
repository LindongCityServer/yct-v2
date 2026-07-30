'use client';

import { useEffect, useState } from 'react';
import {
  requestMaterialStudioAction,
  subscribeMaterialStudioActionBlocked,
  subscribeMaterialStudioState,
  type MaterialStudioStateChangedPayload,
} from '../lib/client-material-studio-events';

const initialState: Omit<MaterialStudioStateChangedPayload, 'studioId'> = {
  mode: 'manual',
  hasPreview: false,
  isBusy: false,
};

export function MaterialStudioTopbarActions({ studioId }: Readonly<{ studioId: string }>) {
  const [studioState, setStudioState] = useState(initialState);
  const [blockedMessage, setBlockedMessage] = useState('');

  useEffect(
    () =>
      subscribeMaterialStudioState(studioId, ({ studioId: _studioId, ...state }) => {
        setStudioState(state);
      }),
    [studioId],
  );

  useEffect(() => {
    let timeoutId: number | undefined;
    const unsubscribe = subscribeMaterialStudioActionBlocked(studioId, (message) => {
      setBlockedMessage(message);
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => setBlockedMessage(''), 5000);
    });
    return () => {
      window.clearTimeout(timeoutId);
      unsubscribe();
    };
  }, [studioId]);

  const requestAction = (action: 'preview' | 'submit' | 'download') => {
    setBlockedMessage('');
    requestMaterialStudioAction({ studioId, action });
  };
  const previewLabel = studioState.hasPreview ? '更新预览' : '预览';

  return (
    <div className="topbar-actions material-studio-topbar-actions">
      <button
        type="button"
        className="icon-button"
        aria-label={previewLabel}
        title={previewLabel}
        disabled={studioState.isBusy}
        onClick={() => requestAction('preview')}
      >
        <span className="material-symbols-outlined" aria-hidden="true">
          {studioState.hasPreview ? 'refresh' : 'visibility'}
        </span>
      </button>
      <button
        type="button"
        className="icon-button"
        aria-label="提交审核"
        title="提交审核"
        disabled={studioState.isBusy}
        onClick={() => requestAction('submit')}
      >
        <span className="material-symbols-outlined" aria-hidden="true">
          publish
        </span>
      </button>
      <button
        type="button"
        className="icon-button"
        aria-label="下载图片"
        title="下载图片"
        disabled={studioState.isBusy}
        onClick={() => requestAction('download')}
      >
        <span className="material-symbols-outlined" aria-hidden="true">
          download
        </span>
      </button>
      {blockedMessage ? (
        <div className="topbar-notice" role="alert">
          {blockedMessage}
        </div>
      ) : null}
    </div>
  );
}
