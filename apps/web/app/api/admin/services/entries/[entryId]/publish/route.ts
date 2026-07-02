import { NextRequest, NextResponse } from 'next/server';
import { requireYctAdmin } from '../../../../../../../lib/admin-auth';
import { publishServiceEntry } from '../../../../../../../lib/service-entry-workflow';

export async function POST(
  request: NextRequest,
  { params }: Readonly<{ params: Promise<{ entryId: string }> }>,
) {
  const admin = await requireYctAdmin(request);
  if (!admin.ok) {
    return admin.response;
  }

  const { entryId } = await params;
  const result = await publishServiceEntry({
    serviceEntryId: decodeSegment(entryId),
    actorId: admin.ldpassUserId,
  });

  if (!result.ok) {
    return NextResponse.json(result, { status: result.status ?? 400 });
  }

  return NextResponse.json(result.entry);
}

function decodeSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
