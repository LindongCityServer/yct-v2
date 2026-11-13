'use client';

import type { ContentAsset } from '@yct/contracts';
import { useEffect, useMemo, useRef, useState } from 'react';
import { appPath } from '../lib/app-paths';
import { uploadContentAsset } from '../lib/content-assets-client';
import { publishToastRequested } from '../lib/client-toast-events';
import type { AdminContentRecord } from '../lib/content-workflow';
import type { ContentEditorDraft } from '../lib/content-editor-draft';
import { CONTENT_CATEGORIES } from '../lib/content-categories';
import {
  formatContentDateTime,
  parseBannerSortOrderInput,
  parseCustomTagsInput,
  parseDateTimeLocalInput,
  toDateTimeLocalInput,
} from '../lib/content-metadata';
import { countMarkdownVisibleCharacters, parseMarkdownBlocks } from '../lib/editor/markdown-blocks';
import { useEditorFieldDraft } from '../lib/editor/use-editor-field-draft';
import { ContentCoverColorPicker } from './content-cover-color-picker';
import { ContentPoiBindingEditor } from './content-poi-binding-editor';
import { EditorDialogPortal } from './editor/editor-dialog-portal';
import { MarkdownAssetSection } from './markdown-asset-section';

/** 未选中块时的全局属性：内容摘要 + 发布标签 + 关联内容入口。 */
export function MarkdownDocumentInspector({
  disabled,
  draft,
  onChange,
  onInsertAsset,
  record,
}: Readonly<{
  disabled: boolean;
  draft: ContentEditorDraft;
  onChange: (patch: Partial<ContentEditorDraft>) => void;
  onInsertAsset: (asset: ContentAsset) => void;
  record: AdminContentRecord;
}>) {
  const blocks = useMemo(() => parseMarkdownBlocks(draft.markdown), [draft.markdown]);
  const characterCount = countMarkdownVisibleCharacters(blocks);
  const imageBlockCount = blocks.filter((block) => block.type === 'image').length;
  const relatedPoiCount = draft.metadata.relatedPoiMarkerIds?.length ?? 0;
  const published = record.revision.status === 'published';
  const archived = record.revision.status === 'archived';

  const tagsValue = (draft.metadata.customTags ?? []).join('\n');
  const tagsField = useEditorFieldDraft(tagsValue);

  const expiresValue = toDateTimeLocalInput(draft.metadata.expiresAt);
  const expiresField = useEditorFieldDraft(expiresValue);
  const [expiresError, setExpiresError] = useState(false);
  const [activeDialog, setActiveDialog] = useState<'poi' | 'assets' | null>(null);

  const updateMetadata = (patch: Partial<ContentEditorDraft['metadata']>) => {
    onChange({ metadata: { ...draft.metadata, ...patch } });
  };

  const applyExpires = (value: string) => {
    if (!value.trim()) {
      setExpiresError(false);
      if (draft.metadata.expiresAt !== undefined) {
        updateMetadata({ expiresAt: undefined });
      }
      return;
    }
    const parsed = parseDateTimeLocalInput(value);
    if (parsed === undefined) {
      setExpiresError(true);
      return;
    }
    setExpiresError(false);
    updateMetadata({ expiresAt: parsed });
  };

  const commitExpires = () => applyExpires(expiresField.value);

  return (
    <div className="markdown-document-inspector">
      <dl className="poi-visual-global-summary">
        <div>
          <dt>内容状态</dt>
          <dd>{contentStatusLabel(record.revision.status)}</dd>
        </div>
        <div>
          <dt>正文</dt>
          <dd>{`${characterCount} 字 · ${blocks.length} 块`}</dd>
        </div>
        <div>
          <dt>图片块</dt>
          <dd>{`${imageBlockCount} 个`}</dd>
        </div>
        <div>
          <dt>关联 POI</dt>
          <dd>{`${relatedPoiCount} 个`}</dd>
        </div>
        {draft.scheduledAt ? (
          <div>
            <dt>定时发布</dt>
            <dd>{formatContentDateTime(draft.scheduledAt)}</dd>
          </div>
        ) : null}
        <div>
          <dt>最近更新</dt>
          <dd>{formatContentDateTime(record.updatedAt)}</dd>
        </div>
      </dl>

      {archived ? (
        <p className="poi-visual-panel-empty">
          当前内容已归档，需先在内容列表恢复为草稿后才能继续编辑。
        </p>
      ) : null}

      <div className="markdown-inspector-section">
        <div className="markdown-inspector-section-heading">
          <p className="markdown-inspector-section-title">发布与标签</p>
        </div>
        <label className="material-field">
          <span>有效期</span>
          <input
            disabled={disabled || published}
            type="datetime-local"
            value={expiresField.value}
            onBlur={() => {
              expiresField.handleBlur();
              commitExpires();
            }}
            onChange={(event) => {
              const nextValue = event.currentTarget.value;
              expiresField.setValue(nextValue);
              applyExpires(nextValue);
            }}
            onFocus={expiresField.handleFocus}
          />
          {published ? (
            <small className="muted">已发布内容不可修改有效期。</small>
          ) : expiresError ? (
            <small className="muted">请输入有效的日期时间。</small>
          ) : null}
        </label>
        <label className="material-field">
          <span>标签</span>
          <textarea
            disabled={disabled}
            placeholder="每行一个标签，或用逗号分隔"
            value={tagsField.value}
            onBlur={() => {
              tagsField.handleBlur();
              const customTags = parseCustomTagsInput(tagsField.value);
              updateMetadata({ customTags: customTags.length > 0 ? customTags : undefined });
            }}
            onChange={(event) => {
              const nextValue = event.currentTarget.value;
              tagsField.setValue(nextValue);
              const customTags = parseCustomTagsInput(nextValue);
              updateMetadata({ customTags: customTags.length > 0 ? customTags : undefined });
            }}
            onFocus={tagsField.handleFocus}
          />
        </label>
        <p className="poi-visual-panel-empty">
          状态流转（提交审核 / 发布 / 归档）仍在内容列表完成，工作台只负责正文与元数据。
        </p>
      </div>

      <div className="markdown-inspector-section">
        <div className="markdown-inspector-section-heading">
          <p className="markdown-inspector-section-title">关联内容</p>
        </div>
        <button
          className="secondary-action-button markdown-dialog-entry"
          type="button"
          onClick={() => setActiveDialog('poi')}
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            location_on
          </span>
          <span>关联 POI</span>
          <span className="markdown-dialog-entry-count">{`${relatedPoiCount} 个`}</span>
          <span className="material-symbols-outlined" aria-hidden="true">
            chevron_right
          </span>
        </button>
        <button
          className="secondary-action-button markdown-dialog-entry"
          type="button"
          onClick={() => setActiveDialog('assets')}
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            image
          </span>
          <span>素材</span>
          <span className="markdown-dialog-entry-count">{`${draft.assetIds.length} 个已关联`}</span>
          <span className="material-symbols-outlined" aria-hidden="true">
            chevron_right
          </span>
        </button>
      </div>

      <EditorDialogPortal>
        {activeDialog === 'poi' ? (
          <div
            className="modal-backdrop editor-dialog-backdrop"
            role="presentation"
            onMouseDown={() => setActiveDialog(null)}
          >
            <section
              className="modal-panel markdown-editor-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="markdown-poi-dialog-title"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="section-heading">
                <h2 id="markdown-poi-dialog-title">关联 POI</h2>
                <button
                  className="icon-action-button"
                  type="button"
                  aria-label="关闭关联 POI"
                  onClick={() => setActiveDialog(null)}
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    close
                  </span>
                </button>
              </div>
              <p className="muted">{`当前已关联 ${relatedPoiCount} 个 POI。`}</p>
              <ContentPoiBindingEditor
                selectedIds={draft.metadata.relatedPoiMarkerIds ?? []}
                onChange={(ids) => updateMetadata({ relatedPoiMarkerIds: ids })}
              />
              <div className="admin-content-actions">
                <button
                  className="secondary-action-button is-primary"
                  type="button"
                  onClick={() => setActiveDialog(null)}
                >
                  完成
                </button>
              </div>
            </section>
          </div>
        ) : null}

        {activeDialog === 'assets' ? (
          <div
            className="modal-backdrop editor-dialog-backdrop"
            role="presentation"
            onMouseDown={() => setActiveDialog(null)}
          >
            <section
              className="modal-panel markdown-editor-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="markdown-asset-dialog-title"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="section-heading">
                <h2 id="markdown-asset-dialog-title">素材</h2>
                <button
                  className="icon-action-button"
                  type="button"
                  aria-label="关闭素材"
                  onClick={() => setActiveDialog(null)}
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    close
                  </span>
                </button>
              </div>
              <MarkdownAssetSection
                assetIds={draft.assetIds}
                disabled={disabled}
                onAssetIdsChange={(assetIds) => onChange({ assetIds })}
                onInsert={onInsertAsset}
              />
              <div className="admin-content-actions">
                <button
                  className="secondary-action-button is-primary"
                  type="button"
                  onClick={() => setActiveDialog(null)}
                >
                  完成
                </button>
              </div>
            </section>
          </div>
        ) : null}
      </EditorDialogPortal>
    </div>
  );
}

