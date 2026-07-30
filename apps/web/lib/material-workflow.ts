import { createHash, randomUUID } from 'node:crypto';
import type {
  MaterialCanvasConfig,
  MaterialDraft,
  MaterialExportAuditRecord,
  MaterialSourceKind,
  MaterialTemplateRecord,
  MaterialTemplateVersion,
  YctEventPayloadMap,
  YctEventType,
} from '@yct/contracts';
import type {
  MaterialDraftInput,
  MaterialExportRequestInput,
  MaterialPreviewRequestInput,
  MaterialServerSourceInput,
  MaterialTemplateDraftInput,
} from '@yct/schemas';
import { publishDomainEvent } from './app-event-bus';
import { findMaterialDraft, listMaterialDrafts, writeMaterialDraft } from './material-draft-store';
import {
  appendMaterialExportAuditRecord,
  listMaterialExportAuditRecords,
} from './material-export-audit-store';
import {
  hashMaterialInput,
  MaterialInputError,
  MaterialTemplateSourceError,
  renderMaterialTemplateToPng,
  validateMaterialInput,
  validateMaterialTemplateSource,
} from './material-renderer';
import {
  createMaterialTemplateRecord,
  findMaterialTemplateRecord,
  findMaterialTemplateVersion,
  findPublishedMaterialTemplateVersion,
  listMaterialTemplateRecords,
  writeMaterialTemplateRecord,
} from './material-template-store';
import {
  resolveMaterialLocationInput,
  resolveRoadCoordinateMaterialInput,
} from './material-location-source';
import {
  resolveTransitLineMaterialInput,
  resolveTransitStationMaterialInput,
} from './material-transit-source';

export type MaterialWorkflowResult = MaterialWorkflowSuccess | MaterialWorkflowFailure;

interface MaterialWorkflowSuccess {
  ok: true;
}

interface MaterialWorkflowFailure {
  ok: false;
  status?: number;
  error?: string;
  message?: string;
}

export type MaterialExportResult = MaterialWorkflowResult & {
  png?: Buffer;
  fileName?: string;
  audit?: MaterialExportAuditRecord;
};

export type MaterialPreviewResult = MaterialWorkflowResult & {
  png?: Buffer;
  widthPx?: number;
  heightPx?: number;
  previewId?: string;
};

type PublishedMaterialTemplateSummary = Omit<MaterialTemplateVersion, 'source'>;

export async function listPublishedMaterialTemplates(): Promise<
  Array<{ id: string; template: PublishedMaterialTemplateSummary }>
> {
  const records = await listMaterialTemplateRecords();
  return records
    .map((record) => ({ id: record.id, template: findPublishedMaterialTemplateVersion(record) }))
    .filter(
      (item): item is { id: string; template: MaterialTemplateVersion } =>
        item.template !== undefined,
    )
    .map(({ id, template }) => {
      const { source: _source, ...summary } = template;
      return { id, template: summary };
    })
    .sort((left, right) => left.template.title.localeCompare(right.template.title, 'zh-CN'));
}

export async function listAdminMaterialState(): Promise<{
  templates: MaterialTemplateRecord[];
  drafts: MaterialDraft[];
  exports: MaterialExportAuditRecord[];
}> {
  const [templates, drafts, exports] = await Promise.all([
    listMaterialTemplateRecords(),
    listMaterialDrafts(),
    listMaterialExportAuditRecords(),
  ]);
  return { templates, drafts, exports };
}

export async function listMaterialDraftsForUser(actorId: string): Promise<MaterialDraft[]> {
  return (await listMaterialDrafts()).filter((draft) => draft.createdBy === actorId);
}

export async function createMaterialTemplateDraft(input: {
  template: MaterialTemplateDraftInput;
  actorId: string;
}): Promise<MaterialWorkflowResult & { record?: MaterialTemplateRecord }> {
  const validation = validateTemplatePayload(input.template);
  if (!validation.ok) {
    return validation;
  }
  const record = createMaterialTemplateRecord({ ...input.template, actorId: input.actorId });
  await writeMaterialTemplateRecord(record);
  return { ok: true, record };
}

