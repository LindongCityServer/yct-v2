import type { YctEvent } from '@yct/contracts';
import { getAppEventBus, publishDomainEvent } from './app-event-bus';

let registered = false;

export function ensureRoutingTopologyInvalidationListenersRegistered(): void {
  if (registered) {
    return;
  }

  registered = true;
  const eventBus = getAppEventBus();
  eventBus.subscribe('PoiPublished', async (event) => {
    await publishRoutingTopologyInvalidated(event, 'poi', [event.payload.poiId], 'poi_published');
  });
  eventBus.subscribe('PoiSubmissionUpdated', async (event) => {
    if (!event.payload.changedFields.some((field) => field === 'geometry' || field === 'spatial')) {
      return;
    }
    await publishRoutingTopologyInvalidated(
      event,
      'poi',
      [event.payload.poiId],
      'poi_spatial_updated',
    );
  });
  eventBus.subscribe('PoiArchived', async (event) => {
    await publishRoutingTopologyInvalidated(event, 'poi', [event.payload.poiId], 'poi_archived');
  });
  eventBus.subscribe('LegacyMapMarkerUpdated', async (event) => {
    await publishRoutingTopologyInvalidated(
      event,
      'legacy_map_marker',
      [event.payload.markerId],
      'legacy_map_marker_updated',
    );
  });
  eventBus.subscribe('LegacyMapMarkerArchived', async (event) => {
    await publishRoutingTopologyInvalidated(
      event,
      'legacy_map_marker',
      [event.payload.markerId],
      'legacy_map_marker_archived',
    );
  });
  eventBus.subscribe('TransitDataRevisionPublished', async (event) => {
    await publishRoutingTopologyInvalidated(
      event,
      'transit_revision',
      [event.payload.datasetId, event.payload.revisionId],
      'transit_revision_published',
    );
  });
  eventBus.subscribe('MapSpatialProfileUpdated', async (event) => {
    await publishRoutingTopologyInvalidated(
      event,
      'map_spatial_profile',
      [event.payload.profile.mapId],
      'map_spatial_profile_updated',
    );
  });
}

async function publishRoutingTopologyInvalidated(
  event: Extract<
    YctEvent,
    {
      type:
        | 'PoiPublished'
        | 'PoiSubmissionUpdated'
        | 'PoiArchived'
        | 'LegacyMapMarkerUpdated'
        | 'LegacyMapMarkerArchived'
        | 'TransitDataRevisionPublished'
        | 'MapSpatialProfileUpdated';
    }
  >,
  sourceKind: 'poi' | 'legacy_map_marker' | 'transit_revision' | 'map_spatial_profile',
  sourceIds: string[],
  reason:
    | 'poi_published'
    | 'poi_spatial_updated'
    | 'poi_archived'
    | 'legacy_map_marker_updated'
    | 'legacy_map_marker_archived'
    | 'transit_revision_published'
    | 'map_spatial_profile_updated',
): Promise<void> {
  const invalidatedAt = new Date().toISOString();
  await publishDomainEvent({
    eventId: `routing_topology_invalidated_${event.eventId}`,
    type: 'RoutingTopologyInvalidated',
    occurredAt: invalidatedAt,
    actor: {
      type: 'system',
      id: 'routing_topology_invalidation_listener',
    },
    payload: {
      sourceEventId: event.eventId,
      sourceKind,
      sourceIds,
      reason,
      invalidatedAt,
    },
  });
}
