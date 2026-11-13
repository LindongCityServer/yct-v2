'use client';

import type { ReactNode } from 'react';

/**
 * 标题栏中央的工具条。
 * 统一使用完整分组，由工具条内部按单个按钮做溢出收纳，
 * 不再在每个断点把整组操作折叠进「更多」。
 */
export function EditorHeaderToolbar({
  full,
}: Readonly<{ compact: ReactNode; full: ReactNode }>) {
  return <div className="editor-header-tools">{full}</div>;
}
