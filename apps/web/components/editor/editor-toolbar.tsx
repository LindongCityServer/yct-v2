'use client';

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { EditorTool } from '../../lib/editor/types';
import { EditorToolbarActionButton } from './editor-toolbar-actions';
import {
  EditorToolbarOverflowMenu,
  type EditorToolbarOverflowItem,
} from './editor-toolbar-overflow';

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** 一个胶囊内承载的工具或操作；不同分组拆成多个胶囊并排。 */
export interface EditorToolbarSection {
  id: string;
  ariaLabel?: string;
  tools?: EditorTool[];
  actions?: ReactNode;
  /** 提供 items 时由工具条自行渲染按钮，并按单个按钮做溢出收纳。 */
  items?: EditorToolbarOverflowItem[];
}

/** 按钮与胶囊的固定尺寸（与 globals.css 中的工具栏样式保持一致）。 */
const toolbarGroupChromeWidth = 8;
const toolbarItemGap = 2;

interface ToolbarVisibility {
  visibleCounts: number[];
  /** 需要显示「更多」时，收纳按钮所在的分组下标。 */
  splitIndex?: number;
  /** 分组被整体收纳时，「更多」单独成组。 */
  triggerStandalone: boolean;
  hiddenItems: EditorToolbarOverflowItem[];
}

/**
 * 从末尾开始逐个收纳操作按钮，得到一个「收几个」的方案。
 * 与整组收纳不同，这里允许一个分组只露出前几个按钮。
 */
function resolveToolbarVisibility(
  sectionItems: EditorToolbarOverflowItem[][],
  hiddenCount: number,
): ToolbarVisibility {
  const total = sectionItems.reduce((count, items) => count + items.length, 0);
  const target = Math.max(0, Math.min(hiddenCount, total));
  const visibleCounts = sectionItems.map((items) => items.length);
  let remaining = target;
  for (let index = visibleCounts.length - 1; index >= 0 && remaining > 0; index -= 1) {
    const take = Math.min(remaining, visibleCounts[index] ?? 0);
    visibleCounts[index] = (visibleCounts[index] ?? 0) - take;
    remaining -= take;
  }
  if (target === 0) {
    return { visibleCounts, triggerStandalone: false, hiddenItems: [] };
  }
  let splitIndex: number | undefined;
  for (let index = 0; index < visibleCounts.length; index += 1) {
    if ((visibleCounts[index] ?? 0) < (sectionItems[index]?.length ?? 0)) {
      splitIndex = index;
      break;
    }
  }
  const hiddenItems = sectionItems.flatMap((items, index) =>
    items.slice(visibleCounts[index] ?? 0),
  );
  // 分组还有按钮露在外面时，「更多」留在该分组内；整组收完才独立成组。
  const triggerStandalone = splitIndex === undefined || (visibleCounts[splitIndex] ?? 0) === 0;
  return { visibleCounts, splitIndex, triggerStandalone, hiddenItems };
}

/**
 * 编辑器唯一的工具入口：画布顶部居中的浮动胶囊组（移动端落到画布底部）。
 * 面板开关、工具、模式与操作各自成组，用独立胶囊承载，不再用分割线挤在一条长条里。
 *
 * 操作按钮放不下时按单个按钮从后往前收纳进「更多」，而不是整组消失：
 * 分组还有按钮可见时「更多」留在该分组内，分组被整组收完时「更多」独立成组。
 */
