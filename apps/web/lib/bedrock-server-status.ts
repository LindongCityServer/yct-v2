import {
  isValidBedrockAddress,
  resolveBedrockStatusProviderConfig,
  type BedrockProviderObservation,
  type BedrockStatusProvider,
  type BedrockStatusProviderConfig,
} from './bedrock-status-providers';
import { createTimedKeyedCache } from './server-cache';

export interface BedrockStatusObservation {
  availability: 'online' | 'offline' | 'unknown';
  validUntil: number;
  observedAt?: string;
  providerId?: string;
}

const invalidAddressWarning = new Set<string>();

// 来源按配置顺序尝试：单个来源超时、限流、非法响应或网络错误时跳下一个；
// 全部来源都无法给出明确结果时返回 unknown，由调用方按“离线保持”策略处理。
export function createBedrockStatusChecker(
  request: typeof fetch = (...args) => fetch(...args),
  now: () => number = () => Date.now(),
  configOverride?: BedrockStatusProviderConfig,
) {
  const cache = createTimedKeyedCache<BedrockStatusObservation>(30_000, 8);
  const pending = new Map<string, Promise<BedrockStatusObservation>>();
  return async (address: string, timeoutMs: number): Promise<BedrockStatusObservation> => {
    const timeout = Math.min(10_000, Math.max(100, timeoutMs));
    const config = configOverride ?? resolveBedrockStatusProviderConfig(process.env);
    const key = JSON.stringify([address, timeout, config.signature]);
    const load = async (): Promise<BedrockStatusObservation> => {
      const unknown = (): BedrockStatusObservation => ({
        availability: 'unknown',
        validUntil: now() + 8_000,
      });
      // 只向配置的来源提交已校验的 host:port，不上传玩家信息。
      if (!isValidBedrockAddress(address)) {
        if (!invalidAddressWarning.has(address)) {
          invalidAddressWarning.add(address);
          console.warn(
            `[bedrock-status] YCT_BEDROCK_SERVER_ADDRESS 不是合法的 host:port：${address}`,
          );
        }
        return unknown();
      }

      for (const provider of config.providers) {
        const observation = await probeProvider(config, provider, address, timeout, request, now);
        if (!observation) continue;
        return { ...observation, providerId: provider.id };
      }
      return unknown();
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

async function probeProvider(
  config: BedrockStatusProviderConfig,
  provider: BedrockStatusProvider,
  address: string,
  timeoutMs: number,
  request: typeof fetch,
  now: () => number,
): Promise<BedrockProviderObservation | null> {
  // 每个来源的超时取自配置；重试共享同一预算，不会把总耗时翻倍。
  const budget = Math.min(10_000, Math.max(100, provider.timeoutMs ?? timeoutMs));
  const deadline = now() + budget;
  for (let attempt = 0; attempt <= config.retries; attempt += 1) {
    const remaining = deadline - now();
    if (remaining < 100) return null;
    const result = await attemptProvider(provider, address, remaining, request, now);
    if (result) return result;
    if (attempt >= config.retries) return null;
    const wait = Math.min(config.backoffMs * 2 ** attempt, deadline - now() - 100);
    if (wait > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, wait));
    }
  }
  return null;
}

async function attemptProvider(
  provider: BedrockStatusProvider,
  address: string,
  timeoutMs: number,
  request: typeof fetch,
  now: () => number,
): Promise<BedrockProviderObservation | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const requestedAt = now();
    const response = await request(provider.buildUrl(address, timeoutMs), {
      signal: controller.signal,
      cache: 'no-store',
      headers: { accept: 'application/json' },
    });
    if (!response.ok) return null;
    const body: unknown = await response.json().catch(() => null);
    return provider.parse(body, { now: now(), requestedAt });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export const readBedrockServerStatus = createBedrockStatusChecker();
