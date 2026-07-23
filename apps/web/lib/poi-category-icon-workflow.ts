import { randomUUID } from 'node:crypto';
import type { YctEvent, YctEventPayloadMap, YctEventType } from '@yct/contracts';
import { publishDomainEvent } from './app-event-bus';
import {
  deletePoiCategoryIconFile,
  isAllowedPoiCategoryIconMimeType,
  normalizeStoredPoiIconFileName,
  normalizePoiCategoryIconMimeType,
  storePoiCategoryIconFile,
} from './poi-category-icon-store';
import { listPoiCategoryProfiles, replacePoiCategoryProfiles } from './poi-category-profile-store';
import { clearPoiCategoryCache } from './poi-categories';
import {
  deletePoiCategoryIconMetadata,
  normalizePoiCategoryIconMetadataKey,
  upsertPoiCategoryIconMetadata,
} from './poi-category-icon-metadata-store';

export interface PoiCategoryIconUploadResult {
  ok: boolean;
  status?: number;
  error?: string;
  message?: string;
  icon?: {
    iconId: string;
    fileName: string;
    iconUrl: string;
    mimeType: string;
    sizeBytes: number;
    sha256: string;
    displayName: string;
  };
}

export interface PoiCategoryIconDeleteResult {
  ok: boolean;
  status?: number;
  error?: string;
  message?: string;
  icon?: {
    iconId: string;
    fileName: string;
    fileDeleted: boolean;
    removedCategoryIds: string[];
  };
}

export async function uploadPoiCategoryIcon(input: {
  actorId: string;
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
}): Promise<PoiCategoryIconUploadResult> {
  const validation = validatePoiCategoryIcon(input);
  if (!validation.ok) {
    return validation;
  }

  const mimeType = normalizePoiCategoryIconMimeType(input.fileName, input.mimeType);
  const storedFile = await storePoiCategoryIconFile({
    fileName: input.fileName,
    mimeType,
    bytes: input.bytes,
  });
  const displayName = buildDefaultPoiCategoryIconDisplayName(input.fileName);
  const updatedAt = new Date().toISOString();
  await upsertPoiCategoryIconMetadata({
    fileName: storedFile.fileName,
    displayName,
    updatedBy: input.actorId,
    updatedAt,
  });
  const icon = {
    iconId: `poi_icon_${storedFile.sha256.slice(0, 24)}`,
    fileName: storedFile.fileName,
    iconUrl: storedFile.publicPath,
    mimeType,
    sizeBytes: storedFile.sizeBytes,
    sha256: storedFile.sha256,
    displayName,
  };

  await emitEvent(
    'PoiCategoryIconUploaded',
    {
      type: 'admin',
      id: input.actorId,
    },
    icon,
  );

  return {
    ok: true,
    icon,
  };
}

export async function deletePoiCategoryIcon(input: {
  actorId: string;
  iconFileName: string;
}): Promise<PoiCategoryIconDeleteResult> {
  const fileName = normalizeStoredPoiIconFileName(input.iconFileName);
  if (!fileName) {
    return {
      ok: false,
      status: 400,
      error: 'invalid_poi_category_icon_name',
      message: '只能删除通过后台上传的 POI 分类图标。',
    };
  }

  const profileCategories = await listPoiCategoryProfiles();
  const blockedCategories = profileCategories.filter((category) => {
    const icons = category.iconMapping.iconFileNames.filter((icon) => icon !== fileName);
    return category.iconMapping.iconFileNames.includes(fileName) && icons.length === 0;
  });

  if (blockedCategories.length > 0) {
    return {
      ok: false,
      status: 409,
      error: 'poi_category_icon_in_use_as_last_icon',
      message: `请先为这些分类设置其他图标：${blockedCategories
        .map((category) => category.name || category.id)
        .join('、')}`,
    };
  }

  const removedCategoryIds: string[] = [];
  const nextCategories = profileCategories.map((category) => {
    if (!category.iconMapping.iconFileNames.includes(fileName)) {
      return category;
    }

    const iconFileNames = category.iconMapping.iconFileNames.filter((icon) => icon !== fileName);
    removedCategoryIds.push(category.id);
    return {
      ...category,
      iconMapping: {
        ...category.iconMapping,
        defaultIconFileName:
          category.iconMapping.defaultIconFileName === fileName
            ? iconFileNames[0]
            : category.iconMapping.defaultIconFileName,
        iconFileNames,
      },
    };
  });

  const updatedAt = new Date().toISOString();
  const categories =
    removedCategoryIds.length > 0
      ? await replacePoiCategoryProfiles(nextCategories)
      : profileCategories;
  const deletedFile = await deletePoiCategoryIconFile(fileName);
  await deletePoiCategoryIconMetadata(fileName);
  clearPoiCategoryCache();

  if (removedCategoryIds.length > 0) {
    await emitEvent(
      'PoiCategoryProfileUpdated',
      {
        type: 'admin',
        id: input.actorId,
      },
      {
        categories: categories.map((category) => ({
          id: category.id,
          name: category.name,
          iconFileNames: category.iconMapping.iconFileNames,
          defaultIconFileName: category.iconMapping.defaultIconFileName,
          acceptsPublicSubmissions: category.acceptsPublicSubmissions,
          sortOrder: category.sortOrder,
        })),
        updatedBy: input.actorId,
        updatedAt,
      },
    );
  }

  const icon = {
    iconId: buildPoiCategoryIconId(fileName),
    fileName,
    fileDeleted: deletedFile.deleted,
    removedCategoryIds,
  };

  await emitEvent(
    'PoiCategoryIconDeleted',
    {
      type: 'admin',
      id: input.actorId,
    },
    {
      ...icon,
      deletedBy: input.actorId,
      deletedAt: updatedAt,
    },
  );

  return {
    ok: true,
    icon,
  };
}

