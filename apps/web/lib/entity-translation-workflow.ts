import { randomUUID } from 'node:crypto';
import type {
  EntityTranslationRecord,
  LocalizedLabelMap,
  TranslatableEntityKind,
} from '@yct/contracts';
import { publishDomainEvent } from './app-event-bus';
import { upsertEntityTranslation } from './entity-translation-store';

const entityTypeByKind = {
  map_marker: 'poi',
  transit_line: 'transit_line',
  transit_station: 'transit_station',
} as const satisfies Record<TranslatableEntityKind, 'poi' | 'transit_line' | 'transit_station'>;

export async function updateEntityTranslations(input: {
  entityKind: TranslatableEntityKind;
  entityId: string;
  sourceText: string;
  localizedLabels: LocalizedLabelMap;
  actorId: string;
}): Promise<EntityTranslationRecord> {
  const record = await upsertEntityTranslation(input);
  await Promise.all(
    (['zh-Hant', 'en'] as const).map((locale) =>
      publishDomainEvent({
        eventId: `event_${randomUUID()}`,
        type: 'EntityTranslationUpdated',
        occurredAt: new Date().toISOString(),
        actor: { type: 'admin', id: input.actorId },
        payload: {
          entityType: entityTypeByKind[record.entityKind],
          entityId: record.entityId,
          locale,
          fields: ['label'],
          updatedBy: record.updatedBy,
          updatedAt: record.updatedAt,
        },
      }),
    ),
  );
  return record;
}
