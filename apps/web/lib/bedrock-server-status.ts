import {
  isValidBedrockAddress,
  resolveBedrockStatusProviderConfig,
  type BedrockProviderObservation,
  type BedrockStatusProvider,
  type BedrockStatusProviderConfig,
} from './bedrock-status-providers';
import { createTimedKeyedCache } from './server-cache';

export type BedrockProviderOutcome = 'online' | 'offline' | 'failed' | 'skipped';

export interface BedrockProviderResult {
  id: string;
  outcome: BedrockProviderOutcome;
}

export interface BedrockStatusObservation {
  availability: 'online' | 'offline' | 'unknown';
  validUntil: number;
  observedAt?: string;
  providerId?: string;
  /** 各来源本轮的结果，便于排查误报与降级原因。 */
  providerResults?: BedrockProviderResult[];
  degraded?: boolean;
  degradedReason?: 'conflict' | 'insufficient' | 'all-failed';
}

const invalidAddressWarning = new Set<string>();

// 来源并行探测后的聚合策略：
// - 任一来源明确在线 → 在线（同时有来源报离线时记 conflict 降级）；
// - 全部来源都明确离线 → 离线（可选经过确认窗口）；
// - 其余情况（冲突未出现在线、部分失败、全部失败、熔断跳过）→ unknown + degraded，
//   由调用方的“离线保持”策略沿用上一次已知状态，不据此误判在线/离线。
export function createBedrockStatusChecker(
  request: typeof fetch = (...args) => fetch(...args),
  now: () => number = () => Date.now(),
  configOverride?: BedrockStatusProviderConfig,
) {
  const cache = createTimedKeyedCache<BedrockStatusObservation>(30_000, 8);
  const pending = new Map<string, Promise<BedrockStatusObservation>>();
  // 熔断与离线确认状态按 checker 实例隔离，避免测试与多地址互相污染。
  const breaker = new Map<string, { failures: number; openUntil: number }>();
  const offlineFirstSeen = new Map<string, number>();
  const lastDegraded = new Map<string, string>();
  const circuitWarned = new Set<string>();

  return async (address: string, timeoutMs: number): Promise<BedrockStatusObservation> => {
    const timeout = Math.min(10_000, Math.max(100, timeoutMs));
    const config = configOverride ?? resolveBedrockStatusProviderConfig(process.env);
    const key = JSON.stringify([address, timeout, config.signature]);
    const load = async (): Promise<BedrockStatusObservation> => {
      const unknown = (
        extra: Partial<BedrockStatusObservation> = {},
      ): BedrockStatusObservation => ({
        availability: 'unknown',
        validUntil: now() + 8_000,
        ...extra,
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

      const results = await Promise.all(
        config.providers.map(async (provider) => {
          const breakerKey = `${provider.id}|${address}`;
          const state = breaker.get(breakerKey);
          if (state && state.openUntil > now()) {
            return { provider, observation: null, outcome: 'skipped' as const };
          }
          const observation = await probeProvider(config, provider, address, timeout, request, now);
          recordProviderOutcome(breakerKey, provider.id, Boolean(observation), config);
          return {
            provider,
            observation,
            outcome: observation ? observation.availability : ('failed' as const),
          };
        }),
      );

      const providerResults: BedrockProviderResult[] = results.map((item) => ({
        id: item.provider.id,
        outcome: item.outcome,
      }));
      const onlineResults = results.filter((item) => item.observation?.availability === 'online');
      const offlineResults = results.filter((item) => item.observation?.availability === 'offline');

      const conflict = onlineResults.length > 0 && offlineResults.length > 0;

      if (onlineResults.length > 0) {
        if (!conflict) {
          lastDegraded.delete(address);
          offlineFirstSeen.delete(address);
          return buildOnlineObservation(onlineResults, providerResults);
        }
        warnDegraded(address, 'conflict', providerResults);
        // 冲突时按事件时间新鲜度判定：有来源时间戳的一侧优先；双方都有则取更新的；
        // 双方都无时间戳（例如 mcsrvstat 的上游缓存结果）时保守保留在线，避免误报离线。
        // 多来源时取每侧最鲜的一条，避免固定取列表首项错过更新的证据。
        const newestOnline = [...onlineResults].sort(
          (left, right) => freshnessRank(left.observation) - freshnessRank(right.observation),
        )[0];
        const newestOffline = [...offlineResults].sort(
          (left, right) => freshnessRank(left.observation) - freshnessRank(right.observation),
        )[0];
        const newer = compareFreshness(
          newestOnline.observation as BedrockProviderObservation,
          newestOffline.observation as BedrockProviderObservation,
        );
        if (newer === 'online') {
          // 出现在线证据后重新计时，避免此前累计的离线窗口在下次冲突时直接生效。
          offlineFirstSeen.delete(address);
          return {
            ...buildOnlineObservation(onlineResults, providerResults),
            degraded: true,
            degradedReason: 'conflict',
          };
        }
        const pending = confirmOfflineOrPending(
          address,
          providerResults,
          'conflict',
          config.offlineConfirmMs,
        );
        if (pending) return pending;
        return {
          ...buildOfflineObservation(offlineResults, providerResults),
          degraded: true,
          degradedReason: 'conflict',
        };
      }

      const allExplicitOffline =
        results.length > 0 && results.every((item) => item.observation?.availability === 'offline');
      if (allExplicitOffline) {
        const pending = confirmOfflineOrPending(
          address,
          providerResults,
          'insufficient',
          config.offlineConfirmMs,
        );
        if (pending) return pending;
        return buildOfflineObservation(offlineResults, providerResults);
      }

      offlineFirstSeen.delete(address);
      const reason = results.every((item) => item.observation === null)
        ? ('all-failed' as const)
        : ('insufficient' as const);
      warnDegraded(address, reason, providerResults);
      return unknown({ providerResults, degraded: true, degradedReason: reason });
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

  function buildOnlineObservation(
    onlineResults: {
      provider: BedrockStatusProvider;
      observation: BedrockProviderObservation | null;
    }[],
    providerResults: BedrockProviderResult[],
  ): BedrockStatusObservation {
    const chosen = [...onlineResults].sort(
      (left, right) => freshnessRank(left.observation) - freshnessRank(right.observation),
    )[0];
    return {
      ...(chosen.observation as BedrockProviderObservation),
      validUntil: Math.min(
        ...onlineResults.map((item) => (item.observation as BedrockProviderObservation).validUntil),
      ),
      providerId: chosen.provider.id,
      providerResults,
    };
  }

  function freshnessRank(observation: BedrockProviderObservation | null): number {
    const timestamp = observation?.observedAt ? Date.parse(observation.observedAt) : NaN;
    return Number.isFinite(timestamp) ? -timestamp : Number.POSITIVE_INFINITY;
  }

  // 冲突判定：有来源自身时间戳的一侧优先；双方都有时间戳时取更新的；
  // 双方都没有时间戳时保守选择在线，避免仅凭缓存结果把服务器判为离线。
  function compareFreshness(
    online: BedrockProviderObservation,
    offline: BedrockProviderObservation,
  ): 'online' | 'offline' {
    if (online.timestamped && !offline.timestamped) return 'online';
    if (!online.timestamped && offline.timestamped) return 'offline';
    if (online.timestamped && offline.timestamped) {
      const onlineAt = online.observedAt ? Date.parse(online.observedAt) : NaN;
      const offlineAt = offline.observedAt ? Date.parse(offline.observedAt) : NaN;
      if (Number.isFinite(onlineAt) && Number.isFinite(offlineAt)) {
        return onlineAt >= offlineAt ? 'online' : 'offline';
      }
    }
    return 'online';
  }

  function confirmOfflineOrPending(
    address: string,
    providerResults: BedrockProviderResult[],
    degradedReason: NonNullable<BedrockStatusObservation['degradedReason']>,
    confirmMs: number,
  ): BedrockStatusObservation | null {
    if (confirmMs <= 0) {
      offlineFirstSeen.delete(address);
      return null;
    }
    const firstSeen = offlineFirstSeen.get(address);
    if (firstSeen === undefined) {
      offlineFirstSeen.set(address, now());
    }
    if (now() - (firstSeen ?? now()) < confirmMs) {
      return {
        availability: 'unknown',
        validUntil: now() + 8_000,
        providerResults,
        degraded: true,
        degradedReason,
      };
    }
    // 确认后保留起始时间：持续的离线观测应持续判定为离线，
    // 只有出现在线结果或不再有离线证据时才清除（见调用方）。
    return null;
  }

  function buildOfflineObservation(
    offlineResults: {
      provider: BedrockStatusProvider;
      observation: BedrockProviderObservation | null;
    }[],
    providerResults: BedrockProviderResult[],
  ): BedrockStatusObservation {
    const chosen = offlineResults[0];
    if (!chosen?.observation) {
      return {
        availability: 'unknown',
        validUntil: now() + 8_000,
        providerResults,
        degraded: true,
        degradedReason: 'insufficient',
      };
    }
    return {
      ...chosen.observation,
      validUntil: Math.min(...offlineResults.map((item) => item.observation!.validUntil)),
      providerId: chosen.provider.id,
      providerResults,
    };
  }

  function recordProviderOutcome(
    key: string,
    providerId: string,
    ok: boolean,
    config: BedrockStatusProviderConfig,
  ): void {
    if (ok) {
      breaker.delete(key);
      return;
    }
    const state = breaker.get(key) ?? { failures: 0, openUntil: 0 };
    state.failures += 1;
    if (state.failures >= config.failureThreshold && config.cooldownMs > 0) {
      state.openUntil = now() + config.cooldownMs;
      const warnKey = `${key}|${state.openUntil}`;
      if (!circuitWarned.has(warnKey)) {
        circuitWarned.add(warnKey);
        console.warn(
          `[bedrock-status] 熔断 ${JSON.stringify({
            provider: providerId,
            failures: state.failures,
            cooldownMs: config.cooldownMs,
          })}`,
        );
      }
    }
    breaker.set(key, state);
  }

  function warnDegraded(
    address: string,
    reason: NonNullable<BedrockStatusObservation['degradedReason']>,
    providerResults: BedrockProviderResult[],
  ): void {
    const signature = `${reason}|${providerResults.map((item) => `${item.id}:${item.outcome}`).join(',')}`;
    if (lastDegraded.get(address) === signature) return;
    lastDegraded.set(address, signature);
    console.warn(
      `[bedrock-status] degraded ${JSON.stringify({ address, reason, providers: providerResults })}`,
    );
  }
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
  // 来源级超时不能突破全局预算，避免 #10000 这类覆盖把 SSR 拖过 8s 超时。
  const budget = Math.min(
    10_000,
    Math.max(100, timeoutMs),
    Math.max(100, provider.timeoutMs ?? timeoutMs),
  );
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