export async function renamePoiCategoryIcon(input: {
  actorId: string;
  iconFileName: string;
  displayName: string;
}): Promise<{
  ok: boolean;
  status?: number;
  error?: string;
  message?: string;
  icon?: { iconId: string; fileName: string; displayName: string };
}> {
  const fileName = normalizePoiCategoryIconMetadataKey(input.iconFileName);
  const displayName = input.displayName.trim();
  if (!fileName || !displayName || displayName.length > 80) {
    return {
      ok: false,
      status: 400,
      error: 'invalid_poi_category_icon_name',
      message: '图标显示名称不符合要求。',
    };
  }

  const renamedAt = new Date().toISOString();
  await upsertPoiCategoryIconMetadata({
    fileName,
    displayName,
    updatedBy: input.actorId,
    updatedAt: renamedAt,
  });
  const icon = { iconId: buildPoiCategoryIconId(fileName), fileName, displayName };
  await emitEvent(
    'PoiCategoryIconRenamed',
    { type: 'admin', id: input.actorId },
    { ...icon, renamedBy: input.actorId, renamedAt },
  );
  return { ok: true, icon };
}

function validatePoiCategoryIcon(input: {
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
}): PoiCategoryIconUploadResult {
  const mimeType = normalizePoiCategoryIconMimeType(input.fileName, input.mimeType);
  if (!input.fileName.trim()) {
    return invalidUpload('文件名不能为空。');
  }

  if (input.fileName.trim().length > 200) {
    return invalidUpload('文件名不能超过 200 个字符。');
  }

  if (!mimeType) {
    return invalidUpload('无法识别上传图标类型。');
  }

  if (!isAllowedPoiCategoryIconMimeType(mimeType)) {
    return invalidUpload('当前只允许上传 PNG、JPEG、GIF、WebP 或 AVIF 图标。');
  }

  if (input.bytes.byteLength === 0) {
    return invalidUpload('上传图标不能为空。');
  }

  if (input.bytes.byteLength > 1024 * 1024) {
    return invalidUpload('上传图标不能超过 1MB。');
  }

  const detectedMimeType = detectPoiImageMimeType(input.bytes);
  if (!detectedMimeType || detectedMimeType !== mimeType) {
    return invalidUpload('上传图标内容与文件类型不匹配。');
  }

  return { ok: true };
}

function invalidUpload(message: string): PoiCategoryIconUploadResult {
  return {
    ok: false,
    status: 400,
    error: 'invalid_poi_category_icon_upload',
    message,
  };
}

function buildPoiCategoryIconId(fileName: string): string {
  return `poi_icon_${fileName.replace(/\.[^.]+$/, '')}`;
}

function buildDefaultPoiCategoryIconDisplayName(fileName: string): string {
  const baseName = fileName
    .trim()
    .replace(/\.[^.]+$/, '')
    .trim();
  return (baseName || '未命名图标').slice(0, 80);
}

function detectPoiImageMimeType(bytes: Uint8Array): string | undefined {
  if (startsWithBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return 'image/png';
  }

  if (startsWithBytes(bytes, [0xff, 0xd8, 0xff])) {
    return 'image/jpeg';
  }

  const header = readAscii(bytes, 0, 12);
  if (header.startsWith('GIF87a') || header.startsWith('GIF89a')) {
    return 'image/gif';
  }

  if (header.startsWith('RIFF') && header.slice(8, 12) === 'WEBP') {
    return 'image/webp';
  }

  if (readAscii(bytes, 4, 8) === 'ftyp' && readAscii(bytes, 8, 40).includes('avif')) {
    return 'image/avif';
  }

  return undefined;
}

function startsWithBytes(bytes: Uint8Array, signature: number[]): boolean {
  if (bytes.byteLength < signature.length) {
    return false;
  }

  return signature.every((value, index) => bytes[index] === value);
}

function readAscii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.slice(start, Math.min(end, bytes.byteLength)));
}

async function emitEvent<TType extends YctEventType>(
  type: TType,
  actor: YctEvent<TType>['actor'],
  payload: YctEventPayloadMap[TType],
): Promise<void> {
  await publishDomainEvent({
    eventId: `event_${randomUUID()}`,
    type,
    occurredAt: new Date().toISOString(),
    actor,
    payload,
  });
}
