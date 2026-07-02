import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { readRuntimeConfig } from './runtime-config';

export interface StoredUploadedAssetFile {
  fileName: string;
  publicPath: string;
  filePath: string;
  sha256: string;
  sizeBytes: number;
}

const extensionByMimeType: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
  'image/avif': '.avif',
  'application/pdf': '.pdf',
  'text/plain': '.txt',
  'text/markdown': '.md',
};

export async function storeUploadedContentAssetFile(input: {
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
}): Promise<StoredUploadedAssetFile> {
  const sha256 = createHash('sha256').update(input.bytes).digest('hex');
  const extension = inferExtension(input.fileName, input.mimeType);
  const storedFileName = `${sha256.slice(0, 24)}${extension}`;
  const publicPath = `/content-assets/${storedFileName}`;
  const uploadDir = resolveUploadDir();
  const filePath = path.join(/*turbopackIgnore: true*/ uploadDir, storedFileName);

  await mkdir(uploadDir, { recursive: true });
  await writeFile(filePath, input.bytes);

  return {
    fileName: storedFileName,
    publicPath,
    filePath,
    sha256,
    sizeBytes: input.bytes.byteLength,
  };
}

function resolveUploadDir(): string {
  const config = readRuntimeConfig();
  return path.isAbsolute(config.contentAssetUploadDir)
    ? config.contentAssetUploadDir
    : path.join(/*turbopackIgnore: true*/ process.cwd(), config.contentAssetUploadDir);
}

function inferExtension(fileName: string, mimeType: string): string {
  const extension = path.extname(fileName).toLowerCase();
  if (isAllowedExtension(extension)) {
    return extension;
  }

  return extensionByMimeType[mimeType.toLowerCase()] ?? '.bin';
}

function isAllowedExtension(extension: string): boolean {
  return [
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.webp',
    '.svg',
    '.avif',
    '.pdf',
    '.txt',
    '.md',
  ].includes(extension);
}
