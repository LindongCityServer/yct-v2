export const assistantEntryPreferenceChangedEventName = 'yct:assistant-entry-preference-changed';

export interface AssistantEntryPreference {
  /** 总开关：关闭后不再渲染入口、不响应快捷键、也不请求问一问。 */
  enabled: boolean;
  /** 是否在所有页面（含二级页面）显示入口。 */
  allPages: boolean;
  /** 是否允许用模型按当前页面内容生成推荐项。 */
  aiSuggestions: boolean;
}

export const defaultAssistantEntryPreference: AssistantEntryPreference = {
  enabled: true,
  allPages: false,
  aiSuggestions: false,
};

const storageKey = 'yct.assistant.entry-preference.v2';
const legacyStorageKey = 'yct.assistant.entry-all-pages.v1';

export function readAssistantEntryPreference(): AssistantEntryPreference {
  if (typeof window === 'undefined') {
    return defaultAssistantEntryPreference;
  }

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw) {
      return normalizePreference(JSON.parse(raw));
    }

    const legacyRaw = window.localStorage.getItem(legacyStorageKey);
    if (legacyRaw) {
      const legacy = JSON.parse(legacyRaw) as { allPages?: unknown };
      return {
        ...defaultAssistantEntryPreference,
        allPages: legacy.allPages === true,
      };
    }
  } catch {
    return defaultAssistantEntryPreference;
  }

  return defaultAssistantEntryPreference;
}

export function writeAssistantEntryPreference(preference: AssistantEntryPreference): void {
  if (typeof window === 'undefined') {
    return;
  }

  const normalized = normalizePreference(preference);
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(normalized));
    window.localStorage.removeItem(legacyStorageKey);
  } catch {
    // 隐私模式下写不进去时，至少让本次会话的界面保持一致。
  }
  window.dispatchEvent(
    new CustomEvent<AssistantEntryPreference>(assistantEntryPreferenceChangedEventName, {
      detail: normalized,
    }),
  );
}

export function subscribeAssistantEntryPreferenceChanged(
  listener: (preference: AssistantEntryPreference) => void,
): () => void {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  const handleEvent = (event: Event) => {
    listener(
      (event as CustomEvent<AssistantEntryPreference>).detail ?? readAssistantEntryPreference(),
    );
  };
  const handleStorage = (event: StorageEvent) => {
    if (event.key === storageKey || event.key === legacyStorageKey) {
      listener(readAssistantEntryPreference());
    }
  };

  window.addEventListener(assistantEntryPreferenceChangedEventName, handleEvent);
  window.addEventListener('storage', handleStorage);
  return () => {
    window.removeEventListener(assistantEntryPreferenceChangedEventName, handleEvent);
    window.removeEventListener('storage', handleStorage);
  };
}

function normalizePreference(value: unknown): AssistantEntryPreference {
  const candidate = (value ?? {}) as Partial<AssistantEntryPreference>;
  return {
    enabled: candidate.enabled !== false,
    allPages: candidate.allPages === true,
    aiSuggestions: candidate.aiSuggestions === true,
  };
}
