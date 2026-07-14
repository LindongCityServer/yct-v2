import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { MapGeometry, MapMarkerSnapshot } from '@yct/contracts';
import { readRuntimeConfig } from './runtime-config';

export interface LegacyMapMarkerPatch {
  label: string;
  categoryId?: string;
  iconFileName?: string;
  description?: string;
  href?: string;
  imageUrl?: string;
  geometry?: MapGeometry;
}

export interface LegacyMapMarkerOverride {
  markerId: string;
  status: 'active' | 'archived';
  patch?: LegacyMapMarkerPatch;
  updatedBy?: string;
  updatedAt?: string;
  archivedBy?: string;
  archivedAt?: string;
}

interface LegacyMapMarkerOverrideSnapshot {
  version: 1;
  overrides: LegacyMapMarkerOverride[];
}

const emptySnapshot: LegacyMapMarkerOverrideSnapshot = {
  version: 1,
  overrides: [],
};

export async function listLegacyMapMarkerOverrides(): Promise<LegacyMapMarkerOverride[]> {
  return (await readSnapshot()).overrides;
}

export async function upsertLegacyMapMarkerOverride(input: {
  markerId: string;
  patch: LegacyMapMarkerPatch;
  actorId: string;
}): Promise<LegacyMapMarkerOverride> {
  const snapshot = await readSnapshot();
  const now = new Date().toISOString();
  const override: LegacyMapMarkerOverride = {
    markerId: input.markerId,
    status: 'active',
    patch: normalizePatch(input.patch),
    updatedBy: input.actorId,
    updatedAt: now,
  };
  await writeSnapshot({
    ...snapshot,
    overrides: [
      ...snapshot.overrides.filter((item) => item.markerId !== input.markerId),
      override,
    ].sort((left, right) => left.markerId.localeCompare(right.markerId)),
  });
  return override;
}

export async function archiveLegacyMapMarkerOverride(input: {
  markerId: string;
  actorId: string;
}): Promise<LegacyMapMarkerOverride> {
  const snapshot = await readSnapshot();
  const existing = snapshot.overrides.find((item) => item.markerId === input.markerId);
  const now = new Date().toISOString();
  const override: LegacyMapMarkerOverride = {
    markerId: input.markerId,
    status: 'archived',
    patch: existing?.patch,
    updatedBy: existing?.updatedBy,
    updatedAt: existing?.updatedAt,
    archivedBy: input.actorId,
    archivedAt: now,
  };
  await writeSnapshot({
    ...snapshot,
    overrides: [
      ...snapshot.overrides.filter((item) => item.markerId !== input.markerId),
      override,
    ].sort((left, right) => left.markerId.localeCompare(right.markerId)),
  });
  return override;
}

export async function applyLegacyMapMarkerOverrides(
  snapshot: MapMarkerSnapshot,
): Promise<MapMarkerSnapshot> {
  const overrides = await listLegacyMapMarkerOverrides();
  if (overrides.length === 0) {
    return snapshot;
  }

  const overrideByMarkerId = new Map(overrides.map((override) => [override.markerId, override]));
  return {
    ...snapshot,
    markers: snapshot.markers.flatMap((marker) => {
      const override = overrideByMarkerId.get(marker.id);
      if (!override) {
        return [marker];
      }
      if (override.status === 'archived') {
        return [];
      }
      return [{ ...marker, ...override.patch }];
    }),
  };
}

function normalizePatch(patch: LegacyMapMarkerPatch): LegacyMapMarkerPatch {
  const normalized: LegacyMapMarkerPatch = {
    label: patch.label.trim(),
    categoryId: normalizeOptionalText(patch.categoryId),
    iconFileName: normalizeOptionalText(patch.iconFileName),
    description: normalizeOptionalText(patch.description),
    href: normalizeOptionalText(patch.href),
    imageUrl: normalizeOptionalText(patch.imageUrl),
  };
  if (patch.geometry) {
    normalized.geometry = patch.geometry;
  }
  return normalized;
}

async function readSnapshot(): Promise<LegacyMapMarkerOverrideSnapshot> {
  const storePath = resolveStorePath();
  try {
    const source = await readFile(storePath, 'utf8');
    const parsed = JSON.parse(source) as LegacyMapMarkerOverrideSnapshot;
    return {
      version: 1,
      overrides: Array.isArray(parsed.overrides) ? parsed.overrides : [],
    };
  } catch {
    return emptySnapshot;
  }
}

async function writeSnapshot(snapshot: LegacyMapMarkerOverrideSnapshot): Promise<void> {
  const storePath = resolveStorePath();
  await mkdir(path.dirname(storePath), { recursive: true });
  await writeFile(storePath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
}

function resolveStorePath(): string {
  const config = readRuntimeConfig();
  return path.isAbsolute(config.legacyMapMarkerOverrideStorePath)
    ? config.legacyMapMarkerOverrideStorePath
    : path.join(/*turbopackIgnore: true*/ process.cwd(), config.legacyMapMarkerOverrideStorePath);
}

function normalizeOptionalText(value: string | undefined): string | undefined {
  const trimmed = value?.trim() ?? '';
  return trimmed || undefined;
}
