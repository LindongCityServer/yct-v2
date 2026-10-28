'use client';

import { useRef, useState } from 'react';
import { appPath } from '../lib/app-paths';
import { buildPoiWorkspaceHref, type PoiWorkspace } from '../lib/poi-editor-navigation';

export function PoiWorkspaceLink({
  markerId,
  workspace,
  isDirty,
  isBusy,
  onSave,
  onOpen,
}: Readonly<{
  markerId: string;
  workspace: PoiWorkspace;
  isDirty: boolean;
  isBusy: boolean;
  onSave: () => Promise<boolean>;
  onOpen?: (workspace: PoiWorkspace, markerId: string) => void;
}>) {
  const [prompt, setPrompt] = useState(false);
  const isGeometry = workspace === 'geometry';
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const leavingRef = useRef(false);
  const pendingRef = useRef(false);
  const leave = () => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    if (onOpen) onOpen(workspace, markerId);
    else window.location.assign(appPath(buildPoiWorkspaceHref(workspace, markerId)));
  };
  return (
    <>
      <a
        className="secondary-action-button"
        href={appPath(buildPoiWorkspaceHref(workspace, markerId))}
        aria-disabled={isBusy || saving}
        onClick={(event) => {
          event.preventDefault();
          if (isBusy || saving) return;
          if (isDirty) setPrompt(true);
          else leave();
        }}
      >
        <span className="material-symbols-outlined" aria-hidden="true">
          {isGeometry ? 'edit_location_alt' : 'article'}
        </span>
        <span>打开{workspace === 'geometry' ? '几何' : '简介'}工作台</span>
      </a>
      {prompt ? (
        <div role="alert" aria-label="进入工作台前处理未保存修改">
          <p>当前资料尚未保存，请选择保存后进入、放弃修改进入或取消。</p>
          <div className="admin-actions">
            <button
              type="button"
              disabled={isBusy || saving}
              onClick={() => {
                if (pendingRef.current) return;
                pendingRef.current = true;
                setSaving(true);
                setError('');
                void onSave()
                  .then((saved) => {
                    if (saved) leave();
                  })
                  .catch(() => setError('保存失败，修改仍保留在当前表单，请重试。'))
                  .finally(() => {
                    pendingRef.current = false;
                    setSaving(false);
                  });
              }}
            >
              保存并进入
            </button>
            <button type="button" disabled={isBusy || saving} onClick={leave}>
              放弃修改进入
            </button>
            <button type="button" disabled={isBusy || saving} onClick={() => setPrompt(false)}>
              取消
            </button>
          </div>
          {error ? <p>{error}</p> : null}
        </div>
      ) : null}
    </>
  );
}
