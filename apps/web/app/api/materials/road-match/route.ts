import { NextRequest, NextResponse } from 'next/server';
import { resolveMaterialRoadSideHint } from '../../../../lib/material-location-source';

/**
 * 路牌套用向导：根据落点坐标返回最近道路名称与所在侧，
 * 让用户在确认套用前就知道路牌会装在哪条路的哪一侧。
 */
export async function GET(request: NextRequest) {
  const x = Number(request.nextUrl.searchParams.get('x'));
  const z = Number(request.nextUrl.searchParams.get('z'));
  if (!Number.isFinite(x) || !Number.isFinite(z)) {
    return NextResponse.json({ message: '坐标无效。' }, { status: 400 });
  }
  try {
    const hint = await resolveMaterialRoadSideHint([x, z]);
    return NextResponse.json({ hint: hint ?? null });
  } catch {
    return NextResponse.json({ hint: null });
  }
}
