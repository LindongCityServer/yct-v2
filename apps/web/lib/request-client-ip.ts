import { isIP } from 'node:net';

export function resolveClientIp(headers: Headers): string {
  const candidates = [
    headers.get('x-real-ip'),
    ...splitHeaderValues(headers.get('x-forwarded-for')),
    ...readForwardedForValues(headers.get('forwarded')),
  ];

  for (const candidate of candidates) {
    const normalized = normalizeIp(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return '未知 IP';
}

function splitHeaderValues(value: string | null): string[] {
  return value?.split(',').map((item) => item.trim()) ?? [];
}

function readForwardedForValues(value: string | null): string[] {
  return splitHeaderValues(value).flatMap((segment) =>
    segment
      .split(';')
      .map((part) => part.trim())
      .filter((part) => part.toLowerCase().startsWith('for='))
      .map((part) => part.slice(part.indexOf('=') + 1)),
  );
}

function normalizeIp(value: string | null): string | undefined {
  let candidate = value?.trim().replace(/^"|"$/g, '');
  if (!candidate || candidate.toLowerCase() === 'unknown' || candidate.startsWith('_')) {
    return undefined;
  }

  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(candidate);
  if (bracketed?.[1]) {
    candidate = bracketed[1];
  }

  const mappedIpv4 = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(candidate);
  if (mappedIpv4?.[1] && isIP(mappedIpv4[1]) === 4) {
    return mappedIpv4[1];
  }

  if (isIP(candidate)) {
    return candidate;
  }

  const ipv4WithPort = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/.exec(candidate);
  return ipv4WithPort?.[1] && isIP(ipv4WithPort[1]) === 4 ? ipv4WithPort[1] : undefined;
}
