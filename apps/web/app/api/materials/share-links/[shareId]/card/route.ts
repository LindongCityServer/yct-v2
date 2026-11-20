import QRCode from 'qrcode';
import { NextRequest, NextResponse } from 'next/server';
import { renderMaterialTemplateToPng } from '../../../../../../lib/material-renderer';
import {
  findMaterialTemplateRecord,
  findMaterialTemplateVersion,
  findPublishedMaterialTemplateVersion,
} from '../../../../../../lib/material-template-store';
import {
  findMaterialShareLinkById,
  isMaterialShareLinkExpired,
  isMaterialShareLinkStub,
} from '../../../../../../lib/material-share-link-workflow';
import { renderQqBotCardPng } from '../../../../../../lib/qq-bot-card';
import { appPath } from '../../../../../../lib/app-paths';
import { resolvePublicSiteOrigin } from '../../../../../../lib/request-site-url';
import { readRuntimeConfig } from '../../../../../../lib/runtime-config';
import type { MaterialShareLinkKind } from '@yct/contracts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const kindTheme: Record<MaterialShareLinkKind, { color: string; icon: string }> = {
  road_sign: { color: '#168F78', icon: 'explore' },
  address_sign: { color: '#F59B22', icon: 'location_on' },
  bus_stop: { color: '#2584E8', icon: 'location_on' },
  metro_line: { color: '#2584E8', icon: 'explore' },
  custom: { color: '#168F78', icon: 'explore' },
};

/**
 * 分享图：牌面 + signage 卡片 + 二维码。
 *
 * 工作台分享的未审核内容在创建时已由服务端标记 shareImageWatermark，
 * 这里按标记走现成的预览水印，不接受查询参数覆盖。
 */
export async function GET(request: NextRequest, context: { params: Promise<{ shareId: string }> }) {
  const { shareId } = await context.params;
  const share = await findMaterialShareLinkById(shareId);
  if (!share) {
    return new NextResponse('分享记录不存在', { status: 404 });
  }
  if (share.status === 'revoked') {
    return new NextResponse('分享已被停用', { status: 410 });
  }
  if (isMaterialShareLinkStub(share) || isMaterialShareLinkExpired(share)) {
    return new NextResponse('分享已过期，请打开原模板重新生成', { status: 410 });
  }
  const templateRecord = await findMaterialTemplateRecord(share.templateId);
  const template = templateRecord
    ? (findMaterialTemplateVersion(templateRecord, share.templateVersion) ??
      findPublishedMaterialTemplateVersion(templateRecord))
    : undefined;
  if (!template) {
    return new NextResponse('分享对应的模板不存在', { status: 404 });
  }

  const watermark = share.shareImageWatermark
    ? {
        traceLines: ['未审核 · 用户分享', `${share.code} · ${share.createdAt.slice(0, 10)}`] as [
          string,
          string,
        ],
      }
    : undefined;
  const rendered = await renderMaterialTemplateToPng({
    template,
    values: share.values,
    canvas: share.canvas,
    watermark,
    validation: { allowMissingServerDerivedValues: true },
  });

  const publicSiteOrigin = resolvePublicSiteOrigin(request, readRuntimeConfig().siteUrl);
  const shareUrl = new URL(
    appPath(`/m/${encodeURIComponent(share.slug)}/${share.id}`),
    publicSiteOrigin,
  ).toString();
  const qrDataUrl = await QRCode.toDataURL(shareUrl, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 144,
    color: { dark: '#263c3a', light: '#ffffff' },
  });
  const theme = kindTheme[share.kind] ?? kindTheme.custom;
  const png = renderQqBotCardPng({
    type: 'signage',
    title: share.origin === 'workbench' ? '分享物料' : '随机物料',
    eyebrow: `${share.templateTitle} · ${share.createdAt.slice(0, 10)}`,
    color: theme.color,
    icon: theme.icon,
    headline: resolveHeadline(share.kind, share.values, share.templateTitle),
    subline: share.templateTitle,
    meta: [
      `编号 ${share.code}`,
      share.shareImageWatermark
        ? '未审核内容，仅供预览；无水印下载需提交审核'
        : share.origin === 'workbench'
          ? '用户分享 · 非正式物料'
          : '随机生成 · 非正式物料',
    ],
    imageDataUri: `data:image/png;base64,${rendered.png.toString('base64')}`,
    imageWidthPx: rendered.widthPx,
    imageHeightPx: rendered.heightPx,
    qrDataUrl,
    shareUrl,
    date: share.createdAt.slice(0, 10),
    footer: share.shareImageWatermark
      ? '雨城通 · 未审核 · 仅供预览'
      : share.origin === 'workbench'
        ? '雨城通 · 用户分享，非正式物料'
        : '雨城通 · 随机生成，非正式物料',
  });

  return new NextResponse(new Uint8Array(png), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex',
    },
  });
}

function resolveHeadline(
  kind: MaterialShareLinkKind,
  values: Record<string, string>,
  templateTitle: string,
): string {
  const pick = (...keys: string[]) => keys.map((key) => values[key]?.trim()).find(Boolean);
  switch (kind) {
    case 'road_sign':
      return pick('roadName') ?? templateTitle;
    case 'address_sign': {
      const road = values.roadName?.trim() ?? '';
      const number = `${values.buildingNumber ?? ''}${values.buildingSuffix ?? ''}`.trim();
      return [road, number].filter(Boolean).join(' ') || templateTitle;
    }
    case 'bus_stop':
      return pick('stationName', 'routeNumber') ?? templateTitle;
    case 'metro_line':
      return pick('stationName', 'lineName', 'lineLabel') ?? templateTitle;
    default:
      return templateTitle;
  }
}
