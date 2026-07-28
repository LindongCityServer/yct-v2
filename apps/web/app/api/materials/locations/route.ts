import { NextResponse } from 'next/server';
import { listMaterialLocations } from '../../../../lib/material-location-source';

export async function GET() {
  return NextResponse.json({ items: await listMaterialLocations() });
}
