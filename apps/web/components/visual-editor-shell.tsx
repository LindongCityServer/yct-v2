'use client';

import { requestConfirmation } from '../lib/client-dialog-events';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { appPath } from '../lib/app-paths';
import { subscribeEditorDraftChanged, type VisualEditorKind } from '../lib/client-editor-events';
import { SecondaryPageHeader } from './app-shell';
import { MobileActionRailProvider, useMobileActionRail } from './mobile-action-rail';

interface VisualEditorShellProps {
  actions?: ReactNode;
  backLabel?: string;
  backHref: string;
  children: ReactNode;
  editorKind: VisualEditorKind;
  /** 标题栏中的附加工具，例如宽屏下的编辑器工具栏。 */
  headerTools?: ReactNode;
  isBusy?: boolean;
  isDirty?: boolean;
  onBack?: () => void;
  onSave?: () => void | boolean | Promise<void | boolean>;
  sessionId: string;
  title: string;
  workspace?: boolean;
}

/**
 * 工作台外壳。移动端开启侧边操作栏时，返回与保存会登记到侧栏里，
 * 页面标题栏只保留标题。
 */
export function VisualEditorShell(props: Readonly<VisualEditorShellProps>) {
  const outerRail = useMobileActionRail();
  const { editorKind, isBusy = false, workspace = false } = props;
  return (
    <main
      className={`visual-editor-page is-${editorKind}-editor${workspace ? ' is-workspace' : ''}`}
      aria-busy={isBusy}
    >
      {outerRail ? (
        <VisualEditorShellContent {...props} />
      ) : (
        // 操作栏 Provider 必须放在 main 内部，才能与工作台处于同一层叠上下文。
        <MobileActionRailProvider>
          <VisualEditorShellContent {...props} />
        </MobileActionRailProvider>
      )}
    </main>
  );
}

function VisualEditorShellContent({
  actions,
  backLabel = '返回',
  backHref,
  children,
  headerTools,
  isBusy = false,
  isDirty = false,
  onBack,
  onSave,
  sessionId,
  title,
}: Readonly<VisualEditorShellProps>) {
  const [eventDirty, setEventDirty] = useState(false);
  const approvedNavigationRef = useRef(false);
  const pendingNavigationRef = useRef(false);
  const dirty = isDirty || eventDirty;
  const rail = useMobileActionRail();
  const railEnabled = rail?.enabled ?? false;

  useEffect(
    () =>
      subscribeEditorDraftChanged(sessionId, ({ dirty: nextDirty }) => {
        setEventDirty(nextDirty);
      }),
    [sessionId],
  );

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty || approvedNavigationRef.current) {
        return;
      }
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [dirty]);

  // 站内链接同样属于“离开工作台”，在捕获阶段拦截，避免 Next Link 先完成跳转。
  useEffect(() => {
    if (!dirty) {
      pendingNavigationRef.current = false;
      return undefined;
    }
    const handleDocumentClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        approvedNavigationRef.current
      ) {
        return;
      }
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      const anchor = target.closest<HTMLAnchorElement>('a[href]');
      if (!anchor || anchor.hasAttribute('download')) {
        return;
      }
      if (anchor.target && anchor.target !== '_self') {
        return;
      }
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) {
        return;
      }
      // 同页锚点或查询参数不变时不打断。
      if (url.pathname === window.location.pathname && url.search === window.location.search) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (pendingNavigationRef.current) {
        return;
      }
      pendingNavigationRef.current = true;
      void (async () => {
        const confirmed = await requestConfirmation('当前编辑尚未保存，确定离开吗？');
        pendingNavigationRef.current = false;
        if (!confirmed) {
          return;
        }
        approvedNavigationRef.current = true;
        window.location.assign(url.href);
      })();
    };
    document.addEventListener('click', handleDocumentClick, true);
    return () => document.removeEventListener('click', handleDocumentClick, true);
  }, [dirty]);

  useEffect(() => {
    if (!onSave) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) {
        return;
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        if (isBusy) {
          return;
        }
        void (async () => {
          const saved = await onSave();
          // 只有保存明确失败（返回 false）时才留在当前页，避免误丢草稿。
          if (saved === false) {
            return;
          }
          if (onBack) {
            onBack();
            return;
          }
          approvedNavigationRef.current = true;
          window.location.assign(appPath(backHref));
        })();
        return;
      }

      if (event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (!isBusy) onSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [backHref, isBusy, onBack, onSave]);

  const requestBack = async () => {
    if (onBack) {
      onBack();
      return;
    }
    if (dirty && !(await requestConfirmation('当前编辑尚未保存，确定离开吗？'))) {
      return;
    }
    approvedNavigationRef.current = true;
    window.location.assign(appPath(backHref));
  };

  // 侧栏条目通过 ref 取最新回调，避免每次渲染都重新登记造成循环。
  const backRef = useRef(requestBack);
  const saveRef = useRef(onSave);
  useEffect(() => {
    backRef.current = requestBack;
    saveRef.current = onSave;
  });

  useEffect(() => {
    if (!rail?.enabled) {
      return undefined;
    }
    rail.registerItems('visual-editor-shell', [
      {
        id: 'editor-rail-back',
        label: backLabel,
        icon: 'arrow_back',
        group: 'back',
        onClick: () => void backRef.current(),
      },
      ...(onSave
        ? [
            {
              id: 'editor-rail-save',
              label: isBusy ? '保存中' : '保存',
              icon: 'save',
              group: 'bottom' as const,
              busy: isBusy,
              emphasis: true,
              onClick: () => void saveRef.current?.(),
            },
          ]
        : []),
    ]);
    return () => rail.registerItems('visual-editor-shell', []);
  }, [rail, backLabel, isBusy, onSave]);

  return (
    <>
      <SecondaryPageHeader
        backHref={backHref}
        backLabel={backLabel}
        centerContent={headerTools}
        hideBack={railEnabled}
        onBack={requestBack}
        secondaryActions={
          railEnabled && onSave
            ? null
            : (actions ??
              (onSave ? (
                <button
                  className="secondary-action-button is-primary"
                  type="button"
                  aria-busy={isBusy}
                  disabled={isBusy}
                  onClick={onSave}
                >
                  <span
                    className={`material-symbols-outlined${isBusy ? ' busy-state-indicator' : ''}`}
                    aria-hidden="true"
                  >
                    {isBusy ? 'progress_activity' : 'save'}
                  </span>
                  <span>{isBusy ? '保存中' : '保存'}</span>
                </button>
              ) : null))
        }
        title={title}
      />
      <div className="visual-editor-page-body">{children}</div>
    </>
  );
}
