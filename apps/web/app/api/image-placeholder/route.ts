import { NextResponse } from 'next/server';
import { readImagePlaceholder } from '../../../lib/image-placeholder';

const defaultWidth = 32;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url') ?? '';
  const width = Number(searchParams.get('w') ?? defaultWidth);

  const placeholder = await readImagePlaceholder({ url, width });
  if (!placeholder) {
    return new NextResponse(null, { status: 404 });
  }

  return new NextResponse(toArrayBuffer(placeholder.bytes), {
    headers: {
      // 占位 URL 不带版本号，源图替换后同一 URL 需要能刷新；
      // proxy.ts 会统一给 API 加上 no-store，这里设置短缓存只作为直连部署时的兜底。
      'Cache-Control': 'public, max-age=300, must-revalidate',
      'Content-Type': placeholder.contentType,
    },
  });
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const body = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(body).set(bytes);
  return body;
}
