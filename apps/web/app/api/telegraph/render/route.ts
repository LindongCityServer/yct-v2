import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { telegraphRenderRequestSchema } from '@yct/schemas';
import { publishDomainEvent } from '../../../../lib/app-event-bus';
import { resolveClientIp } from '../../../../lib/request-client-ip';
import { evaluateTelegraphDraft } from '../../../../lib/telegraph-domain';
import { renderTelegraphPaper } from '../../../../lib/telegraph-renderer';

export async function POST(request: NextRequest) {
  const parsed = telegraphRenderRequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'invalid_telegraph_render',
        message: '电报导出参数不符合要求。',
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  const result = evaluateTelegraphDraft(parsed.data.draft);
  if (result.unsupportedCharacters.length > 0) {
    return NextResponse.json(
      {
        error: 'unsupported_telegraph_characters',
        message: `包含暂不支持的字符：${result.unsupportedCharacters.join('、')}`,
      },
      { status: 422 },
    );
  }

  try {
    const png = await renderTelegraphPaper({
      paper: parsed.data.paper,
      draft: parsed.data.draft,
      result,
      serialNumber: parsed.data.serialNumber,
      generatedAt: parsed.data.generatedAt,
      watermarkLabel: resolveClientIp(request.headers),
    });
    await publishDomainEvent({
      eventId: `event_${randomUUID()}`,
      type: 'TelegraphArtifactDownloaded',
      actor: { type: 'anonymous' },
      payload: {
        draftId: parsed.data.serialNumber,
        artifact: parsed.data.paper === 'send' ? 'send-paper' : 'receive-paper',
        anonymous: true,
      },
    });
    return new NextResponse(new Uint8Array(png), {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'no-store',
        'X-Yct-Telegraph-Grids': String(result.billableGrids),
        'X-Yct-Telegraph-Amount': result.amount.toFixed(2),
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'telegraph_render_failed',
        message: error instanceof Error ? error.message : '电报图片生成失败。',
      },
      { status: 500 },
    );
  }
}
