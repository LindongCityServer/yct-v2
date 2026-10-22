'use client';

import { requestConfirmation } from '../lib/client-dialog-events';

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { appPath } from '../lib/app-paths';
import { useI18n } from '../lib/client-i18n';
import { findTextContinuation, matchTextContinuation } from '../lib/text-continuation';
import type { MetroWayfindingExample } from '../lib/metro-wayfinding-examples';
import {
  dispatchMetroWayfindingCompositionAction,
  publishMetroWayfindingImportLifecycleEvent,
  publishMetroWayfindingInspectorSnapshot,
  subscribeMetroWayfindingCompositionActions,
  subscribeMetroWayfindingImportLifecycleEvents,
  type MetroWayfindingCompositionAction,
  type MetroWayfindingElementAction,
} from '../lib/client-metro-wayfinding-events';
import {
  METRO_WAYFINDING_IMPORT_MAX_FILE_BYTES,
  METRO_WAYFINDING_IMPORT_MAX_FILES,
  METRO_WAYFINDING_SEMANTIC_TARGET_STYLE,
  parseMetroWayfindingImportFiles,
  reorderMetroWayfindingImportRows,
  resolveMetroWayfindingImportPreview,
  type MetroWayfindingImportMode,
  type MetroWayfindingImportPreview,
} from '../lib/metro-wayfinding-import';
import { MetroWayfindingInspector } from './metro-wayfinding-inspector';
import {
  createMetroWayfindingElement,
  createMetroWayfindingTextRow,
  duplicateMetroWayfindingElement,
  extractMetroWayfindingLineNumber,
  METRO_WAYFINDING_COMBINATION_DEFAULT_SCALE,
  METRO_WAYFINDING_COMBINATION_MAX_SCALE,
  METRO_WAYFINDING_COMBINATION_MIN_SCALE,
  METRO_WAYFINDING_LARGE_TEXT_FRAMED_FONT_SIZE,
  METRO_WAYFINDING_LARGE_TEXT_UNFRAMED_FONT_SIZE,
  METRO_WAYFINDING_DIVIDER_WIDTH,
  metroWayfindingArrowOptions,
  metroWayfindingBackgroundPalette,
  metroWayfindingFacilityOptions,
  metroWayfindingForegroundPalette,
  normalizeMetroWayfindingLineNumber,
  parseMetroWayfindingLayout,
  resolveMetroArrowIconAssetName,
  resolveMetroFacilityDefaultVariant,
  resolveMetroFacilityDirectionLabel,
  resolveMetroFacilityDirectionOptions,
  resolveMetroFacilityIconAssetName,
  resolveMetroFacilityMirrorAxis,
  resolveMetroFacilityVariantLabel,
  resolveMetroFacilityVariantOptions,
  resolveMetroWayfindingArrowBoundarySide,
  resolveMetroWayfindingCombinationScaleForFillMode,
  resolveMetroWayfindingFacilityDefaultDirection,
  resolveMetroWayfindingInsertionContextDefaults,
  resolveMetroWayfindingRowContextDefaults,
  resolveMetroWayfindingTextMetrics,
  reverseMetroWayfindingLayout,
  serializeMetroWayfindingLayout,
  concatMetroLargeTextValue,
  splitMetroLargeTextRuns,
  type MetroWayfindingElement,
  type MetroWayfindingCombinationChild,
  type MetroWayfindingCombinationElement,
  type MetroWayfindingCombinationFillMode,
  type MetroWayfindingCombinationStripePosition,
  type MetroWayfindingFrameFillMode,
  type MetroWayfindingFrameShape,
  type MetroWayfindingIconOption,
  type MetroWayfindingIconVariant,
  type MetroWayfindingLargeTextElement,
  type MetroWayfindingLargeTextRun,
  type MetroWayfindingLargeTextSuffix,
  type MetroWayfindingLayout,
  type MetroWayfindingLayoutMode,
  type MetroWayfindingLineSegment,
  type MetroWayfindingMainSegment,
  type MetroWayfindingProjectCanvas,
  type MetroWayfindingTextElement,
  type MetroWayfindingTextAlign,
  type MetroWayfindingTextRow,
} from '../lib/metro-wayfinding';

type Translate = ReturnType<typeof useI18n>['t'];

/** 导视牌是否已经排了内容——只要任一行有元素就算「有内容」。 */
function hasMetroWayfindingContent(layout: MetroWayfindingLayout): boolean {
  return layout.rows.some((elements) => elements.length > 0);
}

