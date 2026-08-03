import { NextRequest, NextResponse } from 'next/server';
import { administrativeAreaStatusActionSchema } from '@yct/schemas';
import { requireYctAdmin } from '../../../../../../../lib/admin-auth';
import { changeAdministrativeAreaStatus } from '../../../../../../../lib/administrative-area-workflow';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: Readonly<{ params: Promise<{ areaId: string }> }>,
) {
  const admin = await requireYctAdmin(request);
  if (!admin.ok) return admin.response;
  const parsed = administrativeAreaStatusActionSchema.safeParse(
    await request.json().catch(() => ({})),
  );
  if (!parsed.success) return NextResponse.json({ error: 'invalid_action' }, { status: 400 });
  const { areaId } = await params;
  const result = await changeAdministrativeAreaStatus({
    id: decodeSegment(areaId),
    actorId: admin.ldpassUserId,
    action: parsed.data.action,
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
