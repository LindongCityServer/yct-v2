'use client';

import { useEffect, useState } from 'react';
import { appPath } from '../lib/app-paths';
import { publishLoginRequired } from '../lib/client-auth-events';
import {
  requestMaterialStudioAction,
  subscribeMaterialStudioActionBlocked,
  subscribeMaterialStudioState,
  type MaterialStudioStateChangedPayload,
} from '../lib/client-material-studio-events';
import { publishToastRequested } from '../lib/client-toast-events';

type AccountStatus = 'not_configured' | 'anonymous' | 'active' | 'readonly' | 'unavailable';

interface AccountStatusResponse {
  accountStatus?: AccountStatus;
}

const initialState: Omit<MaterialStudioStateChangedPayload, 'studioId'> = {
  mode: 'manual',
  hasPreview: false,
  isBusy: false,
  canExportProject: false,
};

export function MaterialStudioTopbarActions({ studioId }: Readonly<{ studioId: string }>) {
  const [studioState, setStudioState] = useState(initialState);
  const [accountStatus, setAccountStatus] = useState<AccountStatus>();

  useEffect(() => {
    let cancelled = false;
    void fetch(appPath('/api/account/status'), { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) return undefined;
        return (await response.json()) as AccountStatusResponse;
      })
      .then((payload) => {
        if (!cancelled) setAccountStatus(payload?.accountStatus);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(
    () =>
      subscribeMaterialStudioState(studioId, ({ studioId: _studioId, ...state }) => {
        setStudioState(state);
      }),
    [studioId],
  );

  useEffect(() => {
    return subscribeMaterialStudioActionBlocked(studioId, (message) => {
      publishToastRequested({
        dedupeKey: `material-studio-blocked:${studioId}`,
        message,
        tone: 'warning',
      });
    });
  }, [studioId]);

  const requestAction = (action: 'preview' | 'submit' | 'download' | 'export-project') => {
    requestMaterialStudioAction({ studioId, action });
  };
  const previewLabel = studioState.hasPreview ? '更新预览' : '预览';
  const reviewBadgeId = `${studioId}-review-watermark-badge`;
  const isAnonymous = accountStatus === 'anonymous';
  const showReviewBadge = isAnonymous || studioState.mode === 'manual';

  const requestLogin = () => {
    publishLoginRequired({ message: '登录后可提交审核并下载无水印图片。', durationMs: 0 });
  };

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
      <div className="material-studio-review-action">
        {showReviewBadge ? (
          isAnonymous ? (
            <button
              id={reviewBadgeId}
              type="button"
              className="material-studio-review-badge is-login-action"
              title="登录后可提交审核并下载无水印图片"
              onClick={requestLogin}
            >
              登录去水印
            </button>
          ) : (
            <span id={reviewBadgeId} className="material-studio-review-badge">
              去水印需审核
            </span>
          )
        ) : null}
        <button
          type="button"
          className="icon-button"
          aria-label="提交审核"
          aria-describedby={showReviewBadge ? reviewBadgeId : undefined}
          title={
            studioState.mode === 'manual' ? '提交审核；审核通过后可下载无水印图片' : '提交审核'
          }
          disabled={studioState.isBusy}
          onClick={() => requestAction('submit')}
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            publish
          </span>
        </button>
      </div>
      {studioState.canExportProject ? (
        <button
          type="button"
          className="icon-button"
          aria-label="导出工程文件"
          title="导出工程文件"
          disabled={studioState.isBusy}
          onClick={() => requestAction('export-project')}
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            save
          </span>
        </button>
      ) : null}
      <button
        type="button"
        className="icon-button is-primary"
        aria-label="下载图片"
        title="下载图片"
        disabled={studioState.isBusy}
        onClick={() => requestAction('download')}
      >
        <span className="material-symbols-outlined" aria-hidden="true">
          download
        </span>
      </button>
    </div>
  );
}
