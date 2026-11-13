import { NextRequest, NextResponse } from 'next/server';
import {
  listMaterialAddressPoiLocations,
  listMaterialLocations,
} from '../../../../lib/material-location-source';

export async function GET(request: NextRequest) {
  // kind=address：门牌模板专用，只返回地址中带可解析门牌号的 POI。
  const kind = request.nextUrl.searchParams.get('kind');
  const items =
    kind === 'address' ? await listMaterialAddressPoiLocations() : await listMaterialLocations();
  return NextResponse.json({ items });
}
