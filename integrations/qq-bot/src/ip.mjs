import { isIP } from 'node:net';

/**
 * IP 属地查询：ipwho.is 优先（中文），失败时回退 ipapi.co（英文）。
 * 不接收域名，避免把解析、CDN 和 anycast 的差异混进结果。
 */

const cache = new Map();
const cacheTtlMs = 10 * 60 * 1000;

export async function lookupIp({
  ip = '',
  timeoutMs = 10_000,
  fetchImpl = fetch,
  now = Date.now,
} = {}) {
  const target = String(ip ?? '').trim();
  if (target && isIP(target) === 0) {
    throw new Error('请提供一个 IPv4 或 IPv6 地址，例如 /ip 8.8.8.8。');
  }

  const key = target || 'self';
  const cached = cache.get(key);
  const timestamp = now();
  if (cached && cached.expiresAt > timestamp) {
    return cached.text;
  }

  let primaryError;
  try {
    const data = await getJson(
      target
        ? `https://ipwho.is/${encodeURIComponent(target)}?lang=zh-CN`
        : 'https://ipwho.is/?lang=zh-CN',
      { timeoutMs, fetchImpl },
    );
    if (data?.success === false) {
      throw new Error(data?.message || 'ipwho.is 没有查到结果');
    }
    const text = formatFromIpwho(data);
    cache.set(key, { expiresAt: timestamp + cacheTtlMs, text });
    return text;
  } catch (error) {
    primaryError = error;
  }

  try {
    const fallbackUrl = target ? `https://ipapi.co/${target}/json/` : 'https://ipapi.co/json/';
    const data = await getJson(fallbackUrl, { timeoutMs, fetchImpl });
    if (data?.error) {
      throw new Error(data?.reason || 'ipapi.co 没有查到结果');
    }
    const text = formatFromIpapi(data);
    cache.set(key, { expiresAt: timestamp + cacheTtlMs, text });
    return text;
  } catch {
    throw new Error(`IP 属地查询失败：${primaryError?.message ?? '服务不可用'}`);
  }
}

function formatFromIpwho(data) {
  const ip = typeof data?.ip === 'string' ? data.ip : '';
  const place = [data?.country, data?.region, data?.city]
    .filter((value) => typeof value === 'string' && value.trim())
    .map((value) => value.trim())
    .filter((value, index, array) => array.indexOf(value) === index)
    .join(' ');
  const isp = typeof data?.connection?.isp === 'string' ? data.connection.isp.trim() : '';
  const asn = data?.connection?.asn ? `AS${data.connection.asn}` : '';
  return format(ip, place, isp, asn);
}

function formatFromIpapi(data) {
  const ip = typeof data?.ip === 'string' ? data.ip : '';
  const place = [data?.country_name, data?.region, data?.city]
    .filter((value) => typeof value === 'string' && value.trim())
    .map((value) => value.trim())
    .filter((value, index, array) => array.indexOf(value) === index)
    .join(' ');
  const isp = typeof data?.org === 'string' ? data.org.trim() : '';
  const asn = typeof data?.asn === 'string' ? data.asn.trim() : '';
  return format(ip, place, isp, asn);
}

function format(ip, place, isp, asn) {
  const head = ip ? `${ip}：` : '';
  const tail = [isp, asn].filter(Boolean).join(' ');
  const body = [place, tail].filter(Boolean).join(' · ');
  return body ? `${head}${body}` : `${head}没有查到属地信息。`;
}

async function getJson(url, { timeoutMs, fetchImpl }) {
  const response = await fetchImpl(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Mozilla/5.0 (compatible; yct-qq-bot/1.0)',
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  try {
    return await response.json();
  } catch {
    throw new Error('返回了无法解析的数据');
  }
}

export function clearIpCache() {
  cache.clear();
}
