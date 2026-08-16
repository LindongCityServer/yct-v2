'use client';

import { useEffect, useRef, useState } from 'react';
import type { AdminContentRecord } from '../lib/content-workflow';
import { appPath } from '../lib/app-paths';
import { publishAdminDataChanged } from '../lib/client-admin-data-events';
import { publishEditorDraftChanged } from '../lib/client-editor-events';
import { MarkdownBlocks } from './markdown-blocks';
import { VisualEditorShell } from './visual-editor-shell';

export function AdminMarkdownEditorPage({
  initialContentId,
}: Readonly<{
  initialContentId?: string;
}>) {
  const [record, setRecord] = useState<AdminContentRecord | null>(null);
  const [markdown, setMarkdown] = useState('');
  const [status, setStatus] = useState('正在读取内容草稿');
  const [isBusy, setIsBusy] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [sourcePanelCollapsed, setSourcePanelCollapsed] = useState(false);
  const previewRef = useRef<HTMLElement | null>(null);
  const pendingPreviewRatioRef = useRef<number | null>(null);
  const editorSessionId = `markdown:${initialContentId ?? 'missing'}`;

  useEffect(() => {
    if (!initialContentId) {
      setStatus('缺少要编辑的内容 ID，请返回内容后台重新选择。');
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch(appPath('/api/admin/operations/contents'), {
          cache: 'no-store',
        });
        const data = (await response.json()) as {
          items?: AdminContentRecord[];
          message?: string;
        };
        if (cancelled) return;
        if (!response.ok) {
          setStatus(data.message ?? '内容草稿读取失败。');
          return;
        }
        const target = data.items?.find((item) => item.contentId === initialContentId);
        if (!target) {
          setStatus('未找到要编辑的内容草稿。');
          return;
        }
        if (target.sourceKind === 'legacy_content_data') {
          setStatus('旧内容需要先在内容后台完成接管，才能编辑 Markdown。');
          return;
        }
        setRecord(target);
        setMarkdown(target.revision.markdown);
        setStatus('已载入 Markdown 草稿');
      } catch {
        if (!cancelled) setStatus('内容草稿读取失败。');
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [initialContentId]);

  useEffect(() => {
    const ratio = pendingPreviewRatioRef.current;
    const preview = previewRef.current;
    if (ratio === null || !preview) return;
    pendingPreviewRatioRef.current = null;
    window.requestAnimationFrame(() => {
      preview.scrollTop = Math.max(0, (preview.scrollHeight - preview.clientHeight) * ratio);
    });
  }, [markdown]);

  const updateMarkdown = (value: string, selectionStart: number) => {
    const lineCount = Math.max(1, value.split('\n').length);
    const activeLine = value.slice(0, selectionStart).split('\n').length;
    pendingPreviewRatioRef.current = lineCount <= 1 ? 0 : (activeLine - 1) / (lineCount - 1);
    setMarkdown(value);
    setIsDirty(true);
    publishEditorDraftChanged({ dirty: true, editorKind: 'markdown', sessionId: editorSessionId });
  };

  const save = async () => {
    if (!record || isBusy) return;
    setIsBusy(true);
    setStatus('正在保存 Markdown');
    try {
      const response = await fetch(
        appPath(`/api/admin/operations/contents/${encodeURIComponent(record.contentId)}`),
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: record.revision.title,
            categoryId: record.revision.categoryId,
            markdown,
            assetIds: record.revision.assetIds,
            scheduledAt: record.revision.scheduledAt,
            excerpt: record.metadata.excerpt,
            showInBanner: record.metadata.showInBanner,
            bannerSortOrder: record.metadata.bannerSortOrder,
            customTags: record.metadata.customTags,
            coverColor: record.metadata.coverColor,
            coverImageUrl: record.metadata.coverImageUrl,
            expiresAt: record.metadata.expiresAt,
            relatedPoiMarkerIds: record.metadata.relatedPoiMarkerIds ?? [],
          }),
        },
      );
      const data = (await response.json()) as AdminContentRecord & { message?: string };
      if (!response.ok || !data.contentId) {
        setStatus(data.message ?? 'Markdown 保存失败。');
        return;
      }
      setRecord({ ...data, sourceKind: 'local_content_store' });
      setMarkdown(data.revision.markdown);
      setIsDirty(false);
      publishEditorDraftChanged({
        dirty: false,
        editorKind: 'markdown',
        sessionId: editorSessionId,
      });
      publishAdminDataChanged({
        resource: 'operations',
        reason: 'record_updated',
        occurredAt: new Date().toISOString(),
      });
      setStatus('Markdown 已保存');
    } catch {
      setStatus('Markdown 保存失败。');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <VisualEditorShell
      actions={
        <button
          className="secondary-action-button is-primary"
          type="button"
          aria-busy={isBusy}
          disabled={!record || isBusy}
          onClick={() => void save()}
        >
          <span
            className={`material-symbols-outlined${isBusy ? ' busy-state-indicator' : ''}`}
            aria-hidden="true"
          >
            {isBusy ? 'progress_activity' : 'save'}
          </span>
          <span>{isBusy ? '保存中' : '保存'}</span>
        </button>
      }
      backHref="/admin/operations"
      editorKind="markdown"
      isBusy={isBusy}
      isDirty={isDirty}
      onSave={() => void save()}
      sessionId={editorSessionId}
      status={status}
      title={record ? `编写 ${record.revision.title}` : 'Markdown 编辑器'}
      workspace
    >
      {record ? (
        <div
          className={`markdown-visual-workspace${sourcePanelCollapsed ? ' is-source-collapsed' : ''}`}
        >
          <aside className="markdown-source-panel" aria-label="Markdown 源代码">
            <div className="markdown-source-panel-heading">
              <div>
                <strong>Markdown 源码</strong>
                <span>{`${markdown.length} 字符 · ${markdown.split('\n').length} 行`}</span>
              </div>
              <button
                type="button"
                aria-expanded={!sourcePanelCollapsed}
                aria-label={sourcePanelCollapsed ? '展开源码面板' : '收起源码面板'}
                title={sourcePanelCollapsed ? '展开源码面板' : '收起源码面板'}
                onClick={() => setSourcePanelCollapsed((current) => !current)}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  {sourcePanelCollapsed ? 'left_panel_open' : 'left_panel_close'}
                </span>
              </button>
            </div>
            {!sourcePanelCollapsed ? (
              <textarea
                autoFocus
                spellCheck="false"
                value={markdown}
                onChange={(event) =>
                  updateMarkdown(event.currentTarget.value, event.currentTarget.selectionStart)
                }
                onSelect={(event) => {
                  const value = event.currentTarget.value;
                  const lineCount = Math.max(1, value.split('\n').length);
                  const activeLine = value
                    .slice(0, event.currentTarget.selectionStart)
                    .split('\n').length;
                  const ratio = lineCount <= 1 ? 0 : (activeLine - 1) / (lineCount - 1);
                  const preview = previewRef.current;
                  if (preview) {
                    preview.scrollTop = Math.max(
                      0,
                      (preview.scrollHeight - preview.clientHeight) * ratio,
                    );
                  }
                }}
              />
            ) : null}
          </aside>
          <article className="markdown-visual-preview" aria-label="内容预览" ref={previewRef}>
            {record.metadata.coverImageUrl || record.metadata.coverColor ? (
              <div
                className="admin-editor-preview-cover"
                style={
                  record.metadata.coverImageUrl
                    ? {
                        backgroundImage: `url("${appPath(record.metadata.coverImageUrl)}")`,
                      }
                    : { backgroundColor: record.metadata.coverColor }
                }
              />
            ) : null}
            <header className="markdown-visual-preview-heading">
              <span>{record.revision.categoryId}</span>
              <h2>{record.revision.title}</h2>
              {record.metadata.excerpt ? <p>{record.metadata.excerpt}</p> : null}
            </header>
            <MarkdownBlocks markdown={markdown} />
          </article>
        </div>
      ) : (
        <div className="visual-editor-empty-state">
          <span className="material-symbols-outlined" aria-hidden="true">
            edit_note
          </span>
          <p>{status}</p>
        </div>
      )}
    </VisualEditorShell>
  );
}
