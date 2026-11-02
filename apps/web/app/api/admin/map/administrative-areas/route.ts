import { NextRequest, NextResponse } from 'next/server';
import { administrativeAreaUpsertSchema } from '@yct/schemas';
import { requireYctAdmin } from '../../../../../lib/admin-auth';
import { listAdministrativeAreas } from '../../../../../lib/administrative-area-store';
import { createAdministrativeArea } from '../../../../../lib/administrative-area-workflow';
import { formatValidationErrorMessage } from '../../../../../lib/validation-error-message';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const admin = await requireYctAdmin(request);
  if (!admin.ok) return admin.response;
  return NextResponse.json({ items: await listAdministrativeAreas() });
}

export async function POST(request: NextRequest) {
  const admin = await requireYctAdmin(request);
  if (!admin.ok) return admin.response;
  const parsed = administrativeAreaUpsertSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'invalid_administrative_area',
        message: formatValidationErrorMessage('行政区划内容不符合要求', parsed.error),
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }
  const result = await createAdministrativeArea({ actorId: admin.ldpassUserId, area: parsed.data });
  return NextResponse.json(result, { status: result.status ?? 200 });
}
