'use client';

import {
  EditorToolbarOverflowMenu,
  type EditorToolbarOverflowItem,
} from './editor-toolbar-overflow';

/** 工具条里的单个图标操作；完整工具条与紧凑菜单共用同一套按钮语义。 */
export function EditorToolbarActionButton({ item }: Readonly<{ item: EditorToolbarOverflowItem }>) {
  return (
    <button
      aria-label={item.label}
      aria-pressed={item.active}
      className={item.active ? 'is-active' : ''}
      disabled={item.disabled}
      title={item.label}
      type="button"
      onClick={item.onClick}
    >
      <span className="material-symbols-outlined" aria-hidden="true">
        {item.icon}
      </span>
      {item.badgeIcon ? (
        <span className="editor-toolbar-action-badge material-symbols-outlined" aria-hidden="true">
          {item.badgeIcon}
        </span>
      ) : null}
    </button>
  );
}

/**
 * 紧凑模式下的非工具组：全部收进同一个更多菜单。
 * 只有一个操作时直接平铺，避免出现只有一项的菜单。
 */
export function EditorToolbarCompactActions({
  active,
  groups,
}: Readonly<{
  /** 当前模式项，入口图标与文案优先显示它。 */
  active?: EditorToolbarOverflowItem;
  groups: Array<{ id: string; items: EditorToolbarOverflowItem[] }>;
}>) {
  const visibleGroups = groups.filter((group) => group.items.length > 0);
  const allItems = visibleGroups.flatMap((group) => group.items);
  if (allItems.length <= 1) {
    return (
      <>
        {allItems.map((item) => (
          <EditorToolbarActionButton item={item} key={item.id} />
        ))}
      </>
    );
  }
  return (
    <EditorToolbarOverflowMenu
      groups={visibleGroups.map((group) => group.items)}
      triggerActive={active?.active}
      triggerIcon={active?.icon}
      triggerLabel={active?.label}
    />
  );
}
