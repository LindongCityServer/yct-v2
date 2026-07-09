import { NextRequest, NextResponse } from 'next/server';
import { requireYctAdmin } from '../../../../../../lib/admin-auth';
import { uploadPoiCategoryIcon } from '../../../../../../lib/poi-category-icon-workflow';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const admin = await requireYctAdmin(request);
  if (!admin.ok) {
    return admin.response;
  }

  const formData = await request.formData();
  const file = formData.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json(
      {
        error: 'missing_poi_category_icon',
        message: '请选择需要上传的 POI 分类图标。',
      },
      { status: 400 },
    );
  }

  const result = await uploadPoiCategoryIcon({
    actorId: admin.ldpassUserId,
    fileName: file.name,
    mimeType: file.type,
    bytes: new Uint8Array(await file.arrayBuffer()),
  });

  if (!result.ok) {
    return NextResponse.json(result, { status: result.status ?? 400 });
  }

  return NextResponse.json(result.icon, { status: 201 });
}
