'use client';

import type {
  ApiItemResponse,
  ApiListResponse,
  LocaleCode,
  LocalePreference,
  RectangleBounds,
  TicketOrderListItem,
  TripReminder,
  YctAccountSessionSnapshot,
} from '@yct/contracts';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import {
  calculateBoundsArea,
  createOfflinePackage,
  deleteOfflinePackage,
  formatBounds,
  mergeOfflinePackagesFromAccount,
  offlinePackageStatusLabel,
  readOfflinePackageState,
  updateOfflinePackageStatus,
  type AccountOfflinePackageRequest,
  type OfflinePackageRecord,
  type OfflinePackageState,
} from '../lib/client-offline-packages';
import {
  clearTravelScheduleHistory,
  readTravelScheduleHistoryState,
  type TravelScheduleHistoryState,
} from '../lib/client-schedule-history';
import {
  clearLocalTripReminders,
  grantLegacyTripReminderSyncConsent,
  hasLegacyTripReminderSyncConsent,
  markTripRemindersSynced,
  markTripRemindersUnsynced,
  mergeTripRemindersFromAccount,
  readTripReminderState,
  revokeLegacyTripReminderSyncConsent,
  type TripReminderState,
} from '../lib/client-trip-reminders';
import {
  type AccentMode,
  type MotionMode,
  type ThemeMode,
  applyAccentMode,
  applyMotionMode,
  applyThemeMode,
  readAccentMode,
  readMotionMode,
  readThemeMode,
} from './preference-bridge';
import { appPath } from '../lib/app-paths';
import {
  clearMapFavoriteMarkers,
  readMapFavoriteState,
  syncMapFavoritesWithAccount,
  type MapFavoriteState,
} from '../lib/client-map-favorites';
import {
  fetchServerLocalePreference,
  readLocalLocalePreference,
  updateServerLocalePreference,
  writeLocalLocalePreference,
  type ClientLocalePreferenceState,
} from '../lib/client-locale-preference';
import { useI18n, type CommonMessageKey } from '../lib/client-i18n';
import { notifyTicketOrderStateChanged } from '../lib/client-ticket-orders';
import { TicketOrderDraftPanel } from './ticket-order-draft-panel';

const themeOptionKeys: Array<{ value: ThemeMode; labelKey: CommonMessageKey }> = [
  { value: 'system', labelKey: 'settings.theme.system' },
  { value: 'light', labelKey: 'settings.theme.light' },
  { value: 'dark', labelKey: 'settings.theme.dark' },
];

const accentOptionKeys: Array<{ value: AccentMode; labelKey: CommonMessageKey }> = [
  { value: 'ldpass', labelKey: 'settings.accent.ldpass' },
  { value: 'green', labelKey: 'settings.accent.green' },
  { value: 'red', labelKey: 'settings.accent.red' },
  { value: 'gray', labelKey: 'settings.accent.gray' },
];

const motionOptionKeys: Array<{ value: MotionMode; labelKey: CommonMessageKey }> = [
  { value: 'system', labelKey: 'settings.motion.system' },
  { value: 'full', labelKey: 'settings.motion.full' },
  { value: 'reduced', labelKey: 'settings.motion.reduced' },
];

const localeOptionKeys: Array<{ value: LocalePreference; labelKey: CommonMessageKey }> = [
  { value: 'system', labelKey: 'settings.language.system' },
  { value: 'zh-CN', labelKey: 'settings.language.zhCN' },
  { value: 'zh-Hant', labelKey: 'settings.language.zhHant' },
  { value: 'en', labelKey: 'settings.language.en' },
];

type PwaInstallStatus = 'checking' | 'installed' | 'installable' | 'manual' | 'unsupported';
type NotificationTypeKey = 'trip_reminder' | 'operations' | 'ticket' | 'checkin';
type ServerPushNotificationType = 'trip' | 'operations' | 'ticket' | 'check_in';
type NotificationTypePreferences = Record<NotificationTypeKey, boolean>;

const notificationTypePreferenceKey = 'yct.notifications.types.v1';
const pushSubscriptionEndpointKey = 'yct.pushSubscription.endpoint';
const webPushPublicKey = process.env.NEXT_PUBLIC_YCT_WEB_PUSH_PUBLIC_KEY?.trim() ?? '';
const notificationTypeOptions: Array<{
  key: NotificationTypeKey;
  label: string;
  description: string;
  icon: string;
}> = [
  {
    key: 'trip_reminder',
    label: '行程提醒',
    description: '出发、到站、历史行程相关提醒',
    icon: 'event_upcoming',
  },
  {
    key: 'operations',
    label: '运营提醒',
    description: '公告、线路调整和运营状态',
    icon: 'campaign',
  },
  {
    key: 'ticket',
    label: '票务状态',
    description: '订票、退票和票券状态变化',
    icon: 'confirmation_number',
  },
  {
    key: 'checkin',
    label: '检票提醒',
    description: '检票、核销和乘车码相关提醒',
    icon: 'qr_code_scanner',
  },
];

const notificationTypeToServerType: Record<NotificationTypeKey, ServerPushNotificationType> = {
  trip_reminder: 'trip',
  operations: 'operations',
  ticket: 'ticket',
  checkin: 'check_in',
};

const defaultServerNotificationTypes = parseDefaultServerNotificationTypes(
  process.env.NEXT_PUBLIC_YCT_PUSH_DEFAULT_ENABLED_TYPES,
);
const defaultNotificationTypePreferences: NotificationTypePreferences = {
  trip_reminder: defaultServerNotificationTypes.has('trip'),
  operations: defaultServerNotificationTypes.has('operations'),
  ticket: defaultServerNotificationTypes.has('ticket'),
  checkin: defaultServerNotificationTypes.has('check_in'),
};

const emptyOfflinePackageDraft = {
  name: '',
  minX: '',
  minZ: '',
  maxX: '',
  maxZ: '',
};

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
}

interface NavigatorWithStandalone extends Navigator {
  standalone?: boolean;
}

function parseDefaultServerNotificationTypes(
  value: string | undefined,
): Set<ServerPushNotificationType> {
  const allTypes: ServerPushNotificationType[] = ['trip', 'operations', 'ticket', 'check_in'];
  const trimmed = value?.trim();
  if (!trimmed) {
    return new Set(allTypes);
  }

  const validTypes = new Set<ServerPushNotificationType>(allTypes);
  const parsed = trimmed
    .split(',')
    .map((item) => item.trim())
    .filter((item): item is ServerPushNotificationType =>
      validTypes.has(item as ServerPushNotificationType),
    );

  return parsed.length > 0 ? new Set(parsed) : new Set(allTypes);
}

type AuthStatus =
  | 'login_success'
  | 'readonly'
  | 'logged_out'
  | 'state_invalid'
  | 'session_unavailable'
  | 'session_error'
  | 'ldpass_not_configured';

