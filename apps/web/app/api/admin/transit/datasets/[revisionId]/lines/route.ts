import { NextRequest, NextResponse } from 'next/server';
import { transitLineDraftSchema } from '@yct/schemas';
import { requireYctAdmin } from '../../../../../../../lib/admin-auth';
import { saveTransitLine } from '../../../../../../../lib/transit-data-workflow';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: Readonly<{ params: Promise<{ revisionId: string }> }>,
) {
  const admin = await requireYctAdmin(request);
  if (!admin.ok) {
    return admin.response;
  }

  const body = await request.json();
  const parsed = transitLineDraftSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'invalid_transit_line_create',
        message: '线路新增内容不符合要求。',
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  const { revisionId } = await params;
  const result = await saveTransitLine({
    revisionId: decodeSegment(revisionId),
    actorId: admin.ldpassUserId,
    patch: parsed.data,
  });
  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error,
        message: result.message,
      },
      { status: result.status ?? 500 },
    );
  }

  return NextResponse.json(result.revision);
}

function decodeSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
