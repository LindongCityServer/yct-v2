import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ServiceEntry, ServiceEntryStatus } from '@yct/contracts';
import { readRuntimeConfig } from './runtime-config';

interface ServiceEntryStoreSnapshot {
  version: 1;
  entries: ServiceEntry[];
}

const emptySnapshot: ServiceEntryStoreSnapshot = {
  version: 1,
  entries: [],
};

export async function listServiceEntries(): Promise<ServiceEntry[]> {
  const snapshot = await readSnapshot();
  return [...buildDefaultServiceEntries(), ...snapshot.entries].sort(compareServiceEntries);
}

export async function listPublishedServiceEntries(): Promise<ServiceEntry[]> {
  const entries = await listServiceEntries();
  return entries.filter((entry) => entry.status === 'published');
}

export async function findLocalServiceEntry(id: string): Promise<ServiceEntry | undefined> {
  const snapshot = await readSnapshot();
  return snapshot.entries.find((entry) => entry.id === id);
}

export async function createLocalServiceEntry(input: {
  title: string;
  description?: string;
  categoryId: ServiceEntry['categoryId'];
  icon: string;
  href: string;
  openMode: ServiceEntry['openMode'];
  sortOrder: number;
  actorId: string;
}): Promise<ServiceEntry> {
  const snapshot = await readSnapshot();
  const now = new Date().toISOString();
  const entry: ServiceEntry = {
    id: `local_service_${randomUUID()}`,
    title: input.title,
    description: input.description,
    categoryId: input.categoryId,
    icon: input.icon,
    href: input.href,
    openMode: input.openMode,
    sortOrder: input.sortOrder,
    status: 'draft',
    submittedBy: input.actorId,
    submittedAt: undefined,
  };

  await writeSnapshot({
    ...snapshot,
    entries: [...snapshot.entries, entry],
  });
  return entry;
}

export async function updateLocalServiceEntry(
  id: string,
  updater: (entry: ServiceEntry) => ServiceEntry,
): Promise<ServiceEntry | undefined> {
  const snapshot = await readSnapshot();
  const existing = snapshot.entries.find((entry) => entry.id === id);
  if (!existing) {
    return undefined;
  }

  const updated = updater(existing);
  await writeSnapshot({
    ...snapshot,
    entries: snapshot.entries.map((entry) => (entry.id === id ? updated : entry)),
  });
  return updated;
}

export function withServiceEntryStatus(
  entry: ServiceEntry,
  status: ServiceEntryStatus,
  patch: Partial<ServiceEntry> = {},
): ServiceEntry {
  return {
    ...entry,
    ...patch,
    status,
  };
}

