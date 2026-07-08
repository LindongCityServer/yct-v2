import { NextRequest, NextResponse } from 'next/server';
import { requireYctAdmin } from '../../../../../../lib/admin-auth';
import { adminContentDraftSchema } from '../../../../../../lib/admin-content-draft-schema';
import { updateContentDraft } from '../../../../../../lib/content-workflow';

interface RouteContext {
  params: Promise<{
    contentId: string;
  }>;
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const admin = await requireYctAdmin(request);
  if (!admin.ok) {
    return admin.response;
  }

  const { contentId } = await context.params;
  const body = await request.json();
  const parsed = adminContentDraftSchema.safeParse(body);
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

  const result = await updateContentDraft({
    contentId,
    title: parsed.data.title,
    categoryId: parsed.data.categoryId,
    markdown: parsed.data.markdown,
    assetIds: parsed.data.assetIds,
    actorId: admin.ldpassUserId,
    metadata: {
      excerpt: parsed.data.excerpt,
      showInBanner: parsed.data.showInBanner,
      bannerSortOrder: parsed.data.bannerSortOrder,
      customTags: parsed.data.customTags,
      coverColor: parsed.data.coverColor,
      coverImageUrl: parsed.data.coverImageUrl,
      expiresAt: parsed.data.expiresAt,
    },
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

  return NextResponse.json(result.record);
}
