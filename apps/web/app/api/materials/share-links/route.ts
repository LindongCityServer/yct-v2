import { NextRequest, NextResponse } from 'next/server';
import { materialShareLinkCreateRequestSchema } from '@yct/schemas';
import {
  findMaterialTemplateRecord,
  findMaterialTemplateVersion,
} from '../../../../lib/material-template-store';
import {
  describeMaterialCanvasLockError,
  describeMaterialCanvasSizeError,
} from '../../../../lib/material-canvas-policy';
import { findMaterialDraft } from '../../../../lib/material-draft-store';
import { consumeMaterialExportRateLimit } from '../../../../lib/material-export-rate-limit';
import { resolveMaterialServerInputValues } from '../../../../lib/material-workflow';
import { validateMaterialInput } from '../../../../lib/material-svg';
import {
  createMaterialShareLink,
  createMaterialShareLinkFingerprint,
  decideMaterialShareImageWatermark,
  isMaterialSourceKindValue,
  parseMaterialShareLinkServerSource,
  resolveMaterialShareLinkDataSource,
  resolveMaterialSourceKindFromRef,
} from '../../../../lib/material-share-link-workflow';
import { appPath } from '../../../../lib/app-paths';
import { resolvePublicSiteOrigin } from '../../../../lib/request-site-url';
import { readRuntimeConfig } from '../../../../lib/runtime-config';
import { requireActiveLdpassUser } from '../../../../lib/user-auth';
import { formatValidationErrorMessage } from '../../../../lib/validation-error-message';

export const runtime = 'nodejs';

/** 工作台发起分享：登录用户把当前编辑值存成短链，水印由服务端判定。 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'invalid_material_share_link', message: '分享请求体不是合法的 JSON。' },
      { status: 400 },
    );
  }
  const parsed = materialShareLinkCreateRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'invalid_material_share_link',
        message: formatValidationErrorMessage('物料分享参数不符合要求', parsed.error),
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }
  const user = await requireActiveLdpassUser(request);
  if (!user.ok) {
    return user.response;
  }
  const limit = consumeMaterialExportRateLimit(`material-share-link:${user.ldpassUserId}`);
  if (!limit.allowed) {
    return NextResponse.json(
      {
        error: 'material_share_link_rate_limited',
        message: `分享过于频繁，请 ${limit.retryAfterSeconds} 秒后再试。`,
      },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }

  const input = parsed.data;
  const templateRecord = await findMaterialTemplateRecord(input.templateId);
  if (!templateRecord) {
    return NextResponse.json(
      { error: 'material_template_not_found', message: '要分享的物料模板不存在。' },
      { status: 404 },
    );
  }
  const template = findMaterialTemplateVersion(templateRecord, input.templateVersion);
  if (!template) {
    return NextResponse.json(
      { error: 'material_template_version_not_found', message: '要分享的模板版本不存在。' },
      { status: 404 },
    );
  }
  if (template.status !== 'published') {
    return NextResponse.json(
      { error: 'material_template_not_published', message: '只能分享已发布的物料模板。' },
      { status: 403 },
    );
  }

  const dataSource = resolveMaterialShareLinkDataSource({
    dataSource: input.dataSource,
    sourceKind: input.sourceKind,
    sourceRef: input.sourceRef,
  });
  const sourceKind =
    (input.sourceKind && isMaterialSourceKindValue(input.sourceKind)
      ? input.sourceKind
      : undefined) ??
    resolveMaterialSourceKindFromRef(input.sourceRef) ??
    input.source?.kind;
  // 数据来源模式下用户填不了的派生字段允许为空；手动自定义内容保持严格校验。
  const allowMissingServerDerivedValues =
    input.sourceKind === 'manual'
      ? false
      : Boolean(input.sourceKind || input.dataSource || input.source || input.sourceRef);

  let values: Record<string, string>;
  try {
    values = validateMaterialInput(template.fields, input.values, {
      allowMissingServerDerivedValues,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'invalid_material_share_link',
        message: error instanceof Error ? error.message : '物料字段不符合模板要求。',
      },
      { status: 400 },
    );
  }
  const canvasError =
    describeMaterialCanvasLockError({
      templateId: input.templateId,
      defaultCanvas: template.defaultCanvas,
      canvas: input.canvas,
      layout: values.layout,
    }) ?? describeMaterialCanvasSizeError(input.canvas);
  if (canvasError) {
    return NextResponse.json(
      { error: 'invalid_material_share_link', message: canvasError },
      { status: 400 },
    );
  }

  // 分享图水印：服务端按能复核的事实判定，不接受前端传的「未修改」标记。
  let serverResolvedValues: Record<string, string> | undefined;
  if (dataSource === 'server' && sourceKind !== 'manual') {
    const source =
      input.source ??
      parseMaterialShareLinkServerSource({ sourceKind, sourceRef: input.sourceRef });
    if (source) {
      const resolved = await resolveMaterialServerInputValues({
        templateId: input.templateId,
        templateVersion: input.templateVersion,
        source,
        networkGeometry: input.networkGeometry,
      });
      if (resolved.ok) {
        try {
          serverResolvedValues = validateMaterialInput(template.fields, resolved.values, {
            allowMissingServerDerivedValues: true,
          });
        } catch {
          serverResolvedValues = undefined;
        }
      }
    }
  }
  const draft = input.draftId ? await findMaterialDraft(input.draftId) : undefined;
  const shareImageWatermark = decideMaterialShareImageWatermark({
    templateFields: template.fields,
    templateId: input.templateId,
    templateVersion: input.templateVersion,
    values,
    dataSource,
    sourceKind,
    serverResolvedValues,
    draft,
  });

  const fingerprint = createMaterialShareLinkFingerprint({
    templateId: input.templateId,
    templateVersion: input.templateVersion,
    canvas: input.canvas,
    values,
  });
  const result = await createMaterialShareLink({
    kind: template.family,
    // 工作台分享不复用随机编号：SH- 前缀 + 内容指纹，便于后台辨认。
    code: `SH-${fingerprint.slice(0, 4).toUpperCase()}`,
    seed: fingerprint.slice(0, 8),
    templateId: input.templateId,
    templateVersion: input.templateVersion,
    templateTitle: template.title,
    values,
    canvas: input.canvas,
    sourceKind,
    sourceRef: input.sourceRef,
    dataSource,
    origin: 'workbench',
    createdBy: user.ldpassUserId,
    shareImageWatermark,
    networkName: input.networkName,
    licenseName: input.licenseName,
    licenseUrl: input.licenseUrl,
  });
  const shareUrl = new URL(
    appPath(`/m/${encodeURIComponent(result.link.slug)}/${result.link.id}`),
    resolvePublicSiteOrigin(request, readRuntimeConfig().siteUrl),
  ).toString();
  return NextResponse.json(
    {
      shareId: result.link.id,
      shareUrl,
      shareImageWatermark: result.link.shareImageWatermark,
    },
    { status: result.created ? 201 : 200 },
  );
}
