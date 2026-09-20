import type { MetroWayfindingElement, MetroWayfindingLayout } from './metro-wayfinding';
import type {
  MetroWayfindingImportPreview,
  MetroWayfindingImportSource,
  MetroWayfindingImportWarning,
} from './metro-wayfinding-import';

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
  | { type: 'reverse' }
  | { type: 'replace'; layout: MetroWayfindingLayout };

export interface MetroWayfindingCompositionChangedPayload {
  editorId: string;
  action: MetroWayfindingCompositionAction;
}

export interface ExternalWayfindingProjectSelectedPayload {
  editorId: string;
  files: Array<{ name: string; size: number }>;
}

export interface ExternalWayfindingProjectParsedPayload {
  editorId: string;
  preview: MetroWayfindingImportPreview;
}

export interface ExternalWayfindingConversionWarningsRaisedPayload {
  editorId: string;
  source: MetroWayfindingImportSource;
  warnings: MetroWayfindingImportWarning[];
}

export interface MetroWayfindingProjectImportedPayload {
  editorId: string;
  preview: MetroWayfindingImportPreview;
}

export interface ExternalWayfindingImportFailedPayload {
  editorId: string;
  message: string;
}

export type MetroWayfindingImportLifecycleEvent =
  | {
      type: 'ExternalWayfindingProjectSelected';
      payload: ExternalWayfindingProjectSelectedPayload;
    }
  | {
      type: 'ExternalWayfindingProjectParsed';
      payload: ExternalWayfindingProjectParsedPayload;
    }
  | {
      type: 'ExternalWayfindingConversionWarningsRaised';
      payload: ExternalWayfindingConversionWarningsRaisedPayload;
    }
  | {
      type: 'MetroWayfindingProjectImported';
      payload: MetroWayfindingProjectImportedPayload;
    }
  | {
      type: 'ExternalWayfindingImportFailed';
      payload: ExternalWayfindingImportFailedPayload;
    };

export const metroWayfindingImportLifecycleEventName = 'yct:metro-wayfinding-import-lifecycle';

/**
 * 编辑器只读快照：用于把「插入建议」「宽度警告」等面板抽离到编辑器之外的宿主容器渲染。
 *
 * 为什么需要它：宽屏布局下这些面板要显示在页面右侧的预览面板下方，而预览面板是编辑器组件的
 * 兄弟节点，无法通过 props 拿到编辑器内部 state。这里沿用事件总线解耦——编辑器只负责广播快照，
 * 宿主只负责渲染，编辑器主代码无需感知宿主存在。
 */
export interface MetroWayfindingInspectorSnapshot {
  editorId: string;
  layout: MetroWayfindingLayout;
  /** 当前选中元素所在行（vertical 恒为 0）。 */
  rowIndex: number;
  selectedElementId: string;
  canvasWidth: number;
  canvasHeight: number;
  disabled: boolean;
  lineColorOptions: Array<{ value: string; label: string; aliases?: string[] }>;
}

export const metroWayfindingInspectorSnapshotEventName = 'yct:metro-wayfinding-inspector-snapshot';

/*
  按 editorId 留存最近一次快照。

  为什么需要：这个通道是一次性的 window 事件，而 Inspector 会在断点切换时**换宿主重挂载**
  （预览轨道 ↔ 编辑器内部）。重挂载后它重新订阅，但编辑器只在自身 state 变化时才广播，
  而「Inspector 换了位置」并不属于编辑器的 state 变化——于是 Inspector 会一直收不到快照，
  整块消失，直到用户下次编辑才重新出现（表现为「变换布局时面板消失」而不是就地更新）。

  留存最近一份快照并在订阅时立即补发，重挂载后即可当场恢复。
  顺带也消除了挂载顺序的敏感性：首次加载时编辑器可能先广播完、Inspector 才开始订阅。
*/
const latestInspectorSnapshots = new Map<string, MetroWayfindingInspectorSnapshot>();

export function publishMetroWayfindingInspectorSnapshot(
  snapshot: MetroWayfindingInspectorSnapshot,
): void {
  latestInspectorSnapshots.set(snapshot.editorId, snapshot);
  window.dispatchEvent(
    new CustomEvent<MetroWayfindingInspectorSnapshot>(metroWayfindingInspectorSnapshotEventName, {
      detail: snapshot,
    }),
  );
}

export function subscribeMetroWayfindingInspectorSnapshot(
  editorId: string,
  listener: (snapshot: MetroWayfindingInspectorSnapshot) => void,
): () => void {
  const handleEvent = (event: Event) => {
    const detail = (event as CustomEvent<MetroWayfindingInspectorSnapshot>).detail;
    if (detail?.editorId === editorId) {
      listener(detail);
    }
  };
  // 补发：让晚于广播才订阅的一方（重挂载 / 挂载顺序靠后）也能拿到当前快照。
  const latest = latestInspectorSnapshots.get(editorId);
  if (latest) listener(latest);
  window.addEventListener(metroWayfindingInspectorSnapshotEventName, handleEvent);
  return () => window.removeEventListener(metroWayfindingInspectorSnapshotEventName, handleEvent);
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

export function publishMetroWayfindingImportLifecycleEvent(
  event: MetroWayfindingImportLifecycleEvent,
): void {
  window.dispatchEvent(
    new CustomEvent<MetroWayfindingImportLifecycleEvent>(metroWayfindingImportLifecycleEventName, {
      detail: event,
    }),
  );
}

export function subscribeMetroWayfindingImportLifecycleEvents(
  editorId: string,
  listener: (event: MetroWayfindingImportLifecycleEvent) => void,
): () => void {
  const handleEvent = (event: Event) => {
    const detail = (event as CustomEvent<MetroWayfindingImportLifecycleEvent>).detail;
    if (detail?.payload.editorId === editorId) {
      listener(detail);
    }
  };
  window.addEventListener(metroWayfindingImportLifecycleEventName, handleEvent);
  return () => window.removeEventListener(metroWayfindingImportLifecycleEventName, handleEvent);
}