export function AccountSettingsPanel({
  auth,
}: Readonly<{
  auth: {
    ldpassConfigured: boolean;
    ldpassBaseUrl?: string;
    status?: AuthStatus;
    session?: YctAccountSessionSnapshot;
  };
}>) {
  const { t } = useI18n();
  const ticketOrderLockedText = auth.session?.readonlyUser
    ? '账号为只读状态，Active 后可查看订单草稿。'
    : '登录后可查看订单草稿。';
  const themeOptions = useMemo(
    () =>
      themeOptionKeys.map((option) => ({
        value: option.value,
        label: t(option.labelKey),
      })),
    [t],
  );
  const accentOptions = useMemo(
    () =>
      accentOptionKeys.map((option) => ({
        value: option.value,
        label: t(option.labelKey),
      })),
    [t],
  );
  const motionOptions = useMemo(
    () =>
      motionOptionKeys.map((option) => ({
        value: option.value,
        label: t(option.labelKey),
      })),
    [t],
  );
  const localeOptions = useMemo(
    () =>
      localeOptionKeys.map((option) => ({
        value: option.value,
        label: t(option.labelKey),
      })),
    [t],
  );
  const [themeMode, setThemeMode] = useState<ThemeMode>('system');
  const [accentMode, setAccentMode] = useState<AccentMode>('ldpass');
  const [motionMode, setMotionMode] = useState<MotionMode>('system');
  const [localeMode, setLocaleMode] = useState<LocalePreference>('system');
  const [localeStatusState, setLocaleStatusState] = useState<ClientLocalePreferenceState | null>(
    null,
  );
  const [localeStatusFallbackKey, setLocaleStatusFallbackKey] =
    useState<CommonMessageKey | null>(null);
  const localeStatusText = localeStatusFallbackKey
    ? t(localeStatusFallbackKey)
    : localeStatusState
      ? formatLocaleStatus(localeStatusState, t)
      : '';
  const [notificationEnabled, setNotificationEnabled] = useState(false);
  const [pushDeviceStatusText, setPushDeviceStatusText] = useState('');
  const [isSyncingPushDevice, setIsSyncingPushDevice] = useState(false);
  const [notificationTypes, setNotificationTypes] = useState<NotificationTypePreferences>(
    defaultNotificationTypePreferences,
  );
  const [quietStart, setQuietStart] = useState('23:00');
  const [quietEnd, setQuietEnd] = useState('07:00');
  const [installStatus, setInstallStatus] = useState<PwaInstallStatus>('checking');
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [cacheStatusText, setCacheStatusText] = useState('正在检查');
  const [tripSummary, setTripSummary] = useState<TripReminderState['summary'] | null>(null);
  const [scheduleHistorySummary, setScheduleHistorySummary] = useState<
    TravelScheduleHistoryState['summary'] | null
  >(null);
  const [mapFavoriteSummary, setMapFavoriteSummary] = useState<MapFavoriteState['summary'] | null>(
    null,
  );
  const [tripSyncStatusText, setTripSyncStatusText] = useState('');
  const [isSyncingTripReminders, setIsSyncingTripReminders] = useState(false);
  const [legacyTripSyncConsentGranted, setLegacyTripSyncConsentGranted] = useState(false);
  const [isRevokingLegacyTripSyncConsent, setIsRevokingLegacyTripSyncConsent] = useState(false);
  const [offlinePackageState, setOfflinePackageState] = useState<OfflinePackageState | null>(null);
  const [offlinePackageDraft, setOfflinePackageDraft] = useState(emptyOfflinePackageDraft);
  const [offlinePackageFormOpen, setOfflinePackageFormOpen] = useState(false);
  const [offlinePackageError, setOfflinePackageError] = useState('');
  const [refreshingPackageId, setRefreshingPackageId] = useState<string | null>(null);
  const [ticketOrders, setTicketOrders] = useState<TicketOrderListItem[] | null>(null);
  const [ticketOrderStatusText, setTicketOrderStatusText] = useState(
    auth.session?.user ? '正在读取订单草稿' : ticketOrderLockedText,
  );
  const [cancellingTicketOrderId, setCancellingTicketOrderId] = useState<string | null>(null);
  const syncTripSummary = () => {
    setTripSummary(readTripReminderState().summary);
    setScheduleHistorySummary(readTravelScheduleHistoryState().summary);
    setMapFavoriteSummary(readMapFavoriteState().summary);
  };
  const syncOfflinePackageState = () => {
    setOfflinePackageState(readOfflinePackageState());
  };
  const refreshTicketOrders = async () => {
    if (!auth.session?.user) {
      setTicketOrders([]);
      setTicketOrderStatusText(ticketOrderLockedText);
      return;
    }

    setTicketOrderStatusText('正在读取订单草稿');
    try {
      const response = await fetch(appPath('/api/travel/ticketing/orders'), { cache: 'no-store' });
      const data = (await response.json()) as Partial<ApiListResponse<TicketOrderListItem>> & {
        message?: string;
      };

      if (response.status === 401) {
        setTicketOrders([]);
        setTicketOrderStatusText('登录后可查看订单草稿。');
        return;
      }

      if (!response.ok || !data.items) {
        throw new Error(data.message ?? '订单草稿读取失败');
      }

      setTicketOrders(data.items);
      setTicketOrderStatusText(data.items.length > 0 ? '' : '暂无订单草稿。');
    } catch (error) {
      setTicketOrders([]);
      setTicketOrderStatusText(error instanceof Error ? error.message : '订单草稿读取失败');
    }
  };
  const cancelTicketOrder = async (orderId: string) => {
    if (!window.confirm('要取消这个订单草稿并释放库存占用吗？')) {
      return;
    }

    setCancellingTicketOrderId(orderId);
    setTicketOrderStatusText('正在取消订单草稿');
    try {
      const response = await fetch(
        appPath(`/api/travel/ticketing/orders/${encodeURIComponent(orderId)}/cancel`),
        { method: 'POST' },
      );
      const data = (await response.json()) as Partial<ApiItemResponse<TicketOrderListItem>> & {
        message?: string;
      };

      if (!response.ok || !data.item) {
        throw new Error(data.message ?? '订单草稿取消失败');
      }

      setTicketOrderStatusText('已取消订单草稿');
      await refreshTicketOrders();
      notifyTicketOrderStateChanged();
    } catch (error) {
      setTicketOrderStatusText(error instanceof Error ? error.message : '订单草稿取消失败');
    } finally {
      setCancellingTicketOrderId(null);
    }
  };
  const applyLocalePreferenceState = (preference: ClientLocalePreferenceState) => {
    setLocaleMode(preference.locale);
    document.documentElement.lang = preference.resolvedLocale;
  };

  useEffect(() => {
    setThemeMode(readThemeMode());
    setAccentMode(readAccentMode());
    setMotionMode(readMotionMode());
    const localLocalePreference = readLocalLocalePreference();
    applyLocalePreferenceState(localLocalePreference);
    setLocaleStatusState(localLocalePreference);
    setLocaleStatusFallbackKey(null);
    setNotificationEnabled(window.localStorage.getItem('yct.notifications.enabled') === 'true');
    setNotificationTypes(readNotificationTypePreferences());
    setQuietStart(window.localStorage.getItem('yct.notifications.quietStart') ?? '23:00');
    setQuietEnd(window.localStorage.getItem('yct.notifications.quietEnd') ?? '07:00');
    setLegacyTripSyncConsentGranted(hasLegacyTripReminderSyncConsent());
    syncTripSummary();
    syncOfflinePackageState();
    if (auth.session?.user) {
      void refreshTicketOrders();

      void fetchServerLocalePreference()
        .then((preference) => {
          if (!preference) {
            return;
          }

          const localPreference = writeLocalLocalePreference(preference.locale);
          applyLocalePreferenceState({
            ...localPreference,
            resolvedLocale: preference.resolvedLocale,
            updatedAt: preference.updatedAt,
            source: 'server',
          });
          setLocaleStatusState(preference);
          setLocaleStatusFallbackKey(null);
        })
        .catch(() => undefined);

      void syncMapFavoritesWithAccount()
        .then((state) => {
          setMapFavoriteSummary(state.summary);
        })
        .catch(() => undefined);

      void readServerTripReminders()
        .then((reminders) => {
          if (reminders.length === 0) {
            return;
          }

          mergeTripRemindersFromAccount(reminders);
          setTripSyncStatusText(`已载入账号中的 ${reminders.length} 个提醒`);
          syncTripSummary();
        })
        .catch(() => undefined);

      void readServerPushPreference()
        .then((preference) => {
          const nextTypes = notificationTypeOptions.reduce<NotificationTypePreferences>(
            (current, option) => ({
              ...current,
              [option.key]: preference.enabledTypes.includes(
                notificationTypeToServerType[option.key],
              ),
            }),
            { ...defaultNotificationTypePreferences },
          );
          setNotificationEnabled(preference.enabled);
          setNotificationTypes(nextTypes);
          setQuietStart(preference.quietHours.startTime);
          setQuietEnd(preference.quietHours.endTime);
          window.localStorage.setItem('yct.notifications.enabled', String(preference.enabled));
          writeNotificationTypePreferences(nextTypes);
          window.localStorage.setItem(
            'yct.notifications.quietStart',
            preference.quietHours.startTime,
          );
          window.localStorage.setItem('yct.notifications.quietEnd', preference.quietHours.endTime);
          if (preference.enabled && hasGrantedNotificationPermission()) {
            void syncBrowserPushDevice(true);
          }
        })
        .catch(() => undefined);

      void readServerOfflinePackageRequests()
        .then((requests) => {
          if (requests.length === 0) {
            return;
          }

          setOfflinePackageState(mergeOfflinePackagesFromAccount(requests));
        })
        .catch(() => undefined);
    } else {
      setTicketOrders([]);
      setTicketOrderStatusText(ticketOrderLockedText);
    }

    setInstallStatus(readPwaInstallStatus());
    void refreshPwaCacheStatus(setCacheStatusText);

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
      setInstallStatus('installable');
    };

    const handleAppInstalled = () => {
      setInstallPrompt(null);
      setInstallStatus('installed');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const updateThemeMode = (mode: ThemeMode) => {
    setThemeMode(mode);
    applyThemeMode(mode);
  };

  const updateAccentMode = (mode: AccentMode) => {
    setAccentMode(mode);
    applyAccentMode(mode);
  };

  const updateMotionMode = (mode: MotionMode) => {
    setMotionMode(mode);
    applyMotionMode(mode);
  };

  const updateLocaleMode = (locale: LocalePreference) => {
    const localPreference = writeLocalLocalePreference(locale);
    applyLocalePreferenceState(localPreference);
    setLocaleStatusState(localPreference);
    setLocaleStatusFallbackKey(null);

    if (!auth.session?.user) {
      return;
    }

    void updateServerLocalePreference(locale)
      .then((preference) => {
        applyLocalePreferenceState(preference);
        setLocaleStatusState(preference);
        setLocaleStatusFallbackKey(null);
      })
      .catch(() => {
        setLocaleStatusFallbackKey('settings.language.savedLocal');
      });
  };

  const updateNotificationEnabled = (enabled: boolean) => {
    setNotificationEnabled(enabled);
    window.localStorage.setItem('yct.notifications.enabled', String(enabled));
    syncServerPushPreference({
      enabled,
      preferences: notificationTypes,
      quietStart,
      quietEnd,
    });
    if (auth.session?.user) {
      void syncBrowserPushDevice(enabled);
    } else if (enabled) {
      setPushDeviceStatusText('登录后可把本设备加入服务端 Push 订阅');
    } else {
      setPushDeviceStatusText('');
    }
  };

  const syncBrowserPushDevice = async (enabled: boolean) => {
    if (!auth.session?.user) {
      return;
    }

    setIsSyncingPushDevice(true);
    setPushDeviceStatusText(enabled ? '正在登记本设备 Push 订阅' : '正在撤销本设备 Push 订阅');
    try {
      if (enabled) {
        const endpoint = await ensureBrowserPushSubscription();
        setPushDeviceStatusText(`本设备已加入 Push 订阅：${readEndpointHost(endpoint)}`);
      } else {
        const revoked = await revokeBrowserPushSubscription();
        setPushDeviceStatusText(revoked ? '已撤销本设备 Push 订阅' : '已关闭通知偏好');
      }
    } catch (error) {
      setPushDeviceStatusText(error instanceof Error ? error.message : '本设备 Push 订阅同步失败');
    } finally {
      setIsSyncingPushDevice(false);
    }
  };

  const updateNotificationType = (key: NotificationTypeKey, enabled: boolean) => {
    setNotificationTypes((current) => {
      const next = {
        ...current,
        [key]: enabled,
      };
      writeNotificationTypePreferences(next);
      syncServerPushPreference({
        enabled: notificationEnabled,
        preferences: next,
        quietStart,
        quietEnd,
      });
      return next;
    });
  };

  const updateQuietStart = (value: string) => {
    setQuietStart(value);
    window.localStorage.setItem('yct.notifications.quietStart', value);
    syncServerPushPreference({
      enabled: notificationEnabled,
      preferences: notificationTypes,
      quietStart: value,
      quietEnd,
    });
  };

  const updateQuietEnd = (value: string) => {
    setQuietEnd(value);
    window.localStorage.setItem('yct.notifications.quietEnd', value);
    syncServerPushPreference({
      enabled: notificationEnabled,
      preferences: notificationTypes,
      quietStart,
      quietEnd: value,
    });
  };

  const installPwa = async () => {
    if (installPrompt) {
      await installPrompt.prompt();
      await installPrompt.userChoice.catch(() => undefined);
      setInstallPrompt(null);
      setInstallStatus(readPwaInstallStatus());
      return;
    }

    setInstallStatus(readPwaInstallStatus());
  };

  const warmPwaCache = async () => {
    setCacheStatusText('正在刷新');
    await warmAppShellCache();
    await refreshPwaCacheStatus(setCacheStatusText);
  };

  const clearPwaCache = async () => {
    setCacheStatusText('正在清理');
    await clearYctCaches();
    await refreshPwaCacheStatus(setCacheStatusText);
  };

  const updateOfflinePackageDraft = (key: keyof typeof offlinePackageDraft, value: string) => {
    setOfflinePackageDraft((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const submitOfflinePackage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setOfflinePackageError('');

    const bounds = parseOfflinePackageBounds(offlinePackageDraft);
    if (!offlinePackageDraft.name.trim()) {
      setOfflinePackageError('请给这个离线范围起一个名称。');
      return;
    }

    if (!bounds) {
      setOfflinePackageError('请输入有效的 Minecraft X/Z 矩形坐标。');
      return;
    }

    if (calculateBoundsArea(bounds) <= 0) {
      setOfflinePackageError('离线范围需要同时具有宽度和高度。');
      return;
    }

    const offlinePackage = createOfflinePackage({
      name: offlinePackageDraft.name,
      bounds,
    });
    setOfflinePackageDraft(emptyOfflinePackageDraft);
    setOfflinePackageFormOpen(false);
    syncOfflinePackageState();
    if (auth.session?.user) {
      void requestServerOfflinePackage(offlinePackage)
        .then(() => {
          updateOfflinePackageStatus(offlinePackage.packageId, 'server_requested');
          syncOfflinePackageState();
        })
        .catch((error) => {
          updateOfflinePackageStatus(
            offlinePackage.packageId,
            'request_failed',
            error instanceof Error ? error.message : '服务端离线包请求失败',
          );
          syncOfflinePackageState();
        });
    }
  };

  const syncServerPushPreference = (input: {
    enabled: boolean;
    preferences: NotificationTypePreferences;
    quietStart: string;
    quietEnd: string;
  }) => {
    if (!auth.session?.user) {
      return;
    }

    void writeServerPushPreference(input).catch(() => undefined);
  };

  const refreshOfflinePackage = async (offlinePackage: OfflinePackageRecord) => {
    setRefreshingPackageId(offlinePackage.packageId);
    setCacheStatusText('正在刷新离线范围基础数据');
    try {
      if (auth.session?.user) {
        await requestServerOfflinePackage(offlinePackage);
      }
      await warmOfflinePackageCache();
      updateOfflinePackageStatus(offlinePackage.packageId, 'base_cache_refreshed');
      await refreshPwaCacheStatus(setCacheStatusText);
    } catch (error) {
      updateOfflinePackageStatus(
        offlinePackage.packageId,
        'refresh_failed',
        error instanceof Error ? error.message : '刷新失败',
      );
      setCacheStatusText('离线范围基础数据刷新失败');
    } finally {
      setRefreshingPackageId(null);
      syncOfflinePackageState();
    }
  };

  const removeOfflinePackage = async (offlinePackage: OfflinePackageRecord) => {
    if (!window.confirm(`要删除离线范围“${offlinePackage.name}”吗？`)) {
      return;
    }

    deleteOfflinePackage(offlinePackage.packageId);
    syncOfflinePackageState();
    if (auth.session?.user) {
      try {
        await deleteServerOfflinePackageRequest(offlinePackage.packageId);
        setCacheStatusText('已删除本机与账号中的离线范围请求');
      } catch {
        setCacheStatusText('已删除本机离线范围，账号侧请求删除失败');
      }
    }
  };

  const clearLocalHistory = () => {
    if (
      !window.confirm(
        '要清空雨城通新版本地行程提醒、历史记录、班次查询记录和地图收藏吗？旧站 orders 原始数据不会被删除。',
      )
    ) {
      return;
    }

    clearLocalTripReminders();
    clearTravelScheduleHistory();
    clearMapFavoriteMarkers();
    setTripSyncStatusText('');
    syncTripSummary();
  };

  const revokeLegacyTripSyncConsent = async () => {
    const canDeleteAccountCopies = Boolean(auth.session?.user);
    if (
      !window.confirm(
        canDeleteAccountCopies
          ? '撤销后，会删除账号中由旧站 orders 同步来的提醒副本，并保留本机旧站记录。后续同步账号时会再次询问。'
          : '撤销后，后续同步账号时会再次询问是否同步旧站 orders 导入的记录。',
      )
    ) {
      return;
    }

    revokeLegacyTripReminderSyncConsent();
    setLegacyTripSyncConsentGranted(false);
    if (!canDeleteAccountCopies) {
      setTripSyncStatusText('已撤销旧站记录同步同意');
      return;
    }

    setIsRevokingLegacyTripSyncConsent(true);
    setTripSyncStatusText('正在删除账号中的旧站提醒副本');
    try {
      const result = await deleteServerTripReminderCopies({ source: 'legacy_order' });
      markTripRemindersUnsynced({ source: 'legacy_order' });
      syncTripSummary();
      setTripSyncStatusText(
        result.deletedCount > 0
          ? `已撤销旧站记录同步同意，并删除 ${result.deletedCount} 个账号侧旧站提醒副本`
          : '已撤销旧站记录同步同意，账号中没有需要删除的旧站提醒副本',
      );
    } catch (error) {
      setTripSyncStatusText(
        error instanceof Error
          ? `已撤销本地同意，账号副本删除失败：${error.message}`
          : '已撤销本地同意，账号副本删除失败',
      );
    } finally {
      setIsRevokingLegacyTripSyncConsent(false);
    }
  };

  const syncTripRemindersToAccount = async () => {
    if (!auth.session?.user) {
      return;
    }

    const unsyncedReminders = readTripReminderState().reminders.filter(
      (reminder) => !reminder.syncedAt,
    );
    const legacyReminders = unsyncedReminders.filter(
      (reminder) => reminder.source === 'legacy_order',
    );
    const regularReminders = unsyncedReminders.filter(
      (reminder) => reminder.source !== 'legacy_order',
    );
    let reminders = unsyncedReminders;

    if (legacyReminders.length > 0 && !legacyTripSyncConsentGranted) {
      const accepted = window.confirm(
        `这次同步包含 ${legacyReminders.length} 条从旧站 orders 只读导入的记录。同步后它们只会作为账号侧行程提醒快照，不代表新版票务订单、票券或核销凭证。是否同意同步这些旧站记录？`,
      );

      if (accepted) {
        grantLegacyTripReminderSyncConsent();
        setLegacyTripSyncConsentGranted(true);
      } else {
        reminders = regularReminders;
        if (reminders.length === 0) {
          setTripSyncStatusText('已保留旧站记录在本机，未同步到账号');
          return;
        }
      }
    }

    if (reminders.length === 0) {
      setTripSyncStatusText('没有需要同步的提醒');
      return;
    }

    setIsSyncingTripReminders(true);
    setTripSyncStatusText('正在同步提醒');
    try {
      const response = await fetch(appPath('/api/account/trip-reminders'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reminders }),
      });
      const data = (await response.json()) as {
        reminders?: TripReminder[];
        syncedAt?: string;
        message?: string;
      };

      if (!response.ok || !data.syncedAt) {
        throw new Error(data.message ?? '行程提醒同步失败');
      }

      const syncedUserId = data.reminders?.find((reminder) => reminder.userId)?.userId;
      markTripRemindersSynced({
        reminderIds: reminders.map((reminder) => reminder.id),
        userId: syncedUserId ?? `yct_user_${auth.session.user.ldpassUserId}`,
        syncedAt: data.syncedAt,
      });
      const skippedLegacyCount = unsyncedReminders.length - reminders.length;
      setTripSyncStatusText(
        skippedLegacyCount > 0
          ? `已同步 ${reminders.length} 个提醒，保留 ${skippedLegacyCount} 条旧站记录在本机`
          : `已同步 ${reminders.length} 个提醒`,
      );
      syncTripSummary();
    } catch (error) {
      setTripSyncStatusText(error instanceof Error ? error.message : '行程提醒同步失败');
    } finally {
      setIsSyncingTripReminders(false);
    }
  };

  const notificationMasterStatus = notificationEnabled ? '推送开启' : '推送关闭';
  const notificationMasterLabel = `本设备推送总开关，当前${notificationEnabled ? '已开启' : '已关闭'}`;
  const ticketDraftCount =
    ticketOrders?.filter((item) => item.order.status === 'draft' || item.order.status === 'pending_issue')
      .length ?? 0;

  return (
    <section className="module-panel" aria-labelledby="account-title">
      <div className="section-heading">
        <h1 id="account-title" className="sr-only">
          {t('account.settings')}
        </h1>
        <span className="muted">
          {auth.session?.user
            ? t('status.loggedIn')
            : auth.session?.readonlyUser
              ? t('account.status.readonly')
              : t('account.status.anonymous')}
        </span>
      </div>
      <AccountAuthPanel auth={auth} />
      <div className="settings-list">
        <section className="settings-row settings-row-block" aria-labelledby="theme-settings-title">
          <div className="settings-row-title">
            <span className="material-symbols-outlined" aria-hidden="true">
              palette
            </span>
            <span id="theme-settings-title">{t('settings.appearanceLanguage')}</span>
            {localeStatusText ? (
              <span className="settings-inline-status">{localeStatusText}</span>
            ) : null}
          </div>
          <div className="settings-control-grid">
            <SegmentedControl
              label={t('settings.theme.label')}
              options={themeOptions}
              value={themeMode}
              onChange={updateThemeMode}
            />
            <SegmentedControl
              label={t('settings.accent.label')}
              options={accentOptions}
              value={accentMode}
              onChange={updateAccentMode}
            />
            <SegmentedControl
              label={t('settings.language.label')}
              options={localeOptions}
              value={localeMode}
              onChange={updateLocaleMode}
            />
          </div>
        </section>

        <section
          className="settings-row settings-row-block"
          aria-labelledby="motion-settings-title"
        >
          <div className="settings-row-title">
            <span className="material-symbols-outlined" aria-hidden="true">
              animation
            </span>
            <span id="motion-settings-title">{t('settings.motion.group')}</span>
          </div>
          <SegmentedControl
            label={t('settings.motion.label')}
            options={motionOptions}
            value={motionMode}
            onChange={updateMotionMode}
          />
        </section>

        <section
          className="settings-row settings-row-block"
          aria-labelledby="notification-settings-title"
        >
          <div className="settings-row-title">
            <span className="material-symbols-outlined" aria-hidden="true">
              notifications
            </span>
            <span id="notification-settings-title">通知类型与免打扰</span>
            <span className="settings-inline-status">{notificationMasterStatus}</span>
            <label
              className="switch-control notification-master-switch"
              title={notificationMasterLabel}
            >
              <input
                type="checkbox"
                aria-label={notificationMasterLabel}
                checked={notificationEnabled}
                onChange={(event) => updateNotificationEnabled(event.currentTarget.checked)}
              />
              <span />
            </label>
          </div>
          <p className="settings-row-note">
            总开关控制本设备是否接收推送；下方分类决定哪些提醒允许推送，免打扰时段只用于静默或延后这些提醒。
          </p>
          <div className="time-control-row">
            <label>
              <span>免打扰开始</span>
              <input
                type="time"
                value={quietStart}
                onChange={(event) => updateQuietStart(event.currentTarget.value)}
              />
            </label>
            <label>
              <span>免打扰结束</span>
              <input
                type="time"
                value={quietEnd}
                onChange={(event) => updateQuietEnd(event.currentTarget.value)}
              />
            </label>
          </div>
          <div className="notification-type-grid" aria-label="允许接收的通知类型">
            {notificationTypeOptions.map((option) => (
              <label className="notification-type-toggle" key={option.key}>
                <input
                  type="checkbox"
                  checked={notificationTypes[option.key]}
                  disabled={!notificationEnabled}
                  onChange={(event) =>
                    updateNotificationType(option.key, event.currentTarget.checked)
                  }
                />
                <span className="material-symbols-outlined" aria-hidden="true">
                  {option.icon}
                </span>
                <span>
                  <strong>{option.label}</strong>
                  <small>{option.description}</small>
                </span>
              </label>
            ))}
          </div>
          {pushDeviceStatusText ? (
            <span className="muted">
              {isSyncingPushDevice ? `${pushDeviceStatusText}...` : pushDeviceStatusText}
            </span>
          ) : null}
        </section>

        <section
          className="settings-row settings-row-block"
          aria-labelledby="history-settings-title"
        >
          <div className="settings-row-title">
            <span className="material-symbols-outlined" aria-hidden="true">
              history
            </span>
            <span id="history-settings-title">本地历史</span>
            <span className="settings-inline-status">
              {tripSummary && scheduleHistorySummary && mapFavoriteSummary
                ? `${tripSummary.total + scheduleHistorySummary.total + mapFavoriteSummary.total} 条`
                : '读取中'}
            </span>
          </div>
          <div className="settings-history-summary">
            <span>{tripSummary?.scheduled ?? 0} 个即将进行</span>
            <span>{tripSummary?.history ?? 0} 个历史行程</span>
            <span>{scheduleHistorySummary?.total ?? 0} 条班次记录</span>
            <span>{mapFavoriteSummary?.total ?? 0} 个地图收藏</span>
            <span>{tripSummary?.localOnly ?? 0} 个待同步</span>
          </div>
          <div className="settings-action-row">
            <a className="secondary-action-button" href={appPath('/travel')}>
              <span className="material-symbols-outlined" aria-hidden="true">
                event_upcoming
              </span>
              <span>管理行程</span>
            </a>
            <a className="secondary-action-button" href={appPath('/travel/schedules')}>
              <span className="material-symbols-outlined" aria-hidden="true">
                departure_board
              </span>
              <span>查询班次</span>
            </a>
            <a className="secondary-action-button" href={appPath('/map')}>
              <span className="material-symbols-outlined" aria-hidden="true">
                map
              </span>
              <span>查看地图</span>
            </a>
            <button
              className="secondary-action-button"
              type="button"
              disabled={
                !auth.session?.user || isSyncingTripReminders || (tripSummary?.localOnly ?? 0) === 0
              }
              onClick={() => void syncTripRemindersToAccount()}
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                cloud_sync
              </span>
              <span>{isSyncingTripReminders ? '同步中' : '同步提醒'}</span>
            </button>
            <button
              className="secondary-action-button"
              type="button"
              disabled={!legacyTripSyncConsentGranted || isRevokingLegacyTripSyncConsent}
              onClick={() => void revokeLegacyTripSyncConsent()}
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                rule
              </span>
              <span>{isRevokingLegacyTripSyncConsent ? '撤销中' : '撤销旧站同步'}</span>
            </button>
            <button className="secondary-action-button" type="button" onClick={clearLocalHistory}>
              <span className="material-symbols-outlined" aria-hidden="true">
                delete_sweep
              </span>
              <span>清空本地</span>
            </button>
          </div>
          {tripSyncStatusText ? <span className="muted">{tripSyncStatusText}</span> : null}
        </section>

        <section
          className="settings-row settings-row-block"
          aria-labelledby="ticket-order-settings-title"
        >
          <div className="settings-row-title">
            <span className="material-symbols-outlined" aria-hidden="true">
              confirmation_number
            </span>
            <span id="ticket-order-settings-title">票务草稿</span>
            <span className="settings-inline-status">
              {ticketOrders === null ? '读取中' : `${ticketDraftCount} 个`}
            </span>
          </div>
          <TicketOrderDraftPanel
            cancellingOrderId={cancellingTicketOrderId}
            orders={ticketOrders}
            statusText={ticketOrderStatusText}
            title="占座草稿"
            description="这里展示本账号仍在占座或待出票的草稿；取消后会释放库存占用。"
            onCancel={(orderId) => void cancelTicketOrder(orderId)}
            onRefresh={() => void refreshTicketOrders()}
          />
        </section>

        <section
          className="settings-row settings-row-block"
          aria-labelledby="offline-settings-title"
        >
          <div className="settings-row-title">
            <span className="material-symbols-outlined" aria-hidden="true">
              download_for_offline
            </span>
            <span id="offline-settings-title">安装与离线</span>
            <span className="settings-inline-status">{installStatusLabel(installStatus)}</span>
          </div>
          <p className="settings-row-note">
            <strong>安装雨城通：</strong>
            把 YCT 添加到主屏幕，快速查看运营信息、线路和站点详情。支持缓存已下载的自定义范围离线包，并在你允许后接收行程、运营、订票和检票提醒。
          </p>
          <p className="settings-row-note">{installStatusDescription(installStatus)}</p>
          <div className="settings-action-row">
            <button
              className="secondary-action-button"
              type="button"
              disabled={installStatus === 'installed' || installStatus === 'unsupported'}
              onClick={installPwa}
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                install_mobile
              </span>
              <span>安装雨城通</span>
            </button>
            <button className="secondary-action-button" type="button" onClick={warmPwaCache}>
              <span className="material-symbols-outlined" aria-hidden="true">
                cached
              </span>
              <span>刷新缓存</span>
            </button>
            <button className="secondary-action-button" type="button" onClick={clearPwaCache}>
              <span className="material-symbols-outlined" aria-hidden="true">
                delete
              </span>
              <span>清理缓存</span>
            </button>
            <button
              className="secondary-action-button"
              type="button"
              onClick={() => setOfflinePackageFormOpen(true)}
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                add_location_alt
              </span>
              <span>新建范围</span>
            </button>
          </div>
          <div className="offline-package-summary">
            <span>{offlinePackageState?.summary.total ?? 0} 个自定义范围</span>
            <span>{offlinePackageState?.summary.refreshed ?? 0} 个已刷新基础缓存</span>
            <span>{formatArea(offlinePackageState?.summary.totalArea ?? 0)} 方块范围</span>
          </div>
          <span className="muted">
            {cacheStatusText}
            。自定义范围当前记录边界并刷新公开基础数据，真实瓦片离线包仍等待体积上限和生成策略确认。
          </span>
          <div className="offline-package-list" aria-label="自定义离线范围">
            {offlinePackageState?.packages.length ? (
              offlinePackageState.packages.map((offlinePackage) => (
                <article className="offline-package-item" key={offlinePackage.packageId}>
                  <div className="offline-package-copy">
                    <div>
                      <h3>{offlinePackage.name}</h3>
                      <span className={`offline-package-status is-${offlinePackage.status}`}>
                        {offlinePackageStatusLabel(offlinePackage.status)}
                      </span>
                    </div>
                    <p>{formatBounds(offlinePackage.bounds)}</p>
                    <small>
                      面积 {formatArea(calculateBoundsArea(offlinePackage.bounds))} 方块
                      {offlinePackage.lastRefreshedAt
                        ? ` · 上次刷新 ${formatDateTime(offlinePackage.lastRefreshedAt)}`
                        : ''}
                      {offlinePackage.errorMessage ? ` · ${offlinePackage.errorMessage}` : ''}
                    </small>
                  </div>
                  <div className="offline-package-actions">
                    <button
                      className="secondary-action-button"
                      type="button"
                      disabled={refreshingPackageId === offlinePackage.packageId}
                      onClick={() => void refreshOfflinePackage(offlinePackage)}
                    >
                      <span className="material-symbols-outlined" aria-hidden="true">
                        sync
                      </span>
                      <span>
                        {refreshingPackageId === offlinePackage.packageId ? '刷新中' : '刷新范围'}
                      </span>
                    </button>
                    <button
                      className="icon-action-button"
                      type="button"
                      onClick={() => void removeOfflinePackage(offlinePackage)}
                      aria-label={`删除 ${offlinePackage.name}`}
                    >
                      <span className="material-symbols-outlined" aria-hidden="true">
                        delete
                      </span>
                    </button>
                  </div>
                </article>
              ))
            ) : (
              <p className="offline-package-empty">还没有自定义离线范围。</p>
            )}
          </div>
        </section>
      </div>

      {offlinePackageFormOpen ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => setOfflinePackageFormOpen(false)}
        >
          <section
            className="modal-panel offline-package-modal"
            aria-labelledby="offline-package-form-title"
            role="dialog"
            aria-modal="true"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="section-heading">
              <div>
                <h2 id="offline-package-form-title">新建离线范围</h2>
                <span className="muted">使用 Minecraft 世界坐标记录一个矩形范围。</span>
              </div>
              <button
                className="icon-action-button"
                type="button"
                onClick={() => setOfflinePackageFormOpen(false)}
                aria-label="关闭"
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  close
                </span>
              </button>
            </div>
            <form className="offline-package-form" onSubmit={submitOfflinePackage}>
              <label className="offline-package-name-field">
                <span>名称</span>
                <input
                  autoFocus
                  value={offlinePackageDraft.name}
                  onChange={(event) => updateOfflinePackageDraft('name', event.currentTarget.value)}
                  placeholder="例如：大学城周边"
                />
              </label>
              <label>
                <span>最小 X</span>
                <input
                  inputMode="decimal"
                  value={offlinePackageDraft.minX}
                  onChange={(event) => updateOfflinePackageDraft('minX', event.currentTarget.value)}
                />
              </label>
              <label>
                <span>最小 Z</span>
                <input
                  inputMode="decimal"
                  value={offlinePackageDraft.minZ}
                  onChange={(event) => updateOfflinePackageDraft('minZ', event.currentTarget.value)}
                />
              </label>
              <label>
                <span>最大 X</span>
                <input
                  inputMode="decimal"
                  value={offlinePackageDraft.maxX}
                  onChange={(event) => updateOfflinePackageDraft('maxX', event.currentTarget.value)}
                />
              </label>
              <label>
                <span>最大 Z</span>
                <input
                  inputMode="decimal"
                  value={offlinePackageDraft.maxZ}
                  onChange={(event) => updateOfflinePackageDraft('maxZ', event.currentTarget.value)}
                />
              </label>
              <button className="primary-action-button" type="submit">
                <span className="material-symbols-outlined" aria-hidden="true">
                  add_location_alt
                </span>
                <span>保存范围</span>
              </button>
            </form>
            {offlinePackageError ? <p className="form-error-text">{offlinePackageError}</p> : null}
          </section>
        </div>
      ) : null}
    </section>
  );
}

