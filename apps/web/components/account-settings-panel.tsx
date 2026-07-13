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
  mergeOfflinePackagesFromAccount,
  readOfflinePackageState,
  updateOfflinePackageStatus,
  type AccountOfflinePackageRequest,
  type OfflinePackageRecord,
  type OfflinePackageState,
  type OfflinePackageStatus,
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
  type FontMode,
  type MotionMode,
  type ThemeMode,
  applyAccentMode,
  applyFontMode,
  applyMotionMode,
  applyThemeMode,
  readAccentMode,
  readFontMode,
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

const fontOptionKeys: Array<{ value: FontMode; labelKey: CommonMessageKey }> = [
  { value: 'harmony', labelKey: 'settings.font.harmony' },
  { value: 'system', labelKey: 'settings.font.system' },
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
  descriptionKey: CommonMessageKey;
  icon: string;
  labelKey: CommonMessageKey;
}> = [
  {
    key: 'trip_reminder',
    descriptionKey: 'account.notification.tripDescription',
    icon: 'event_upcoming',
    labelKey: 'account.notification.tripLabel',
  },
  {
    key: 'operations',
    descriptionKey: 'account.notification.operationsDescription',
    icon: 'campaign',
    labelKey: 'account.notification.operationsLabel',
  },
  {
    key: 'ticket',
    descriptionKey: 'account.notification.ticketDescription',
    icon: 'confirmation_number',
    labelKey: 'account.notification.ticketLabel',
  },
  {
    key: 'checkin',
    descriptionKey: 'account.notification.checkinDescription',
    icon: 'qr_code_scanner',
    labelKey: 'account.notification.checkinLabel',
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
  | 'session_unavailable_localhost'
  | 'session_cookie_missing'
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
  const { locale, t } = useI18n();
  const ticketOrderLockedText = auth.session?.readonlyUser
    ? t('account.ticketDraft.readonly')
    : t('travelSchedule.order.loginRequired');
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
  const fontOptions = useMemo(
    () =>
      fontOptionKeys.map((option) => ({
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
  const [fontMode, setFontMode] = useState<FontMode>('harmony');
  const [localeMode, setLocaleMode] = useState<LocalePreference>('system');
  const [localeStatusState, setLocaleStatusState] = useState<ClientLocalePreferenceState | null>(
    null,
  );
  const [localeStatusFallbackKey, setLocaleStatusFallbackKey] = useState<CommonMessageKey | null>(
    null,
  );
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
  const [cacheStatusText, setCacheStatusText] = useState(t('account.pwa.cacheChecking'));
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
    auth.session?.user ? t('ticketOrderDraft.loading') : ticketOrderLockedText,
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

    setTicketOrderStatusText(t('ticketOrderDraft.loading'));
    try {
      const response = await fetch(appPath('/api/travel/ticketing/orders'), { cache: 'no-store' });
      const data = (await response.json()) as Partial<ApiListResponse<TicketOrderListItem>> & {
        message?: string;
      };

      if (response.status === 401) {
        setTicketOrders([]);
        setTicketOrderStatusText(t('travelSchedule.order.loginRequired'));
        return;
      }

      if (!response.ok || !data.items) {
        throw new Error(data.message ?? t('travelSchedule.order.readFailed'));
      }

      setTicketOrders(data.items);
      setTicketOrderStatusText(data.items.length > 0 ? '' : t('ticketOrderDraft.empty'));
    } catch (error) {
      setTicketOrders([]);
      setTicketOrderStatusText(
        error instanceof Error ? error.message : t('travelSchedule.order.readFailed'),
      );
    }
  };
  const cancelTicketOrder = async (orderId: string) => {
    if (!window.confirm(t('ticketOrderDetail.cancelConfirm'))) {
      return;
    }

    setCancellingTicketOrderId(orderId);
    setTicketOrderStatusText(t('travelSchedule.order.canceling'));
    try {
      const response = await fetch(
        appPath(`/api/travel/ticketing/orders/${encodeURIComponent(orderId)}/cancel`),
        { method: 'POST' },
      );
      const data = (await response.json()) as Partial<ApiItemResponse<TicketOrderListItem>> & {
        message?: string;
      };

      if (!response.ok || !data.item) {
        throw new Error(data.message ?? t('ticketOrderDetail.cancelFailed'));
      }

      setTicketOrderStatusText(t('ticketOrderDetail.cancelDone'));
      await refreshTicketOrders();
      notifyTicketOrderStateChanged();
    } catch (error) {
      setTicketOrderStatusText(
        error instanceof Error ? error.message : t('ticketOrderDetail.cancelFailed'),
      );
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
    setFontMode(readFontMode());
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
          setTripSyncStatusText(
            t('account.history.loadedFromAccount', { count: reminders.length }),
          );
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
    void refreshPwaCacheStatus(setCacheStatusText, t);

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

  const updateFontMode = (mode: FontMode) => {
    setFontMode(mode);
    applyFontMode(mode);
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
      setPushDeviceStatusText(t('account.notification.statusLoginRequired'));
    } else {
      setPushDeviceStatusText('');
    }
  };

  const syncBrowserPushDevice = async (enabled: boolean) => {
    if (!auth.session?.user) {
      return;
    }

    setIsSyncingPushDevice(true);
    setPushDeviceStatusText(
      enabled
        ? t('account.notification.statusRegistering')
        : t('account.notification.statusRevoking'),
    );
    try {
      if (enabled) {
        const endpoint = await ensureBrowserPushSubscription();
        setPushDeviceStatusText(
          t('account.notification.statusRegistered', { host: readEndpointHost(endpoint) }),
        );
      } else {
        const revoked = await revokeBrowserPushSubscription();
        setPushDeviceStatusText(
          revoked
            ? t('account.notification.statusRevoked')
            : t('account.notification.statusDisabledPreference'),
        );
      }
    } catch (error) {
      setPushDeviceStatusText(
        error instanceof Error ? error.message : t('account.notification.statusSyncFailed'),
      );
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
    setCacheStatusText(t('account.pwa.cacheRefreshing'));
    await warmAppShellCache();
    await refreshPwaCacheStatus(setCacheStatusText, t);
  };

  const clearPwaCache = async () => {
    setCacheStatusText(t('account.pwa.cacheClearing'));
    await clearYctCaches();
    await refreshPwaCacheStatus(setCacheStatusText, t);
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
      setOfflinePackageError(t('account.offlinePackage.error.missingName'));
      return;
    }

    if (!bounds) {
      setOfflinePackageError(t('account.offlinePackage.error.invalidBounds'));
      return;
    }

    if (calculateBoundsArea(bounds) <= 0) {
      setOfflinePackageError(t('account.offlinePackage.error.emptyArea'));
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
      await refreshPwaCacheStatus(setCacheStatusText, t);
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
    if (!window.confirm(t('account.offlinePackage.deleteConfirm', { name: offlinePackage.name }))) {
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
    if (!window.confirm(t('account.history.clearConfirm'))) {
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
          ? t('account.history.legacyRevokeConfirmWithAccount')
          : t('account.history.legacyRevokeConfirmLocal'),
      )
    ) {
      return;
    }

    revokeLegacyTripReminderSyncConsent();
    setLegacyTripSyncConsentGranted(false);
    if (!canDeleteAccountCopies) {
      setTripSyncStatusText(t('account.history.legacyRevokeDone'));
      return;
    }

    setIsRevokingLegacyTripSyncConsent(true);
    setTripSyncStatusText(t('account.history.legacyRevokeDeleting'));
    try {
      const result = await deleteServerTripReminderCopies({ source: 'legacy_order' });
      markTripRemindersUnsynced({ source: 'legacy_order' });
      syncTripSummary();
      setTripSyncStatusText(
        result.deletedCount > 0
          ? t('account.history.legacyRevokeDeleted', { count: result.deletedCount })
          : t('account.history.legacyRevokeNoCopies'),
      );
    } catch (error) {
      setTripSyncStatusText(
        error instanceof Error
          ? `${t('account.history.legacyRevokeDeleteFailed')}：${error.message}`
          : t('account.history.legacyRevokeDeleteFailed'),
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
        t('account.history.legacySyncConfirm', { count: legacyReminders.length }),
      );

      if (accepted) {
        grantLegacyTripReminderSyncConsent();
        setLegacyTripSyncConsentGranted(true);
      } else {
        reminders = regularReminders;
        if (reminders.length === 0) {
          setTripSyncStatusText(t('account.history.legacySyncKept'));
          return;
        }
      }
    }

    if (reminders.length === 0) {
      setTripSyncStatusText(t('account.history.noSyncNeeded'));
      return;
    }

    setIsSyncingTripReminders(true);
    setTripSyncStatusText(t('account.history.syncing'));
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
        throw new Error(data.message ?? t('account.history.syncFailed'));
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
          ? t('account.history.syncDoneWithSkipped', {
              count: reminders.length,
              skipped: skippedLegacyCount,
            })
          : t('account.history.syncDone', { count: reminders.length }),
      );
      syncTripSummary();
    } catch (error) {
      setTripSyncStatusText(
        error instanceof Error ? error.message : t('account.history.syncFailed'),
      );
    } finally {
      setIsSyncingTripReminders(false);
    }
  };

  const notificationMasterStatus = notificationEnabled
    ? t('account.notification.enabled')
    : t('account.notification.disabled');
  const notificationMasterLabel = notificationEnabled
    ? t('account.notification.masterLabelEnabled')
    : t('account.notification.masterLabelDisabled');
  const ticketDraftCount =
    ticketOrders?.filter(
      (item) => item.order.status === 'draft' || item.order.status === 'pending_issue',
    ).length ?? 0;

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
              label={t('settings.font.label')}
              options={fontOptions}
              value={fontMode}
              onChange={updateFontMode}
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
            <span id="notification-settings-title">{t('account.notification.title')}</span>
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
          <p className="settings-row-note">{t('account.notification.note')}</p>
          <div className="time-control-row">
            <label>
              <span>{t('account.notification.quietStart')}</span>
              <input
                type="time"
                value={quietStart}
                onChange={(event) => updateQuietStart(event.currentTarget.value)}
              />
            </label>
            <label>
              <span>{t('account.notification.quietEnd')}</span>
              <input
                type="time"
                value={quietEnd}
                onChange={(event) => updateQuietEnd(event.currentTarget.value)}
              />
            </label>
          </div>
          <div className="notification-type-grid" aria-label={t('account.notification.gridAria')}>
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
                  <strong>{t(option.labelKey)}</strong>
                  <small>{t(option.descriptionKey)}</small>
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
            <span id="history-settings-title">{t('account.history.title')}</span>
            <span className="settings-inline-status">
              {tripSummary && scheduleHistorySummary && mapFavoriteSummary
                ? t('account.history.total', {
                    count:
                      tripSummary.total + scheduleHistorySummary.total + mapFavoriteSummary.total,
                  })
                : t('account.history.loading')}
            </span>
          </div>
          <div className="settings-history-summary">
            <span>
              {t('account.history.upcomingTrips', { count: tripSummary?.scheduled ?? 0 })}
            </span>
            <span>{t('account.history.tripHistory', { count: tripSummary?.history ?? 0 })}</span>
            <span>
              {t('account.history.scheduleRecords', {
                count: scheduleHistorySummary?.total ?? 0,
              })}
            </span>
            <span>
              {t('account.history.mapFavorites', { count: mapFavoriteSummary?.total ?? 0 })}
            </span>
            <span>{t('account.history.pendingSync', { count: tripSummary?.localOnly ?? 0 })}</span>
          </div>
          <div className="settings-action-row">
            <a className="secondary-action-button" href={appPath('/travel')}>
              <span className="material-symbols-outlined" aria-hidden="true">
                event_upcoming
              </span>
              <span>{t('account.history.action.manageTrips')}</span>
            </a>
            <a className="secondary-action-button" href={appPath('/travel/schedules')}>
              <span className="material-symbols-outlined" aria-hidden="true">
                departure_board
              </span>
              <span>{t('account.history.action.searchSchedules')}</span>
            </a>
            <a className="secondary-action-button" href={appPath('/map')}>
              <span className="material-symbols-outlined" aria-hidden="true">
                map
              </span>
              <span>{t('account.history.action.viewMap')}</span>
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
              <span>
                {isSyncingTripReminders
                  ? t('account.history.action.syncing')
                  : t('account.history.action.sync')}
              </span>
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
              <span>
                {isRevokingLegacyTripSyncConsent
                  ? t('account.history.action.revokingLegacy')
                  : t('account.history.action.revokeLegacy')}
              </span>
            </button>
            <button className="secondary-action-button" type="button" onClick={clearLocalHistory}>
              <span className="material-symbols-outlined" aria-hidden="true">
                delete_sweep
              </span>
              <span>{t('account.history.action.clearLocal')}</span>
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
            <span id="ticket-order-settings-title">{t('ticketOrderDraft.title')}</span>
            <span className="settings-inline-status">
              {ticketOrders === null
                ? t('ticketOrderDraft.loading')
                : t('account.ticketDraft.count', { count: ticketDraftCount })}
            </span>
          </div>
          <TicketOrderDraftPanel
            cancellingOrderId={cancellingTicketOrderId}
            orders={ticketOrders}
            statusText={ticketOrderStatusText}
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
            <span id="offline-settings-title">{t('account.pwa.title')}</span>
            <span className="settings-inline-status">{installStatusLabel(installStatus, t)}</span>
          </div>
          <p className="settings-row-note">
            <strong>{t('account.pwa.descriptionPrefix')}</strong>
            {t('account.pwa.description')}
          </p>
          <p className="settings-row-note">{installStatusDescription(installStatus, t)}</p>
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
              <span>{t('account.pwa.action.install')}</span>
            </button>
            <button className="secondary-action-button" type="button" onClick={warmPwaCache}>
              <span className="material-symbols-outlined" aria-hidden="true">
                cached
              </span>
              <span>{t('account.pwa.action.refreshCache')}</span>
            </button>
            <button className="secondary-action-button" type="button" onClick={clearPwaCache}>
              <span className="material-symbols-outlined" aria-hidden="true">
                delete
              </span>
              <span>{t('account.pwa.action.clearCache')}</span>
            </button>
            <button
              className="secondary-action-button"
              type="button"
              onClick={() => setOfflinePackageFormOpen(true)}
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                add_location_alt
              </span>
              <span>{t('account.offlinePackage.newRange')}</span>
            </button>
          </div>
          <div className="offline-package-summary">
            <span>
              {t('account.offlinePackage.summary.total', {
                count: offlinePackageState?.summary.total ?? 0,
              })}
            </span>
            <span>
              {t('account.offlinePackage.summary.refreshed', {
                count: offlinePackageState?.summary.refreshed ?? 0,
              })}
            </span>
            <span>
              {t('account.offlinePackage.summary.area', {
                area: formatArea(offlinePackageState?.summary.totalArea ?? 0, locale),
              })}
            </span>
          </div>
          <span className="muted">
            {cacheStatusText}
            {' · '}
            {t('account.offlinePackage.strategyNote')}
          </span>
          <div className="offline-package-list" aria-label={t('account.offlinePackage.listAria')}>
            {offlinePackageState?.packages.length ? (
              offlinePackageState.packages.map((offlinePackage) => (
                <article className="offline-package-item" key={offlinePackage.packageId}>
                  <div className="offline-package-copy">
                    <div>
                      <h3>{offlinePackage.name}</h3>
                      <span className={`offline-package-status is-${offlinePackage.status}`}>
                        {formatOfflinePackageStatus(offlinePackage.status, t)}
                      </span>
                    </div>
                    <p>{formatOfflinePackageBounds(offlinePackage.bounds, t)}</p>
                    <small>
                      {t('account.offlinePackage.area', {
                        area: formatArea(calculateBoundsArea(offlinePackage.bounds), locale),
                      })}
                      {offlinePackage.lastRefreshedAt
                        ? ` · ${t('account.offlinePackage.lastRefreshed', {
                            time: formatDateTime(offlinePackage.lastRefreshedAt, locale),
                          })}`
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
                        {refreshingPackageId === offlinePackage.packageId
                          ? t('account.offlinePackage.refreshing')
                          : t('account.offlinePackage.refresh')}
                      </span>
                    </button>
                    <button
                      className="icon-action-button"
                      type="button"
                      onClick={() => void removeOfflinePackage(offlinePackage)}
                      aria-label={t('account.offlinePackage.deleteAria', {
                        name: offlinePackage.name,
                      })}
                    >
                      <span className="material-symbols-outlined" aria-hidden="true">
                        delete
                      </span>
                    </button>
                  </div>
                </article>
              ))
            ) : (
              <p className="offline-package-empty">{t('account.offlinePackage.empty')}</p>
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
                <h2 id="offline-package-form-title">{t('account.offlinePackage.title')}</h2>
                <span className="muted">{t('account.offlinePackage.description')}</span>
              </div>
              <button
                className="icon-action-button"
                type="button"
                onClick={() => setOfflinePackageFormOpen(false)}
                aria-label={t('account.offlinePackage.close')}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  close
                </span>
              </button>
            </div>
            <form className="offline-package-form" onSubmit={submitOfflinePackage}>
              <label className="offline-package-name-field">
                <span>{t('account.offlinePackage.name')}</span>
                <input
                  autoFocus
                  value={offlinePackageDraft.name}
                  onChange={(event) => updateOfflinePackageDraft('name', event.currentTarget.value)}
                  placeholder={t('account.offlinePackage.namePlaceholder')}
                />
              </label>
              <label>
                <span>{t('account.offlinePackage.minX')}</span>
                <input
                  inputMode="decimal"
                  value={offlinePackageDraft.minX}
                  onChange={(event) => updateOfflinePackageDraft('minX', event.currentTarget.value)}
                />
              </label>
              <label>
                <span>{t('account.offlinePackage.minZ')}</span>
                <input
                  inputMode="decimal"
                  value={offlinePackageDraft.minZ}
                  onChange={(event) => updateOfflinePackageDraft('minZ', event.currentTarget.value)}
                />
              </label>
              <label>
                <span>{t('account.offlinePackage.maxX')}</span>
                <input
                  inputMode="decimal"
                  value={offlinePackageDraft.maxX}
                  onChange={(event) => updateOfflinePackageDraft('maxX', event.currentTarget.value)}
                />
              </label>
              <label>
                <span>{t('account.offlinePackage.maxZ')}</span>
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
                <span>{t('account.offlinePackage.save')}</span>
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
  const { t } = useI18n();
  const user = auth.session?.user;
  const readonlyUser = auth.session?.readonlyUser;
  const statusMessage = auth.status ? authStatusMessage(auth.status, t) : undefined;

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
            {user?.username ?? readonlyUser?.username ?? t('account.auth.defaultTitle')}
          </h2>
          {user ? (
            <p className="muted">
              {user.serverAccountVerified
                ? user.serverAccountName
                  ? t('account.auth.serverVerifiedWithName', {
                      name: user.serverAccountName,
                    })
                  : t('account.auth.serverVerified')
                : t('account.auth.serverUnverified')}
            </p>
          ) : readonlyUser ? (
            <p className="muted">
              {t('account.auth.readonlyStatus', { status: readonlyUser.status })}
            </p>
          ) : (
            <p className="muted">
              {auth.ldpassConfigured
                ? t('account.auth.introConfigured')
                : t('account.auth.introNotConfigured')}
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
            <a className="secondary-action-button" href={appPath('/admin')}>
              <span className="material-symbols-outlined" aria-hidden="true">
                admin_panel_settings
              </span>
              <span>{t('account.auth.adminPortal')}</span>
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
                <span>{t('account.auth.ldpassAccount')}</span>
              </a>
            ) : null}
            <a className="secondary-action-button" href={appPath('/api/auth/logout')}>
              <span className="material-symbols-outlined" aria-hidden="true">
                logout
              </span>
              <span>{t('account.auth.logout')}</span>
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
            <span>{t('account.auth.login')}</span>
          </a>
        )}
      </div>
    </section>
  );
}

function authStatusMessage(status: AuthStatus, t: ReturnType<typeof useI18n>['t']): string {
  const messageKeys: Record<AuthStatus, CommonMessageKey> = {
    ldpass_not_configured: 'account.authStatus.ldpassNotConfigured',
    logged_out: 'account.authStatus.loggedOut',
    login_success: 'account.authStatus.loginSuccess',
    readonly: 'account.authStatus.readonly',
    session_cookie_missing: 'account.authStatus.sessionCookieMissing',
    session_error: 'account.authStatus.sessionError',
    session_unavailable: 'account.authStatus.sessionUnavailable',
    session_unavailable_localhost: 'account.authStatus.sessionUnavailableLocalhost',
    state_invalid: 'account.authStatus.stateInvalid',
  };

  return t(messageKeys[status]);
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

function installStatusLabel(status: PwaInstallStatus, t: ReturnType<typeof useI18n>['t']): string {
  const labelKeys: Record<PwaInstallStatus, CommonMessageKey> = {
    checking: 'account.pwa.status.checking',
    installed: 'account.pwa.status.installed',
    installable: 'account.pwa.status.installable',
    manual: 'account.pwa.status.manual',
    unsupported: 'account.pwa.status.unsupported',
  };

  return t(labelKeys[status]);
}

function installStatusDescription(
  status: PwaInstallStatus,
  t: ReturnType<typeof useI18n>['t'],
): string {
  const descriptionKeys: Record<PwaInstallStatus, CommonMessageKey> = {
    checking: 'account.pwa.statusDescription.checking',
    installed: 'account.pwa.statusDescription.installed',
    installable: 'account.pwa.statusDescription.installable',
    manual: 'account.pwa.statusDescription.manual',
    unsupported: 'account.pwa.statusDescription.unsupported',
  };

  return t(descriptionKeys[status]);
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

async function refreshPwaCacheStatus(
  setStatusText: (value: string) => void,
  t: ReturnType<typeof useI18n>['t'],
): Promise<void> {
  if (!('caches' in window)) {
    setStatusText(t('account.pwa.cacheUnavailable'));
    return;
  }

  const keys = (await caches.keys()).filter((key) => key.startsWith('yct-'));
  let itemCount = 0;
  for (const key of keys) {
    const cache = await caches.open(key);
    itemCount += (await cache.keys()).length;
  }

  setStatusText(
    itemCount > 0 ? t('account.pwa.cacheItems', { count: itemCount }) : t('account.pwa.cacheEmpty'),
  );
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

function formatOfflinePackageStatus(
  status: OfflinePackageStatus,
  t: ReturnType<typeof useI18n>['t'],
): string {
  const statusKeys: Record<OfflinePackageStatus, CommonMessageKey> = {
    base_cache_refreshed: 'account.offlinePackage.status.baseCacheRefreshed',
    refresh_failed: 'account.offlinePackage.status.refreshFailed',
    registered: 'account.offlinePackage.status.registered',
    request_failed: 'account.offlinePackage.status.requestFailed',
    server_requested: 'account.offlinePackage.status.serverRequested',
  };

  return t(statusKeys[status]);
}

function formatOfflinePackageBounds(
  bounds: RectangleBounds,
  t: ReturnType<typeof useI18n>['t'],
): string {
  const minX = Math.min(bounds.minX, bounds.maxX);
  const maxX = Math.max(bounds.minX, bounds.maxX);
  const minZ = Math.min(bounds.minZ, bounds.maxZ);
  const maxZ = Math.max(bounds.minZ, bounds.maxZ);

  return t('account.offlinePackage.bounds', {
    maxX: formatCoordinate(maxX),
    maxZ: formatCoordinate(maxZ),
    minX: formatCoordinate(minX),
    minZ: formatCoordinate(minZ),
  });
}

function formatCoordinate(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function formatArea(area: number, locale: LocaleCode): string {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 0,
  }).format(area);
}

function formatDateTime(value: string, locale: LocaleCode): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(locale, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
