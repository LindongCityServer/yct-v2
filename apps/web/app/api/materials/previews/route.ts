import { NextRequest, NextResponse } from 'next/server';
import { materialPreviewRequestSchema } from '@yct/schemas';
import { requireActiveLdpassUser } from '../../../../lib/user-auth';
import { prepareMaterialPreview } from '../../../../lib/material-workflow';

export async function POST(request: NextRequest) {
  const parsed = materialPreviewRequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'invalid_material_preview',
        message: '物料预览参数不符合要求。',
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }
  if (parsed.data.mode === 'manual') {
    const user = await requireActiveLdpassUser(request);
    if (!user.ok) {
      return user.response;
    }
  }
  const result = await prepareMaterialPreview({ request: parsed.data });
  if (!result.ok) {
    return NextResponse.json(result, { status: result.status ?? 400 });
  }
  if (!result.png || !result.widthPx || !result.heightPx) {
    return NextResponse.json(
      { error: 'material_preview_unavailable', message: '物料预览结果不可用。' },
      { status: 500 },
    );
  }
  return new NextResponse(new Uint8Array(result.png), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'no-store',
      'X-Yct-Material-Preview-Width': String(result.widthPx),
      'X-Yct-Material-Preview-Height': String(result.heightPx),
    },
  });
}