function AccountAuthPanel({
  auth,
}: Readonly<{
  auth: {
    ldpassConfigured: boolean;
    ldpassBaseUrl?: string;
    status?: AuthStatus;
    session?: YctAccountSessionSnapshot;
  };
}>) {
  const user = auth.session?.user;
  const readonlyUser = auth.session?.readonlyUser;
  const statusMessage = auth.status ? authStatusMessage(auth.status) : undefined;

  return (
    <section className="account-auth-panel" aria-labelledby="account-auth-title">
      <div className="account-identity">
        <span className="account-avatar" aria-hidden="true">
          {user?.avatarUrl || readonlyUser?.avatarUrl ? (
            <img src={user?.avatarUrl ?? readonlyUser?.avatarUrl ?? ''} alt="" />
          ) : (
            <span className="material-symbols-outlined">account_circle</span>
          )}
        </span>
        <div>
          <h2 id="account-auth-title">
            {user?.username ?? readonlyUser?.username ?? '临东通账号'}
          </h2>
          {user ? (
            <p className="muted">
              {user.serverAccountVerified
                ? `服务器账号已验证${user.serverAccountName ? `：${user.serverAccountName}` : ''}`
                : '服务器账号未验证'}
            </p>
          ) : readonlyUser ? (
            <p className="muted">账号状态：{readonlyUser.status}</p>
          ) : (
            <p className="muted">
              {auth.ldpassConfigured
                ? '使用临东通账号登录后可同步历史、偏好和后续票券状态。'
                : '临东通登录尚未配置。'}
            </p>
          )}
        </div>
      </div>

      {statusMessage ? (
        <p className={auth.status === 'login_success' ? 'auth-status is-success' : 'auth-status'}>
          {statusMessage}
        </p>
      ) : null}

      <div className="account-auth-actions">
        {user || readonlyUser ? (
          <>
            <a className="secondary-action-button" href={appPath('/admin/operations')}>
              <span className="material-symbols-outlined" aria-hidden="true">
                admin_panel_settings
              </span>
              <span>内容后台</span>
            </a>
            <a className="secondary-action-button" href={appPath('/admin/services')}>
              <span className="material-symbols-outlined" aria-hidden="true">
                dashboard_customize
              </span>
              <span>服务后台</span>
            </a>
            <a className="secondary-action-button" href={appPath('/admin/transit')}>
              <span className="material-symbols-outlined" aria-hidden="true">
                route
              </span>
              <span>线路后台</span>
            </a>
            <a className="secondary-action-button" href={appPath('/admin/map-poi')}>
              <span className="material-symbols-outlined" aria-hidden="true">
                add_location_alt
              </span>
              <span>POI 后台</span>
            </a>
            {auth.ldpassBaseUrl ? (
              <a
                className="secondary-action-button"
                href={auth.ldpassBaseUrl}
                target="_blank"
                rel="noreferrer"
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  open_in_new
                </span>
                <span>临东通账号</span>
              </a>
            ) : null}
            <a className="secondary-action-button" href={appPath('/api/auth/logout')}>
              <span className="material-symbols-outlined" aria-hidden="true">
                logout
              </span>
              <span>退出雨城通</span>
            </a>
          </>
        ) : (
          <a
            className={
              auth.ldpassConfigured
                ? 'secondary-action-button is-primary'
                : 'secondary-action-button'
            }
            href={auth.ldpassConfigured ? appPath('/api/auth/ldpass/start') : undefined}
            aria-disabled={!auth.ldpassConfigured}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              login
            </span>
            <span>使用临东通登录</span>
          </a>
        )}
      </div>
    </section>
  );
}

