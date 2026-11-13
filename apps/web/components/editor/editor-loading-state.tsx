'use client';

import Link from 'next/link';

/**
 * 工作台的数据加载 / 读取失败占位页：图标 + 状态 + 可选错误 + 返回后台入口。
 * 三个可视化工作台共用同一套骨架，避免返回链接在此处整页跳转而别处走客户端路由。
 */
export function EditorLoadingState({
  backHref,
  backLabel,
  error,
  icon,
  status,
}: Readonly<{
  backHref: string;
  backLabel: string;
  error?: string;
  icon: string;
  status: string;
}>) {
  return (
    <main className="transit-visual-editor is-loading">
      <span className="material-symbols-outlined" aria-hidden="true">
        {icon}
      </span>
      <p>{status}</p>
      {error ? <p className="muted admin-poi-dialog-error">{error}</p> : null}
      <Link href={backHref}>{backLabel}</Link>
    </main>
  );
}
