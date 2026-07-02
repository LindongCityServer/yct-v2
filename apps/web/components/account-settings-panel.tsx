'use client';

import type { RectangleBounds, YctAccountSessionSnapshot } from '@yct/contracts';
import { type FormEvent, useEffect, useState } from 'react';
import {
  calculateBoundsArea,
  createOfflinePackage,
  deleteOfflinePackage,
  formatBounds,
  offlinePackageStatusLabel,
  readOfflinePackageState,
  updateOfflinePackageStatus,
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
  readTripReminderState,
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

const themeOptions: Array<{ value: ThemeMode; label: string }> = [
  { value: 'system', label: '跟随系统' },
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
];

const accentOptions: Array<{ value: AccentMode; label: string }> = [
  { value: 'ldpass', label: '跟随 ldpass' },
  { value: 'green', label: '青绿' },
  { value: 'red', label: '红色' },
  { value: 'gray', label: '灰色' },
];

const motionOptions: Array<{ value: MotionMode; label: string }> = [
  { value: 'system', label: '跟随系统' },
  { value: 'full', label: '开启' },
  { value: 'reduced', label: '关闭' },
];

type PwaInstallStatus = 'checking' | 'installed' | 'installable' | 'manual' | 'unsupported';
type NotificationTypeKey = 'trip_reminder' | 'operations' | 'ticket' | 'checkin';
type NotificationTypePreferences = Record<NotificationTypeKey, boolean>;

const notificationTypePreferenceKey = 'yct.notifications.types.v1';
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

const defaultNotificationTypePreferences: NotificationTypePreferences = {
  trip_reminder: true,
  operations: true,
  ticket: true,
  checkin: true,
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
  const [themeMode, setThemeMode] = useState<ThemeMode>('system');
  const [accentMode, setAccentMode] = useState<AccentMode>('ldpass');
  const [motionMode, setMotionMode] = useState<MotionMode>('system');
  const [notificationEnabled, setNotificationEnabled] = useState(false);
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
  const [offlinePackageState, setOfflinePackageState] = useState<OfflinePackageState | null>(null);
  const [offlinePackageDraft, setOfflinePackageDraft] = useState(emptyOfflinePackageDraft);
  const [offlinePackageFormOpen, setOfflinePackageFormOpen] = useState(false);
  const [offlinePackageError, setOfflinePackageError] = useState('');
  const [refreshingPackageId, setRefreshingPackageId] = useState<string | null>(null);
  const syncTripSummary = () => {
    setTripSummary(readTripReminderState().summary);
    setScheduleHistorySummary(readTravelScheduleHistoryState().summary);
  };
  const syncOfflinePackageState = () => {
    setOfflinePackageState(readOfflinePackageState());
  };

  useEffect(() => {
    setThemeMode(readThemeMode());
    setAccentMode(readAccentMode());
    setMotionMode(readMotionMode());
    setNotificationEnabled(window.localStorage.getItem('yct.notifications.enabled') === 'true');
    setNotificationTypes(readNotificationTypePreferences());
    setQuietStart(window.localStorage.getItem('yct.notifications.quietStart') ?? '23:00');
    setQuietEnd(window.localStorage.getItem('yct.notifications.quietEnd') ?? '07:00');
    syncTripSummary();
    syncOfflinePackageState();

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

  const updateNotificationEnabled = (enabled: boolean) => {
    setNotificationEnabled(enabled);
    window.localStorage.setItem('yct.notifications.enabled', String(enabled));
  };

  const updateNotificationType = (key: NotificationTypeKey, enabled: boolean) => {
    setNotificationTypes((current) => {
      const next = {
        ...current,
        [key]: enabled,
      };
      writeNotificationTypePreferences(next);
      return next;
    });
  };

  const updateQuietStart = (value: string) => {
    setQuietStart(value);
    window.localStorage.setItem('yct.notifications.quietStart', value);
  };

  const updateQuietEnd = (value: string) => {
    setQuietEnd(value);
    window.localStorage.setItem('yct.notifications.quietEnd', value);
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

    createOfflinePackage({
      name: offlinePackageDraft.name,
      bounds,
    });
    setOfflinePackageDraft(emptyOfflinePackageDraft);
    setOfflinePackageFormOpen(false);
    syncOfflinePackageState();
  };

  const refreshOfflinePackage = async (offlinePackage: OfflinePackageRecord) => {
    setRefreshingPackageId(offlinePackage.packageId);
    setCacheStatusText('正在刷新离线范围基础数据');
    try {
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

  const removeOfflinePackage = (offlinePackage: OfflinePackageRecord) => {
    if (!window.confirm(`要删除离线范围“${offlinePackage.name}”吗？`)) {
      return;
    }

    deleteOfflinePackage(offlinePackage.packageId);
    syncOfflinePackageState();
  };

  const clearLocalHistory = () => {
    if (
      !window.confirm(
        '要清空雨城通新版本地行程提醒、历史记录和班次查询记录吗？旧站 orders 原始数据不会被删除。',
      )
    ) {
      return;
    }

    clearLocalTripReminders();
    clearTravelScheduleHistory();
    syncTripSummary();
  };

  return (
    <section className="module-panel" aria-labelledby="account-title">
      <div className="section-heading">
        <h1 id="account-title" className="sr-only">
          账号设置
        </h1>
        <span className="muted">
          {auth.session?.user ? '已登录' : auth.session?.readonlyUser ? '只读账号' : '未登录'}
        </span>
      </div>
      <AccountAuthPanel auth={auth} />
      <div className="settings-list">
        <section className="settings-row settings-row-block" aria-labelledby="theme-settings-title">
          <div className="settings-row-title">
            <span className="material-symbols-outlined" aria-hidden="true">
              palette
            </span>
            <span id="theme-settings-title">主题与强调色</span>
          </div>
          <div className="settings-control-grid">
            <SegmentedControl
              label="主题"
              options={themeOptions}
              value={themeMode}
              onChange={updateThemeMode}
            />
            <SegmentedControl
              label="强调色"
              options={accentOptions}
              value={accentMode}
              onChange={updateAccentMode}
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
            <span id="motion-settings-title">动态效果</span>
          </div>
          <SegmentedControl
            label="动态"
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
            <span id="notification-settings-title">通知与免打扰</span>
            <label className="switch-control">
              <input
                type="checkbox"
                checked={notificationEnabled}
                onChange={(event) => updateNotificationEnabled(event.currentTarget.checked)}
              />
              <span />
            </label>
          </div>
          <div className="time-control-row">
            <label>
              <span>开始</span>
              <input
                type="time"
                value={quietStart}
                onChange={(event) => updateQuietStart(event.currentTarget.value)}
              />
            </label>
            <label>
              <span>结束</span>
              <input
                type="time"
                value={quietEnd}
                onChange={(event) => updateQuietEnd(event.currentTarget.value)}
              />
            </label>
          </div>
          <div className="notification-type-grid" aria-label="通知类型">
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
              {tripSummary && scheduleHistorySummary
                ? `${tripSummary.total + scheduleHistorySummary.total} 条`
                : '读取中'}
            </span>
          </div>
          <div className="settings-history-summary">
            <span>{tripSummary?.scheduled ?? 0} 个即将进行</span>
            <span>{tripSummary?.history ?? 0} 个历史行程</span>
            <span>{scheduleHistorySummary?.total ?? 0} 条班次记录</span>
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
            <button
              className="secondary-action-button"
              type="button"
              disabled={!auth.session?.user}
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                cloud_sync
              </span>
              <span>同步到账号</span>
            </button>
            <button className="secondary-action-button" type="button" onClick={clearLocalHistory}>
              <span className="material-symbols-outlined" aria-hidden="true">
                delete_sweep
              </span>
              <span>清空本地</span>
            </button>
          </div>
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
                      onClick={() => removeOfflinePackage(offlinePackage)}
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