export async function createMaterialTemplateRevision(input: {
  templateId: string;
  baseVersion: number;
  template: MaterialTemplateDraftInput;
  actorId: string;
}): Promise<MaterialWorkflowResult & { record?: MaterialTemplateRecord }> {
  const record = await findMaterialTemplateRecord(input.templateId);
  if (!record || !findMaterialTemplateVersion(record, input.baseVersion)) {
    return notFound('模板或基准版本不存在。');
  }
  const validation = validateTemplatePayload(input.template);
  if (!validation.ok) {
    return validation;
  }
  const now = new Date().toISOString();
  const nextVersion = Math.max(...record.versions.map((item) => item.version)) + 1;
  const nextRecord: MaterialTemplateRecord = {
    ...record,
    versions: [
      ...record.versions,
      {
        version: nextVersion,
        status: 'draft',
        title: input.template.title,
        description: input.template.description,
        family: input.template.family,
        source: input.template.source,
        fields: input.template.fields,
        typographyProfile: input.template.typographyProfile,
        defaultCanvas: input.template.defaultCanvas,
        createdBy: input.actorId,
        createdAt: now,
      },
    ],
  };
  await writeMaterialTemplateRecord(nextRecord);
  return { ok: true, record: nextRecord };
}

export async function publishMaterialTemplateVersion(input: {
  templateId: string;
  version: number;
  actorId: string;
}): Promise<MaterialWorkflowResult & { record?: MaterialTemplateRecord }> {
  const record = await findMaterialTemplateRecord(input.templateId);
  const version = record && findMaterialTemplateVersion(record, input.version);
  if (!record || !version) {
    return notFound('模板版本不存在。');
  }
  if (version.status !== 'draft') {
    return invalidState('只有草稿模板可以发布。');
  }
  const now = new Date().toISOString();
  const nextRecord: MaterialTemplateRecord = {
    ...record,
    versions: record.versions.map((item) => {
      if (item.version === input.version) {
        return { ...item, status: 'published', publishedBy: input.actorId, publishedAt: now };
      }
      return item.status === 'published' ? { ...item, status: 'archived', archivedAt: now } : item;
    }),
  };
  await writeMaterialTemplateRecord(nextRecord);
  await emitEvent('MaterialTemplatePublished', 'admin', input.actorId, {
    templateId: input.templateId,
    version: input.version,
    family: version.family,
    publishedBy: input.actorId,
    publishedAt: now,
  });
  return { ok: true, record: nextRecord };
}

export async function createManualMaterialDraft(input: {
  draft: MaterialDraftInput;
  actorId: string;
}): Promise<MaterialWorkflowResult & { draft?: MaterialDraft }> {
  const template = await resolveTemplateVersion({
    templateId: input.draft.templateId,
    version: input.draft.templateVersion,
    publishedOnly: true,
  });
  if (!template.ok) {
    return template;
  }
  let values: Record<string, string>;
  try {
    values = validateMaterialInput(template.template.fields, input.draft.input);
  } catch (error) {
    return invalidInput(error);
  }
  const now = new Date().toISOString();
  const draft: MaterialDraft = {
    id: `material_draft_${randomUUID()}`,
    templateId: input.draft.templateId,
    templateVersion: input.draft.templateVersion,
    input: values,
    canvas: input.draft.canvas,
    status: 'draft',
    createdBy: input.actorId,
    createdAt: now,
    updatedAt: now,
  };
  await writeMaterialDraft(draft);
  return { ok: true, draft };
}

export async function submitManualMaterialDraft(input: {
  draftId: string;
  actorId: string;
}): Promise<MaterialWorkflowResult & { draft?: MaterialDraft }> {
  const draft = await findMaterialDraft(input.draftId);
  if (!draft) {
    return notFound('物料草稿不存在。');
  }
  if (draft.createdBy !== input.actorId) {
    return forbidden('不能提交其他用户的物料草稿。');
  }
  if (draft.status !== 'draft' && draft.status !== 'rejected') {
    return invalidState('当前物料草稿不能提交审核。');
  }
  const submittedAt = new Date().toISOString();
  const nextDraft: MaterialDraft = {
    ...draft,
    status: 'pending_review',
    submittedAt,
    reviewedBy: undefined,
    reviewedAt: undefined,
    reviewReason: undefined,
    updatedAt: submittedAt,
  };
  await writeMaterialDraft(nextDraft);
  await emitEvent('MaterialDraftSubmitted', 'user', input.actorId, {
    draftId: nextDraft.id,
    templateId: nextDraft.templateId,
    templateVersion: nextDraft.templateVersion,
    submittedBy: input.actorId,
    submittedAt,
  });
  return { ok: true, draft: nextDraft };
}

