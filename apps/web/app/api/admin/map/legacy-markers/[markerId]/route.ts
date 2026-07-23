import { NextRequest, NextResponse } from 'next/server';
import { legacyMapMarkerAdminUpdateSchema } from '@yct/schemas';
import { requireYctAdmin } from '../../../../../../lib/admin-auth';
import {
  archiveLegacyMapMarkerByAdmin,
  updateLegacyMapMarkerByAdmin,
} from '../../../../../../lib/legacy-map-marker-workflow';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: NextRequest,
  { params }: Readonly<{ params: Promise<{ markerId: string }> }>,
) {
  const admin = await requireYctAdmin(request);
  if (!admin.ok) {
    return admin.response;
  }

  const body = await request.json();
  const parsed = legacyMapMarkerAdminUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'invalid_legacy_map_marker_update',
        message: '旧有标记点更新内容不符合要求。',
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  const { markerId } = await params;
  const result = await updateLegacyMapMarkerByAdmin({
    markerId: decodeSegment(markerId),
    actorId: admin.ldpassUserId,
    patch: {
      label: parsed.data.label,
      categoryId: parsed.data.categoryId || undefined,
      iconFileName: parsed.data.iconFileName || undefined,
      description: parsed.data.description,
      href: parsed.data.href || undefined,
      imageUrls: parsed.data.imageUrls,
      imageUrl: parsed.data.imageUrl,
      geometry: parsed.data.geometry,
      parentMarkerId: parsed.data.parentMarkerId || undefined,
      floorLabel: parsed.data.floorLabel || undefined,
      boundRegionMarkerIds: parsed.data.boundRegionMarkerIds,
      openingHours: parsed.data.openingHours,
      address: parsed.data.address,
      addressRoadMarkerId: parsed.data.addressRoadMarkerId,
      facilities: parsed.data.facilities,
    },
  });

  if (!result.ok) {
    return NextResponse.json(result, { status: result.status ?? 400 });
  }

  return NextResponse.json(result);
}

export async function DELETE(
  request: NextRequest,
  { params }: Readonly<{ params: Promise<{ markerId: string }> }>,
) {
  const admin = await requireYctAdmin(request);
  if (!admin.ok) {
    return admin.response;
  }

  const { markerId } = await params;
  const result = await archiveLegacyMapMarkerByAdmin({
    markerId: decodeSegment(markerId),
    actorId: admin.ldpassUserId,
  });

  if (!result.ok) {
    return NextResponse.json(result, { status: result.status ?? 400 });
  }

  return NextResponse.json(result);
}

function decodeSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
