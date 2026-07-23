import { NextRequest, NextResponse } from 'next/server';
import type { MapMarkerSnapshot } from '@yct/contracts';
import { createApiMeta } from '../../../../lib/api-meta';
import { markResponseNoStore } from '../../../../lib/http-cache';
import { normalizePlayerKey } from '../../../../lib/player-location-store';
import { syncPlayerLocations } from '../../../../lib/player-location-workflow';
import { readYctServerSession } from '../../../../lib/yct-server-session-store';
import {
  buildMinotarAvatarUrl,
  resolveYctAvatarUrl,
  yctSessionCookieName,
} from '../../../../lib/yct-session';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const [syncResult, currentAccount] = await Promise.all([
    syncPlayerLocations(),
    resolveCurrentAccount(request),
  ]);
  const currentPlayerKey = currentAccount?.serverAccountName
    ? normalizePlayerKey(currentAccount.serverAccountName)
    : undefined;
  const markers: MapMarkerSnapshot['markers'] = syncResult.snapshot.locations.map((location) => ({
    id: buildPlayerMarkerId(location.playerKey),
    label: location.playerName,
    categoryId: 'player',
    geometry: {
      type: 'Point',
      coordinates: [location.x, location.z],
    },
    symbolIcon: location.presence === 'online' ? 'person_pin_circle' : 'person_pin',
    playerLocation: {
      serverAccountName: location.playerName,
      avatarUrl:
        location.playerKey === currentPlayerKey
          ? currentAccount?.avatarUrl
          : resolveYctAvatarUrl({ minotarUrl: buildMinotarAvatarUrl(location.playerName) }),
      presence: location.presence,
      isCurrentAccount: location.playerKey === currentPlayerKey,
      observedAt: location.observedAt,
      lastSeenAt: location.lastSeenAt,
    },
  }));

  return markResponseNoStore(
    NextResponse.json({
      meta: createApiMeta(syncResult.status, syncResult.message),
      snapshot: {
        fetchedAt: syncResult.snapshot.lastSuccessfulSyncAt ?? syncResult.checkedAt,
        markers,
      } satisfies MapMarkerSnapshot,
      currentAccount: currentAccount
        ? {
            serverAccountName: currentAccount.serverAccountName,
            hasRecordedLocation: markers.some(
              (marker) => marker.playerLocation?.isCurrentAccount === true,
            ),
          }
        : undefined,
    }),
  );
}

async function resolveCurrentAccount(
  request: NextRequest,
): Promise<{ serverAccountName: string; avatarUrl?: string } | undefined> {
  try {
    const serverSession = await readYctServerSession(
      request.cookies.get(yctSessionCookieName)?.value,
    );
    const session = serverSession?.ldpassSession;
    const serverAccountName = session?.user?.serverAccountName?.trim();
    if (!session?.user?.serverAccountVerified || !serverAccountName) {
      return undefined;
    }
    return {
      serverAccountName,
      avatarUrl: resolveYctAvatarUrl({
        avatarFallbackUrl: session.user.avatarFallbackUrl,
        avatarUrl: session.user.avatarUrl,
        minotarUrl: buildMinotarAvatarUrl(serverAccountName),
      }),
    };
  } catch {
    return undefined;
  }
}

function buildPlayerMarkerId(playerKey: string): string {
  return `player-location-${encodeURIComponent(playerKey).replaceAll('%', '-')}`;
}