function authStatusMessage(status: AuthStatus): string {
  const messages: Record<AuthStatus, string> = {
    login_success: '已完成临东通登录。',
    readonly: '当前账号只能进入只读账号页。',
    logged_out: '已退出雨城通本地会话。',
    state_invalid: '登录状态校验失败，请重新发起登录。',
    session_unavailable: '未能从临东通读取有效账号信息。',
    session_error: '临东通会话读取失败，请稍后重试。',
    ldpass_not_configured: '临东通登录尚未配置。',
  };

  return messages[status];
}

function formatLocaleStatus(
  preference: ClientLocalePreferenceState,
  t: (key: CommonMessageKey) => string,
): string {
  const resolvedLabelKeys = {
    'zh-CN': 'settings.language.zhCN',
    'zh-Hant': 'settings.language.zhHant',
    en: 'settings.language.en',
  } satisfies Record<LocaleCode, CommonMessageKey>;
  const sourceLabelKeys: Record<ClientLocalePreferenceState['source'], CommonMessageKey> = {
    default: 'settings.language.source.default',
    local: 'settings.language.source.local',
    server: 'settings.language.source.account',
  };

  return `${t(sourceLabelKeys[preference.source])} · ${t(
    resolvedLabelKeys[preference.resolvedLocale],
  )}`;
}

