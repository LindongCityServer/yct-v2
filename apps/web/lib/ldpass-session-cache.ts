import { createHash } from 'node:crypto';
import { LdpassIdentityProvider } from '@yct/adapters';
import type { LdpassClientSessionResponse } from '@yct/contracts';
import type { RuntimeConfig } from './runtime-config';
import { createTimedKeyedCache } from './server-cache';

const ldpassSessionCache = createTimedKeyedCache<LdpassClientSessionResponse>(10_000, 128);

export async function readCachedLdpassClientSession(input: {
  config: RuntimeConfig;
  cookieHeader?: string;
}): Promise<LdpassClientSessionResponse> {
  const { config } = input;
  if (!config.ldpassBaseUrl || !config.ldpassClientId) {
    throw new Error('LDPASS_BASE_URL 或 LDPASS_CLIENT_ID 尚未配置。');
  }
  const baseUrl = config.ldpassBaseUrl;
  const clientId = config.ldpassClientId;
  const provider = new LdpassIdentityProvider({
    baseUrl,
    clientId,
  });
  const cacheKey = createHash('sha256')
    .update(`${baseUrl}\u0000${clientId}\u0000${input.cookieHeader ?? ''}`)
    .digest('hex');

  return ldpassSessionCache.read(cacheKey, () =>
    provider.readClientSession({
      clientId,
      cookieHeader: input.cookieHeader,
    }),
  );
}