/** 封面、分类、标题、摘要与首页重点设置：文档头块的右侧属性。 */
export function MarkdownHeaderFields({
  disabled,
  draft,
  onChange,
  onAssetUploaded,
}: Readonly<{
  disabled: boolean;
  draft: ContentEditorDraft;
  onChange: (patch: Partial<ContentEditorDraft>) => void;
  onAssetUploaded: (asset: ContentAsset) => void;
}>) {
  const bannerSortValue =
    draft.metadata.bannerSortOrder === undefined ? '' : String(draft.metadata.bannerSortOrder);
  const bannerSortField = useEditorFieldDraft(bannerSortValue);
  const [bannerSortError, setBannerSortError] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);
  const [coverBroken, setCoverBroken] = useState(false);
  const coverFileRef = useRef<HTMLInputElement | null>(null);
  const coverImage = draft.metadata.coverImageUrl?.trim() ?? '';

  useEffect(() => {
    setCoverBroken(false);
  }, [coverImage]);

  const updateMetadata = (patch: Partial<ContentEditorDraft['metadata']>) => {
    onChange({ metadata: { ...draft.metadata, ...patch } });
  };

  const applyBannerSort = (value: string) => {
    if (!value.trim()) {
      setBannerSortError(false);
      if (draft.metadata.bannerSortOrder !== undefined) {
        updateMetadata({ bannerSortOrder: undefined });
      }
      return;
    }
    const parsed = parseBannerSortOrderInput(value);
    if (parsed === undefined) {
      setBannerSortError(true);
      return;
    }
    setBannerSortError(false);
    updateMetadata({ bannerSortOrder: parsed });
  };

  const commitBannerSort = () => applyBannerSort(bannerSortField.value);
  const coverImageInvalid = Boolean(
    draft.metadata.coverImageUrl?.trim() &&
    !draft.metadata.coverImageUrl.trim().startsWith('/') &&
    !/^https?:\/\//i.test(draft.metadata.coverImageUrl.trim()),
  );

  const replaceCover = async (file: File) => {
    setCoverUploading(true);
    try {
      const result = await uploadContentAsset(file);
      if (!result.ok || !result.record) {
        publishToastRequested({
          message: result.message ?? '上传封面图失败。',
          tone: 'error',
        });
        return;
      }
      updateMetadata({ coverImageUrl: appPath(result.record.asset.url) });
      onAssetUploaded(result.record.asset);
      publishToastRequested({ message: '封面图已更新。', tone: 'success' });
      if (coverFileRef.current) {
        coverFileRef.current.value = '';
      }
    } finally {
      setCoverUploading(false);
    }
  };

  return (
    <div className="markdown-header-fields">
      <HomeEntryPreview draft={draft} />

      <div className="markdown-inspector-section">
        <div className="markdown-inspector-section-heading">
          <p className="markdown-inspector-section-title">基本信息</p>
        </div>
        <label className="material-field">
          <span>标题</span>
          <input
            disabled={disabled}
            maxLength={200}
            value={draft.title}
            onChange={(event) => onChange({ title: event.currentTarget.value })}
          />
        </label>
        <label className="material-field">
          <span>分类</span>
          <select
            disabled={disabled}
            value={draft.categoryId}
            onChange={(event) => onChange({ categoryId: event.currentTarget.value })}
          >
            {draft.categoryId &&
            !(CONTENT_CATEGORIES as readonly string[]).includes(draft.categoryId) ? (
              <option value={draft.categoryId}>{draft.categoryId}</option>
            ) : null}
            {CONTENT_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </label>
        <label className="material-field">
          <span>摘要</span>
          <textarea
            disabled={disabled}
            maxLength={500}
            placeholder="展示在首页与列表卡片上的摘要"
            value={draft.metadata.excerpt ?? ''}
            onChange={(event) => updateMetadata({ excerpt: event.currentTarget.value })}
          />
        </label>
      </div>

      <div className="markdown-inspector-section">
        <div className="markdown-inspector-section-heading">
          <p className="markdown-inspector-section-title">封面与展示</p>
        </div>
        <ContentCoverColorPicker
          disabled={disabled}
          value={draft.metadata.coverColor ?? ''}
          onChange={(coverColor) => updateMetadata({ coverColor: coverColor || undefined })}
        />
        <div className="markdown-cover-picker">
          <div className="markdown-cover-preview">
            {coverImage && !coverBroken ? (
              <img
                alt=""
                referrerPolicy="no-referrer"
                src={appPath(coverImage)}
                onError={() => setCoverBroken(true)}
              />
            ) : (
              <span className="material-symbols-outlined" aria-hidden="true">
                image
              </span>
            )}
          </div>
          <div className="markdown-cover-picker-actions">
            <label className="material-field">
              <span>选择封面图</span>
              <input
                ref={coverFileRef}
                accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml,image/avif"
                disabled={disabled || coverUploading}
                type="file"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  if (file) {
                    void replaceCover(file);
                  }
                }}
              />
            </label>
            {coverImage ? (
              <button
                aria-label="清除封面图"
                className="icon-action-button"
                disabled={disabled}
                title="清除封面图"
                type="button"
                onClick={() => updateMetadata({ coverImageUrl: undefined })}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  delete
                </span>
              </button>
            ) : null}
            {coverUploading ? <small className="muted">正在上传封面图…</small> : null}
          </div>
        </div>
        <label className="material-field">
          <span>封面图链接</span>
          <input
            disabled={disabled}
            placeholder="/content-assets/cover.png 或 https://..."
            value={draft.metadata.coverImageUrl ?? ''}
            onChange={(event) =>
              updateMetadata({ coverImageUrl: event.currentTarget.value || undefined })
            }
          />
          {coverImageInvalid ? (
            <small className="muted">封面图链接必须是站内路径或完整 URL。</small>
          ) : null}
        </label>
        <label className="checkbox-row">
          <input
            checked={draft.metadata.showInBanner}
            disabled={disabled}
            type="checkbox"
            onChange={(event) => updateMetadata({ showInBanner: event.currentTarget.checked })}
          />
          <span>作为首页重点资讯候选</span>
        </label>
        <label className="material-field">
          <span>重点排序</span>
          <input
            disabled={disabled}
            inputMode="numeric"
            placeholder="数值越小越靠前"
            value={bannerSortField.value}
            onBlur={() => {
              bannerSortField.handleBlur();
              commitBannerSort();
            }}
            onChange={(event) => {
              const nextValue = event.currentTarget.value;
              bannerSortField.setValue(nextValue);
              applyBannerSort(nextValue);
            }}
            onFocus={bannerSortField.handleFocus}
          />
          {bannerSortError ? <small className="muted">请输入整数排序值。</small> : null}
        </label>
      </div>
    </div>
  );
}

