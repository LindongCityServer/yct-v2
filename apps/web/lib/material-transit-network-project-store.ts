import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { MaterialTransitNetworkProject } from '@yct/contracts';
import { materialTransitNetworkSnapshotSchema } from '@yct/schemas';
import { readRuntimeConfig } from './runtime-config';

interface MaterialTransitNetworkProjectStoreSnapshot {
  version: 1;
  projects: MaterialTransitNetworkProject[];
}

const emptySnapshot: MaterialTransitNetworkProjectStoreSnapshot = { version: 1, projects: [] };
let mutationQueue: Promise<void> = Promise.resolve();

export async function listMaterialTransitNetworkProjects(): Promise<
  MaterialTransitNetworkProject[]
> {
  return (await readSnapshot()).projects.sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  );
}

export async function findMaterialTransitNetworkProject(
  projectId: string,
): Promise<MaterialTransitNetworkProject | undefined> {
  return (await readSnapshot()).projects.find((project) => project.id === projectId);
}

export async function writeMaterialTransitNetworkProject(
  project: MaterialTransitNetworkProject,
): Promise<void> {
  await enqueueMutation(async () => {
    const snapshot = await readSnapshot();
    await writeSnapshot({
      version: 1,
      projects: [...snapshot.projects.filter((item) => item.id !== project.id), project],
    });
  });
}

export async function deleteMaterialTransitNetworkProject(projectId: string): Promise<boolean> {
  let deleted = false;
  await enqueueMutation(async () => {
    const snapshot = await readSnapshot();
    const projects = snapshot.projects.filter((project) => project.id !== projectId);
    deleted = projects.length !== snapshot.projects.length;
    if (deleted) await writeSnapshot({ version: 1, projects });
  });
  return deleted;
}

async function enqueueMutation(operation: () => Promise<void>): Promise<void> {
  const next = mutationQueue.catch(() => undefined).then(operation);
  mutationQueue = next;
  await next;
}

async function readSnapshot(): Promise<MaterialTransitNetworkProjectStoreSnapshot> {
  try {
    const source = await readFile(resolveStorePath(), 'utf8');
    const parsed = JSON.parse(source) as Partial<MaterialTransitNetworkProjectStoreSnapshot>;
    const projects = Array.isArray(parsed.projects)
      ? parsed.projects.filter(isMaterialTransitNetworkProject)
      : [];
    return { version: 1, projects };
  } catch {
    return emptySnapshot;
  }
}

function isMaterialTransitNetworkProject(value: unknown): value is MaterialTransitNetworkProject {
  if (!value || typeof value !== 'object') return false;
  const project = value as Partial<MaterialTransitNetworkProject>;
  return (
    typeof project.id === 'string' &&
    typeof project.ownerId === 'string' &&
    typeof project.fileName === 'string' &&
    typeof project.createdAt === 'string' &&
    typeof project.updatedAt === 'string' &&
    materialTransitNetworkSnapshotSchema.safeParse(project.snapshot).success
  );
}

async function writeSnapshot(snapshot: MaterialTransitNetworkProjectStoreSnapshot): Promise<void> {
  const storePath = resolveStorePath();
  await mkdir(path.dirname(storePath), { recursive: true });
  await writeFile(storePath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
}

function resolveStorePath(): string {
  const config = readRuntimeConfig();
  return path.isAbsolute(config.materialTransitNetworkProjectStorePath)
    ? config.materialTransitNetworkProjectStorePath
    : path.join(
        /*turbopackIgnore: true*/ process.cwd(),
        config.materialTransitNetworkProjectStorePath,
      );
}
