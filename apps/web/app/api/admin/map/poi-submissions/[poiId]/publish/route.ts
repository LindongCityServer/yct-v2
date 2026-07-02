import { NextRequest, NextResponse } from 'next/server';
import { requireYctAdmin } from '../../../../../../../lib/admin-auth';
import { publishPoiSubmission } from '../../../../../../../lib/poi-submission-workflow';

export async function POST(
  request: NextRequest,
  { params }: Readonly<{ params: Promise<{ poiId: string }> }>,
) {
  const admin = await requireYctAdmin(request);
  if (!admin.ok) {
    return admin.response;
  }

  const { poiId } = await params;
  const result = await publishPoiSubmission({
    poiId: decodeSegment(poiId),
    actorId: admin.ldpassUserId,
  });

  if (!result.ok) {
    return NextResponse.json(result, { status: result.status ?? 400 });
  }

  return NextResponse.json(result.submission);
}

function decodeSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