export async function reviewManualMaterialDraft(input: {
  draftId: string;
  actorId: string;
  decision: 'approved' | 'rejected';
  reason?: string;
}): Promise<MaterialWorkflowResult & { draft?: MaterialDraft }> {
  const draft = await findMaterialDraft(input.draftId);
  if (!draft) {
    return notFound('物料草稿不存在。');
  }
  if (draft.status !== 'pending_review') {
    return invalidState('只有待审核物料草稿可以审核。');
  }
  const reviewedAt = new Date().toISOString();
  const nextDraft: MaterialDraft = {
    ...draft,
    status: input.decision,
    reviewedBy: input.actorId,
    reviewedAt,
    reviewReason: input.reason?.trim() || undefined,
    updatedAt: reviewedAt,
  };
  await writeMaterialDraft(nextDraft);
  await emitEvent('MaterialDraftReviewed', 'admin', input.actorId, {
    draftId: nextDraft.id,
    decision: input.decision,
    reviewerId: input.actorId,
    reviewedAt,
    reason: nextDraft.reviewReason,
  });
  return { ok: true, draft: nextDraft };
}

export async function prepareMaterialExport(input: {
  request: MaterialExportRequestInput;
  actorId: string;
}): Promise<MaterialExportResult> {
  const source = await resolveMaterialExportSource(input.request, input.actorId);
  if (!source.ok) {
    return source;
  }
  try {
    const rendered = await renderMaterialTemplateToPng({
      template: source.template,
      values: source.values,
      canvas: source.canvas,
    });
    const now = new Date().toISOString();
    const audit: MaterialExportAuditRecord = {
      id: `material_export_${randomUUID()}`,
      actorId: input.actorId,
      templateId: source.templateId,
      templateVersion: source.template.version,
      sourceKind: source.sourceKind,
      sourceRef: source.sourceRef,
      draftId: source.draftId,
      inputHash: hashMaterialInput(source.values),
      canvas: source.canvas,
      outputWidthPx: rendered.widthPx,
      outputHeightPx: rendered.heightPx,
      outputSha256: createHash('sha256').update(rendered.png).digest('hex'),
      requestedAt: now,
    };
    await appendMaterialExportAuditRecord(audit);
    await emitEvent('MaterialExportRequested', 'user', input.actorId, {
      exportId: audit.id,
      actorId: input.actorId,
      templateId: audit.templateId,
      templateVersion: audit.templateVersion,
      sourceKind: audit.sourceKind,
      sourceRef: audit.sourceRef,
      draftId: audit.draftId,
      canvas: audit.canvas,
      outputWidthPx: audit.outputWidthPx,
      outputHeightPx: audit.outputHeightPx,
    });
    return {
      ok: true,
      png: rendered.png,
      fileName: buildMaterialExportFileName(source.template, source.values, audit.id),
      audit,
    };
  } catch (error) {
    return invalidInput(error);
  }
}

export async function prepareMaterialPreview(input: {
  request: MaterialPreviewRequestInput;
  actor?: {
    id: string;
    label: string;
  };
  anonymousLabel: string;
}): Promise<MaterialPreviewResult> {
  const source = await resolveMaterialPreviewSource(input.request);
  if (!source.ok) {
    return source;
  }
  try {
    const previewId = `material_preview_${randomUUID()}`;
    const generatedAt = new Date().toISOString();
    const actorLabel = input.actor?.label.trim() || input.anonymousLabel;
    const watermarkActorLabel = Array.from(actorLabel).slice(0, 10).join('');
    const traceId = previewId.slice('material_preview_'.length, 'material_preview_'.length + 12);
    const rendered = await renderMaterialTemplateToPng({
      template: source.template,
      values: source.values,
      canvas: source.canvas,
      watermark: {
        traceLines: [
          `${watermarkActorLabel} | ${traceId}`,
          generatedAt.replaceAll('-', '').replaceAll(':', '').replace('T', ' ').slice(0, 15) + 'Z',
        ],
      },
    });
    await emitEvent(
      'MaterialPreviewGenerated',
      input.actor ? 'user' : 'anonymous',
      input.actor?.id,
      {
        previewId,
        actorId: input.actor?.id,
        actorLabel,
        templateId: source.templateId,
        templateVersion: source.template.version,
        sourceKind: source.sourceKind,
        sourceRef: source.sourceRef,
        inputHash: hashMaterialInput(source.values),
        canvas: source.canvas,
        outputWidthPx: rendered.widthPx,
        outputHeightPx: rendered.heightPx,
        generatedAt,
      },
    );
    return {
      ok: true,
      png: rendered.png,
      widthPx: rendered.widthPx,
      heightPx: rendered.heightPx,
      previewId,
    };
  } catch (error) {
    return invalidInput(error);
  }
}

