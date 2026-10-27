'use client';

import { usePathname } from 'next/navigation';
import { appPath } from '../lib/app-paths';
import { GlobalSearchPanel } from './global-search-panel';

/**
 * 全局搜索/问一问浮层入口。
 * 独立页面 /ask 自己渲染完整面板，这里跳过挂载，避免两个实例同时写本地对话。
 */
export function GlobalSearchHost() {
  const pathname = usePathname();
  if (pathname === '/ask' || pathname === appPath('/ask')) {
    return null;
  }

  return <GlobalSearchPanel />;
}
