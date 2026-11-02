import { NextRequest, NextResponse } from 'next/server';
import { contentPublishRequestSchema } from '@yct/schemas';
import { requireYctAdmin } from '../../../../../../../lib/admin-auth';
import { publishContentRevision } from '../../../../../../../lib/content-workflow';
import { formatValidationErrorMessage } from '../../../../../../../lib/validation-error-message';

export async function POST(
  request: NextRequest,
  { params }: Readonly<{ params: Promise<{ contentId: string }> }>,
) {
  const admin = await requireYctAdmin(request);
  if (!admin.ok) {
    return admin.response;
  }

  const body = await request.json();
  const parsed = contentPublishRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'invalid_publish_request',
        message: formatValidationErrorMessage('发布请求不符合要求', parsed.error),
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  const { contentId } = await params;
  const result = await publishContentRevision({
    contentId: decodeSegment(contentId),
    actorId: admin.ldpassUserId,
    mode: parsed.data.mode,
    scheduledAt: parsed.data.scheduledAt,
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
