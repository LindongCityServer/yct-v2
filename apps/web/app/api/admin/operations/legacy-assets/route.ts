import { NextRequest, NextResponse } from 'next/server';
import { requireYctAdmin } from '../../../../../lib/admin-auth';
import { readLegacyAssetDownloadReport } from '../../../../../lib/legacy-asset-download-report';
import { readLegacyAssetManifest } from '../../../../../lib/legacy-asset-manifest';
import { createLegacyContentAssetInventoryResponse } from '../../../../../lib/legacy-content-asset-inventory';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const admin = await requireYctAdmin(request);
  if (!admin.ok) {
    return admin.response;
  }

  const manifest = await readLegacyAssetManifest();
  const downloadReport = await readLegacyAssetDownloadReport();
  const contentAssets = createLegacyContentAssetInventoryResponse(manifest, downloadReport);

  return NextResponse.json({
    manifest,
    downloadReport,
    contentAssets,
  });
}
