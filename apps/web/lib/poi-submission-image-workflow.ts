import { randomUUID } from 'node:crypto';
import type { YctEvent, YctEventPayloadMap, YctEventType } from '@yct/contracts';
import { publishDomainEvent } from './app-event-bus';
import {
  isAllowedPoiImageMimeType,
  normalizePoiImageMimeType,
  storePoiSubmissionImageFile,
} from './poi-submission-image-store';

export interface PoiSubmissionImageUploadResult {
  ok: boolean;
  status?: number;
  error?: string;
  message?: string;
  image?: {
    imageId: string;
    fileName: string;
    imageUrl: string;
    mimeType: string;
    sizeBytes: number;
    sha256: string;
  };
}

export async function uploadPoiSubmissionImage(input: {
  actorId: string;
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
}): Promise<PoiSubmissionImageUploadResult> {
  const validation = validatePoiSubmissionImage(input);
  if (!validation.ok) {
    return validation;
  }

  const mimeType = normalizePoiImageMimeType(input.fileName, input.mimeType);
  const storedFile = await storePoiSubmissionImageFile({
    fileName: input.fileName,
    mimeType,
    bytes: input.bytes,
  });
  const image = {
    imageId: `poi_image_${storedFile.sha256.slice(0, 24)}`,
    fileName: input.fileName,
    imageUrl: storedFile.publicPath,
    mimeType,
    sizeBytes: storedFile.sizeBytes,
    sha256: storedFile.sha256,
  };

  await emitEvent(
    'PoiSubmissionImageUploaded',
    {
      type: 'user',
      id: input.actorId,
    },
    image,
  );

  return {
    ok: true,
    image,
  };
}

function validatePoiSubmissionImage(input: {
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
}): PoiSubmissionImageUploadResult {
  const mimeType = normalizePoiImageMimeType(input.fileName, input.mimeType);
  if (!input.fileName.trim()) {
    return invalidUpload('文件名不能为空。');
  }

  if (input.fileName.trim().length > 200) {
    return invalidUpload('文件名不能超过 200 个字符。');
  }

  if (!mimeType) {
    return invalidUpload('无法识别上传图片类型。');
  }

  if (!isAllowedPoiImageMimeType(mimeType)) {
    return invalidUpload('当前只允许上传 PNG、JPEG、GIF、WebP 或 AVIF 图片。');
  }

  if (input.bytes.byteLength === 0) {
    return invalidUpload('上传图片不能为空。');
  }

  if (input.bytes.byteLength > 8 * 1024 * 1024) {
    return invalidUpload('上传图片不能超过 8MB。');
  }

  const detectedMimeType = detectPoiImageMimeType(input.bytes);
  if (!detectedMimeType || detectedMimeType !== mimeType) {
    return invalidUpload('上传图片内容与文件类型不匹配。');
  }

  return { ok: true };
}

function invalidUpload(message: string): PoiSubmissionImageUploadResult {
  return {
    ok: false,
    status: 400,
    error: 'invalid_poi_submission_image_upload',
    message,
  };
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
