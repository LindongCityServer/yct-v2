'use client';

import { useEffect, useRef, useState } from 'react';
import type { AdminContentRecord } from '../lib/content-workflow';
import { appPath } from '../lib/app-paths';
import { publishAdminDataChanged } from '../lib/client-admin-data-events';
import { publishEditorDraftChanged } from '../lib/client-editor-events';
import { publishToastRequested } from '../lib/client-toast-events';
import {
  createContentEditorDraft,
  toContentDraftPayload,
  type ContentEditorDraft,
} from '../lib/content-editor-draft';
import { AdminMarkdownEditorWorkspace } from './admin-markdown-editor-workspace';
import { EditorLoadingState } from './editor/editor-loading-state';
import { VisualEditorShell } from './visual-editor-shell';
import { Button } from './ui/button';

export function AdminMarkdownEditorPage({
  initialContentId,
}: Readonly<{
  initialContentId?: string;
}>) {
  const [record, setRecord] = useState<AdminContentRecord | null>(null);
  const [draft, setDraft] = useState<ContentEditorDraft | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [status, setStatus] = useState('正在读取内容草稿');
  const [isBusy, setIsBusy] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const saveInFlightRef = useRef(false);
  const editorSessionId = `markdown:${initialContentId ?? 'missing'}`;
  const backHref = initialContentId
    ? `/admin/operations?contentId=${encodeURIComponent(initialContentId)}`
    : '/admin/operations';

  useEffect(() => {
    if (!initialContentId) {
      setStatus('缺少要编辑的内容 ID，请返回内容后台重新选择。');
      setLoadState('error');
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
          setLoadState('error');
          return;
        }
        const target = data.items?.find((item) => item.contentId === initialContentId);
        if (!target) {
          setStatus('未找到要编辑的内容草稿。');
          setLoadState('error');
          return;
        }
        if (target.sourceKind === 'legacy_content_data') {
          setStatus('旧内容需要先在内容后台完成接管，才能编辑 Markdown。');
          setLoadState('error');
          return;
        }

        setRecord(target);
        setDraft(createContentEditorDraft(target));
        setIsDirty(false);
        setStatus('已载入内容草稿');
        setLoadState('ready');
        publishEditorDraftChanged({
          dirty: false,
          editorKind: 'markdown',
          sessionId: editorSessionId,
        });
      } catch {
        if (!cancelled) {
          setStatus('内容草稿读取失败。');
          setLoadState('error');
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [editorSessionId, initialContentId]);

  const updateDraft = (patch: Partial<ContentEditorDraft>) => {
    setDraft((current) => (current ? { ...current, ...patch } : current));
    setIsDirty(true);
    publishEditorDraftChanged({
      dirty: true,
      editorKind: 'markdown',
      sessionId: editorSessionId,
    });
  };

  const save = async (): Promise<boolean> => {
    if (!record || !draft || isBusy || saveInFlightRef.current) {
      return false;
    }
    if (record.revision.status === 'archived') {
      publishToastRequested({
        message: '已归档内容需先在内容列表恢复为草稿。',
        tone: 'warning',
      });
      return false;
    }
    if (!draft.title.trim()) {
      publishToastRequested({ message: '标题不能为空。', tone: 'error' });
      return false;
    }

    setIsBusy(true);
    saveInFlightRef.current = true;
    try {
      const response = await fetch(
        appPath(`/api/admin/operations/contents/${encodeURIComponent(record.contentId)}`),
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(toContentDraftPayload(draft)),
        },
      );
      const data = (await response.json()) as AdminContentRecord & { message?: string };
      if (!response.ok || !data.contentId) {
        publishToastRequested({
          message: data.message ?? '内容保存失败。',
          tone: 'error',
        });
        return false;
      }

      const nextRecord: AdminContentRecord = { ...data, sourceKind: 'local_content_store' };
      setRecord(nextRecord);
      setDraft(createContentEditorDraft(nextRecord));
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
      publishToastRequested({ message: '内容已保存。', tone: 'success' });
      return true;
    } catch {
      publishToastRequested({
        message: '内容保存失败，请检查网络后重试。',
        tone: 'error',
      });
      return false;
    } finally {
      setIsBusy(false);
      saveInFlightRef.current = false;
    }
  };

  if (loadState !== 'ready' || !record || !draft) {
    return (
      <EditorLoadingState
        backHref={backHref}
        backLabel="返回内容后台"
        error={loadState === 'error' ? status : undefined}
        icon="edit_note"
        status={loadState === 'loading' ? status : '内容工作台不可用'}
      />
    );
  }

  const archived = record.revision.status === 'archived';

  return (
    <VisualEditorShell
      actions={
        <Button
          variant="primary"
          icon="save"
          loading={isBusy}
          disabled={isBusy || archived}
          onClick={() => void save()}
        >
          {isBusy ? '保存中' : '保存'}
        </Button>
      }
      backHref={backHref}
      editorKind="markdown"
      isBusy={isBusy}
      isDirty={isDirty}
      onSave={() => save()}
      sessionId={editorSessionId}
      title={draft.title.trim() ? `编写 ${draft.title}` : '运营消息编辑器'}
      workspace
    >
      <AdminMarkdownEditorWorkspace
        disabled={isBusy || archived}
        draft={draft}
        record={record}
        onChange={updateDraft}
      />
    </VisualEditorShell>
  );
}