function SegmentedControl<TValue extends string>({
  label,
  options,
  value,
  onChange,
}: Readonly<{
  label: string;
  options: Array<{ value: TValue; label: string }>;
  value: TValue;
  onChange: (value: TValue) => void;
}>) {
  return (
    <fieldset className="segmented-control">
      <legend>{label}</legend>
      <div>
        {options.map((option) => {
          const isActive = option.value === value;
          return (
            <button
              className={isActive ? 'is-active' : ''}
              type="button"
              aria-pressed={isActive}
              key={option.value}
              onClick={() => onChange(option.value)}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function readPwaInstallStatus(): PwaInstallStatus {
  if (!('serviceWorker' in navigator)) {
    return 'unsupported';
  }

  if (isPwaStandalone()) {
    return 'installed';
  }

  return 'manual';
}

function isPwaStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    Boolean((navigator as NavigatorWithStandalone).standalone)
  );
}

function installStatusLabel(status: PwaInstallStatus): string {
  const labels: Record<PwaInstallStatus, string> = {
    checking: '检查中',
    installed: '已安装',
    installable: '可安装',
    manual: '可添加',
    unsupported: '不可用',
  };

  return labels[status];
}

function installStatusDescription(status: PwaInstallStatus): string {
  const descriptions: Record<PwaInstallStatus, string> = {
    checking: '正在检查当前浏览器是否支持安装入口。',
    installed: '当前已经以独立应用方式打开，后续可继续在这里管理离线缓存。',
    installable: '当前浏览器支持直接安装，点击“安装雨城通”即可打开安装确认。',
    manual: '当前浏览器需要通过菜单添加到主屏幕或安装为应用；在 Safari 中可使用分享菜单里的“添加到主屏幕”。',
    unsupported: '当前浏览器不支持安装入口，仍可继续使用网页和近期内容缓存。',
  };

  return descriptions[status];
}

function readNotificationTypePreferences(): NotificationTypePreferences {
  const source = window.localStorage.getItem(notificationTypePreferenceKey);
  if (!source) {
    return defaultNotificationTypePreferences;
  }

  try {
    const parsed = JSON.parse(source) as Partial<Record<NotificationTypeKey, unknown>>;
    return notificationTypeOptions.reduce<NotificationTypePreferences>(
      (preferences, option) => ({
        ...preferences,
        [option.key]:
          typeof parsed[option.key] === 'boolean'
            ? parsed[option.key]
            : defaultNotificationTypePreferences[option.key],
      }),
      { ...defaultNotificationTypePreferences },
    );
  } catch {
    return defaultNotificationTypePreferences;
  }
}

function writeNotificationTypePreferences(preferences: NotificationTypePreferences) {
  window.localStorage.setItem(notificationTypePreferenceKey, JSON.stringify(preferences));
}

async function ensureBrowserPushSubscription(): Promise<string> {
  if (!webPushPublicKey) {
    throw new Error('Web Push 公钥尚未配置，本设备暂不能订阅推送');
  }

  if (!window.isSecureContext) {
    throw new Error('当前页面不是安全上下文，浏览器不会开放 Push 订阅');
  }

  if (!('Notification' in window) || !('PushManager' in window)) {
    throw new Error('当前浏览器不支持 Web Push');
  }

  const permission =
    Notification.permission === 'default'
      ? await Notification.requestPermission()
      : Notification.permission;
  if (permission !== 'granted') {
    throw new Error('浏览器通知权限未开启');
  }

  const registration = await navigator.serviceWorker.ready.catch(() => undefined);
  if (!registration) {
    throw new Error('Service Worker 尚未就绪，暂不能订阅 Push');
  }

  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: decodeWebPushPublicKey(webPushPublicKey),
    }));
  const payload = toPushSubscriptionPayload(subscription);

  const response = await fetch(appPath('/api/account/push-subscriptions'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...payload,
      userAgent: navigator.userAgent,
    }),
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { message?: string };
    throw new Error(data.message ?? 'Push 设备订阅登记失败');
  }

  window.localStorage.setItem(pushSubscriptionEndpointKey, payload.endpoint);
  return payload.endpoint;
}

