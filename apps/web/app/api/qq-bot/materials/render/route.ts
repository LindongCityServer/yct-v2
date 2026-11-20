import { NextRequest, NextResponse } from 'next/server';
import { appPath } from '../../../../../lib/app-paths';
import { createMaterialShareLink } from '../../../../../lib/material-share-link-workflow';
import { resolvePublicSiteOrigin } from '../../../../../lib/request-site-url';
import { readRuntimeConfig } from '../../../../../lib/runtime-config';
import {
  QQ_BOT_MATERIAL_SIGNATURE_HEADER,
  QqBotMaterialError,
  consumeQqBotMaterialRateLimit,
  readQqBotMaterialSecret,
  renderQqBotMaterial,
  tryAcquireQqBotMaterialRenderSlot,
  verifyQqBotMaterialSignature,
  type QqBotMaterialRenderRequest,
} from '../../../../../lib/qq-bot-material';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * QQ 机器人内部物料渲染接口：`POST /api/qq-bot/materials/render`。
 *
 * 鉴权（机器人 → 网页端）：
 * - 请求头 `x-yct-bot-signature: <unix秒>.<hex签名>`；
 * - 签名 = HMAC-SHA256(secret, `<unix秒>.<sha256(原始请求体) hex>`)；
 * - secret 读 `YCT_QQ_MATERIAL_SECRET`（兼容 `QQ_BOT_MATERIAL_SECRET`），时间窗 ±60 秒。
 *
 * 限流：进程内全局 60 次/分钟、渲染并发 2。
 * 响应按方案 4.3：出图后立即写入分享记录，返回 shareId / shareUrl 供机器人卡片生成二维码。
 */
const maximumRequestBodyBytes = 8 * 1024;

interface QqBotMaterialErrorBody {
  ok: false;
  error: string;
  message: string;
  retryAfterSeconds?: number;
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const secret = readQqBotMaterialSecret();
  if (!secret) {
    console.error('[qq-bot-material] 未配置 YCT_QQ_MATERIAL_SECRET，拒绝物料渲染请求。');
    return jsonError(403, 'invalid_signature', '物料渲染接口未配置签名密钥。');
  }

  const declaredLength = Number(request.headers.get('content-length') ?? '');
  if (Number.isFinite(declaredLength) && declaredLength > maximumRequestBodyBytes) {
    return jsonError(400, 'invalid_request', '请求体过大。');
  }

  let bodyText: string;
  try {
    bodyText = await request.text();
  } catch {
    return jsonError(400, 'invalid_request', '请求体读取失败。');
  }
  if (bodyText.length > maximumRequestBodyBytes) {
    return jsonError(400, 'invalid_request', '请求体过大。');
  }

  const verification = verifyQqBotMaterialSignature({
    secret,
    signature: request.headers.get(QQ_BOT_MATERIAL_SIGNATURE_HEADER),
    body: bodyText,
  });
  if (!verification.ok) {
    console.warn(`[qq-bot-material] 签名校验失败：${verification.reason}。`);
    return jsonError(
      403,
      'invalid_signature',
      verification.reason === 'expired'
        ? '签名已过期，请检查机器人与本机的时钟偏差。'
        : '签名校验失败。',
    );
  }

  const rateLimit = consumeQqBotMaterialRateLimit();
  if (!rateLimit.allowed) {
    return jsonError(429, 'rate_limited', '物料渲染请求过于频繁，请稍后重试。', {
      retryAfterSeconds: rateLimit.retryAfterSeconds,
    });
  }
  const release = tryAcquireQqBotMaterialRenderSlot();
  if (!release) {
    return jsonError(429, 'rate_limited', '物料渲染并发已满，请稍后重试。', {
      retryAfterSeconds: 1,
    });
  }

