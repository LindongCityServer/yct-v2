export interface LoginRequiredPayload {
  message?: string;
  durationMs?: number;
}

export const loginRequiredNoticeDurationMs = 2400;

const loginRequiredEventName = 'yct:auth-login-required';

export function publishLoginRequired(payload: LoginRequiredPayload = {}): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<LoginRequiredPayload>(loginRequiredEventName, {
      detail: payload,
    }),
  );
}

export function publishLoginRequiredForResponse(
  response: Response,
  payload: LoginRequiredPayload = {},
): boolean {
  if (response.status !== 401) {
    return false;
  }

  publishLoginRequired(payload);
  return true;
}

export function subscribeLoginRequired(
  listener: (payload: LoginRequiredPayload) => void,
): () => void {
  const handleEvent = (event: Event) => {
    listener((event as CustomEvent<LoginRequiredPayload>).detail ?? {});
  };

  window.addEventListener(loginRequiredEventName, handleEvent);
  return () => window.removeEventListener(loginRequiredEventName, handleEvent);
}

export function getDefaultLoginRequiredMessage(): string {
  const locale = document.documentElement.lang.trim().toLowerCase();
  if (locale === 'zh-hant' || locale.startsWith('zh-tw') || locale.startsWith('zh-hk')) {
    return '需要先使用臨東通登入。';
  }
  if (locale.startsWith('en')) {
    return 'Sign in with LDPASS to continue.';
  }
  return '需要先使用临东通登录。';
}
