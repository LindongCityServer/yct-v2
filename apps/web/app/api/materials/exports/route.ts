import { NextRequest, NextResponse } from 'next/server';
import { materialExportRequestSchema } from '@yct/schemas';
import { requireActiveLdpassUser } from '../../../../lib/user-auth';
import { prepareMaterialExport } from '../../../../lib/material-workflow';

export async function POST(request: NextRequest) {
  const user = await requireActiveLdpassUser(request);
  if (!user.ok) {
    return user.response;
  }
  const parsed = materialExportRequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'invalid_material_export',
        message: '物料导出参数不符合要求。',
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }
  const result = await prepareMaterialExport({ request: parsed.data, actorId: user.ldpassUserId });
  if (!result.ok) {
    return NextResponse.json(result, { status: result.status ?? 400 });
  }
  if (!result.png || !result.fileName) {
    return NextResponse.json(
      { error: 'material_export_unavailable', message: '物料导出结果不可用。' },
      { status: 500 },
    );
  }
  return new NextResponse(new Uint8Array(result.png), {
    headers: {
      'Content-Type': 'image/png',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(result.fileName)}`,
      'Cache-Control': 'no-store',
      'X-Yct-Material-Export-Id': result.audit?.id ?? '',
    },
  });
}
