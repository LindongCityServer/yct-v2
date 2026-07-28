import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { MaterialTemplateRecord, MaterialTemplateVersion } from '@yct/contracts';
import { readRuntimeConfig } from './runtime-config';

interface MaterialTemplateStoreSnapshot {
  version: 1;
  records: MaterialTemplateRecord[];
}

const emptySnapshot: MaterialTemplateStoreSnapshot = { version: 1, records: [] };
const systemTemplateCreatedAt = '2026-07-28T00:00:00.000Z';

const systemTemplateRecords: MaterialTemplateRecord[] = [
  createSystemTemplate({
    id: 'system_material_road_sign',
    title: '雨城通道路路牌',
    description: '复刻旧路牌生成器的双语道路标志基础版式。',
    family: 'road_sign',
    fields: [
      { key: 'roadName', label: '道路名称', kind: 'text', required: true, maxLength: 20 },
      { key: 'roadNameEn', label: '第二文字', kind: 'text', maxLength: 32 },
      {
        key: 'direction',
        label: '方向',
        kind: 'select',
        options: [
          { value: '东西', label: '东西' },
          { value: '西东', label: '西东' },
          { value: '南北', label: '南北' },
          { value: '北南', label: '北南' },
        ],
      },
    ],
    defaultCanvas: defaultCanvas(2, 0.75),
    source: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {{canvas.widthPx}} {{canvas.heightPx}}">
  <rect width="{{canvas.widthPx}}" height="{{canvas.heightPx}}" fill="#1456a0"/>
  <rect x="8" y="8" width="{{canvas.innerWidthPx}}" height="{{canvas.innerHeightPx}}" fill="none" stroke="#ffffff" stroke-width="4"/>
  <text x="50%" y="42%" fill="#ffffff" font-family="HarmonyOS Sans SC, sans-serif" font-size="{{canvas.primaryFontPx}}" font-weight="700" text-anchor="middle">{{roadName}}</text>
  <text x="50%" y="68%" fill="#ffffff" font-family="HarmonyOS Sans SC, sans-serif" font-size="{{canvas.secondaryFontPx}}" text-anchor="middle">{{roadNameEn}}</text>
  <text x="50%" y="91%" fill="#ffffff" font-family="HarmonyOS Sans SC, sans-serif" font-size="{{canvas.captionFontPx}}" text-anchor="middle">{{direction}}</text>
</svg>`,
  }),
  createSystemTemplate({
    id: 'system_material_address_sign',
    title: '楼栋地名标志',
    description: '按地名标志比例组织的双语楼牌基础版式。',
    family: 'address_sign',
    fields: [
      { key: 'roadName', label: '地名或道路名称', kind: 'text', required: true, maxLength: 20 },
      { key: 'roadNameEn', label: '第二文字', kind: 'text', maxLength: 32 },
      { key: 'number', label: '楼牌号', kind: 'text', required: true, maxLength: 10 },
      { key: 'numberAdd', label: '附加号', kind: 'text', maxLength: 10 },
      { key: 'postalCode', label: '邮政编码', kind: 'text', maxLength: 12 },
    ],
    defaultCanvas: defaultCanvas(1, 1.25),
    source: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {{canvas.widthPx}} {{canvas.heightPx}}">
  <rect width="{{canvas.widthPx}}" height="{{canvas.heightPx}}" rx="8" fill="#155b9e"/>
  <rect x="8" y="8" width="{{canvas.innerWidthPx}}" height="{{canvas.innerHeightPx}}" rx="4" fill="none" stroke="#ffffff" stroke-width="4"/>
  <text x="50%" y="21%" fill="#ffffff" font-family="HarmonyOS Sans SC, sans-serif" font-size="{{canvas.secondaryFontPx}}" font-weight="700" text-anchor="middle">{{roadName}}</text>
  <text x="50%" y="31%" fill="#ffffff" font-family="HarmonyOS Sans SC, sans-serif" font-size="{{canvas.captionFontPx}}" text-anchor="middle">{{roadNameEn}}</text>
  <text x="50%" y="68%" fill="#ffffff" font-family="HarmonyOS Sans SC, sans-serif" font-size="{{canvas.largeFontPx}}" font-weight="700" text-anchor="middle">{{number}}{{numberAdd}}</text>
  <text x="50%" y="88%" fill="#ffffff" font-family="HarmonyOS Sans SC, sans-serif" font-size="{{canvas.captionFontPx}}" text-anchor="middle">邮政编码 {{postalCode}}</text>
</svg>`,
  }),
  createSystemTemplate({
    id: 'system_material_bus_stop',
    title: '公交站牌',
    description: '可由已发布公交线路和站点自动填充的基础站牌。',
    family: 'bus_stop',
    fields: [
      { key: 'lineName', label: '线路名称', kind: 'text', required: true, maxLength: 20 },
      { key: 'stationName', label: '当前站', kind: 'text', required: true, maxLength: 24 },
      { key: 'destinationName', label: '终点站', kind: 'text', required: true, maxLength: 24 },
      { key: 'operator', label: '运营方', kind: 'text', maxLength: 30 },
    ],
    defaultCanvas: defaultCanvas(1.5, 2.5),
    source: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {{canvas.widthPx}} {{canvas.heightPx}}">
  <rect width="{{canvas.widthPx}}" height="{{canvas.heightPx}}" fill="#f7f8fa"/>
  <rect width="{{canvas.widthPx}}" height="30%" fill="#12653d"/>
  <text x="50%" y="17%" fill="#ffffff" font-family="HarmonyOS Sans SC, sans-serif" font-size="{{canvas.primaryFontPx}}" font-weight="700" text-anchor="middle">{{lineName}}</text>
  <text x="50%" y="49%" fill="#152238" font-family="HarmonyOS Sans SC, sans-serif" font-size="{{canvas.secondaryFontPx}}" font-weight="700" text-anchor="middle">{{stationName}}</text>
  <line x1="12%" x2="88%" y1="59%" y2="59%" stroke="#12653d" stroke-width="5"/>
  <text x="50%" y="73%" fill="#152238" font-family="HarmonyOS Sans SC, sans-serif" font-size="{{canvas.captionFontPx}}" text-anchor="middle">开往 {{destinationName}}</text>
  <text x="50%" y="90%" fill="#52606d" font-family="HarmonyOS Sans SC, sans-serif" font-size="{{canvas.captionFontPx}}" text-anchor="middle">{{operator}}</text>
</svg>`,
  }),
];

export async function listMaterialTemplateRecords(): Promise<MaterialTemplateRecord[]> {
  const snapshot = await readSnapshot();
  const recordsById = new Map(systemTemplateRecords.map((record) => [record.id, record]));
  for (const record of snapshot.records) {
    recordsById.set(record.id, record);
  }
  return [...recordsById.values()].sort((left, right) => left.id.localeCompare(right.id));
}

export async function findMaterialTemplateRecord(
  templateId: string,
): Promise<MaterialTemplateRecord | undefined> {
  return (await listMaterialTemplateRecords()).find((record) => record.id === templateId);
}

export async function writeMaterialTemplateRecord(record: MaterialTemplateRecord): Promise<void> {
  const snapshot = await readSnapshot();
  const nextRecords = [...snapshot.records.filter((item) => item.id !== record.id), record];
  await writeSnapshot({ version: 1, records: nextRecords });
}

export function createMaterialTemplateRecord(input: {
  title: string;
  description?: string;
  family: MaterialTemplateVersion['family'];
  source: string;
  fields: MaterialTemplateVersion['fields'];
  typographyProfile?: MaterialTemplateVersion['typographyProfile'];
  defaultCanvas: MaterialTemplateVersion['defaultCanvas'];
  actorId: string;
}): MaterialTemplateRecord {
  const now = new Date().toISOString();
  return {
    id: `material_template_${randomUUID()}`,
    versions: [
      {
        version: 1,
        status: 'draft',
        title: input.title,
        description: input.description,
        family: input.family,
        source: input.source,
        fields: input.fields,
        typographyProfile: input.typographyProfile,
        defaultCanvas: input.defaultCanvas,
        createdBy: input.actorId,
        createdAt: now,
      },
    ],
  };
}

export function findMaterialTemplateVersion(
  record: MaterialTemplateRecord,
  version: number,
): MaterialTemplateVersion | undefined {
  return record.versions.find((item) => item.version === version);
}

export function findPublishedMaterialTemplateVersion(
  record: MaterialTemplateRecord,
): MaterialTemplateVersion | undefined {
  return record.versions
    .filter((item) => item.status === 'published')
    .sort((left, right) => right.version - left.version)[0];
}

function createSystemTemplate(input: {
  id: string;
  title: string;
  description: string;
  family: MaterialTemplateVersion['family'];
  source: string;
  fields: MaterialTemplateVersion['fields'];
  defaultCanvas: MaterialTemplateVersion['defaultCanvas'];
}): MaterialTemplateRecord {
  return {
    id: input.id,
    versions: [
      {
        version: 1,
        status: 'published',
        title: input.title,
        description: input.description,
        family: input.family,
        source: input.source,
        fields: input.fields,
        defaultCanvas: input.defaultCanvas,
        createdBy: 'system',
        createdAt: systemTemplateCreatedAt,
        publishedBy: 'system',
        publishedAt: systemTemplateCreatedAt,
      },
    ],
  };
}

function defaultCanvas(widthM: number, heightM: number): MaterialTemplateVersion['defaultCanvas'] {
  return { widthM, heightM, pxPerMeter: 128, alignToTile: true, tileSizePx: 128 };
}

async function readSnapshot(): Promise<MaterialTemplateStoreSnapshot> {
  const storePath = resolveStorePath();
  try {
    const source = await readFile(storePath, 'utf8');
    const parsed = JSON.parse(source) as MaterialTemplateStoreSnapshot;
    return { version: 1, records: Array.isArray(parsed.records) ? parsed.records : [] };
  } catch {
    return emptySnapshot;
  }
}

async function writeSnapshot(snapshot: MaterialTemplateStoreSnapshot): Promise<void> {
  const storePath = resolveStorePath();
  await mkdir(path.dirname(storePath), { recursive: true });
  await writeFile(storePath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
}

function resolveStorePath(): string {
  const config = readRuntimeConfig();
  return path.isAbsolute(config.materialTemplateStorePath)
    ? config.materialTemplateStorePath
    : path.join(/*turbopackIgnore: true*/ process.cwd(), config.materialTemplateStorePath);
}