async function revokeBrowserPushSubscription(): Promise<boolean> {
  const registration = await navigator.serviceWorker.ready.catch(() => undefined);
  const subscription = await registration?.pushManager.getSubscription().catch(() => undefined);
  const endpoint =
    subscription?.endpoint ?? window.localStorage.getItem(pushSubscriptionEndpointKey) ?? undefined;

  if (subscription) {
    await subscription.unsubscribe().catch(() => undefined);
  }

  if (!endpoint) {
    window.localStorage.removeItem(pushSubscriptionEndpointKey);
    return false;
  }

  const response = await fetch(appPath('/api/account/push-subscriptions'), {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ endpoint }),
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { message?: string };
    throw new Error(data.message ?? 'Push 设备订阅撤销失败');
  }

  window.localStorage.removeItem(pushSubscriptionEndpointKey);
  return true;
}

function toPushSubscriptionPayload(subscription: PushSubscription): {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
} {
  const data = subscription.toJSON() as {
    endpoint?: string;
    keys?: {
      p256dh?: string;
      auth?: string;
    };
  };

  if (!data.endpoint || !data.keys?.p256dh || !data.keys.auth) {
    throw new Error('浏览器返回的 Push 订阅缺少必要密钥');
  }

  return {
    endpoint: data.endpoint,
    keys: {
      p256dh: data.keys.p256dh,
      auth: data.keys.auth,
    },
  };
}

