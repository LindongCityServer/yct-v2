import { NextRequest, NextResponse } from 'next/server';
import { contentRevisionDraftSchema } from '@yct/schemas';
import { z } from 'zod';
import { requireYctAdmin } from '../../../../../lib/admin-auth';
import { createContentDraft, listAdminContentRecords } from '../../../../../lib/content-workflow';

const createContentSchema = contentRevisionDraftSchema.extend({
  excerpt: z.string().trim().max(500).optional(),
  showInBanner: z.boolean().default(false),
  coverColor: z.string().trim().max(120).optional(),
  coverImageUrl: z.string().url().optional(),
  expiresAt: z.string().datetime({ offset: true }).optional(),
});

export async function GET(request: NextRequest) {
  const admin = await requireYctAdmin(request);
  if (!admin.ok) {
    return admin.response;
  }

  const records = await listAdminContentRecords();
  return NextResponse.json({
    items: records,
  });
}

export async function POST(request: NextRequest) {
  const admin = await requireYctAdmin(request);
  if (!admin.ok) {
    return admin.response;
  }

  const body = await request.json();
  const parsed = createContentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'invalid_content_draft',
        message: '内容草稿不符合要求。',
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  const result = await createContentDraft({
    title: parsed.data.title,
    categoryId: parsed.data.categoryId,
    markdown: parsed.data.markdown,
    assetIds: parsed.data.assetIds,
    actorId: admin.ldpassUserId,
    metadata: {
      excerpt: parsed.data.excerpt,
      showInBanner: parsed.data.showInBanner,
      coverColor: parsed.data.coverColor,
      coverImageUrl: parsed.data.coverImageUrl,
      expiresAt: parsed.data.expiresAt,
    },
  });

  return NextResponse.json(result.record, { status: 201 });
}
