import type { ApiItemResponse, OperationsServerStatus } from '@yct/contracts';
import { createApiMeta } from './api-meta';
import { syncPlayerLocations } from './player-location-workflow';

export async function readOperationsServerStatus(): Promise<
  ApiItemResponse<OperationsServerStatus>
> {
  const result = await syncPlayerLocations();
  // 只有确认外网离线时才对外报 offline；地图故障属于“未知”，在线数也不能伪造成 0。
  const externallyOffline =
    result.status === 'unavailable' && result.snapshot.unavailableReason === 'external_offline';
  const availability =
    result.status === 'ready' ? 'online' : externallyOffline ? 'offline' : 'unknown';
  // 只有地图同步成功才把名单当作实时数据；状态未知时保留人数缺省，避免前端展示过期名单。
  const onlinePlayers =
    result.status === 'ready'
      ? result.snapshot.locations
          .filter((location) => location.presence === 'online')
          .map((location) => ({
            name: location.playerName,
            x: location.x,
            z: location.z,
            lastSeenAt: location.lastSeenAt,
          }))
      : externallyOffline
        ? []
        : undefined;

  return {
    meta: createApiMeta(result.status, result.message),
    item: {
      availability,
      checkedAt: result.checkedAt,
      latencyMs: result.status === 'ready' ? result.latencyMs : undefined,
      onlinePlayerCount:
        result.status === 'ready' ? result.onlineCount : externallyOffline ? 0 : undefined,
      onlinePlayers,
    },
  };
}
