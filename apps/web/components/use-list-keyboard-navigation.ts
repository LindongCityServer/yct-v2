'use client';

import { useEffect, useRef, type RefObject } from 'react';

const editableSelector = 'input, select, textarea, [contenteditable="true"]';

/**
 * 后台审核列表的键盘巡检：J/K（或上下方向键）移动焦点，Enter 打开详情，
 * Shift+Space 切换选中，Ctrl+Enter 触发批量动作。
 *
 * 列表项需带 `data-keyboard-list-item`，其内部的详情按钮标 `data-keyboard-open`，
 * 选择框标 `data-keyboard-select`，避免把回车误派给危险操作。
 */
export function useListKeyboardNavigation({
  containerRef,
  enabled = true,
  onBulkAction,
}: Readonly<{
  containerRef: RefObject<HTMLElement | null>;
  enabled?: boolean;
  onBulkAction?: () => void;
}>): void {
  const bulkActionRef = useRef(onBulkAction);
  bulkActionRef.current = onBulkAction;

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || target.closest(editableSelector))
      ) {
        return;
      }

      // 弹窗（批量确认、详情等）打开时，列表快捷键让位给弹窗内的交互。
      if (document.querySelector('.modal-backdrop')) {
        return;
      }

      const container = containerRef.current;
      if (!container) {
        return;
      }

      const items = Array.from(
        container.querySelectorAll<HTMLElement>('[data-keyboard-list-item]'),
      );
      if (items.length === 0) {
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        if (!bulkActionRef.current) {
          return;
        }
        event.preventDefault();
        bulkActionRef.current();
        return;
      }

      if (event.altKey || event.metaKey || event.ctrlKey) {
        return;
      }

      const currentIndex = items.findIndex(
        (item) => item === document.activeElement || item.contains(document.activeElement),
      );

      if (event.key === 'j' || event.key === 'J' || event.key === 'ArrowDown') {
        event.preventDefault();
        const nextIndex = currentIndex < 0 ? 0 : Math.min(items.length - 1, currentIndex + 1);
        items[nextIndex]?.focus();
        items[nextIndex]?.scrollIntoView({ block: 'nearest' });
        return;
      }

      if (event.key === 'k' || event.key === 'K' || event.key === 'ArrowUp') {
        event.preventDefault();
        const nextIndex = currentIndex < 0 ? 0 : Math.max(0, currentIndex - 1);
        items[nextIndex]?.focus();
        items[nextIndex]?.scrollIntoView({ block: 'nearest' });
        return;
      }

      if (currentIndex < 0) {
        return;
      }

      if (event.key === 'Enter') {
        const openTarget = items[currentIndex]?.querySelector<HTMLElement>('[data-keyboard-open]');
        if (!openTarget) {
          return;
        }
        event.preventDefault();
        openTarget.click();
        return;
      }

      if (event.key === ' ' && event.shiftKey) {
        const selectTarget = items[currentIndex]?.querySelector<HTMLElement>(
          '[data-keyboard-select]',
        );
        if (!selectTarget) {
          return;
        }
        event.preventDefault();
        selectTarget.click();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [containerRef, enabled]);
}
