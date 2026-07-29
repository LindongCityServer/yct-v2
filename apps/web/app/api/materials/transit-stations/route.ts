import { NextResponse } from 'next/server';
import { listMaterialTransitStations } from '../../../../lib/material-transit-source';

export async function GET() {
  return NextResponse.json({ items: await listMaterialTransitStations() });
}
