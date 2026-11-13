'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** 由 SecondaryPageHeader 渲染的标题栏中央插槽。 */
export const editorHeaderToolsSlotAttribute = 'data-editor-header-tools-slot';

/**
 * 把工作台工具栏投送到标题栏中央。
 * 适用于工具栏状态在子工作台内部、无法从外壳直接传入的场景。
 */
export function EditorHeaderToolsPortal({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setSlot(document.querySelector<HTMLElement>(`[${editorHeaderToolsSlotAttribute}]`));
  }, []);

  return slot ? createPortal(children, slot) : null;
}
