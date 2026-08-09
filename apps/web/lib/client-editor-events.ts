export type VisualEditorKind = 'markdown' | 'poi';

export interface EditorDraftChangedPayload {
  dirty: boolean;
  editorKind: VisualEditorKind;
  sessionId: string;
}

const editorDraftChangedEventName = 'yct:editor-draft-changed';

export function publishEditorDraftChanged(payload: EditorDraftChangedPayload): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<EditorDraftChangedPayload>(editorDraftChangedEventName, {
      detail: payload,
    }),
  );
}

export function subscribeEditorDraftChanged(
  sessionId: string,
  listener: (payload: EditorDraftChangedPayload) => void,
): () => void {
  const handleEvent = (event: Event) => {
    const payload = (event as CustomEvent<EditorDraftChangedPayload>).detail;
    if (payload?.sessionId === sessionId) {
      listener(payload);
    }
  };

  window.addEventListener(editorDraftChangedEventName, handleEvent);
  return () => window.removeEventListener(editorDraftChangedEventName, handleEvent);
}
