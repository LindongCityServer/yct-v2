'use client';

import { useCallback, type RefObject } from 'react';

/**
 * 双击图层行时把焦点送进属性检查器的第一个字段。
 * 三个可视化工作台共用同一套滚动与聚焦行为。
 */
export function useEditorInspectorFocus(ref: RefObject<HTMLElement | null>) {
  return useCallback(() => {
    window.requestAnimationFrame(() => {
      const element = ref.current;
      if (!element) {
        return;
      }
      element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      const field = element.querySelector<HTMLElement>('input, select, textarea');
      if (!field) {
        return;
      }
      field.focus();
      if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
        field.select();
      }
    });
  }, [ref]);
}
