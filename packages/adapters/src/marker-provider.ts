import type {
  MapMarkerSnapshot,
  MarkerProvider,
  PoiCategory,
  PoiIconMapping,
  YctProfileId,
} from '@yct/contracts';

export interface PngPoiIconCandidate {
  fileName: string;
  categoryHint: string;
}

export function groupPoiIconsByCategory(candidates: PngPoiIconCandidate[]): PoiIconMapping[] {
  const groups = new Map<string, string[]>();

  for (const candidate of candidates) {
    const files = groups.get(candidate.categoryHint) ?? [];
    files.push(candidate.fileName);
    groups.set(candidate.categoryHint, files);
  }

  return Array.from(groups.entries()).map(([categoryId, iconFileNames]) => ({
    categoryId,
    iconFileNames,
    defaultIconFileName: iconFileNames[0] ?? '',
  }));
}

interface SemanticPoiIconCategory {
  id: string;
  name: string;
  sortOrder: number;
  match: (fileName: string, baseName: string) => boolean;
}

const semanticPoiIconCategories: SemanticPoiIconCategory[] = [
  {
    id: 'road',
    name: '道路',
    sortOrder: 10,
    match: (_fileName, baseName) =>
      ['road', 'roadpoint', 'highway-s1', 'toll-gate'].includes(baseName),
  },
  {
    id: 'metro-station',
    name: '地铁站',
    sortOrder: 20,
    match: (_fileName, baseName) => ['lindong-metro', 'lindong-metro-transfer'].includes(baseName),
  },
  {
    id: 'metro-entrance',
    name: '地铁出入口',
    sortOrder: 30,
    match: (_fileName, baseName) =>
      baseName === 'way-in' || baseName === 'way-out' || /^exit(?:-[a-z0-9]+)?$/i.test(baseName),
  },
  {
    id: 'bus-stop',
    name: '公交站',
    sortOrder: 40,
    match: (_fileName, baseName) => baseName === 'bus-stop',
  },
  {
    id: 'tram-station',
    name: '有轨电车站',
    sortOrder: 50,
    match: (_fileName, baseName) => baseName === 'songshanhu-tram',
  },
  {
    id: 'railway-station',
    name: '铁路车站',
    sortOrder: 60,
    match: (_fileName, baseName) => ['railway-station', 'local-railway-station'].includes(baseName),
  },
  {
    id: 'coach-station',
    name: '客运站',
    sortOrder: 70,
    match: (_fileName, baseName) => baseName === 'coach-station',
  },
  {
    id: 'ferry-port',
    name: '轮渡码头',
    sortOrder: 80,
    match: (_fileName, baseName) => baseName === 'ferry-port',
  },
  {
    id: 'airport',
    name: '机场',
    sortOrder: 90,
    match: (_fileName, baseName) => baseName === 'airport',
  },
  {
    id: 'parking',
    name: '停车',
    sortOrder: 100,
    match: (_fileName, baseName) => baseName === 'parking',
  },
  {
    id: 'park',
    name: '公园绿地',
    sortOrder: 110,
    match: (_fileName, baseName) => baseName === 'park',
  },
  {
    id: 'scenery',
    name: '景点',
    sortOrder: 120,
    match: (_fileName, baseName) => baseName === 'scenery',
  },
  {
    id: 'museum',
    name: '展馆',
    sortOrder: 130,
    match: (_fileName, baseName) => baseName === 'museum',
  },
  {
    id: 'education',
    name: '教育',
    sortOrder: 140,
    match: (_fileName, baseName) => baseName === 'school',
  },
  {
    id: 'medical',
    name: '医疗',
    sortOrder: 150,
    match: (_fileName, baseName) => baseName === 'hospital',
  },
  {
    id: 'dining',
    name: '餐饮',
    sortOrder: 160,
    match: (_fileName, baseName) =>
      ['eastern-restaurant', 'western-restaurant', 'cafe'].includes(baseName),
  },
  {
    id: 'commerce',
    name: '商业',
    sortOrder: 170,
    match: (_fileName, baseName) => ['business', 'shop', 'bank', 'hotel'].includes(baseName),
  },
  {
    id: 'public-service',
    name: '公共服务',
    sortOrder: 180,
    match: (_fileName, baseName) => ['public-service', 'gov1'].includes(baseName),
  },
  {
    id: 'residence',
    name: '居住区',
    sortOrder: 190,
    match: (_fileName, baseName) => baseName === 'residence',
  },
  {
    id: 'industry',
    name: '产业设施',
    sortOrder: 200,
    match: (_fileName, baseName) => ['factory', 'gas-station'].includes(baseName),
  },
  {
    id: 'sports',
    name: '体育',
    sortOrder: 210,
    match: (_fileName, baseName) => baseName === 'stadium',
  },
  {
    id: 'facility',
    name: '设施',
    sortOrder: 220,
    match: (_fileName, baseName) => ['building', 'hot-spring', 'fix'].includes(baseName),
  },
];

export function buildPoiCategoriesFromIconFileNames(fileNames: string[]): PoiCategory[] {
  const grouped = new Map<string, { category: SemanticPoiIconCategory; fileNames: string[] }>();

  for (const fileName of dedupeFileNames(fileNames)) {
    const category = semanticPoiIconCategories.find((entry) =>
      entry.match(fileName, getIconBaseName(fileName)),
    ) ?? {
      id: inferMarkerCategory(fileName),
      name: getIconBaseName(fileName),
      sortOrder: 10_000,
      match: () => false,
    };
    const group = grouped.get(category.id) ?? { category, fileNames: [] };
    group.fileNames.push(fileName);
    grouped.set(category.id, group);
  }

  return Array.from(grouped.values())
    .sort(
      (left, right) =>
        left.category.sortOrder - right.category.sortOrder ||
        left.category.name.localeCompare(right.category.name),
    )
    .map(({ category, fileNames }, index) => ({
      id: category.id,
      name: category.name,
      iconMapping: {
        categoryId: category.id,
        iconFileNames: fileNames,
        defaultIconFileName: chooseDefaultIconFileName(category.id, fileNames),
      },
      acceptsPublicSubmissions: true,
      sortOrder: index,
    }));
}

