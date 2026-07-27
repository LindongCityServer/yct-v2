import { randomUUID } from 'node:crypto';
import { LdpassActionLinkProvider } from '@yct/adapters';
import { publishDomainEvent } from './app-event-bus';
import { readRuntimeConfig } from './runtime-config';

export type RideCodeLinkResult =
  | {
      ok: true;
      actionUrl: string;
      expiresAt: string;
    }
  | {
      ok: false;
      reason: 'not_configured' | 'upstream_unavailable';
      message: string;
    };

export async function createRideCodeRedemptionLink(input: {
  ldpassUserId: string;
}): Promise<RideCodeLinkResult> {
  const config = readRuntimeConfig();
  if (!config.ldpassBaseUrl || !config.ldpassYctProviderApiKey) {
    return {
      ok: false,
      reason: 'not_configured',
      message: '乘车码核销服务尚未配置。',
    };
  }

  const provider = new LdpassActionLinkProvider({
    baseUrl: config.ldpassBaseUrl,
    providerApiKey: config.ldpassYctProviderApiKey,
  });

  let response: Awaited<ReturnType<typeof provider.createActionLink>>;
  let actionUrl: string;
  try {
    response = await provider.createActionLink({
      kind: 'use',
      selectionScope: 'same_provider',
      clientId: config.ldpassClientId,
      requestedValue: config.ldpassRideCodeRequestedValue,
      verificationMethod: config.ldpassRideCodeVerificationMethod,
      expiresInSeconds: config.ldpassRideCodeExpiresInSeconds,
      note: '雨城通乘车码核销',
      idempotencyKey: `yct-ride-code-${randomUUID()}`,
    });
    actionUrl = resolveTrustedActionUrl(response.actionLink.actionPath, config.ldpassBaseUrl);
  } catch {
    return {
      ok: false,
      reason: 'upstream_unavailable',
      message: '暂时无法生成乘车码，请稍后重试。',
    };
  }

  try {
    await publishDomainEvent({
      eventId: `event_${randomUUID()}`,
      type: 'RideCodeRedemptionLinkCreated',
      actor: {
        type: 'user',
        id: input.ldpassUserId,
      },
      payload: {
        ldpassUserId: input.ldpassUserId,
        actionLinkId: response.actionLink.id,
        selectionScope: 'same_provider',
        requestedValue: config.ldpassRideCodeRequestedValue,
        verificationMethod: config.ldpassRideCodeVerificationMethod,
        expiresAt: response.actionLink.expiresAt,
      },
    });
  } catch {
    // 上游链接已经创建成功；事件投递失败不能诱导客户端重复创建有效链接。
  }

  return {
    ok: true,
    actionUrl,
    expiresAt: response.actionLink.expiresAt,
  };
}

function resolveTrustedActionUrl(actionPath: string, baseUrl: string): string {
  const base = new URL(baseUrl);
  const actionUrl = new URL(actionPath, base);
  if (actionUrl.origin !== base.origin || actionUrl.pathname !== '/action') {
    throw new Error('临东通返回了无效的核销链接。');
  }
  return actionUrl.toString();
}
