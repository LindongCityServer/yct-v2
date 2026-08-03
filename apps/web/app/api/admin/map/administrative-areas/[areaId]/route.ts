import { NextRequest, NextResponse } from 'next/server';
import { administrativeAreaUpsertSchema } from '@yct/schemas';
import { requireYctAdmin } from '../../../../../../lib/admin-auth';
import { updateAdministrativeArea } from '../../../../../../lib/administrative-area-workflow';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: NextRequest,
  { params }: Readonly<{ params: Promise<{ areaId: string }> }>,
) {
  const admin = await requireYctAdmin(request);
  if (!admin.ok) return admin.response;
  const parsed = administrativeAreaUpsertSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'invalid_administrative_area',
        message: '行政区划内容不符合要求。',
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }
  const { areaId } = await params;
  const result = await updateAdministrativeArea({
    id: decodeSegment(areaId),
    actorId: admin.ldpassUserId,
    area: parsed.data,
  });
  return NextResponse.json(result, { status: result.status ?? 200 });
}

function decodeSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
