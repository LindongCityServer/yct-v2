'use client';

import { useEffect, useMemo, useState } from 'react';
import { appPath } from '../lib/app-paths';
import { publishAdminDataChanged } from '../lib/client-admin-data-events';
import { AdminRefreshButton } from './admin-refresh-button';

type MaterialFamily = 'road_sign' | 'address_sign' | 'bus_stop' | 'custom';
type TemplateStatus = 'draft' | 'published' | 'archived';

interface MaterialCanvas {
  widthM: number;
  heightM: number;
  pxPerMeter: number;
  alignToTile: boolean;
  tileSizePx: number;
}

interface TemplateVersion {
  version: number;
  status: TemplateStatus;
  title: string;
  description?: string;
  family: MaterialFamily;
  source: string;
  fields: MaterialTemplateField[];
  typographyProfile?: unknown;
  defaultCanvas: MaterialCanvas;
  createdAt: string;
  publishedAt?: string;
}

interface MaterialTemplateField {
  key: string;
  label: string;
  options?: Array<{ value: string; label: string }>;
}

interface TemplateRecord {
  id: string;
  versions: TemplateVersion[];
}

interface MaterialDraft {
  id: string;
  templateId: string;
  templateVersion: number;
  status: 'draft' | 'pending_review' | 'approved' | 'rejected';
  input: Record<string, string>;
  canvas: MaterialCanvas;
  createdBy: string;
  createdAt: string;
  submittedAt?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewReason?: string;
}

interface MaterialExportAudit {
  id: string;
  actorId: string;
  templateId: string;
  templateVersion: number;
  sourceKind: 'manual' | 'transit_line' | 'transit_station' | 'map_location' | 'road_coordinate';
  sourceRef?: string;
  draftId?: string;
  outputWidthPx: number;
  outputHeightPx: number;
  requestedAt: string;
}

interface MaterialActor {
  ldpassUserId: string;
  displayName: string;
  email?: string;
}

interface EditorState {
  title: string;
  description: string;
  family: MaterialFamily;
  source: string;
  fieldsSource: string;
  typographySource: string;
  widthM: string;
  heightM: string;
  pxPerMeter: string;
  tileSizePx: string;
  alignToTile: boolean;
}

const emptyEditor: EditorState = {
  title: '',
  description: '',
  family: 'custom',
  source: '',
  fieldsSource: '[]',
  typographySource: '',
  widthM: '1',
  heightM: '1',
  pxPerMeter: '128',
  tileSizePx: '128',
  alignToTile: true,
};

const familyLabels: Record<MaterialFamily, string> = {
  road_sign: '道路标志',
  address_sign: '地名与楼牌',
  bus_stop: '公交站牌',
  custom: '其他物料',
};