function buildDefaultServiceEntries(): ServiceEntry[] {
  const config = readRuntimeConfig();
  const legacyBaseUrl = config.legacyPublicBaseUrl.replace(/\/$/, '');
  const mapBaseUrl = config.unminedMapBaseUrl.replace(/\/$/, '');
  const now = '2026-07-01T00:00:00.000Z';

  return [
    {
      id: 'default-ltcx-schedule',
      title: '智运大屏',
      description: '旧客运大屏入口，对应 ltcx_schedule。',
      categoryId: 'operations',
      icon: 'monitoring',
      href: `${legacyBaseUrl}/ltcx_schedule/`,
      openMode: 'new_tab',
      status: 'published',
      sortOrder: 10,
      publishedAt: now,
    },
    {
      id: 'default-service-rules',
      title: '服务规章',
      description: '服务器公共服务和运营规则入口。',
      categoryId: 'operations',
      icon: 'menu_book',
      href: 'https://wiki.shangxiaoguan.top/',
      openMode: 'new_tab',
      status: 'published',
      sortOrder: 20,
      publishedAt: now,
    },
    {
      id: 'default-web-map',
      title: '网页地图',
      description: '临东服务器网页地图。',
      categoryId: 'server_sites',
      icon: 'map',
      href: mapBaseUrl,
      openMode: 'new_tab',
      status: 'published',
      sortOrder: 10,
      publishedAt: now,
    },
    {
      id: 'default-wiki',
      title: '知识库',
      description: '临东市服务器 Wiki。',
      categoryId: 'server_sites',
      icon: 'local_library',
      href: 'https://wiki.shangxiaoguan.top/',
      openMode: 'new_tab',
      status: 'published',
      sortOrder: 20,
      publishedAt: now,
    },
    {
      id: 'default-dynamic-routemap',
      title: '动态线路图',
      description: '旧动态线路图生成工具。',
      categoryId: 'toolbox',
      icon: 'cast',
      href: `${legacyBaseUrl}/dynamic_routemap/`,
      openMode: 'new_tab',
      status: 'published',
      sortOrder: 10,
      publishedAt: now,
    },
    {
      id: 'default-legacy-lab',
      title: '实验室',
      description: '旧版工具入口集合，包含地图预览和生成器等入口。',
      categoryId: 'toolbox',
      icon: 'science',
      href: `${legacyBaseUrl}/lab/`,
      openMode: 'new_tab',
      status: 'published',
      sortOrder: 15,
      publishedAt: now,
    },
    {
      id: 'default-map-search-tool',
      title: '地图搜索',
      description: '旧地图搜索工具，可按坐标或地名加载服务器卫星图像。',
      categoryId: 'toolbox',
      icon: 'travel_explore',
      href: `${legacyBaseUrl}/map_search/`,
      openMode: 'new_tab',
      status: 'published',
      sortOrder: 16,
      publishedAt: now,
    },
    {
      id: 'default-map-preview-tool',
      title: '地图预览',
      description: '旧地图预览精简页，支持用链接参数展示指定位置。',
      categoryId: 'toolbox',
      icon: 'map',
      href: `${legacyBaseUrl}/map_search/map.html`,
      openMode: 'new_tab',
      status: 'published',
      sortOrder: 17,
      publishedAt: now,
    },
    {
      id: 'default-data-composer',
      title: '数据编辑器',
      description: '旧线路数据编辑工具，可为动态线路图生成自定义线网数据。',
      categoryId: 'toolbox',
      icon: 'edit_note',
      href: `${legacyBaseUrl}/data_composer/`,
      openMode: 'new_tab',
      status: 'published',
      sortOrder: 20,
      publishedAt: now,
    },
    {
      id: 'default-product-gallery',
      title: '物料展示',
      description: '旧产品和物料展示页。',
      categoryId: 'toolbox',
      icon: 'signpost',
      href: `${legacyBaseUrl}/product_gallery/`,
      openMode: 'new_tab',
      status: 'published',
      sortOrder: 30,
      publishedAt: now,
    },
    {
      id: 'default-bus-stop-generator',
      title: '公交站牌生成器',
      description: '旧公交站牌生成工具，用于生成服务器内可用的站牌素材。',
      categoryId: 'toolbox',
      icon: 'departure_board',
      href: `${legacyBaseUrl}/generator/bus_stop.html`,
      openMode: 'new_tab',
      status: 'published',
      sortOrder: 40,
      publishedAt: now,
    },
    {
      id: 'default-road-sign-generator',
      title: '路牌生成器',
      description: '旧路牌生成工具，可生成沈阳风格道路指示牌图片。',
      categoryId: 'toolbox',
      icon: 'signpost',
      href: `${legacyBaseUrl}/generator/road_sign.html`,
      openMode: 'new_tab',
      status: 'published',
      sortOrder: 50,
      publishedAt: now,
    },
    {
      id: 'default-address-sign-generator',
      title: '楼牌生成器',
      description: '旧楼牌生成工具，可生成适合地图画的楼牌素材。',
      categoryId: 'toolbox',
      icon: 'apartment',
      href: `${legacyBaseUrl}/generator/address.html`,
      openMode: 'new_tab',
      status: 'published',
      sortOrder: 60,
      publishedAt: now,
    },
    {
      id: 'default-telegram-paper-generator',
      title: '电报纸生成器',
      description: '旧电报纸生成工具，用于把文本转换为电报纸样式素材。',
      categoryId: 'toolbox',
      icon: 'newspaper',
      href: `${legacyBaseUrl}/generator/dianbao.html`,
      openMode: 'new_tab',
      status: 'published',
      sortOrder: 70,
      publishedAt: now,
    },
  ];
}

function compareServiceEntries(left: ServiceEntry, right: ServiceEntry): number {
  const categoryCompare = left.categoryId.localeCompare(right.categoryId);
  return (
    categoryCompare ||
    left.sortOrder - right.sortOrder ||
    left.title.localeCompare(right.title, 'zh-CN')
  );
}

async function readSnapshot(): Promise<ServiceEntryStoreSnapshot> {
  const storePath = resolveStorePath();

  try {
    const source = await readFile(storePath, 'utf8');
    const parsed = JSON.parse(source) as ServiceEntryStoreSnapshot;
    return {
      version: 1,
      entries: Array.isArray(parsed.entries) ? parsed.entries : [],
    };
  } catch {
    return emptySnapshot;
  }
}

async function writeSnapshot(snapshot: ServiceEntryStoreSnapshot): Promise<void> {
  const storePath = resolveStorePath();
  await mkdir(path.dirname(storePath), { recursive: true });
  await writeFile(storePath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
}

function resolveStorePath(): string {
  const config = readRuntimeConfig();
  return path.isAbsolute(config.serviceEntryStorePath)
    ? config.serviceEntryStorePath
    : path.join(/*turbopackIgnore: true*/ process.cwd(), config.serviceEntryStorePath);
}
