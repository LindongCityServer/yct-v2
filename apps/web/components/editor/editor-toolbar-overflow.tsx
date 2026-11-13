'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface EditorToolbarOverflowItem {
  /** 选中态；仅切换类操作需要。 */
  active?: boolean;
  /** 右下角叠加的小标记图标，例如「更多」省略号。 */
  badgeIcon?: string;
  disabled?: boolean;
  icon: string;
  id: string;
  label: string;
  onClick: () => void;
}

/**
 * 编辑器工具栏的溢出菜单：用图标按钮承载放不下的操作。
 * 菜单通过 Portal 挂到 body，绕开工具条的横向滚动裁剪，并限制在视口内。
 */
export function EditorToolbarOverflowMenu({
  groups,
  items,
  triggerActive,
  triggerIcon,
  triggerLabel,
}: Readonly<{
  /** 多个分组一起收折时按组渲染，组间自动加分割线。 */
  groups?: EditorToolbarOverflowItem[][];
  items?: EditorToolbarOverflowItem[];
  /** 折叠状态下用当前模式的图标与文案作为入口，避免只显示一个省略号。 */
  triggerActive?: boolean;
  triggerIcon?: string;
  triggerLabel?: string;
}>) {
  const resolvedGroups = groups && groups.length > 0 ? groups : [items ?? []];
  const totalItems = resolvedGroups.reduce((total, group) => total + group.length, 0);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (buttonRef.current?.contains(event.target as Node)) {
        return;
      }
      if (target?.closest('.editor-toolbar-overflow-menu')) {
        return;
      }
      setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    const handleViewportChange = () => setOpen(false);
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [open]);

  const toggle = () => {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const menuWidth = Math.min(230, window.innerWidth - 16);
      const estimatedHeight = Math.min(
        totalItems * 36 + (resolvedGroups.length - 1) * 9 + 12,
        window.innerHeight - 16,
      );
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - menuWidth - 8));
      let top = rect.bottom + 6;
      if (top + estimatedHeight > window.innerHeight - 8) {
        const aboveTop = rect.top - estimatedHeight - 6;
        top = aboveTop >= 8 ? aboveTop : Math.max(8, window.innerHeight - estimatedHeight - 8);
      }
      setPosition({ top, left });
    }
    setOpen((current) => !current);
  };

  return (
    <>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={triggerLabel ? `${triggerLabel}，更多操作` : '更多操作'}
        className={`editor-toolbar-overflow-trigger${triggerActive ? ' is-active' : ''}`}
        ref={buttonRef}
        title={triggerLabel ? `${triggerLabel}，更多操作` : '更多操作'}
        type="button"
        onClick={toggle}
      >
        <span className="material-symbols-outlined" aria-hidden="true">
          {triggerIcon ?? 'more_horiz'}
        </span>
        {/* 沿用当前模式图标时，右下角补一个更多标记，避免被误读成单一模式按钮。 */}
        {triggerIcon ? (
          <span
            className="material-symbols-outlined editor-toolbar-overflow-badge"
            aria-hidden="true"
          >
            more_horiz
          </span>
        ) : null}
      </button>
      {open && position
        ? createPortal(
            <div className="editor-toolbar-overflow-menu" role="menu" style={position}>
              {resolvedGroups.map((group, groupIndex) => (
                <Fragment key={group[0]?.id ?? `group-${groupIndex}`}>
                  {groupIndex > 0 ? (
                    <span
                      className="editor-toolbar-overflow-divider"
                      role="separator"
                      aria-hidden="true"
                    />
                  ) : null}
                  {group.map((item) => (
                    <button
                      aria-pressed={item.active}
                      className={item.active ? 'is-active' : ''}
                      disabled={item.disabled}
                      key={item.id}
                      role="menuitem"
                      type="button"
                      title={item.label}
                      onClick={() => {
                        if (item.disabled) {
                          return;
                        }
                        item.onClick();
                        setOpen(false);
                      }}
                    >
                      <span className="material-symbols-outlined" aria-hidden="true">
                        {item.icon}
                      </span>
                      <span>{item.label}</span>
                      {item.active ? (
                        <span
                          className="material-symbols-outlined editor-toolbar-overflow-check"
                          aria-hidden="true"
                        >
                          check
                        </span>
                      ) : null}
                    </button>
                  ))}
                </Fragment>
              ))}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
