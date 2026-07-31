import { NextResponse } from 'next/server';
import { loadDefaultMaterialTransitNetworkSample } from '../../../../../lib/material-transit-network-sample';

export async function GET() {
  try {
    return NextResponse.json(await loadDefaultMaterialTransitNetworkSample(), {
      headers: {
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
      },
    });
  } catch {
    return NextResponse.json(
      {
        error: 'material_transit_network_sample_unavailable',
        message: '默认示例线网暂时无法加载。',
      },
      { status: 502 },
    );
  }
}
