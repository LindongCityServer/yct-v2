import { NextResponse } from 'next/server';
import { readPoiCategoryIconFile } from '../../../../../lib/poi-category-icon-store';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: Readonly<{ params: Promise<{ iconId: string }> }>,
) {
  const { iconId } = await params;

  try {
    const image = await readPoiCategoryIconFile(decodeSegment(iconId));
    return new NextResponse(toArrayBuffer(image.bytes), {
      headers: {
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Content-Type': image.mimeType,
      },
    });
  } catch {
    return NextResponse.json(
      {
        error: 'poi_category_icon_not_found',
        message: 'POI 分类图标不存在。',
      },
      { status: 404 },
    );
  }
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const body = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(body).set(bytes);
  return body;
}

function decodeSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
