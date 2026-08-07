import { randomUUID } from 'node:crypto';
import type { AdministrativeArea, YctEventType } from '@yct/contracts';
import type { AdministrativeAreaUpsertInput } from '@yct/schemas';
import { publishDomainEvent } from './app-event-bus';
import {
  findAdministrativeArea,
  listAdministrativeAreas,
  saveAdministrativeArea,
} from './administrative-area-store';

export interface AdministrativeAreaActionResult {
  ok: boolean;
  area?: AdministrativeArea;
  areas?: AdministrativeArea[];
  status?: number;
  error?: string;
  message?: string;
}

export async function createAdministrativeArea(input: {
  actorId: string;
  area: AdministrativeAreaUpsertInput;
}): Promise<AdministrativeAreaActionResult> {
  const validation = await validateAreaReferences(input.area);
  if (!validation.ok) return validation;
  const now = new Date().toISOString();
  const area: AdministrativeArea = {
    id: `administrative_area_${randomUUID()}`,
    ...input.area,
    status: 'draft',
    createdAt: now,
    createdBy: input.actorId,
    updatedAt: now,
    updatedBy: input.actorId,
  };
  await saveAdministrativeArea(area);
  await emitAdministrativeAreaEvent('AdministrativeAreaCreated', input.actorId, { area });
  return { ok: true, area };
}

export async function updateAdministrativeArea(input: {
  id: string;
  actorId: string;
  area: AdministrativeAreaUpsertInput;
}): Promise<AdministrativeAreaActionResult> {
  const current = await findAdministrativeArea(input.id);
  if (!current) return notFound();
  if (current.status === 'archived') {
    return invalidState('已归档行政区划必须先恢复为草稿后才能修改。');
  }
  const validation = await validateAreaReferences(input.area, input.id);
  if (!validation.ok) return validation;
  const changedFields = (
    [
      'code',
      'name',
      'level',
      'parentAreaId',
      'boundary',
      'labelPositionPoiId',
      'labelPosition',
      'style',
      'minZoom',
      'maxZoom',
    ] as const
  ).filter((field) => JSON.stringify(current[field]) !== JSON.stringify(input.area[field]));
  if (changedFields.length === 0) return { ok: true, area: current };
  const area: AdministrativeArea = {
    ...current,
    ...input.area,
    updatedAt: new Date().toISOString(),
    updatedBy: input.actorId,
  };
  await saveAdministrativeArea(area);
  await emitAdministrativeAreaEvent('AdministrativeAreaUpdated', input.actorId, {
    area,
    changedFields,
  });
  return { ok: true, area };
}

export async function changeAdministrativeAreaStatus(input: {
  id: string;
  actorId: string;
  action: 'publish' | 'archive' | 'restore';
}): Promise<AdministrativeAreaActionResult> {
  const current = await findAdministrativeArea(input.id);
  if (!current) return notFound();
  const nextStatus =
    input.action === 'publish' ? 'published' : input.action === 'archive' ? 'archived' : 'draft';
  const allowed =
    (input.action === 'publish' && current.status === 'draft') ||
    (input.action === 'archive' && current.status !== 'archived') ||
    (input.action === 'restore' && current.status === 'archived');
  if (!allowed) return invalidState('当前行政区划状态不允许执行该操作。');
  const now = new Date().toISOString();
  const area: AdministrativeArea = {
    ...current,
    status: nextStatus,
    updatedAt: now,
    updatedBy: input.actorId,
    publishedAt: nextStatus === 'published' ? now : current.publishedAt,
    archivedAt: nextStatus === 'archived' ? now : undefined,
  };
  await saveAdministrativeArea(area);
  if (nextStatus === 'published') {
    await emitAdministrativeAreaEvent('AdministrativeAreaPublished', input.actorId, { area });
  } else if (nextStatus === 'archived') {
    await emitAdministrativeAreaEvent('AdministrativeAreaArchived', input.actorId, {
      area,
      previousStatus: current.status as Exclude<AdministrativeArea['status'], 'archived'>,
    });
  } else {
    await emitAdministrativeAreaEvent('AdministrativeAreaUpdated', input.actorId, {
      area,
      changedFields: [],
    });
  }
  return { ok: true, area };
}

async function validateAreaReferences(
  area: AdministrativeAreaUpsertInput,
  currentId?: string,
): Promise<AdministrativeAreaActionResult> {
  const areas = await listAdministrativeAreas();
  if (areas.some((item) => item.code === area.code && item.id !== currentId)) {
    return {
      ok: false,
      status: 409,
      error: 'administrative_area_code_exists',
      message: '行政区划代码已存在。',
    };
  }
  if (area.parentAreaId === currentId) return invalidState('行政区划不能把自身设为上级。');
  if (area.parentAreaId && !areas.some((item) => item.id === area.parentAreaId)) {
    return {
      ok: false,
      status: 422,
      error: 'administrative_area_parent_not_found',
      message: '所选上级行政区划不存在。',
    };
  }
  if (area.parentAreaId) {
    const visited = new Set<string>();
    let parentId: string | undefined = area.parentAreaId;
    while (parentId) {
      if (parentId === currentId || visited.has(parentId)) {
        return invalidState('行政区划上级关系不能形成循环。');
      }
      visited.add(parentId);
      parentId = areas.find((item) => item.id === parentId)?.parentAreaId;
    }
  }
  return { ok: true };
}

function notFound(): AdministrativeAreaActionResult {
  return {
    ok: false,
    status: 404,
    error: 'administrative_area_not_found',
    message: '行政区划不存在。',
  };
}

function invalidState(message: string): AdministrativeAreaActionResult {
  return { ok: false, status: 409, error: 'invalid_administrative_area_state', message };
}

async function emitAdministrativeAreaEvent<
  TType extends Extract<
    YctEventType,
    | 'AdministrativeAreaCreated'
    | 'AdministrativeAreaUpdated'
    | 'AdministrativeAreaPublished'
    | 'AdministrativeAreaArchived'
  >,
>(
  type: TType,
  actorId: string,
  payload: Parameters<typeof publishDomainEvent<TType>>[0]['payload'],
) {
  await publishDomainEvent({
    eventId: `event_${randomUUID()}`,
    type,
    occurredAt: new Date().toISOString(),
    actor: { type: 'admin', id: actorId },
    payload,
  });
}
