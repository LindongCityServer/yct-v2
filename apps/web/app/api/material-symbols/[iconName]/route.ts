import { NextResponse } from 'next/server';
import {
  getMaterialSymbolAsset,
  readMaterialSymbolAssetFile,
} from '../../../../lib/material-symbol-asset-store';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: Readonly<{ params: Promise<{ iconName: string }> }>,
) {
  const { iconName: rawIconName } = await params;
  const iconName = decodeSegment(rawIconName);
  const asset = await getMaterialSymbolAsset(iconName);
  if (!asset) {
    return new NextResponse(null, { status: 404 });
  }

  try {
    const bytes = await readMaterialSymbolAssetFile(asset.fileName);
    return new NextResponse(bytes as BodyInit, {
      headers: {
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
        'Content-Type': 'image/svg+xml; charset=utf-8',
        ETag: `"${asset.sha256}"`,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}

function decodeSegment(value: string): string {
  try {
    return decodeURIComponent(value).trim().toLowerCase();
  } catch {
    return value.trim().toLowerCase();
  }
}
