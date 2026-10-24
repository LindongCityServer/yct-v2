import { isIP } from 'node:net';

interface CachedIpLocation {
  location: string;
  expiresAt: number;
}

const ipLocationCache = new Map<string, CachedIpLocation>();
const ipLocationCacheTtlMs = 6 * 60 * 60 * 1000;
const maximumIpLocationCacheEntries = 500;

/**
 * 解析 IP 属地。预览出图很频繁，这里带 6 小时内存缓存，
 * 并允许调用方用更短的超时避免拖慢自动预览。
 */
export async function resolveClientIpLocation(ip: string, timeoutMs = 1500): Promise<string> {
  const normalized = ip.trim();
  if (!normalized || normalized === '未知 IP') return '未知属地';
  if (isPrivateOrLoopback(normalized)) return '本机';

  const cached = ipLocationCache.get(normalized);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.location;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`https://ipapi.co/${encodeURIComponent(normalized)}/json/`, {
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) return '未知属地';
    const payload = (await response.json()) as {
      city?: string;
      region?: string;
      country_name?: string;
    };
    const location =
      [payload.city, payload.region, payload.country_name]
        .map((value) => value?.trim())
        .filter(Boolean)
        .join(' · ') || '未知属地';
    if (ipLocationCache.size >= maximumIpLocationCacheEntries) {
      ipLocationCache.clear();
    }
    ipLocationCache.set(normalized, {
      location,
      expiresAt: Date.now() + ipLocationCacheTtlMs,
    });
    return location;
  } catch {
    return '未知属地';
  } finally {
    clearTimeout(timeoutId);
  }
}

function isPrivateOrLoopback(ip: string): boolean {
  if (ip === '127.0.0.1' || ip === '::1') return true;
  if (isIP(ip) === 4) {
    const octets = ip.split('.').map(Number);
    const [first, second] = octets;
    return (
      first === 10 ||
      first === 127 ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      (first === 169 && second === 254)
    );
  }
  return /^(fc|fd|fe8|fe9|fea|feb)/i.test(ip);
}
