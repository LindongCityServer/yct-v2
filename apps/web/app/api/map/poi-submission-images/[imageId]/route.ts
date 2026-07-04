import { NextResponse } from 'next/server';
import { readPoiSubmissionImageFile } from '../../../../../lib/poi-submission-image-store';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: Readonly<{ params: Promise<{ imageId: string }> }>,
) {
  const { imageId } = await params;

  try {
    const image = await readPoiSubmissionImageFile(decodeSegment(imageId));
    return new NextResponse(toArrayBuffer(image.bytes), {
      headers: {
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Content-Type': image.mimeType,
      },
    });
  } catch {
    return NextResponse.json(
      {
        error: 'poi_submission_image_not_found',
        message: 'POI 投稿图片不存在。',
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
