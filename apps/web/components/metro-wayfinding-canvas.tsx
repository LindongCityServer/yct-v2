'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useI18n } from '../lib/client-i18n';
import {
  createClientMetroWayfindingSvgAssets,
  hasMetroWayfindingSvgAssets,
  loadMetroWayfindingSvgAssets,
} from '../lib/client-metro-wayfinding-svg-assets';
import type { MetroWayfindingElementAction } from '../lib/client-metro-wayfinding-events';
import {
  METRO_WAYFINDING_GAP,
  METRO_WAYFINDING_HEIGHT,
  METRO_WAYFINDING_LARGE_TEXT_FRAMED_FONT_SIZE,
  METRO_WAYFINDING_LARGE_TEXT_SUFFIX_FONT_SIZE,
  METRO_WAYFINDING_LARGE_TEXT_UNFRAMED_FONT_SIZE,
  METRO_WAYFINDING_PADDING,
  METRO_WAYFINDING_TEXT_HEIGHT,
  estimateMetroWayfindingLargeTextWidth,
  resolveMetroWayfindingLayoutSizing,
  resolveMetroWayfindingTextMetrics,
  resolveMetroWayfindingVerticalLayoutSizing,
  serializeMetroWayfindingLayout,
  splitMetroLargeTextRuns,
  type MetroWayfindingElement,
  type MetroWayfindingLargeTextElement,
  type MetroWayfindingLayout,
  type MetroWayfindingTextElement,
  type MetroWayfindingTextRow,
} from '../lib/metro-wayfinding';
import { describeMetroWayfindingElementContent } from '../lib/metro-wayfinding-content';
import { renderMetroWayfindingSvg } from '../lib/metro-wayfinding-svg';
import { EditorZoomControls } from './editor/editor-zoom-controls';
import { Button } from './ui/button';

/**
 * 导视牌还原画布。
 *
 * 视觉层直接复用服务端导出使用的同构 SVG 渲染器（`metro-wayfinding-svg.ts`），
 * 因此画布比例、坐标、字号、图标尺寸与导出图完全一致；交互层用同一套
 * `resolveMetroWayfindingLayoutSizing` 计算元素命中框，叠加在 SVG 之上。
 */

/** 导视牌逻辑像素：1 米 = 128 像素，与导出画布一致。 */
const CANVAS_PX_PER_METER = 128;
const CANVAS_MIN_ZOOM = 0.2;
const CANVAS_MAX_ZOOM = 6;
const INLINE_INPUT_HEIGHT = 14;

interface CanvasLineBandGeometry {
  kind: 'text-main' | 'text-secondary' | 'large-text' | 'large-suffix';
  label: string;
  /** 相对元素命中框的左 / 上偏移与尺寸。 */
  left: number;
  top: number;
  width: number;
  height: number;
  /** 内联输入框使用的字号（已按画布比例缩放）。 */
  fontSize: number;
  rowId?: string;
  runIndex?: number;
}

interface CanvasElementBox {
  rowIndex: number;
  element: MetroWayfindingElement;
  x: number;
  y: number;
  width: number;
  height: number;
  /** 文本 / 大文字的行级命中带；其他元素为空数组。 */
  bands: CanvasLineBandGeometry[];
}

interface InlineEditorState {
  rowIndex: number;
  elementId: string;
  value: string;
  fontSize: number;
  rect: { left: number; top: number; width: number; height: number };
  commit: (value: string) => void;
}

/** 构建文本元素每一行的纵向命中带（仅横向版式）。 */
function buildTextBands(
  element: MetroWayfindingTextElement,
  width: number,
  scale: number,
): CanvasLineBandGeometry[] {
  const metrics = resolveMetroWayfindingTextMetrics(element.rows);
  let rowTop = (METRO_WAYFINDING_HEIGHT - METRO_WAYFINDING_TEXT_HEIGHT) / 2 + metrics.spacing;
  return element.rows.map((row, index) => {
    const fontSize = row.kind === 'main' ? metrics.mainFontSize : metrics.secondaryFontSize;
    const band: CanvasLineBandGeometry = {
      kind: row.kind === 'main' ? 'text-main' : 'text-secondary',
      label: `第 ${index + 1} 行 · ${row.kind === 'main' ? '主文本' : '副文本'}`,
      left: 0,
      top: rowTop * scale,
      // 空文字元素的元素盒宽为 0，命中带保留最小可点击宽度。
      width: Math.max(width, 24),
      // 命中带覆盖本行 + 行间距，避免行与行之间出现无法选中的缝隙。
      height: (fontSize + metrics.spacing) * scale,
      fontSize: fontSize * scale,
      rowId: row.id,
    };
    rowTop += fontSize + metrics.spacing;
    return band;
  });
}