function decodeWebPushPublicKey(value: string): ArrayBuffer {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = `${value}${padding}`.replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const bytes = Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function hasGrantedNotificationPermission(): boolean {
  return 'Notification' in window && Notification.permission === 'granted';
}

function readEndpointHost(endpoint: string): string {
  try {
    return new URL(endpoint).host;
  } catch {
    return '未知服务';
  }
}

async function readServerTripReminders(): Promise<TripReminder[]> {
  const response = await fetch(appPath('/api/account/trip-reminders'), {
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error('账号提醒暂不可用');
  }

  const data = (await response.json()) as { items?: TripReminder[] };
  return data.items ?? [];
}

async function deleteServerTripReminderCopies(input: {
  source: TripReminder['source'];
}): Promise<{ deletedCount: number; deletedAt?: string }> {
  const response = await fetch(appPath('/api/account/trip-reminders'), {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  const data = (await response.json().catch(() => ({}))) as {
    deletedCount?: number;
    deletedAt?: string;
    message?: string;
  };

  if (!response.ok) {
    throw new Error(data.message ?? '账号提醒副本删除失败');
  }

  return {
    deletedCount: data.deletedCount ?? 0,
    deletedAt: data.deletedAt,
  };
}

async function readServerPushPreference(): Promise<{
  enabled: boolean;
  enabledTypes: ServerPushNotificationType[];
  quietHours: {
    enabled: boolean;
    startTime: string;
    endTime: string;
    timezone: string;
  };
}> {
  const response = await fetch(appPath('/api/account/push-preferences'), {
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error('通知偏好暂不可用');
  }

  const data = (await response.json()) as {
    item?: {
      enabled: boolean;
      enabledTypes: ServerPushNotificationType[];
      quietHours: {
        enabled: boolean;
        startTime: string;
        endTime: string;
        timezone: string;
      };
    };
  };

  if (!data.item) {
    throw new Error('通知偏好暂不可用');
  }

  return data.item;
}

async function writeServerPushPreference(input: {
  enabled: boolean;
  preferences: NotificationTypePreferences;
  quietStart: string;
  quietEnd: string;
}): Promise<void> {
  const enabledTypes = notificationTypeOptions
    .filter((option) => input.preferences[option.key])
    .map((option) => notificationTypeToServerType[option.key]);

  await fetch(appPath('/api/account/push-preferences'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      enabled: input.enabled,
      enabledTypes,
      quietHours: {
        enabled: input.enabled,
        startTime: input.quietStart,
        endTime: input.quietEnd,
        timezone: readClientTimezone(),
      },
    }),
  });
}

function readClientTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai';
}

async function warmAppShellCache(): Promise<void> {
  if ('serviceWorker' in navigator) {
    const registration = await navigator.serviceWorker.ready.catch(() => undefined);
    registration?.active?.postMessage({
      type: 'YCT_WARM_APP_SHELL',
    });
  }

  await Promise.all(
    [
      '/',
      '/travel',
      '/travel/schedules',
      '/travel/screen',
      '/services',
      '/map',
      '/offline',
      '/api/transit/overview',
      '/api/travel/schedules',
      '/api/transit/screen',
      '/api/transit/service-notices',
      '/api/transit/station-details',
      '/api/operations/feed',
    ].map((url) =>
      fetch(appPath(url), {
        cache: 'reload',
      }).catch(() => undefined),
    ),
  );
}

async function warmOfflinePackageCache(): Promise<void> {
  await warmAppShellCache();

  await Promise.all(
    [
      '/api/map/tile-providers',
      '/api/map/poi-categories',
      '/api/map/markers',
      '/api/map/unmined-regions',
    ].map(async (url) => {
      const response = await fetch(appPath(url), {
        cache: 'reload',
      });

      if (!response.ok) {
        throw new Error(`${url} 刷新失败`);
      }
    }),
  );
}

async function requestServerOfflinePackage(offlinePackage: OfflinePackageRecord): Promise<void> {
  const response = await fetch(appPath('/api/account/offline-packages'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      packageId: offlinePackage.packageId,
      name: offlinePackage.name,
      bounds: offlinePackage.bounds,
    }),
  });

  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { message?: string };
    throw new Error(data.message ?? '服务端离线包请求失败');
  }
}

