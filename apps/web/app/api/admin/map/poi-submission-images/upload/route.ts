import { NextRequest, NextResponse } from 'next/server';
import { requireYctAdmin } from '../../../../../../lib/admin-auth';
import { uploadPoiSubmissionImage } from '../../../../../../lib/poi-submission-image-workflow';

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
      { error: 'missing_poi_submission_image', message: '请选择需要上传的 POI 图片。' },
      { status: 400 },
    );
  }
  const result = await uploadPoiSubmissionImage({
    actorId: admin.ldpassUserId,
    fileName: file.name,
    mimeType: file.type,
    bytes: new Uint8Array(await file.arrayBuffer()),
  });
  if (!result.ok) {
    return NextResponse.json(result, { status: result.status ?? 400 });
  }
  return NextResponse.json(result.image, { status: 201 });
}
