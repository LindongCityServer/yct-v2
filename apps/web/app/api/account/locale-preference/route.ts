import { NextRequest, NextResponse } from 'next/server';
import { localePreferenceSchema } from '@yct/schemas';
import {
  readUserLocalePreference,
  updateUserLocalePreference,
} from '../../../../lib/locale-preference-workflow';
import { markResponseNoStore } from '../../../../lib/http-cache';
import { requireActiveLdpassUser } from '../../../../lib/user-auth';

export async function GET(request: NextRequest) {
  const user = await requireActiveLdpassUser(request);
  if (!user.ok) {
    return user.response;
  }

  const item = await readUserLocalePreference({
    userId: user.userId,
    ldpassUserId: user.ldpassUserId,
    acceptLanguage: request.headers.get('accept-language'),
  });

  return markResponseNoStore(NextResponse.json({ item }));
}

export async function POST(request: NextRequest) {
  const user = await requireActiveLdpassUser(request);
  if (!user.ok) {
    return user.response;
  }

  const body = await request.json();
  const parsed = localePreferenceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'invalid_locale_preference',
        message: '语言偏好不符合要求。',
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  const item = await updateUserLocalePreference({
    userId: user.userId,
    ldpassUserId: user.ldpassUserId,
    locale: parsed.data.locale,
    acceptLanguage: request.headers.get('accept-language'),
  });

  return markResponseNoStore(NextResponse.json({ item }));
}
