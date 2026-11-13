'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * 把工作台内的 modal 投送到 body。
 *
 * 属性面板与图层树可能带 backdrop-filter / transform，固定定位的 modal-backdrop
 * 会被最近的可视化容器当作包含块，结果只覆盖面板而不是整个窗口。
 * 所有渲染在面板里的弹窗统一通过这个 Portal 挂到 body。
 */
export function EditorDialogPortal({ children }: Readonly<{ children: ReactNode }>) {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setHost(document.body);
  }, []);

  return host ? createPortal(children, host) : null;
}