export function MetroWayfindingEditor({
  value,
  canvasWidth,
  canvasHeight,
  disabled,
  lineColorOptions,
  textSuggestions,
  examples = [],
  onLoadExample,
  stationOptions = [],
  selectedStationName,
  onStationChange,
  lineOptions = [],
  selectedLineId,
  onLineChange,
  onCanvasHeightChange,
  onCanvasWidthChange,
  onChange,
  rendersInspector = true,
  lineKeysByColor,
  editorId: editorIdProp,
}: Readonly<{
  value: string;
  canvasWidth: number;
  canvasHeight: number;
  disabled: boolean;
  lineColorOptions: Array<{ value: string; label: string; aliases?: string[] }>;
  textSuggestions?: string[];
  examples?: readonly MetroWayfindingExample[];
  onLoadExample?: (example: MetroWayfindingExample, stationName?: string) => void;
  stationOptions?: readonly string[];
  selectedStationName?: string;
  onStationChange?: (stationName: string) => void;
  lineOptions?: ReadonlyArray<{ value: string; label: string }>;
  selectedLineId?: string;
  onLineChange?: (lineId: string) => void;
  onCanvasHeightChange: (height: number) => void;
  onCanvasWidthChange: (width: number) => void;
  onChange: (value: string) => void;
  /**
   * 是否由编辑器本体渲染「插入建议」「宽度警告」。
   * 宽屏下这两个面板由宿主容器渲染到预览面板下方（见 MetroWayfindingInspector），此时传 false。
   */
  rendersInspector?: boolean;
  /**
   * 颜色（大写十六进制）→ RMP 线路键（如 `#8CC220` → `sh2`）。
   *
   * RMP 存档不含线路名，线路键是推导线路编号的唯一原料（`sh2` → 2 号线）。
   * 窄屏下编辑器本体渲染 Inspector，需要把这份映射传下去。
   */
  lineKeysByColor?: ReadonlyMap<string, string>;
  /**
   * 由宿主指定的编辑器标识。宿主需要用它订阅同一 editorId 的只读快照。
   * 不传时回落到 useId()，保证单独使用组件时仍然可用。
   */
  editorId?: string;
}>) {
  const reactId = useId();
  const { t } = useI18n();
  const editorId = editorIdProp ?? reactId;
  const importInputRef = useRef<HTMLInputElement>(null);
  const [layout, setLayout] = useState(() => parseMetroWayfindingLayout(value));
  const layoutRef = useRef(layout);
  // 导视牌已排内容时默认收起「版式与外观」，把版面让给内容；空牌才默认展开（此时正需要选版式）。
  const [isToolbarExpanded, setIsToolbarExpanded] = useState(
    () => !hasMetroWayfindingContent(parseMetroWayfindingLayout(value)),
  );
  // 内容常常是在挂载之后才进来的（套用示例 / 导入 RMP 项目），此时首帧判定已经错过了。
  // 只在「空 → 非空」这一跳收起一次：排版过程中的每次编辑都会更新 layout，
  // 若改成「有内容就收起」，用户手动展开后一敲字就会被折叠回去。
  const hadContentRef = useRef(!isToolbarExpanded);
  useEffect(() => {
    const hasContent = hasMetroWayfindingContent(layout);
    if (hasContent && !hadContentRef.current) setIsToolbarExpanded(false);
    hadContentRef.current = hasContent;
  }, [layout]);
  const [selection, setSelection] = useState(() => ({
    rowIndex: 0,
    elementId: parseMetroWayfindingLayout(value).rows[0]?.[0]?.id ?? '',
  }));
  const [draggedElement, setDraggedElement] = useState<{
    rowIndex: number;
    elementId: string;
  } | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    rowIndex: number;
    elementId: string;
    placement: 'before' | 'after';
  } | null>(null);
  const [importPreview, setImportPreview] = useState<MetroWayfindingImportPreview>();
  const [importMode, setImportMode] = useState<MetroWayfindingImportMode>('semantic');
  const [importError, setImportError] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [isImportDragActive, setIsImportDragActive] = useState(false);
  const importDragDepthRef = useRef(0);
  const [isProjectDialogOpen, setIsProjectDialogOpen] = useState(false);
  const [projectDialogView, setProjectDialogView] = useState<'examples' | 'import'>('examples');

  useEffect(() => {
    const nextLayout = parseMetroWayfindingLayout(value);
    layoutRef.current = nextLayout;
    setLayout(nextLayout);
    setSelection((current) => {
      const rowIndex = nextLayout.mode === 'double' ? Math.min(current.rowIndex, 1) : 0;
      const row = nextLayout.rows[rowIndex] ?? [];
      if (row.some((element) => element.id === current.elementId)) {
        return { rowIndex, elementId: current.elementId };
      }
      const initialSelection = resolveMetroWayfindingInitialSelection(nextLayout);
      return initialSelection.elementId
        ? initialSelection
        : { rowIndex, elementId: row[0]?.id ?? '' };
    });
  }, [value]);

  const applyAction = useCallback(
    (action: MetroWayfindingCompositionAction) => {
      const next = reduceMetroWayfindingAction(layoutRef.current, action);
      layoutRef.current = next;
      setLayout(next);
      onChange(serializeMetroWayfindingLayout(next));
    },
    [onChange],
  );

  useEffect(
    () => subscribeMetroWayfindingCompositionActions(editorId, applyAction),
    [applyAction, editorId],
  );

  useEffect(
    () =>
      subscribeMetroWayfindingImportLifecycleEvents(editorId, (event) => {
        if (event.type === 'ExternalWayfindingProjectParsed') {
          setImportPreview(event.payload.preview);
          setImportMode(event.payload.preview.source === 'yct' ? 'source-style' : 'semantic');
          setImportError('');
          setIsProjectDialogOpen(false);
          return;
        }
        if (event.type === 'ExternalWayfindingImportFailed') {
          setImportPreview(undefined);
          setImportError(event.payload.message);
          setProjectDialogView('import');
          setIsProjectDialogOpen(true);
          return;
        }
        if (event.type !== 'MetroWayfindingProjectImported') return;
        const preview = event.payload.preview;
        setSelection({
          rowIndex: 0,
          elementId: preview.layout.rows[0]?.[0]?.id ?? '',
        });
        setDraggedElement(null);
        setDropTarget(null);
        onCanvasWidthChange(preview.canvas.widthM);
        onCanvasHeightChange(preview.canvas.heightM);
        dispatchMetroWayfindingCompositionAction({
          editorId,
          action: { type: 'replace', layout: preview.layout },
        });
        setImportPreview(undefined);
        setImportError('');
        setIsProjectDialogOpen(false);
      }),
    [editorId, onCanvasHeightChange, onCanvasWidthChange],
  );

  useEffect(() => {
    if (!importPreview) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setImportPreview(undefined);
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [importPreview]);

  useEffect(() => {
    if (!isProjectDialogOpen) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setIsProjectDialogOpen(false);
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [isProjectDialogOpen]);

  const dispatchComposition = (action: MetroWayfindingCompositionAction) => {
    if (action.type === 'add' || action.type === 'duplicate') {
      setSelection({ rowIndex: action.rowIndex, elementId: action.element.id });
    } else if (
      action.type === 'remove' &&
      action.rowIndex === selection.rowIndex &&
      action.elementId === selection.elementId
    ) {
      const actionElements = layout.rows[action.rowIndex] ?? [];
      const removedIndex = actionElements.findIndex((element) => element.id === action.elementId);
      setSelection({
        rowIndex: action.rowIndex,
        elementId:
          actionElements[removedIndex + 1]?.id ?? actionElements[removedIndex - 1]?.id ?? '',
      });
    }
    dispatchMetroWayfindingCompositionAction({ editorId, action });
  };
  const dispatchElement = (rowIndex: number, action: MetroWayfindingElementAction) =>
    dispatchComposition({ ...action, rowIndex });
  const activeElements = layout.rows[selection.rowIndex] ?? [];
  const selectedElement =
    activeElements.find((element) => element.id === selection.elementId) ?? activeElements[0];
  const selectedElementIndex = selectedElement
    ? activeElements.findIndex((element) => element.id === selectedElement.id)
    : -1;
  const visibleRows = layout.rows.slice(0, layout.mode === 'double' ? 2 : 1);
  const hasElements = layout.rows.some((elements) => elements.length > 0);
  // 把编辑器状态广播为只读快照，供编辑器外部的宿主容器（宽屏下预览面板下方）渲染辅助面板。
  // 用 ref 持有 lineColorOptions 可避免宿主传入的新数组字面量导致 effect 反复触发。
  const lineColorOptionsRef = useRef(lineColorOptions);
  lineColorOptionsRef.current = lineColorOptions;
  useEffect(() => {
    publishMetroWayfindingInspectorSnapshot({
      editorId,
      layout: layoutRef.current,
      rowIndex: selection.rowIndex,
      selectedElementId: selection.elementId,
      canvasWidth,
      canvasHeight,
      disabled,
      lineColorOptions: lineColorOptionsRef.current,
    });
  }, [editorId, layout, selection, canvasWidth, canvasHeight, disabled]);
  const backgroundColorOptions = mergeMetroColorOptions(
    metroWayfindingBackgroundPalette,
    lineColorOptions,
  );
  const activeImportPreview = importPreview
    ? resolveMetroWayfindingImportPreview(importPreview, importMode)
    : undefined;
  const activeImportWarnings = activeImportPreview?.warnings ?? [];
  /**
   * 当前转换方式下的行元素（语义归一化后的结果）。
   * 行清单与牌面预览都取它，保证弹窗里看到的**就是**即将导入的内容——
   * 切换「仅语义 / 保留源样式」时两处同步变化。
   */
  const activeImportRows = activeImportPreview?.layout.rows ?? importPreview?.layout.rows ?? [];

  useEffect(() => {
    document
      .getElementById(`${editorId}-${selection.elementId}-tab`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  }, [editorId, selection.elementId]);

  const handleElementNavigationKeyDown = (
    event: KeyboardEvent<HTMLOListElement>,
    rowIndex: number,
  ) => {
    const target = event.target as HTMLElement;
    const elements = layout.rows[rowIndex] ?? [];
    if (!target.matches('[role="tab"]') || !elements.length) return;
    let nextIndex = elements.findIndex((element) => element.id === target.dataset.elementId);
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex -= 1;
    else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex += 1;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = elements.length - 1;
    else return;
    event.preventDefault();
    const nextElement = elements[Math.max(0, Math.min(elements.length - 1, nextIndex))];
    if (nextElement) {
      setSelection({ rowIndex, elementId: nextElement.id });
      window.requestAnimationFrame(() => {
        document.getElementById(`${editorId}-${nextElement.id}-tab`)?.focus();
      });
    }
  };

  const handleElementDragStart = (
    event: ReactDragEvent<HTMLButtonElement>,
    rowIndex: number,
    elementId: string,
  ) => {
    if (disabled || (layout.rows[rowIndex]?.length ?? 0) < 2) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', elementId);
    setDraggedElement({ rowIndex, elementId });
    setSelection({ rowIndex, elementId });
  };

  const handleElementDragOver = (
    event: ReactDragEvent<HTMLButtonElement>,
    rowIndex: number,
    targetElementId: string,
  ) => {
    if (
      !draggedElement ||
      draggedElement.rowIndex !== rowIndex ||
      draggedElement.elementId === targetElementId
    )
      return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const bounds = event.currentTarget.getBoundingClientRect();
    const placement = event.clientX < bounds.left + bounds.width / 2 ? 'before' : 'after';
    setDropTarget((current) =>
      current?.rowIndex === rowIndex &&
      current.elementId === targetElementId &&
      current.placement === placement
        ? current
        : { rowIndex, elementId: targetElementId, placement },
    );
  };

  const handleElementDrop = (
    event: ReactDragEvent<HTMLButtonElement>,
    rowIndex: number,
    targetElementId: string,
  ) => {
    if (draggedElement?.rowIndex !== rowIndex) return;
    const elementId = draggedElement.elementId || event.dataTransfer.getData('text/plain');
    if (!elementId || elementId === targetElementId) return;
    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    const placement = event.clientX < bounds.left + bounds.width / 2 ? 'before' : 'after';
    dispatchElement(rowIndex, { type: 'reorder', elementId, targetElementId, placement });
    setDraggedElement(null);
    setDropTarget(null);
  };

  const handleElementDragEnd = () => {
    setDraggedElement(null);
    setDropTarget(null);
  };

  const changeLayoutMode = (mode: MetroWayfindingLayoutMode) => {
    const rows = layout.rows.map((row) => [...row]);
    if (mode === 'double' && rows.length < 2) rows.push([]);
    if (mode !== 'double' && selection.rowIndex !== 0) {
      setSelection({ rowIndex: 0, elementId: rows[0]?.[0]?.id ?? '' });
    }
    const signLength =
      layout.mode === 'vertical'
        ? Math.max(1, Math.round(canvasHeight))
        : Math.max(1, Math.round(canvasWidth / 128));
    if (mode === 'vertical') {
      onCanvasWidthChange(1);
      onCanvasHeightChange(signLength);
    } else {
      onCanvasWidthChange(signLength);
      onCanvasHeightChange(mode === 'double' ? 2 : 1);
    }
    dispatchComposition({ type: 'replace', layout: { ...layout, mode, rows } });
  };

  const clearLayoutElements = async () => {
    if (
      !hasElements ||
      !(await requestConfirmation(t('metroWayfindingEditor.confirm.clear')))
    )
      return;
    setSelection({ rowIndex: 0, elementId: '' });
    setDraggedElement(null);
    setDropTarget(null);
    dispatchComposition({
      type: 'replace',
      layout: { ...layout, rows: layout.rows.map(() => []) },
    });
  };

  const openProjectDialog = (requestedView: 'examples' | 'import' = 'examples') => {
    setImportError('');
    setProjectDialogView(
      requestedView === 'examples' && examples.length && onLoadExample ? 'examples' : 'import',
    );
    setIsProjectDialogOpen(true);
  };

  const handleImportFiles = async (files: File[]) => {
    if (!files.length) return;
    setIsImporting(true);
    setImportError('');
    publishMetroWayfindingImportLifecycleEvent({
      type: 'ExternalWayfindingProjectSelected',
      payload: {
        editorId,
        files: files.map(({ name, size }) => ({ name, size })),
      },
    });
    try {
      if (files.length > METRO_WAYFINDING_IMPORT_MAX_FILES) {
        throw new Error(
          t('metroWayfindingEditor.error.tooManyFiles', {
            count: METRO_WAYFINDING_IMPORT_MAX_FILES,
          }),
        );
      }
      const oversizedFile = files.find(
        (file) => file.size > METRO_WAYFINDING_IMPORT_MAX_FILE_BYTES,
      );
      if (oversizedFile) {
        throw new Error(
          t('metroWayfindingEditor.error.fileTooLarge', {
            name: oversizedFile.name,
            limit: METRO_WAYFINDING_IMPORT_MAX_FILE_BYTES / 1024 / 1024,
          }),
        );
      }
      const inputs = await Promise.all(
        files.map(async (file) => ({ name: file.name, size: file.size, text: await file.text() })),
      );
      const preview = parseMetroWayfindingImportFiles(inputs);
      publishMetroWayfindingImportLifecycleEvent({
        type: 'ExternalWayfindingProjectParsed',
        payload: { editorId, preview },
      });
      if (preview.warnings.length) {
        publishMetroWayfindingImportLifecycleEvent({
          type: 'ExternalWayfindingConversionWarningsRaised',
          payload: { editorId, source: preview.source, warnings: preview.warnings },
        });
      }
    } catch (error) {
      publishMetroWayfindingImportLifecycleEvent({
        type: 'ExternalWayfindingImportFailed',
        payload: {
          editorId,
          message:
            error instanceof Error ? error.message : t('metroWayfindingEditor.error.parseFailed'),
        },
      });
    } finally {
      setIsImporting(false);
    }
  };

  const handleImportInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = '';
    void handleImportFiles(files);
  };

  const isFileDrag = (event: ReactDragEvent<HTMLDivElement>) =>
    event.dataTransfer.types.includes('Files');

  const handleImportDragEnter = (event: ReactDragEvent<HTMLDivElement>) => {
    if (disabled || isImporting || !isFileDrag(event)) return;
    event.preventDefault();
    importDragDepthRef.current += 1;
    setIsImportDragActive(true);
  };

  const handleImportDragOver = (event: ReactDragEvent<HTMLDivElement>) => {
    if (disabled || isImporting || !isFileDrag(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setIsImportDragActive(true);
  };

  const handleImportDragLeave = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    importDragDepthRef.current = Math.max(0, importDragDepthRef.current - 1);
    if (importDragDepthRef.current === 0) setIsImportDragActive(false);
  };

  const handleImportDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    importDragDepthRef.current = 0;
    setIsImportDragActive(false);
    if (disabled || isImporting) return;
    void handleImportFiles(Array.from(event.dataTransfer.files));
  };

  const applyImportPreview = () => {
    if (!importPreview) return;
    const resolvedPreview = resolveMetroWayfindingImportPreview(importPreview, importMode);
    publishMetroWayfindingImportLifecycleEvent({
      type: 'MetroWayfindingProjectImported',
      payload: { editorId, preview: resolvedPreview },
    });
  };

  return (
    <section className="metro-wayfinding-editor" aria-label={t('metroWayfindingEditor.aria.canvas')}>
      <details
        className="metro-wayfinding-toolbar"
        open={isToolbarExpanded}
        onToggle={(event) => setIsToolbarExpanded(event.currentTarget.open)}
      >
        <summary>
          <span className="metro-wayfinding-toolbar-title">
            {t('metroWayfindingEditor.toolbar.title')}
          </span>
          {/*
            标题栏图标：仅作视觉提示，告诉用户模板库 / 反转 / 清空这几个操作藏在折叠面板里。
            不响应点按，展开后自动隐藏（见 CSS），避免与面板内真实的操作按钮重复。
          */}
          <span className="metro-wayfinding-toolbar-hints" aria-hidden="true">
            <span className="material-symbols-outlined">folder_open</span>
            <span className="material-symbols-outlined">flip</span>
            <span className="material-symbols-outlined">delete_sweep</span>
          </span>
          <span
            className="material-symbols-outlined metro-wayfinding-toolbar-expander"
            aria-hidden="true"
          >
            expand_more
          </span>
        </summary>
        <div className="metro-wayfinding-toolbar-content">
          <SegmentedControl
            label={t('metroWayfindingEditor.field.layout')}
            value={layout.mode}
            options={[
              {
                value: 'single',
                label: t('metroWayfindingEditor.option.singleRow'),
                icon: 'view_stream',
              },
              {
                value: 'double',
                label: t('metroWayfindingEditor.option.doubleRow'),
                icon: 'table_rows',
              },
              {
                value: 'vertical',
                label: t('metroWayfindingEditor.option.vertical'),
                icon: 'view_column',
              },
            ]}
            disabled={disabled}
            wide
            onChange={changeLayoutMode}
          />
          <ColorControl
            label={t('metroWayfindingEditor.field.backgroundColor')}
            value={layout.backgroundColor}
            palette={backgroundColorOptions}
            disabled={disabled}
            onChange={(backgroundColor) =>
              dispatchComposition({ type: 'replace', layout: { ...layout, backgroundColor } })
            }
          />
          <ColorControl
            label={t('metroWayfindingEditor.field.defaultForegroundColor')}
            value={layout.foregroundColor}
            palette={metroWayfindingForegroundPalette}
            disabled={disabled}
            onChange={(foregroundColor) =>
              dispatchComposition({ type: 'replace', layout: { ...layout, foregroundColor } })
            }
          />
          {layout.mode === 'double' ? (
            <label className="material-checkbox-row metro-wayfinding-toggle">
              <input
                type="checkbox"
                checked={layout.dividerBetweenRows}
                disabled={disabled}
                onChange={(event) =>
                  dispatchComposition({
                    type: 'replace',
                    layout: { ...layout, dividerBetweenRows: event.currentTarget.checked },
                  })
                }
              />
              <span>{t('metroWayfindingEditor.field.rowDivider')}</span>
            </label>
          ) : null}
          {hasElements ? (
            <div className="metro-wayfinding-toolbar-actions">
              <button
                type="button"
                className="secondary-action-button metro-wayfinding-import-button"
                disabled={disabled || isImporting}
                title={t('metroWayfindingEditor.action.openProjectLibraryTitle')}
                onClick={() => openProjectDialog()}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  {isImporting ? 'progress_activity' : 'folder_open'}
                </span>
                <span>
                  {isImporting
                    ? t('metroWayfindingEditor.status.parsing')
                    : t('metroWayfindingEditor.action.templateLibrary')}
                </span>
              </button>
              <button
                type="button"
                className="secondary-action-button"
                disabled={disabled || layout.mode === 'vertical'}
                onClick={() => dispatchComposition({ type: 'reverse' })}
                title={
                  layout.mode === 'vertical'
                    ? t('metroWayfindingEditor.action.reverseDisabledVertical')
                    : t('metroWayfindingEditor.action.reverseTitle')
                }
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  flip
                </span>
                <span>{t('metroWayfindingEditor.action.reverse')}</span>
              </button>
              <button
                type="button"
                className="secondary-action-button metro-wayfinding-clear-button"
                disabled={disabled}
                onClick={clearLayoutElements}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  delete_sweep
                </span>
                <span>{t('metroWayfindingEditor.action.clear')}</span>
              </button>
            </div>
          ) : null}
          <input
            ref={importInputRef}
            type="file"
            className="sr-only"
            accept=".json,application/json"
            multiple
            disabled={disabled || isImporting}
            onChange={handleImportInputChange}
          />
        </div>
      </details>

      {hasElements ? (
        <div className="metro-wayfinding-row-lists">
          {visibleRows.map((elements, rowIndex) => (
            <div
              key={rowIndex}
              className={`metro-wayfinding-row-list${layout.mode !== 'double' ? ' is-single' : ''}`}
            >
              {layout.mode === 'double' ? (
                <strong>
                  {rowIndex === 0
                    ? t('metroWayfindingEditor.row.first')
                    : t('metroWayfindingEditor.row.second')}
                </strong>
              ) : null}
              <ol
                className="metro-wayfinding-element-list"
                role="tablist"
                aria-label={t('metroWayfindingEditor.aria.rowElements', {
                  row:
                    rowIndex === 0
                      ? t('metroWayfindingEditor.row.first')
                      : t('metroWayfindingEditor.row.second'),
                })}
                onKeyDown={(event) => handleElementNavigationKeyDown(event, rowIndex)}
              >
                {elements.map((element) => {
                  const isSelected =
                    rowIndex === selection.rowIndex && element.id === selectedElement?.id;
                  const isIconOnly =
                    element.type === 'facility' ||
                    element.type === 'arrow' ||
                    element.type === 'space' ||
                    element.type === 'divider';
                  const tabLabel = metroElementTabAriaLabel(element, layout.mode, t);
                  const canDrag = !disabled && elements.length > 1;
                  return (
                    <li key={element.id} role="presentation">
                      <button
                        id={`${editorId}-${element.id}-tab`}
                        type="button"
                        role="tab"
                        data-element-id={element.id}
                        aria-selected={isSelected}
                        aria-controls={`${editorId}-element-panel`}
                        aria-label={
                          canDrag
                            ? t('metroWayfindingEditor.aria.draggableTab', { label: tabLabel })
                            : tabLabel
                        }
                        title={canDrag ? t('metroWayfindingEditor.action.dragToReorder') : undefined}
                        tabIndex={isSelected ? 0 : -1}
                        draggable={canDrag}
                        className={[
                          isSelected ? 'is-active' : '',
                          isIconOnly ? 'is-icon-only' : '',
                          canDrag ? 'is-draggable' : '',
                          draggedElement?.rowIndex === rowIndex &&
                          draggedElement.elementId === element.id
                            ? 'is-dragging'
                            : '',
                          dropTarget?.rowIndex === rowIndex && dropTarget.elementId === element.id
                            ? `is-drop-${dropTarget.placement}`
                            : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        onClick={() => setSelection({ rowIndex, elementId: element.id })}
                        onDragStart={(event) => handleElementDragStart(event, rowIndex, element.id)}
                        onDragOver={(event) => handleElementDragOver(event, rowIndex, element.id)}
                        onDrop={(event) => handleElementDrop(event, rowIndex, element.id)}
                        onDragEnd={handleElementDragEnd}
                      >
                        <MetroWayfindingElementTabContent
                          element={element}
                          layoutMode={layout.mode}
                        />
                      </button>
                    </li>
                  );
                })}
                <li className="metro-wayfinding-element-list-add" role="presentation">
                  <button
                    type="button"
                    className="is-icon-only"
                    aria-label={t('metroWayfindingEditor.aria.addElementToRow', {
                      row:
                        rowIndex === 0
                          ? t('metroWayfindingEditor.row.first')
                          : t('metroWayfindingEditor.row.second'),
                    })}
                    title={t('metroWayfindingEditor.action.addElement')}
                    onClick={() =>
                      dispatchElement(rowIndex, {
                        type: 'add',
                        element: createMetroWayfindingElement('facility'),
                      })
                    }
                    disabled={disabled}
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">
                      add
                    </span>
                  </button>
                </li>
              </ol>
            </div>
          ))}
        </div>
      ) : null}

      {!hasElements ? (
        <section
          className="metro-wayfinding-empty-card"
          aria-label={t('metroWayfindingEditor.aria.emptyState')}
        >
          <div>
            <span className="material-symbols-outlined" aria-hidden="true">
              signpost
            </span>
            <div>
              <strong>{t('metroWayfindingEditor.empty.title')}</strong>
              <span>{t('metroWayfindingEditor.empty.description')}</span>
            </div>
          </div>
          <div className="metro-wayfinding-empty-card-actions">
            <button
              type="button"
              className="primary-action-button"
              disabled={disabled}
              onClick={() =>
                dispatchElement(0, {
                  type: 'add',
                  element: createMetroWayfindingElement('facility'),
                })
              }
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                add
              </span>
              {t('metroWayfindingEditor.action.addElement')}
            </button>
            <button
              type="button"
              className="secondary-action-button"
              disabled={disabled || isImporting}
              onClick={() => openProjectDialog('examples')}
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                dashboard_customize
              </span>
              {t('metroWayfindingEditor.action.openTemplateLibrary')}
            </button>
          </div>
        </section>
      ) : null}

      {/*
        窄屏回落：宽屏下这两个面板由宿主渲染到预览面板下方，此处只在宿主不接管时就地渲染。
        复用同一个 Inspector 组件，保证两条路径的渲染结果完全一致。
      */}
      {rendersInspector ? (
        <MetroWayfindingInspector
          editorId={editorId}
          lineKeysByColor={lineKeysByColor}
          onAction={dispatchElement}
        />
      ) : null}

      {selectedElement ? (
        <div
          id={`${editorId}-element-panel`}
          role="tabpanel"
          aria-labelledby={`${editorId}-${selectedElement.id}-tab`}
          className="metro-wayfinding-element-panel"
        >
          <MetroWayfindingElementEditor
            element={selectedElement}
            layoutMode={layout.mode}
            disabled={disabled}
            isFirst={selectedElementIndex === 0}
            isLast={selectedElementIndex === activeElements.length - 1}
            lineColorOptions={lineColorOptions}
            backgroundColorOptions={backgroundColorOptions}
            inheritedBackgroundColor={layout.backgroundColor}
            inheritedForegroundColor={layout.foregroundColor}
            textSuggestions={textSuggestions}
            onAction={(action) => dispatchElement(selection.rowIndex, action)}
          />
        </div>
      ) : null}
      {isProjectDialogOpen ? (
        <div
          className="modal-backdrop metro-wayfinding-project-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setIsProjectDialogOpen(false);
          }}
        >
          <section
            className="modal-panel metro-wayfinding-project-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${editorId}-project-dialog-heading`}
          >
            <header>
              <div>
                <span>{t('metroWayfindingEditor.projectDialog.eyebrow')}</span>
                <h2 id={`${editorId}-project-dialog-heading`}>
                  {t('metroWayfindingEditor.projectDialog.title')}
                </h2>
              </div>
              <button
                type="button"
                className="icon-button"
                aria-label={t('metroWayfindingEditor.projectDialog.closeAria')}
                title={t('metroWayfindingEditor.action.close')}
                onClick={() => setIsProjectDialogOpen(false)}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  close
                </span>
              </button>
            </header>
            <SegmentedControl
              label={t('metroWayfindingEditor.projectDialog.source')}
              value={projectDialogView}
              options={[
                {
                  value: 'examples',
                  label: t('metroWayfindingEditor.projectDialog.templates'),
                  icon: 'dashboard_customize',
                },
                {
                  value: 'import',
                  label: t('metroWayfindingEditor.projectDialog.import'),
                  icon: 'upload_file',
                },
              ]}
              disabled={disabled || isImporting}
              wide
              onChange={setProjectDialogView}
            />
            <div className="metro-wayfinding-project-dialog-body">
              {projectDialogView === 'examples' ? (
                examples.length && onLoadExample ? (
                  <MetroWayfindingExampleList
                    examples={examples}
                    disabled={disabled}
                    onLoadExample={(example, stationName) => {
                      setSelection(resolveMetroWayfindingInitialSelection(example.project.layout));
                      onLoadExample(example, stationName);
                      setIsProjectDialogOpen(false);
                    }}
                    stationOptions={stationOptions}
                    selectedStationName={selectedStationName}
                    onStationChange={onStationChange}
                    lineOptions={lineOptions}
                    selectedLineId={selectedLineId}
                    onLineChange={onLineChange}
                  />
                ) : (
                  <div className="metro-wayfinding-project-empty">
                    <span className="material-symbols-outlined" aria-hidden="true">
                      dashboard_customize
                    </span>
                    <span>{t('metroWayfindingEditor.examples.empty')}</span>
                  </div>
                )
              ) : (
                <div
                  className={`metro-wayfinding-project-import${isImportDragActive ? ' is-drag-active' : ''}`}
                  onDragEnter={handleImportDragEnter}
                  onDragOver={handleImportDragOver}
                  onDragLeave={handleImportDragLeave}
                  onDrop={handleImportDrop}
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    upload_file
                  </span>
                  <div className="metro-wayfinding-project-import-copy">
                    <strong>{t('metroWayfindingEditor.import.title')}</strong>
                    <p>{t('metroWayfindingEditor.import.description')}</p>
                  </div>
                  <div className="metro-wayfinding-project-import-sources">
                    <span>{t('metroWayfindingEditor.import.supportedSources')}</span>
                    <ul>
                      <li>
                        <span>{t('metroWayfindingEditor.import.sourceYct')}</span>
                        <small>{t('metroWayfindingEditor.import.sourceYctHint')}</small>
                      </li>
                      <li>
                        <a
                          href="https://centralgo.site/vitool/vitool.html"
                          target="_blank"
                          rel="noreferrer"
                        >
                          NaL 导向标志设计器
                          <span className="material-symbols-outlined" aria-hidden="true">
                            open_in_new
                          </span>
                        </a>
                        <small>{t('metroWayfindingEditor.import.sourceExternalHint')}</small>
                      </li>
                      <li>
                        <a href="https://signmaker.chitose.city/" target="_blank" rel="noreferrer">
                          Chitose.City Sign Maker
                          <span className="material-symbols-outlined" aria-hidden="true">
                            open_in_new
                          </span>
                        </a>
                        <small>{t('metroWayfindingEditor.import.sourceExternalHint')}</small>
                      </li>
                    </ul>
                  </div>
                  <div className="metro-wayfinding-project-import-limits">
                    <span>{t('metroWayfindingEditor.import.fileLimits')}</span>
                    <small>
                      {t('metroWayfindingEditor.import.fileLimitsDescription', {
                        count: METRO_WAYFINDING_IMPORT_MAX_FILES,
                        size: METRO_WAYFINDING_IMPORT_MAX_FILE_BYTES / 1024 / 1024,
                      })}
                    </small>
                  </div>
                  <div className="metro-wayfinding-project-import-drop-hint" aria-live="polite">
                    <span className="material-symbols-outlined" aria-hidden="true">
                      upload_file
                    </span>
                    <span>
                      {isImportDragActive
                        ? t('metroWayfindingEditor.import.dropActive')
                        : t('metroWayfindingEditor.import.dropHint')}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="primary-action-button"
                    disabled={disabled || isImporting}
                    onClick={() => importInputRef.current?.click()}
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">
                      {isImporting ? 'progress_activity' : 'upload_file'}
                    </span>
                    {isImporting
                      ? t('metroWayfindingEditor.status.parsingFiles')
                      : t('metroWayfindingEditor.import.selectFiles')}
                  </button>
                  {importError ? (
                    <p className="metro-wayfinding-import-error" role="alert">
                      {importError}
                    </p>
                  ) : null}
                </div>
              )}
            </div>
          </section>
        </div>
      ) : null}
      {importPreview ? (
        <div
          className="modal-backdrop metro-wayfinding-import-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setImportPreview(undefined);
          }}
        >
          <section
            className="modal-panel metro-wayfinding-import-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${editorId}-import-heading`}
          >
            <header>
              <div>
                <span>{t('metroWayfindingEditor.importPreview.eyebrow')}</span>
                <h2 id={`${editorId}-import-heading`}>{importPreview.projectName}</h2>
              </div>
              <button
                type="button"
                className="icon-button"
                aria-label={t('metroWayfindingEditor.importPreview.closeAria')}
                title={t('metroWayfindingEditor.action.close')}
                onClick={() => setImportPreview(undefined)}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  close
                </span>
              </button>
            </header>

            {/*
              中间滚动区：包住 SegmentedControl / dl / ol / warnings。
              弹窗改为 grid 三行布局（header / 滚动内容 / footer），
              footer 不再 sticky，内容滚到底也不会被底栏遮挡。
            */}
            <div className="metro-wayfinding-import-scroll">
              {importPreview.source !== 'yct' ? (
                <SegmentedControl
                  label={t('metroWayfindingEditor.importPreview.mode')}
                  value={importMode}
                  options={[
                    {
                      value: 'semantic',
                      label: t('metroWayfindingEditor.importPreview.modeSemantic'),
                      icon: 'conversion_path',
                    },
                    {
                      value: 'source-style',
                      label: t('metroWayfindingEditor.importPreview.modeSourceStyle'),
                      icon: 'palette',
                    },
                  ]}
                  disabled={disabled}
                  wide
                  onChange={setImportMode}
                />
              ) : null}

              {/*
                转换后的牌面内容预览：与「版式模板」页签的示例卡片同一套视觉，
                数据取自 activeImportPreview（已按当前转换方式归一化），
                因此切换「仅语义 / 保留源样式」时这里会实时变化。
              */}
              <div className="metro-wayfinding-import-sign-preview">
                <MetroWayfindingSignPreview
                  layout={activeImportPreview?.layout ?? importPreview.layout}
                  canvas={activeImportPreview?.canvas ?? importPreview.canvas}
                />
                <small>{t('metroWayfindingEditor.importPreview.previewNote')}</small>
              </div>

              <dl className="metro-wayfinding-import-facts">
                <div>
                  <dt>{t('metroWayfindingEditor.importPreview.source')}</dt>
                  <dd>{importPreview.sourceLabel}</dd>
                </div>
                <div>
                  <dt>{t('metroWayfindingEditor.importPreview.sourceStyle')}</dt>
                  <dd>{importPreview.styleLabel}</dd>
                </div>
                <div>
                  <dt>{t('metroWayfindingEditor.importPreview.targetStyle')}</dt>
                  <dd>
                    {importPreview.source === 'yct'
                      ? importPreview.styleLabel
                      : (activeImportPreview?.styleLabel ?? METRO_WAYFINDING_SEMANTIC_TARGET_STYLE)}
                  </dd>
                </div>
                <div>
                  <dt>{t('metroWayfindingEditor.field.layout')}</dt>
                  <dd>
                    {activeImportPreview?.layout.mode === 'double'
                      ? t('metroWayfindingEditor.option.doubleRow')
                      : activeImportPreview?.layout.mode === 'vertical'
                        ? t('metroWayfindingEditor.option.vertical')
                        : t('metroWayfindingEditor.option.singleRow')}
                    {' · '}
                    {activeImportPreview?.canvas.widthM ?? importPreview.canvas.widthM} ×{' '}
                    {activeImportPreview?.canvas.heightM ?? importPreview.canvas.heightM}
                  </dd>
                </div>
              </dl>

              <ol
                className="metro-wayfinding-import-rows"
                aria-label={t('metroWayfindingEditor.importPreview.rowsAria')}
              >
                {importPreview.rowSources.map((row, index) => {
                  /*
                    行内元素取**转换后**的结果（`activeImportRows`），
                    `row.elements` 只是源工程的原始元素，仅作兜底。
                    否则切换「转换方式」时上面牌面变了、下面清单没变。
                  */
                  const rowElements = activeImportRows[index] ?? row.elements;
                  return (
                    <li key={`${row.fileName}-${index}`}>
                      <div>
                        <span>
                          {index === 0
                            ? t('metroWayfindingEditor.row.first')
                            : t('metroWayfindingEditor.row.second')}
                        </span>
                        {/*
                          用图形化预览替代纯文本摘要：复用模板库的预览组件，
                          让审核者一眼看到「出口箭头 + 卫生间图标 + 文字 + …」的实际形态。
                          `sr-only` 摘要给屏幕阅读器与无图标的场景兜底。
                        */}
                        <div
                          className="metro-wayfinding-import-row-preview metro-wayfinding-element-strip"
                          aria-hidden="true"
                        >
                          {rowElements.length ? (
                            rowElements.map((element) => (
                              <MetroWayfindingExamplePreviewElement
                                key={element.id}
                                element={element}
                                layoutMode={
                                  activeImportPreview?.layout.mode ?? importPreview.layout.mode
                                }
                                /*
                                  刻意不复原整块牌面的底色/文字色：这里只是「图标 + 文字」
                                  的一字排开清单，颜色交给元素自身（线路色、方框填充等
                                  语义色），其余一律用弹窗的中性色。
                                */
                                inheritedBackgroundColor="transparent"
                                inheritedForegroundColor="inherit"
                                renderSpaceIcons
                                neutralizeColors
                              />
                            ))
                          ) : (
                            <span className="metro-wayfinding-example-preview-element is-space is-flex">
                              <span className="material-symbols-outlined" aria-hidden="true">
                                arrow_range
                              </span>
                            </span>
                          )}
                        </div>
                        <small>{row.label}</small>
                        <span className="sr-only">{row.summary}</span>
                      </div>
                      {importPreview.rowSources.length > 1 ? (
                        <div className="metro-wayfinding-import-row-actions">
                          <button
                            type="button"
                            className="icon-button"
                            aria-label={t('metroWayfindingEditor.action.moveRowUpAria')}
                            title={t('metroWayfindingEditor.action.moveUp')}
                            disabled={index === 0}
                            onClick={() =>
                              setImportPreview((current) =>
                                current
                                  ? reorderMetroWayfindingImportRows(current, index, index - 1)
                                  : current,
                              )
                            }
                          >
                            <span className="material-symbols-outlined" aria-hidden="true">
                              arrow_upward
                            </span>
                          </button>
                          <button
                            type="button"
                            className="icon-button"
                            aria-label={t('metroWayfindingEditor.action.moveRowDownAria')}
                            title={t('metroWayfindingEditor.action.moveDown')}
                            disabled={index === importPreview.rowSources.length - 1}
                            onClick={() =>
                              setImportPreview((current) =>
                                current
                                  ? reorderMetroWayfindingImportRows(current, index, index + 1)
                                  : current,
                              )
                            }
                          >
                            <span className="material-symbols-outlined" aria-hidden="true">
                              arrow_downward
                            </span>
                          </button>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ol>

              {activeImportWarnings.length ? (
                <section
                  className="metro-wayfinding-import-warnings"
                  aria-label={t('metroWayfindingEditor.importPreview.warningsAria')}
                >
                  <header>
                    <span className="material-symbols-outlined" aria-hidden="true">
                      warning
                    </span>
                    <strong>{t('metroWayfindingEditor.importPreview.warningsTitle')}</strong>
                  </header>
                  <ul>
                    {activeImportWarnings.map((warning) => (
                      <li key={`${warning.code}-${warning.message}`}>
                        {warning.message}
                        {warning.count > 1
                          ? t('metroWayfindingEditor.importPreview.warningCount', {
                              count: warning.count,
                            })
                          : ''}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </div>

            <footer>
              <span>
                {t('metroWayfindingEditor.importPreview.footerSummary', {
                  count: importPreview.files.length,
                  size: METRO_WAYFINDING_IMPORT_MAX_FILE_BYTES / 1024 / 1024,
                })}
              </span>
              <div>
                <button
                  type="button"
                  className="secondary-action-button"
                  onClick={() => setImportPreview(undefined)}
                >
                  {t('metroWayfindingEditor.action.cancel')}
                </button>
                <button
                  type="button"
                  className="primary-action-button"
                  onClick={applyImportPreview}
                >
                  {hasElements
                    ? t('metroWayfindingEditor.action.replaceSign')
                    : t('metroWayfindingEditor.action.importSign')}
                </button>
              </div>
            </footer>
          </section>
        </div>
      ) : null}
    </section>
  );
}

function MetroWayfindingExampleList({
  examples,
  disabled,
  onLoadExample,
  stationOptions,
  selectedStationName,
  onStationChange,
  lineOptions,
  selectedLineId,
  onLineChange,
}: Readonly<{
  examples: readonly MetroWayfindingExample[];
  disabled: boolean;
  onLoadExample: (example: MetroWayfindingExample, stationName?: string) => void;
  stationOptions?: readonly string[];
  selectedStationName?: string;
  onStationChange?: (stationName: string) => void;
  lineOptions?: ReadonlyArray<{ value: string; label: string }>;
  selectedLineId?: string;
  onLineChange?: (lineId: string) => void;
}>) {
  const { t } = useI18n();
  const [category, setCategory] = useState<'all' | 'entry' | 'transfer' | 'exit'>('all');
  const categoryOptions = [
    { value: 'all' as const, label: t('metroWayfindingEditor.option.all') },
    { value: 'entry' as const, label: t('metroWayfindingEditor.option.entry') },
    { value: 'transfer' as const, label: t('metroWayfindingEditor.option.transfer') },
    { value: 'exit' as const, label: t('metroWayfindingEditor.option.exit') },
  ].filter(
    (option) =>
      option.value === 'all' ||
      examples.some((example) => example.source.category === option.value),
  );
  const activeCategory = categoryOptions.some((option) => option.value === category)
    ? category
    : 'all';
  const visibleExamples =
    activeCategory === 'all'
      ? examples
      : examples.filter((example) => example.source.category === activeCategory);

  return (
    <section className="material-template-examples" aria-label={t('metroWayfindingEditor.examples.aria')}>
      <div className="material-template-examples-toolbar">
        <div className="material-template-examples-heading">
          <strong>{t('metroWayfindingEditor.examples.title')}</strong>
          <span>{t('metroWayfindingEditor.examples.description')}</span>
        </div>
        {(stationOptions?.length && onStationChange) || (lineOptions?.length && onLineChange) ? (
          <div className="material-template-example-context-fields">
            {stationOptions?.length && onStationChange ? (
              <label className="material-field">
                <span>{t('metroWayfindingEditor.examples.station')}</span>
                <select
                  value={selectedStationName ?? ''}
                  disabled={disabled}
                  onChange={(event) => onStationChange(event.currentTarget.value)}
                >
                  {stationOptions.map((stationName) => (
                    <option key={stationName} value={stationName}>
                      {stationName}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {lineOptions?.length && onLineChange ? (
              <label className="material-field">
                <span>{t('metroWayfindingEditor.examples.line')}</span>
                <select
                  value={selectedLineId ?? ''}
                  disabled={disabled || lineOptions.length < 2}
                  onChange={(event) => onLineChange(event.currentTarget.value)}
                >
                  {lineOptions.map((line) => (
                    <option key={line.value} value={line.value}>
                      {line.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
        ) : null}
        <div
          className="material-template-example-category-tabs"
          role="group"
          aria-label={t('metroWayfindingEditor.examples.categoriesAria')}
        >
          {categoryOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              className={activeCategory === option.value ? 'is-active' : ''}
              aria-pressed={activeCategory === option.value}
              onClick={() => setCategory(option.value)}
            >
              {option.label}
              <span>
                {option.value === 'all'
                  ? examples.length
                  : examples.filter((example) => example.source.category === option.value).length}
              </span>
            </button>
          ))}
        </div>
      </div>
      <div className="material-template-example-list">
        {visibleExamples.map((example) => (
          <MetroWayfindingExampleCard
            key={example.source.id}
            example={example}
            disabled={disabled}
            selectedStationName={selectedStationName}
            onLoadExample={onLoadExample}
          />
        ))}
      </div>
    </section>
  );
}

function resolveMetroWayfindingInitialSelection(layout: MetroWayfindingLayout) {
  for (const [rowIndex, row] of layout.rows.entries()) {
    const firstBlankLargeText = row.find(
      (element) => element.type === 'largeText' && element.value.trim().length === 0,
    );
    if (firstBlankLargeText) {
      return { rowIndex, elementId: firstBlankLargeText.id };
    }
  }
  return { rowIndex: 0, elementId: layout.rows[0]?.[0]?.id ?? '' };
}

const METRO_TEMPLATE_EXAMPLE_GRID_ROW_HEIGHT = 8;
const METRO_TEMPLATE_EXAMPLE_GRID_ROW_GAP = 8;

function estimateMetroWayfindingExampleRowSpan(example: MetroWayfindingExample) {
  const canvasWidth = Math.max(1, example.project.canvas.widthM);
  const canvasHeight = Math.max(1, example.project.canvas.heightM);
  const previewSignWidth = Math.min(canvasWidth * 52, 320);
  const previewHeight = Math.max(92, (previewSignWidth * canvasHeight) / canvasWidth + 16);
  const estimatedCardHeight = previewHeight + 100;
  return Math.max(
    1,
    Math.ceil(
      (estimatedCardHeight + METRO_TEMPLATE_EXAMPLE_GRID_ROW_GAP) /
        (METRO_TEMPLATE_EXAMPLE_GRID_ROW_HEIGHT + METRO_TEMPLATE_EXAMPLE_GRID_ROW_GAP),
    ),
  );
}

function MetroWayfindingExampleCard({
  example,
  disabled,
  selectedStationName,
  onLoadExample,
}: Readonly<{
  example: MetroWayfindingExample;
  disabled: boolean;
  selectedStationName?: string;
  onLoadExample: (example: MetroWayfindingExample, stationName?: string) => void;
}>) {
  const { t } = useI18n();
  const cardRef = useRef<HTMLButtonElement>(null);
  const [rowSpan, setRowSpan] = useState(() => estimateMetroWayfindingExampleRowSpan(example));

  useEffect(() => {
    const card = cardRef.current;
    const list = card?.parentElement;
    if (!card || !list || typeof ResizeObserver === 'undefined') {
      return;
    }

    const updateRowSpan = () => {
      const listStyle = getComputedStyle(list);
      const rowHeight = Number.parseFloat(listStyle.gridAutoRows);
      const rowGap = Number.parseFloat(listStyle.rowGap) || 0;
      if (!Number.isFinite(rowHeight) || rowHeight <= 0) {
        return;
      }

      const cardHeight = Math.max(card.scrollHeight, card.getBoundingClientRect().height);
      const nextRowSpan = Math.max(1, Math.ceil((cardHeight + rowGap) / (rowHeight + rowGap)));
      setRowSpan((currentRowSpan) =>
        currentRowSpan === nextRowSpan ? currentRowSpan : nextRowSpan,
      );
    };

    updateRowSpan();
    const resizeObserver = new ResizeObserver(updateRowSpan);
    resizeObserver.observe(card);
    return () => resizeObserver.disconnect();
  }, [example.source.id]);

  return (
    <button
      ref={cardRef}
      type="button"
      className="material-template-example"
      style={{ gridRowEnd: `span ${rowSpan}` }}
      onClick={() => onLoadExample(example, selectedStationName)}
      disabled={disabled}
      aria-label={t('metroWayfindingEditor.examples.loadAria', {
        remark: example.source.remark,
        mode: example.summary.modeLabel,
        size: example.summary.sizeLabel,
      })}
    >
      <MetroWayfindingExamplePreview example={example} />
      <div className="material-template-example-heading">
        <strong>{example.source.remark}</strong>
        <span>
          {example.source.category === 'entry'
            ? t('metroWayfindingEditor.examples.categoryEntry')
            : example.source.category === 'transfer'
              ? t('metroWayfindingEditor.examples.categoryTransfer')
              : t('metroWayfindingEditor.examples.categoryExit')}{' '}
          · {example.source.label}
        </span>
      </div>
      <small className="material-template-example-meta">
        {example.summary.modeLabel} · {example.summary.sizeLabel}
      </small>
      <span className="material-template-example-load">
        <span className="material-symbols-outlined" aria-hidden="true">
          file_open
        </span>
        {t('metroWayfindingEditor.examples.useTemplate')}
      </span>
    </button>
  );
}

/**
 * 牌面内容预览：按画布比例还原「一行 / 两行」的牌面形态。
 *
 * 两个使用场景共用这一份实现，保证观感一致：
 * - 版式模板页签的示例卡片（`MetroWayfindingExamplePreview`）；
 * - 工程转换预览弹窗里的「转换后牌面」（直接传转换结果的 layout + canvas）。
 *
 * 只是**内容预览**——不接任何位图渲染链路，也不参与交互（`aria-hidden`）。
 */
function MetroWayfindingSignPreview({
  layout,
  canvas,
  className = '',
}: Readonly<{
  layout: MetroWayfindingLayout;
  canvas: Pick<MetroWayfindingProjectCanvas, 'widthM' | 'heightM'>;
  /** 追加在外层容器上的类名，供使用方做局部约束。 */
  className?: string;
}>) {
  const canvasWidth = Math.max(1, canvas.widthM);
  const canvasHeight = Math.max(1, canvas.heightM);
  const previewWidth = canvasWidth * 52;
  const isVertical = layout.mode === 'vertical';
  const rows = layout.mode === 'double' ? layout.rows.slice(0, 2) : layout.rows.slice(0, 1);
  return (
    <div
      className={`metro-wayfinding-example-preview${isVertical ? ' is-vertical' : ''}${
        className ? ` ${className}` : ''
      }`}
      aria-hidden="true"
    >
      <div
        className="metro-wayfinding-example-preview-sign"
        style={{
          width: `min(100%, ${previewWidth}px)`,
          aspectRatio: `${canvasWidth} / ${canvasHeight}`,
          backgroundColor: layout.backgroundColor,
          color: layout.foregroundColor,
        }}
      >
        {rows.map((elements, rowIndex) => (
          <div className="metro-wayfinding-example-preview-row" key={rowIndex}>
            {elements.map((element) => (
              <MetroWayfindingExamplePreviewElement
                key={element.id}
                element={element}
                layoutMode={layout.mode}
                inheritedBackgroundColor={layout.backgroundColor}
                inheritedForegroundColor={layout.foregroundColor}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function MetroWayfindingExamplePreview({ example }: Readonly<{ example: MetroWayfindingExample }>) {
  return (
    <MetroWayfindingSignPreview layout={example.project.layout} canvas={example.project.canvas} />
  );
}

export function MetroWayfindingExamplePreviewElement({
  element,
  layoutMode,
  inheritedBackgroundColor,
  inheritedForegroundColor,
  /**
   * 是否将固定/弹性空格渲染成可见的 Material 符号
   * （`space_bar` / `arrow_range`）。用于工程转换预览弹窗与后台审核
   * 面板里的中性一字排开展示，让结构元素与元素列表里的标识一致；
   * 模板库示例预览按比例还原牌面，默认关闭以免撑大固定空格。
   */
  renderSpaceIcons = false,
  /**
   * 是否把元素自身的语义色（线路色 / 方框填充 / 大文字框填充 …）抹掉，
   * 统一渲染成「透明背景 + 文本色」的朴素形态。用于工程转换预览与后台
   * 审核面板——那里只是要让人看清「有哪些图标、哪些文本」，不需要还原配色。
   * 视觉对齐 `metro-wayfinding-element-list` 的按钮（transparent + 文本色）。
   */
  neutralizeColors = false,
}: Readonly<{
  element: MetroWayfindingElement | MetroWayfindingCombinationChild;
  layoutMode: MetroWayfindingLayoutMode;
  inheritedBackgroundColor: string;
  inheritedForegroundColor: string;
  renderSpaceIcons?: boolean;
  neutralizeColors?: boolean;
}>) {
  const style = {
    backgroundColor: neutralizeColors ? 'transparent' : (element.backgroundColor ?? 'transparent'),
    color: neutralizeColors
      ? inheritedForegroundColor
      : (element.foregroundColor ?? inheritedForegroundColor),
    ...(element.type === 'space' && element.mode === 'fixed'
      ? { flexBasis: `${Math.max(8, Math.min(element.units, 16) * 3)}px` }
      : {}),
  } as CSSProperties;

  if (element.type === 'facility') {
    const option = metroWayfindingFacilityOptions.find((item) => item.id === element.iconId);
    const assetName = resolveMetroFacilityIconAssetName(
      element.iconId,
      element.direction,
      element.variant,
    );
    const facilityHasFrame = element.frameShape !== 'none';
    const facilityBackground = neutralizeColors
      ? 'transparent'
      : facilityHasFrame && element.frameFillMode === 'inverse'
        ? (element.foregroundColor ?? inheritedForegroundColor)
        : facilityHasFrame && element.frameFillMode === 'color'
          ? (element.frameFillColor ?? inheritedForegroundColor)
          : (element.backgroundColor ?? 'transparent');
    const facilityForeground = neutralizeColors
      ? inheritedForegroundColor
      : facilityHasFrame && element.frameFillMode === 'inverse'
        ? (element.backgroundColor ?? inheritedBackgroundColor)
        : (element.foregroundColor ?? inheritedForegroundColor);
    return (
      <span
        className="metro-wayfinding-example-preview-element is-icon"
        style={{ ...style, backgroundColor: facilityBackground, color: facilityForeground }}
      >
        {assetName ? (
          <MetroFacilityAssetIcon
            assetName={assetName}
            style={metroFacilityAssetPreviewStyle(
              element.iconId,
              element.direction,
              element.variant,
            )}
          />
        ) : (
          <span
            className="material-symbols-outlined"
            style={metroIconElementPreviewStyle(element.iconId, element.direction)}
          >
            {option?.symbol ?? 'signpost'}
          </span>
        )}
      </span>
    );
  }
  if (element.type === 'arrow') {
    return (
      <span className="metro-wayfinding-example-preview-element is-icon" style={style}>
        <MetroArrowAssetIcon assetName={element.iconId} />
      </span>
    );
  }
  if (element.type === 'text') {
    return (
      <span
        className={`metro-wayfinding-example-preview-element is-text is-${element.align}${layoutMode === 'vertical' && element.writingMode === 'vertical' ? ' is-writing-vertical' : ''}`}
        style={style}
      >
        {element.rows.map((row) =>
          row.kind === 'main' ? (
            <strong key={row.id}>
              {row.segments.map((segment, index) =>
                segment.kind === 'line' ? (
                  <i
                    className="is-line"
                    key={`${segment.kind}-${index}`}
                    style={neutralizeColors ? undefined : { backgroundColor: segment.color }}
                  >
                    {segment.value}
                  </i>
                ) : segment.kind === 'boxed' ? (
                  <i className="is-boxed" key={`${segment.kind}-${index}`}>
                    {segment.value || ' '}
                  </i>
                ) : (
                  <span key={`${segment.kind}-${index}`}>{segment.value}</span>
                ),
              )}
            </strong>
          ) : (
            <small key={row.id}>{row.value}</small>
          ),
        )}
      </span>
    );
  }
  if (element.type === 'largeText') {
    return (
      <span
        className={`metro-wayfinding-example-preview-element is-large-text is-${element.frameShape}`}
        style={{
          ...style,
          ...(neutralizeColors
            ? {}
            : element.frameFillMode === 'inverse'
              ? {
                  backgroundColor: element.foregroundColor ?? inheritedForegroundColor,
                  color: element.backgroundColor ?? inheritedBackgroundColor,
                }
              : element.frameFillMode === 'color'
                ? { backgroundColor: element.frameFillColor }
                : {}),
        }}
      >
        {/*
          下角标可能落在**任意位置**（不只是末尾），所以按 runs 交替渲染：
          与 SVG 导出、宽度估算共用 `splitMetroLargeTextRuns`，三者排布一致。
        */}
        {splitMetroLargeTextRuns(element).length
          ? splitMetroLargeTextRuns(element).map((run, index) =>
              run.kind === 'suffix' ? (
                <small key={`suffix-${index}`}>{run.value}</small>
              ) : (
                <span key={`text-${index}`}>{run.value}</span>
              ),
            )
          : ' '}
      </span>
    );
  }
  if (element.type === 'space') {
    /*
     * 沿用 `metro-wayfinding-element-list` 的标识方式：固定空格 → space_bar，
     * 弹性空格 → arrow_range，让工程转换预览与后台 strip 看上去跟编辑器列表
     * 一致，便于审核者一眼对位。模板库按比例还原牌面时不显示符号，
     * 由调用方通过 `renderSpaceIcons` 控制。strip 上下文下透明度靠 CSS
     * 的 `opacity`（约 0.55），让符号比正常文本更克制、不抢戏。
     */
    if (!renderSpaceIcons) {
      return (
        <span
          className={`metro-wayfinding-example-preview-element is-space${element.mode === 'flex' ? ' is-flex' : ''}`}
          style={style}
        />
      );
    }
    return (
      <span
        className={`metro-wayfinding-example-preview-element is-space${element.mode === 'flex' ? ' is-flex' : ''}`}
        style={style}
      >
        <span className="material-symbols-outlined" aria-hidden="true">
          {element.mode === 'flex' ? 'arrow_range' : 'space_bar'}
        </span>
      </span>
    );
  }
  if (element.type === 'combination') {
    const combinationBackground = neutralizeColors
      ? 'transparent'
      : element.frameFillMode === 'inverse'
        ? (element.foregroundColor ?? inheritedForegroundColor)
        : element.frameFillMode === 'color'
          ? element.frameFillColor
          : (element.backgroundColor ?? 'transparent');
    const combinationForeground = neutralizeColors
      ? inheritedForegroundColor
      : element.frameFillMode === 'inverse'
        ? (element.backgroundColor ?? inheritedBackgroundColor)
        : (element.foregroundColor ?? inheritedForegroundColor);
    return (
      <span
        className="metro-wayfinding-example-preview-element is-combination"
        style={{ ...style, backgroundColor: combinationBackground, color: combinationForeground }}
      >
        {element.children.map((child) => (
          <MetroWayfindingExamplePreviewElement
            key={child.id}
            element={child}
            layoutMode={layoutMode}
            inheritedBackgroundColor={combinationBackground ?? inheritedBackgroundColor}
            inheritedForegroundColor={combinationForeground}
            renderSpaceIcons={renderSpaceIcons}
            neutralizeColors={neutralizeColors}
          />
        ))}
      </span>
    );
  }
  /*
   * divider 刻意只传 `color`、不传 `backgroundColor`：
   * 行内 `background-color` 优先级高于 CSS 的 `background: currentColor`，
   * 一旦带上就会把 1px 竖线染成透明、完全看不见。让 currentColor 跟随
   * 文本色即可画出竖线（`.is-divider { background: currentColor }`）。
   */
  return (
    <span
      className="metro-wayfinding-example-preview-element is-divider"
      style={{
        color: neutralizeColors
          ? inheritedForegroundColor
          : (element.foregroundColor ?? inheritedForegroundColor),
      }}
    />
  );
}

function MetroWayfindingElementTabContent({
  element,
  layoutMode,
}: Readonly<{
  element: MetroWayfindingElement;
  layoutMode: MetroWayfindingLayoutMode;
}>) {
  const { t } = useI18n();
  if (element.type === 'facility') {
    const icon =
      metroWayfindingFacilityOptions.find((option) => option.id === element.iconId) ??
      metroWayfindingFacilityOptions[0]!;
    const assetName = resolveMetroFacilityIconAssetName(
      icon.id,
      element.direction,
      element.variant,
    );
    if (assetName) {
      return (
        <MetroFacilityAssetIcon
          assetName={assetName}
          style={metroFacilityAssetPreviewStyle(icon.id, element.direction, element.variant)}
        />
      );
    }
    return (
      <span
        className="material-symbols-outlined"
        aria-hidden="true"
        style={metroIconElementPreviewStyle(icon.id, element.direction)}
      >
        {icon.symbol}
      </span>
    );
  }
  if (element.type === 'arrow') {
    return <MetroArrowAssetIcon assetName={element.iconId} />;
  }
  if (element.type === 'text') {
    const alignmentIcon = {
      left: 'format_align_left',
      center: 'format_align_center',
      right: 'format_align_right',
    }[layoutMode === 'vertical' ? 'center' : element.align];
    return (
      <>
        <span className="material-symbols-outlined" aria-hidden="true">
          {alignmentIcon}
        </span>
        <span className="metro-wayfinding-element-tab-summary">
          {summarizeMetroTextRows(element.rows, t) || t('metroWayfindingEditor.elementType.text')}
        </span>
      </>
    );
  }
  if (element.type === 'largeText') {
    return (
      <>
        <span className="material-symbols-outlined" aria-hidden="true">
          title
        </span>
        <span className="metro-wayfinding-element-tab-summary">
          {concatMetroLargeTextValue(element) ||
            t('metroWayfindingEditor.elementType.largeText')}
        </span>
      </>
    );
  }
  if (element.type === 'combination') {
    return (
      <>
        <span className="material-symbols-outlined" aria-hidden="true">
          widgets
        </span>
        <span className="metro-wayfinding-element-tab-summary">
          {element.children.length
            ? t('metroWayfindingEditor.tab.childCount', { count: element.children.length })
            : t('metroWayfindingEditor.elementType.combination')}
        </span>
      </>
    );
  }
  if (element.type === 'space') {
    return (
      <span className="material-symbols-outlined" aria-hidden="true">
        {element.mode === 'flex' ? 'arrow_range' : 'space_bar'}
      </span>
    );
  }
  return (
    <span className="material-symbols-outlined" aria-hidden="true">
      split_scene
    </span>
  );
}

function metroElementTabAriaLabel(
  element: MetroWayfindingElement,
  layoutMode: MetroWayfindingLayoutMode,
  t: Translate,
): string {
  if (element.type === 'facility') {
    const label =
      metroWayfindingFacilityOptions.find((option) => option.id === element.iconId)?.label ??
      t('metroWayfindingEditor.elementType.facility');
    const effectiveDirection =
      element.direction ?? resolveMetroWayfindingFacilityDefaultDirection(element.iconId);
    const direction = effectiveDirection
      ? {
          left: t('metroWayfindingEditor.direction.left'),
          right: t('metroWayfindingEditor.direction.right'),
          up: t('metroWayfindingEditor.direction.up'),
          down: t('metroWayfindingEditor.direction.down'),
        }[effectiveDirection]
      : '';
    return `${label}${
      direction ? t('metroWayfindingEditor.aria.partSuffix', { value: direction }) : ''
    }`;
  }
  if (element.type === 'arrow') {
    return (
      metroWayfindingArrowOptions.find((option) => option.id === element.iconId)?.label ??
      t('metroWayfindingEditor.elementType.arrow')
    );
  }
  if (element.type === 'text') {
    const alignmentLabel =
      layoutMode === 'vertical'
        ? t('metroWayfindingEditor.align.center')
        : {
            left: t('metroWayfindingEditor.align.left'),
            center: t('metroWayfindingEditor.align.center'),
            right: t('metroWayfindingEditor.align.right'),
          }[element.align];
    const writingModeLabel =
      layoutMode === 'vertical'
        ? element.writingMode === 'vertical'
          ? t('metroWayfindingEditor.writing.verticalText')
          : t('metroWayfindingEditor.writing.horizontalText')
        : '';
    const summary = summarizeMetroTextRows(element.rows, t);
    let label = t('metroWayfindingEditor.aria.textElement', {
      rows: element.rows.length,
      alignment: alignmentLabel,
    });
    if (writingModeLabel) {
      label += t('metroWayfindingEditor.aria.partSuffix', { value: writingModeLabel });
    }
    if (summary) label += t('metroWayfindingEditor.aria.partSuffix', { value: summary });
    return label;
  }
  if (element.type === 'largeText') {
    const summary = concatMetroLargeTextValue(element);
    return summary
      ? t('metroWayfindingEditor.aria.largeTextWithSummary', { summary })
      : t('metroWayfindingEditor.elementType.largeText');
  }
  if (element.type === 'combination') {
    return t('metroWayfindingEditor.aria.combination', {
      count: element.children.length,
      scale: Math.round(element.scale * 100),
    });
  }
  if (element.type === 'space') {
    return element.mode === 'flex'
      ? t('metroWayfindingEditor.aria.flexSpace')
      : t('metroWayfindingEditor.aria.fixedSpace', { units: element.units });
  }
  return t('metroWayfindingEditor.elementType.divider');
}

function summarizeMetroMainSegments(
  segments: MetroWayfindingMainSegment[],
  t: Translate,
): string {
  return segments
    .map((segment) =>
      segment.kind === 'line'
        ? `[${segment.value || t('metroWayfindingEditor.aria.defaultLineName')}]`
        : segment.value,
    )
    .join('')
    .trim();
}

function summarizeMetroTextRows(rows: MetroWayfindingTextRow[], t: Translate): string {
  return rows
    .map((row) =>
      row.kind === 'main' ? summarizeMetroMainSegments(row.segments, t) : row.value.trim(),
    )
    .filter(Boolean)
    .join(' / ')
    .slice(0, 120);
}

function formatMetroMetric(value: number): string {
  return `${Math.round(value * 10) / 10} px`;
}

function MetroWayfindingElementEditor({
  element,
  layoutMode,
  disabled,
  isFirst,
  isLast,
  lineColorOptions,
  backgroundColorOptions,
  inheritedBackgroundColor,
  inheritedForegroundColor,
  textSuggestions,
  onAction,
}: Readonly<{
  element: MetroWayfindingElement;
  layoutMode: MetroWayfindingLayoutMode;
  disabled: boolean;
  isFirst: boolean;
  isLast: boolean;
  lineColorOptions: Array<{ value: string; label: string; aliases?: string[] }>;
  backgroundColorOptions: Array<{ value: string; label: string }>;
  inheritedBackgroundColor: string;
  inheritedForegroundColor: string;
  textSuggestions?: string[];
  onAction: (action: MetroWayfindingElementAction) => void;
}>) {
  const { t } = useI18n();
  const patch = (nextPatch: Partial<MetroWayfindingElement>) =>
    onAction({ type: 'update', elementId: element.id, patch: nextPatch });

  return (
    <article className="metro-wayfinding-element">
      <header>
        <strong>{metroElementLabel(element, t)}</strong>
        <div className="metro-wayfinding-element-actions">
          <button
            type="button"
            className="icon-button"
            aria-label={t('metroWayfindingEditor.action.moveLeft')}
            title={t('metroWayfindingEditor.action.moveLeft')}
            disabled={disabled || isFirst}
            onClick={() => onAction({ type: 'move', elementId: element.id, direction: 'up' })}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              arrow_back
            </span>
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label={t('metroWayfindingEditor.action.moveRight')}
            title={t('metroWayfindingEditor.action.moveRight')}
            disabled={disabled || isLast}
            onClick={() => onAction({ type: 'move', elementId: element.id, direction: 'down' })}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              arrow_forward
            </span>
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label={t('metroWayfindingEditor.action.duplicateElement')}
            title={t('metroWayfindingEditor.action.duplicateElement')}
            disabled={disabled}
            onClick={() =>
              onAction({
                type: 'duplicate',
                elementId: element.id,
                element: duplicateMetroWayfindingElement(element),
              })
            }
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              content_copy
            </span>
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label={t('metroWayfindingEditor.action.removeElement')}
            title={t('metroWayfindingEditor.action.removeElement')}
            disabled={disabled}
            onClick={() => onAction({ type: 'remove', elementId: element.id })}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              delete
            </span>
          </button>
        </div>
      </header>
      <div className="metro-wayfinding-element-body">
        <SegmentedControl
          label={t('metroWayfindingEditor.field.elementType')}
          value={element.type}
          options={[
            {
              value: 'facility',
              label: t('metroWayfindingEditor.elementType.facility'),
              icon: 'accessible',
            },
            {
              value: 'arrow',
              label: t('metroWayfindingEditor.elementType.arrow'),
              icon: 'arrow_forward',
            },
            {
              value: 'text',
              label: t('metroWayfindingEditor.elementType.text'),
              icon: 'text_fields',
            },
            {
              value: 'largeText',
              label: t('metroWayfindingEditor.elementType.largeText'),
              icon: 'title',
            },
            {
              value: 'combination',
              label: t('metroWayfindingEditor.elementType.combination'),
              icon: 'widgets',
            },
            {
              value: 'space',
              label: t('metroWayfindingEditor.elementType.space'),
              icon: 'space_bar',
            },
            {
              value: 'divider',
              label: t('metroWayfindingEditor.elementType.divider'),
              icon: 'split_scene',
            },
          ]}
          disabled={disabled}
          wide
          onChange={(elementType) =>
            onAction({ type: 'changeType', elementId: element.id, elementType })
          }
        />
        <ElementColorFields
          element={element}
          disabled={disabled}
          backgroundColorOptions={backgroundColorOptions}
          inheritedBackgroundColor={inheritedBackgroundColor}
          inheritedForegroundColor={inheritedForegroundColor}
          patch={patch}
        />
        {element.type === 'facility' ? (
          <FacilityElementFields
            element={element}
            disabled={disabled}
            lineColorOptions={lineColorOptions}
            patch={patch}
          />
        ) : null}
        {element.type === 'arrow' ? (
          <ArrowElementFields
            element={element}
            disabled={disabled}
            lineColorOptions={lineColorOptions}
            patch={patch}
          />
        ) : null}
        {element.type === 'text' ? (
          <TextElementFields
            element={element}
            layoutMode={layoutMode}
            disabled={disabled}
            lineColorOptions={lineColorOptions}
            textSuggestions={textSuggestions}
            patch={patch}
          />
        ) : null}
        {element.type === 'largeText' ? (
          <LargeTextElementFields
            element={element}
            disabled={disabled}
            lineColorOptions={lineColorOptions}
            patch={patch}
          />
        ) : null}
        {element.type === 'combination' ? (
          <CombinationElementFields
            element={element}
            disabled={disabled}
            lineColorOptions={lineColorOptions}
            backgroundColorOptions={backgroundColorOptions}
            inheritedBackgroundColor={inheritedBackgroundColor}
            inheritedForegroundColor={inheritedForegroundColor}
            textSuggestions={textSuggestions}
            patch={patch}
          />
        ) : null}
        {element.type === 'space' ? (
          <SpaceElementFields element={element} disabled={disabled} patch={patch} />
        ) : null}
        {element.type === 'divider' ? (
          <p className="muted">
            {t('metroWayfindingEditor.divider.note', {
              width: METRO_WAYFINDING_DIVIDER_WIDTH,
            })}
          </p>
        ) : null}
      </div>
    </article>
  );
}

function FacilityElementFields({
  element,
  disabled,
  lineColorOptions,
  patch,
}: Readonly<{
  element: Extract<MetroWayfindingElement, { type: 'facility' }>;
  disabled: boolean;
  lineColorOptions: Array<{ value: string; label: string }>;
  patch: (patch: Partial<MetroWayfindingElement>) => void;
}>) {
  const { t } = useI18n();
  const currentIcon =
    metroWayfindingFacilityOptions.find((option) => option.id === element.iconId) ??
    metroWayfindingFacilityOptions[0]!;
  const selectIcon = (iconId: string) => {
    const nextIcon = metroWayfindingFacilityOptions.find((option) => option.id === iconId);
    const shouldClearPreviousDefault =
      currentIcon.defaultForegroundColor === element.foregroundColor;
    const fallbackDirection = resolveMetroWayfindingFacilityDefaultDirection(iconId);
    const directionOptions = resolveMetroFacilityDirectionOptions(iconId);
    const variantOptions = resolveMetroFacilityVariantOptions(iconId);
    patch({
      iconId,
      direction: fallbackDirection
        ? directionOptions.includes(element.direction as 'left' | 'right' | 'up' | 'down')
          ? element.direction
          : fallbackDirection
        : undefined,
      variant: variantOptions.length
        ? variantOptions.includes(element.variant as MetroWayfindingIconVariant)
          ? element.variant
          : resolveMetroFacilityDefaultVariant(iconId)
        : undefined,
      foregroundColor:
        nextIcon?.defaultForegroundColor ??
        (shouldClearPreviousDefault ? undefined : element.foregroundColor),
    });
  };
  const directionOptions = resolveMetroFacilityDirectionOptions(element.iconId);
  const variantOptions = resolveMetroFacilityVariantOptions(element.iconId);
  // 当前生效的方向 / 变种（元素未设或设了非法值时回落到默认值）。
  const effectiveDirection =
    element.direction && directionOptions.includes(element.direction)
      ? element.direction
      : (resolveMetroWayfindingFacilityDefaultDirection(element.iconId) ?? directionOptions[0]);
  const effectiveVariant = variantOptions.length
    ? element.variant && variantOptions.includes(element.variant)
      ? element.variant
      : resolveMetroFacilityDefaultVariant(element.iconId)
    : undefined;

  return (
    <div className="metro-wayfinding-field-grid">
      <IconChoiceGrid
        label={t('metroWayfindingEditor.field.facilityIcon')}
        value={element.iconId}
        options={metroWayfindingFacilityOptions.map((option) => {
          const assetName = resolveMetroFacilityIconAssetName(option.id);
          return {
            ...option,
            assetName,
            iconStyle: assetName
              ? metroFacilityAssetPreviewStyle(option.id, undefined)
              : metroIconElementPreviewStyle(option.id, undefined),
          };
        })}
        disabled={disabled}
        onChange={selectIcon}
      />
      {variantOptions.length > 0 ? (
        <SegmentedControl
          label={t('metroWayfindingEditor.field.iconVariant')}
          value={effectiveVariant ?? variantOptions[0]!}
          options={variantOptions.map((variant) => {
            const assetName = resolveMetroFacilityIconAssetName(
              element.iconId,
              effectiveDirection,
              variant,
            );
            return {
              value: variant,
              label: resolveMetroFacilityVariantLabel(variant),
              icon: assetName ? undefined : currentIcon.symbol,
              assetName,
              iconStyle: assetName
                ? metroFacilityAssetPreviewStyle(element.iconId, effectiveDirection, variant)
                : effectiveDirection
                  ? metroFacilityDirectionPreviewStyle(element.iconId, effectiveDirection)
                  : undefined,
            };
          })}
          disabled={disabled}
          showLabels={false}
          onChange={(variant) => patch({ variant })}
        />
      ) : null}
      {directionOptions.length > 0 ? (
        <SegmentedControl
          label={
            element.iconId === 'exit'
              ? t('metroWayfindingEditor.field.exitIconDirection')
              : t('metroWayfindingEditor.field.iconDirection')
          }
          value={effectiveDirection ?? directionOptions[0]!}
          options={directionOptions.map((direction) => {
            const assetName = resolveMetroFacilityIconAssetName(
              element.iconId,
              direction,
              effectiveVariant,
            );
            return {
              value: direction,
              label: resolveMetroFacilityDirectionLabel(direction),
              icon: assetName ? undefined : currentIcon.symbol,
              assetName,
              iconStyle: assetName
                ? metroFacilityAssetPreviewStyle(element.iconId, direction, effectiveVariant)
                : metroFacilityDirectionPreviewStyle(element.iconId, direction),
            };
          })}
          disabled={disabled}
          showLabels={false}
          onChange={(direction) => patch({ direction })}
        />
      ) : null}
      <FrameShapeControl
        value={element.frameShape}
        disabled={disabled}
        onChange={(frameShape) => patch({ frameShape })}
      />
      {element.frameShape !== 'none' ? (
        <FrameFillControl
          mode={element.frameFillMode}
          color={element.frameFillColor}
          stroke={element.frameStroke}
          fallbackColor={element.foregroundColor ?? '#FFFFFF'}
          lineColorOptions={lineColorOptions}
          disabled={disabled}
          patch={patch}
        />
      ) : null}
    </div>
  );
}

function ArrowElementFields({
  element,
  disabled,
  lineColorOptions,
  patch,
}: Readonly<{
  element: Extract<MetroWayfindingElement, { type: 'arrow' }>;
  disabled: boolean;
  lineColorOptions: Array<{ value: string; label: string }>;
  patch: (patch: Partial<MetroWayfindingElement>) => void;
}>) {
  const { t } = useI18n();
  return (
    <div className="metro-wayfinding-field-grid">
      <IconChoiceGrid
        label={t('metroWayfindingEditor.field.arrow')}
        value={element.iconId}
        options={metroWayfindingArrowOptions.map((option) => ({
          ...option,
          arrowAssetName: resolveMetroArrowIconAssetName(option.id),
        }))}
        disabled={disabled}
        onChange={(iconId) => patch({ iconId })}
      />
      <label className="material-checkbox-row metro-wayfinding-toggle">
        <input
          type="checkbox"
          checked={element.framed}
          disabled={disabled}
          onChange={(event) => patch({ framed: event.currentTarget.checked })}
        />
        <span>{t('metroWayfindingEditor.field.addFrame')}</span>
      </label>
      {element.framed ? (
        <FrameFillControl
          mode={element.frameFillMode}
          color={element.frameFillColor}
          stroke={element.frameStroke}
          fallbackColor={element.foregroundColor ?? '#FFFFFF'}
          lineColorOptions={lineColorOptions}
          disabled={disabled}
          patch={patch}
        />
      ) : null}
    </div>
  );
}

function TextElementFields({
  element,
  layoutMode,
  disabled,
  lineColorOptions,
  textSuggestions,
  patch,
}: Readonly<{
  element: MetroWayfindingTextElement;
  layoutMode: MetroWayfindingLayoutMode;
  disabled: boolean;
  lineColorOptions: Array<{ value: string; label: string }>;
  textSuggestions?: string[];
  patch: (patch: Partial<MetroWayfindingElement>) => void;
}>) {
  const { t } = useI18n();
  const metrics = resolveMetroWayfindingTextMetrics(element.rows);
  const updateRow = (rowId: string, row: MetroWayfindingTextRow) =>
    patch({ rows: element.rows.map((item) => (item.id === rowId ? row : item)) });
  const moveRow = (index: number, direction: 'up' | 'down') => {
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= element.rows.length) return;
    const rows = [...element.rows];
    [rows[index], rows[target]] = [rows[target]!, rows[index]!];
    patch({ rows });
  };
  const addRow = (kind: MetroWayfindingTextRow['kind']) => {
    patch({ rows: [...element.rows, createMetroWayfindingTextRow(kind)] });
  };
  const removeRow = (rowId: string) => {
    if (element.rows.length === 1) return;
    patch({ rows: element.rows.filter((row) => row.id !== rowId) });
  };

  return (
    <>
      <div className="metro-wayfinding-field-grid">
        <SegmentedControl
          label={t('metroWayfindingEditor.field.alignment')}
          value={layoutMode === 'vertical' ? 'center' : element.align}
          options={
            layoutMode === 'vertical'
              ? [
                  {
                    value: 'center' as const,
                    label: t('metroWayfindingEditor.align.center'),
                    icon: 'format_align_center',
                  },
                ]
              : [
                  {
                    value: 'left' as const,
                    label: t('metroWayfindingEditor.align.left'),
                    icon: 'format_align_left',
                  },
                  {
                    value: 'center' as const,
                    label: t('metroWayfindingEditor.align.center'),
                    icon: 'format_align_center',
                  },
                  {
                    value: 'right' as const,
                    label: t('metroWayfindingEditor.align.right'),
                    icon: 'format_align_right',
                  },
                ]
          }
          disabled={disabled}
          showLabels={false}
          onChange={(align) => patch({ align })}
        />
        {layoutMode === 'vertical' ? (
          <SegmentedControl
            label={t('metroWayfindingEditor.field.writingMode')}
            value={element.writingMode}
            options={[
              {
                value: 'horizontal',
                label: t('metroWayfindingEditor.writing.horizontal'),
                icon: 'text_rotation_none',
              },
              {
                value: 'vertical',
                label: t('metroWayfindingEditor.writing.vertical'),
                icon: 'text_rotate_vertical',
              },
            ]}
            disabled={disabled}
            onChange={(writingMode) => patch({ writingMode })}
          />
        ) : null}
        <output className="metro-wayfinding-text-metrics">
          <span>{t('metroWayfindingEditor.text.dynamicFontSize')}</span>
          <strong>
            {t('metroWayfindingEditor.text.metrics', {
              main: formatMetroMetric(metrics.mainFontSize),
              secondary: formatMetroMetric(metrics.secondaryFontSize),
            })}
          </strong>
        </output>
      </div>
      <section
        className="metro-wayfinding-text-row-editor"
        aria-label={t('metroWayfindingEditor.text.rowsAria')}
      >
        <ol className="metro-wayfinding-text-row-list">
          {element.rows.map((row, index) => (
            <li key={row.id} className="metro-wayfinding-text-row-item">
              <header>
                <strong>
                  {t('metroWayfindingEditor.text.rowHeader', {
                    index: index + 1,
                    kind:
                      row.kind === 'main'
                        ? t('metroWayfindingEditor.text.main')
                        : t('metroWayfindingEditor.text.secondary'),
                  })}
                </strong>
                <div className="metro-wayfinding-element-actions">
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={t('metroWayfindingEditor.text.moveRowUpAria', { index: index + 1 })}
                    title={t('metroWayfindingEditor.action.moveUp')}
                    disabled={disabled || index === 0}
                    onClick={() => moveRow(index, 'up')}
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">
                      arrow_upward
                    </span>
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={t('metroWayfindingEditor.text.moveRowDownAria', {
                      index: index + 1,
                    })}
                    title={t('metroWayfindingEditor.action.moveDown')}
                    disabled={disabled || index === element.rows.length - 1}
                    onClick={() => moveRow(index, 'down')}
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">
                      arrow_downward
                    </span>
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={t('metroWayfindingEditor.text.deleteRowAria', { index: index + 1 })}
                    title={t('metroWayfindingEditor.text.deleteRow')}
                    disabled={disabled || element.rows.length === 1}
                    onClick={() => removeRow(row.id)}
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">
                      delete
                    </span>
                  </button>
                </div>
              </header>
              {row.kind === 'main' ? (
                <MainSegmentEditor
                  label={t('metroWayfindingEditor.text.mainRowLabel', { index: index + 1 })}
                  segments={row.segments}
                  disabled={disabled}
                  lineColorOptions={lineColorOptions}
                  textSuggestions={textSuggestions}
                  onChange={(segments) => updateRow(row.id, { ...row, segments })}
                />
              ) : (
                <MetroWayfindingSecondaryField
                  label={t('metroWayfindingEditor.text.secondaryRowLabel', { index: index + 1 })}
                  value={row.value}
                  disabled={disabled}
                  suggestions={textSuggestions}
                  onChange={(value) => updateRow(row.id, { ...row, value })}
                />
              )}
            </li>
          ))}
        </ol>
        <div
          className="metro-wayfinding-inline-actions"
          aria-label={t('metroWayfindingEditor.text.addRowAria')}
        >
          <button
            type="button"
            aria-label={t('metroWayfindingEditor.text.addMainRow')}
            title={t('metroWayfindingEditor.text.addMainRow')}
            onClick={() => addRow('main')}
            disabled={disabled || element.rows.length >= 32}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              text_fields
            </span>
            <span>{t('metroWayfindingEditor.text.main')}</span>
          </button>
          <button
            type="button"
            aria-label={t('metroWayfindingEditor.text.addSecondaryRow')}
            title={t('metroWayfindingEditor.text.addSecondaryRow')}
            onClick={() => addRow('secondary')}
            disabled={disabled || element.rows.length >= 32}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              short_text
            </span>
            <span>{t('metroWayfindingEditor.text.secondary')}</span>
          </button>
        </div>
      </section>
    </>
  );
}

// 主文本内联编辑：文本段是可直接输入的 <input>，线路号 / 方框文本以 chip 形式
// 整体嵌在文本之间。chip 不承载光标，方向键 / 退格键在段边界处跨段处理。
function metroMainSegmentKindLabel(
  kind: MetroWayfindingMainSegment['kind'],
  t: Translate,
): string {
  if (kind === 'line') return t('metroWayfindingEditor.segment.line');
  if (kind === 'boxed') return t('metroWayfindingEditor.segment.boxed');
  return t('metroWayfindingEditor.segment.text');
}

function metroMainSegmentKindIcon(kind: MetroWayfindingMainSegment['kind']): string {
  if (kind === 'line') return 'subway';
  if (kind === 'boxed') return 'crop_square';
  return 'text_fields';
}

// chip 类段落（线路号 / 方框文本）以整体形式嵌入，不可在其内部落光标。
function isMetroMainSegmentChip(segment: MetroWayfindingMainSegment): boolean {
  return segment.kind !== 'text';
}

// 把各段拼成纯文本，供无障碍朗读与摘要使用；chip 用「值」本身参与拼接。
function concatMetroMainSegmentValues(segments: MetroWayfindingMainSegment[]): string {
  return segments.map((segment) => segment.value).join('');
}

interface MetroLineColorOption {
  value: string;
  label: string;
  aliases?: string[];
}

// 候选线路名：别名优先（别名通常是纯线路名），其次取 label 中「·」前的部分。
function candidateMetroLineNames(option: MetroLineColorOption): string[] {
  const fromLabel = option.label.split('·', 1)[0]?.trim();
  return Array.from(new Set([...(option.aliases ?? []), fromLabel ?? ''].filter(Boolean)));
}

/**
 * 线路选项的「线路编号」：走全项目统一的提取规则
 * （连续数字/字母组合，否则首字：「2号线」→「2」、「S1线」→「S1」、「环线」→「环」）。
 * 写入 chip 与色板展示都用它，保证同一线路在各处编号一致。
 */
function resolveMetroLineChipValue(option: MetroLineColorOption): string {
  for (const name of candidateMetroLineNames(option)) {
    const lineNumber = extractMetroWayfindingLineNumber(name);
    if (lineNumber) return lineNumber;
  }
  return '';
}

// 线路选项的完整显示名：优先用别名（通常是纯线路名），否则取 label 中「·」前的部分。
function resolveMetroLineDisplayName(option: MetroLineColorOption): string {
  return candidateMetroLineNames(option)[0] ?? option.label;
}

function findUniqueMetroLineColor(
  value: string,
  options: MetroLineColorOption[],
): string | undefined {
  const normalizedValue = normalizeMetroWayfindingLineNumber(value);
  if (!normalizedValue) return undefined;
  const matches = options.filter((option) =>
    candidateMetroLineNames(option).some(
      (candidate) => normalizeMetroWayfindingLineNumber(candidate) === normalizedValue,
    ),
  );
  const colors = Array.from(new Set(matches.map((option) => option.value.toUpperCase())));
  return colors.length === 1 ? colors[0] : undefined;
}

/**
 * 模糊匹配最合适的线路色：用于线路号 chip 文本实时联动。
 * 返回 undefined 表示没有可判定的线路（此时保留用户手选的色）。
 *
 * 按「提取出的线路编号」比较，而不是整串名称——这样「2」「2号线」「2号线路」
 * 都能落到同一条线上，也避免「1」误命中「10号线」。
 */
function findBestMetroLineColor(
  value: string,
  options: MetroLineColorOption[],
): string | undefined {
  const normalized = normalizeMetroWayfindingLineNumber(value);
  if (!normalized) return undefined;

  // 1) 精确命中（含别名）
  const exact = findUniqueMetroLineColor(value, options);
  if (exact) return exact;

  // 2) 只有一个候选时直接采用，避免「1」匹配「1号线」这类前缀误判。
  if (options.length === 1) return options[0]!.value.toUpperCase();

  // 3) 按线路编号前缀匹配：「2」→「2号线」（编号归一化后前缀命中），取编号最短者。
  // 注意：数字编号一旦命中就不再退回「包含匹配」——否则「1」会命中「10号线」
  // （因为「10」包含「1」），把编号当成子串去匹配是错的。
  const byLineNumber = options
    .map((option) => ({
      option,
      lineNumbers: candidateMetroLineNames(option)
        .map(normalizeMetroWayfindingLineNumber)
        .filter(Boolean),
    }))
    .filter(({ lineNumbers }) =>
      lineNumbers.some(
        (lineNumber) => lineNumber.length > normalized.length && lineNumber.startsWith(normalized),
      ),
    );
  if (byLineNumber.length) {
    const best = byLineNumber.reduce((left, right) =>
      Math.min(...left.lineNumbers.map((item) => item.length)) <=
      Math.min(...right.lineNumbers.map((item) => item.length))
        ? left
        : right,
    );
    return best.option.value.toUpperCase();
  }

  // 4) 包含匹配：仅在输入不是「编号形态」时才启用（如「京港」→「京港地铁1号线」）。
  // 纯数字/字母编号已经在上一步按前缀判定过，若再到名称里做子串匹配，
  // 「1」会命中「10号线」、「1号线」会命中「11号线」，属于误判。
  if (/^[0-9a-z]+$/iu.test(normalized)) return undefined;
  const containsMatches = options.filter((option) =>
    candidateMetroLineNames(option).some((candidate) =>
      normalizeMetroWayfindingLineNumber(candidate).includes(normalized),
    ),
  );
  const containsColors = Array.from(
    new Set(containsMatches.map((option) => option.value.toUpperCase())),
  );
  return containsColors.length === 1 ? containsColors[0] : undefined;
}

/**
 * 合并相邻的普通文本段：连续两个及以上的文本段之间若只隔着空格，
 * 或本来就紧邻，则并成一段，避免输入时被切成一个个碎片文本框。
 */
function mergeAdjacentMetroTextSegments(
  segments: MetroWayfindingMainSegment[],
): MetroWayfindingMainSegment[] {
  const merged: MetroWayfindingMainSegment[] = [];
  for (const segment of segments) {
    const previous = merged[merged.length - 1];
    if (previous && previous.kind === 'text' && segment.kind === 'text') {
      merged[merged.length - 1] = { kind: 'text', value: previous.value + segment.value };
      continue;
    }
    merged.push(segment);
  }
  return merged;
}

/**
 * 主文本 / 副文本编辑控件共用的外壳。
 *
 * 两者必须是同一套外观与布局：同样的输入框容器。
 * 把外壳抽出来，是保证「改一处两边都变」的唯一可靠做法——靠两处 CSS 各自对齐
 * 迟早会漂移。
 *
 * 外壳**不**再渲染自己的标签行：行 `<header>` 已经写了「第 N 行 · 主/副文本」，
 * 动态字高也在上方的 `.metro-wayfinding-text-metrics` 里给了，重复展示只是噪音。
 */
function MetroWayfindingSegmentFieldShell({
  label,
  disabled,
  ariaLabel,
  onBlankPointerDown,
  children,
}: Readonly<{
  label: string;
  disabled?: boolean;
  ariaLabel: string;
  /** 点击输入容器空白处时调用（用于把焦点落回最后一个可编辑段）。 */
  onBlankPointerDown?: () => void;
  children: ReactNode;
}>) {
  return (
    <section
      className="metro-wayfinding-main-segments"
      aria-label={label}
      aria-disabled={disabled || undefined}
    >
      <div className="metro-wayfinding-main-segment-control">
        <div
          className="metro-wayfinding-main-segments-input"
          role="group"
          aria-label={ariaLabel}
          // 只在「空白处」接管点击：命中输入框 / chip / 按钮时交给它们自己处理。
          onPointerDown={(event) => {
            if (!onBlankPointerDown) return;
            if (event.target !== event.currentTarget) return;
            event.preventDefault();
            onBlankPointerDown();
          }}
        >
          {children}
        </div>
      </div>
    </section>
  );
}

function MainSegmentEditor({
  label,
  segments,
  disabled,
  lineColorOptions,
  textSuggestions,
  onChange,
}: Readonly<{
  label: string;
  segments: MetroWayfindingMainSegment[];
  disabled: boolean;
  lineColorOptions: MetroLineColorOption[];
  textSuggestions?: string[];
  onChange: (segments: MetroWayfindingMainSegment[]) => void;
}>) {
  const { t } = useI18n();
  // 正在编辑的文本段索引；null 表示光标停在 chip 上。
  const [activeTextIndex, setActiveTextIndex] = useState<number | null>(null);
  // 待恢复的段内字符位置。删除 chip / 插入 chip 后需要还原落点。
  const pendingCaret = useRef<{ index: number; offset: number } | null>(null);
  // pendingCaret 的落点是否在 chip 内部（而不是文本段）。
  const chipCaret = useRef(false);
  const textInputs = useRef(new Map<number, HTMLInputElement>());
  const chipInputs = useRef(new Map<number, HTMLInputElement>());
  // chip 段色板展开状态：存段索引。
  const [paletteIndex, setPaletteIndex] = useState<number | null>(null);
  // 光标在当前文本段内的字符偏移；null 表示未聚焦或未记录。
  const [caretOffset, setCaretOffset] = useState<number | null>(null);

  // 文本段就是「直接输入的文本」，不需要用户手动创建。
  // 这里保证段列表末尾始终存在一个文本段作为输入落点（空行也留一个），
  // 并把相邻的普通文本段合并成一段——否则历史数据 / 粘进来的文本会被拆成
  // 一堆碎片文本框，每个框都窄得看不清内容。
  const normalizedSegments = useMemo<MetroWayfindingMainSegment[]>(() => {
    const merged = mergeAdjacentMetroTextSegments(segments);
    if (!merged.length) return [{ kind: 'text', value: '' }];
    const last = merged[merged.length - 1]!;
    // 末尾是 chip 时补一个空文本段；末尾是文本段则原样保留供继续输入。
    return isMetroMainSegmentChip(last) ? [...merged, { kind: 'text', value: '' }] : merged;
  }, [segments]);

  const totalText = concatMetroMainSegmentValues(normalizedSegments);

  // ── 光标定位的输入建议 + 内联按钮 ────────────────────────────────
  // 建议基于「光标之前的整行文本」匹配，渲染在光标之后；两个「添加」按钮
  // 也贴在光标处（而不是永远漂在行尾），这样插入位置所见即所得。
  // 光标所在文本段：null 表示焦点在 chip 上或输入框外。
  const caretIndex =
    activeTextIndex !== null &&
    !isMetroMainSegmentChip(
      normalizedSegments[activeTextIndex] ?? ({} as MetroWayfindingMainSegment),
    )
      ? activeTextIndex
      : null;

  // 光标前文本：chip 贡献它的值，文本段贡献光标之前的片段。
  const textBeforeCaret = useMemo(() => {
    if (caretIndex === null) return null;
    return normalizedSegments
      .slice(0, caretIndex + 1)
      .map((segment, index) => {
        if (index < caretIndex || isMetroMainSegmentChip(segment)) return segment.value;
        return segment.value.slice(0, caretOffset ?? segment.value.length);
      })
      .join('');
  }, [caretIndex, caretOffset, normalizedSegments]);

  // 建议后缀：只取「待追加」的部分，供光标后的幽灵文本渲染。
  const caretSuggestion = useMemo(() => {
    if (textBeforeCaret === null) return undefined;
    const match = matchTextContinuation(textBeforeCaret, textSuggestions);
    return match?.suffix || undefined;
  }, [textBeforeCaret, textSuggestions]);

  // 兼容旧行为：整行补全用于 Tab 接受建议。
  const continuation = findTextContinuation(totalText, textSuggestions);

  // 记录文本段光标位置，供建议 / 按钮重新贴光标。
  const syncCaretOffset = (input: HTMLInputElement) => {
    setCaretOffset(input.selectionStart ?? input.value.length);
  };

  const focusTextSegment = (index: number, offset: number) => {
    const target = textInputs.current.get(index);
    if (!target) return;
    target.focus();
    const clamped = Math.max(0, Math.min(target.value.length, offset));
    target.setSelectionRange(clamped, clamped);
    setCaretOffset(clamped);
  };

  // chip 内部的输入框：把某个 chip 聚焦并把光标放到末尾（chip 为空时即段首）。
  const focusChipInput = (index: number, offset?: number) => {
    const target = chipInputs.current.get(index);
    if (!target) return;
    target.focus();
    const end = offset ?? target.value.length;
    target.setSelectionRange(end, end);
  };

  // 点击容器空白处：聚焦到「最后可编辑的段」——行尾文本段优先，否则最后一个 chip。
  // 用 DOM 里的实际输入框反查，避免依赖状态同步时序。
  const focusLastEditableSegment = () => {
    if (disabled) return;
    for (let index = normalizedSegments.length - 1; index >= 0; index -= 1) {
      const segment = normalizedSegments[index];
      if (!segment) continue;
      const target =
        segment.kind === 'text' ? textInputs.current.get(index) : chipInputs.current.get(index);
      if (!target || target.disabled) continue;
      if (segment.kind === 'text') {
        focusTextSegment(index, target.value.length);
      } else {
        focusChipInput(index);
      }
      return;
    }
  };

  // DOM 更新后再把光标落到记录的位置。
  useEffect(() => {
    const target = pendingCaret.current;
    if (!target) return;
    pendingCaret.current = null;
    if (chipCaret.current) {
      chipCaret.current = false;
      focusChipInput(target.index, target.offset);
      return;
    }
    focusTextSegment(target.index, target.offset);
  }, [normalizedSegments]);

  const commit = (
    next: MetroWayfindingMainSegment[],
    caret: { index: number; offset: number } | null,
    // chip 内部落点：删除 chip 后把光标还给它自己的输入框（而不是相邻文本段）。
    caretInChip = false,
  ) => {
    pendingCaret.current = caret;
    chipCaret.current = caretInChip;
    setActiveTextIndex(caret && !caretInChip ? caret.index : null);
    setCaretOffset(caret && !caretInChip ? caret.offset : null);
    onChange(next);
  };

  // 把某个文本段替换成新值；不改变段结构与 chip 位置。
  const setTextSegmentValue = (index: number, value: string, offset: number) => {
    const next = normalizedSegments.map((segment, segmentIndex) =>
      segmentIndex === index ? ({ kind: 'text', value } as MetroWayfindingMainSegment) : segment,
    );
    commit(next, { index, offset });
  };

  // 生成一个空 chip，线路号带默认色。
  const createChip = (kind: 'line' | 'boxed'): MetroWayfindingMainSegment =>
    kind === 'line'
      ? { kind: 'line', value: '', color: lineColorOptions[0]?.value ?? '#2F80ED' }
      : { kind: 'boxed', value: '' };

  // 在光标处插入 chip，光标移到 chip 右侧文本段的开头。
  const insertChipAtCaret = (kind: 'line' | 'boxed') => {
    const chip = createChip(kind);
    const activeIndex = activeTextIndex;
    const activeSegment = activeIndex === null ? undefined : normalizedSegments[activeIndex];

    // 光标在某个文本段内：在该段中间切开插入，chip 前保留已输入文本。
    if (activeIndex !== null && activeSegment && !isMetroMainSegmentChip(activeSegment)) {
      const input = textInputs.current.get(activeIndex);
      const at = input?.selectionStart ?? caretOffset ?? activeSegment.value.length;
      const head = activeSegment.value.slice(0, at);
      const tail = activeSegment.value.slice(at);
      const next: MetroWayfindingMainSegment[] = [];
      normalizedSegments.forEach((segment, index) => {
        if (index !== activeIndex) {
          next.push(segment);
          return;
        }
        if (head) next.push({ kind: 'text', value: head });
        next.push(chip);
        // chip 后保留文本段，便于继续输入。
        next.push({ kind: 'text', value: tail });
      });
      commit(next, { index: next.indexOf(chip) + 1, offset: 0 });
      return;
    }

    // 光标不在文本段上（点过 chip）：插到行尾。
    const next: MetroWayfindingMainSegment[] = [
      ...normalizedSegments,
      chip,
      { kind: 'text', value: '' },
    ];
    commit(next, { index: next.length - 1, offset: 0 });
  };

  // 采纳光标处的补全建议（点按钮或按 Tab）：把建议后缀拼到光标所在文本段上。
  const acceptCaretSuggestion = () => {
    if (caretIndex === null || !caretSuggestion) return;
    const segment = normalizedSegments[caretIndex];
    if (!segment || isMetroMainSegmentChip(segment)) return;
    const at = caretOffset ?? segment.value.length;
    const value = `${segment.value.slice(0, at)}${caretSuggestion}${segment.value.slice(at)}`;
    setTextSegmentValue(caretIndex, value, at + caretSuggestion.length);
  };

  const removeChip = (index: number) => {
    const prevIndex = index - 1;
    const prev = normalizedSegments[prevIndex];
    const next = normalizedSegments.filter((_segment, segmentIndex) => segmentIndex !== index);
    // 优先回落到前一个文本段的末尾，否则落到后一个文本段开头。
    if (prev && !isMetroMainSegmentChip(prev)) {
      commit(next, { index: prevIndex, offset: prev.value.length });
      return;
    }
    const after = next[index];
    if (after && !isMetroMainSegmentChip(after)) {
      commit(next, { index, offset: 0 });
      return;
    }
    commit(next, null);
  };

  // chip 内部退格：文本框已空时再按一次退格，直接把整个 chip 删掉。
  const handleChipBackspace = (index: number, event: KeyboardEvent<HTMLInputElement>): boolean => {
    const input = event.currentTarget;
    const isEmpty = input.value.length === 0;
    const atStart = input.selectionStart === 0 && input.selectionEnd === 0;
    if (!isEmpty && !atStart) return false;
    const prevIndex = index - 1;
    const prev = normalizedSegments[prevIndex];
    const next = normalizedSegments.filter((_segment, segmentIndex) => segmentIndex !== index);
    // 前一段是文本：把光标还到它末尾，衔接更自然。
    if (prev && !isMetroMainSegmentChip(prev)) {
      commit(next, { index: prevIndex, offset: prev.value.length });
      return true;
    }
    // 前一段也是 chip（或已在行首）：删掉后把焦点停到前一个 chip 里。
    if (prev) {
      commit(next, { index: prevIndex, offset: prev.value.length }, true);
      return true;
    }
    const after = next[0];
    if (after && !isMetroMainSegmentChip(after)) {
      commit(next, { index: 0, offset: 0 });
      return true;
    }
    commit(next, null);
    return true;
  };

  // 线路号 chip 文本变化时实时联动线路色；匹配不到则保留用户手选的色。
  const updateChip = (index: number, value: string) => {
    const next = normalizedSegments.map((segment, segmentIndex) => {
      if (segmentIndex !== index) return segment;
      if (segment.kind === 'line') {
        return {
          kind: 'line' as const,
          value,
          color: findBestMetroLineColor(value, lineColorOptions) ?? segment.color,
        };
      }
      if (segment.kind === 'boxed') return { kind: 'boxed' as const, value };
      return segment;
    });
    onChange(next);
  };

  // 点色板上的颜色：直接写入该线路的编号（2 / S1 / 环…），并同步色值。
  const applyChipSwatch = (index: number, option: MetroLineColorOption) => {
    const lineValue = resolveMetroLineChipValue(option);
    const next = normalizedSegments.map((segment, segmentIndex) =>
      segmentIndex === index && segment.kind === 'line'
        ? ({
            kind: 'line',
            value: lineValue || segment.value,
            color: option.value.toUpperCase(),
          } as MetroWayfindingMainSegment)
        : segment,
    );
    // 写完编号后把光标落回 chip 输入框末尾，方便继续改。
    commit(next, { index, offset: lineValue.length }, true);
    setPaletteIndex(null);
  };

  // 文本段退格：已到段首且前一段是 chip 时，删除该 chip。
  const handleTextBackspace = (index: number, event: KeyboardEvent<HTMLInputElement>): boolean => {
    const input = event.currentTarget;
    if (input.selectionStart !== 0 || input.selectionEnd !== 0) return false;
    const prevIndex = index - 1;
    const prev = normalizedSegments[prevIndex];
    if (!prev || !isMetroMainSegmentChip(prev)) return false;
    const inputValue = input.value;
    const next = normalizedSegments.filter((_segment, segmentIndex) => segmentIndex !== prevIndex);
    // 删掉 chip 后，本段索引前移一位。
    commit(next, { index: index - 1, offset: inputValue.length });
    return true;
  };

  // 文本段 Delete：已到段尾且后一段是 chip 时，删除该 chip。
  const handleTextDelete = (index: number, event: KeyboardEvent<HTMLInputElement>): boolean => {
    const input = event.currentTarget;
    if (input.selectionStart !== input.value.length || input.selectionEnd !== input.value.length) {
      return false;
    }
    const nextSegment = normalizedSegments[index + 1];
    if (!nextSegment || !isMetroMainSegmentChip(nextSegment)) return false;
    const next = normalizedSegments.filter((_segment, segmentIndex) => segmentIndex !== index + 1);
    commit(next, { index, offset: input.value.length });
    return true;
  };

  // 段边界的方向键落点：从右边进来落到末尾、从左边进来落到开头，与视线方向一致。
  const focusNeighborSegment = (targetIndex: number, direction: 'left' | 'right') => {
    const target = normalizedSegments[targetIndex];
    if (!target) return;
    if (isMetroMainSegmentChip(target)) {
      focusChipInput(targetIndex, direction === 'left' ? undefined : 0);
      return;
    }
    focusTextSegment(targetIndex, direction === 'left' ? target.value.length : 0);
  };

  // 左/右方向键在段边界处跨段移动**焦点**，文本段与 chip 输入框共用。
  //
  // 只认左/右：这是水平行内的语义，上下方向键留给将来的跨行导航。
  // 注意不能只清 activeTextIndex——那样 DOM 焦点还在原输入框里，看起来没反应。
  const handleSegmentArrow = (
    index: number,
    direction: 'left' | 'right',
    event: KeyboardEvent<HTMLInputElement>,
  ): boolean => {
    const input = event.currentTarget;
    const atStart = input.selectionStart === 0 && input.selectionEnd === 0;
    const atEnd =
      input.selectionStart === input.value.length && input.selectionEnd === input.value.length;
    if (direction === 'left' ? !atStart : !atEnd) return false;
    const targetIndex = direction === 'left' ? index - 1 : index + 1;
    if (!normalizedSegments[targetIndex]) return false;
    window.requestAnimationFrame(() => focusNeighborSegment(targetIndex, direction));
    return true;
  };

  return (
    <MetroWayfindingSegmentFieldShell
      label={label}
      disabled={disabled}
      ariaLabel={t('metroWayfindingEditor.aria.inlineEditable', { label })}
      onBlankPointerDown={focusLastEditableSegment}
    >
      {normalizedSegments.map((segment, index) =>
        segment.kind === 'text' ? (
          // 文本段 + 贴在光标后的「幽灵建议」和「添加」按钮：
          // 这三者拼成一个行内整体，光标移动时装饰跟着重排。
          <span
            key={`text-${index}`}
            className={`metro-wayfinding-main-segments-text-flow${
              caretIndex === index ? ' is-active' : ''
            }`}
          >
            <input
              ref={(node) => {
                if (node) textInputs.current.set(index, node);
                else textInputs.current.delete(index);
              }}
              className="metro-wayfinding-main-segments-text"
              value={segment.value}
              disabled={disabled}
              size={Math.max(segment.value.length, 1)}
              aria-label={t('metroWayfindingEditor.aria.textSegment', {
                label,
                index: index + 1,
              })}
              onFocus={(event) => {
                setActiveTextIndex(index);
                syncCaretOffset(event.currentTarget);
              }}
              // 光标移动（点击 / 拖选 / 方向键 / 输入）都要刷新建议与按钮位置。
              onSelect={(event) => syncCaretOffset(event.currentTarget)}
              onClick={(event) => syncCaretOffset(event.currentTarget)}
              onKeyUp={(event) => syncCaretOffset(event.currentTarget)}
              onChange={(event) => {
                const value = event.currentTarget.value;
                const offset = event.currentTarget.selectionStart ?? value.length;
                setCaretOffset(offset);
                setTextSegmentValue(index, value, offset);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Backspace' && handleTextBackspace(index, event)) {
                  event.preventDefault();
                  return;
                }
                if (event.key === 'Delete' && handleTextDelete(index, event)) {
                  event.preventDefault();
                  return;
                }
                if (event.key === 'ArrowLeft' && handleSegmentArrow(index, 'left', event)) {
                  event.preventDefault();
                  return;
                }
                if (event.key === 'ArrowRight' && handleSegmentArrow(index, 'right', event)) {
                  event.preventDefault();
                  return;
                }
                // Tab：优先采纳光标处的建议（比整行补全更贴合当前落点）。
                if (event.key === 'Tab') {
                  if (caretSuggestion) {
                    event.preventDefault();
                    acceptCaretSuggestion();
                    return;
                  }
                  if (continuation && continuation !== totalText) {
                    event.preventDefault();
                    setTextSegmentValue(index, continuation, continuation.length);
                  }
                }
              }}
            />
            {caretIndex === index ? (
              <>
                {caretSuggestion ? (
                  <button
                    type="button"
                    className="metro-wayfinding-main-segments-suggestion"
                    title={t('metroWayfindingEditor.suggestion.acceptTitle')}
                    aria-label={t('metroWayfindingEditor.suggestion.acceptAria', {
                      suggestion: caretSuggestion,
                    })}
                    disabled={disabled}
                    // mousedown 抢焦点会让输入框失焦、建议消失，这里改用 click 并阻止默认。
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={acceptCaretSuggestion}
                  >
                    {caretSuggestion}
                  </button>
                ) : null}
                <span className="metro-wayfinding-main-segments-caret-actions">
                  <button
                    type="button"
                    className="metro-wayfinding-main-segments-insert-line"
                    title={t('metroWayfindingEditor.segment.insertLine')}
                    aria-label={t('metroWayfindingEditor.segment.insertLine')}
                    disabled={disabled}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => insertChipAtCaret('line')}
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">
                      directions_subway
                    </span>
                    {t('metroWayfindingEditor.segment.line')}
                  </button>
                  <button
                    type="button"
                    className="metro-wayfinding-main-segments-insert-boxed"
                    title={t('metroWayfindingEditor.segment.insertBoxed')}
                    aria-label={t('metroWayfindingEditor.segment.insertBoxed')}
                    disabled={disabled}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => insertChipAtCaret('boxed')}
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">
                      select_all
                    </span>
                    {t('metroWayfindingEditor.segment.boxedShort')}
                  </button>
                </span>
              </>
            ) : null}
          </span>
        ) : (
          <span
            key={`chip-${index}`}
            className={`metro-wayfinding-main-segments-chip is-${segment.kind}`}
            style={
              segment.kind === 'line'
                ? ({ '--metro-wayfinding-segment-color': segment.color } as CSSProperties)
                : undefined
            }
            onBlur={(event) => {
              // 焦点离开整个 chip（含内部输入框与按钮）时才收起色板。
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                setPaletteIndex((current) => (current === index ? null : current));
              }
            }}
          >
            <button
              type="button"
              className="metro-wayfinding-main-segments-chip-icon"
              aria-label={
                segment.kind === 'line'
                  ? t('metroWayfindingEditor.segment.chooseLineColor')
                  : metroMainSegmentKindLabel(segment.kind, t)
              }
              title={
                segment.kind === 'line'
                  ? t('metroWayfindingEditor.segment.chooseLineColor')
                  : metroMainSegmentKindLabel(segment.kind, t)
              }
              disabled={disabled || segment.kind !== 'line'}
              onClick={() => setPaletteIndex((current) => (current === index ? null : index))}
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                {metroMainSegmentKindIcon(segment.kind)}
              </span>
            </button>
            <input
              ref={(node) => {
                if (node) chipInputs.current.set(index, node);
                else chipInputs.current.delete(index);
              }}
              className="metro-wayfinding-main-segments-chip-input"
              value={segment.value}
              disabled={disabled}
              size={Math.max(segment.value.length, 1)}
              maxLength={segment.kind === 'line' ? 20 : 160}
              aria-label={t('metroWayfindingEditor.aria.segmentOrdinal', {
                index: index + 1,
                kind: metroMainSegmentKindLabel(segment.kind, t),
              })}
              placeholder={metroMainSegmentKindLabel(segment.kind, t)}
              onFocus={() => setActiveTextIndex(null)}
              onChange={(event) => updateChip(index, event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === 'Backspace' && handleChipBackspace(index, event)) {
                  event.preventDefault();
                  return;
                }
                if (event.key === 'ArrowLeft' && handleSegmentArrow(index, 'left', event)) {
                  event.preventDefault();
                  return;
                }
                if (event.key === 'ArrowRight' && handleSegmentArrow(index, 'right', event)) {
                  event.preventDefault();
                }
              }}
            />
            <button
              type="button"
              className="metro-wayfinding-main-segments-chip-remove"
              aria-label={t('metroWayfindingEditor.aria.removeSegment', {
                kind: metroMainSegmentKindLabel(segment.kind, t),
              })}
              title={t('metroWayfindingEditor.aria.removeSegment', {
                kind: metroMainSegmentKindLabel(segment.kind, t),
              })}
              disabled={disabled}
              onClick={() => removeChip(index)}
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                close
              </span>
            </button>
            {paletteIndex === index && segment.kind === 'line' ? (
              <span className="metro-wayfinding-main-segments-chip-palette" role="listbox">
                {lineColorOptions.map((option) => {
                  const lineNumber = resolveMetroLineChipValue(option);
                  const displayName = resolveMetroLineDisplayName(option);
                  return (
                    <button
                      key={`${option.value}-${option.label}`}
                      type="button"
                      role="option"
                      aria-selected={option.value === segment.color}
                      aria-label={`${displayName} · ${option.value.toUpperCase()}`}
                      title={`${displayName} · ${option.value.toUpperCase()}`}
                      className="metro-wayfinding-main-segments-chip-swatch"
                      style={{ '--metro-wayfinding-swatch-color': option.value } as CSSProperties}
                      disabled={disabled}
                      onClick={() => applyChipSwatch(index, option)}
                    >
                      <span
                        className="metro-wayfinding-main-segments-chip-swatch-color"
                        aria-hidden="true"
                      />
                      <span className="metro-wayfinding-main-segments-chip-swatch-label">
                        {lineNumber}
                      </span>
                    </button>
                  );
                })}
              </span>
            ) : null}
          </span>
        ),
      )}
    </MetroWayfindingSegmentFieldShell>
  );
}

/**
 * 副文本编辑控件。
 *
 * 与主文本控件共用 {@link MetroWayfindingSegmentFieldShell} 外壳和同一套
 * 「光标后幽灵建议」交互；区别只在数据模型——副文本行是纯字符串，
 * 不承载 chip 段，因此这里只渲染一个文本段。
 */
function MetroWayfindingSecondaryField({
  label,
  value,
  disabled,
  suggestions,
  autoFocus = false,
  onChange,
}: Readonly<{
  label: string;
  value: string;
  disabled: boolean;
  suggestions?: string[];
  autoFocus?: boolean;
  onChange: (value: string) => void;
}>) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [caretOffset, setCaretOffset] = useState<number | null>(null);

  const textBeforeCaret =
    caretOffset === null ? value : value.slice(0, Math.min(caretOffset, value.length));
  const suggestion = matchTextContinuation(textBeforeCaret, suggestions)?.suffix || undefined;

  const syncCaretOffset = (input: HTMLInputElement) => {
    setCaretOffset(input.selectionStart ?? input.value.length);
  };

  // 采纳建议：在光标处插入后缀，并把光标推到插入内容之后。
  const acceptSuggestion = () => {
    if (!suggestion) return;
    const at = caretOffset ?? value.length;
    const next = `${value.slice(0, at)}${suggestion}${value.slice(at)}`;
    onChange(next);
    setCaretOffset(at + suggestion.length);
    // 值更新后把 DOM 光标也推到新位置（受控 input 会重置 selection）。
    window.requestAnimationFrame(() => {
      const input = inputRef.current;
      if (!input) return;
      const position = Math.min(at + suggestion.length, input.value.length);
      input.focus();
      input.setSelectionRange(position, position);
    });
  };

  // 点击容器空白处：聚焦这个唯一的文本框，光标落到末尾（与主文本行为一致）。
  const focusLastEditableSegment = () => {
    if (disabled) return;
    const input = inputRef.current;
    if (!input || input.disabled) return;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    setCaretOffset(input.value.length);
  };

  return (
    <MetroWayfindingSegmentFieldShell
      label={label}
      disabled={disabled}
      ariaLabel={t('metroWayfindingEditor.aria.inlineEditable', { label })}
      onBlankPointerDown={focusLastEditableSegment}
    >
      <span className="metro-wayfinding-main-segments-text-flow is-active">
        <input
          ref={inputRef}
          autoFocus={autoFocus}
          className="metro-wayfinding-main-segments-text"
          value={value}
          disabled={disabled}
          size={Math.max(value.length, 1)}
          maxLength={160}
          aria-label={label}
          onFocus={(event) => syncCaretOffset(event.currentTarget)}
          // 与主文本一致：光标一动，建议就跟着重排。
          onSelect={(event) => syncCaretOffset(event.currentTarget)}
          onClick={(event) => syncCaretOffset(event.currentTarget)}
          onKeyUp={(event) => syncCaretOffset(event.currentTarget)}
          onChange={(event) => {
            setCaretOffset(event.currentTarget.selectionStart ?? event.currentTarget.value.length);
            onChange(event.currentTarget.value);
          }}
          onBlur={() => setCaretOffset(null)}
          onKeyDown={(event) => {
            if (event.key === 'Tab' && suggestion) {
              event.preventDefault();
              acceptSuggestion();
            }
          }}
        />
        {suggestion ? (
          <button
            type="button"
            className="metro-wayfinding-main-segments-suggestion"
            title={t('metroWayfindingEditor.suggestion.acceptTitle')}
            aria-label={t('metroWayfindingEditor.suggestion.acceptAria', { suggestion })}
            disabled={disabled}
            // mousedown 抢焦点会让输入框失焦、建议消失。
            onMouseDown={(event) => event.preventDefault()}
            onClick={acceptSuggestion}
          >
            {suggestion}
          </button>
        ) : null}
      </span>
    </MetroWayfindingSegmentFieldShell>
  );
}

/**
 * 大文本的内联编辑器：正文文本段与**下角标 chip** 交替，可在光标处插入下角标。
 *
 * 外观与交互刻意对齐主文本的内联段编辑器（同一个外壳、同一套 chip 样式），
 * 这样「在任意位置插入下角标」跟主文本插入线路号是同一种手感。
 *
 * 段序列**派生自** `element.value` + `element.suffixes`（不另存本地状态），
 * 因此外部批量改动（套模板 / 导入）能直接反映到编辑器里。
 */
function LargeTextValueEditor({
  label,
  element,
  disabled,
  patch,
}: Readonly<{
  label: string;
  element: MetroWayfindingLargeTextElement;
  disabled: boolean;
  patch: (patch: Partial<MetroWayfindingElement>) => void;
}>) {
  const { t } = useI18n();
  // 正在编辑的文本段索引；null 表示光标停在角标 chip 上。
  const [activeTextIndex, setActiveTextIndex] = useState<number | null>(null);
  const [caretOffset, setCaretOffset] = useState<number | null>(null);
  const textInputs = useRef(new Map<number, HTMLInputElement>());
  const suffixInputs = useRef(new Map<number, HTMLInputElement>());

  // 末尾恒留一个文本段作落点（空大文本也要能输入、角标后也要能继续打字）。
  const segments = useMemo<MetroWayfindingLargeTextRun[]>(() => {
    const runs = splitMetroLargeTextRuns(element);
    const last = runs[runs.length - 1];
    return !last || last.kind === 'suffix' ? [...runs, { kind: 'text', value: '' }] : runs;
  }, [element]);

  /** 段序列 → `value` + `suffixes`（`at` 取当时的码点下标）。 */
  const commit = (next: MetroWayfindingLargeTextRun[]) => {
    let value = '';
    const suffixes: MetroWayfindingLargeTextSuffix[] = [];
    for (const run of next) {
      if (run.kind === 'text') {
        value += run.value;
        continue;
      }
      suffixes.push({ at: Array.from(value).length, value: run.value });
    }
    const length = Array.from(value).length;
    // legacy `suffix` 同步成「末尾那一个」，老版本读到时至少不丢末尾角标。
    const tail = suffixes.filter((item) => item.at === length).at(-1);
    patch({ value, suffixes, suffix: tail?.value ?? '' });
  };

  const syncCaretOffset = (input: HTMLInputElement) => {
    setCaretOffset(input.selectionStart ?? input.value.length);
  };

  const focusTextSegment = (index: number, offset: number) => {
    const target = textInputs.current.get(index);
    if (!target) return;
    target.focus();
    const clamped = Math.max(0, Math.min(target.value.length, offset));
    target.setSelectionRange(clamped, clamped);
    setCaretOffset(clamped);
  };

  const focusSuffixInput = (index: number, offset?: number) => {
    const target = suffixInputs.current.get(index);
    if (!target) return;
    target.focus();
    const end = offset ?? target.value.length;
    target.setSelectionRange(end, end);
  };

  const focusLastEditableSegment = () => {
    if (disabled) return;
    for (let index = segments.length - 1; index >= 0; index -= 1) {
      const segment = segments[index];
      if (!segment) continue;
      const target =
        segment.kind === 'text' ? textInputs.current.get(index) : suffixInputs.current.get(index);
      if (!target || target.disabled) continue;
      if (segment.kind === 'text') focusTextSegment(index, segment.value.length);
      else focusSuffixInput(index);
      return;
    }
  };

  const setTextSegmentValue = (index: number, value: string) => {
    const next: MetroWayfindingLargeTextRun[] = segments.map((segment, segmentIndex) =>
      segmentIndex === index ? { kind: 'text', value } : segment,
    );
    commit(next);
  };

  const setSuffixValue = (index: number, value: string) => {
    const next: MetroWayfindingLargeTextRun[] = segments.map((segment, segmentIndex) =>
      segmentIndex === index ? { kind: 'suffix', value } : segment,
    );
    commit(next);
  };

  /** 在光标处插入一个下角标：把当前文本段按光标切成两段，中间夹空角标。 */
  const insertSuffixAtCaret = () => {
    const index = activeTextIndex;
    if (index === null) return;
    const segment = segments[index];
    if (!segment || segment.kind !== 'text') return;
    const characters = Array.from(segment.value);
    const at = Math.max(0, Math.min(characters.length, caretOffset ?? characters.length));
    const before = characters.slice(0, at).join('');
    const after = characters.slice(at).join('');
    const inserted: MetroWayfindingLargeTextRun[] = [];
    if (before) inserted.push({ kind: 'text', value: before });
    inserted.push({ kind: 'suffix', value: '' });
    if (after) inserted.push({ kind: 'text', value: after });
    const next = [...segments];
    next.splice(index, 1, ...inserted);
    commit(next);
    const suffixIndex = index + (before ? 1 : 0);
    window.requestAnimationFrame(() => focusSuffixInput(suffixIndex, 0));
  };

  const removeSuffix = (index: number) => {
    commit(segments.filter((_segment, segmentIndex) => segmentIndex !== index));
    window.requestAnimationFrame(() => focusTextSegment(Math.max(0, index - 1), 0));
  };

  // 文本段 Backspace：已到段首且前一段是角标时，删除该角标。
  const handleTextBackspace = (index: number, event: KeyboardEvent<HTMLInputElement>): boolean => {
    const input = event.currentTarget;
    if (input.selectionStart !== 0 || input.selectionEnd !== 0) return false;
    const previous = segments[index - 1];
    if (!previous || previous.kind !== 'suffix') return false;
    commit(segments.filter((_segment, segmentIndex) => segmentIndex !== index - 1));
    return true;
  };

  // 文本段 Delete：已到段尾且后一段是角标时，删除该角标。
  const handleTextDelete = (index: number, event: KeyboardEvent<HTMLInputElement>): boolean => {
    const input = event.currentTarget;
    if (input.selectionStart !== input.value.length || input.selectionEnd !== input.value.length) {
      return false;
    }
    const next = segments[index + 1];
    if (!next || next.kind !== 'suffix') return false;
    commit(segments.filter((_segment, segmentIndex) => segmentIndex !== index + 1));
    return true;
  };

  // 角标 chip 内 Backspace：内容已空时删掉自己。
  const handleSuffixBackspace = (
    index: number,
    event: KeyboardEvent<HTMLInputElement>,
  ): boolean => {
    const input = event.currentTarget;
    if (input.selectionStart !== 0 || input.selectionEnd !== 0) return false;
    if (input.value.length > 0) return false;
    removeSuffix(index);
    return true;
  };

  // 左/右方向键在段边界处跨段移动焦点，文本段与角标输入框共用。
  const handleSegmentArrow = (
    index: number,
    direction: 'left' | 'right',
    event: KeyboardEvent<HTMLInputElement>,
  ): boolean => {
    const input = event.currentTarget;
    const atStart = input.selectionStart === 0 && input.selectionEnd === 0;
    const atEnd =
      input.selectionStart === input.value.length && input.selectionEnd === input.value.length;
    if (direction === 'left' ? !atStart : !atEnd) return false;
    const targetIndex = direction === 'left' ? index - 1 : index + 1;
    const target = segments[targetIndex];
    if (!target) return false;
    window.requestAnimationFrame(() => {
      if (target.kind === 'suffix') {
        focusSuffixInput(targetIndex, direction === 'left' ? undefined : 0);
        return;
      }
      focusTextSegment(targetIndex, direction === 'left' ? target.value.length : 0);
    });
    return true;
  };

  const caretIndex =
    activeTextIndex !== null && segments[activeTextIndex]?.kind === 'text' ? activeTextIndex : null;

  return (
    <MetroWayfindingSegmentFieldShell
      label={label}
      disabled={disabled}
      ariaLabel={t('metroWayfindingEditor.aria.inlineEditable', { label })}
      onBlankPointerDown={focusLastEditableSegment}
    >
      {segments.map((segment, index) =>
        segment.kind === 'suffix' ? (
          <span
            key={`suffix-${index}`}
            className="metro-wayfinding-main-segments-chip is-suffix"
            title={t('metroWayfindingEditor.suffix.label')}
          >
            <input
              ref={(node) => {
                if (node) suffixInputs.current.set(index, node);
                else suffixInputs.current.delete(index);
              }}
              className="metro-wayfinding-main-segments-chip-input"
              value={segment.value}
              disabled={disabled}
              size={Math.max(segment.value.length, 1)}
              maxLength={24}
              aria-label={t('metroWayfindingEditor.aria.suffixOrdinal', { index: index + 1 })}
              placeholder={t('metroWayfindingEditor.suffix.placeholder')}
              onFocus={() => setActiveTextIndex(null)}
              onChange={(event) => setSuffixValue(index, event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === 'Backspace' && handleSuffixBackspace(index, event)) {
                  event.preventDefault();
                  return;
                }
                if (event.key === 'ArrowLeft' && handleSegmentArrow(index, 'left', event)) {
                  event.preventDefault();
                  return;
                }
                if (event.key === 'ArrowRight' && handleSegmentArrow(index, 'right', event)) {
                  event.preventDefault();
                }
              }}
            />
            <button
              type="button"
              className="metro-wayfinding-main-segments-chip-remove"
              title={t('metroWayfindingEditor.suffix.remove')}
              aria-label={t('metroWayfindingEditor.suffix.remove')}
              disabled={disabled}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => removeSuffix(index)}
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                close
              </span>
            </button>
          </span>
        ) : (
          <span
            key={`text-${index}`}
            className={`metro-wayfinding-main-segments-text-flow${
              caretIndex === index ? ' is-active' : ''
            }`}
          >
            <input
              ref={(node) => {
                if (node) textInputs.current.set(index, node);
                else textInputs.current.delete(index);
              }}
              className="metro-wayfinding-main-segments-text"
              value={segment.value}
              disabled={disabled}
              size={Math.max(segment.value.length, 1)}
              maxLength={160}
              aria-label={t('metroWayfindingEditor.aria.textSegment', {
                label,
                index: index + 1,
              })}
              onFocus={(event) => {
                setActiveTextIndex(index);
                syncCaretOffset(event.currentTarget);
              }}
              onSelect={(event) => syncCaretOffset(event.currentTarget)}
              onClick={(event) => syncCaretOffset(event.currentTarget)}
              onKeyUp={(event) => syncCaretOffset(event.currentTarget)}
              onChange={(event) => {
                setCaretOffset(
                  event.currentTarget.selectionStart ?? event.currentTarget.value.length,
                );
                setTextSegmentValue(index, event.currentTarget.value);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Backspace' && handleTextBackspace(index, event)) {
                  event.preventDefault();
                  return;
                }
                if (event.key === 'Delete' && handleTextDelete(index, event)) {
                  event.preventDefault();
                  return;
                }
                if (event.key === 'ArrowLeft' && handleSegmentArrow(index, 'left', event)) {
                  event.preventDefault();
                  return;
                }
                if (event.key === 'ArrowRight' && handleSegmentArrow(index, 'right', event)) {
                  event.preventDefault();
                }
              }}
            />
            {caretIndex === index ? (
              // 与主文本一致：插入按钮装在 `caret-actions` 里才有虚线 chip 外观。
              <span className="metro-wayfinding-main-segments-caret-actions">
                <button
                  type="button"
                  className="metro-wayfinding-main-segments-insert-suffix"
                  title={t('metroWayfindingEditor.largeText.insertSuffix')}
                  aria-label={t('metroWayfindingEditor.largeText.insertSuffix')}
                  disabled={disabled}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={insertSuffixAtCaret}
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    subscript
                  </span>
                  {t('metroWayfindingEditor.suffix.placeholder')}
                </button>
              </span>
            ) : null}
          </span>
        ),
      )}
    </MetroWayfindingSegmentFieldShell>
  );
}

function LargeTextElementFields({
  element,
  disabled,
  lineColorOptions,
  patch,
}: Readonly<{
  element: MetroWayfindingLargeTextElement;
  disabled: boolean;
  lineColorOptions: Array<{ value: string; label: string }>;
  patch: (patch: Partial<MetroWayfindingElement>) => void;
}>) {
  const { t } = useI18n();
  return (
    <div className="metro-wayfinding-field-grid">
      {/*
        刻意**不**放进 .material-field：那里 `.material-field input` 的特异性
        会盖掉内联输入框的 `border: 0 / padding: 0`，把一行段编辑拆成几个
        独立输入框。与主文本保持一致——直接作为字段网格的一项，跨满整行。
      */}
      <div className="metro-wayfinding-large-text-field">
        <span>
          {t('metroWayfindingEditor.largeText.fieldLabel', {
            size: METRO_WAYFINDING_LARGE_TEXT_FRAMED_FONT_SIZE,
          })}
        </span>
        <LargeTextValueEditor
          label={t('metroWayfindingEditor.elementType.largeText')}
          element={element}
          disabled={disabled}
          patch={patch}
        />
      </div>
      <FrameShapeControl
        value={element.frameShape}
        disabled={disabled}
        onChange={(frameShape) => patch({ frameShape })}
      />
      {element.frameShape !== 'none' ? (
        <FrameFillControl
          mode={element.frameFillMode}
          color={element.frameFillColor}
          stroke={element.frameStroke}
          fallbackColor={element.foregroundColor ?? '#FFFFFF'}
          lineColorOptions={lineColorOptions}
          disabled={disabled}
          patch={patch}
        />
      ) : null}
    </div>
  );
}

function CombinationElementFields({
  element,
  disabled,
  lineColorOptions,
  backgroundColorOptions,
  inheritedBackgroundColor,
  inheritedForegroundColor,
  textSuggestions,
  patch,
}: Readonly<{
  element: MetroWayfindingCombinationElement;
  disabled: boolean;
  lineColorOptions: Array<{ value: string; label: string; aliases?: string[] }>;
  backgroundColorOptions: Array<{ value: string; label: string }>;
  inheritedBackgroundColor: string;
  inheritedForegroundColor: string;
  textSuggestions?: string[];
  patch: (patch: Partial<MetroWayfindingElement>) => void;
}>) {
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedChildId, setSelectedChildId] = useState(element.children[0]?.id ?? '');
  const selectedChild =
    element.children.find((child) => child.id === selectedChildId) ?? element.children[0];

  useEffect(() => {
    if (!element.children.some((child) => child.id === selectedChildId)) {
      setSelectedChildId(element.children[0]?.id ?? '');
    }
  }, [element.children, selectedChildId]);

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [isOpen]);

  const updateChildren = (children: MetroWayfindingCombinationChild[]) => patch({ children });
  const updateChild = (childId: string, nextPatch: Partial<MetroWayfindingElement>) =>
    updateChildren(
      element.children.map((child) =>
        child.id === childId
          ? ({ ...child, ...nextPatch } as MetroWayfindingCombinationChild)
          : child,
      ),
    );
  const addChild = (type: 'facility' | 'arrow' | 'text' | 'largeText' | 'space') => {
    const child = createMetroWayfindingElement(type) as MetroWayfindingCombinationChild;
    updateChildren([...element.children, child]);
    setSelectedChildId(child.id);
  };
  const changeChildType = (
    child: MetroWayfindingCombinationChild,
    type: 'facility' | 'arrow' | 'text' | 'largeText' | 'space',
  ) => {
    const replacement = createMetroWayfindingElement(type) as MetroWayfindingCombinationChild;
    updateChild(child.id, {
      ...replacement,
      id: child.id,
      backgroundColor: child.backgroundColor,
      foregroundColor: child.foregroundColor,
    });
  };
  const moveChild = (index: number, direction: 'up' | 'down') => {
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= element.children.length) return;
    const children = [...element.children];
    [children[index], children[target]] = [children[target]!, children[index]!];
    updateChildren(children);
  };
  const removeChild = (childId: string) => {
    const children = element.children.filter((child) => child.id !== childId);
    updateChildren(children);
    if (childId === selectedChildId) setSelectedChildId(children[0]?.id ?? '');
  };

  const childBackground =
    element.frameFillMode === 'inverse'
      ? (element.foregroundColor ?? inheritedForegroundColor)
      : element.frameFillMode === 'color'
        ? (element.frameFillColor ?? element.foregroundColor ?? inheritedForegroundColor)
        : (element.backgroundColor ?? inheritedBackgroundColor);
  const childForeground =
    element.frameFillMode === 'inverse'
      ? (element.backgroundColor ?? inheritedBackgroundColor)
      : (element.foregroundColor ?? inheritedForegroundColor);

  return (
    <>
      <div className="metro-wayfinding-field-grid">
        <label className="material-field">
          <span>{t('metroWayfindingEditor.combination.scale')}</span>
          <input
            type="number"
            min={METRO_WAYFINDING_COMBINATION_MIN_SCALE}
            max={METRO_WAYFINDING_COMBINATION_MAX_SCALE}
            step="0.05"
            value={element.scale}
            disabled={disabled}
            onChange={(event) =>
              patch({
                scale: Math.max(
                  METRO_WAYFINDING_COMBINATION_MIN_SCALE,
                  Math.min(
                    METRO_WAYFINDING_COMBINATION_MAX_SCALE,
                    Math.round(
                      (Number(event.currentTarget.value) ||
                        METRO_WAYFINDING_COMBINATION_DEFAULT_SCALE) * 100,
                    ) / 100,
                  ),
                ),
              })
            }
          />
        </label>
        <CombinationFillControl
          mode={element.frameFillMode}
          color={element.frameFillColor}
          stroke={element.frameStroke}
          scale={element.scale}
          stripePosition={element.stripePosition}
          fallbackColor={element.foregroundColor ?? inheritedForegroundColor}
          lineColorOptions={lineColorOptions}
          disabled={disabled}
          patch={patch}
        />
        <button
          type="button"
          className="secondary-action-button metro-wayfinding-combination-edit-button"
          disabled={disabled}
          onClick={() => setIsOpen(true)}
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            tune
          </span>
          <span>
            {t('metroWayfindingEditor.combination.editWithCount', {
              count: element.children.length,
            })}
          </span>
        </button>
      </div>
      {isOpen ? (
        <div
          className="modal-backdrop metro-wayfinding-combination-dialog-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setIsOpen(false);
          }}
        >
          <section
            className="modal-panel metro-wayfinding-combination-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${element.id}-combination-heading`}
          >
            <header>
              <div>
                <span>{t('metroWayfindingEditor.combination.eyebrow')}</span>
                <h2 id={`${element.id}-combination-heading`}>
                  {t('metroWayfindingEditor.combination.editTitle')}
                </h2>
              </div>
              <button
                type="button"
                className="icon-button"
                aria-label={t('metroWayfindingEditor.combination.closeAria')}
                title={t('metroWayfindingEditor.action.close')}
                onClick={() => setIsOpen(false)}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  close
                </span>
              </button>
            </header>
            <p className="muted">{t('metroWayfindingEditor.combination.description')}</p>
            {element.children.length ? (
              <ol
                className="metro-wayfinding-combination-child-list"
                role="tablist"
                aria-label={t('metroWayfindingEditor.combination.listAria')}
              >
                {element.children.map((child, index) => (
                  <li key={child.id}>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={child.id === selectedChild?.id}
                      className={child.id === selectedChild?.id ? 'is-active' : undefined}
                      onClick={() => setSelectedChildId(child.id)}
                    >
                      <MetroWayfindingElementTabContent element={child} layoutMode="single" />
                      <span className="metro-wayfinding-combination-child-index">{index + 1}</span>
                    </button>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="muted metro-wayfinding-combination-empty">
                {t('metroWayfindingEditor.combination.empty')}
              </p>
            )}
            <div
              className="metro-wayfinding-combination-add-actions"
              aria-label={t('metroWayfindingEditor.combination.addAria')}
            >
              {(
                [
                  {
                    type: 'facility',
                    labelKey: 'metroWayfindingEditor.combination.addFacility',
                    icon: 'accessible',
                  },
                  {
                    type: 'arrow',
                    labelKey: 'metroWayfindingEditor.elementType.arrow',
                    icon: 'arrow_forward',
                  },
                  {
                    type: 'text',
                    labelKey: 'metroWayfindingEditor.elementType.text',
                    icon: 'text_fields',
                  },
                  {
                    type: 'largeText',
                    labelKey: 'metroWayfindingEditor.elementType.largeText',
                    icon: 'title',
                  },
                  {
                    type: 'space',
                    labelKey: 'metroWayfindingEditor.combination.addSpace',
                    icon: 'space_bar',
                  },
                ] as const
              ).map(({ type, labelKey, icon }) => (
                <button
                  key={type}
                  type="button"
                  className="secondary-action-button"
                  disabled={disabled || element.children.length >= 32}
                  onClick={() =>
                    addChild(type as 'facility' | 'arrow' | 'text' | 'largeText' | 'space')
                  }
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    {icon}
                  </span>
                  <span>{t(labelKey)}</span>
                </button>
              ))}
            </div>
            <p className="muted metro-wayfinding-combination-template-hint">
              {t('metroWayfindingEditor.combination.templateHint')}
            </p>
            {selectedChild ? (
              <div className="metro-wayfinding-combination-child-editor">
                <header>
                  <strong>{metroElementLabel(selectedChild, t)}</strong>
                  <div className="metro-wayfinding-element-actions">
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={t('metroWayfindingEditor.combination.childMoveUpAria')}
                      title={t('metroWayfindingEditor.action.moveUp')}
                      disabled={disabled || element.children.indexOf(selectedChild) === 0}
                      onClick={() => moveChild(element.children.indexOf(selectedChild), 'up')}
                    >
                      <span className="material-symbols-outlined" aria-hidden="true">
                        arrow_upward
                      </span>
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={t('metroWayfindingEditor.combination.childMoveDownAria')}
                      title={t('metroWayfindingEditor.action.moveDown')}
                      disabled={
                        disabled ||
                        element.children.indexOf(selectedChild) === element.children.length - 1
                      }
                      onClick={() => moveChild(element.children.indexOf(selectedChild), 'down')}
                    >
                      <span className="material-symbols-outlined" aria-hidden="true">
                        arrow_downward
                      </span>
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={t('metroWayfindingEditor.combination.childDuplicateAria')}
                      title={t('metroWayfindingEditor.action.duplicate')}
                      disabled={disabled || element.children.length >= 32}
                      onClick={() => {
                        const copy = duplicateMetroWayfindingElement(
                          selectedChild,
                        ) as MetroWayfindingCombinationChild;
                        const index = element.children.indexOf(selectedChild);
                        const children = [...element.children];
                        children.splice(index + 1, 0, copy);
                        updateChildren(children);
                        setSelectedChildId(copy.id);
                      }}
                    >
                      <span className="material-symbols-outlined" aria-hidden="true">
                        content_copy
                      </span>
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={t('metroWayfindingEditor.combination.childRemoveAria')}
                      title={t('metroWayfindingEditor.action.delete')}
                      disabled={disabled}
                      onClick={() => removeChild(selectedChild.id)}
                    >
                      <span className="material-symbols-outlined" aria-hidden="true">
                        delete
                      </span>
                    </button>
                  </div>
                </header>
                <SegmentedControl
                  label={t('metroWayfindingEditor.combination.childType')}
                  value={selectedChild.type}
                  options={[
                    {
                      value: 'facility',
                      label: t('metroWayfindingEditor.elementType.facility'),
                      icon: 'accessible',
                    },
                    {
                      value: 'arrow',
                      label: t('metroWayfindingEditor.elementType.arrow'),
                      icon: 'arrow_forward',
                    },
                    {
                      value: 'text',
                      label: t('metroWayfindingEditor.elementType.text'),
                      icon: 'text_fields',
                    },
                    {
                      value: 'largeText',
                      label: t('metroWayfindingEditor.elementType.largeText'),
                      icon: 'title',
                    },
                    {
                      value: 'space',
                      label: t('metroWayfindingEditor.elementType.spaceShort'),
                      icon: 'space_bar',
                    },
                  ]}
                  disabled={disabled}
                  wide
                  onChange={(type) => changeChildType(selectedChild, type)}
                />
                <ElementColorFields
                  element={selectedChild}
                  disabled={disabled}
                  backgroundColorOptions={backgroundColorOptions}
                  inheritedBackgroundColor={childBackground}
                  inheritedForegroundColor={childForeground}
                  patch={(nextPatch) => updateChild(selectedChild.id, nextPatch)}
                />
                {selectedChild.type === 'facility' ? (
                  <FacilityElementFields
                    element={selectedChild}
                    disabled={disabled}
                    lineColorOptions={lineColorOptions}
                    patch={(nextPatch) => updateChild(selectedChild.id, nextPatch)}
                  />
                ) : null}
                {selectedChild.type === 'arrow' ? (
                  <ArrowElementFields
                    element={selectedChild}
                    disabled={disabled}
                    lineColorOptions={lineColorOptions}
                    patch={(nextPatch) => updateChild(selectedChild.id, nextPatch)}
                  />
                ) : null}
                {selectedChild.type === 'text' ? (
                  <TextElementFields
                    element={selectedChild}
                    layoutMode="single"
                    disabled={disabled}
                    lineColorOptions={lineColorOptions}
                    textSuggestions={textSuggestions}
                    patch={(nextPatch) => updateChild(selectedChild.id, nextPatch)}
                  />
                ) : null}
                {selectedChild.type === 'largeText' ? (
                  <LargeTextElementFields
                    element={selectedChild}
                    disabled={disabled}
                    lineColorOptions={lineColorOptions}
                    patch={(nextPatch) => updateChild(selectedChild.id, nextPatch)}
                  />
                ) : null}
                {selectedChild.type === 'space' ? (
                  <SpaceElementFields
                    element={selectedChild}
                    disabled={disabled}
                    patch={(nextPatch) => updateChild(selectedChild.id, nextPatch)}
                  />
                ) : null}
              </div>
            ) : null}
            <footer>
              <button type="button" className="is-primary" onClick={() => setIsOpen(false)}>
                <span className="material-symbols-outlined" aria-hidden="true">
                  check
                </span>
                {t('metroWayfindingEditor.action.done')}
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </>
  );
}

function CombinationFillControl({
  mode,
  color,
  stroke,
  scale,
  stripePosition,
  fallbackColor,
  lineColorOptions,
  disabled,
  patch,
}: Readonly<{
  mode: MetroWayfindingCombinationFillMode;
  color?: string;
  stroke: boolean;
  scale: number;
  stripePosition: MetroWayfindingCombinationStripePosition;
  fallbackColor: string;
  lineColorOptions: Array<{ value: string; label: string }>;
  disabled: boolean;
  patch: (patch: Partial<MetroWayfindingElement>) => void;
}>) {
  const { t } = useI18n();
  const fillColor = color ?? lineColorOptions[0]?.value ?? fallbackColor;
  const fillColorOptions = mergeMetroColorOptions(
    lineColorOptions,
    metroWayfindingForegroundPalette,
  );
  // 组合框填充模式切换除了写入 frameFillMode，还会联动缩放倍数与前景色描边：
  // - 切入 / 切出「无填充+色带」：缩放倍数分别除以 / 乘以补偿系数，避免重复点击造成缩放漂移。
  // - 切入「颜色填充」：默认勾选「添加前景色描边」，让色块在浅色底上仍有轮廓。
  // - 切入「无填充+色带」：默认取消勾选前景色描边，避免描边干扰色带的观感。
  const handleModeChange = (frameFillMode: MetroWayfindingCombinationFillMode) => {
    patch({
      frameFillMode,
      scale: resolveMetroWayfindingCombinationScaleForFillMode(scale, mode, frameFillMode),
      ...(frameFillMode === 'color' ? { frameStroke: true } : {}),
      ...(frameFillMode === 'stripe' ? { frameStroke: false } : {}),
      ...((frameFillMode === 'color' || frameFillMode === 'stripe') && !color
        ? { frameFillColor: fillColor }
        : {}),
    });
  };
  return (
    <>
      <SegmentedControl
        label={t('metroWayfindingEditor.combination.fill')}
        value={mode}
        options={[
          { value: 'none', label: t('metroWayfindingEditor.fill.none'), icon: 'border_outer' },
          {
            value: 'inverse',
            label: t('metroWayfindingEditor.fill.inverse'),
            icon: 'invert_colors',
          },
          { value: 'color', label: t('metroWayfindingEditor.fill.color'), icon: 'palette' },
          {
            value: 'stripe',
            label: t('metroWayfindingEditor.fill.stripe'),
            icon: 'view_sidebar',
          },
        ]}
        disabled={disabled}
        wide
        onChange={handleModeChange}
      />
      {mode === 'color' || mode === 'stripe' ? (
        <ColorControl
          label={
            mode === 'stripe'
              ? t('metroWayfindingEditor.combination.stripeColor')
              : t('metroWayfindingEditor.combination.fillColor')
          }
          value={fillColor}
          palette={fillColorOptions}
          disabled={disabled}
          onChange={(frameFillColor) => patch({ frameFillColor })}
        />
      ) : null}
      {mode === 'stripe' ? (
        <SegmentedControl
          label={t('metroWayfindingEditor.combination.stripePosition')}
          value={stripePosition}
          options={[
            {
              value: 'left',
              label: t('metroWayfindingEditor.stripePosition.left'),
              icon: 'align_horizontal_left',
            },
            {
              value: 'right',
              label: t('metroWayfindingEditor.stripePosition.right'),
              icon: 'align_horizontal_right',
            },
            {
              value: 'bottom',
              label: t('metroWayfindingEditor.stripePosition.bottom'),
              icon: 'vertical_align_bottom',
            },
          ]}
          disabled={disabled}
          wide
          onChange={(nextPosition) => patch({ stripePosition: nextPosition })}
        />
      ) : null}
      <label className="material-checkbox-row metro-wayfinding-toggle">
        <input
          type="checkbox"
          checked={stroke}
          disabled={disabled}
          onChange={(event) => patch({ frameStroke: event.currentTarget.checked })}
        />
        <span>{t('metroWayfindingEditor.field.addForegroundStroke')}</span>
      </label>
    </>
  );
}

function SpaceElementFields({
  element,
  disabled,
  patch,
}: Readonly<{
  element: Extract<MetroWayfindingElement, { type: 'space' }>;
  disabled: boolean;
  patch: (patch: Partial<MetroWayfindingElement>) => void;
}>) {
  const { t } = useI18n();
  return (
    <div className="metro-wayfinding-field-grid">
      <SegmentedControl
        label={t('metroWayfindingEditor.space.mode')}
        value={element.mode}
        options={[
          {
            value: 'fixed',
            label: t('metroWayfindingEditor.space.fixed'),
            icon: 'space_bar',
          },
          {
            value: 'flex',
            label: t('metroWayfindingEditor.space.flex'),
            icon: 'arrow_range',
          },
        ]}
        disabled={disabled}
        onChange={(mode) => patch({ mode })}
      />
      {element.mode === 'fixed' ? (
        <label className="material-field">
          <span>{t('metroWayfindingEditor.space.width')}</span>
          <input
            type="number"
            min="1"
            max="32"
            step="1"
            value={element.units}
            disabled={disabled}
            onChange={(event) =>
              patch({
                units: Math.max(
                  1,
                  Math.min(32, Math.round(Number(event.currentTarget.value) || 1)),
                ),
              })
            }
          />
        </label>
      ) : (
        <p className="muted">{t('metroWayfindingEditor.space.flexNote')}</p>
      )}
    </div>
  );
}

function metroIconPreviewStyle(iconId: string): { transform: string } | undefined {
  if (iconId === 'no-entry') {
    return { transform: 'rotate(-45deg)' };
  }
  return undefined;
}

function metroIconElementPreviewStyle(
  iconId: string,
  direction: 'left' | 'right' | 'up' | 'down' | undefined,
): { transform: string } | undefined {
  const arrowStyle = metroIconPreviewStyle(iconId);
  if (arrowStyle) {
    return arrowStyle;
  }
  const fallbackDirection = resolveMetroWayfindingFacilityDefaultDirection(iconId);
  return fallbackDirection
    ? metroFacilityDirectionPreviewStyle(iconId, direction ?? fallbackDirection)
    : undefined;
}

function metroFacilityAssetPreviewStyle(
  iconId: string,
  direction: 'left' | 'right' | 'up' | 'down' | undefined,
  variant?: MetroWayfindingIconVariant,
): { transform: string } | undefined {
  // 楼梯：每个「变种 × 方向」都有独立素材（-right 后缀为朝右版），不再做镜像。
  if (iconId === 'stairs' || iconId === 'stairs-down') {
    return undefined;
  }
  // 扶梯 / 轮椅升降机 / 轮椅：素材原始朝向为“朝右”，朝左时按图标声明的镜像轴翻转。
  // 默认水平镜像（scaleX(-1)），个别图标可能是垂直镜像（scaleY(-1)）。
  if (iconId === 'escalator' || iconId === 'wheelchair-lift' || iconId === 'wheelchair') {
    const effectiveDirection =
      direction ?? resolveMetroWayfindingFacilityDefaultDirection(iconId) ?? 'up';
    if (effectiveDirection !== 'left') return undefined;
    return {
      transform:
        resolveMetroFacilityMirrorAxis(iconId, variant) === 'vertical'
          ? 'scaleY(-1)'
          : 'scaleX(-1)',
    };
  }
  if (iconId !== 'exit') {
    return undefined;
  }
  const effectiveDirection =
    direction ?? resolveMetroWayfindingFacilityDefaultDirection(iconId) ?? 'up';
  if (effectiveDirection === 'left') return { transform: 'rotate(-90deg)' };
  if (effectiveDirection === 'up') return undefined;
  if (effectiveDirection === 'down') return { transform: 'rotate(180deg)' };
  return { transform: 'rotate(90deg)' };
}

function metroFacilityDirectionPreviewStyle(
  iconId: string,
  direction: 'left' | 'right' | 'up' | 'down',
): { transform: string } | undefined {
  if (direction === 'left') {
    return { transform: 'scaleX(-1)' };
  }
  if (iconId === 'exit' && direction === 'up') {
    return { transform: 'rotate(-90deg)' };
  }
  if (iconId === 'exit' && direction === 'down') {
    return { transform: 'rotate(90deg)' };
  }
  return undefined;
}

function SegmentedControl<T extends string>({
  label,
  value,
  options,
  disabled,
  showLabels = true,
  wide = false,
  onChange,
}: Readonly<{
  label: string;
  value: T;
  options: ReadonlyArray<{
    value: T;
    label: string;
    icon?: string;
    assetName?: string;
    iconStyle?: { transform: string };
  }>;
  disabled: boolean;
  showLabels?: boolean;
  wide?: boolean;
  onChange: (value: T) => void;
}>) {
  const controlRef = useRef<HTMLFieldSetElement>(null);
  const [compactLabels, setCompactLabels] = useState(false);

  useLayoutEffect(() => {
    if (!showLabels) {
      setCompactLabels(false);
      return;
    }

    const control = controlRef.current;
    const optionsContainer = control?.querySelector<HTMLDivElement>(':scope > div');
    if (!control || !optionsContainer) return;

    const updateLabelMode = () => {
      const containerStyle = window.getComputedStyle(optionsContainer);
      const availableWidth =
        optionsContainer.clientWidth -
        Number.parseFloat(containerStyle.paddingLeft) -
        Number.parseFloat(containerStyle.paddingRight);
      const measurement = control.cloneNode(true) as HTMLFieldSetElement;
      measurement.classList.remove('is-compact');
      measurement.classList.add('is-measuring');
      Object.assign(measurement.style, {
        position: 'fixed',
        top: '-10000px',
        left: '-10000px',
        width: 'max-content',
        maxWidth: 'none',
        visibility: 'hidden',
        pointerEvents: 'none',
      });

      let requiredWidth = 0;
      document.body.appendChild(measurement);
      try {
        const measuredOptionsContainer = measurement.querySelector<HTMLDivElement>(':scope > div');
        if (measuredOptionsContainer) {
          const measuredStyle = window.getComputedStyle(measuredOptionsContainer);
          requiredWidth =
            measuredOptionsContainer.getBoundingClientRect().width -
            Number.parseFloat(measuredStyle.paddingLeft) -
            Number.parseFloat(measuredStyle.paddingRight);
        }
      } finally {
        measurement.remove();
      }
      const shouldCompact = requiredWidth > availableWidth + 1;
      setCompactLabels((previous) => (previous === shouldCompact ? previous : shouldCompact));
    };

    updateLabelMode();
    const resizeObserver = new ResizeObserver(updateLabelMode);
    resizeObserver.observe(optionsContainer);
    return () => resizeObserver.disconnect();
  }, [options, showLabels]);

  return (
    <fieldset
      ref={controlRef}
      className={`metro-wayfinding-segmented-control${wide ? ' is-wide' : ''}${compactLabels ? ' is-compact' : ''}`}
      disabled={disabled}
    >
      <legend>{label}</legend>
      <div>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={option.value === value ? 'is-active' : undefined}
            aria-pressed={option.value === value}
            aria-label={option.label}
            title={option.label}
            onClick={() => onChange(option.value)}
          >
            {option.assetName ? (
              <MetroFacilityAssetIcon assetName={option.assetName} style={option.iconStyle} />
            ) : option.icon ? (
              <span
                className="material-symbols-outlined"
                aria-hidden="true"
                style={option.iconStyle}
              >
                {option.icon}
              </span>
            ) : null}
            {showLabels ? (
              <span className="metro-wayfinding-segmented-control-label">{option.label}</span>
            ) : null}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function IconChoiceGrid({
  label,
  value,
  options,
  disabled,
  onChange,
}: Readonly<{
  label: string;
  value: string;
  options: ReadonlyArray<
    Pick<MetroWayfindingIconOption, 'id' | 'label' | 'symbol' | 'assetName'> & {
      arrowAssetName?: string;
      iconStyle?: { transform: string };
    }
  >;
  disabled: boolean;
  onChange: (value: string) => void;
}>) {
  return (
    <fieldset className="metro-wayfinding-icon-picker" disabled={disabled}>
      <legend>{label}</legend>
      <div>
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            className={option.id === value ? 'is-active' : undefined}
            aria-pressed={option.id === value}
            title={option.label}
            onClick={() => onChange(option.id)}
          >
            {option.arrowAssetName ? (
              <MetroArrowAssetIcon assetName={option.arrowAssetName} />
            ) : option.assetName ? (
              <MetroFacilityAssetIcon assetName={option.assetName} style={option.iconStyle} />
            ) : (
              <span
                className="material-symbols-outlined"
                aria-hidden="true"
                style={option.iconStyle}
              >
                {option.symbol}
              </span>
            )}
            <span>{option.label}</span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function MetroFacilityAssetIcon({
  assetName,
  style,
}: Readonly<{ assetName: string; style?: { transform: string } }>) {
  const assetUrl = appPath(`/metro-facilities/plain/${assetName}.svg`);
  return (
    <span
      className="metro-wayfinding-facility-asset"
      aria-hidden="true"
      style={
        {
          '--metro-wayfinding-facility-asset': `url("${assetUrl}")`,
          ...style,
        } as CSSProperties
      }
    />
  );
}

function MetroArrowAssetIcon({ assetName }: Readonly<{ assetName: string }>) {
  const assetUrl = appPath(`/metro-arrows/${assetName}.svg`);
  return (
    <span
      className="metro-wayfinding-facility-asset metro-wayfinding-arrow-asset"
      aria-hidden="true"
      style={
        {
          '--metro-wayfinding-facility-asset': `url("${assetUrl}")`,
        } as CSSProperties
      }
    />
  );
}

function ElementColorFields({
  element,
  disabled,
  backgroundColorOptions,
  inheritedBackgroundColor,
  inheritedForegroundColor,
  patch,
}: Readonly<{
  element: MetroWayfindingElement;
  disabled: boolean;
  backgroundColorOptions: Array<{ value: string; label: string }>;
  inheritedBackgroundColor: string;
  inheritedForegroundColor: string;
  patch: (patch: Partial<MetroWayfindingElement>) => void;
}>) {
  const { t } = useI18n();
  return (
    <div className="metro-wayfinding-color-row">
      <ColorControl
        label={t('metroWayfindingEditor.color.background')}
        value={element.backgroundColor ?? inheritedBackgroundColor}
        palette={backgroundColorOptions}
        disabled={disabled}
        inherit={{
          active: element.backgroundColor === undefined,
          label: t('metroWayfindingEditor.color.inherit'),
          onSelect: () => patch({ backgroundColor: undefined }),
        }}
        onChange={(backgroundColor) => patch({ backgroundColor })}
      />
      <ColorControl
        label={t('metroWayfindingEditor.color.foreground')}
        value={element.foregroundColor ?? inheritedForegroundColor}
        palette={metroWayfindingForegroundPalette}
        disabled={disabled}
        inherit={{
          active: element.foregroundColor === undefined,
          label: t('metroWayfindingEditor.color.inherit'),
          onSelect: () => patch({ foregroundColor: undefined }),
        }}
        onChange={(foregroundColor) => patch({ foregroundColor })}
      />
    </div>
  );
}

function ColorControl({
  label,
  value,
  palette,
  disabled,
  inherit,
  onChange,
}: Readonly<{
  label: string;
  value: string;
  palette: ReadonlyArray<{ value: string; label: string }>;
  disabled: boolean;
  inherit?: { active: boolean; label: string; onSelect: () => void };
  onChange: (value: string) => void;
}>) {
  const { t } = useI18n();
  const usesPreset = palette.some((item) => item.value.toUpperCase() === value.toUpperCase());
  const selectedValue = inherit?.active ? 'inherit' : usesPreset ? value.toUpperCase() : 'custom';
  return (
    <label className="material-field metro-wayfinding-color-control">
      <span>{label}</span>
      <div>
        <select
          value={selectedValue}
          disabled={disabled}
          onChange={(event) => {
            const nextValue = event.currentTarget.value;
            if (nextValue === 'inherit') inherit?.onSelect();
            else if (nextValue !== 'custom') onChange(nextValue);
          }}
        >
          {inherit ? <option value="inherit">{inherit.label}</option> : null}
          {palette.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label} · {item.value}
            </option>
          ))}
          <option value="custom">{t('metroWayfindingEditor.color.custom')}</option>
        </select>
        <input
          type="color"
          aria-label={t('metroWayfindingEditor.color.customAria', { label })}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.currentTarget.value.toUpperCase())}
        />
      </div>
    </label>
  );
}

function reduceMetroWayfindingAction(
  layout: ReturnType<typeof parseMetroWayfindingLayout>,
  action: MetroWayfindingCompositionAction,
) {
  if (action.type === 'reverse') return reverseMetroWayfindingLayout(layout);
  if (action.type === 'replace') return action.layout;
  const elements = layout.rows[action.rowIndex];
  if (!elements) return layout;
  if (action.type === 'add') {
    const defaults =
      layout.mode === 'vertical'
        ? ({ textAlign: 'center', facilityDirection: undefined } as const)
        : resolveMetroWayfindingInsertionContextDefaults(elements, elements.length);
    const previousElement = elements.at(-1);
    const adjacentTextDirection =
      layout.mode !== 'vertical' &&
      previousElement?.type === 'text' &&
      previousElement.align !== 'center'
        ? previousElement.align
        : undefined;
    const element = (() => {
      if (action.element.type === 'facility') {
        const fallbackDirection = resolveMetroWayfindingFacilityDefaultDirection(
          action.element.iconId,
        );
        return fallbackDirection
          ? {
              ...action.element,
              direction:
                action.element.direction ??
                defaults.facilityDirection ??
                adjacentTextDirection ??
                fallbackDirection,
            }
          : action.element;
      }
      if (action.element.type === 'text' && action.element.align === 'center') {
        return { ...action.element, align: defaults.textAlign };
      }
      return action.element;
    })();
    return replaceMetroWayfindingRowElements(layout, action.rowIndex, [...elements, element]);
  }
  if (action.type === 'duplicate') {
    const sourceIndex = elements.findIndex((element) => element.id === action.elementId);
    if (sourceIndex < 0) return layout;
    const duplicatedElements = [...elements];
    duplicatedElements.splice(sourceIndex + 1, 0, action.element);
    return replaceMetroWayfindingRowElements(layout, action.rowIndex, duplicatedElements);
  }
  if (action.type === 'remove')
    return replaceMetroWayfindingRowElements(
      layout,
      action.rowIndex,
      elements.filter((element) => element.id !== action.elementId),
    );
  if (action.type === 'update')
    return replaceMetroWayfindingRowElements(
      layout,
      action.rowIndex,
      elements.map((element) =>
        element.id === action.elementId
          ? ({ ...element, ...action.patch } as MetroWayfindingElement)
          : element,
      ),
    );
  if (action.type === 'changeType') {
    return replaceMetroWayfindingRowElements(
      layout,
      action.rowIndex,
      elements.map((element, index) => {
        if (element.id !== action.elementId || element.type === action.elementType) return element;
        const replacement = createMetroWayfindingElement(action.elementType);
        const defaults =
          layout.mode === 'vertical'
            ? ({ textAlign: 'center', facilityDirection: undefined } as const)
            : resolveMetroWayfindingRowContextDefaults(elements, index);
        const fallbackDirection =
          replacement.type === 'facility'
            ? resolveMetroWayfindingFacilityDefaultDirection(replacement.iconId)
            : undefined;
        const adjacentText = [elements[index - 1], elements[index + 1]].find(
          (neighbor): neighbor is MetroWayfindingTextElement =>
            neighbor?.type === 'text' && neighbor.align !== 'center',
        );
        const adjacentTextDirection =
          layout.mode !== 'vertical' &&
          (adjacentText?.align === 'left' || adjacentText?.align === 'right')
            ? adjacentText.align
            : undefined;
        return {
          ...replacement,
          id: element.id,
          backgroundColor: element.backgroundColor,
          foregroundColor: element.foregroundColor ?? replacement.foregroundColor,
          ...(replacement.type === 'facility' && fallbackDirection
            ? {
                direction: defaults.facilityDirection ?? adjacentTextDirection ?? fallbackDirection,
              }
            : {}),
          ...(replacement.type === 'text' ? { align: defaults.textAlign } : {}),
        } as MetroWayfindingElement;
      }),
    );
  }
  if (action.type === 'reorder') {
    const sourceIndex = elements.findIndex((element) => element.id === action.elementId);
    if (sourceIndex < 0 || action.elementId === action.targetElementId) return layout;
    const reorderedElements = [...elements];
    const [element] = reorderedElements.splice(sourceIndex, 1);
    const targetIndex = reorderedElements.findIndex((item) => item.id === action.targetElementId);
    if (!element || targetIndex < 0) return layout;
    const insertionIndex = action.placement === 'before' ? targetIndex : targetIndex + 1;
    reorderedElements.splice(insertionIndex, 0, element);
    return replaceMetroWayfindingRowElements(layout, action.rowIndex, reorderedElements);
  }
  const index = elements.findIndex((element) => element.id === action.elementId);
  const target = action.direction === 'up' ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= elements.length) return layout;
  const movedElements = [...elements];
  [movedElements[index], movedElements[target]] = [movedElements[target]!, movedElements[index]!];
  return replaceMetroWayfindingRowElements(layout, action.rowIndex, movedElements);
}

function replaceMetroWayfindingRowElements(
  layout: ReturnType<typeof parseMetroWayfindingLayout>,
  rowIndex: number,
  elements: MetroWayfindingElement[],
) {
  return {
    ...layout,
    rows: layout.rows.map((row, index) => (index === rowIndex ? elements : row)),
  };
}

function metroElementLabel(element: MetroWayfindingElement, t: Translate): string {
  if (element.type === 'facility') return t('metroWayfindingEditor.elementLabel.facility');
  if (element.type === 'arrow') return t('metroWayfindingEditor.elementLabel.arrow');
  if (element.type === 'text') {
    return t('metroWayfindingEditor.elementLabel.text', { rows: element.rows.length });
  }
  if (element.type === 'largeText') {
    return t('metroWayfindingEditor.elementLabel.largeText', {
      size:
        element.frameShape !== 'none'
          ? METRO_WAYFINDING_LARGE_TEXT_FRAMED_FONT_SIZE
          : METRO_WAYFINDING_LARGE_TEXT_UNFRAMED_FONT_SIZE,
    });
  }
  if (element.type === 'combination') {
    return t('metroWayfindingEditor.elementLabel.combination', {
      scale: Math.round(element.scale * 100),
      count: element.children.length,
    });
  }
  if (element.type === 'space') return t('metroWayfindingEditor.elementLabel.space');
  return t('metroWayfindingEditor.elementLabel.divider', {
    width: METRO_WAYFINDING_DIVIDER_WIDTH,
  });
}

function FrameShapeControl({
  value,
  disabled,
  onChange,
}: Readonly<{
  value: MetroWayfindingFrameShape;
  disabled: boolean;
  onChange: (value: MetroWayfindingFrameShape) => void;
}>) {
  const { t } = useI18n();
  return (
    <SegmentedControl
      label={t('metroWayfindingEditor.frame.shape')}
      value={value}
      options={[
        { value: 'none', label: t('metroWayfindingEditor.frame.none'), icon: 'block' },
        {
          value: 'rectangle',
          label: t('metroWayfindingEditor.frame.rectangle'),
          icon: 'crop_square',
        },
        { value: 'circle', label: t('metroWayfindingEditor.frame.circle'), icon: 'circle' },
      ]}
      disabled={disabled}
      wide
      onChange={onChange}
    />
  );
}

function FrameFillControl({
  mode,
  color,
  stroke,
  fallbackColor,
  lineColorOptions,
  disabled,
  patch,
}: Readonly<{
  mode: MetroWayfindingFrameFillMode;
  color?: string;
  stroke: boolean;
  fallbackColor: string;
  lineColorOptions: Array<{ value: string; label: string }>;
  disabled: boolean;
  patch: (patch: Partial<MetroWayfindingElement>) => void;
}>) {
  const { t } = useI18n();
  const fillColor = color ?? lineColorOptions[0]?.value ?? fallbackColor;
  const fillColorOptions = mergeMetroColorOptions(
    lineColorOptions,
    metroWayfindingForegroundPalette,
  );
  return (
    <>
      <SegmentedControl
        label={t('metroWayfindingEditor.frame.fill')}
        value={mode}
        options={[
          { value: 'none', label: t('metroWayfindingEditor.fill.none'), icon: 'border_outer' },
          {
            value: 'inverse',
            label: t('metroWayfindingEditor.fill.inverse'),
            icon: 'invert_colors',
          },
          { value: 'color', label: t('metroWayfindingEditor.fill.color'), icon: 'palette' },
        ]}
        disabled={disabled}
        wide
        onChange={(frameFillMode) =>
          patch({
            frameFillMode,
            ...(frameFillMode === 'color' && !color ? { frameFillColor: fillColor } : {}),
          })
        }
      />
      {mode === 'color' ? (
        <ColorControl
          label={t('metroWayfindingEditor.frame.fillColor')}
          value={fillColor}
          palette={fillColorOptions}
          disabled={disabled}
          onChange={(frameFillColor) => patch({ frameFillColor })}
        />
      ) : null}
      {mode !== 'none' ? (
        <label className="material-checkbox-row">
          <input
            type="checkbox"
            checked={stroke}
            disabled={disabled}
            onChange={(event) => patch({ frameStroke: event.currentTarget.checked })}
          />
          <span>{t('metroWayfindingEditor.field.addForegroundStroke')}</span>
        </label>
      ) : null}
    </>
  );
}

function mergeMetroColorOptions(
  ...groups: ReadonlyArray<ReadonlyArray<{ value: string; label: string }>>
): Array<{ value: string; label: string }> {
  const seen = new Set<string>();
  return groups.flatMap((group) =>
    group.filter((option) => {
      const key = option.value.toUpperCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }),
  );
}
