import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { readRuntimeConfig } from './runtime-config';

export interface MaterialSymbolAssetRecord {
  iconName: string;
  assetId: string;
  fileName: string;
  publicPath: string;
  sha256: string;
  sizeBytes: number;
  source: 'google-fonts';
  promotedBy: string;
  promotedAt: string;
}

interface MaterialSymbolAssetSnapshot {
  version: 1;
  items: MaterialSymbolAssetRecord[];
}

const emptySnapshot: MaterialSymbolAssetSnapshot = { version: 1, items: [] };

export async function getMaterialSymbolAsset(
  iconName: string,
): Promise<MaterialSymbolAssetRecord | undefined> {
  const snapshot = await readSnapshot();
  return snapshot.items.find((item) => item.iconName === iconName);
}

export async function storeMaterialSymbolAsset(input: {
  iconName: string;
  svg: string;
  promotedBy: string;
}): Promise<MaterialSymbolAssetRecord> {
  const bytes = Buffer.from(input.svg, 'utf8');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const fileName = `${sha256.slice(0, 24)}.svg`;
  const assetId = `material_symbol_${sha256.slice(0, 24)}`;
  const assetDir = resolveMaterialSymbolAssetDir();
  const filePath = path.join(/*turbopackIgnore: true*/ assetDir, fileName);

  await mkdir(assetDir, { recursive: true });
  await writeFile(filePath, bytes);

  const promotedAt = new Date().toISOString();
  const record: MaterialSymbolAssetRecord = {
    iconName: input.iconName,
    assetId,
    fileName,
    publicPath: `/api/material-symbols/${encodeURIComponent(input.iconName)}`,
    sha256,
    sizeBytes: bytes.byteLength,
    source: 'google-fonts',
    promotedBy: input.promotedBy,
    promotedAt,
  };
  const snapshot = await readSnapshot();
  const items = snapshot.items.filter((item) => item.iconName !== input.iconName);
  items.push(record);
  await writeSnapshot({
    version: 1,
    items: items.sort((left, right) => left.iconName.localeCompare(right.iconName)),
  });
  return record;
}

export async function readMaterialSymbolAssetFile(fileName: string): Promise<Uint8Array> {
  if (!/^[a-f0-9]{24}\.svg$/u.test(fileName)) {
    throw new Error('invalid_material_symbol_asset_name');
  }
  return readFile(path.join(/*turbopackIgnore: true*/ resolveMaterialSymbolAssetDir(), fileName));
}

function resolveMaterialSymbolAssetDir(): string {
  const configuredPath = readRuntimeConfig().materialSymbolAssetDir;
  return path.isAbsolute(configuredPath)
    ? configuredPath
    : path.join(/*turbopackIgnore: true*/ process.cwd(), configuredPath);
}

async function readSnapshot(): Promise<MaterialSymbolAssetSnapshot> {
  try {
    const parsed = JSON.parse(
      await readFile(resolveMaterialSymbolAssetStorePath(), 'utf8'),
    ) as Partial<MaterialSymbolAssetSnapshot>;
    return {
      version: 1,
      items: Array.isArray(parsed.items) ? parsed.items : [],
    };
  } catch {
    return emptySnapshot;
  }
}

async function writeSnapshot(snapshot: MaterialSymbolAssetSnapshot): Promise<void> {
  const storePath = resolveMaterialSymbolAssetStorePath();
  await mkdir(path.dirname(storePath), { recursive: true });
  await writeFile(storePath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
}

function resolveMaterialSymbolAssetStorePath(): string {
  const configuredPath = readRuntimeConfig().materialSymbolAssetStorePath;
  return path.isAbsolute(configuredPath)
    ? configuredPath
    : path.join(/*turbopackIgnore: true*/ process.cwd(), configuredPath);
}
