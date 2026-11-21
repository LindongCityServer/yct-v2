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

  // 与标题栏工具条共用 `.editor-toolbar` / `.editor-toolbar-group` /
  // `.editor-toolbar-button` 三件套：尺寸、悬停、选中态一致；透光材质模式下
  // 分组胶囊会自动被 `LiquidMaterialBridge` 登记成一块液态表面，非透光模式
  // 则由通用规则保持透明。这里不再使用单独的圆形 IconButton。
  return createPortal(
    <div className="editor-toolbar is-in-header editor-header-panel-toggle-toolbar">
      <div className="editor-toolbar-group">
        <div className="editor-toolbar-actions">
          <button
            aria-expanded={panels.visible}
            aria-label={label}
            aria-pressed={panels.visible}
            className={`editor-toolbar-button editor-header-panel-toggle${
              panels.visible ? ' is-active' : ''
            }`}
            title={label}
            type="button"
            onClick={panels.onToggle}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              view_sidebar
            </span>
          </button>
        </div>
      </div>
    </div>,
    slot,
  );
}
