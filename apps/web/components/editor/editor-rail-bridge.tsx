'use client';

import type { EditorTool } from '../../lib/editor/types';
import { useEditorRailItems, type EditorRailSection } from '../../lib/editor/use-editor-rail-items';
import { useMobileActionRail, type MobileActionRailItem } from '../mobile-action-rail';

/**
 * 侧边操作栏桥接：必须挂在外壳 Provider 内部才能读到 rail 上下文。
 * 工具与操作分组都由工具栏的 actionItems / tools 派生，三个工作台不再各写一份条目。
 */
export function EditorRailBridge({
  activeToolId,
  bottom,
  ownerId,
  panels,
  sections,
  tools,
  onToolChange,
}: Readonly<{
  activeToolId: string;
  /** 面板开关之外的底部全局操作，接在面板开关之后。 */
  bottom?: MobileActionRailItem[];
  ownerId: string;
  panels: { visible: boolean; onToggle: () => void };
  sections: EditorRailSection[];
  tools: EditorTool[];
  onToolChange: (toolId: string) => void;
}>) {
  const rail = useMobileActionRail();
  useEditorRailItems({
    ownerId,
    enabled: rail?.enabled ?? false,
    registerItems: rail?.registerItems,
    sections,
    tools: tools.map((tool) => ({
      id: tool.id,
      icon: tool.icon,
      label: tool.label,
      disabled: tool.disabled,
      active: tool.id === activeToolId,
      onClick: () => onToolChange(tool.id),
    })),
    bottom: [
      {
        id: `${ownerId}-rail-panels`,
        label: panels.visible ? '隐藏全部面板' : '显示全部面板',
        icon: 'view_sidebar',
        group: 'bottom',
        priority: 90,
        active: panels.visible,
        onClick: panels.onToggle,
      },
      ...(bottom ?? []),
    ],
  });
  return null;
}
