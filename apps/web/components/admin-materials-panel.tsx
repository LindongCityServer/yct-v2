'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import QRCode from 'qrcode';
import { appPath } from '../lib/app-paths';
import { publishAdminDataChanged } from '../lib/client-admin-data-events';
import { AdminRefreshButton } from './admin-refresh-button';
import { SegmentedControl } from './segmented-control';
import { Eyebrow } from './ui/status';
import { CheckboxRow } from './ui/checkbox-row';
import { IconButton } from './ui/button';
import { METRO_WAYFINDING_TEMPLATE_ID, parseMetroWayfindingLayout } from '../lib/metro-wayfinding';
import { MetroWayfindingExamplePreviewElement } from './metro-wayfinding-editor';

type MaterialFamily = 'road_sign' | 'address_sign' | 'bus_stop' | 'metro_line' | 'custom';
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
  kind?: 'preview' | 'export';
  actorId: string;
  actorName?: string;
  ipAddress?: string;
  ipLocation?: string;
  templateId: string;
  templateVersion: number;
  templateTitle?: string;
  contentSummary?: string;
  watermark?: boolean;
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

type MaterialShareLinkKind = MaterialFamily;
type MaterialShareLinkDataSource = 'server' | 'sample' | 'project';
type MaterialShareLinkOrigin = 'bot' | 'workbench';
type MaterialShareLinkEffectiveStatus = 'active' | 'expired' | 'revoked';

/** 后台「分享记录」一行（来自 GET /api/admin/materials/share-links）。 */
interface AdminMaterialShareLinkItem {
  id: string;
  slug: string;
  code: string;
  kind: MaterialShareLinkKind;
  dataSource: MaterialShareLinkDataSource;
  origin: MaterialShareLinkOrigin;
  createdBy?: string;
  templateId: string;
  templateVersion: number;
  templateTitle: string;
  createdAt: string;
  openCount: number;
  lastOpenedAt?: string;
  status: 'active' | 'revoked';
  effectiveStatus: MaterialShareLinkEffectiveStatus;
  shareImageWatermark: boolean;
  networkName?: string;
  licenseName?: string;
  licenseUrl?: string;
  revokedAt?: string;
  revokedBy?: string;
  stub: boolean;
  sharePath: string;
}

interface AdminMaterialShareLinkListResponse {
  items?: AdminMaterialShareLinkItem[];
  total?: number;
  page?: number;
  pageSize?: number;
  totalPages?: number;
  error?: string;
  message?: string;
}

interface AdminMaterialShareLinkMutationResponse {
  ok?: boolean;
  changed?: boolean;
  message?: string;
  item?: AdminMaterialShareLinkItem;
  error?: string;
}

interface ShareLinkQrState {
  shareId: string;
  dataUrl: string;
  url: string;
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
  metro_line: '地铁线路图',
  custom: '其他物料',
};

