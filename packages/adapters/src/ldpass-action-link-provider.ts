import type {
  LdpassCreateActionLinkInput,
  LdpassCreateActionLinkResponse,
  LdpassRideAuthorizationResponse,
} from '@yct/contracts';

export interface LdpassActionLinkProviderConfig {
  baseUrl: string;
  providerApiKey: string;
  fetchTimeoutMs?: number;
}

const createActionLinkRoute = '/api/open/provider/action-links';
const rideAuthorizationRoutePrefix = '/api/open/provider/ride-authorizations';

export class LdpassActionLinkProvider {
  constructor(private readonly config: LdpassActionLinkProviderConfig) {}

  async createActionLink(
    input: LdpassCreateActionLinkInput,
  ): Promise<LdpassCreateActionLinkResponse> {
    const body = JSON.stringify({
      kind: input.kind,
      targetPassId: input.targetPassId,
      selectionScope: input.selectionScope,
      clientId: input.clientId,
      requestedValue: input.requestedValue,
      verificationMethod: input.verificationMethod,
      expiresInSeconds: input.expiresInSeconds,
      authorizationExpiresInSeconds: input.authorizationExpiresInSeconds,
      externalReferenceId: input.externalReferenceId,
      note: input.note,
    });
    return this.postSigned<LdpassCreateActionLinkResponse>(
      createActionLinkRoute,
      body,
      input.idempotencyKey,
    );
  }

  async readRideAuthorization(authorizationId: string): Promise<LdpassRideAuthorizationResponse> {
    const route = `${rideAuthorizationRoutePrefix}/${encodeURIComponent(authorizationId)}`;
    const url = new URL(route, this.config.baseUrl);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.fetchTimeoutMs ?? 8_000);

    try {
      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${this.config.providerApiKey}`,
        },
      });
      if (!response.ok) {
        throw new Error(await readLdpassError(response));
      }
      return (await response.json()) as LdpassRideAuthorizationResponse;
    } finally {
      clearTimeout(timeout);
    }
  }

  async enterRideAuthorization(input: {
    authorizationId: string;
    deviceEventId: string;
    idempotencyKey: string;
  }): Promise<LdpassRideAuthorizationResponse> {
    const route = `${rideAuthorizationRoutePrefix}/${encodeURIComponent(input.authorizationId)}/enter`;
    return this.postSigned<LdpassRideAuthorizationResponse>(
      route,
      JSON.stringify({ deviceEventId: input.deviceEventId }),
      input.idempotencyKey,
    );
  }

  async captureRideAuthorization(input: {
    authorizationId: string;
    fareValue: string;
    idempotencyKey: string;
  }): Promise<LdpassRideAuthorizationResponse> {
    const route = `${rideAuthorizationRoutePrefix}/${encodeURIComponent(input.authorizationId)}/capture`;
    return this.postSigned<LdpassRideAuthorizationResponse>(
      route,
      JSON.stringify({ fareValue: input.fareValue }),
      input.idempotencyKey,
    );
  }

  async releaseRideAuthorization(input: {
    authorizationId: string;
    reason: string;
    idempotencyKey: string;
  }): Promise<LdpassRideAuthorizationResponse> {
    const route = `${rideAuthorizationRoutePrefix}/${encodeURIComponent(input.authorizationId)}/release`;
    return this.postSigned<LdpassRideAuthorizationResponse>(
      route,
      JSON.stringify({ reason: input.reason }),
      input.idempotencyKey,
    );
  }

  private async postSigned<TResponse>(
    route: string,
    body: string,
    idempotencyKey: string,
  ): Promise<TResponse> {
    const url = new URL(route, this.config.baseUrl);
    const timestamp = new Date().toISOString();
    const signature = await createOpenApiSignature({
      method: 'POST',
      route,
      timestamp,
      idempotencyKey,
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
          'x-ldpass-idempotency-key': idempotencyKey,
          'x-ldpass-signature': `v1=${signature}`,
          'x-ldpass-timestamp': timestamp,
        },
        body,
      });

      if (!response.ok) {
        throw new Error(await readLdpassError(response));
      }

      return (await response.json()) as TResponse;
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
