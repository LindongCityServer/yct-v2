import webPush from 'web-push';
import type { PushDelivery, PushDeviceSubscription } from '@yct/contracts';
import { readRuntimeConfig } from './runtime-config';

export interface WebPushSendResult {
  ok: boolean;
  errorCode?: string;
  errorMessage?: string;
}

export async function sendWebPushDelivery(input: {
  delivery: PushDelivery;
  subscription: PushDeviceSubscription;
}): Promise<WebPushSendResult> {
  const config = readRuntimeConfig();
  if (!config.webPushSubject || !config.webPushPublicKey || !config.webPushPrivateKey) {
    return {
      ok: false,
      errorCode: 'web_push_not_configured',
      errorMessage:
        '缺少 YCT_WEB_PUSH_SUBJECT、YCT_WEB_PUSH_PUBLIC_KEY/NEXT_PUBLIC_YCT_WEB_PUSH_PUBLIC_KEY 或 YCT_WEB_PUSH_PRIVATE_KEY。',
    };
  }

  webPush.setVapidDetails(config.webPushSubject, config.webPushPublicKey, config.webPushPrivateKey);

  try {
    await webPush.sendNotification(
      {
        endpoint: input.subscription.endpoint,
        keys: input.subscription.keys,
      },
      JSON.stringify(input.delivery.payload),
      {
        TTL: 60 * 60,
      },
    );
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      errorCode: readWebPushErrorCode(error),
      errorMessage: error instanceof Error ? error.message : 'Web Push 发送失败。',
    };
  }
}

function readWebPushErrorCode(error: unknown): string {
  if (typeof error === 'object' && error && 'statusCode' in error) {
    const statusCode = Number((error as { statusCode?: unknown }).statusCode);
    if (statusCode === 404 || statusCode === 410) {
      return 'subscription_gone';
    }
    if (Number.isFinite(statusCode)) {
      return `web_push_http_${statusCode}`;
    }
  }

  return 'web_push_send_failed';
}
