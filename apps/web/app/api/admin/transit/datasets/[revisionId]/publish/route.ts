import { NextRequest, NextResponse } from 'next/server';
import { requireYctAdmin } from '../../../../../../../lib/admin-auth';
import { publishTransitDataRevision } from '../../../../../../../lib/transit-data-workflow';

export async function POST(
  request: NextRequest,
  { params }: Readonly<{ params: Promise<{ revisionId: string }> }>,
) {
  const admin = await requireYctAdmin(request);
  if (!admin.ok) {
    return admin.response;
  }

  const { revisionId } = await params;
  const result = await publishTransitDataRevision({
    revisionId: decodeSegment(revisionId),
    actorId: admin.ldpassUserId,
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