  try {
    let payload: unknown;
    try {
      payload = JSON.parse(bodyText);
    } catch {
      return jsonError(400, 'invalid_request', '请求体必须是合法的 JSON。');
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return jsonError(400, 'invalid_request', '请求体必须是 JSON 对象。');
    }
    try {
      const result = await renderQqBotMaterial(payload as QqBotMaterialRenderRequest);
      const share = await createMaterialShareLink({
        kind: result.kind,
        code: result.code,
        seed: result.seed,
        templateId: result.templateId,
        templateVersion: result.templateVersion,
        templateTitle: result.templateTitle,
        values: result.input,
        canvas: result.canvas,
        dataSource: result.source.kind,
        origin: 'bot',
        shareImageWatermark: false,
        networkName: result.source.name,
        licenseName: result.source.licenseName,
        licenseUrl: result.source.licenseUrl,
      });
      const shareUrl = new URL(
        appPath(`/m/${encodeURIComponent(result.slug)}/${share.link.id}`),
        resolvePublicSiteOrigin(request, readRuntimeConfig().siteUrl),
      ).toString();
      const elapsedMs = Date.now() - startedAt;
      logRenderResult({
        ok: true,
        elapsedMs,
        payload,
        seed: result.seed,
        templateId: result.templateId,
        kind: result.kind,
        dataSource: result.source.kind,
        errorCode: undefined,
      });
      return NextResponse.json(
        {
          ok: true,
          seed: result.seed,
          code: result.code,
          shareId: share.link.id,
          shareUrl,
          source: result.source,
          pngBase64: result.png.toString('base64'),
          widthPx: result.widthPx,
          heightPx: result.heightPx,
          card: result.card,
          template: {
            id: result.templateId,
            version: result.templateVersion,
            title: result.templateTitle,
            slug: result.slug,
          },
          // 分享记录需要「模板 + 字段值 + 画布」还原工作台；落库后仍随响应返回，方便排查。
          canvas: result.canvas,
          input: result.input,
        },
        {
          headers: {
            'Cache-Control': 'no-store, max-age=0',
            'X-Content-Type-Options': 'nosniff',
            'X-Robots-Tag': 'noindex',
          },
        },
      );
    } catch (error) {
      const elapsedMs = Date.now() - startedAt;
      const materialError =
        error instanceof QqBotMaterialError
          ? error
          : new QqBotMaterialError('render_failed', '物料渲染失败，请稍后重试。');
      if (!(error instanceof QqBotMaterialError)) {
        console.error('[qq-bot-material] 渲染异常：', error);
      }
      logRenderResult({
        ok: false,
        elapsedMs,
        payload,
        seed: undefined,
        templateId: undefined,
        kind: undefined,
        dataSource: undefined,
        errorCode: materialError.code,
      });
      return jsonError(materialError.status, materialError.code, materialError.message);
    }
  } finally {
    release();
  }
}

function logRenderResult(input: {
  ok: boolean;
  elapsedMs: number;
  payload: unknown;
  seed: string | undefined;
  templateId: string | undefined;
  kind: string | undefined;
  dataSource: string | undefined;
  errorCode: string | undefined;
}): void {
  // 方案 4.10：只记结构化字段，不记录 QQ openid / session 原文。
  const record = isPlainObject(input.payload) ? input.payload : {};
  const log = {
    event: 'material.bot_render',
    ok: input.ok,
    kind: typeof record.kind === 'string' ? record.kind : input.kind,
    templateId: typeof record.templateId === 'string' ? record.templateId : input.templateId,
    dataSource: typeof record.dataSource === 'string' ? record.dataSource : input.dataSource,
    seed: input.seed,
    ms: input.elapsedMs,
    errorCode: input.errorCode,
  };
  if (input.ok) {
    console.log('[qq-bot-material]', JSON.stringify(log));
  } else {
    console.warn('[qq-bot-material]', JSON.stringify(log));
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function jsonError(
  status: number,
  error: string,
  message: string,
  extra: { retryAfterSeconds?: number } = {},
): NextResponse<QqBotMaterialErrorBody> {
  const headers: Record<string, string> = {
    'Cache-Control': 'no-store, max-age=0',
    'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex',
  };
  if (extra.retryAfterSeconds) {
    headers['Retry-After'] = String(extra.retryAfterSeconds);
  }
  return NextResponse.json<QqBotMaterialErrorBody>(
    {
      ok: false,
      error,
      message,
      ...(extra.retryAfterSeconds ? { retryAfterSeconds: extra.retryAfterSeconds } : {}),
    },
    { status, headers },
  );
}
