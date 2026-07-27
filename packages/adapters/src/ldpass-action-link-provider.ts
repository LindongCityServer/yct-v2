import type { LdpassCreateActionLinkInput, LdpassCreateActionLinkResponse } from '@yct/contracts';

export interface LdpassActionLinkProviderConfig {
  baseUrl: string;
  providerApiKey: string;
  fetchTimeoutMs?: number;
}

const createActionLinkRoute = '/api/open/provider/action-links';

export class LdpassActionLinkProvider {
  constructor(private readonly config: LdpassActionLinkProviderConfig) {}

  async createActionLink(
    input: LdpassCreateActionLinkInput,
  ): Promise<LdpassCreateActionLinkResponse> {
    const url = new URL(createActionLinkRoute, this.config.baseUrl);
    const body = JSON.stringify({
      kind: input.kind,
      targetPassId: input.targetPassId,
      selectionScope: input.selectionScope,
      clientId: input.clientId,
      requestedValue: input.requestedValue,
      verificationMethod: input.verificationMethod,
      expiresInSeconds: input.expiresInSeconds,
      note: input.note,
    });
    const timestamp = new Date().toISOString();
    const signature = await createOpenApiSignature({
      method: 'POST',
      route: createActionLinkRoute,
      timestamp,
      idempotencyKey: input.idempotencyKey,
      body,
      secret: this.config.providerApiKey,
    });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.fetchTimeoutMs ?? 8_000);

    try {
      const response = await fetch(url, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${this.config.providerApiKey}`,
          'content-type': 'application/json; charset=utf-8',
          'x-ldpass-idempotency-key': input.idempotencyKey,
          'x-ldpass-signature': `v1=${signature}`,
          'x-ldpass-timestamp': timestamp,
        },
        body,
      });

      if (!response.ok) {
        throw new Error(await readLdpassError(response));
      }

      return (await response.json()) as LdpassCreateActionLinkResponse;
    } finally {
      clearTimeout(timeout);
    }
  }
}

async function createOpenApiSignature(input: {
  method: string;
  route: string;
  timestamp: string;
  idempotencyKey: string;
  body: string;
  secret: string;
}): Promise<string> {
  const encoder = new TextEncoder();
  const bodyHash = toHex(await crypto.subtle.digest('SHA-256', encoder.encode(input.body)));
  const canonicalPayload = [
    'LDPass-OpenAPI-V1',
    input.method,
    input.route,
    input.timestamp,
    input.idempotencyKey,
    bodyHash,
  ].join('\n');
  const signingKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(input.secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', signingKey, encoder.encode(canonicalPayload));
  return toBase64Url(signature);
}

function toHex(value: ArrayBuffer): string {
  return Array.from(new Uint8Array(value), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function toBase64Url(value: ArrayBuffer): string {
  const binary = String.fromCharCode(...new Uint8Array(value));
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}

async function readLdpassError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { message?: unknown };
    if (typeof payload.message === 'string' && payload.message.trim()) {
      return `ldpass action-link failed: ${response.status} ${payload.message.trim()}`;
    }
  } catch {
    // 非 JSON 错误响应只保留状态码，避免把上游页面内容带入日志。
  }

  return `ldpass action-link failed: ${response.status}`;
}
