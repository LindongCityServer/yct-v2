import { randomUUID } from 'node:crypto';
import type { PoiCategory, YctEvent, YctEventPayloadMap, YctEventType } from '@yct/contracts';
import { publishDomainEvent } from './app-event-bus';
import {
  listPoiCategoryProfiles,
  replacePoiCategoryProfiles,
} from './poi-category-profile-store';
import { clearPoiCategoryCache } from './poi-categories';

export interface PoiCategoryProfileUpdateResult {
  ok: boolean;
  categories?: PoiCategory[];
  status?: number;
  error?: string;
  message?: string;
}

export async function listAdminPoiCategoryProfiles(): Promise<PoiCategory[]> {
  return listPoiCategoryProfiles();
}

export async function updatePoiCategoryProfiles(input: {
  categories: PoiCategory[];
  actorId: string;
}): Promise<PoiCategoryProfileUpdateResult> {
  const categories = await replacePoiCategoryProfiles(input.categories);
  clearPoiCategoryCache();
  const updatedAt = new Date().toISOString();

  await emitEvent(
    'PoiCategoryProfileUpdated',
    {
      type: 'admin',
      id: input.actorId,
    },
    {
      categories: categories.map((category) => ({
        id: category.id,
        name: category.name,
        iconFileNames: category.iconMapping.iconFileNames,
        defaultIconFileName: category.iconMapping.defaultIconFileName,
        acceptsPublicSubmissions: category.acceptsPublicSubmissions,
        sortOrder: category.sortOrder,
      })),
      updatedBy: input.actorId,
      updatedAt,
    },
  );

  return { ok: true, categories };
}

async function emitEvent<TType extends YctEventType>(
  type: TType,
  actor: YctEvent<TType>['actor'],
  payload: YctEventPayloadMap[TType],
): Promise<void> {
  await publishDomainEvent({
    eventId: `event_${randomUUID()}`,
    type,
    occurredAt: new Date().toISOString(),
    actor,
    payload,
  });
}
