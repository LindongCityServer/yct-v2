import { randomUUID } from 'node:crypto';
import * as opentypeModule from 'opentype.js';
import type { Font } from 'opentype.js';
import type { MaterialSymbolAssetPromotedPayload, YctEventPayloadMap } from '@yct/contracts';
import { publishDomainEvent } from './app-event-bus';
import {
  getMaterialSymbolAsset,
  readMaterialSymbolAssetFile,
  storeMaterialSymbolAsset,
  type MaterialSymbolAssetRecord,
} from './material-symbol-asset-store';

const materialSymbolNamePattern = /^[a-z0-9_]{1,80}$/u;
const materialSymbolCssEndpoint =
  'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght@400';
const maximumSingleIconFontBytes = 128 * 1024;

class MaterialSymbolNotFoundError extends Error {}

export interface MaterialSymbolAssetResult {
  ok: boolean;
  status?: number;
  error?: string;
  message?: string;
  asset?: MaterialSymbolAssetRecord;
  svg?: string;
}

export async function previewMaterialSymbol(iconName: string): Promise<MaterialSymbolAssetResult> {
  const normalizedName = normalizeMaterialSymbolName(iconName);
  if (!normalizedName) {
    return invalidMaterialSymbolName();
  }

  try {
    const existing = await getMaterialSymbolAsset(normalizedName);
    if (existing) {
      try {
        const bytes = await readMaterialSymbolAssetFile(existing.fileName);
        return { ok: true, svg: new TextDecoder().decode(bytes) };
      } catch {
        // 元数据与文件不同步时回源修复，不让损坏记录永久阻断预览。
      }
    }
    return {
      ok: true,
      svg: await fetchMaterialSymbolSvg(normalizedName),
    };
  } catch (error) {
    return failedMaterialSymbolFetch(error);
  }
}

export async function promoteMaterialSymbolAsset(input: {
  iconName: string;
  actorId: string;
  reason: MaterialSymbolAssetPromotedPayload['reason'];
}): Promise<MaterialSymbolAssetResult> {
  const normalizedName = normalizeMaterialSymbolName(input.iconName);
  if (!normalizedName) {
    return invalidMaterialSymbolName();
  }

  const existing = await getMaterialSymbolAsset(normalizedName);
  if (existing) {
    try {
      await readMaterialSymbolAssetFile(existing.fileName);
      return { ok: true, asset: existing };
    } catch {
      // 继续回源并覆盖元数据。
    }
  }

  try {
    const svg = await fetchMaterialSymbolSvg(normalizedName);
    const asset = await storeMaterialSymbolAsset({
      iconName: normalizedName,
      svg,
      promotedBy: input.actorId,
    });
    await emitMaterialSymbolAssetPromoted({
      ...asset,
      reason: input.reason,
    });
    return { ok: true, asset };
  } catch (error) {
    return failedMaterialSymbolFetch(error);
  }
}

export function normalizeMaterialSymbolName(value: string): string | undefined {
  const normalized = value.trim().toLowerCase();
  return materialSymbolNamePattern.test(normalized) ? normalized : undefined;
}

