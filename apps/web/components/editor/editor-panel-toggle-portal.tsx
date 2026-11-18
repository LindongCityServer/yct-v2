'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/** 由 SecondaryPageHeader 渲染的“返回按钮与标题之间”插槽。 */
export const editorHeaderPanelSlotAttribute = 'data-editor-header-panel-slot';

export function EditorPanelTogglePortal({
  panels,
}: Readonly<{
  panels: { visible: boolean; onToggle: () => void; label?: string };
}>) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setSlot(document.querySelector<HTMLElement>(`[${editorHeaderPanelSlotAttribute}]`));
    setMounted(true);
  }, []);

  if (!mounted || !slot) {
    return null;
  }

  const label = panels.label ?? (panels.visible ? '隐藏全部面板' : '显示全部面板');

  return createPortal(
    <button
      aria-expanded={panels.visible}
      aria-label={label}
      className={`icon-button editor-header-panel-toggle${panels.visible ? ' is-active' : ''}`}
      onClick={panels.onToggle}
      title={label}
      type="button"
    >
      <span className="material-symbols-outlined" aria-hidden="true">
        view_sidebar
      </span>
    </button>,
    slot,
  );
}
