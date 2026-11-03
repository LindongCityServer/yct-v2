// MCBE 状态来源注册表：按配置顺序尝试，返回第一个明确结果。
// 默认仅 mcstatus.io，与引入多来源前的行为完全一致。

export interface BedrockProviderPayloadContext {
  now: number;
  requestedAt: number;
}

export interface BedrockProviderObservation {
  availability: 'online' | 'offline';
  observedAt?: string;
  validUntil: number;
}

export interface BedrockStatusProvider {
  id: string;
  label: string;
  timeoutMs?: number;
  buildUrl(address: string, timeoutMs: number): URL;
  parse(body: unknown, context: BedrockProviderPayloadContext): BedrockProviderObservation | null;
}

export interface BedrockStatusProviderConfig {
  providers: BedrockStatusProvider[];
  retries: number;
  backoffMs: number;
  signature: string;
}

const ADDRESS_PATTERN = /^(?:[a-zA-Z0-9.-]+|\[[a-fA-F0-9:]+\]):\d{1,5}$/;

export function isValidBedrockAddress(address: string): boolean {
  if (!ADDRESS_PATTERN.test(address)) return false;
  const port = Number(address.slice(address.lastIndexOf(':') + 1));
  return port >= 1 && port <= 65535;
}

// mcstatus.io 的时效字段是判断“明确离线”的前提；缺时间戳或时间戳异常一律视为未知。
function parseMcstatusPayload(
  body: unknown,
  { now }: BedrockProviderPayloadContext,
  requireTimestamps: boolean,
): BedrockProviderObservation | null {
  if (!body || typeof body !== 'object') return null;
  const { online, retrieved_at, expires_at } = body as Record<string, unknown>;
  if (typeof online !== 'boolean') return null;
  if (typeof retrieved_at !== 'number' || typeof expires_at !== 'number') {
    if (requireTimestamps) return null;
    return {
      availability: online ? 'online' : 'offline',
      observedAt: new Date(now).toISOString(),
      validUntil: now + 15_000,
    };
  }
  if (
    !Number.isFinite(retrieved_at) ||
    !Number.isFinite(expires_at) ||
    retrieved_at > now + 5_000 ||
    retrieved_at < now - 120_000 ||
    expires_at <= now ||
    expires_at <= retrieved_at
  )
    return null;
  return {
    availability: online ? 'online' : 'offline',
    observedAt: new Date(retrieved_at).toISOString(),
    validUntil: Math.min(expires_at, retrieved_at + 120_000, now + 30_000),
  };
}

function createMcstatusProvider(timeoutMs?: number): BedrockStatusProvider {
  return {
    id: 'mcstatus',
    label: 'mcstatus.io Bedrock v2',
    timeoutMs,
    buildUrl(address, timeout) {
      const url = new URL(
        `https://api.mcstatus.io/v2/status/bedrock/${encodeURIComponent(address)}`,
      );
      url.searchParams.set('timeout', String(Math.min(2, Math.max(0.1, (timeout - 500) / 1000))));
      return url;
    },
    parse: (body, context) => parseMcstatusPayload(body, context, true),
  };
}

// mcsrvstat 不返回 retrieved_at/expires_at：以本次请求时间为观测时间，有效期按 15 秒保守取值。
function createMcsrvstatProvider(timeoutMs?: number): BedrockStatusProvider {
  return {
    id: 'mcsrvstat',
    label: 'mcsrvstat.us Bedrock v3',
    timeoutMs,
    buildUrl: (address) =>
      new URL(`https://api.mcsrvstat.us/bedrock/2/${encodeURIComponent(address)}`),
    parse(body, context) {
      if (!body || typeof body !== 'object') return null;
      const { online } = body as Record<string, unknown>;
      if (typeof online !== 'boolean') return null;
      return {
        availability: online ? 'online' : 'offline',
        observedAt: new Date(context.requestedAt).toISOString(),
        validUntil: context.now + 15_000,
      };
    },
  };
}