export function AdminMaterialsPanel() {
  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [drafts, setDrafts] = useState<MaterialDraft[]>([]);
  const [exports, setExports] = useState<MaterialExportAudit[]>([]);
  const [actors, setActors] = useState<MaterialActor[]>([]);
  const [statusText, setStatusText] = useState('正在读取物料后台');
  const [isBusy, setIsBusy] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<TemplateRecord | null>(null);
  const [editor, setEditor] = useState<EditorState>(emptyEditor);
  const [editorError, setEditorError] = useState('');

  const pendingDrafts = useMemo(
    () => drafts.filter((draft) => draft.status === 'pending_review'),
    [drafts],
  );

  const loadState = async () => {
    try {
      const response = await fetch(appPath('/api/admin/materials'), { cache: 'no-store' });
      const data = (await response.json()) as {
        templates?: TemplateRecord[];
        drafts?: MaterialDraft[];
        exports?: MaterialExportAudit[];
        actors?: MaterialActor[];
        message?: string;
      };
      if (!response.ok) {
        setStatusText(data.message ?? '物料后台暂不可用。');
        return;
      }
      setTemplates(data.templates ?? []);
      setDrafts(data.drafts ?? []);
      setExports(data.exports ?? []);
      setActors(data.actors ?? []);
      setStatusText('物料模板和审核队列已更新。');
    } catch {
      setStatusText('物料后台暂时无法连接。');
    }
  };

  useEffect(() => {
    void loadState();
  }, []);

  const openCreate = () => {
    setEditingRecord(null);
    setEditor(emptyEditor);
    setEditorError('');
    setIsEditorOpen(true);
  };

  const openRevision = (record: TemplateRecord) => {
    const version = latestVersion(record);
    if (!version) {
      return;
    }
    setEditingRecord(record);
    setEditor({
      title: version.title,
      description: version.description ?? '',
      family: version.family,
      source: version.source,
      fieldsSource: JSON.stringify(version.fields, null, 2),
      typographySource: version.typographyProfile
        ? JSON.stringify(version.typographyProfile, null, 2)
        : '',
      widthM: String(version.defaultCanvas.widthM),
      heightM: String(version.defaultCanvas.heightM),
      pxPerMeter: String(version.defaultCanvas.pxPerMeter),
      tileSizePx: String(version.defaultCanvas.tileSizePx),
      alignToTile: version.defaultCanvas.alignToTile,
    });
    setEditorError('');
    setIsEditorOpen(true);
  };

  const closeEditor = () => {
    setIsEditorOpen(false);
    setEditingRecord(null);
    setEditor(emptyEditor);
    setEditorError('');
  };

  const updateEditorField = <TKey extends keyof EditorState>(
    key: TKey,
    value: EditorState[TKey],
  ) => {
    setEditor((current) => ({ ...current, [key]: value }));
  };

  const saveTemplate = async () => {
    const parsed = parseEditor(editor);
    if (!parsed.ok) {
      setEditorError(parsed.message);
      return;
    }
    setIsBusy(true);
    try {
      const latest = editingRecord ? latestVersion(editingRecord) : undefined;
      const endpoint = editingRecord
        ? appPath(
            `/api/admin/materials/templates/${encodeURIComponent(editingRecord.id)}/revisions`,
          )
        : appPath('/api/admin/materials');
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          editingRecord ? { ...parsed.value, baseVersion: latest?.version } : parsed.value,
        ),
      });
      const data = (await response.json()) as { message?: string };
      if (!response.ok) {
        setEditorError(data.message ?? '模板保存失败。');
        return;
      }
      closeEditor();
      setStatusText(editingRecord ? '模板修订已创建。' : '模板草稿已创建。');
      publishAdminDataChanged({
        resource: 'materials',
        reason: 'record_created',
        occurredAt: new Date().toISOString(),
      });
      await loadState();
    } catch {
      setEditorError('模板保存时发生网络错误。');
    } finally {
      setIsBusy(false);
    }
  };

  const publishVersion = async (record: TemplateRecord, version: TemplateVersion) => {
    setIsBusy(true);
    try {
      const response = await fetch(
        appPath(
          `/api/admin/materials/templates/${encodeURIComponent(record.id)}/versions/${version.version}/publish`,
        ),
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
      );
      const data = (await response.json()) as { message?: string };
      if (!response.ok) {
        setStatusText(data.message ?? '发布模板失败。');
        return;
      }
      setStatusText('模板版本已发布。');
      publishAdminDataChanged({
        resource: 'materials',
        reason: 'status_changed',
        occurredAt: new Date().toISOString(),
      });
      await loadState();
    } catch {
      setStatusText('发布模板时发生网络错误。');
    } finally {
      setIsBusy(false);
    }
  };

  const reviewDraft = async (draft: MaterialDraft, decision: 'approved' | 'rejected') => {
    setIsBusy(true);
    try {
      const response = await fetch(
        appPath(`/api/admin/materials/drafts/${encodeURIComponent(draft.id)}/review`),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ decision }),
        },
      );
      const data = (await response.json()) as { message?: string };
      if (!response.ok) {
        setStatusText(data.message ?? '审核物料失败。');
        return;
      }
      setStatusText(decision === 'approved' ? '物料已审核通过。' : '物料已驳回。');
      publishAdminDataChanged({
        resource: 'materials',
        reason: 'status_changed',
        occurredAt: new Date().toISOString(),
      });
      await loadState();
    } catch {
      setStatusText('审核物料时发生网络错误。');
    } finally {
      setIsBusy(false);
    }
  };

  const templateVersionByKey = useMemo(() => {
    const map = new Map<string, TemplateVersion>();
    for (const record of templates) {
      for (const version of record.versions) {
        map.set(`${record.id}:${version.version}`, version);
      }
    }
    return map;
  }, [templates]);
  const actorById = useMemo(
    () => new Map(actors.map((actor) => [actor.ldpassUserId, actor])),
    [actors],
  );

  return (
    <section className="admin-materials-panel" aria-label="物料后台">
      <div className="section-heading">
        <div>
          <span className="eyebrow">物料后台</span>
          <h1>模板与审核</h1>
        </div>
        <div className="admin-content-actions">
          <AdminRefreshButton
            disabled={isBusy}
            label="刷新物料"
            onRefresh={loadState}
            resource="materials"
          />
          <button type="button" className="is-primary" onClick={openCreate} disabled={isBusy}>
            <span className="material-symbols-outlined" aria-hidden="true">
              add
            </span>
            新建模板
          </button>
        </div>
      </div>
      <p className="muted">{statusText}</p>

      <div className="admin-materials-metrics" aria-label="物料统计">
        <span>
          <strong>{templates.length}</strong> 模板
        </span>
        <span>
          <strong>
            {
              templates
                .flatMap((template) => template.versions)
                .filter((item) => item.status === 'published').length
            }
          </strong>{' '}
          已发布
        </span>
        <span>
          <strong>{pendingDrafts.length}</strong> 待审核
        </span>
      </div>

      <div className="admin-materials-list">
        {templates.length ? (
          templates.map((record) => {
            const version = latestVersion(record);
            if (!version) {
              return null;
            }
            return (
              <article className="admin-material-template" key={record.id}>
                <div>
                  <div className="admin-material-template-heading">
                    <strong>{version.title}</strong>
                    <span>{familyLabels[version.family]}</span>
                  </div>
                  <p>{version.description || '无说明'}</p>
                  <small>
                    {record.id} · 最新版本 v{version.version} · {statusLabel(version.status)}
                  </small>
                </div>
                <div className="admin-content-actions">
                  <button type="button" onClick={() => openRevision(record)} disabled={isBusy}>
                    修订
                  </button>
                  {version.status === 'draft' ? (
                    <button
                      type="button"
                      className="is-primary"
                      onClick={() => void publishVersion(record, version)}
                      disabled={isBusy}
                    >
                      发布
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })
        ) : (
          <p className="admin-content-empty">当前还没有模板，可直接新建模板草稿。</p>
        )}
      </div>

      <section className="admin-material-review-list" aria-labelledby="material-review-heading">
        <div className="admin-material-review-heading">
          <h2 id="material-review-heading">待审核物料</h2>
          <span>{pendingDrafts.length}</span>
        </div>
        {pendingDrafts.length ? (
          pendingDrafts.map((draft) => (
            <article className="admin-material-draft" key={draft.id}>
              <div>
                <strong>
                  {templateVersionByKey.get(`${draft.templateId}:${draft.templateVersion}`)
                    ?.title ?? draft.templateId}{' '}
                  · v{draft.templateVersion} · {materialDraftStatusLabel(draft.status)}
                </strong>
                <p className="admin-material-draft-content">
                  {formatMaterialDraftInput(
                    draft,
                    templateVersionByKey.get(`${draft.templateId}:${draft.templateVersion}`),
                  )}
                  <br />
                  画布：{draft.canvas.widthM} × {draft.canvas.heightM} 米，输出基准{' '}
                  {draft.canvas.tileSizePx} px
                </p>
                <small>
                  发起者：{formatActor(draft.createdBy, actorById)} · 提交于{' '}
                  {formatTime(draft.submittedAt ?? draft.createdAt)} · 草稿 ID：{draft.id}
                </small>
              </div>
              <div className="admin-content-actions">
                <button
                  type="button"
                  onClick={() => void reviewDraft(draft, 'rejected')}
                  disabled={isBusy}
                >
                  驳回
                </button>
                <button
                  type="button"
                  className="is-primary"
                  onClick={() => void reviewDraft(draft, 'approved')}
                  disabled={isBusy}
                >
                  通过
                </button>
              </div>
            </article>
          ))
        ) : (
          <p className="admin-content-empty">当前没有待审核物料。</p>
        )}
      </section>

      <section
        className="admin-material-review-list"
        aria-labelledby="material-export-audit-heading"
      >
        <div className="admin-material-review-heading">
          <h2 id="material-export-audit-heading">最近下载</h2>
          <span>{exports.length}</span>
        </div>
        {exports.length ? (
          [...exports]
            .sort((left, right) => right.requestedAt.localeCompare(left.requestedAt))
            .slice(0, 20)
            .map((item) => (
              <article className="admin-material-draft" key={item.id}>
                <div>
                  <strong>
                    {templateVersionByKey.get(`${item.templateId}:${item.templateVersion}`)
                      ?.title ?? item.templateId}{' '}
                    · v{item.templateVersion} · {item.outputWidthPx} × {item.outputHeightPx} px
                  </strong>
                  <small>
                    下载者：{formatActor(item.actorId, actorById)} · 来源：
                    {formatMaterialSource(item)} · {formatTime(item.requestedAt)}
                  </small>
                </div>
              </article>
            ))
        ) : (
          <p className="admin-content-empty">当前没有下载记录。</p>
        )}
      </section>

      {isEditorOpen ? (
        <div className="admin-material-editor-backdrop" role="presentation">
          <form
            className="admin-editor admin-material-editor"
            onSubmit={(event) => {
              event.preventDefault();
              void saveTemplate();
            }}
          >
            <div className="admin-material-editor-heading">
              <h2>{editingRecord ? '创建模板修订' : '创建模板'}</h2>
              <button
                type="button"
                className="icon-button"
                aria-label="关闭"
                onClick={closeEditor}
                disabled={isBusy}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  close
                </span>
              </button>
            </div>
            <label>
              <span>模板名称</span>
              <input
                value={editor.title}
                onChange={(event) => updateEditorField('title', event.currentTarget.value)}
                required
              />
            </label>
            <label>
              <span>模板类别</span>
              <select
                value={editor.family}
                onChange={(event) =>
                  updateEditorField('family', event.currentTarget.value as MaterialFamily)
                }
              >
                {Object.entries(familyLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="admin-editor-markdown">
              <span>说明</span>
              <input
                value={editor.description}
                onChange={(event) => updateEditorField('description', event.currentTarget.value)}
              />
            </label>
            <label className="admin-editor-markdown">
              <span>SVG 源码</span>
              <textarea
                value={editor.source}
                spellCheck={false}
                onChange={(event) => updateEditorField('source', event.currentTarget.value)}
                required
              />
            </label>
            <label className="admin-editor-markdown">
              <span>字段定义（JSON）</span>
              <textarea
                value={editor.fieldsSource}
                spellCheck={false}
                onChange={(event) => updateEditorField('fieldsSource', event.currentTarget.value)}
                required
              />
            </label>
            <label className="admin-editor-markdown">
              <span>设计时速与字高规则（JSON，可留空）</span>
              <textarea
                value={editor.typographySource}
                spellCheck={false}
                onChange={(event) =>
                  updateEditorField('typographySource', event.currentTarget.value)
                }
              />
            </label>
            <label>
              <span>宽度（米）</span>
              <input
                type="number"
                min="0.01"
                max="64"
                step="0.01"
                value={editor.widthM}
                onChange={(event) => updateEditorField('widthM', event.currentTarget.value)}
                required
              />
            </label>
            <label>
              <span>高度（米）</span>
              <input
                type="number"
                min="0.01"
                max="64"
                step="0.01"
                value={editor.heightM}
                onChange={(event) => updateEditorField('heightM', event.currentTarget.value)}
                required
              />
            </label>
            <label>
              <span>DPI</span>
              <input
                type="number"
                min="16"
                max="1024"
                value={editor.pxPerMeter}
                onChange={(event) => updateEditorField('pxPerMeter', event.currentTarget.value)}
                required
              />
            </label>
            <label>
              <span>对齐单位（像素）</span>
              <input
                type="number"
                min="16"
                max="4096"
                value={editor.tileSizePx}
                onChange={(event) => updateEditorField('tileSizePx', event.currentTarget.value)}
                required
              />
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={editor.alignToTile}
                onChange={(event) => updateEditorField('alignToTile', event.currentTarget.checked)}
              />
              <span>对齐到整数地图画尺寸</span>
            </label>
            {editorError ? <p className="muted admin-poi-dialog-error">{editorError}</p> : null}
            <div className="admin-content-actions admin-material-editor-actions">
              <button type="button" onClick={closeEditor} disabled={isBusy}>
                取消
              </button>
              <button type="submit" className="is-primary" disabled={isBusy}>
                保存草稿
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}

function parseEditor(
  editor: EditorState,
): { ok: true; value: Record<string, unknown> } | { ok: false; message: string } {
  let fields: unknown;
  let typographyProfile: unknown;
  try {
    fields = JSON.parse(editor.fieldsSource);
  } catch {
    return { ok: false, message: '字段定义不是有效 JSON。' };
  }
  if (!Array.isArray(fields)) {
    return { ok: false, message: '字段定义必须是 JSON 数组。' };
  }
  if (editor.typographySource.trim()) {
    try {
      typographyProfile = JSON.parse(editor.typographySource);
    } catch {
      return { ok: false, message: '字体规则不是有效 JSON。' };
    }
  }
  const canvas = {
    widthM: Number(editor.widthM),
    heightM: Number(editor.heightM),
    pxPerMeter: Number(editor.pxPerMeter),
    alignToTile: editor.alignToTile,
    tileSizePx: Number(editor.tileSizePx),
  };
  if (!editor.title.trim() || !editor.source.trim()) {
    return { ok: false, message: '模板名称和 SVG 源码不能为空。' };
  }
  return {
    ok: true,
    value: {
      title: editor.title.trim(),
      description: editor.description.trim() || undefined,
      family: editor.family,
      source: editor.source,
      fields,
      typographyProfile,
      defaultCanvas: canvas,
    },
  };
}

function latestVersion(record: TemplateRecord): TemplateVersion | undefined {
  return [...record.versions].sort((left, right) => right.version - left.version)[0];
}

function statusLabel(status: TemplateStatus): string {
  return { draft: '草稿', published: '已发布', archived: '已归档' }[status];
}

function materialDraftStatusLabel(status: MaterialDraft['status']): string {
  return {
    draft: '草稿',
    pending_review: '待审核',
    approved: '已通过',
    rejected: '已驳回',
  }[status];
}

function formatMaterialDraftInput(
  draft: MaterialDraft,
  template: TemplateVersion | undefined,
): string {
  if (!template) {
    return `字段：${
      Object.entries(draft.input)
        .filter(([, value]) => value)
        .map(([key, value]) => `${key}：${value}`)
        .join(' · ') || '未填写'
    }`;
  }
  const values = template.fields
    .map((field) => {
      const value = draft.input[field.key]?.trim();
      if (!value) {
        return undefined;
      }
      const option = field.options?.find((item) => item.value === value);
      return `${field.label}：${option?.label ?? value}`;
    })
    .filter(Boolean);
  return values.length ? values.join(' · ') : '未填写字段内容';
}

function formatActor(actorId: string, actors: Map<string, MaterialActor>): string {
  const actor = actors.get(actorId);
  if (!actor) {
    return actorId;
  }
  return actor.email
    ? `${actor.displayName}（${actor.email}）`
    : `${actor.displayName}（${actorId}）`;
}

function formatMaterialSource(item: MaterialExportAudit): string {
  if (item.sourceKind === 'manual') {
    return `自定义物料${item.draftId ? ` · ${item.draftId}` : ''}`;
  }
  const sourceLabel = {
    transit_line: '服务器线路',
    transit_station: '服务器公交站',
    map_location: '服务器地点',
    road_coordinate: '道路安装坐标',
  }[item.sourceKind];
  return `${sourceLabel}${item.sourceRef ? ` · ${item.sourceRef}` : ''}`;
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(value),
  );
}