/** 构建大文字每一段正文 / 下角标的横向命中带。 */
function buildLargeTextBands(
  element: MetroWayfindingLargeTextElement,
  elementWidth: number,
  elementScaleX: number,
  scale: number,
): CanvasLineBandGeometry[] {
  const mainFontSize =
    element.frameShape !== 'none'
      ? METRO_WAYFINDING_LARGE_TEXT_FRAMED_FONT_SIZE
      : METRO_WAYFINDING_LARGE_TEXT_UNFRAMED_FONT_SIZE;
  const suffixFontSize = METRO_WAYFINDING_LARGE_TEXT_SUFFIX_FONT_SIZE;
  const rawRuns = splitMetroLargeTextRuns(element);
  const runs = rawRuns.length ? rawRuns : [{ kind: 'text' as const, value: '' }];
  let gapTotal = 0;
  runs.forEach((run, index) => {
    if (run.kind !== 'suffix') return;
    if (runs[index - 1]?.kind === 'text') gapTotal += 3;
    if (runs[index + 1]?.kind === 'text') gapTotal += 3;
  });
  const runWidths = runs.map((run) =>
    Math.max(
      estimateMetroWayfindingLargeTextWidth(
        run.value,
        run.kind === 'suffix' ? suffixFontSize : mainFontSize,
      ),
      12,
    ),
  );
  const totalWidth = runWidths.reduce((total, item) => total + item, 0) + gapTotal;
  let cursor = elementWidth / 2 - totalWidth / 2;
  return runs.map((run, index) => {
    const isSuffix = run.kind === 'suffix';
    const fontSize = isSuffix ? suffixFontSize : mainFontSize;
    const band = {
      kind: isSuffix ? ('large-suffix' as const) : ('large-text' as const),
      label: isSuffix ? '下角标' : runs.length > 1 ? `文字段 ${index + 1}` : '大文字',
      left: cursor * elementScaleX * scale,
      top: (64 - fontSize / 2 + (isSuffix ? 13 : 0)) * scale,
      width: runWidths[index]! * elementScaleX * scale,
      height: fontSize * scale,
      fontSize: fontSize * scale,
      runIndex: index,
    };
    const next = runs[index + 1];
    cursor +=
      runWidths[index]! + (next && (run.kind === 'suffix' || next.kind === 'suffix') ? 3 : 0);
    return band;
  });
}