function createCustomProvider(
  id: string,
  template: string,
  timeoutMs?: number,
): BedrockStatusProvider | undefined {
  let parsed: URL;
  try {
    parsed = new URL(template.replaceAll('{address}', 'example.com:19132'));
  } catch {
    return undefined;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return undefined;
  return {
    id,
    label: `自定义来源 ${id}`,
    timeoutMs,
    buildUrl(address, timeout) {
      return new URL(
        template
          .replaceAll('{address}', encodeURIComponent(address))
          .replaceAll('{timeout}', String(Math.max(1, Math.floor(timeout / 1000)))),
      );
    },
    // 自定义来源按 mcstatus 兼容格式解析；无时间戳时以本次请求时间为准。
    parse: (body, context) => parseMcstatusPayload(body, context, false),
  };
}

function parseIntegerInRange(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

const warnedConfigs = new Set<string>();

function warnOnce(key: string, message: string): void {
  if (warnedConfigs.has(key)) return;
  warnedConfigs.add(key);
  console.warn(`[bedrock-status] ${message}`);
}

function parseProviderEntry(
  entry: string,
  warn: (message: string) => void,
): BedrockStatusProvider | undefined {
  const hashIndex = entry.lastIndexOf('#');
  let body = entry;
  let timeoutMs: number | undefined;
  if (hashIndex > 0 && /^\d+$/.test(entry.slice(hashIndex + 1))) {
    timeoutMs = parseIntegerInRange(entry.slice(hashIndex + 1), 0, 100, 10_000) || undefined;
    body = entry.slice(0, hashIndex);
  }

  const atIndex = body.indexOf('@');
  if (atIndex === -1) {
    if (body === 'mcstatus') return createMcstatusProvider(timeoutMs);
    if (body === 'mcsrvstat') return createMcsrvstatProvider(timeoutMs);
    warn(`未知的 MCBE 状态来源“${body}”，已忽略。`);
    return undefined;
  }

  const id = body.slice(0, atIndex).trim();
  const template = body.slice(atIndex + 1).trim();
  if (!/^[a-z0-9][a-z0-9_-]{0,31}$/i.test(id) || !template.includes('{address}')) {
    warn(`自定义来源“${entry}”格式无效（需要 id@含 {address} 的 URL），已忽略。`);
    return undefined;
  }
  const provider = createCustomProvider(id, template, timeoutMs);
  if (!provider) {
    warn(`自定义来源“${id}”的地址不是合法 HTTP(S) URL，已忽略。`);
  }
  return provider;
}

export function resolveBedrockStatusProviderConfig(
  env: Record<string, string | undefined> = process.env,
): BedrockStatusProviderConfig {
  const raw = env.YCT_BEDROCK_PROVIDERS?.trim();
  const warnings: string[] = [];
  const providers = raw
    ? raw
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((entry) => parseProviderEntry(entry, (message) => warnings.push(message)))
        .filter((provider): provider is BedrockStatusProvider => Boolean(provider))
    : [];

  for (const message of warnings) {
    warnOnce(`${raw}|${message}`, message);
  }

  // 未配置或配置项全部非法时回到内置默认来源，避免把线上检测直接置为未知。
  const resolved = providers.length > 0 ? providers : [createMcstatusProvider()];
  if (raw && providers.length === 0) {
    warnOnce(`${raw}|fallback`, `YCT_BEDROCK_PROVIDERS 无可用来源，已回退到默认 mcstatus.io。`);
  }

  const retries = parseIntegerInRange(env.YCT_BEDROCK_PROVIDER_RETRIES, 0, 0, 5);
  const backoffMs = parseIntegerInRange(env.YCT_BEDROCK_PROVIDER_BACKOFF_MS, 250, 0, 5_000);
  const signature = JSON.stringify([
    raw ?? '',
    resolved.map((provider) => [provider.id, provider.timeoutMs ?? null]),
    retries,
    backoffMs,
  ]);

  return { providers: resolved, retries, backoffMs, signature };
}
