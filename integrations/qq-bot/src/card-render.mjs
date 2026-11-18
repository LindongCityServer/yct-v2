import QRCode from 'qrcode';
import { renderQqBotCardPng } from './card-renderer.mjs';

const maximumImageBytes = 3 * 1024 * 1024;

/**
 * 在机器人进程内渲染卡片，避免依赖网页的 /api/qq-bot/card。
 * POI 封面和二维码在这里预取，渲染器本身保持纯同步。
 */
export async function renderCardPng(card, { allowedImageHosts = [] } = {}) {
  const enriched = await enrichCard(card, allowedImageHosts);
  return renderQqBotCardPng(enriched);
}

async function enrichCard(card, allowedImageHosts) {
  if (!card || card.type !== 'poi') {
    return card;
  }
  const [imageDataUri, qrDataUrl] = await Promise.all([
    embedImage(card.imageUrl, allowedImageHosts),
    createQrDataUrl(card.shareUrl),
  ]);
  return {
    ...card,
    imageDataUri: imageDataUri ?? card.imageDataUri,
    qrDataUrl: qrDataUrl ?? card.qrDataUrl,
  };
}

async function embedImage(raw, allowedImageHosts) {
  if (!raw) {
    return null;
  }
  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || !isAllowedHost(url.host, allowedImageHosts)) {
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
    if (buffer.byteLength === 0 || buffer.byteLength > maximumImageBytes) {
      return null;
    }
    return `data:${type};base64,${buffer.toString('base64')}`;
  } catch {
    return null;
  }
}

function isAllowedHost(host, allowedHosts) {
  return allowedHosts.some((value) => {
    try {
      return new URL(value).host === host;
    } catch {
      return value === host;
    }
  });
}

async function createQrDataUrl(text) {
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
