'use client';

/**
 * 窄屏/中屏的「全局属性」入口：未选中对象时也能打开属性检查器。
 * 宽屏由 CSS 隐藏，右侧检查器始终可见。
 */
export function EditorInspectorEntry({ onOpen }: Readonly<{ onOpen: () => void }>) {
  return (
    <button
      aria-label="打开全局属性"
      className="editor-inspector-entry"
      title="全局属性"
      type="button"
      onClick={onOpen}
    >
      <span className="material-symbols-outlined" aria-hidden="true">
        tune
      </span>
    </button>
  );
}
