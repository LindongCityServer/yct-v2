'use client';

import Link from 'next/link';
import type { OperationsServerStatusPlayer } from '@yct/contracts';
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

/** 顶栏空间有限，只展开最近的一部分玩家，其余引导到地图查看。 */
const maximumExpandedPlayers = 8;

function hasPlayers(
  state: ServerStatusDisplayState,
  onlinePlayerCount: number | undefined,
): onlinePlayerCount is number {
  return state === 'online' && typeof onlinePlayerCount === 'number' && onlinePlayerCount > 0;
}

function playerInitial(name: string): string {
  const first = Array.from(name.trim())[0];
  return first ? first.toLocaleUpperCase() : '?';
}

/** 状态文案只表达在线/离线，玩家数量作为独立信息追加展示。 */
export function serverStatusPillText(state: ServerStatusDisplayState, t: Translate): string {
  return t(statusLabelKeys[state]);
}

/** 顶栏状态胶囊：指示灯 + 在线/离线文案，有玩家在线时追加人数，悬停展开在线玩家名单。 */
export function ServerStatusPill({
  state,
  onlinePlayerCount,
  onlinePlayers,
  href,
}: Readonly<{
  state: ServerStatusDisplayState;
  onlinePlayerCount?: number;
  /** 在线玩家名单；仅 online 状态展示。 */
  onlinePlayers?: OperationsServerStatusPlayer[];
  /** 在线状态的跳转地址；离线/未知保持纯展示，避免指向空列表的死链。 */
  href?: string;
}>) {
  const { t } = useI18n();
  const label = serverStatusPillText(state, t);
  const playerList = state === 'online' && Array.isArray(onlinePlayers) ? onlinePlayers : undefined;
  const effectivePlayerCount = onlinePlayerCount ?? playerList?.length;
  const displayedPlayerCount = effectivePlayerCount ?? playerList?.length ?? 0;
  const playersOnline = hasPlayers(state, effectivePlayerCount);
  const playerCountLabel = playersOnline
    ? t('serverStatus.pill.players', { count: effectivePlayerCount })
    : undefined;
  const ariaLabel = playersOnline
    ? t('serverStatus.pill.ariaPlayers', { count: effectivePlayerCount })
    : t('serverStatus.pill.aria', { status: label });
  const openLabel = playersOnline
    ? t('serverStatus.pill.openPlayers', { count: effectivePlayerCount })
    : undefined;
  const content = (
    <>
      <span className="topbar-server-status-dot" aria-hidden="true" />
      <span className="topbar-server-status-label">{label}</span>
      {playerCountLabel ? (
        <span className="topbar-server-status-players">{playerCountLabel}</span>
      ) : null}
    </>
  );
  const expandedPlayers = playerList?.slice(0, maximumExpandedPlayers) ?? [];
  const hiddenPlayerCount = Math.max(0, displayedPlayerCount - expandedPlayers.length);

  const pill =
    href && playersOnline ? (
      <Link
        className={`topbar-server-status is-${state} is-link`}
        href={href}
        aria-live="polite"
        aria-label={openLabel}
        title={playerList ? undefined : openLabel}
      >
        {content}
      </Link>
    ) : (
      <span
        className={`topbar-server-status is-${state}`}
        role="status"
        aria-live="polite"
        aria-label={ariaLabel}
      >
        {content}
      </span>
    );

  if (!playerList) {
    return pill;
  }

  return (
    <span className="topbar-server-status-wrap">
      {pill}
      <span
        className="topbar-server-status-popover"
        role="region"
        aria-label={t('serverStatus.pill.playersAria')}
      >
        <span className="topbar-server-status-popover-surface">
          <span className="topbar-server-status-popover-head">
            <span className="topbar-server-status-popover-title">
              {t('serverStatus.pill.onlinePlayers')}
            </span>
            <span className="topbar-server-status-popover-count">
              {t('serverStatus.pill.players', { count: displayedPlayerCount })}
            </span>
          </span>
          {expandedPlayers.length > 0 ? (
            <span className="topbar-server-status-player-list">
              {expandedPlayers.map((player) => (
                <span className="topbar-server-status-player" key={player.name}>
                  <span className="topbar-server-status-player-avatar" aria-hidden="true">
                    {playerInitial(player.name)}
                  </span>
                  <span className="topbar-server-status-player-name" title={player.name}>
                    {player.name}
                  </span>
                  <span className="topbar-server-status-player-coords">
                    {t('serverStatus.pill.playerCoords', {
                      x: Math.round(player.x),
                      z: Math.round(player.z),
                    })}
                  </span>
                </span>
              ))}
              {hiddenPlayerCount > 0 ? (
                <span className="topbar-server-status-player-more">
                  {t('serverStatus.pill.morePlayers', { count: hiddenPlayerCount })}
                </span>
              ) : null}
            </span>
          ) : (
            <span className="topbar-server-status-popover-empty">
              {t('serverStatus.pill.emptyPlayers')}
            </span>
          )}
          {href ? (
            <Link className="topbar-server-status-popover-link" href={href}>
              {t('serverStatus.pill.viewOnMap')}
              <span className="material-symbols-outlined" aria-hidden="true">
                arrow_forward
              </span>
            </Link>
          ) : null}
        </span>
      </span>
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
