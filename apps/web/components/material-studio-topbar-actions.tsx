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
import { useI18n } from '../lib/client-i18n';

type AccountStatus = 'not_configured' | 'anonymous' | 'active' | 'readonly' | 'unavailable';

interface AccountStatusResponse {
  accountStatus?: AccountStatus;
  serverAccountVerified?: boolean;
}

const initialState: Omit<MaterialStudioStateChangedPayload, 'studioId'> = {
  mode: 'manual',
  transitNetworkSource: 'rmp',
  hasPreview: false,
  isBusy: false,
  canExportProject: false,
};

export function MaterialStudioTopbarActions({ studioId }: Readonly<{ studioId: string }>) {
  const [studioState, setStudioState] = useState(initialState);
  const [accountInfo, setAccountInfo] = useState<AccountStatusResponse>({});
  const { t } = useI18n();

  useEffect(() => {
    let cancelled = false;
    void fetch(appPath('/api/account/status'), { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) return undefined;
        return (await response.json()) as AccountStatusResponse;
      })
      .then((payload) => {
        if (!cancelled) setAccountInfo(payload ?? {});
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

  const requestAction = (
    action: 'preview' | 'submit' | 'download' | 'export-project' | 'history',
  ) => {
    requestMaterialStudioAction({ studioId, action });
  };
  const previewLabel = studioState.hasPreview ? t('materialStudio.updatePreview') : t('materialStudio.preview');
  const reviewBadgeId = `${studioId}-review-watermark-badge`;
  const isAnonymous = accountInfo.accountStatus === 'anonymous';
  const serverAccountUnverified =
    studioState.mode === 'server' &&
    studioState.transitNetworkSource === 'server' &&
    accountInfo.accountStatus === 'active' &&
    accountInfo.serverAccountVerified !== true;
  const showReviewBadge = isAnonymous || studioState.mode === 'manual' || serverAccountUnverified;

  const requestLogin = () => {
    publishLoginRequired({ message: t('materialStudio.loginRequired'), durationMs: 0 });
  };

  return (
    <div className="topbar-actions material-studio-topbar-actions">
      <button
        type="button"
        className="icon-button"
        aria-label={t('materialStudio.history')}
        title={t('materialStudio.history')}
        onClick={() => requestAction('history')}
      >
        <span className="material-symbols-outlined" aria-hidden="true">
          history
        </span>
      </button>
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
        {serverAccountUnverified ? (
          <span
            id={reviewBadgeId}
            className="material-studio-review-badge"
            title={t('materialStudio.serverUnverifiedHint')}
          >
            {t('materialStudio.serverUnverified')}
          </span>
        ) : showReviewBadge ? (
          isAnonymous ? (
            <button
              id={reviewBadgeId}
              type="button"
              className="material-studio-review-badge is-login-action"
              title={t('materialStudio.loginRequired')}
              onClick={requestLogin}
            >
              {t('materialStudio.loginRemoveWatermark')}
            </button>
          ) : (
            <span id={reviewBadgeId} className="material-studio-review-badge">
              {t('materialStudio.reviewRequired')}
            </span>
          )
        ) : null}
        <button
          type="button"
          className="icon-button"
          aria-label={t('materialStudio.submitReview')}
          aria-describedby={showReviewBadge ? reviewBadgeId : undefined}
          title={
            studioState.mode === 'manual'
              ? t('materialStudio.submitReviewManualHint')
              : t('materialStudio.submitReview')
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
          aria-label={t('materialStudio.exportProject')}
          title={t('materialStudio.exportProject')}
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
        aria-label={t('materialStudio.download')}
        title={t('materialStudio.download')}
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
