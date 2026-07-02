import { NextResponse } from 'next/server';
import { readLegacyAssetManifest } from '../../../../lib/legacy-asset-manifest';

export const dynamic = 'force-dynamic';

export async function GET() {
  const manifest = await readLegacyAssetManifest();
  return NextResponse.json(manifest);
}
