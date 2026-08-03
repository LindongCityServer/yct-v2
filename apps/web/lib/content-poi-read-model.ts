import type { ApiListResponse, OperationsFeedItem, YctEventType } from '@yct/contracts';
import { createApiMeta } from './api-meta';
import { getAppEventBus } from './app-event-bus';
import { readOperationsFeed } from './operations-content';
import { createTimedKeyedCache } from './server-cache';

const candidateCache = createTimedKeyedCache<OperationsFeedItem[]>(60_000, 256);
const invalidationEventTypes = [
  'ContentPoiBindingsUpdated',
  'ContentPublished',
  'ContentDraftUpdated',
  'ContentArchived',
  'PoiPublished',
  'PoiArchived',
] as const satisfies readonly YctEventType[];

let listenersRegistered = false;

export function ensureContentPoiReadModelListenersRegistered(): void {
  if (listenersRegistered) {
    return;
  }

  listenersRegistered = true;
  const eventBus = getAppEventBus();
  for (const eventType of invalidationEventTypes) {
    eventBus.subscribe(eventType, async () => {
      candidateCache.clear();
    });
  }
}

export async function readActiveOperationsForPoi(
  poiMarkerId: string,
  now = new Date(),
): Promise<ApiListResponse<OperationsFeedItem>> {
  ensureContentPoiReadModelListenersRegistered();
  const normalizedMarkerId = poiMarkerId.trim();
  if (!normalizedMarkerId) {
    return { meta: createApiMeta('ready'), items: [] };
  }

  const candidates = await candidateCache.read(normalizedMarkerId, async () => {
    const feed = await readOperationsFeed();
    return feed.items.filter((item) => item.relatedPoiMarkerIds?.includes(normalizedMarkerId));
  });

  return {
    meta: createApiMeta('ready'),
    items: candidates.filter((item) => isOperationActive(item, now)),
  };
}

function isOperationActive(item: OperationsFeedItem, now: Date): boolean {
  const nowTime = now.getTime();
  const publishedTime = item.publishedAt ? new Date(item.publishedAt).getTime() : Number.NaN;
  if (Number.isFinite(publishedTime) && publishedTime > nowTime) {
    return false;
  }

  if (!item.expiresAt) {
    return true;
  }

  const expiresAt = new Date(item.expiresAt).getTime();
  return !Number.isFinite(expiresAt) || expiresAt > nowTime;
}
