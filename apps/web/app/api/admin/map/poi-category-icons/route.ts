import { NextRequest, NextResponse } from 'next/server';
import { poiCategoryIconRenameSchema } from '@yct/schemas';
import { requireYctAdmin } from '../../../../../lib/admin-auth';
import { listPoiCategoryIconMetadata } from '../../../../../lib/poi-category-icon-metadata-store';
import {
  deletePoiCategoryIcon,
  renamePoiCategoryIcon,
} from '../../../../../lib/poi-category-icon-workflow';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const admin = await requireYctAdmin(request);
  if (!admin.ok) {
    return admin.response;
  }

  return NextResponse.json({ items: await listPoiCategoryIconMetadata() });
}

export async function PATCH(request: NextRequest) {
  const admin = await requireYctAdmin(request);
  if (!admin.ok) {
    return admin.response;
  }

  const parsed = poiCategoryIconRenameSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_poi_category_icon_name', message: '图标显示名称不符合要求。' },
      { status: 400 },
    );
  }

  const result = await renamePoiCategoryIcon({
    actorId: admin.ldpassUserId,
    ...parsed.data,
  });
  if (!result.ok) {
    return NextResponse.json(result, { status: result.status ?? 400 });
  }
  return NextResponse.json(result.icon);
}

export async function DELETE(request: NextRequest) {
  const admin = await requireYctAdmin(request);
  if (!admin.ok) {
    return admin.response;
  }

  const body = (await request.json().catch(() => null)) as {
    iconFileName?: unknown;
    fileName?: unknown;
  } | null;
  const iconFileName =
    typeof body?.iconFileName === 'string'
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
