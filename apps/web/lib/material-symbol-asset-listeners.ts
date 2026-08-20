import type { YctEvent } from '@yct/contracts';
import { getAppEventBus } from './app-event-bus';
import { promoteMaterialSymbolAsset } from './material-symbol-asset-workflow';

let registered = false;

export function ensureMaterialSymbolAssetListenersRegistered(): void {
  if (registered) {
    return;
  }

  registered = true;
  const eventBus = getAppEventBus();
  eventBus.subscribe('ServiceEntrySubmitted', async (event) => {
    await promoteFromEvent(event, event.payload.icon, 'service_entry_submitted');
  });
  eventBus.subscribe('ServiceEntryUpdated', async (event) => {
    if (event.payload.icon) {
      await promoteFromEvent(event, event.payload.icon, 'service_entry_updated');
    }
  });
  eventBus.subscribe('TransitModeProfileUpdated', async (event) => {
    for (const profile of event.payload.modes) {
      await promoteFromEvent(event, profile.icon, 'transit_mode_profile_updated');
    }
  });
  eventBus.subscribe('TravelScheduleServiceProfileUpdated', async (event) => {
    for (const profile of event.payload.services) {
      await promoteFromEvent(event, profile.icon, 'travel_service_profile_updated');
    }
  });
  eventBus.subscribe('PoiPublished', async (event) => {
    for (const facility of event.payload.facilities ?? []) {
      await promoteFromEvent(event, facility.symbolIcon, 'poi_published');
    }
  });
  eventBus.subscribe('LegacyMapMarkerUpdated', async (event) => {
    for (const facility of event.payload.facilities ?? []) {
      await promoteFromEvent(event, facility.symbolIcon, 'legacy_map_marker_updated');
    }
  });
}

async function promoteFromEvent(
  event: Extract<
    YctEvent,
    {
      type:
        | 'ServiceEntrySubmitted'
        | 'ServiceEntryUpdated'
        | 'TransitModeProfileUpdated'
        | 'TravelScheduleServiceProfileUpdated'
        | 'PoiPublished'
        | 'LegacyMapMarkerUpdated';
    }
  >,
  iconName: string,
  reason:
    | 'service_entry_submitted'
    | 'service_entry_updated'
    | 'transit_mode_profile_updated'
    | 'travel_service_profile_updated'
    | 'poi_published'
    | 'legacy_map_marker_updated',
): Promise<void> {
  await promoteMaterialSymbolAsset({
    iconName,
    actorId: event.actor.id ?? 'material-symbol-asset-listener',
    reason,
  }).catch(() => undefined);
}
