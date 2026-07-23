import { randomUUID } from 'node:crypto';
import { BdslmMarkerProvider } from '@yct/adapters';
import { publishDomainEvent } from './app-event-bus';
import {
  mergePlayerLocationObservation,
  readPlayerLocationSnapshot,
  recordPlayerLocationAttempt,
  type PlayerLocationSnapshot,
} from './player-location-store';
import { readRuntimeConfig } from './runtime-config';
import { createTimedCache } from './server-cache';

const playerLocationSyncCache = createTimedCache<PlayerLocationSyncResult>(8_000);

export interface PlayerLocationSyncResult {
  status: 'ready' | 'not_configured' | 'unavailable';
  checkedAt: string;
  onlineCount: number;
  changed: boolean;
  message: string;
  snapshot: PlayerLocationSnapshot;
}

export async function syncPlayerLocations(
  input: {
    actorId?: string;
    actorType?: 'system' | 'adapter';
  } = {},
): Promise<PlayerLocationSyncResult> {
  const config = readRuntimeConfig();
  return playerLocationSyncCache.read(config.markerBdslmBaseUrl ?? 'not-configured', () =>
    performPlayerLocationSync(config, input),
  );
}

async function performPlayerLocationSync(
  config: ReturnType<typeof readRuntimeConfig>,
  input: {
    actorId?: string;
    actorType?: 'system' | 'adapter';
  },
): Promise<PlayerLocationSyncResult> {
  const checkedAt = new Date().toISOString();
  if (!config.markerBdslmBaseUrl) {
    const snapshot = await readPlayerLocationSnapshot();
    return {
      status: 'not_configured',
      checkedAt,
      onlineCount: snapshot.locations.filter((location) => location.presence === 'online').length,
      changed: false,
      message: 'BDSLM 玩家位置源尚未配置。',
      snapshot,
    };
  }

  const provider = new BdslmMarkerProvider({
    id: 'bdslm-player-markers',
    name: 'BDSLM 实时玩家位置',
    baseUrl: config.markerBdslmBaseUrl,
    fetchTimeoutMs: config.markerBdslmTimeoutMs,
  });

  try {
    const providerSnapshot = await provider.fetchMarkers('default');
    const observedAt = providerSnapshot.fetchedAt || checkedAt;
    const mergeResult = await mergePlayerLocationObservation({
      observedAt,
      locations: providerSnapshot.markers.flatMap((marker) => {
        if (marker.geometry.type !== 'Point' || !marker.playerLocation) {
          return [];
        }
        return [
          {
            playerName: marker.playerLocation.serverAccountName,
            x: marker.geometry.coordinates[0],
            z: marker.geometry.coordinates[1],
          },
        ];
      }),
    });

    if (mergeResult.changed) {
      await publishDomainEvent({
        eventId: `event_${randomUUID()}`,
        type: 'PlayerLocationsObserved',
        occurredAt: observedAt,
        actor: {
          type: input.actorType ?? 'adapter',
          id: input.actorId?.trim() || provider.id,
        },
        payload: {
          sourceId: provider.id,
          observedAt,
          onlinePlayerNames: mergeResult.snapshot.locations
            .filter((location) => location.presence === 'online')
            .map((location) => location.playerName),
          onlineCount: mergeResult.snapshot.locations.filter(
            (location) => location.presence === 'online',
          ).length,
        },
      });
    }

    for (const change of mergeResult.presenceChanges) {
      await publishDomainEvent({
        eventId: `event_${randomUUID()}`,
        type: 'PlayerLocationPresenceChanged',
        occurredAt: observedAt,
        actor: {
          type: input.actorType ?? 'adapter',
          id: input.actorId?.trim() || provider.id,
        },
        payload: {
          playerName: change.current.playerName,
          previousPresence: change.previousPresence,
          presence: change.current.presence,
          x: change.current.x,
          z: change.current.z,
          observedAt,
          lastSeenAt: change.current.lastSeenAt,
        },
      });
    }

    const onlineCount = mergeResult.snapshot.locations.filter(
      (location) => location.presence === 'online',
    ).length;
    return {
      status: 'ready',
      checkedAt,
      onlineCount,
      changed: mergeResult.changed,
      message: `已记录 ${onlineCount} 个在线玩家位置。`,
      snapshot: mergeResult.snapshot,
    };
  } catch {
    await recordPlayerLocationAttempt(checkedAt);
    const snapshot = await readPlayerLocationSnapshot();
    return {
      status: 'unavailable',
      checkedAt,
      onlineCount: snapshot.locations.filter((location) => location.presence === 'online').length,
      changed: false,
      message: '实时玩家位置源暂不可用，已保留最后一次成功位置。',
      snapshot,
    };
  }
}