async function resolveMaterialExportSource(
  request: MaterialExportRequestInput,
  actorId: string,
): Promise<
  | {
      ok: true;
      templateId: string;
      template: MaterialTemplateVersion;
      values: Record<string, string>;
      canvas: MaterialCanvasConfig;
      sourceKind:
        'manual' | 'transit_line' | 'transit_station' | 'map_location' | 'road_coordinate';
      sourceRef?: string;
      draftId?: string;
    }
  | MaterialWorkflowFailure
> {
  if (request.mode === 'custom') {
    const draft = request.draftId ? await findMaterialDraft(request.draftId) : undefined;
    if (!draft) {
      return notFound('物料草稿不存在。');
    }
    if (draft.createdBy !== actorId) {
      return forbidden('不能导出其他用户的物料草稿。');
    }
    if (draft.status !== 'approved') {
      return forbidden('自定义物料必须在管理员审核通过后下载。');
    }
    const template = await resolveTemplateVersion({
      templateId: draft.templateId,
      version: draft.templateVersion,
      publishedOnly: false,
    });
    if (!template.ok) {
      return template;
    }
    return {
      ok: true,
      templateId: draft.templateId,
      template: template.template,
      values: draft.input,
      canvas: draft.canvas,
      sourceKind: 'manual',
      draftId: draft.id,
    };
  }

  if (!request.templateId || !request.templateVersion || !request.source || !request.canvas) {
    return invalidInputMessage('服务器物料导出参数不完整。');
  }
  const template = await resolveTemplateVersion({
    templateId: request.templateId,
    version: request.templateVersion,
    publishedOnly: true,
  });
  if (!template.ok) {
    return template;
  }
  try {
    const resolved = await resolveServerMaterialInput({
      source: request.source,
      fields: template.template.fields,
    });
    return {
      ok: true,
      templateId: request.templateId,
      template: template.template,
      values: validateMaterialInput(template.template.fields, resolved.values),
      canvas: request.canvas,
      sourceKind: resolved.sourceKind,
      sourceRef: resolved.sourceRef,
    };
  } catch (error) {
    return invalidInput(error);
  }
}

async function resolveMaterialPreviewSource(request: MaterialPreviewRequestInput): Promise<
  | {
      ok: true;
      templateId: string;
      template: MaterialTemplateVersion;
      values: Record<string, string>;
      canvas: MaterialCanvasConfig;
      sourceKind: MaterialSourceKind;
      sourceRef?: string;
    }
  | MaterialWorkflowFailure
> {
  const template = await resolveTemplateVersion({
    templateId: request.templateId,
    version: request.templateVersion,
    publishedOnly: true,
  });
  if (!template.ok) {
    return template;
  }
  try {
    if (request.mode === 'manual') {
      return {
        ok: true,
        templateId: request.templateId,
        template: template.template,
        values: validateMaterialInput(template.template.fields, request.input ?? {}),
        canvas: request.canvas,
        sourceKind: 'manual',
      };
    }
    if (!request.source) {
      return invalidInputMessage('服务器预览参数不完整。');
    }
    const resolved = await resolveServerMaterialInput({
      source: request.source,
      fields: template.template.fields,
    });
    return {
      ok: true,
      templateId: request.templateId,
      template: template.template,
      values: validateMaterialInput(template.template.fields, resolved.values),
      canvas: request.canvas,
      sourceKind: resolved.sourceKind,
      sourceRef: resolved.sourceRef,
    };
  } catch (error) {
    return invalidInput(error);
  }
}