export interface BdslmMarkerProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  fetchTimeoutMs?: number;
}

interface BdslmPlayerMarker {
  x: number;
  z: number;
  image?: string;
  text?: string;
  textColor?: string;
}

interface UnminedCustomMarkerRecord {
  x?: number;
  z?: number;
  image?: string;
  text?: string;
}

interface UnminedCustomMarkerPayload {
  isEnabled?: boolean;
  markers?: UnminedCustomMarkerRecord[];
}

function buildMarkerUrl(baseUrl: string): URL {
  return new URL('/api/getPlayerMarkers', baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
}

function buildUnminedCustomMarkerUrl(baseUrl: string): URL {
  return new URL('custom.markers.js', baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
}

export class BdslmMarkerProvider implements MarkerProvider {
  readonly id: string;
  readonly name: string;

  constructor(private readonly config: BdslmMarkerProviderConfig) {
    this.id = config.id;
    this.name = config.name;
  }

  async fetchMarkers(_profileId: YctProfileId): Promise<MapMarkerSnapshot> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.fetchTimeoutMs ?? 6000);

    try {
      const response = await fetch(buildMarkerUrl(this.config.baseUrl), {
        signal: controller.signal,
        headers: {
          accept: 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`BDSLM marker request failed: ${response.status}`);
      }

      const rawMarkers = (await response.json()) as BdslmPlayerMarker[];
      return {
        fetchedAt: new Date().toISOString(),
        markers: rawMarkers
          .filter((marker) => Number.isFinite(marker.x) && Number.isFinite(marker.z))
          .map((marker, index) => ({
            id: `bdslm-player-${index}-${marker.x}-${marker.z}`,
            label: marker.text?.trim() || '在线玩家',
            categoryId: 'player',
            geometry: {
              type: 'Point',
              coordinates: [marker.x, marker.z],
            },
            iconFileName: marker.image,
          })),
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

export interface UnminedCustomMarkerProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  fetchTimeoutMs?: number;
}

export class UnminedCustomMarkerProvider implements MarkerProvider {
  readonly id: string;
  readonly name: string;

  constructor(private readonly config: UnminedCustomMarkerProviderConfig) {
    this.id = config.id;
    this.name = config.name;
  }

  async fetchMarkers(_profileId: YctProfileId): Promise<MapMarkerSnapshot> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.fetchTimeoutMs ?? 6000);

    try {
      const sourceUrl = buildUnminedCustomMarkerUrl(this.config.baseUrl);
      const response = await fetch(sourceUrl, {
        signal: controller.signal,
        headers: {
          accept: 'text/javascript, text/plain',
        },
      });

      if (!response.ok) {
        throw new Error(`uNmINeD marker request failed: ${response.status}`);
      }

      const payload = parseUnminedCustomMarkers(await response.text());
      const rawMarkers = payload.isEnabled === false ? [] : (payload.markers ?? []);

      return {
        fetchedAt: new Date().toISOString(),
        markers: rawMarkers
          .filter((marker) => Number.isFinite(marker.x) && Number.isFinite(marker.z))
          .map((marker, index) => ({
            id: `unmined-marker-${index}-${marker.x}-${marker.z}`,
            label: marker.text?.trim() || inferMarkerLabel(marker.image),
            categoryId: inferSemanticMarkerCategory(marker.image),
            geometry: {
              type: 'Point',
              coordinates: [marker.x as number, marker.z as number],
            },
            iconFileName: marker.image,
          })),
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

function parseUnminedCustomMarkers(source: string): UnminedCustomMarkerPayload {
  const readMarkers = new Function(
    `${source}
    return typeof UnminedCustomMarkers === "object" ? UnminedCustomMarkers : {};`,
  );

  return readMarkers() as UnminedCustomMarkerPayload;
}

function inferMarkerLabel(image: string | undefined): string {
  const category = inferSemanticMarkerCategory(image);
  return category === 'map-marker' ? '地图标记' : category;
}

function inferMarkerCategory(image: string | undefined): string {
  const fileName = image?.trim();
  if (!fileName) {
    return 'map-marker';
  }

  return fileName.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]+/g, '-') || 'map-marker';
}

function inferSemanticMarkerCategory(image: string | undefined): string {
  const fileName = image?.trim();
  if (!fileName) {
    return 'map-marker';
  }

  const baseName = getIconBaseName(fileName);
  return (
    semanticPoiIconCategories.find((entry) => entry.match(fileName, baseName))?.id ??
    inferMarkerCategory(fileName)
  );
}

function getIconBaseName(fileName: string): string {
  return (
    fileName
      .trim()
      .split(/[\\/]/)
      .pop()
      ?.replace(/\.[^.]+$/, '')
      .toLowerCase() || 'map-marker'
  );
}

function dedupeFileNames(fileNames: string[]): string[] {
  return Array.from(new Set(fileNames.map((fileName) => fileName.trim()).filter(Boolean)));
}

function chooseDefaultIconFileName(categoryId: string, fileNames: string[]): string {
  const preferredByCategory: Record<string, string> = {
    road: 'road.png',
    'metro-station': 'lindong-metro.png',
    'metro-entrance': 'exit.png',
    'railway-station': 'railway-station.png',
  };
  const preferred = preferredByCategory[categoryId];

  return (preferred && fileNames.includes(preferred) ? preferred : fileNames[0]) ?? '';
}
