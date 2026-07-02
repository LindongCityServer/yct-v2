import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { LdpassIdentityProvider } from '@yct/adapters';
import { readRuntimeConfig } from '../../../../../lib/runtime-config';

const loginUrlQuerySchema = z.object({
  redirect_uri: z.string().url(),
  state: z.string().min(8).max(256),
});

export async function GET(request: NextRequest) {
  const config = readRuntimeConfig();
  if (!config.ldpassBaseUrl || !config.ldpassClientId) {
    return NextResponse.json(
      {
        error: 'ldpass_not_configured',
        message: 'LDPASS_BASE_URL 或 LDPASS_CLIENT_ID 尚未配置。',
      },
      { status: 503 },
    );
  }

  const parsed = loginUrlQuerySchema.safeParse({
    redirect_uri: request.nextUrl.searchParams.get('redirect_uri'),
    state: request.nextUrl.searchParams.get('state'),
  });

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'invalid_query',
        message: 'redirect_uri 和 state 参数不符合要求。',
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  const provider = new LdpassIdentityProvider({
    baseUrl: config.ldpassBaseUrl,
    clientId: config.ldpassClientId,
  });

  const loginUrl = await provider.buildLoginUrl({
    redirectUri: parsed.data.redirect_uri,
    state: parsed.data.state,
  });

  return NextResponse.json({ loginUrl });
}
