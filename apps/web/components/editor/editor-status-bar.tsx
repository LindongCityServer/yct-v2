'use client';

import type { ReactNode } from 'react';

/** 编辑器底部状态栏：统一承载工具、坐标、选中数与保存状态。 */
export function EditorStatusBar({
  className,
  left,
  right,
}: Readonly<{
  className?: string;
  left: ReactNode;
  right?: ReactNode;
}>) {
  return (
    <div className={`editor-status-bar${className ? ` ${className}` : ''}`} role="status">
      <span className="editor-status-bar-left">{left}</span>
      {right ? <span className="editor-status-bar-right">{right}</span> : null}
    </div>
  );
}
