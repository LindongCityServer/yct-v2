import { randomUUID } from 'node:crypto';
import type {
  MaterialTransitNetworkProject,
  MaterialTransitNetworkSupplement,
  MaterialTransitStationProfile,
} from '@yct/contracts';
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
    // 单线网下重新导入是替换几何；车站资料按 nodeId 保留，避免用户白填。
    supplement: existing?.supplement,
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
  const stationNamesByNodeId = new Map(
    (input.update.stationNames ?? []).map((station) => [station.nodeId, station.names] as const),
  );
  for (const nodeId of stationNamesByNodeId.keys()) {
    const node = current.snapshot.nodes.find((candidate) => candidate.id === nodeId);
    if (node?.kind !== 'station') {
      return {
        ok: false,
        status: 400,
        error: 'invalid_material_transit_network_project',
        message: '站点名称引用了项目中不存在的车站。',
      };
    }
  }
  for (const profile of input.update.stationProfiles ?? []) {
    const node = current.snapshot.nodes.find((candidate) => candidate.id === profile.nodeId);
    if (node?.kind !== 'station') {
      return {
        ok: false,
        status: 400,
        error: 'invalid_material_transit_network_project',
        message: '车站资料引用了项目中不存在的车站。',
      };
    }
  }
  const snapshotResult = materialTransitNetworkSnapshotSchema.safeParse({
    ...current.snapshot,
    nodes: stationNamesByNodeId.size
      ? current.snapshot.nodes.map((node) => {
          const names = stationNamesByNodeId.get(node.id);
          return names ? { ...node, names } : node;
        })
      : current.snapshot.nodes,
    lineNames:
      input.update.lineNames === undefined
        ? current.snapshot.lineNames
        : input.update.lineNames.length
          ? input.update.lineNames
          : undefined,
  });
  if (!snapshotResult.success) {
    return {
      ok: false,
      status: 400,
      error: 'invalid_material_transit_network_project',
      message: '线路或站点名称补充信息与当前项目不匹配。',
    };
  }
  const now = new Date().toISOString();
  const changedFields: Array<'lineNames' | 'stationNames' | 'stationProfiles'> = [];
  if (input.update.lineNames !== undefined) changedFields.push('lineNames');
  if (input.update.stationNames !== undefined) changedFields.push('stationNames');
  if (input.update.stationProfiles !== undefined) changedFields.push('stationProfiles');
  const project: MaterialTransitNetworkProject = {
    ...current,
    snapshot: snapshotResult.data,
    supplement: mergeStationProfiles(current.supplement, input.update.stationProfiles),
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
      changedFields,
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

/**
 * 车站资料按 nodeId 合并：未提交的车站保留旧资料，提交空资料的站视为清空。
 * 这样维护面板可以只发送改动过的站，也不会因为重新导入把其它站资料抹掉。
 */
function mergeStationProfiles(
  current: MaterialTransitNetworkSupplement | undefined,
  incoming: MaterialTransitStationProfile[] | undefined,
): MaterialTransitNetworkSupplement | undefined {
  if (incoming === undefined) return current;
  const byNodeId = new Map(
    (current?.stations ?? []).map((profile) => [profile.nodeId, profile] as const),
  );
  for (const profile of incoming) {
    if (!profile.structure && !profile.exits?.length && !profile.note) {
      byNodeId.delete(profile.nodeId);
      continue;
    }
    byNodeId.set(profile.nodeId, profile);
  }
  const stations = [...byNodeId.values()].sort((left, right) =>
    left.nodeId.localeCompare(right.nodeId),
  );
  if (!stations.length && !current) return undefined;
  return { ...current, stations };
}

function projectNotFound(): MaterialTransitNetworkProjectFailure {
  return {
    ok: false,
    status: 404,
    error: 'material_transit_network_project_not_found',
    message: '线网项目草稿不存在或不属于当前用户。',
  };
}
