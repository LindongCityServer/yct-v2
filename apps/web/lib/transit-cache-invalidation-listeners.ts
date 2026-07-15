import type { YctEventType } from '@yct/contracts';
import { getAppEventBus } from './app-event-bus';
import { clearTransitLinePoiMarkerCache } from './map-transit-line-markers';
import { clearTransitOverviewCache } from './transit-data';

const cacheInvalidationEventTypes = [
  'TransitDataRevisionPublished',
  'TransitDataRevisionStationUpdated',
  'TransitDataRevisionStationCreated',
  'TransitDataRevisionLineUpdated',
  'TransitDataRevisionLineCreated',
  'TransitDataRevisionLineDeleted',
  'TransitLineApprovalChanged',
  'TransitModeProfileCreated',
  'TransitModeProfileDeleted',
  'TransitModeProfileUpdated',
] as const satisfies readonly YctEventType[];

let registered = false;

export function ensureTransitCacheInvalidationListenersRegistered(): void {
  if (registered) {
    return;
  }

  registered = true;
  const eventBus = getAppEventBus();
  for (const eventType of cacheInvalidationEventTypes) {
    eventBus.subscribe(eventType, async () => {
      clearTransitOverviewCache();
      clearTransitLinePoiMarkerCache();
    });
  }
}
