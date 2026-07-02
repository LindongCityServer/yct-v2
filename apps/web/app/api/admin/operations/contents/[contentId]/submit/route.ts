import { NextRequest, NextResponse } from 'next/server';
import { requireYctAdmin } from '../../../../../../../lib/admin-auth';
import { submitContentRevision } from '../../../../../../../lib/content-workflow';

export async function POST(
  request: NextRequest,
  { params }: Readonly<{ params: Promise<{ contentId: string }> }>,
) {
  const admin = await requireYctAdmin(request);
  if (!admin.ok) {
    return admin.response;
  }

  const { contentId } = await params;
  const result = await submitContentRevision({
    contentId: decodeSegment(contentId),
    actorId: admin.ldpassUserId,
  });

  if (!result.ok) {
    return NextResponse.json(result, { status: result.status ?? 400 });
  }

  return NextResponse.json(result.record);
}

function decodeSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
