import QRCode from 'qrcode';
import { NextResponse } from 'next/server';
import { parseQqBotCardPayload, renderQqBotCardPng, type QqBotCard } from '../../../../lib/qq-bot-card';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const maximumEmbeddedImageBytes = 3 * 1024 * 1024;

/**
 * QQ 机器人指令卡片的公开渲染地址。机器人把卡片数据 base64url 后拼到 d 参数，
 * QQ 侧直接按 URL 拉取 PNG。
 */
export async function GET(request: Request) {
  const payload = new URL(request.url).searchParams.get('d') ?? '';
  if (!payload || payload.length > 4096) {
    return new NextResponse('Bad Request', { status: 400 });
  }

  const parsed = parseQqBotCardPayload(payload);
  if (!parsed) {
    return new NextResponse('Bad Request', { status: 400 });
  }

  try {
    const card = parsed.type === 'poi' ? await enrichPoiCard(parsed) : parsed;
    const png = renderQqBotCardPng(card);
    return new NextResponse(new Uint8Array(png), {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
        'Content-Type': 'image/png',
        'X-Content-Type-Options': 'nosniff',
        'X-Robots-Tag': 'noindex',
      },
    });
  } catch (error) {
    console.error('QQ 机器人卡片渲染失败：', error);
    return new NextResponse('Card Render Failed', { status: 500 });
  }
}

async function enrichPoiCard(card: Extract<QqBotCard, { type: 'poi' }>): Promise<QqBotCard> {
  const [imageDataUri, qrDataUrl] = await Promise.all([
    embedPublicImage(card.imageUrl),
    createQrDataUrl(card.shareUrl),
  ]);
  return {
    ...card,
    imageDataUri: imageDataUri ?? undefined,
    qrDataUrl: qrDataUrl ?? undefined,
  };
}

async function embedPublicImage(raw: string | undefined): Promise<string | null> {
  if (!raw) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || !isAllowedImageHost(url.host)) {
    return null;
  }
  try {
    const response = await fetch(url, {
      cache: 'no-store',
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) {
      return null;
    }
    const type = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? '';
    if (!type.startsWith('image/') || type === 'image/svg+xml') {
      return null;
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength === 0 || buffer.byteLength > maximumEmbeddedImageBytes) {
      return null;
    }
    return `data:${type};base64,${buffer.toString('base64')}`;
  } catch {
    return null;
  }
}

function isAllowedImageHost(host: string): boolean {
  const configured = [
    process.env.YCT_PUBLIC_SITE_URL,
    process.env.YCT_PUBLIC_BASE_URL,
    process.env.NEXT_PUBLIC_YCT_PUBLIC_SITE_URL,
  ];
  for (const value of configured) {
    try {
      const candidate = new URL(value ?? '');
      if (candidate.host === host) {
        return true;
      }
    } catch {
      // 继续检查下一个配置。
    }
  }
  return host === 'shangxiaoguan.top' || host.endsWith('.shangxiaoguan.top');
}

async function createQrDataUrl(text: string): Promise<string | null> {
  if (!text) {
    return null;
  }
  try {
    return await QRCode.toDataURL(text, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 104,
      color: { dark: '#263c3a', light: '#ffffff' },
    });
  } catch {
    return null;
  }
}
