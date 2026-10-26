/**
 * 侧边操作栏偏好：开关与左右位置。
 *
 * 与主题 / 材质等偏好一致，只保存在本机 localStorage；
 * 变更通过自定义事件广播，任何已挂载的壳层都能即时响应，不需要刷新。
 */

export type MobileActionRailSide = 'left' | 'right';

export interface MobileActionRailPreference {
  enabled: boolean;
  side: MobileActionRailSide;
}

export const mobileActionRailStorageKeys = {
  enabled: 'yct.mobileActionRail.enabled',
  side: 'yct.mobileActionRail.side',
} as const;

export const mobileActionRailChangedEventName = 'yct:mobile-action-rail-changed';

/** 与现有移动端布局断点保持一致，避免出现两套“移动端”定义。 */
export const mobileActionRailMediaQuery = '(max-width: 760px)';

const defaultMobileActionRailPreference: MobileActionRailPreference = {
  enabled: false,
  side: 'right',
};

export function readMobileActionRailPreference(): MobileActionRailPreference {
  if (typeof window === 'undefined') {
    return defaultMobileActionRailPreference;
  }

  const enabled = window.localStorage.getItem(mobileActionRailStorageKeys.enabled);
  const side = window.localStorage.getItem(mobileActionRailStorageKeys.side);
  return {
    enabled: enabled === 'true',
    side: side === 'left' ? 'left' : 'right',
  };
}

export function applyMobileActionRailPreference(preference: MobileActionRailPreference) {
  if (typeof document === 'undefined') {
    return;
  }

  const root = document.documentElement;
  root.dataset.mobileActionRail = preference.enabled ? 'on' : 'off';
  root.dataset.mobileActionRailSide = preference.side;
}

export function writeMobileActionRailPreference(
  patch: Partial<MobileActionRailPreference>,
): MobileActionRailPreference {
  const next = { ...readMobileActionRailPreference(), ...patch };
  window.localStorage.setItem(mobileActionRailStorageKeys.enabled, String(next.enabled));
  window.localStorage.setItem(mobileActionRailStorageKeys.side, next.side);
  applyMobileActionRailPreference(next);
  publishMobileActionRailChanged(next);
  return next;
}

export function publishMobileActionRailChanged(preference: MobileActionRailPreference) {
  window.dispatchEvent(
    new CustomEvent<MobileActionRailPreference>(mobileActionRailChangedEventName, {
      detail: preference,
    }),
  );
}

export function subscribeMobileActionRailChanged(
  listener: (preference: MobileActionRailPreference) => void,
): () => void {
  const handleChange = (event: Event) => {
    const preference =
      event instanceof CustomEvent
        ? (event.detail as MobileActionRailPreference | undefined)
        : undefined;
    listener(preference ?? readMobileActionRailPreference());
  };

  window.addEventListener(mobileActionRailChangedEventName, handleChange);
  return () => window.removeEventListener(mobileActionRailChangedEventName, handleChange);
}
