'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { appPath } from '../lib/app-paths';
import { mobileActionRailMediaQuery } from '../lib/client-mobile-action-rail';
import { publishLoginRequired } from '../lib/client-auth-events';
import {
  requestMaterialStudioAction,
  subscribeMaterialStudioActionBlocked,
  subscribeMaterialStudioState,
  type MaterialStudioStateChangedPayload,
} from '../lib/client-material-studio-events';
import { publishToastRequested } from '../lib/client-toast-events';
import { useI18n } from '../lib/client-i18n';
import { useMobileActionRail, type MobileActionRailItem } from './mobile-action-rail';

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
  canDownloadWatermarkFree: false,
};

export function MaterialStudioTopbarActions({ studioId }: Readonly<{ studioId: string }>) {
  const [studioState, setStudioState] = useState(initialState);
  const [accountInfo, setAccountInfo] = useState<AccountStatusResponse>({});
  const [isMobile, setIsMobile] = useState(false);
  const { t } = useI18n();
  const mobileActionRail = useMobileActionRail();

  useEffect(() => {
    const mediaQuery = window.matchMedia(mobileActionRailMediaQuery);
    setIsMobile(mediaQuery.matches);
    const handleChange = () => setIsMobile(mediaQuery.matches);
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

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
  const previewLabel = studioState.hasPreview
    ? t('materialStudio.updatePreview')
    : t('materialStudio.preview');
  const reviewBadgeId = `${studioId}-review-watermark-badge`;
  const isAnonymous = accountInfo.accountStatus === 'anonymous';
  const serverAccountUnverified =
    studioState.mode === 'server' &&
    studioState.transitNetworkSource === 'server' &&
    accountInfo.accountStatus === 'active' &&
    accountInfo.serverAccountVerified !== true;
  const showReviewBadge =
    !studioState.canDownloadWatermarkFree &&
    (isAnonymous || studioState.mode === 'manual' || serverAccountUnverified);
  const hasVerifiedAccount =
    accountInfo.accountStatus === 'active' && accountInfo.serverAccountVerified === true;
  const downloadLabel = studioState.canDownloadWatermarkFree
    ? hasVerifiedAccount
      ? t('materialStudio.downloadWatermarkFree')
      : t('materialStudio.downloadCleanStandard')
    : t('materialStudio.download');

  const railItems = useMemo<MobileActionRailItem[]>(() => {
    if (!mobileActionRail?.enabled) {
      return [];
    }

    const items: MobileActionRailItem[] = [
      {
        id: `rail-${studioId}-history`,
        group: 'top',
        order: 100,
        priority: 40,
        label: t('materialStudio.history'),
        icon: 'history',
        busy: studioState.isBusy,
        onClick: () => requestMaterialStudioAction({ studioId, action: 'history' }),
      },
      {
        id: `rail-${studioId}-preview`,
        group: 'top',
        order: 110,
        priority: 41,
        label: previewLabel,
        icon: studioState.hasPreview ? 'refresh' : 'visibility',
        busy: studioState.isBusy,
        onClick: () => requestMaterialStudioAction({ studioId, action: 'preview' }),
      },
      {
        id: `rail-${studioId}-submit`,
        group: 'top',
        order: 120,
        priority: 42,
        label: t('materialStudio.submitReview'),
        icon: 'publish',
        busy: studioState.isBusy,
        onClick: () => requestMaterialStudioAction({ studioId, action: 'submit' }),
      },
    ];

    if (studioState.canExportProject) {
      items.push({
        id: `rail-${studioId}-export`,
        group: 'top',
        order: 130,
        priority: 43,
        label: t('materialStudio.exportProject'),
        icon: 'save',
        busy: studioState.isBusy,
        onClick: () => requestMaterialStudioAction({ studioId, action: 'export-project' }),
      });
    }

    items.push({
      id: `rail-${studioId}-download`,
      group: 'top',
      order: 140,
      priority: 44,
      label: downloadLabel,
      icon: 'download',
      busy: studioState.isBusy,
      emphasis: true,
      onClick: () => requestMaterialStudioAction({ studioId, action: 'download' }),
    });

    return items;
  }, [downloadLabel, mobileActionRail?.enabled, previewLabel, studioId, studioState, t]);

  useEffect(() => {
    if (!mobileActionRail) {
      return;
    }
    mobileActionRail.registerItems(`material-studio-${studioId}`, railItems);
  }, [mobileActionRail, railItems, studioId]);

  if (mobileActionRail?.enabled) {
    return null;
  }

  const requestLogin = () => {
    publishLoginRequired({ message: t('materialStudio.loginRequired'), durationMs: 0 });
  };

  const actions = (
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
        className={`icon-button is-primary${
          studioState.canDownloadWatermarkFree ? ' material-watermark-free-download' : ''
        }`}
        aria-label={downloadLabel}
        title={downloadLabel}
        disabled={studioState.isBusy}
        onClick={() => requestAction('download')}
      >
        <span className="material-symbols-outlined" aria-hidden="true">
          download
        </span>
        {studioState.canDownloadWatermarkFree ? (
          <span className="material-watermark-free-download-text">
            {t('materialStudio.downloadWatermarkFree')}
          </span>
        ) : null}
      </button>
    </div>
  );

  // 移动端未启用侧边栏时，工具栏是右下角浮动药丸；顶栏的 backdrop-filter 会
  // 成为 fixed 子元素的包含块，必须把它挂到 body 上才能相对视口定位。
  if (isMobile && !mobileActionRail?.enabled) {
    return createPortal(actions, document.body);
  }

  return actions;
}
