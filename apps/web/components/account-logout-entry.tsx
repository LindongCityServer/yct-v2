'use client';

import { useEffect, useState } from 'react';
import { appPath } from '../lib/app-paths';
import {
  detectEmbeddedContext,
  subscribeEmbeddedContextChanged,
} from '../lib/client-embedded-context';

interface AccountLogoutEntryProps {
  className: string;
  label: string;
}

/**
 * 「退出登录」入口。
 *
 * 普通网页端保持 `<a href>` 直链；嵌入模式下必须改为同站 fetch：
 * iframe 内导航不是顶层导航，`SameSite=Lax` 的会话 Cookie 不会发送，
 * 服务端就拿不到 sessionId，`deleteYctServerSession` 会静默失败，
 * 结果是「用户以为已登出、服务端会话其实还活着」。
 */
export function AccountLogoutEntry({ className, label }: Readonly<AccountLogoutEntryProps>) {
  const [embedded, setEmbedded] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const syncEmbedded = () => setEmbedded(detectEmbeddedContext().embedded);
    syncEmbedded();
    return subscribeEmbeddedContextChanged(syncEmbedded);
  }, []);

  if (!embedded) {
    return (
      <a className={className} href={appPath('/api/auth/logout')}>
        <span className="material-symbols-outlined" aria-hidden="true">
          logout
        </span>
        <span>{label}</span>
      </a>
    );
  }

  return (
    <button
      className={className}
      type="button"
      disabled={pending}
      onClick={() => {
        setPending(true);
        void fetch(appPath('/api/auth/logout'), {
          method: 'GET',
          credentials: 'same-origin',
          cache: 'no-store',
        })
          .catch(() => undefined)
          .then(() => window.location.reload());
      }}
    >
      <span className="material-symbols-outlined" aria-hidden="true">
        logout
      </span>
      <span>{label}</span>
    </button>
  );
}
