import type { ApiItemResponse, OperationsServerStatus } from '@yct/contracts';
import { createApiMeta } from './api-meta';
import { syncPlayerLocations } from './player-location-workflow';

export async function readOperationsServerStatus(): Promise<
  ApiItemResponse<OperationsServerStatus>
> {
  const result = await syncPlayerLocations();
  const availability =
    result.status === 'ready' ? 'online' : result.status === 'unavailable' ? 'offline' : 'unknown';

  return {
    meta: createApiMeta(result.status, result.message),
    item: {
      availability,
      checkedAt: result.checkedAt,
      latencyMs: result.status === 'ready' ? result.latencyMs : undefined,
      onlinePlayerCount: result.status === 'ready' ? result.onlineCount : undefined,
    },
  };
}
