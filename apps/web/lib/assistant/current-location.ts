import type { NextRequest } from 'next/server';
import { normalizePlayerKey, readPlayerLocationSnapshot } from '../player-location-store';
import { readYctServerSession } from '../yct-server-session-store';
import {
  resolveYctSessionCookie,
  yctEmbedSessionCookieName,
  yctSessionCookieName,
} from '../yct-session';

export interface CurrentPlayerLocation {
  playerName: string;
  x: number;
  z: number;
  observedAt: string;
  lastSeenAt: string;
}

/**
 * 读取当前登录账号绑定的服务器账号，以及它在玩家位置快照里的最后记录位置。
 * 只用于当前账号本人：未登录、未验证服务器账号或没有位置记录时返回 undefined。
 */
export async function resolveCurrentPlayerLocation(
  request: NextRequest,
): Promise<CurrentPlayerLocation | undefined> {
  const serverAccountName = await resolveVerifiedServerAccount(request);
  if (!serverAccountName) {
    return undefined;
  }

  const snapshot = await readPlayerLocationSnapshot().catch(() => undefined);
  if (!snapshot || snapshot.locations.length === 0) {
    return undefined;
  }

  const playerKey = normalizePlayerKey(serverAccountName);
  const record = snapshot.locations.find((item) => item.playerKey === playerKey);
  if (!record) {
    return undefined;
  }

  return {
    playerName: record.playerName,
    x: record.x,
    z: record.z,
    observedAt: record.observedAt,
    lastSeenAt: record.lastSeenAt,
  };
}

export async function resolveVerifiedServerAccount(
  request: NextRequest,
): Promise<string | undefined> {
  try {
    const { sessionId } = resolveYctSessionCookie({
      standardSessionId: request.cookies.get(yctSessionCookieName)?.value,
      embeddedSessionId: request.cookies.get(yctEmbedSessionCookieName)?.value,
    });
    const serverSession = await readYctServerSession(sessionId);
    const user = serverSession?.ldpassSession?.user;
    const serverAccountName = user?.serverAccountName?.trim();
    if (!user?.serverAccountVerified || !serverAccountName) {
      return undefined;
    }
    return serverAccountName;
  } catch {
    return undefined;
  }
}
