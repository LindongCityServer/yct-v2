import { randomUUID } from 'node:crypto';
import { BdslmMarkerProvider } from '@yct/adapters';
import { publishDomainEvent } from './app-event-bus';
import { readBedrockServerStatus } from './bedrock-server-status';
import {
  mergePlayerLocationObservation,
  readPlayerLocationSnapshot,
  recordPlayerLocationAttempt,
  type PlayerLocationSnapshot,
  type PlayerLocationMergeResult,
} from './player-location-store';
import { readRuntimeConfig } from './runtime-config';
import { createTimedCache } from './server-cache';

const playerLocationSyncCache = createTimedCache<PlayerLocationSyncResult>(8_000);

export interface PlayerLocationSyncResult {
  status: 'ready' | 'not_configured' | 'unavailable';
  checkedAt: string;
  latencyMs?: number;
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
  const key = JSON.stringify([
    config.markerBdslmBaseUrl,
    config.markerBdslmTimeoutMs,
    config.bedrockServerAddress,
    config.bedrockStatusTimeoutMs,
    config.bedrockStatusEnabled,
    config.bedrockOfflineHoldMs,
    config.playerLocationStorePath,
  ]);
  return playerLocationSyncCache.read(key, () => performPlayerLocationSync(config, input));
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
      onlineCount: 0,
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

  const requestStartedAt = Date.now();
  let providerSnapshot: Awaited<ReturnType<typeof provider.fetchMarkers>>;
  try {
    providerSnapshot = await provider.fetchMarkers('default');
  } catch {
    return recordUnavailable(
      'map_unavailable',
      '网页地图服务不可用，服务器离线；所有玩家已标为离线，保留最后位置。',
    );
  }

  const latencyMs = Date.now() - requestStartedAt;
  // The map HTTP endpoint is the primary probe. Only after it succeeds do we
  // confirm the configured MCBE UDP address from an external observation point.
  const external = config.bedrockStatusEnabled
    ? await readBedrockServerStatus(config.bedrockServerAddress, config.bedrockStatusTimeoutMs)
    : { availability: 'unknown' as const, observedAt: undefined };
  let externalHoldExpired = false;
  if (external.availability === 'offline') {
    return recordUnavailable(
      'external_offline',
      '网页地图在线，但 MCBE 服务器外网离线，不可访问；所有玩家已标为离线，保留最后位置。',
      external.observedAt,
    );
  }
  if (config.bedrockStatusEnabled && external.availability === 'unknown') {
    const previous = await readPlayerLocationSnapshot();
    if (previous.unavailableReason === 'external_offline') {
      // Older snapshots did not persist a detector timestamp. Anchor once to
      // their last attempt, then persist it so unknown probes cannot renew it.
      const confirmedAt = previous.externalOfflineConfirmedAt ?? previous.lastAttemptAt;
      const confirmedTime = Date.parse(confirmedAt ?? '');
      const age = Date.now() - confirmedTime;
      if (Number.isFinite(age) && age >= -5_000 && age < config.bedrockOfflineHoldMs) {
        return recordUnavailable(
          'external_offline',
          'MCBE 服务器此前检测为外网离线，不可访问；第三方检测暂不可用，等待在线确认，玩家保持离线。',
          confirmedAt,
        );
      }
      externalHoldExpired = true;
    }
  }
  const observedAt = providerSnapshot.fetchedAt || checkedAt;
  const mergeResult = await mergePlayerLocationObservation({
    observedAt,
    latencyMs,
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

  await publishLocationChanges(mergeResult, observedAt, {
    type: input.actorType ?? 'adapter',
    id: input.actorId?.trim() || provider.id,
  });

  const onlineCount = mergeResult.snapshot.locations.filter(
    (location) => location.presence === 'online',
  ).length;
  if (mergeResult.previousSourceStatus !== 'ready') {
    await publishObservationEvent({
      eventId: `event_${randomUUID()}`,
      type: 'ServerStatusObserved',
      occurredAt: observedAt,
      actor: {
        type: input.actorType ?? 'adapter',
        id: input.actorId?.trim() || provider.id,
      },
      payload: {
        sourceId: provider.id,
        observedAt,
        availability: 'online',
        latencyMs,
        onlineCount,
      },
    });
  }
  return {
    status: 'ready',
    checkedAt,
    latencyMs,
    onlineCount,
    changed: mergeResult.changed,
    message: !config.bedrockStatusEnabled
      ? `网页地图在线，已记录 ${onlineCount} 个在线玩家位置；第三方 MCBE 判定已关闭。`
      : externalHoldExpired
        ? `网页地图在线，已记录 ${onlineCount} 个在线玩家位置；此前外网离线确认已过期，暂以地图结果为准，尚未完成外网确认。`
        : external.availability === 'unknown'
          ? `网页地图在线，已记录 ${onlineCount} 个在线玩家位置；第三方 MCBE 检测暂不可用，尚未完成外网确认。`
          : `已记录 ${onlineCount} 个在线玩家位置。`,
    snapshot: mergeResult.snapshot,
  };

  async function recordUnavailable(
    reason: NonNullable<PlayerLocationSnapshot['unavailableReason']>,
    message: string,
    externalOfflineConfirmedAt?: string,
  ): Promise<PlayerLocationSyncResult> {
    const observedAt = new Date().toISOString();
    const latencyMs = Date.now() - requestStartedAt;
    const result = await recordPlayerLocationAttempt({
      attemptedAt: observedAt,
      sourceStatus: 'unavailable',
      latencyMs,
      unavailableReason: reason,
      externalOfflineConfirmedAt,
    });
    const actor = {
      type: input.actorType ?? 'adapter',
      id: input.actorId?.trim() || provider.id,
    } as const;
    await publishLocationChanges(result, observedAt, actor);
    if (result.previousSourceStatus !== 'unavailable') {
      await publishObservationEvent({
        eventId: `event_${randomUUID()}`,
        type: 'ServerStatusObserved',
        occurredAt: observedAt,
        actor,
        payload: {
          sourceId: provider.id,
          observedAt,
          availability: 'offline',
          latencyMs,
          onlineCount: 0,
        },
      });
    }
    return {
      status: 'unavailable',
      checkedAt: observedAt,
      latencyMs,
      onlineCount: 0,
      changed: result.changed,
      message,
      snapshot: result.snapshot,
    };
  }
}

async function publishLocationChanges(
  result: PlayerLocationMergeResult,
  observedAt: string,
  actor: { type: 'system' | 'adapter'; id: string },
): Promise<void> {
  if (result.changed) {
    await publishObservationEvent({
      eventId: `event_${randomUUID()}`,
      type: 'PlayerLocationsObserved',
      occurredAt: observedAt,
      actor,
      payload: {
        sourceId: result.snapshot.sourceId,
        observedAt,
        onlinePlayerNames: result.snapshot.locations
          .filter((location) => location.presence === 'online')
          .map((location) => location.playerName),
        onlineCount: result.snapshot.locations.filter((location) => location.presence === 'online')
          .length,
      },
    });
  }

  for (const change of result.presenceChanges) {
    await publishObservationEvent({
      eventId: `event_${randomUUID()}`,
      type: 'PlayerLocationPresenceChanged',
      occurredAt: observedAt,
      actor,
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
}

type ObservationEventInput = Parameters<typeof publishDomainEvent>[0];

async function publishObservationEvent(input: ObservationEventInput): Promise<void> {
  try {
    await publishDomainEvent(input);
  } catch {
    // 事件投递失败不改变观测事实；成功进入 Outbox 的记录会由重放任务继续派发。
  }
}