export function AdminMaterialsPanel() {
  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [drafts, setDrafts] = useState<MaterialDraft[]>([]);
  const [exports, setExports] = useState<MaterialExportAudit[]>([]);
  const [actors, setActors] = useState<MaterialActor[]>([]);
  const [statusText, setStatusText] = useState('正在读取物料后台');
  /** 四块内容用分段控件切换：模板 / 待审核物料 / 下载预览记录 / 分享记录。 */
  const [activeSection, setActiveSection] = useState<'templates' | 'drafts' | 'audits' | 'shares'>(
    'templates',
  );
  /** 下载预览记录的搜索与筛选。 */
  const [auditQuery, setAuditQuery] = useState('');
  const [auditKind, setAuditKind] = useState<'all' | 'preview' | 'export'>('all');
  const [auditWatermark, setAuditWatermark] = useState<'all' | 'free' | 'watermarked'>('all');
  /** 分享记录：服务端筛选 + 分页，条件变化后重新拉取。 */
  const [shares, setShares] = useState<AdminMaterialShareLinkItem[]>([]);
  const [sharesTotal, setSharesTotal] = useState(0);
  const [sharesPage, setSharesPage] = useState(1);
  const [sharesTotalPages, setSharesTotalPages] = useState(1);
  const [sharesLoading, setSharesLoading] = useState(false);
  const [sharesError, setSharesError] = useState('');
  const [shareQueryInput, setShareQueryInput] = useState('');
  const [shareQuery, setShareQuery] = useState('');
  const [shareKindFilter, setShareKindFilter] = useState<'all' | MaterialShareLinkKind>('all');
  const [shareStatusFilter, setShareStatusFilter] = useState<
    'all' | MaterialShareLinkEffectiveStatus
  >('all');
  const [shareSourceFilter, setShareSourceFilter] = useState<'all' | MaterialShareLinkDataSource>(
    'all',
  );
  const [shareOriginFilter, setShareOriginFilter] = useState<'all' | MaterialShareLinkOrigin>(
    'all',
  );
  const [shareQr, setShareQr] = useState<ShareLinkQrState | null>(null);
  const [shareBusyId, setShareBusyId] = useState('');
  const shareLinkRequestRef = useRef(0);
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

  const loadShares = async () => {
    const requestId = shareLinkRequestRef.current + 1;
    shareLinkRequestRef.current = requestId;
    setSharesLoading(true);
    setSharesError('');
    try {
      const searchParams = new URLSearchParams();
      const keyword = shareQuery.trim();
      if (keyword) searchParams.set('q', keyword);
      if (shareKindFilter !== 'all') searchParams.set('kind', shareKindFilter);
      if (shareStatusFilter !== 'all') searchParams.set('status', shareStatusFilter);
      if (shareSourceFilter !== 'all') searchParams.set('source', shareSourceFilter);
      if (shareOriginFilter !== 'all') searchParams.set('origin', shareOriginFilter);
      searchParams.set('page', String(sharesPage));
      const response = await fetch(
        appPath(`/api/admin/materials/share-links?${searchParams.toString()}`),
        { cache: 'no-store' },
      );
      const data = (await response.json().catch(() => ({}))) as AdminMaterialShareLinkListResponse;
      // 快速切换筛选 / 翻页时只认最后一次请求，避免旧响应覆盖新列表。
      if (requestId !== shareLinkRequestRef.current) {
        return;
      }
      if (!response.ok) {
        setSharesError(data.message || '分享记录加载失败，请稍后重试。');
        return;
      }
      setShares(Array.isArray(data.items) ? data.items : []);
      setSharesTotal(typeof data.total === 'number' ? data.total : 0);
      setSharesTotalPages(Math.max(1, typeof data.totalPages === 'number' ? data.totalPages : 1));
    } catch {
      if (requestId === shareLinkRequestRef.current) {
        setSharesError('分享记录暂时无法连接，请稍后重试。');
      }
    } finally {
      if (requestId === shareLinkRequestRef.current) {
        setSharesLoading(false);
      }
    }
  };

  useEffect(() => {
    // 首次进入也要拉一次：分段控件上的「分享记录 N」需要总数。
    void loadShares();
  }, [
    shareQuery,
    shareKindFilter,
    shareStatusFilter,
    shareSourceFilter,
    shareOriginFilter,
    sharesPage,
  ]);

  useEffect(() => {
    // 切回「分享记录」时刷新，避免看到其他管理员操作前的旧列表。
    if (activeSection !== 'shares') {
      return;
    }
    void loadShares();
  }, [activeSection]);

  const submitShareSearch = () => {
    setShareQuery(shareQueryInput.trim());
    setSharesPage(1);
  };

  const resolveShareUrl = (item: AdminMaterialShareLinkItem) => {
    const path =
      item.sharePath || `/m/${encodeURIComponent(item.slug)}/${encodeURIComponent(item.id)}`;
    return new URL(appPath(path), window.location.origin).toString();
  };

  const copyShareLink = async (item: AdminMaterialShareLinkItem) => {
    const url = resolveShareUrl(item);
    try {
      await navigator.clipboard.writeText(url);
      setStatusText(`已复制分享链接：${url}`);
    } catch {
      setStatusText(`复制失败，请手动复制：${url}`);
    }
  };

  const toggleShareQr = async (item: AdminMaterialShareLinkItem) => {
    if (shareQr?.shareId === item.id) {
      setShareQr(null);
      return;
    }
    setShareBusyId(item.id);
    try {
      const url = resolveShareUrl(item);
      const dataUrl = await QRCode.toDataURL(url, {
        errorCorrectionLevel: 'M',
        margin: 1,
        width: 256,
        color: { dark: '#263c3a', light: '#ffffff' },
      });
      setShareQr({ shareId: item.id, dataUrl, url });
    } catch {
      setStatusText('二维码生成失败，可以先复制分享链接。');
    } finally {
      setShareBusyId('');
    }
  };

  const mutateShareLink = async (
    item: AdminMaterialShareLinkItem,
    action: 'revoke' | 'restore',
  ) => {
    if (
      action === 'revoke' &&
      !window.confirm(
        `停用后，打开 ${item.code || item.id} 的分享链接会提示「已被管理员停用」，不再进入编辑器。确定停用？`,
      )
    ) {
      return;
    }
    setShareBusyId(item.id);
    try {
      const response = await fetch(
        appPath(`/api/admin/materials/share-links/${encodeURIComponent(item.id)}/${action}`),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        },
      );
      const data = (await response
        .json()
        .catch(() => ({}))) as AdminMaterialShareLinkMutationResponse;
      if (!response.ok) {
        setStatusText(
          data.message || (action === 'revoke' ? '停用分享链接失败。' : '恢复分享链接失败。'),
        );
        return;
      }
      setStatusText(
        data.message || (action === 'revoke' ? '已停用分享链接。' : '已恢复分享链接。'),
      );
      publishAdminDataChanged({
        resource: 'materials',
        reason: 'status_changed',
        occurredAt: new Date().toISOString(),
      });
      await loadShares();
    } catch {
      setStatusText('操作分享链接时发生网络错误。');
    } finally {
      setShareBusyId('');
    }
  };

  const refreshMaterials = async () => {
    await Promise.all([loadState(), loadShares()]);
  };

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
  const filteredExports = useMemo(() => {
    const query = auditQuery.trim().toLocaleLowerCase('zh-CN');
    return [...exports]
      .filter((item) => {
        const kind = item.kind ?? 'export';
        if (auditKind !== 'all' && kind !== auditKind) {
          return false;
        }
        if (auditWatermark === 'free' && item.watermark !== false) {
          return false;
        }
        if (auditWatermark === 'watermarked' && item.watermark !== true) {
          return false;
        }
        if (!query) {
          return true;
        }
        return [
          item.actorName,
          item.actorId,
          item.templateTitle,
          item.templateId,
          item.contentSummary,
          item.ipLocation,
          item.ipAddress,
          item.id,
        ]
          .filter(Boolean)
          .join(' ')
          .toLocaleLowerCase('zh-CN')
          .includes(query);
      })
      .sort((left, right) => right.requestedAt.localeCompare(left.requestedAt));
  }, [auditKind, auditQuery, auditWatermark, exports]);

  return (
    <section className="admin-materials-panel" aria-label="物料后台">
      <div className="section-heading">
        <div>
          <Eyebrow>物料后台</Eyebrow>
          <h1>模板与审核</h1>
        </div>
        <div className="admin-content-actions">
          <AdminRefreshButton
            disabled={isBusy}
            label="刷新物料"
            onRefresh={refreshMaterials}
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

      <SegmentedControl
        ariaLabel="物料后台分区"
        className="material-mode-switch material-variant-switch admin-materials-section-switch"
        value={activeSection}
        onChange={setActiveSection}
        options={[
          { value: 'templates', label: `模板 ${templates.length}` },
          { value: 'drafts', label: `待审核物料 ${pendingDrafts.length}` },
          { value: 'audits', label: `下载预览记录 ${exports.length}` },
          { value: 'shares', label: `分享记录 ${sharesTotal}` },
        ]}
      />

      {activeSection === 'templates' ? (
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
      ) : null}

      {activeSection === 'drafts' ? (
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
                  <div className="admin-material-draft-content">
                    {formatMaterialDraftInput(
                      draft,
                      templateVersionByKey.get(`${draft.templateId}:${draft.templateVersion}`),
                    )}
                    <p>
                      画布：{draft.canvas.widthM} × {draft.canvas.heightM} 米，输出基准{' '}
                      {draft.canvas.tileSizePx} px
                    </p>
                  </div>
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
      ) : null}

      {activeSection === 'audits' ? (
        <section
          className="admin-material-review-list"
          aria-labelledby="material-export-audit-heading"
        >
          <div className="admin-material-review-heading">
            <h2 id="material-export-audit-heading">下载与预览记录</h2>
            <span>
              {filteredExports.length} / {exports.length}
            </span>
          </div>
          <div className="admin-material-audit-toolbar">
            <label className="admin-material-audit-search">
              <span className="material-symbols-outlined" aria-hidden="true">
                search
              </span>
              <input
                type="search"
                value={auditQuery}
                placeholder="搜索用户、模板、内容、属地或图片 ID"
                onChange={(event) => setAuditQuery(event.currentTarget.value)}
              />
            </label>
            <div className="admin-material-audit-filter">
              <span>类型</span>
              <SegmentedControl
                ariaLabel="记录类型"
                className="material-mode-switch material-variant-switch"
                value={auditKind}
                onChange={setAuditKind}
                options={[
                  { value: 'all', label: '全部' },
                  { value: 'preview', label: '预览' },
                  { value: 'export', label: '下载' },
                ]}
              />
            </div>
            <div className="admin-material-audit-filter">
              <span>水印</span>
              <SegmentedControl
                ariaLabel="水印筛选"
                className="material-mode-switch material-variant-switch"
                value={auditWatermark}
                onChange={setAuditWatermark}
                options={[
                  { value: 'all', label: '全部' },
                  { value: 'free', label: '无水印' },
                  { value: 'watermarked', label: '带水印' },
                ]}
              />
            </div>
          </div>
          {filteredExports.length ? (
            filteredExports.slice(0, 20).map((item) => (
              <article className="admin-material-draft" key={item.id}>
                <div>
                  <strong>
                    {item.kind === 'preview' ? '预览' : '下载'} ·{' '}
                    {item.templateTitle ??
                      templateVersionByKey.get(`${item.templateId}:${item.templateVersion}`)
                        ?.title ??
                      item.templateId}{' '}
                    · v{item.templateVersion} · {item.outputWidthPx} × {item.outputHeightPx} px
                    {item.contentSummary ? ` · ${item.contentSummary}` : ''}
                  </strong>
                  <small>
                    用户：{item.actorName || formatActor(item.actorId, actorById)} · IP：
                    {item.ipLocation ?? '未知属地'}
                    {item.ipAddress ? `（${item.ipAddress}）` : ''} · 来源：
                    {formatMaterialSource(item)} · 图片 ID：{item.id.slice(-12)} ·{' '}
                    {item.watermark === false ? '无水印' : item.watermark ? '带水印' : '水印未知'} ·{' '}
                    {formatTime(item.requestedAt)}
                  </small>
                </div>
              </article>
            ))
          ) : (
            <p className="admin-content-empty">
              {exports.length
                ? '没有匹配的记录，试试放宽搜索或筛选条件。'
                : '当前没有下载或预览记录。'}
            </p>
          )}
        </section>
      ) : null}

      {activeSection === 'shares' ? (
        <section
          className="admin-material-review-list"
          aria-labelledby="material-share-link-heading"
        >
          <div className="admin-material-review-heading">
            <h2 id="material-share-link-heading">分享记录</h2>
            <span>{sharesLoading ? '正在加载…' : `共 ${sharesTotal} 条`}</span>
          </div>
          <form
            className="admin-material-audit-toolbar"
            onSubmit={(event) => {
              event.preventDefault();
              submitShareSearch();
            }}
          >
            <label className="admin-material-audit-search">
              <span className="material-symbols-outlined" aria-hidden="true">
                search
              </span>
              <input
                type="search"
                value={shareQueryInput}
                placeholder="搜索编号、短链 ID 或模板名"
                onChange={(event) => setShareQueryInput(event.currentTarget.value)}
              />
            </label>
            <div className="admin-material-audit-filter">
              <span>类型</span>
              <select
                aria-label="分享物料类型"
                value={shareKindFilter}
                onChange={(event) => {
                  setShareKindFilter(event.currentTarget.value as 'all' | MaterialShareLinkKind);
                  setSharesPage(1);
                }}
              >
                <option value="all">全部</option>
                {Object.entries(familyLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="admin-material-audit-filter">
              <span>状态</span>
              <select
                aria-label="分享链接状态"
                value={shareStatusFilter}
                onChange={(event) => {
                  setShareStatusFilter(
                    event.currentTarget.value as 'all' | MaterialShareLinkEffectiveStatus,
                  );
                  setSharesPage(1);
                }}
              >
                <option value="all">全部</option>
                <option value="active">有效</option>
                <option value="expired">已过期</option>
                <option value="revoked">已停用</option>
              </select>
            </div>
            <div className="admin-material-audit-filter">
              <span>数据源</span>
              <select
                aria-label="分享数据源"
                value={shareSourceFilter}
                onChange={(event) => {
                  setShareSourceFilter(
                    event.currentTarget.value as 'all' | MaterialShareLinkDataSource,
                  );
                  setSharesPage(1);
                }}
              >
                <option value="all">全部</option>
                <option value="server">服务器线网</option>
                <option value="sample">示例线网</option>
                <option value="project">群共享线网</option>
              </select>
            </div>
            <div className="admin-material-audit-filter">
              <span>来源</span>
              <select
                aria-label="分享来源"
                value={shareOriginFilter}
                onChange={(event) => {
                  setShareOriginFilter(
                    event.currentTarget.value as 'all' | MaterialShareLinkOrigin,
                  );
                  setSharesPage(1);
                }}
              >
                <option value="all">全部</option>
                <option value="bot">机器人</option>
                <option value="workbench">工作台</option>
              </select>
            </div>
            <button type="submit" disabled={sharesLoading}>
              搜索
            </button>
            <button type="button" onClick={() => void loadShares()} disabled={sharesLoading}>
              刷新
            </button>
          </form>
          {sharesError ? <p className="muted admin-poi-dialog-error">{sharesError}</p> : null}
          {shares.length ? (
            shares.map((item) => (
              <article className="admin-material-draft" key={item.id}>
                <div>
                  <strong>
                    {item.code || '无编号'} · {item.templateTitle || item.templateId} · v
                    {item.templateVersion} · {shareLinkStatusLabel(item.effectiveStatus)}
                    {item.stub ? ' · 已压缩为过期占位' : ''}
                  </strong>
                  <div className="admin-material-draft-content">
                    <p>
                      短链：/m/{item.slug}/{item.id} · 类型：{familyLabels[item.kind]} · 数据源：
                      {shareLinkDataSourceLabel(item)} · 来源：
                      {shareLinkOriginLabel(item, actorById)}
                    </p>
                    <p>
                      创建：{formatTime(item.createdAt)} · 扫码 {item.openCount} 次 · 最近扫码：
                      {item.lastOpenedAt ? formatTime(item.lastOpenedAt) : '暂无'} · 水印：
                      {item.shareImageWatermark ? '带水印（未审核 / 自定义内容）' : '无水印'}
                    </p>
                    {item.licenseName ? <p>许可：{item.licenseName}</p> : null}
                    {item.revokedAt ? (
                      <p>
                        停用于 {formatTime(item.revokedAt)}
                        {item.revokedBy ? `（操作人：${item.revokedBy}）` : ''}
                      </p>
                    ) : null}
                  </div>
                  <small>
                    模板 {item.templateId} · 记录 ID {item.id} · 短链路径 {item.sharePath}
                  </small>
                  {shareQr?.shareId === item.id ? (
                    <div
                      style={{
                        display: 'grid',
                        gap: 'var(--yct-space-2)',
                        justifyItems: 'start',
                        marginTop: 'var(--yct-space-2)',
                      }}
                    >
                      <img
                        src={shareQr.dataUrl}
                        width={256}
                        height={256}
                        alt={`分享链接二维码 ${item.code || item.id}`}
                        style={{ background: '#fff', borderRadius: 'var(--yct-radius-md)' }}
                      />
                      <small>{shareQr.url}</small>
                      <div className="admin-content-actions">
                        <a
                          className="admin-action-link"
                          href={shareQr.dataUrl}
                          download={`material-share-${item.code || item.id}.png`}
                        >
                          保存二维码 PNG
                        </a>
                        <button type="button" onClick={() => setShareQr(null)}>
                          收起二维码
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
                <div className="admin-content-actions">
                  <button type="button" onClick={() => void copyShareLink(item)}>
                    复制链接
                  </button>
                  <button
                    type="button"
                    onClick={() => void toggleShareQr(item)}
                    disabled={shareBusyId === item.id}
                  >
                    {shareQr?.shareId === item.id ? '收起二维码' : '查看二维码'}
                  </button>
                  <a
                    className="admin-action-link"
                    href={item.sharePath}
                    target="_blank"
                    rel="noreferrer"
                  >
                    打开落地页
                  </a>
                  {item.status === 'revoked' ? (
                    <button
                      type="button"
                      className="is-primary"
                      onClick={() => void mutateShareLink(item, 'restore')}
                      disabled={shareBusyId === item.id}
                    >
                      恢复
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void mutateShareLink(item, 'revoke')}
                      disabled={shareBusyId === item.id}
                    >
                      停用
                    </button>
                  )}
                </div>
              </article>
            ))
          ) : (
            <p className="admin-content-empty">
              {sharesLoading
                ? '正在加载分享记录…'
                : sharesError
                  ? '分享记录加载失败，可稍后点「刷新」重试。'
                  : '当前没有符合条件的分享记录。'}
            </p>
          )}
          <div className="admin-content-actions" style={{ marginTop: 'var(--yct-space-3)' }}>
            <button
              type="button"
              onClick={() => setSharesPage((page) => Math.max(1, page - 1))}
              disabled={sharesLoading || sharesPage <= 1}
            >
              上一页
            </button>
            <span className="muted">
              第 {sharesPage} / {sharesTotalPages} 页 · 共 {sharesTotal} 条
            </span>
            <button
              type="button"
              onClick={() => setSharesPage((page) => Math.min(sharesTotalPages, page + 1))}
              disabled={sharesLoading || sharesPage >= sharesTotalPages}
            >
              下一页
            </button>
          </div>
        </section>
      ) : null}

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
              <IconButton
                variant="icon"
                icon="close"
                label="关闭"
                onClick={closeEditor}
                disabled={isBusy}
              />
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
            <CheckboxRow
              checked={editor.alignToTile}
              label="对齐到整数地图画尺寸"
              onChange={(event) => updateEditorField('alignToTile', event.currentTarget.checked)}
            />
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
): ReactNode {
  if (!template) {
    return `字段：${
      Object.entries(draft.input)
        .filter(([, value]) => value)
        .map(([key, value]) => `${key}：${value}`)
        .join(' · ') || '未填写'
    }`;
  }
  // 地铁导视牌模板：用图形化预览替代一坨 JSON 文本，审核者一眼能看到图标与文字布局。
  // 颜色刻意不复原，只展示「图标 + 文本」一字排开 + 空格 / 分割线 / 组合框边界。
  if (draft.templateId === METRO_WAYFINDING_TEMPLATE_ID) {
    const layoutText = draft.input.layout?.trim() ?? '';
    if (!layoutText) return '导视牌元素编排未填写。';
    const layout = parseMetroWayfindingLayout(layoutText);
    const visibleRows = layout.rows.slice(0, layout.mode === 'double' ? 2 : 1);
    return (
      <div className="admin-material-draft-metro-preview">
        {visibleRows.map((elements, index) => (
          <div key={index}>
            <span>{layout.mode === 'vertical' ? '竖向内容' : `第 ${index + 1} 行`}</span>
            <div className="metro-wayfinding-element-strip" aria-hidden="true">
              {elements.length ? (
                elements.map((element) => (
                  <MetroWayfindingExamplePreviewElement
                    key={element.id}
                    element={element}
                    layoutMode={layout.mode}
                    inheritedBackgroundColor="transparent"
                    inheritedForegroundColor="inherit"
                    renderSpaceIcons
                    neutralizeColors
                  />
                ))
              ) : (
                <span className="metro-wayfinding-example-preview-element is-space is-flex">
                  <span className="material-symbols-outlined" aria-hidden="true">
                    arrow_range
                  </span>
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    );
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

function shareLinkStatusLabel(status: MaterialShareLinkEffectiveStatus): string {
  return { active: '有效', expired: '已过期', revoked: '已停用' }[status];
}

function shareLinkDataSourceLabel(item: AdminMaterialShareLinkItem): string {
  const label = {
    server: '服务器线网',
    sample: '示例线网',
    project: '群共享线网',
  }[item.dataSource];
  return item.networkName ? `${label}（${item.networkName}）` : label;
}

function shareLinkOriginLabel(
  item: AdminMaterialShareLinkItem,
  actorById: Map<string, MaterialActor>,
): string {
  if (item.origin === 'bot') {
    return '机器人';
  }
  const creator = item.createdBy ? formatActor(item.createdBy, actorById) : '未知创建者';
  return `工作台 · 创建者：${creator}`;
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '时间未知';
  }
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}
