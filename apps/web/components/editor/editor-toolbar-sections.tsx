'use client';

import type { EditorTool } from '../../lib/editor/types';
import type { EditorToolbarSection } from './editor-toolbar';
import { EditorToolbarCompactActions } from './editor-toolbar-actions';
import type { EditorToolbarOverflowItem } from './editor-toolbar-overflow';

export interface EditorToolbarGroup {
  id: string;
  ariaLabel: string;
  items: EditorToolbarOverflowItem[];
}

/**
 * 工具栏分组的统一装配：宽屏把每个分组平铺成独立胶囊，窄屏只保留「工具 + 更多」。
 * 三个工作台共用同一套映射，避免新增分组时两种布局各漏一处。
 * 紧凑模式的折叠图标自动取第一个选中项，与各工作台原先手写的行为一致。
 */
export function buildEditorToolbarSections({
  compactAriaLabel,
  groups,
  tools,
  toolsAriaLabel,
  variant,
}: Readonly<{
  compactAriaLabel: string;
  groups: EditorToolbarGroup[];
  tools: EditorTool[];
  toolsAriaLabel: string;
  variant: 'full' | 'compact';
}>): EditorToolbarSection[] {
  const toolSection: EditorToolbarSection = { id: 'tools', ariaLabel: toolsAriaLabel, tools };
  if (variant === 'full') {
    return [
      toolSection,
      ...groups.map((group) => ({
        id: group.id,
        ariaLabel: group.ariaLabel,
        // 交给工具条按单个按钮做溢出收纳，放不下时从后往前收进「更多」。
        items: group.items,
      })),
    ];
  }

  const activeItem = groups.flatMap((group) => group.items).find((item) => item.active);
  return [
    toolSection,
    {
      id: 'operations',
      ariaLabel: compactAriaLabel,
      actions: (
        <EditorToolbarCompactActions
          active={activeItem}
          groups={groups.map((group) => ({ id: group.id, items: group.items }))}
        />
      ),
    },
  ];
}
