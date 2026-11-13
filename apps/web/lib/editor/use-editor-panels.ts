'use client';

import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';

export interface EditorPanelsState {
  /** 图层面板与属性检查器的总开关。 */
  panelsVisible: boolean;
  /** 窄屏/中屏在未选中对象时，手动把属性检查器（全局属性）置顶显示。 */
  inspectorPinned: boolean;
  /** 直接拼进工作台根节点的状态类名。 */
  panelStateClass: string;
  setPanelsVisible: Dispatch<SetStateAction<boolean>>;
  togglePanels: () => void;
  openInspector: () => void;
  closeInspector: () => void;
}

/**
 * 编辑器面板的公共状态机：面板总开关 + 全局属性抽屉。
 * 三个可视化工作台共用，避免各自维护一份 panelsVisible / inspectorPinned。
 */
export function useEditorPanels(initialVisible = true): EditorPanelsState {
  const [panelsVisible, setPanelsVisibleState] = useState(initialVisible);
  const [inspectorPinned, setInspectorPinned] = useState(false);

  const setPanelsVisible = useCallback<Dispatch<SetStateAction<boolean>>>((next) => {
    setPanelsVisibleState(next);
    // 切换面板总开关后回到默认层级：选中对象显示属性，未选中显示图层。
    setInspectorPinned(false);
  }, []);

  const togglePanels = useCallback(
    () => setPanelsVisible((current) => !current),
    [setPanelsVisible],
  );

  const openInspector = useCallback(() => setInspectorPinned(true), []);
  const closeInspector = useCallback(() => setInspectorPinned(false), []);

  const panelStateClass = `${panelsVisible ? '' : ' is-panels-hidden'}${
    inspectorPinned ? ' is-inspector-open' : ''
  }`;

  return {
    panelsVisible,
    inspectorPinned,
    panelStateClass,
    setPanelsVisible,
    togglePanels,
    openInspector,
    closeInspector,
  };
}
