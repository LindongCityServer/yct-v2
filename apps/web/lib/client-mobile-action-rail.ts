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
  /** 第一个分组距离安全区顶部的额外边距（px）。 */
  topOffset: number;
}

export const mobileActionRailStorageKeys = {
  enabled: 'yct.mobileActionRail.enabled',
  side: 'yct.mobileActionRail.side',
  topOffset: 'yct.mobileActionRail.topOffset',
} as const;

export const mobileActionRailTopOffsetMin = 0;
export const mobileActionRailTopOffsetMax = 240;

export const mobileActionRailChangedEventName = 'yct:mobile-action-rail-changed';

/** 与现有移动端布局断点保持一致，避免出现两套“移动端”定义。 */
export const mobileActionRailMediaQuery = '(max-width: 760px)';

const defaultMobileActionRailPreference: MobileActionRailPreference = {
  enabled: false,
  side: 'right',
  topOffset: 0,
};

export function readMobileActionRailPreference(): MobileActionRailPreference {
  if (typeof window === 'undefined') {
    return defaultMobileActionRailPreference;
  }

  const enabled = window.localStorage.getItem(mobileActionRailStorageKeys.enabled);
  const side = window.localStorage.getItem(mobileActionRailStorageKeys.side);
  const rawTopOffset = Number(window.localStorage.getItem(mobileActionRailStorageKeys.topOffset));
  return {
    enabled: enabled === 'true',
    side: side === 'left' ? 'left' : 'right',
    topOffset: Number.isFinite(rawTopOffset)
      ? Math.min(
          mobileActionRailTopOffsetMax,
          Math.max(mobileActionRailTopOffsetMin, Math.round(rawTopOffset)),
        )
      : defaultMobileActionRailPreference.topOffset,
  };
}

export function applyMobileActionRailPreference(preference: MobileActionRailPreference) {
  if (typeof document === 'undefined') {
    return;
  }

  const root = document.documentElement;
  root.dataset.mobileActionRail = preference.enabled ? 'on' : 'off';
  root.dataset.mobileActionRailSide = preference.side;
  root.style.setProperty('--yct-mobile-action-rail-top-offset', `${preference.topOffset}px`);
}

export function writeMobileActionRailPreference(
  patch: Partial<MobileActionRailPreference>,
): MobileActionRailPreference {
  const next = { ...readMobileActionRailPreference(), ...patch };
  window.localStorage.setItem(mobileActionRailStorageKeys.enabled, String(next.enabled));
  window.localStorage.setItem(mobileActionRailStorageKeys.side, next.side);
  window.localStorage.setItem(mobileActionRailStorageKeys.topOffset, String(next.topOffset));
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
