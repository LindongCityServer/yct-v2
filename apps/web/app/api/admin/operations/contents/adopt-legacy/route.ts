import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireYctAdmin } from '../../../../../../lib/admin-auth';
import { adoptLegacyContent } from '../../../../../../lib/content-workflow';

const adoptLegacyContentSchema = z.object({
  contentId: z.string().trim().min(1).max(240),
});

export async function POST(request: NextRequest) {
  const admin = await requireYctAdmin(request);
  if (!admin.ok) {
    return admin.response;
  }

  const parsed = adoptLegacyContentSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'invalid_legacy_content_adoption',
        message: '旧消息标识无效。',
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  const result = await adoptLegacyContent({
    contentId: parsed.data.contentId,
    actorId: admin.ldpassUserId,
  });
  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error,
        message: result.message,
      },
      { status: result.status ?? 409 },
    );
  }

  return NextResponse.json(result.record, { status: 201 });
}
