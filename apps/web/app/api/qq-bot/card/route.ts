import { NextResponse } from 'next/server';
import { parseQqBotCardPayload, renderQqBotCardPng } from '../../../../lib/qq-bot-card';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * QQ 机器人指令卡片的公开渲染地址。
 * 机器人把卡片数据 base64url 后拼到 d 参数，QQ 侧直接按 URL 拉取 PNG。
 */
export async function GET(request: Request) {
  const payload = new URL(request.url).searchParams.get('d') ?? '';
  if (!payload || payload.length > 4096) {
    return new NextResponse('Bad Request', { status: 400 });
  }

  const card = parseQqBotCardPayload(payload);
  if (!card) {
    return new NextResponse('Bad Request', { status: 400 });
  }

  try {
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
