'use client';

import { useEffect, type RefObject } from 'react';

/**
 * 画布选中对象后，把侧边图层树里的对应行滚进可视区。
 * 约定：图层行沿用 `.poi-visual-layer-row.is-active`，优先匹配点行，其次分组行，
 * 这样章节 + 字段两级同时高亮时，会优先滚到更具体的字段行。
 */
export function useEditorLayerScroll(
  containerRef: RefObject<HTMLElement | null>,
  selectionKey: string | number | null,
) {
  useEffect(() => {
    if (selectionKey === null) {
      return;
    }
    const container = containerRef.current;
    // 中屏/移动端属性覆盖图层时，图层面板会 display:none；此时不要动滚动位置。
    if (!container || container.clientHeight === 0) {
      return;
    }
    const activeRows = Array.from(
      container.querySelectorAll<HTMLElement>('.poi-visual-layer-row.is-active'),
    );
    const pointRow = activeRows.find((row) =>
      Boolean(row.querySelector('.poi-visual-layer-point')),
    );
    const groupRow = activeRows.find((row) =>
      Boolean(row.querySelector('.poi-visual-layer-group')),
    );
    const target = pointRow ?? groupRow ?? activeRows[0];
    if (!target) {
      return;
    }
    // 只调整纵向滚动，避免 scrollIntoView 在窄面板里把树横向推走。
    const containerRect = container.getBoundingClientRect();
    const rowRect = target.getBoundingClientRect();
    const margin = 4;
    if (rowRect.top < containerRect.top + margin) {
      container.scrollTop += rowRect.top - containerRect.top - margin;
    } else if (rowRect.bottom > containerRect.bottom - margin) {
      container.scrollTop += rowRect.bottom - containerRect.bottom + margin;
    }
  }, [containerRef, selectionKey]);
}
