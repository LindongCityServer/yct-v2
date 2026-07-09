import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { readRuntimeConfig } from './runtime-config';

export interface StoredPoiCategoryIconFile {
  fileName: string;
  publicPath: string;
  filePath: string;
  mimeType: string;
  sha256: string;
  sizeBytes: number;
}

const extensionByMimeType: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/avif': '.avif',
};

const mimeTypeByExtension: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
};

export async function storePoiCategoryIconFile(input: {
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
}): Promise<StoredPoiCategoryIconFile> {
  const sha256 = createHash('sha256').update(input.bytes).digest('hex');
  const extension = inferExtension(input.fileName, input.mimeType);
  const storedFileName = `${sha256.slice(0, 24)}${extension}`;
  const publicPath = `/api/map/poi-icons/${storedFileName}`;
  const uploadDir = resolveUploadDir();
  const filePath = path.join(/*turbopackIgnore: true*/ uploadDir, storedFileName);

  await mkdir(uploadDir, { recursive: true });
  await writeFile(filePath, input.bytes);

  return {
    fileName: storedFileName,
    publicPath,
    filePath,
    mimeType: normalizePoiCategoryIconMimeType(input.fileName, input.mimeType),
    sha256,
    sizeBytes: input.bytes.byteLength,
  };
}

export async function readPoiCategoryIconFile(fileName: string): Promise<{
  bytes: Uint8Array;
  mimeType: string;
}> {
  if (!isSafeStoredPoiIconFileName(fileName)) {
    throw new Error('invalid_poi_category_icon_name');
  }

  const filePath = path.join(/*turbopackIgnore: true*/ resolveUploadDir(), fileName);
  const bytes = await readFile(filePath);
  return {
    bytes,
    mimeType: inferStoredMimeType(fileName),
  };
}

export function normalizePoiCategoryIconMimeType(fileName: string, mimeType: string): string {
  const trimmed = mimeType.trim().toLowerCase();
  if (trimmed) {
    return trimmed;
  }

  return mimeTypeByExtension[path.extname(fileName).toLowerCase()] ?? '';
}

export function isAllowedPoiCategoryIconMimeType(mimeType: string): boolean {
  return Object.hasOwn(extensionByMimeType, mimeType);
}

function resolveUploadDir(): string {
  const config = readRuntimeConfig();
  return path.isAbsolute(config.poiIconUploadDir)
    ? config.poiIconUploadDir
    : path.join(/*turbopackIgnore: true*/ process.cwd(), config.poiIconUploadDir);
}

function inferExtension(fileName: string, mimeType: string): string {
  const extensionFromMimeType = extensionByMimeType[mimeType.toLowerCase()];
  if (extensionFromMimeType) {
    return extensionFromMimeType;
  }

  const extension = path.extname(fileName).toLowerCase();
  if (Object.hasOwn(mimeTypeByExtension, extension)) {
    return extension === '.jpeg' ? '.jpg' : extension;
  }

  return extensionByMimeType[mimeType.toLowerCase()] ?? '.bin';
}

function inferStoredMimeType(fileName: string): string {
  return mimeTypeByExtension[path.extname(fileName).toLowerCase()] ?? 'application/octet-stream';
}

function isSafeStoredPoiIconFileName(fileName: string): boolean {
  return /^[a-f0-9]{24}\.(?:png|jpg|gif|webp|avif)$/.test(fileName);
}
