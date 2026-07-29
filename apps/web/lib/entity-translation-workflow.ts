import { randomUUID } from 'node:crypto';
import type {
  EntityTranslationRecord,
  LocalizedLabelMap,
  TranslatableEntityKind,
} from '@yct/contracts';
import { publishDomainEvent } from './app-event-bus';
import {
  findEntityTranslation,
  normalizeMaterialTransitLineNumber,
  normalizeRoadSignPinyin,
  upsertEntityTranslation,
} from './entity-translation-store';

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
  roadSignPinyin?: string;
  materialLineNumber?: string;
  actorId: string;
}): Promise<EntityTranslationRecord> {
  const previous = await findEntityTranslation(input.entityKind, input.entityId);
  const record = await upsertEntityTranslation(input);
  const events: Array<Promise<void>> = (['zh-Hant', 'en'] as const).map((locale) =>
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
  );
  const nextPinyin = normalizeRoadSignPinyin(input.roadSignPinyin);
  if (
    Object.prototype.hasOwnProperty.call(input, 'roadSignPinyin') &&
    previous?.roadSignPinyin !== nextPinyin
  ) {
    const occurredAt = record.updatedAt;
    events.push(
      nextPinyin
        ? publishDomainEvent({
            eventId: `event_${randomUUID()}`,
            type: 'MaterialRoadPinyinOverrideUpserted',
            occurredAt,
            actor: { type: 'admin', id: input.actorId },
            payload: {
              roadName: record.sourceText,
              pinyin: nextPinyin,
              actorId: input.actorId,
              occurredAt,
            },
          })
        : publishDomainEvent({
            eventId: `event_${randomUUID()}`,
            type: 'MaterialRoadPinyinOverrideDeleted',
            occurredAt,
            actor: { type: 'admin', id: input.actorId },
            payload: {
              roadName: record.sourceText,
              actorId: input.actorId,
              occurredAt,
            },
          }),
    );
  }
  const nextLineNumber = normalizeMaterialTransitLineNumber(input.materialLineNumber);
  if (
    Object.prototype.hasOwnProperty.call(input, 'materialLineNumber') &&
    previous?.materialLineNumber !== nextLineNumber
  ) {
    const occurredAt = record.updatedAt;
    events.push(
      nextLineNumber
        ? publishDomainEvent({
            eventId: `event_${randomUUID()}`,
            type: 'MaterialTransitLineNumberOverrideUpserted',
            occurredAt,
            actor: { type: 'admin', id: input.actorId },
            payload: {
              lineId: record.entityId,
              lineNumber: nextLineNumber,
              actorId: input.actorId,
              occurredAt,
            },
          })
        : publishDomainEvent({
            eventId: `event_${randomUUID()}`,
            type: 'MaterialTransitLineNumberOverrideDeleted',
            occurredAt,
            actor: { type: 'admin', id: input.actorId },
            payload: {
              lineId: record.entityId,
              actorId: input.actorId,
              occurredAt,
            },
          }),
    );
  }
  await Promise.all(events);
  return record;
}
