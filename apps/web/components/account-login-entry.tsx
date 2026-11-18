'use client';

import { useEffect, useState } from 'react';
import { appPath } from '../lib/app-paths';
import { openEmbeddedLoginPopup } from '../lib/client-embedded-auth';
import { Button, ButtonLink } from './ui/button';
import {
  detectEmbeddedContext,
  subscribeEmbeddedContextChanged,
} from '../lib/client-embedded-context';

interface AccountLoginEntryProps {
  ldpassConfigured: boolean;
  variant?: 'secondary' | 'primary';
  label: string;
}

/**
 * 「使用临东通登录」入口。
 *
 * 普通网页端保持 `<a href>` 直链；嵌入模式（被网页桌面容器以 iframe 嵌入）下改为按钮，
 * 因为它必须走顶层弹窗——iframe 内导航不是顶层导航，
 * `SameSite=Lax` 的 state Cookie 不会发送，直链必然以 state_invalid 收场。
 */
export function AccountLoginEntry({
  ldpassConfigured,
  variant = 'secondary',
  label,
}: Readonly<AccountLoginEntryProps>) {
  const [embedded, setEmbedded] = useState(false);

  useEffect(() => {
    const syncEmbedded = () => setEmbedded(detectEmbeddedContext().embedded);
    syncEmbedded();
    return subscribeEmbeddedContextChanged(syncEmbedded);
  }, []);

  if (embedded && ldpassConfigured) {
    return (
      <Button
        variant={variant}
        icon="login"
        onClick={() => {
          // 保持同步调用，确保弹窗不被拦截器拦掉。
          openEmbeddedLoginPopup();
        }}
      >
        {label}
      </Button>
    );
  }

  return (
    <ButtonLink
      variant={variant}
      href={ldpassConfigured ? appPath('/api/auth/ldpass/start') : undefined}
      aria-disabled={!ldpassConfigured}
      icon="login"
    >
      {label}
    </ButtonLink>
  );
}
