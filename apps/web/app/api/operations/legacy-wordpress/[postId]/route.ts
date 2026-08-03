import { NextResponse } from 'next/server';
import type { LegacyWordPressContentResolutionResponse } from '@yct/contracts';
import { readOperationDetail } from '../../../../../lib/operations-content';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ postId: string }>;
}

const publicCorsHeaders = {
  'Access-Control-Allow-Headers': 'Accept',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'no-store, max-age=0, must-revalidate',
  'Cross-Origin-Resource-Policy': 'cross-origin',
  Pragma: 'no-cache',
};

export async function GET(_request: Request, context: RouteContext) {
  const { postId: rawPostId } = await context.params;
  const postId = normalizeWordPressPostId(rawPostId);

  if (!postId) {
    return NextResponse.json(
      {
        error: 'invalid_wordpress_post_id',
        message: 'WordPress 文章 ID 必须是正整数。',
      },
      { status: 400, headers: publicCorsHeaders },
    );
  }

  const contentId = `wordpress_content_${postId}`;
  const { item, meta } = await readOperationDetail(contentId);

  if (item) {
    return resolutionResponse({ postId, contentId, status: 'published' });
  }

  if (meta.sourceStatus !== 'ready') {
    return resolutionResponse({ postId, contentId, status: 'unavailable' }, 503);
  }

  return resolutionResponse({ postId, contentId, status: 'not_published' }, 404);
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: publicCorsHeaders });
}

function resolutionResponse(body: LegacyWordPressContentResolutionResponse, status = 200) {
  return NextResponse.json(body, { status, headers: publicCorsHeaders });
}

function normalizeWordPressPostId(value: string): string | undefined {
  const trimmed = value.trim();
  if (!/^\d{1,20}$/.test(trimmed)) {
    return undefined;
  }

  const normalized = BigInt(trimmed).toString();
  return normalized === '0' ? undefined : normalized;
}
