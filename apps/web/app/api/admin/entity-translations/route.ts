import { NextRequest, NextResponse } from 'next/server';
import { entityTranslationUpdateSchema } from '@yct/schemas';
import { requireYctAdmin } from '../../../../lib/admin-auth';
import { listEntityTranslations } from '../../../../lib/entity-translation-store';
import { updateEntityTranslations } from '../../../../lib/entity-translation-workflow';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const admin = await requireYctAdmin(request);
  if (!admin.ok) {
    return admin.response;
  }
  return NextResponse.json({ items: await listEntityTranslations() });
}

export async function POST(request: NextRequest) {
  const admin = await requireYctAdmin(request);
  if (!admin.ok) {
    return admin.response;
  }
  const parsed = entityTranslationUpdateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'invalid_entity_translation_update',
        message: '实体翻译内容不符合要求。',
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }
  const item = await updateEntityTranslations({
    ...parsed.data,
    actorId: admin.ldpassUserId,
  });
  return NextResponse.json({ item });
}
