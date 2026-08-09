import { mapShareLinkCreateSchema } from '@yct/schemas';
import { NextResponse } from 'next/server';
import { appPath } from '../../../../lib/app-paths';
import { createMapShareLink } from '../../../../lib/map-share-link-workflow';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (Number.isFinite(contentLength) && contentLength > 8192) {
    return NextResponse.json({ message: '分享内容过大。' }, { status: 413 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: '分享内容格式无效。' }, { status: 400 });
  }

  const parsed = mapShareLinkCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: '分享内容不符合要求。' }, { status: 400 });
  }

  try {
    const link = await createMapShareLink(parsed.data);
    return NextResponse.json({
      id: link.id,
      url: appPath(`/s/${encodeURIComponent(link.id)}`),
    });
  } catch {
    return NextResponse.json({ message: '暂时无法创建分享链接。' }, { status: 503 });
  }
}
