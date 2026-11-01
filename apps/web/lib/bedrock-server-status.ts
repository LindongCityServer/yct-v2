import { createTimedKeyedCache } from './server-cache';

export interface BedrockStatusObservation {
  availability: 'online' | 'offline' | 'unknown';
  validUntil: number;
}

// mcstatus.io caches its own observations. Never extend those beyond expires_at,
// and do not interpret detector errors/rate limits as an offline game server.
export function createBedrockStatusChecker(
  request: typeof fetch = (...args) => fetch(...args),
  now: () => number = () => Date.now(),
) {
  const cache = createTimedKeyedCache<BedrockStatusObservation>(30_000, 8);
  const pending = new Map<string, Promise<BedrockStatusObservation>>();
  return async (address: string, timeoutMs: number): Promise<BedrockStatusObservation> => {
    const timeout = Math.min(10_000, Math.max(100, timeoutMs));
    const key = JSON.stringify([address, timeout]);
    const load = async (): Promise<BedrockStatusObservation> => {
      const unknown = (): BedrockStatusObservation => ({
        availability: 'unknown',
        validUntil: now() + 8_000,
      });
      // Only configured host:port values are sent to the fixed HTTPS provider.
      if (!/^(?:[a-zA-Z0-9.-]+|\[[a-fA-F0-9:]+\]):\d{1,5}$/.test(address)) return unknown();
      const port = Number(address.slice(address.lastIndexOf(':') + 1));
      if (port < 1 || port > 65535) return unknown();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      try {
        const url = new URL(
          `https://api.mcstatus.io/v2/status/bedrock/${encodeURIComponent(address)}`,
        );
        url.searchParams.set('timeout', '2.0');
        const response = await request(url, {
          signal: controller.signal,
          cache: 'no-store',
          headers: { accept: 'application/json' },
        });
        if (!response.ok) return unknown();
        const body: unknown = await response.json();
        if (!body || typeof body !== 'object') return unknown();
        const { online, retrieved_at, expires_at } = body as Record<string, unknown>;
        const time = now();
        if (
          typeof online !== 'boolean' ||
          typeof retrieved_at !== 'number' ||
          typeof expires_at !== 'number' ||
          !Number.isFinite(retrieved_at) ||
          !Number.isFinite(expires_at) ||
          retrieved_at > time + 5_000 ||
          retrieved_at < time - 120_000 ||
          expires_at <= time ||
          expires_at <= retrieved_at
        )
          return unknown();
        return {
          availability: online ? 'online' : 'offline',
          validUntil: Math.min(expires_at, retrieved_at + 120_000, time + 30_000),
        };
      } catch {
        return unknown();
      } finally {
        clearTimeout(timer);
      }
    };
    const existing = pending.get(key);
    if (existing) return existing;
    // Coalesce the entire expiry check as well as fetch. Otherwise concurrent
    // readers of a provider-expired entry could each clear the new in-flight call.
    const refresh = (async () => {
      const result = await cache.read(key, load);
      if (result.validUntil > now()) return result;
      cache.clear(key);
      return cache.read(key, load);
    })();
    pending.set(key, refresh);
    try {
      return await refresh;
    } finally {
      pending.delete(key);
    }
  };
}

export const readBedrockServerStatus = createBedrockStatusChecker();
