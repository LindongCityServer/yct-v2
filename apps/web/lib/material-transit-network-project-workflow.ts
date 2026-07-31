import { randomUUID } from 'node:crypto';
import type { MaterialTransitNetworkProject } from '@yct/contracts';
import type {
  MaterialTransitNetworkProjectCreateInput,
  MaterialTransitNetworkProjectUpdateInput,
} from '@yct/schemas';
import { materialTransitNetworkSnapshotSchema } from '@yct/schemas';
import { publishDomainEvent } from './app-event-bus';
import {
  deleteMaterialTransitNetworkProject,
  findMaterialTransitNetworkProject,
  listMaterialTransitNetworkProjects,
  writeMaterialTransitNetworkProject,
} from './material-transit-network-project-store';

interface MaterialTransitNetworkProjectFailure {
  ok: false;
  status: number;
  error: string;
  message: string;
}

type MaterialTransitNetworkProjectResult =
  { ok: true; project: MaterialTransitNetworkProject } | MaterialTransitNetworkProjectFailure;

export async function listMaterialTransitNetworkProjectsForUser(
  ownerId: string,
): Promise<MaterialTransitNetworkProject[]> {
  return (await listMaterialTransitNetworkProjects()).filter(
    (project) => project.ownerId === ownerId,
  );
}

export async function createMaterialTransitNetworkProject(input: {
  ownerId: string;
  project: MaterialTransitNetworkProjectCreateInput;
}): Promise<MaterialTransitNetworkProjectResult> {
  const now = new Date().toISOString();
  const existing = (await listMaterialTransitNetworkProjectsForUser(input.ownerId))[0];
  const project: MaterialTransitNetworkProject = {
    id: existing?.id ?? `material_network_${randomUUID()}`,
    ownerId: input.ownerId,
    fileName: input.project.fileName,
    snapshot: input.project.snapshot,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await writeMaterialTransitNetworkProject(project);
  await publishDomainEvent({
    eventId: `event_${randomUUID()}`,
    type: 'MaterialTransitNetworkProjectImported',
    occurredAt: now,
    actor: { type: 'user', id: input.ownerId },
    payload: {
      projectId: project.id,
      ownerId: input.ownerId,
      fileName: project.fileName,
      rmpVersion: project.snapshot.version,
      importedAt: now,
    },
  });
  return { ok: true, project };
}

export async function updateMaterialTransitNetworkProject(input: {
  ownerId: string;
  projectId: string;
  update: MaterialTransitNetworkProjectUpdateInput;
}): Promise<MaterialTransitNetworkProjectResult> {
  const current = await findOwnedProject(input.projectId, input.ownerId);
  if (!current) return projectNotFound();
  const snapshotResult = materialTransitNetworkSnapshotSchema.safeParse({
    ...current.snapshot,
    lineNames: input.update.lineNames.length ? input.update.lineNames : undefined,
  });
  if (!snapshotResult.success) {
    return {
      ok: false,
      status: 400,
      error: 'invalid_material_transit_network_project',
      message: '线路名称引用了项目中不存在或重复的线路。',
    };
  }
  const now = new Date().toISOString();
  const project: MaterialTransitNetworkProject = {
    ...current,
    snapshot: snapshotResult.data,
    updatedAt: now,
  };
  await writeMaterialTransitNetworkProject(project);
  await publishDomainEvent({
    eventId: `event_${randomUUID()}`,
    type: 'MaterialTransitNetworkProjectUpdated',
    occurredAt: now,
    actor: { type: 'user', id: input.ownerId },
    payload: {
      projectId: project.id,
      ownerId: input.ownerId,
      changedFields: ['lineNames'],
      updatedAt: now,
    },
  });
  return { ok: true, project };
}

export async function removeMaterialTransitNetworkProject(input: {
  ownerId: string;
  projectId: string;
}): Promise<{ ok: true } | MaterialTransitNetworkProjectFailure> {
  const current = await findOwnedProject(input.projectId, input.ownerId);
  if (!current) return projectNotFound();
  await deleteMaterialTransitNetworkProject(current.id);
  const now = new Date().toISOString();
  await publishDomainEvent({
    eventId: `event_${randomUUID()}`,
    type: 'MaterialTransitNetworkProjectDeleted',
    occurredAt: now,
    actor: { type: 'user', id: input.ownerId },
    payload: { projectId: current.id, ownerId: input.ownerId, deletedAt: now },
  });
  return { ok: true };
}

async function findOwnedProject(
  projectId: string,
  ownerId: string,
): Promise<MaterialTransitNetworkProject | undefined> {
  const project = await findMaterialTransitNetworkProject(projectId);
  return project?.ownerId === ownerId ? project : undefined;
}

function projectNotFound(): MaterialTransitNetworkProjectFailure {
  return {
    ok: false,
    status: 404,
    error: 'material_transit_network_project_not_found',
    message: '线网项目草稿不存在或不属于当前用户。',
  };
}
