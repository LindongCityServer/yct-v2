import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  MapGeometry,
  MapMarkerSnapshot,
  MapMarkerSpatialMetadata,
  PoiFacilitySnapshot,
} from '@yct/contracts';
import { readRuntimeConfig } from './runtime-config';

export interface LegacyMapMarkerPatch {
  label: string;
  categoryId?: string;
  iconFileName?: string;
  description?: string;
  href?: string;
  imageUrls?: string[];
  imageUrl?: string;
  geometry?: MapGeometry;
  spatial?: MapMarkerSpatialMetadata;
  parentMarkerId?: string;
  floorLabel?: string;
  boundRegionMarkerIds?: string[];
  openingHours?: string;
  address?: string;
  addressRoadMarkerId?: string;
  facilities?: PoiFacilitySnapshot[];
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
  options: Readonly<{ hideRoadPointGroupSources?: boolean }> = {},
): Promise<MapMarkerSnapshot> {
  const overrides = await listLegacyMapMarkerOverrides();
  if (overrides.length === 0) {
    return snapshot;
  }

  const overrideByMarkerId = new Map(overrides.map((override) => [override.markerId, override]));
  const hideRoadPointGroupSources = options.hideRoadPointGroupSources ?? true;
  const overriddenRoadSourceMarkerIds = new Set<string>();

  // 点组是接口运行时按同名道路点生成的，没有稳定的原始记录 ID。
  // 根据生成规则反推点组 ID，覆盖点组时同时隐藏它最初包含的源点；
  // 这样点组改名或调整几何后，旧源点不会重新作为独立 POI 出现。
  if (hideRoadPointGroupSources) {
    const roadPointGroups = new Map<string, MapMarkerSnapshot['markers'][number][]>();
    for (const marker of snapshot.markers) {
      if (marker.geometry.type !== 'Point' || !isRoadMarker(marker)) {
        continue;
      }

      const label = normalizeMarkerLabelText(marker.label);
      if (!label) {
        continue;
      }

      const group = roadPointGroups.get(label) ?? [];
      group.push(marker);
      roadPointGroups.set(label, group);
    }
    for (const [label, markers] of roadPointGroups) {
      if (markers.length < 2) {
        continue;
      }

      const groupId = `road-endpoints-${stableMarkerId(label)}`;
      if (!overrideByMarkerId.has(groupId)) {
        continue;
      }

      for (const marker of markers) {
        overriddenRoadSourceMarkerIds.add(marker.id);
      }
    }
  }

  return {
    ...snapshot,
    markers: snapshot.markers.flatMap((marker) => {
      if (
        marker.geometry.type === 'Point' &&
        isRoadMarker(marker) &&
        overriddenRoadSourceMarkerIds.has(marker.id)
      ) {
        return [];
      }

      const override =
        !hideRoadPointGroupSources && isRoadGroupMarker(marker)
          ? undefined
          : overrideByMarkerId.get(marker.id);
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

function isRoadGroupMarker(marker: MapMarkerSnapshot['markers'][number]): boolean {
  return marker.id.startsWith('road-endpoints-') && marker.geometry.type === 'MultiPoint';
}

function isRoadMarker(marker: MapMarkerSnapshot['markers'][number]): boolean {
  const iconBaseName =
    marker.iconFileName
      ?.trim()
      .split(/[\\/]/)
      .pop()
      ?.replace(/\.[^.]+$/u, '')
      .toLowerCase() ?? '';
  return (
    marker.categoryId === 'road' ||
    marker.categoryId === 'roadpoint' ||
    marker.categoryId === 'highway-s1' ||
    marker.categoryId === 'toll-gate' ||
    iconBaseName === 'road' ||
    iconBaseName === 'roadpoint' ||
    iconBaseName === 'highway-s1' ||
    iconBaseName === 'toll-gate'
  );
}

function normalizeMarkerLabelText(value: string): string {
  return value
    .replace(/[\s\u3000]+/g, '')
    .replace(/[|｜]+/g, '')
    .trim();
}

function stableMarkerId(value: string): string {
  return (
    encodeURIComponent(value.trim().toLowerCase()).replace(/%/g, '-').slice(0, 120) || 'unnamed'
  );
}

function normalizePatch(patch: LegacyMapMarkerPatch): LegacyMapMarkerPatch {
  const normalized: LegacyMapMarkerPatch = {
    label: patch.label.trim(),
    categoryId: normalizeOptionalText(patch.categoryId),
    iconFileName: normalizeOptionalText(patch.iconFileName),
    description: normalizeOptionalText(patch.description),
    href: normalizeOptionalText(patch.href),
    imageUrls: normalizeImageUrls(patch.imageUrls, patch.imageUrl),
    imageUrl: normalizeImageUrls(patch.imageUrls, patch.imageUrl)?.[0],
    parentMarkerId: normalizeOptionalText(patch.parentMarkerId),
    floorLabel: normalizeOptionalText(patch.floorLabel),
    boundRegionMarkerIds: normalizeIdList(patch.boundRegionMarkerIds),
    openingHours: normalizeOptionalText(patch.openingHours),
    address: normalizeOptionalText(patch.address),
    addressRoadMarkerId: normalizeOptionalText(patch.addressRoadMarkerId),
    facilities: normalizeFacilities(patch.facilities),
    spatial: patch.spatial,
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

function normalizeImageUrls(
  imageUrls: string[] | undefined,
  legacyImageUrl?: string,
): string[] | undefined {
  const normalized = Array.from(
    new Set(
      [...(imageUrls ?? []), ...(legacyImageUrl ? [legacyImageUrl] : [])]
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ).slice(0, 12);
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeIdList(values: string[] | undefined): string[] | undefined {
  const normalized = Array.from(
    new Set(values?.map((value) => value.trim()).filter(Boolean) ?? []),
  );
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeFacilities(
  facilities: PoiFacilitySnapshot[] | undefined,
): PoiFacilitySnapshot[] | undefined {
  const normalized =
    facilities
      ?.map((facility) => ({
        symbolIcon: facility.symbolIcon.trim(),
        description: facility.description.trim(),
      }))
      .filter((facility) => facility.symbolIcon && facility.description) ?? [];
  return normalized.length > 0 ? normalized : undefined;
}
