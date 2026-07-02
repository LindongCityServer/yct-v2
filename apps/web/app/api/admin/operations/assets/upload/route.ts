import { NextRequest, NextResponse } from 'next/server';
import { requireYctAdmin } from '../../../../../../lib/admin-auth';
import { uploadContentAsset } from '../../../../../../lib/content-asset-workflow';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const admin = await requireYctAdmin(request);
  if (!admin.ok) {
    return admin.response;
  }

  const formData = await request.formData();
  const file = formData.get('asset');
  if (!(file instanceof File)) {
    return NextResponse.json(
      {
        error: 'missing_content_asset_file',
        message: '请上传内容素材文件。',
      },
      { status: 400 },
    );
  }

  const result = await uploadContentAsset({
    actorId: admin.ldpassUserId,
    fileName: file.name,
    mimeType: file.type,
    bytes: new Uint8Array(await file.arrayBuffer()),
  });

  if (!result.ok) {
    return NextResponse.json(result, { status: result.status ?? 400 });
  }

  return NextResponse.json(result, { status: result.reused ? 200 : 201 });
}