function buildElementBoxes(
  layout: MetroWayfindingLayout,
  canvasWidth: number,
  canvasHeight: number,
): CanvasElementBox[] {
  const boxes: CanvasElementBox[] = [];
  if (layout.mode === 'vertical') {
    const width = Math.max(canvasWidth, 1);
    const height = Math.max(canvasHeight, METRO_WAYFINDING_HEIGHT);
    const elements = layout.rows[0] ?? [];
    const sizing = resolveMetroWayfindingVerticalLayoutSizing(elements, height);
    let cursorY = METRO_WAYFINDING_PADDING;
    elements.forEach((element, index) => {
      const intrinsicHeight =
        element.type === 'space' && element.mode === 'flex'
          ? sizing.flexHeight
          : sizing.elementHeights[index]!;
      const scaleY =
        element.type === 'text' && element.writingMode === 'vertical' ? sizing.textScaleY : 1;
      const elementHeight = intrinsicHeight * scaleY;
      boxes.push({
        rowIndex: 0,
        element,
        x: 0,
        y: cursorY,
        width,
        height: elementHeight,
        // 竖向版式的文字按列排布，行级命中带不适用，继续使用整元素双击。
        bands: [],
      });
      cursorY += elementHeight + (index < elements.length - 1 ? METRO_WAYFINDING_GAP : 0);
    });
    return boxes;
  }

  const rowCount = layout.mode === 'double' ? 2 : 1;
  const scale = canvasHeight / (METRO_WAYFINDING_HEIGHT * rowCount);
  const width = canvasWidth / scale;
  layout.rows.slice(0, rowCount).forEach((elements, rowIndex) => {
    const sizing = resolveMetroWayfindingLayoutSizing(elements, width);
    let cursor = (width - sizing.totalDisplayWidth) / 2;
    elements.forEach((element, index) => {
      const intrinsicWidth =
        element.type === 'space' && element.mode === 'flex'
          ? sizing.flexWidth
          : sizing.elementWidths[index]!;
      const elementWidth =
        element.type === 'text' ? intrinsicWidth * sizing.textScaleX : intrinsicWidth;
      const elementScaleX =
        sizing.layoutScale *
        (element.type === 'largeText' || element.type === 'combination' ? sizing.textScaleX : 1);
      const displayWidth = elementWidth * elementScaleX;
      const boxX = cursor * scale;
      const boxWidth = displayWidth * scale;
      let bands: CanvasLineBandGeometry[] = [];
      if (element.type === 'text') {
        bands = buildTextBands(element, boxWidth, scale);
      } else if (element.type === 'largeText') {
        bands = buildLargeTextBands(element, displayWidth / elementScaleX, elementScaleX, scale);
      }
      boxes.push({
        rowIndex,
        element,
        x: boxX,
        y: rowIndex * METRO_WAYFINDING_HEIGHT * scale,
        width: boxWidth,
        height: METRO_WAYFINDING_HEIGHT * scale,
        bands,
      });
      cursor +=
        displayWidth +
        (index < elements.length - 1 ? METRO_WAYFINDING_GAP * sizing.layoutScale : 0);
    });
  });
  return boxes;
}

