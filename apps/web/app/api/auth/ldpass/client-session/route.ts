import { NextRequest, NextResponse } from 'next/server';
import { LdpassIdentityProvider } from '@yct/adapters';
import { readRuntimeConfig } from '../../../../../lib/runtime-config';

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

  const provider = new LdpassIdentityProvider({
    baseUrl: config.ldpassBaseUrl,
    clientId: config.ldpassClientId,
  });

  try {
    const session = await provider.readClientSession({
      clientId: config.ldpassClientId,
      cookieHeader: request.headers.get('cookie') ?? undefined,
    });

    return NextResponse.json(session);
  } catch {
    return NextResponse.json(
      {
        error: 'ldpass_session_unavailable',
        message: '无法读取 ldpass 会话。',
      },
      { status: 502 },
    );
  }
}