async function fetchMaterialSymbolSvg(iconName: string): Promise<string> {
  const cssResponse = await fetch(
    `${materialSymbolCssEndpoint}&icon_names=${encodeURIComponent(iconName)}`,
    {
      headers: {
        Accept: 'text/css',
        'User-Agent': 'curl/8.0',
      },
      signal: AbortSignal.timeout(8_000),
    },
  );
  if (!cssResponse.ok) {
    throw new Error(`Material Symbols CSS 请求失败（${cssResponse.status}）。`);
  }

  const css = await cssResponse.text();
  const fontUrl = css.match(/url\((['"]?)(https?:\/\/[^)'"]+)\1\)/u)?.[2];
  if (!fontUrl) {
    throw new Error('Material Symbols CSS 未返回单图标字体资源。');
  }

  const fontResponse = await fetch(fontUrl, {
    headers: { 'User-Agent': 'curl/8.0' },
    signal: AbortSignal.timeout(8_000),
  });
  if (!fontResponse.ok) {
    throw new Error(`Material Symbols 字体请求失败（${fontResponse.status}）。`);
  }

  const contentLength = Number(fontResponse.headers.get('Content-Length'));
  if (Number.isFinite(contentLength) && contentLength > maximumSingleIconFontBytes) {
    throw new MaterialSymbolNotFoundError(`Material Symbols 不存在图标“${iconName}”。`);
  }
  const fontBuffer = await fontResponse.arrayBuffer();
  if (fontBuffer.byteLength > maximumSingleIconFontBytes) {
    throw new MaterialSymbolNotFoundError(`Material Symbols 不存在图标“${iconName}”。`);
  }
  const font = parseOpenTypeFont(fontBuffer);
  const iconGlyphs = Array.from({ length: font.glyphs.length }, (_, index) =>
    font.glyphs.get(index),
  ).filter((candidate) => candidate.unicodes?.some((codePoint) => codePoint >= 0xe000));
  if (iconGlyphs.length !== 1) {
    throw new MaterialSymbolNotFoundError(`Material Symbols 不存在图标“${iconName}”。`);
  }
  const glyph = iconGlyphs[0];
  if (!glyph) {
    throw new MaterialSymbolNotFoundError(`Material Symbols 不存在图标“${iconName}”。`);
  }

  const pathData = glyph.getPath(0, 24, 24).toPathData(3);
  if (!pathData) {
    throw new Error(`Material Symbols 图标“${iconName}”没有可渲染路径。`);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="${pathData}" fill="currentColor"/></svg>`;
}

function parseOpenTypeFont(buffer: ArrayBuffer): Font {
  const runtime = opentypeModule as unknown as {
    default?: { parse?: (source: ArrayBuffer) => Font };
    parse?: (source: ArrayBuffer) => Font;
  };
  const parse = runtime.parse ?? runtime.default?.parse;
  if (!parse) {
    throw new Error('当前 OpenType 运行时不支持字体解析。');
  }
  return parse(buffer);
}

function invalidMaterialSymbolName(): MaterialSymbolAssetResult {
  return {
    ok: false,
    status: 400,
    error: 'invalid_material_symbol_name',
    message: '图标名只能包含小写字母、数字和下划线，长度不超过 80 个字符。',
  };
}

function failedMaterialSymbolFetch(error: unknown): MaterialSymbolAssetResult {
  if (error instanceof MaterialSymbolNotFoundError) {
    return {
      ok: false,
      status: 404,
      error: 'material_symbol_not_found',
      message: error.message,
    };
  }
  return {
    ok: false,
    status: 502,
    error: 'material_symbol_source_unavailable',
    message: error instanceof Error ? error.message : '暂时无法获取 Material Symbols 图标。',
  };
}

async function emitMaterialSymbolAssetPromoted(
  asset: MaterialSymbolAssetRecord & {
    reason: YctEventPayloadMap['MaterialSymbolAssetPromoted']['reason'];
  },
): Promise<void> {
  const payload: YctEventPayloadMap['MaterialSymbolAssetPromoted'] = {
    iconName: asset.iconName,
    assetId: asset.assetId,
    assetUrl: asset.publicPath,
    sha256: asset.sha256,
    sizeBytes: asset.sizeBytes,
    source: asset.source,
    promotedBy: asset.promotedBy,
    promotedAt: asset.promotedAt,
    reason: asset.reason,
  };
  await publishDomainEvent({
    eventId: `event_${randomUUID()}`,
    type: 'MaterialSymbolAssetPromoted',
    occurredAt: asset.promotedAt,
    actor: { type: 'system', id: 'material-symbol-asset-workflow' },
    payload,
  });
}