export function EditorToolbar({
  activeToolId,
  actions,
  ariaLabel = '编辑工具',
  className,
  onToolChange,
  panels,
  sections,
  tools,
}: Readonly<{
  activeToolId: string;
  /** 旧用法：未提供 sections 时作为唯一分组。 */
  actions?: ReactNode;
  ariaLabel?: string;
  className?: string;
  /** 侧边面板总开关：只提供「全部展开 / 全部隐藏」两态。 */
  panels?: {
    visible: boolean;
    onToggle: () => void;
    label?: string;
  };
  onToolChange: (toolId: string) => void;
  sections?: EditorToolbarSection[];
  tools?: EditorTool[];
}>) {
  const resolvedSections: EditorToolbarSection[] =
    sections && sections.length > 0 ? sections : [{ id: 'default', tools, actions }];
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const buttonWidthRef = useRef(38);
  const [hiddenCount, setHiddenCount] = useState(0);

  // 只有提供 items 的分组参与按按钮收纳；沿用 actions 的分组保持原样。
  const managedSections = resolvedSections
    .map((section) => ({ section, items: section.items ?? [] }))
    .filter((entry) => entry.items.length > 0);
  const sectionItems = managedSections.map((entry) => entry.items);
  const visibleSectionIds = new Set(managedSections.map((entry) => entry.section.id));
  const actionItemIds = sectionItems.map((items) => items.map((item) => item.id));
  const hasPanels = Boolean(panels);

  useIsomorphicLayoutEffect(() => {
    if (sectionItems.length === 0) {
      setHiddenCount(0);
      return undefined;
    }
    const element = toolbarRef.current;
    if (!element) {
      return undefined;
    }

    const recompute = () => {
      const sample = element.querySelector<HTMLElement>('.editor-toolbar-actions > button');
      const sampleWidth = sample?.getBoundingClientRect().width ?? 0;
      if (sampleWidth > 0) {
        buttonWidthRef.current = sampleWidth;
      }
      const button = buttonWidthRef.current;
      const computed = getComputedStyle(element);
      const maxWidth = Number.parseFloat(computed.maxWidth);
      const parentWidth = element.parentElement?.clientWidth ?? 0;
      // 标题栏工具条的 max-width 会随视口变化，直接用它作为可用宽度预算。
      const budget =
        Number.isFinite(maxWidth) && maxWidth > 0
          ? maxWidth
          : Math.max(parentWidth, window.innerWidth - 32, 320);
      const groupGap = Number.parseFloat(computed.columnGap || computed.gap || '6') || 6;
      const toolCount = resolvedSections.reduce(
        (count, section) => count + (section.tools?.length ?? 0),
        0,
      );
      const total = sectionItems.reduce((count, items) => count + items.length, 0);

      const widthFor = (hidden: number) => {
        const visibility = resolveToolbarVisibility(sectionItems, hidden);
        let groups = 0;
        let width = 0;
        const addGroup = (groupWidth: number) => {
          groups += 1;
          width += groupWidth;
        };
        if (hasPanels) {
          addGroup(toolbarGroupChromeWidth + button);
        }
        if (toolCount > 0) {
          addGroup(
            toolbarGroupChromeWidth +
              toolCount * button +
              Math.max(toolCount - 1, 0) * toolbarItemGap,
          );
        }
        visibility.visibleCounts.forEach((count, index) => {
          if (count <= 0) {
            return;
          }
          let groupWidth =
            toolbarGroupChromeWidth + count * button + Math.max(count - 1, 0) * toolbarItemGap;
          if (visibility.splitIndex === index && !visibility.triggerStandalone) {
            groupWidth += toolbarItemGap + button;
          }
          addGroup(groupWidth);
        });
        if (hidden > 0 && visibility.triggerStandalone) {
          addGroup(toolbarGroupChromeWidth + button);
        }
        return width + Math.max(groups - 1, 0) * groupGap;
      };

      let next = total;
      for (let candidate = 0; candidate <= total; candidate += 1) {
        if (widthFor(candidate) <= budget) {
          next = candidate;
          break;
        }
      }
      setHiddenCount((current) => (current === next ? current : next));
    };

    recompute();
    window.addEventListener('resize', recompute);
    const observer =
      typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(recompute);
    if (observer && element.parentElement) {
      observer.observe(element.parentElement);
    }
    return () => {
      window.removeEventListener('resize', recompute);
      observer?.disconnect();
    };
    // sectionItems 每次渲染都是新数组，用按钮 id 串与分组数量做稳定依赖。
  }, [
    actionItemIds.map((ids) => ids.join(',')).join('|'),
    hasPanels,
    resolvedSections.length,
    sectionItems.length,
  ]);

  const visibility = resolveToolbarVisibility(sectionItems, hiddenCount);
  const hiddenActiveItem = visibility.hiddenItems.find((item) => item.active);
  const overflowMenu =
    hiddenCount > 0 && visibility.hiddenItems.length > 0 ? (
      <EditorToolbarOverflowMenu
        items={visibility.hiddenItems}
        triggerActive={hiddenActiveItem?.active}
        triggerIcon={hiddenActiveItem?.icon}
        triggerLabel={hiddenActiveItem?.label}
      />
    ) : null;

  let managedIndex = 0;

  return (
    <div
      className={`editor-toolbar${className ? ` ${className}` : ''}`}
      role="toolbar"
      aria-label={ariaLabel}
      ref={toolbarRef}
    >
      {panels ? (
        <div className="editor-toolbar-group">
          <button
            aria-expanded={panels.visible}
            aria-label={panels.label ?? '面板'}
            className={`editor-toolbar-button${panels.visible ? ' is-active' : ''}`}
            onClick={panels.onToggle}
            title={panels.label ?? '面板'}
            type="button"
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              view_sidebar
            </span>
          </button>
        </div>
      ) : null}
      {resolvedSections.map((section) => {
        if (visibleSectionIds.has(section.id)) {
          const index = managedIndex;
          managedIndex += 1;
          const count = visibility.visibleCounts[index] ?? 0;
          const showTrigger = visibility.splitIndex === index && !visibility.triggerStandalone;
          if (count <= 0 && !showTrigger) {
            return null;
          }
          const items = sectionItems[index] ?? [];
          return (
            <div
              aria-label={section.ariaLabel}
              className="editor-toolbar-group"
              key={section.id}
              role="group"
            >
              <div className="editor-toolbar-actions">
                {items.slice(0, count).map((item) => (
                  <EditorToolbarActionButton item={item} key={item.id} />
                ))}
                {showTrigger ? overflowMenu : null}
              </div>
            </div>
          );
        }
        return (
          <div
            aria-label={section.ariaLabel}
            className="editor-toolbar-group"
            key={section.id}
            role="group"
          >
            {section.tools?.map((tool) => {
              const active = tool.id === activeToolId;
              return (
                <button
                  aria-label={tool.label}
                  aria-pressed={active}
                  className={`editor-toolbar-button${active ? ' is-active' : ''}`}
                  disabled={tool.disabled}
                  key={tool.id}
                  onClick={() => onToolChange(tool.id)}
                  title={tool.shortcut ? `${tool.label}（${tool.shortcut}）` : tool.label}
                  type="button"
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    {tool.icon}
                  </span>
                </button>
              );
            })}
            {section.actions ? (
              <div className="editor-toolbar-actions">{section.actions}</div>
            ) : null}
          </div>
        );
      })}
      {overflowMenu && visibility.triggerStandalone ? (
        <div className="editor-toolbar-group" role="group" aria-label="更多操作">
          <div className="editor-toolbar-actions">{overflowMenu}</div>
        </div>
      ) : null}
    </div>
  );
}