/** 按首页精选卡与列表入口的真实样式做一张只读预览。 */
function HomeEntryPreview({ draft }: Readonly<{ draft: ContentEditorDraft }>) {
  const coverImage = draft.metadata.coverImageUrl?.trim();
  const coverColor = draft.metadata.coverColor?.trim();
  const title = draft.title.trim() || '未命名内容';
  const excerpt = draft.metadata.excerpt?.trim();
  const hasCover = Boolean(coverImage || coverColor);
  const heroStyle = coverImage
    ? {
        backgroundImage: `linear-gradient(to top, rgba(17, 24, 23, 0.78), rgba(17, 24, 23, 0.24) 55%, rgba(17, 24, 23, 0.06)), url("${appPath(coverImage)}")`,
      }
    : hasCover
      ? {
          backgroundColor: coverColor,
          backgroundImage:
            'linear-gradient(to top, rgba(17, 24, 23, 0.72), rgba(17, 24, 23, 0.26) 54%, rgba(17, 24, 23, 0.04))',
        }
      : undefined;

  return (
    <div className="markdown-home-preview" aria-label="首页入口预览">
      <div className="markdown-inspector-section-heading">
        <p className="markdown-inspector-section-title">首页入口预览</p>
        <span className="markdown-home-preview-badge">
          {draft.metadata.showInBanner ? '首页重点' : '列表入口'}
        </span>
      </div>
      <div className={`markdown-home-hero${hasCover ? ' has-cover' : ''}`} style={heroStyle}>
        <div className="markdown-home-hero-copy">
          <span>{draft.categoryId || '未分类'}</span>
          <strong>{title}</strong>
          {!coverImage && excerpt ? <p>{excerpt}</p> : null}
        </div>
      </div>
      <div className="operations-feed-item markdown-home-feed" aria-hidden="true">
        <div
          className={coverImage ? 'feed-item-cover has-image' : 'feed-item-cover'}
          style={coverColor ? { backgroundColor: coverColor } : undefined}
        >
          {coverImage ? (
            <img alt="" src={appPath(coverImage)} />
          ) : (
            <span className="material-symbols-outlined">{coverColor ? 'article' : 'image'}</span>
          )}
        </div>
        <div className="feed-item-copy">
          <div className="feed-item-meta">
            <span>{draft.categoryId || '未分类'}</span>
            {draft.metadata.showInBanner ? <span>首页重点</span> : null}
          </div>
          <h2>{title}</h2>
          {excerpt ? <p>{excerpt}</p> : null}
        </div>
      </div>
      <p className="poi-visual-panel-empty">
        按首页精选与列表入口的真实样式预览，未发布内容仅作参考。
      </p>
    </div>
  );
}

function contentStatusLabel(status: AdminContentRecord['revision']['status']): string {
  const labels: Record<AdminContentRecord['revision']['status'], string> = {
    draft: '草稿',
    pending_review: '待审核',
    approved: '已通过',
    rejected: '已驳回',
    published: '已发布',
    archived: '已归档',
  };
  return labels[status];
}
