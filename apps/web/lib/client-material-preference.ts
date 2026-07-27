export type MaterialMode = 'performance' | 'balanced' | 'advanced';

export interface MaterialPreference {
  mode: MaterialMode;
  thickness: number;
}

interface StoredMaterialPreference {
  mode?: unknown;
  thickness?: unknown;
  translucency?: unknown;
}

export interface MaterialPreferenceChangedPayload {
  preference: MaterialPreference;
  source: 'local' | 'storage';
}

export const materialPreferenceChangedEventName = 'yct:material-preference-changed';
export const materialPreferenceStorageKey = 'yct.materialPreference.v1';

export const defaultMaterialPreference: MaterialPreference = {
  mode: 'balanced',
  thickness: 50,
};

export function readMaterialPreference(): MaterialPreference {
  if (typeof window === 'undefined') {
    return defaultMaterialPreference;
  }

  const source = window.localStorage.getItem(materialPreferenceStorageKey);
  if (!source) {
    return defaultMaterialPreference;
  }

  try {
    return normalizeMaterialPreference(JSON.parse(source) as StoredMaterialPreference);
  } catch {
    return defaultMaterialPreference;
  }
}

export function updateMaterialPreference(preference: MaterialPreference): MaterialPreference {
  const normalized = normalizeMaterialPreference(preference);
  window.localStorage.setItem(materialPreferenceStorageKey, JSON.stringify(normalized));
  publishMaterialPreferenceChanged({
    preference: normalized,
    source: 'local',
  });
  return normalized;
}

export function publishMaterialPreferenceChanged(payload: MaterialPreferenceChangedPayload): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<MaterialPreferenceChangedPayload>(materialPreferenceChangedEventName, {
      detail: payload,
    }),
  );
}

export function subscribeMaterialPreferenceChanged(
  listener: (payload: MaterialPreferenceChangedPayload) => void,
): () => void {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  const handlePreferenceChanged = (event: Event) => {
    listener((event as CustomEvent<MaterialPreferenceChangedPayload>).detail);
  };
  window.addEventListener(materialPreferenceChangedEventName, handlePreferenceChanged);
  return () =>
    window.removeEventListener(materialPreferenceChangedEventName, handlePreferenceChanged);
}

function normalizeMaterialPreference(preference: StoredMaterialPreference): MaterialPreference {
  const mode = isMaterialMode(preference.mode) ? preference.mode : defaultMaterialPreference.mode;
  const storedThickness = preference.thickness ?? preference.translucency;
  const thickness =
    typeof storedThickness === 'number' && Number.isFinite(storedThickness)
      ? Math.min(100, Math.max(0, Math.round(storedThickness)))
      : defaultMaterialPreference.thickness;

  return { mode, thickness };
}

function isMaterialMode(value: unknown): value is MaterialMode {
  return value === 'performance' || value === 'balanced' || value === 'advanced';
}
