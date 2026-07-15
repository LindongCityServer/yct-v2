import { randomUUID } from 'node:crypto';
import type { MapGeometry, YctEventPayloadMap, YctEventType } from '@yct/contracts';
import { publishDomainEvent } from './app-event-bus';
import {
  archiveLegacyMapMarkerOverride,
  upsertLegacyMapMarkerOverride,
  type LegacyMapMarkerPatch,
} from './legacy-map-marker-override-store';

export interface LegacyMapMarkerActionResult {
  ok: boolean;
  markerId?: string;
  status?: number;
  error?: string;
  message?: string;
}

export async function updateLegacyMapMarkerByAdmin(input: {
  markerId: string;
  actorId: string;
  patch: LegacyMapMarkerPatch;
  previous?: Partial<LegacyMapMarkerPatch>;
}): Promise<LegacyMapMarkerActionResult> {
  const markerId = normalizeMarkerId(input.markerId);
  if (!markerId) {
    return invalidMarkerId();
  }

  const normalizedPatch = {
    ...input.patch,
    label: input.patch.label.trim(),
  };
  if (!normalizedPatch.label) {
    return {
      ok: false,
      status: 400,
      error: 'invalid_legacy_map_marker_update',
      message: '旧有标记点名称不能为空。',
    };
  }

  const changedFields = getChangedLegacyMapMarkerFields(input.previous, normalizedPatch);
  await upsertLegacyMapMarkerOverride({
    markerId,
    patch: normalizedPatch,
    actorId: input.actorId,
  });

  await emitEvent('LegacyMapMarkerUpdated', input.actorId, {
    markerId,
    updatedBy: input.actorId,
    updatedAt: new Date().toISOString(),
    changedFields,
  });

  return { ok: true, markerId };
}

export async function archiveLegacyMapMarkerByAdmin(input: {
  markerId: string;
  actorId: string;
}): Promise<LegacyMapMarkerActionResult> {
  const markerId = normalizeMarkerId(input.markerId);
  if (!markerId) {
    return invalidMarkerId();
  }

  await archiveLegacyMapMarkerOverride({
    markerId,
    actorId: input.actorId,
  });

  await emitEvent('LegacyMapMarkerArchived', input.actorId, {
    markerId,
    archivedBy: input.actorId,
    archivedAt: new Date().toISOString(),
  });

  return { ok: true, markerId };
}

function normalizeMarkerId(markerId: string): string {
  return markerId.trim();
}

function invalidMarkerId(): LegacyMapMarkerActionResult {
  return {
    ok: false,
    status: 400,
    error: 'invalid_legacy_map_marker_id',
    message: '旧有标记点 ID 不符合要求。',
  };
}

function getChangedLegacyMapMarkerFields(
  previous: Partial<LegacyMapMarkerPatch> | undefined,
  patch: LegacyMapMarkerPatch,
): Array<
  | 'label'
  | 'categoryId'
  | 'iconFileName'
  | 'description'
  | 'href'
  | 'imageUrl'
  | 'geometry'
  | 'parentMarkerId'
  | 'boundRegionMarkerIds'
  | 'openingHours'
  | 'address'
  | 'addressRoadMarkerId'
  | 'facilities'
> {
  const textFields = (
    [
      'label',
      'categoryId',
      'iconFileName',
      'description',
      'href',
      'imageUrl',
      'parentMarkerId',
      'openingHours',
      'address',
      'addressRoadMarkerId',
    ] as const
  ).filter((field) => (previous?.[field] ?? '') !== (patch[field] ?? ''));
  const previousGeometry = previous?.geometry as MapGeometry | undefined;
  const geometryChanged =
    patch.geometry !== undefined &&
    JSON.stringify(previousGeometry) !== JSON.stringify(patch.geometry);

  const regionBindingsChanged =
    JSON.stringify(previous?.boundRegionMarkerIds ?? []) !==
    JSON.stringify(patch.boundRegionMarkerIds ?? []);
  const facilitiesChanged =
    JSON.stringify(previous?.facilities ?? []) !== JSON.stringify(patch.facilities ?? []);
  return [
    ...textFields,
    ...(geometryChanged ? (['geometry'] as const) : []),
    ...(regionBindingsChanged ? (['boundRegionMarkerIds'] as const) : []),
    ...(facilitiesChanged ? (['facilities'] as const) : []),
  ];
}

async function emitEvent<TType extends YctEventType>(
  type: TType,
  actorId: string,
  payload: YctEventPayloadMap[TType],
): Promise<void> {
  await publishDomainEvent({
    eventId: `event_${randomUUID()}`,
    type,
    occurredAt: new Date().toISOString(),
    actor: {
      type: 'admin',
      id: actorId,
    },
    payload,
  });
}
