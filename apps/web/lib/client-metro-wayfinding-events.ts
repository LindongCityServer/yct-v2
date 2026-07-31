import type { MetroWayfindingElement, MetroWayfindingLayout } from './metro-wayfinding';

export const metroWayfindingCompositionChangedEventName =
  'yct:metro-wayfinding-composition-changed';

export type MetroWayfindingElementAction =
  | { type: 'add'; element: MetroWayfindingElement }
  | {
      type: 'duplicate';
      elementId: string;
      element: MetroWayfindingElement;
    }
  | { type: 'update'; elementId: string; patch: Partial<MetroWayfindingElement> }
  | {
      type: 'changeType';
      elementId: string;
      elementType: MetroWayfindingElement['type'];
    }
  | { type: 'remove'; elementId: string }
  | { type: 'move'; elementId: string; direction: 'up' | 'down' }
  | {
      type: 'reorder';
      elementId: string;
      targetElementId: string;
      placement: 'before' | 'after';
    };

export type MetroWayfindingCompositionAction =
  | (MetroWayfindingElementAction & { rowIndex: number })
  | { type: 'replace'; layout: MetroWayfindingLayout };

export interface MetroWayfindingCompositionChangedPayload {
  editorId: string;
  action: MetroWayfindingCompositionAction;
}

export function dispatchMetroWayfindingCompositionAction(
  payload: MetroWayfindingCompositionChangedPayload,
): void {
  window.dispatchEvent(
    new CustomEvent<MetroWayfindingCompositionChangedPayload>(
      metroWayfindingCompositionChangedEventName,
      { detail: payload },
    ),
  );
}

export function subscribeMetroWayfindingCompositionActions(
  editorId: string,
  listener: (action: MetroWayfindingCompositionAction) => void,
): () => void {
  const handleEvent = (event: Event) => {
    const detail = (event as CustomEvent<MetroWayfindingCompositionChangedPayload>).detail;
    if (detail?.editorId === editorId) {
      listener(detail.action);
    }
  };
  window.addEventListener(metroWayfindingCompositionChangedEventName, handleEvent);
  return () => window.removeEventListener(metroWayfindingCompositionChangedEventName, handleEvent);
}
