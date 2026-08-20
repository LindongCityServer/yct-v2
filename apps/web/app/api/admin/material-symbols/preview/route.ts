import { NextRequest, NextResponse } from 'next/server';
import { requireYctAdmin } from '../../../../../lib/admin-auth';
import { previewMaterialSymbol } from '../../../../../lib/material-symbol-asset-workflow';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const admin = await requireYctAdmin(request);
  if (!admin.ok) {
    return admin.response;
  }

  const iconName = request.nextUrl.searchParams.get('name') ?? '';
  const result = await previewMaterialSymbol(iconName);
  if (!result.ok || !result.svg) {
    return NextResponse.json(
      { error: result.error, message: result.message },
      { status: result.status ?? 502 },
    );
  }

  return new NextResponse(result.svg, {
    headers: {
      'Cache-Control': 'private, max-age=60',
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
