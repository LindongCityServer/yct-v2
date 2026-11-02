'use client';

import type { CommonMessageKey } from '../lib/client-i18n';
import { useI18n } from '../lib/client-i18n';
import type { ServerStatusDisplayState } from '../lib/client-server-status';

type Translate = (key: CommonMessageKey, values?: Record<string, string | number>) => string;

const statusLabelKeys: Record<ServerStatusDisplayState, CommonMessageKey> = {
  loading: 'serverStatus.pill.loading',
  online: 'serverStatus.pill.online',
  offline: 'serverStatus.pill.offline',
  unknown: 'serverStatus.pill.unknown',
};

function hasPlayers(
  state: ServerStatusDisplayState,
  onlinePlayerCount: number | undefined,
): onlinePlayerCount is number {
  return state === 'online' && typeof onlinePlayerCount === 'number' && onlinePlayerCount > 0;
}

/** 在线且有玩家时，用玩家数量替代“服务器在线”文案。 */
export function serverStatusPillText(
  state: ServerStatusDisplayState,
  onlinePlayerCount: number | undefined,
  t: Translate,
): string {
  if (hasPlayers(state, onlinePlayerCount)) {
    return t('serverStatus.pill.players', { count: onlinePlayerCount });
  }
  return t(statusLabelKeys[state]);
}

/** 顶栏状态胶囊：只显示服务器在线/离线，加载与未知状态有独立文案。 */
export function ServerStatusPill({
  state,
  onlinePlayerCount,
}: Readonly<{ state: ServerStatusDisplayState; onlinePlayerCount?: number }>) {
  const { t } = useI18n();
  const label = serverStatusPillText(state, onlinePlayerCount, t);
  const ariaLabel = hasPlayers(state, onlinePlayerCount)
    ? t('serverStatus.pill.ariaPlayers', { count: onlinePlayerCount })
    : t('serverStatus.pill.aria', { status: t(statusLabelKeys[state]) });

  return (
    <span
      className={`topbar-server-status is-${state}`}
      role="status"
      aria-live="polite"
      aria-label={ariaLabel}
    >
      <span className="topbar-server-status-dot" aria-hidden="true" />
      <span className="topbar-server-status-label">{label}</span>
    </span>
  );
}

/** 移动侧栏里的状态项：图标右下角的小圆点表达状态，文字由 aria-label 提供。 */
export function ServerStatusRailIcon({ state }: Readonly<{ state: ServerStatusDisplayState }>) {
  return (
    <span className={`server-status-rail-icon is-${state}`}>
      <span className="material-symbols-outlined" aria-hidden="true">
        database
      </span>
      <span className="server-status-rail-dot" aria-hidden="true" />
    </span>
  );
}