async function readServerOfflinePackageRequests(): Promise<AccountOfflinePackageRequest[]> {
  const response = await fetch(appPath('/api/account/offline-packages'), {
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error('账号离线范围暂不可用');
  }

  const data = (await response.json()) as { items?: AccountOfflinePackageRequest[] };
  return data.items ?? [];
}

async function deleteServerOfflinePackageRequest(packageId: string): Promise<void> {
  const response = await fetch(appPath('/api/account/offline-packages'), {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ packageId }),
  });
  if (!response.ok) {
    throw new Error('账号离线范围请求删除失败');
  }
}

async function clearYctCaches(): Promise<void> {
  if (!('caches' in window)) {
    return;
  }

  const keys = await caches.keys();
  await Promise.all(keys.filter((key) => key.startsWith('yct-')).map((key) => caches.delete(key)));
}

async function refreshPwaCacheStatus(setStatusText: (value: string) => void): Promise<void> {
  if (!('caches' in window)) {
    setStatusText('缓存不可用');
    return;
  }

  const keys = (await caches.keys()).filter((key) => key.startsWith('yct-'));
  let itemCount = 0;
  for (const key of keys) {
    const cache = await caches.open(key);
    itemCount += (await cache.keys()).length;
  }

  setStatusText(itemCount > 0 ? `已缓存 ${itemCount} 项` : '暂无缓存');
}

function parseOfflinePackageBounds(draft: typeof emptyOfflinePackageDraft): RectangleBounds | null {
  const minX = parseCoordinate(draft.minX);
  const minZ = parseCoordinate(draft.minZ);
  const maxX = parseCoordinate(draft.maxX);
  const maxZ = parseCoordinate(draft.maxZ);

  if (minX === null || minZ === null || maxX === null || maxZ === null) {
    return null;
  }

  return {
    minX,
    minZ,
    maxX,
    maxZ,
  };
}

function parseCoordinate(value: string): number | null {
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatArea(area: number): string {
  return new Intl.NumberFormat('zh-CN', {
    maximumFractionDigits: 0,
  }).format(area);
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
