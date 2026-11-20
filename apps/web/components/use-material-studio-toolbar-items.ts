'use client';

import { useEffect, useMemo, useState } from 'react';
import { appPath } from '../lib/app-paths';
import { publishLoginRequired } from '../lib/client-auth-events';
import { useI18n } from '../lib/client-i18n';
import {
  requestMaterialStudioAction,
  subscribeMaterialStudioState,
  type MaterialStudioStateChangedPayload,
} from '../lib/client-material-studio-events';
import type { MobileActionRailItem } from './mobile-action-rail';
import type { EditorToolbarOverflowItem } from './editor/editor-toolbar-overflow';

type StudioState = Omit<MaterialStudioStateChangedPayload, 'studioId'>;

type AccountStatus = 'not_configured' | 'anonymous' | 'active' | 'readonly' | 'unavailable';

interface AccountStatusResponse {
  accountStatus?: AccountStatus;
  serverAccountVerified?: boolean;
}

const initialState: StudioState = {
  mode: 'manual',
  transitNetworkSource: 'rmp',
  hasPreview: false,
  isBusy: false,
  canExportProject: false,
  canDownloadWatermarkFree: false,
};

export interface MaterialStudioToolbarBadge {
  id: string;
  label: string;
  title: string;
  /** 匿名用户点击徽标时触发登录。 */
  requiresLogin?: boolean;
}

export interface MaterialStudioToolbarItems {
  items: EditorToolbarOverflowItem[];
  badge?: MaterialStudioToolbarBadge;
  canDownloadWatermarkFree: boolean;
  railItems: MobileActionRailItem[];
  onRequestLogin: () => void;
}

/**
 * 物料工作室的动作清单。
 *
 * 顶栏与统一工作台共用同一份状态订阅、文案与水印判断，
 * 区别只在于渲染成顶栏图标、工具栏胶囊还是移动端侧栏条目。
 */
export function useMaterialStudioToolbarItems(studioId: string): MaterialStudioToolbarItems {
  const [studioState, setStudioState] = useState<StudioState>(initialState);
  const [accountInfo, setAccountInfo] = useState<AccountStatusResponse>({});
  const { t } = useI18n();

  useEffect(
    () =>
      subscribeMaterialStudioState(studioId, ({ studioId: _studioId, ...state }) => {
        setStudioState(state);
      }),
    [studioId],
  );

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

  const items = useMemo<EditorToolbarOverflowItem[]>(() => {
    const result: EditorToolbarOverflowItem[] = [
      {
        id: 'share',
        icon: 'share',
        label: t('materialStudio.share'),
        disabled: studioState.isBusy,
        onClick: () => requestMaterialStudioAction({ studioId, action: 'share' }),
      },
      {
        id: 'history',
        icon: 'history',
        label: t('materialStudio.history'),
        onClick: () => requestMaterialStudioAction({ studioId, action: 'history' }),
      },
      {
        id: 'submit',
        icon: 'publish',
        label: t('materialStudio.submitReview'),
        disabled: studioState.isBusy,
        onClick: () => requestMaterialStudioAction({ studioId, action: 'submit' }),
      },
    ];
    if (studioState.canExportProject) {
      result.push({
        id: 'export-project',
        icon: 'save',
        label: t('materialStudio.exportProject'),
        disabled: studioState.isBusy,
        onClick: () => requestMaterialStudioAction({ studioId, action: 'export-project' }),
      });
    }
    result.push({
      id: 'download',
      icon: 'download',
      label: downloadLabel,
      disabled: studioState.isBusy,
      onClick: () => requestMaterialStudioAction({ studioId, action: 'download' }),
    });
    return result;
  }, [downloadLabel, studioId, studioState, t]);

  const badge: MaterialStudioToolbarBadge | undefined = serverAccountUnverified
    ? {
        id: `${studioId}-server-unverified`,
        label: t('materialStudio.serverUnverified'),
        title: t('materialStudio.serverUnverifiedHint'),
      }
    : showReviewBadge
      ? isAnonymous
        ? {
            id: `${studioId}-login`,
            label: t('materialStudio.loginRemoveWatermark'),
            title: t('materialStudio.loginRequired'),
            requiresLogin: true,
          }
        : {
            id: `${studioId}-review`,
            label: t('materialStudio.reviewRequired'),
            title: t('materialStudio.submitReviewManualHint'),
          }
      : undefined;

  const railItems = useMemo<MobileActionRailItem[]>(
    () =>
      items.map((item, index) => ({
        id: `rail-${studioId}-${item.id}`,
        group: 'top',
        order: 100 + index,
        priority: 40 + index,
        label: item.label,
        icon: item.icon,
        busy: studioState.isBusy,
        onClick: item.onClick,
      })),
    [items, studioId, studioState.isBusy],
  );

  return {
    items,
    badge,
    canDownloadWatermarkFree: studioState.canDownloadWatermarkFree,
    railItems,
    onRequestLogin: () =>
      publishLoginRequired({ message: t('materialStudio.loginRequired'), durationMs: 0 }),
  };
}