export function MetroWayfindingCanvas({
  layout,
  canvasWidthM,
  canvasHeightM,
  disabled,
  selectedRowIndex,
  selectedElementId,
  onSelect,
  onElementAction,
  onAddElement,
  onOpenTemplateLibrary,
  onFocusInspector,
  panTool = false,
  viewportKey,
}: Readonly<{
  layout: MetroWayfindingLayout;
  canvasWidthM: number;
  canvasHeightM: number;
  disabled: boolean;
  selectedRowIndex: number;
  selectedElementId: string;
  onSelect: (rowIndex: number, elementId: string) => void;
  onElementAction: (rowIndex: number, action: MetroWayfindingElementAction) => void;
  onAddElement: () => void;
  onOpenTemplateLibrary: () => void;
  onFocusInspector: () => void;
  /** 手型工具：左键 / 单指直接拖拽平移，不触发选中。 */
  panTool?: boolean;
  /** 面板开合等不改变容器尺寸、但会改变内边距的状态，用于触发重新适配。 */
  viewportKey?: string;
}>) {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const signRef = useRef<HTMLDivElement | null>(null);
  const [fitScale, setFitScale] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isSpacePanning, setIsSpacePanning] = useState(false);
  const panStateRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState<{ rowIndex: number; elementId: string } | null>(null);
  const [dropHint, setDropHint] = useState<{
    rowIndex: number;
    elementId: string;
    placement: 'before' | 'after';
  } | null>(null);
  const [inlineEditor, setInlineEditor] = useState<InlineEditorState | null>(null);
  const [svgReady, setSvgReady] = useState(false);
  const [assetError, setAssetError] = useState('');

  const canvasWidth = Math.max(1, Math.round(canvasWidthM * CANVAS_PX_PER_METER));
  const canvasHeight = Math.max(1, Math.round(canvasHeightM * CANVAS_PX_PER_METER));
  const scale = fitScale * zoom;
  const rowCount = layout.mode === 'double' ? 2 : 1;
  const visibleRows = layout.rows.slice(0, rowCount);
  const hasElements = visibleRows.some((row) => row.length > 0);
  const elementBoxes = useMemo(
    () => buildElementBoxes(layout, canvasWidth, canvasHeight),
    [canvasHeight, canvasWidth, layout],
  );

  // 素材预热：全部命中缓存时同步就绪，避免每次编辑闪回加载态。
  useEffect(() => {
    let cancelled = false;
    if (hasMetroWayfindingSvgAssets(layout)) {
      setSvgReady(true);
      setAssetError('');
      return undefined;
    }
    setSvgReady(false);
    setAssetError('');
    void loadMetroWayfindingSvgAssets(layout)
      .then(() => {
        if (!cancelled) {
          setSvgReady(true);
          setAssetError('');
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setSvgReady(false);
          setAssetError(error instanceof Error ? error.message : '牌面素材加载失败。');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [layout]);

  const svgMarkup = useMemo(() => {
    if (!svgReady) {
      return '';
    }
    try {
      return renderMetroWayfindingSvg(
        serializeMetroWayfindingLayout(layout),
        canvasWidth,
        canvasHeight,
        createClientMetroWayfindingSvgAssets(),
      );
    } catch {
      return '';
    }
  }, [canvasHeight, canvasWidth, layout, svgReady]);

  // 适配：按可用区域计算基准缩放，面板开合与窗口变化都会重新计算。
  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return undefined;
    }
    const update = () => {
      // clientWidth 含内边距，必须减去左右面板让位区，否则牌面会压到面板下面。
      const style = getComputedStyle(container);
      const paddingX = Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight);
      const paddingY = Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom);
      const availableWidth = Math.max(container.clientWidth - paddingX - 24, 120);
      const availableHeight = Math.max(container.clientHeight - paddingY - 24, 80);
      setFitScale(
        Math.max(0.1, Math.min(availableWidth / canvasWidth, availableHeight / canvasHeight, 3.2)),
      );
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => observer.disconnect();
  }, [canvasHeight, canvasWidth, viewportKey]);

  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  // Ctrl+0 适配窗口。
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === '0') {
        event.preventDefault();
        resetView();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [resetView]);

  // 空格临时手型：不改变当前工具，松开即恢复。
  useEffect(() => {
    const isEditable = (target: EventTarget | null) =>
      target instanceof HTMLElement &&
      (target.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName));
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space' && !isEditable(event.target)) {
        setIsSpacePanning(true);
      }
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        setIsSpacePanning(false);
      }
    };
    const handleBlur = () => setIsSpacePanning(false);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  // 滚轮缩放需要非被动监听，否则浏览器会忽略 preventDefault。
  useEffect(() => {
    const container = containerRef.current;
    if (!container || disabled) {
      return undefined;
    }
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
      setZoom((current) => Math.min(CANVAS_MAX_ZOOM, Math.max(CANVAS_MIN_ZOOM, current * factor)));
    };
    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [disabled]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const isPanGesture = event.button === 1 || (event.button === 0 && (isSpacePanning || panTool));
    if (!isPanGesture) {
      return;
    }
    event.preventDefault();
    panStateRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = panStateRef.current;
    if (!state || state.pointerId !== event.pointerId) {
      return;
    }
    const deltaX = event.clientX - state.x;
    const deltaY = event.clientY - state.y;
    panStateRef.current = { ...state, x: event.clientX, y: event.clientY };
    setPan((current) => ({ x: current.x + deltaX, y: current.y + deltaY }));
  };

  const endPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (panStateRef.current?.pointerId !== event.pointerId) {
      return;
    }
    panStateRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  /** 只更新文本元素中的一行，保留其他行不变。 */
  const updateTextRow = (box: CanvasElementBox, rowId: string, value: string) => {
    if (box.element.type !== 'text') return;
    const element = box.element;
    onElementAction(box.rowIndex, {
      type: 'update',
      elementId: element.id,
      patch: {
        rows: element.rows.map((row): MetroWayfindingTextRow => {
          if (row.id !== rowId) return row;
          if (row.kind === 'secondary') return { ...row, value };
          // 主文本行只有单一文本段时才允许直接改字；含 chip 或多段时回退到检查器。
          const hasChip = row.segments.some((segment) => segment.kind !== 'text');
          const textSegments = row.segments.filter((segment) => segment.kind === 'text');
          if (hasChip || textSegments.length > 1) return row;
          return { ...row, segments: [{ kind: 'text', value }] };
        }),
      },
    });
  };

  /** 只更新大文字中的一段正文 / 下角标，保留其他 run 的位置关系。 */
  const updateLargeTextRun = (box: CanvasElementBox, runIndex: number, value: string) => {
    if (box.element.type !== 'largeText') return;
    const element = box.element;
    const runs = splitMetroLargeTextRuns(element);
    const baseRuns = runs.length ? runs : [{ kind: 'text' as const, value: '' }];
    const next = baseRuns.map((run, index) =>
      index === runIndex ? { kind: run.kind, value } : run,
    );
    let text = '';
    const suffixes: Array<{ at: number; value: string }> = [];
    for (const run of next) {
      if (run.kind === 'text') {
        text += run.value;
        continue;
      }
      suffixes.push({ at: Array.from(text).length, value: run.value });
    }
    const tail = suffixes.filter((item) => item.at === Array.from(text).length).at(-1);
    onElementAction(box.rowIndex, {
      type: 'update',
      elementId: element.id,
      patch: { value: text, suffixes, suffix: tail?.value ?? '' },
    });
  };

  const beginLineInlineEdit = (box: CanvasElementBox, band: CanvasLineBandGeometry) => {
    const { element, rowIndex } = box;
    const rect = {
      left: box.x + band.left,
      top: box.y + band.top,
      width: Math.max(band.width, 16),
      height: Math.max(band.height, 12),
    };
    const fontSize = Math.max(8, Math.min(band.fontSize * 0.7, 36));
    if (element.type === 'text' && band.rowId) {
      const row = element.rows.find((item) => item.id === band.rowId);
      if (!row) {
        onFocusInspector();
        return;
      }
      if (row.kind === 'main') {
        const hasChip = row.segments.some((segment) => segment.kind !== 'text');
        const textSegments = row.segments.filter((segment) => segment.kind === 'text');
        if (hasChip || textSegments.length > 1) {
          onFocusInspector();
          return;
        }
        setInlineEditor({
          rowIndex,
          elementId: element.id,
          value: textSegments[0]?.value ?? '',
          fontSize,
          rect,
          commit: (value) => updateTextRow(box, row.id, value),
        });
        return;
      }
      setInlineEditor({
        rowIndex,
        elementId: element.id,
        value: row.value,
        fontSize,
        rect,
        commit: (value) => updateTextRow(box, row.id, value),
      });
      return;
    }
    if (element.type === 'largeText' && band.runIndex !== undefined) {
      const runs = splitMetroLargeTextRuns(element);
      const run = runs[band.runIndex] ?? (runs.length ? undefined : { kind: 'text', value: '' });
      setInlineEditor({
        rowIndex,
        elementId: element.id,
        value: run?.value ?? '',
        fontSize,
        rect,
        commit: (value) => updateLargeTextRun(box, band.runIndex!, value),
      });
      return;
    }
    onFocusInspector();
  };

  /** 竖向版式或没有行级命中带时的整元素内联编辑兜底。 */
  const beginInlineEdit = (box: CanvasElementBox) => {
    const { element, rowIndex } = box;
    const localRect = {
      left: box.x,
      top: box.y + Math.max((box.height - INLINE_INPUT_HEIGHT) / 2, 0),
      width: box.width,
      height: INLINE_INPUT_HEIGHT,
    };
    if (element.type === 'largeText') {
      setInlineEditor({
        rowIndex,
        elementId: element.id,
        value: element.value,
        fontSize: 8,
        rect: localRect,
        commit: (value) =>
          onElementAction(rowIndex, {
            type: 'update',
            elementId: element.id,
            patch: { value },
          }),
      });
      return;
    }
    if (element.type === 'text') {
      const mainRow = element.rows.find((row) => row.kind === 'main');
      const singleTextSegment =
        mainRow && mainRow.segments.length === 1 && mainRow.segments[0]?.kind === 'text'
          ? mainRow.segments[0]
          : undefined;
      if (!mainRow || !singleTextSegment) {
        onFocusInspector();
        return;
      }
      setInlineEditor({
        rowIndex,
        elementId: element.id,
        value: singleTextSegment.value,
        fontSize: 8,
        rect: localRect,
        commit: (value) =>
          onElementAction(rowIndex, {
            type: 'update',
            elementId: element.id,
            patch: {
              rows: element.rows.map((row) =>
                row.kind === 'main' && row.segments.length === 1
                  ? { ...row, segments: [{ ...singleTextSegment, value }] }
                  : row,
              ),
            },
          }),
      });
      return;
    }
    onFocusInspector();
  };

  const commitInlineEditor = () => {
    const current = inlineEditor;
    if (!current) {
      return;
    }
    setInlineEditor(null);
    current.commit(current.value);
  };

  /** 元素级拖拽换序监听；整元素命中框与行级命中带共用。 */
  const elementDragProps = (box: CanvasElementBox) => ({
    draggable: !disabled,
    onDragStart: (event: ReactDragEvent<HTMLButtonElement>) => {
      if (disabled) {
        return;
      }
      event.stopPropagation();
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', box.element.id);
      setDragging({ rowIndex: box.rowIndex, elementId: box.element.id });
    },
    onDragOver: (event: ReactDragEvent<HTMLButtonElement>) => {
      if (disabled || !dragging || dragging.rowIndex !== box.rowIndex) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const rect = event.currentTarget.getBoundingClientRect();
      const placement = event.clientX < rect.left + rect.width / 2 ? 'before' : 'after';
      setDropHint({
        rowIndex: box.rowIndex,
        elementId: box.element.id,
        placement,
      });
    },
    onDrop: (event: ReactDragEvent<HTMLButtonElement>) => {
      if (disabled || !dragging || dragging.rowIndex !== box.rowIndex) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const placement =
        dropHint && dropHint.elementId === box.element.id ? dropHint.placement : 'after';
      if (dragging.elementId !== box.element.id) {
        onElementAction(box.rowIndex, {
          type: 'reorder',
          elementId: dragging.elementId,
          targetElementId: box.element.id,
          placement,
        });
      }
      setDragging(null);
      setDropHint(null);
    },
    onDragEnd: () => {
      setDragging(null);
      setDropHint(null);
    },
  });

  const zoomLabel = Math.round(zoom * 100);

  return (
    <div
      className={`metro-wayfinding-canvas${isSpacePanning ? ' is-pan-ready' : ''}${
        panTool ? ' is-pan-tool' : ''
      }${disabled ? ' is-disabled' : ''}`}
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endPan}
      onPointerCancel={endPan}
      onClick={(event) => {
        if (disabled || panTool) {
          return;
        }
        // 工具按钮、空白态操作与缩放条不应触发「取消选中」。
        if (
          event.target instanceof Element &&
          event.target.closest(
            'button, input, .editor-zoom-controls, .metro-wayfinding-canvas-empty',
          )
        ) {
          return;
        }
        onSelect(selectedRowIndex, '');
      }}
    >
      <div
        className="metro-wayfinding-canvas-stage"
        style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})` }}
      >
        <div
          className={`metro-wayfinding-canvas-sign${layout.mode === 'vertical' ? ' is-vertical' : ''}`}
          ref={signRef}
          style={
            {
              width: `${canvasWidth}px`,
              height: `${canvasHeight}px`,
              // 选中描边 / 插入标记按缩放反向补偿，避免放大后变粗。
              '--wf-scale': scale,
            } as CSSProperties
          }
        >
          {svgMarkup ? (
            <svg
              className="metro-wayfinding-canvas-svg"
              viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
              width={canvasWidth}
              height={canvasHeight}
              role="img"
              aria-label={t('metroWayfindingEditor.aria.canvas')}
              dangerouslySetInnerHTML={{ __html: svgMarkup }}
            />
          ) : null}

          {elementBoxes.map((box) => {
            const selected =
              box.rowIndex === selectedRowIndex && box.element.id === selectedElementId;
            const hint =
              dropHint &&
              dropHint.rowIndex === box.rowIndex &&
              dropHint.elementId === box.element.id
                ? dropHint.placement
                : null;
            const description = describeMetroWayfindingElementContent(box.element);
            return (
              <div
                key={box.element.id}
                className={`metro-wayfinding-canvas-hit-frame${selected ? ' is-selected' : ''}${
                  hint ? ` is-drop-${hint}` : ''
                }`}
                style={{
                  left: `${box.x}px`,
                  top: `${box.y}px`,
                  width: `${box.width}px`,
                  height: `${box.height}px`,
                }}
              >
                {box.bands.length ? (
                  box.bands.map((band, index) => (
                    <button
                      key={`${band.kind}-${band.rowId ?? band.runIndex ?? index}`}
                      type="button"
                      className="metro-wayfinding-canvas-hit is-line"
                      aria-label={`${description} · ${band.label}`}
                      title={`双击编辑${band.label}`}
                      style={{
                        left: `${band.left}px`,
                        top: `${band.top}px`,
                        width: `${band.width}px`,
                        height: `${band.height}px`,
                      }}
                      onClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
                        event.stopPropagation();
                        onSelect(box.rowIndex, box.element.id);
                      }}
                      onDoubleClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
                        event.stopPropagation();
                        onSelect(box.rowIndex, box.element.id);
                        if (!disabled) {
                          beginLineInlineEdit(box, band);
                        }
                      }}
                      {...elementDragProps(box)}
                    />
                  ))
                ) : (
                  <button
                    type="button"
                    className="metro-wayfinding-canvas-hit"
                    aria-label={description}
                    title={description}
                    onClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
                      event.stopPropagation();
                      onSelect(box.rowIndex, box.element.id);
                    }}
                    onDoubleClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
                      event.stopPropagation();
                      onSelect(box.rowIndex, box.element.id);
                      if (!disabled) {
                        beginInlineEdit(box);
                      }
                    }}
                    {...elementDragProps(box)}
                  />
                )}
              </div>
            );
          })}

          {inlineEditor ? (
            <input
              className="metro-wayfinding-canvas-inline-input"
              aria-label={t('metroWayfindingEditor.action.editInlineText')}
              autoFocus
              value={inlineEditor.value}
              style={{
                left: `${inlineEditor.rect.left}px`,
                top: `${inlineEditor.rect.top}px`,
                width: `${Math.max(inlineEditor.rect.width, 24)}px`,
                height: `${inlineEditor.rect.height}px`,
                fontSize: `${inlineEditor.fontSize}px`,
              }}
              onChange={(event) => {
                // React 事件池 / 异步 updater 里 currentTarget 可能已置空，先取出值再更新状态。
                const value = event.currentTarget.value;
                setInlineEditor((current) => (current ? { ...current, value } : current));
              }}
              onBlur={commitInlineEditor}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  commitInlineEditor();
                  return;
                }
                if (event.key === 'Escape') {
                  event.preventDefault();
                  setInlineEditor(null);
                }
              }}
            />
          ) : null}
        </div>
      </div>

      {!svgReady && !assetError ? (
        <p className="metro-wayfinding-canvas-loading" role="status">
          <span className="material-symbols-outlined" aria-hidden="true">
            progress_activity
          </span>
          正在准备牌面素材…
        </p>
      ) : null}

      {assetError ? (
        <div className="metro-wayfinding-canvas-error" role="alert">
          <span>{assetError}</span>
          <Button
            variant="secondary"
            onClick={() => {
              setAssetError('');
              setSvgReady(false);
              void loadMetroWayfindingSvgAssets(layout)
                .then(() => setSvgReady(true))
                .catch((error: unknown) =>
                  setAssetError(error instanceof Error ? error.message : '牌面素材加载失败。'),
                );
            }}
          >
            重试
          </Button>
        </div>
      ) : null}

      {!hasElements ? (
        <div className="metro-wayfinding-canvas-empty" role="status">
          <span className="material-symbols-outlined" aria-hidden="true">
            signpost
          </span>
          <strong>{t('metroWayfindingEditor.empty.title')}</strong>
          <p>{t('metroWayfindingEditor.empty.description')}</p>
          <div>
            <Button variant="primary" icon="add" disabled={disabled} onClick={onAddElement}>
              {t('metroWayfindingEditor.action.addElement')}
            </Button>
            <Button
              variant="secondary"
              icon="dashboard_customize"
              disabled={disabled}
              onClick={onOpenTemplateLibrary}
            >
              {t('metroWayfindingEditor.action.openTemplateLibrary')}
            </Button>
          </div>
        </div>
      ) : null}

      <EditorZoomControls
        fitLabel={t('metroWayfindingEditor.action.fitCanvas')}
        scale={zoomLabel / 100}
        onFit={resetView}
        onZoomIn={() => setZoom((current) => Math.min(CANVAS_MAX_ZOOM, current * 1.2))}
        onZoomOut={() => setZoom((current) => Math.max(CANVAS_MIN_ZOOM, current / 1.2))}
      />
    </div>
  );
}
