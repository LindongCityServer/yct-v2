'use client';

import { useEffect, useRef } from 'react';
import type { EditorToolbarOverflowItem } from '../../components/editor/editor-toolbar-overflow';
import type { MobileActionRailItem } from '../../components/mobile-action-rail';

/** 侧栏里的一块胶囊：与工具栏分组一一对应。 */
export interface EditorRailSection {
  id: string;
  /** 收缩优先级：数字越小越先收进“更多”。 */
  priority?: number;
  items: EditorToolbarOverflowItem[];
}

export interface EditorRailTool {
  id: string;
  icon: string;
  label: string;
  disabled?: boolean;
  active: boolean;
  onClick: () => void;
}

export interface UseEditorRailItemsInput {
  ownerId: string;
  enabled: boolean;
  registerItems: ((ownerId: string, items: MobileActionRailItem[]) => void) | null | undefined;
  sections: EditorRailSection[];
  tools: EditorRailTool[];
  /** 追加到侧栏底部的全局操作，接在面板开关之后。 */
  bottom?: MobileActionRailItem[];
}

/**
 * 把工具栏分组镜像到移动端侧边操作栏，避免三个工作台各手写一份条目。
 * 侧栏自上而下与工具栏从左到右相反，因此分组按倒序输出，工具胶囊固定放最后。
 * 注册表只保存结构签名，回调统一转发到最新一次渲染，避免闭包读到过期状态。
 */
export function useEditorRailItems(input: UseEditorRailItemsInput): void {
  const { ownerId, enabled, registerItems } = input;
  const latestRef = useRef(input);
  latestRef.current = input;
  const signature = serializeEditorRail(input);

  useEffect(() => {
    if (!enabled || !registerItems) {
      return undefined;
    }

    const items: MobileActionRailItem[] = [];
    [...latestRef.current.sections].reverse().forEach((section) => {
      section.items.forEach((item) => {
        if (item.disabled) {
          return;
        }
        items.push({
          id: `${ownerId}-${section.id}-${item.id}`,
          label: item.label,
          icon: item.icon,
          group: 'page',
          section: section.id,
          priority: section.priority,
          active: item.active,
          onClick: () => callSectionAction(latestRef.current, section.id, item.id),
        });
      });
    });

    latestRef.current.tools.forEach((tool) => {
      if (tool.disabled) {
        return;
      }
      items.push({
        id: `${ownerId}-tools-${tool.id}`,
        label: tool.label,
        icon: tool.icon,
        group: 'page',
        section: 'tools',
        priority: 90,
        active: tool.active,
        onClick: () => callToolAction(latestRef.current, tool.id),
      });
    });

    latestRef.current.bottom?.forEach((item) => {
      items.push({
        ...item,
        onClick: item.onClick ? () => callBottomAction(latestRef.current, item.id) : undefined,
      });
    });

    registerItems(ownerId, items);
    return () => registerItems(ownerId, []);
  }, [enabled, ownerId, registerItems, signature]);
}

function callSectionAction(latest: UseEditorRailItemsInput, sectionId: string, itemId: string) {
  latest.sections
    .find((section) => section.id === sectionId)
    ?.items.find((item) => item.id === itemId)
    ?.onClick();
}

function callToolAction(latest: UseEditorRailItemsInput, toolId: string) {
  latest.tools.find((tool) => tool.id === toolId)?.onClick();
}

function callBottomAction(latest: UseEditorRailItemsInput, itemId: string) {
  latest.bottom?.find((item) => item.id === itemId)?.onClick?.();
}

/** 只序列化会影响渲染结果的字段；回调变化不触发重新注册。 */
function serializeEditorRail(input: UseEditorRailItemsInput): string {
  const sections = input.sections
    .map(
      (section) =>
        `${section.id}~${section.priority ?? ''}~${section.items.map(serializeAction).join('+')}`,
    )
    .join(';');
  const tools = input.tools
    .map(
      (tool) =>
        `${tool.id}~${tool.icon}~${tool.label}~${tool.active ? 1 : 0}~${tool.disabled ? 1 : 0}`,
    )
    .join(';');
  const bottom = (input.bottom ?? []).map(serializeBottom).join(';');
  return `${sections}#${tools}#${bottom}`;
}

function serializeAction(item: EditorToolbarOverflowItem): string {
  return `${item.id}~${item.icon}~${item.label}~${item.active ? 1 : 0}~${item.disabled ? 1 : 0}`;
}

function serializeBottom(item: MobileActionRailItem): string {
  return [
    item.id,
    item.icon,
    item.label,
    item.group,
    item.section ?? '',
    item.active ? 1 : 0,
    item.busy ? 1 : 0,
    item.readOnly ? 1 : 0,
    item.emphasis ? 1 : 0,
    item.href ?? '',
    item.priority ?? '',
    item.order ?? '',
  ].join('~');
}
