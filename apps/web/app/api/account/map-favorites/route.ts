import { NextRequest, NextResponse } from 'next/server';
import { mapFavoritesSchema } from '@yct/schemas';
import { readUserMapFavorites, updateUserMapFavorites } from '../../../../lib/map-favorite-workflow';
import { requireActiveLdpassUser } from '../../../../lib/user-auth';

export async function GET(request: NextRequest) {
  const user = await requireActiveLdpassUser(request);
  if (!user.ok) {
    return user.response;
  }

  const item = await readUserMapFavorites({
    userId: user.userId,
    ldpassUserId: user.ldpassUserId,
  });

  return NextResponse.json({ item });
}

export async function POST(request: NextRequest) {
  const user = await requireActiveLdpassUser(request);
  if (!user.ok) {
    return user.response;
  }

  const body = await request.json();
  const parsed = mapFavoritesSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'invalid_map_favorites',
        message: '地图收藏数据不符合要求。',
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  const item = await updateUserMapFavorites({
    userId: user.userId,
    ldpassUserId: user.ldpassUserId,
    markerIds: parsed.data.markerIds,
    source: 'sync',
  });

  return NextResponse.json({ item });
}
