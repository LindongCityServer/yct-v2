'use client';

import type { ReactNode } from 'react';

/**
 * 图层面板与属性检查器共用的一行标题栏：标题 + 副标题 + 中间槽位 + 尾部操作。
 * 中间槽位承载方向 / 预览分段，尾部放属性入口或「返回图层」按钮。
 */
export function EditorPanelHeading({
  children,
  meta,
  title,
  toolbar,
  withInspectorEntry = false,
}: Readonly<{
  /** 尾部操作。 */
  children?: ReactNode;
  meta?: ReactNode;
  title: ReactNode;
  toolbar?: ReactNode;
  /** 预留属性入口间距的修饰类。 */
  withInspectorEntry?: boolean;
}>) {
  return (
    <div className={`poi-visual-panel-heading${withInspectorEntry ? ' has-inspector-entry' : ''}`}>
      <div>
        <strong>{title}</strong>
        {meta !== undefined ? <span>{meta}</span> : null}
      </div>
      {toolbar}
      {children}
    </div>
  );
}