async function resolveServerMaterialInput(input: {
  source: MaterialServerSourceInput;
  fields: MaterialTemplateVersion['fields'];
}): Promise<{
  sourceKind: 'transit_line' | 'transit_station' | 'map_location' | 'road_coordinate';
  values: Record<string, string>;
  sourceRef: string;
}> {
  if (input.source.kind === 'transit_line') {
    const resolved = await resolveTransitLineMaterialInput({
      lineId: input.source.lineId,
      stationSourceId: input.source.stationSourceId,
      fields: input.fields,
    });
    return { ...resolved, sourceKind: 'transit_line' };
  }
  if (input.source.kind === 'transit_station') {
    const resolved = await resolveTransitStationMaterialInput({
      stationMarkerId: input.source.stationMarkerId,
      direction: input.source.direction,
      lineIds: input.source.lineIds,
      terminalRole: input.source.terminalRole,
      fields: input.fields,
    });
    return { ...resolved, sourceKind: 'transit_station' };
  }
  if (input.source.kind === 'road_coordinate') {
    const resolved = await resolveRoadCoordinateMaterialInput({
      coordinate: [input.source.x, input.source.z],
      fields: input.fields,
    });
    return { ...resolved, sourceKind: 'road_coordinate' };
  }
  const resolved = await resolveMaterialLocationInput({
    locationId: input.source.locationId,
    fields: input.fields,
  });
  return { ...resolved, sourceKind: 'map_location' };
}

async function resolveTemplateVersion(input: {
  templateId: string;
  version: number;
  publishedOnly: boolean;
}): Promise<{ ok: true; template: MaterialTemplateVersion } | MaterialWorkflowFailure> {
  const record = await findMaterialTemplateRecord(input.templateId);
  const template = record && findMaterialTemplateVersion(record, input.version);
  if (!template) {
    return notFound('模板版本不存在。');
  }
  if (input.publishedOnly && template.status !== 'published') {
    return forbidden('只能使用已发布模板。');
  }
  return { ok: true, template };
}

function validateTemplatePayload(input: MaterialTemplateDraftInput): MaterialWorkflowResult {
  const keys = input.fields.map((field) => field.key);
  if (new Set(keys).size !== keys.length) {
    return invalidInputMessage('模板字段键不能重复。');
  }
  try {
    validateMaterialTemplateSource(input.source, input.fields);
  } catch (error) {
    return invalidInput(error);
  }
  return { ok: true };
}

function notFound(message: string): MaterialWorkflowFailure {
  return { ok: false, status: 404, error: 'material_not_found', message };
}

function forbidden(message: string): MaterialWorkflowFailure {
  return { ok: false, status: 403, error: 'material_forbidden', message };
}

function invalidState(message: string): MaterialWorkflowFailure {
  return { ok: false, status: 409, error: 'invalid_material_state', message };
}

function invalidInput(error: unknown): MaterialWorkflowFailure {
  const message =
    error instanceof MaterialInputError ||
    error instanceof MaterialTemplateSourceError ||
    error instanceof Error
      ? error.message
      : '物料参数不符合要求。';
  return { ok: false, status: 400, error: 'invalid_material_input', message };
}

function invalidInputMessage(message: string): MaterialWorkflowFailure {
  return { ok: false, status: 400, error: 'invalid_material_input', message };
}

function safeFileName(value: string): string {
  return sanitizeFileNamePart(value, 80) || 'material';
}

function sanitizeFileNamePart(value: string, maximumLength: number): string {
  return Array.from(
    value
      .replace(/[\u0000-\u001f\\/:*?"<>|]/g, '_')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[. ]+$/g, ''),
  )
    .slice(0, maximumLength)
    .join('');
}

function buildMaterialExportFileName(
  template: MaterialTemplateVersion,
  values: Record<string, string>,
  exportId: string,
): string {
  const ignoredFieldKeys = new Set([
    'currentStationIndex',
    'routeStations',
    'roadNamePinyin',
    'postalCode',
    'signColor',
    'directionMode',
    'arrowMode',
  ]);
  const contentParts: string[] = [];
  for (const field of template.fields) {
    if (
      ignoredFieldKeys.has(field.key) ||
      (field.kind === 'select' && field.key !== 'terminalRole')
    ) {
      continue;
    }
    const value = sanitizeFileNamePart(values[field.key] ?? '', 20);
    if (!value || contentParts.includes(value)) {
      continue;
    }
    contentParts.push(value);
    if (contentParts.length >= 3) {
      break;
    }
  }
  return (
    [
      sanitizeFileNamePart(template.title, 40) || 'material',
      ...contentParts,
      exportId.slice(-8),
    ].join('_') + '.png'
  );
}

async function emitEvent<TType extends YctEventType>(
  type: TType,
  actorType: 'anonymous' | 'user' | 'admin',
  actorId: string | undefined,
  payload: YctEventPayloadMap[TType],
): Promise<void> {
  await publishDomainEvent({
    eventId: `event_${randomUUID()}`,
    type,
    occurredAt: new Date().toISOString(),
    actor: actorId ? { type: actorType, id: actorId } : { type: actorType },
    payload,
  });
}
