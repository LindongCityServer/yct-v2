import { NextResponse } from 'next/server';
import { listMaterialTransitLines } from '../../../../lib/material-transit-source';

export async function GET() {
  return NextResponse.json({ items: await listMaterialTransitLines() });
}
