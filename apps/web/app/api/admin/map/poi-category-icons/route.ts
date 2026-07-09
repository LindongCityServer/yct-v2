import { NextRequest, NextResponse } from 'next/server';
import { requireYctAdmin } from '../../../../../lib/admin-auth';
import { deletePoiCategoryIcon } from '../../../../../lib/poi-category-icon-workflow';

export const dynamic = 'force-dynamic';

export async function DELETE(request: NextRequest) {
  const admin = await requireYctAdmin(request);
  if (!admin.ok) {
    return admin.response;
  }

  const body = (await request.json().catch(() => null)) as {
    iconFileName?: unknown;
    fileName?: unknown;
  } | null;
  const iconFileName = typeof body?.iconFileName === 'string'
    ? body.iconFileName
    : typeof body?.fileName === 'string'
      ? body.fileName
      : '';

  const result = await deletePoiCategoryIcon({
    actorId: admin.ldpassUserId,
    iconFileName,
  });

  if (!result.ok) {
    return NextResponse.json(result, { status: result.status ?? 400 });
  }

  return NextResponse.json(result.icon);
}
