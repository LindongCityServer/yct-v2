interface RateLimitBucket {
  count: number;
  resetAt: number;
}

const windowMs = 60_000;
const maximumRequests = 60;
const maximumBuckets = 2000;
const buckets = new Map<string, RateLimitBucket>();

/** 进程内限流：匿名只读接口，按来源 IP 每分钟 60 次。 */
export function consumeMcpRateLimit(key: string): {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
} {
  const now = Date.now();
  if (buckets.size > maximumBuckets) {
    for (const [bucketKey, bucket] of buckets) {
      if (bucket.resetAt <= now) {
        buckets.delete(bucketKey);
      }
    }
  }

  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maximumRequests - 1, retryAfterSeconds: 0 };
  }

  if (current.count >= maximumRequests) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  }

  current.count += 1;
  return { allowed: true, remaining: maximumRequests - current.count, retryAfterSeconds: 0 };
}

/** 校验脚本和单测可以直接重置窗口。 */
export function resetMcpRateLimit(): void {
  buckets.clear();
}
