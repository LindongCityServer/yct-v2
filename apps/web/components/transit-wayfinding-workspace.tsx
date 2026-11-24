'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useI18n } from '../lib/client-i18n';
import { subscribeMaterialStudioActionBlocked } from '../lib/client-material-studio-events';
import { publishToastRequested } from '../lib/client-toast-events';
import {
  dispatchMetroWayfindingCompositionAction,
  dispatchMetroWayfindingWorkspaceCommand,
  subscribeMetroWayfindingInspectorSnapshot,
  type MetroWayfindingElementAction,
  type MetroWayfindingInspectorSnapshot,
} from '../lib/client-metro-wayfinding-events';
import {
  createMetroWayfindingElement,
  duplicateMetroWayfindingElement,
  metroWayfindingBackgroundPalette,
  metroWayfindingForegroundPalette,
  resolveMetroWayfindingLayoutSizing,
  resolveMetroWayfindingVerticalLayoutSizing,
  type MetroWayfindingElement,
  type MetroWayfindingLayout,
  type MetroWayfindingLayoutMode,
} from '../lib/metro-wayfinding';
import { defineShortcut } from '../lib/editor/shortcut-builders';
import type { EditorTool } from '../lib/editor/types';
import { useEditorInspectorFocus } from '../lib/editor/use-editor-inspector-focus';
import { useEditorLayerScroll } from '../lib/editor/use-editor-layer-scroll';
import { useEditorPanels } from '../lib/editor/use-editor-panels';
import { useEditorShortcuts } from '../lib/editor/use-editor-shortcuts';
import { EditorHeaderToolbar } from './editor/editor-header-toolbar';
import { EditorHeaderToolsPortal } from './editor/editor-header-tools-portal';
import { EditorDialogPortal } from './editor/editor-dialog-portal';
import { EditorInspectorEntry } from './editor/editor-inspector-entry';
import { EditorLayerRowActions } from './editor/editor-layer-row-actions';
import { EditorPanelHeading } from './editor/editor-panel-heading';
import { EditorRailBridge } from './editor/editor-rail-bridge';
import { EditorToolbar } from './editor/editor-toolbar';
import { EditorToolbarCompactActions } from './editor/editor-toolbar-actions';
import type { EditorToolbarOverflowItem } from './editor/editor-toolbar-overflow';
import {
  ColorControl,
  mergeMetroColorOptions,
  MetroWayfindingElementEditor,
  MetroWayfindingElementGlyph,
} from './metro-wayfinding-editor';
import { describeMetroWayfindingElementContent } from '../lib/metro-wayfinding-content';
import {
  MetroWayfindingInsertionSuggestions,
  MetroWayfindingInspector,
} from './metro-wayfinding-inspector';
import { MetroWayfindingCanvas } from './metro-wayfinding-canvas';
import { MaterialSaveDownloadDialog } from './material-save-download-dialog';
import { SegmentedControl } from './segmented-control';
import { useMaterialStudioToolbarItems } from './use-material-studio-toolbar-items';
import { Modal } from './ui/modal';
import { FieldGroup } from './ui/field';
import { CheckboxRow } from './ui/checkbox-row';
import { IconButton } from './ui/button';

const layoutModeLabels: Record<MetroWayfindingLayoutMode, string> = {
  single: '单行',
  double: '双行',
  vertical: '竖向',
};

/**
 * 公共交通导视工作台：左侧「模板 → 行 → 元素」树、中间还原牌面、右侧属性检查器。
 *
 * 版式与选中态来自编辑器广播的只读快照（`client-metro-wayfinding-events`），
 * 所有写入都通过 action / 命令事件回抛给编辑器，工作台自身不持有可变版式。
 * 模板切换、画布尺寸、数据来源等宿主级控件由 `MaterialStudioPanel` 以插槽传入。
 */
export function TransitWayfindingWorkspace({
  backgroundColorOptions,
  canvasSettings,
  dataSourceControls,
  disabled,
  editor,
  editorId,
  studioId,
  initialLayout,
  lineColorOptions,
  lineKeysByColor,
  templateControls,
  templateMeta,
  templateTitle,
  textSuggestions,
  pxPerMeter = 128,
  maxPxPerMeter = 4096,
  onPxPerMeterChange,
  onExportProject,
  onSubmitReview,
  onDownload,
  transitSource,
  transitSourceOrigin,
  onToggleTransitSource,
  saveBusy = false,
}: Readonly<{
  backgroundColorOptions: Array<{ value: string; label: string }>;
  /** 画布尺寸控件。 */
  canvasSettings?: ReactNode;
  /** 数据来源切换、服务器字段与公共交通网络导入。 */
  dataSourceControls?: ReactNode;
  disabled: boolean;
  /**
   * 隐藏挂载的导视牌编辑器内核：持有版式状态、撤销栈、导入生命周期与快照广播。
   * 工作台只渲染三栏，编辑动作全部通过事件回抛给它。
   */
  editor?: ReactNode;
  editorId: string;
  /** 物料工作室 ID，用于订阅物料动作状态（历史 / 预览 / 提交 / 下载）。 */
  studioId: string;
  initialLayout: MetroWayfindingLayout;
  lineColorOptions: Array<{ value: string; label: string; aliases?: string[] }>;
  lineKeysByColor?: ReadonlyMap<string, string>;
  /** 模板入口与版式 / 风格切换。 */
  templateControls?: ReactNode;
  templateMeta?: string;
  templateTitle: string;
  textSuggestions?: string[];
  /** 导出密度：每个 128 像素格对应的输出像素数。 */
  pxPerMeter?: number;
  /** 当前画布尺寸下 pxPerMeter 的动态上限（最长边 ≤ 4096）。 */
  maxPxPerMeter?: number;
  onPxPerMeterChange?: (value: number) => void;
  onExportProject?: () => void;
  onSubmitReview?: () => void;
  onDownload?: () => void;
  /** 公共交通网络来源：服务器或自定义项目。 */
  transitSource?: 'server' | 'rmp';
  transitSourceOrigin?: 'none' | 'sample' | 'imported';
  onToggleTransitSource?: () => void;
  saveBusy?: boolean;
}>) {
  const { t } = useI18n();
  const [snapshot, setSnapshot] = useState<MetroWayfindingInspectorSnapshot | undefined>();
  const treeRef = useRef<HTMLDivElement | null>(null);
  const inspectorRef = useRef<HTMLElement | null>(null);
  const focusInspector = useEditorInspectorFocus(inspectorRef);
  const { panelsVisible, panelStateClass, togglePanels, openInspector, closeInspector } =
    useEditorPanels();
  const {
    items: materialActionItems,
    badge,
    canDownloadWatermarkFree,
    onRequestLogin,
  } = useMaterialStudioToolbarItems(studioId);
  const [activeTool, setActiveTool] = useState<'select' | 'pan'>('select');
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [dataSourceDialogOpen, setDataSourceDialogOpen] = useState(false);
  // 图层树里选中的组合框子元素：选中仍落在组合框本身，这里只记录要在「组合框子元素」里定位的子项。
  const [selectedCombinationChildId, setSelectedCombinationChildId] = useState<string | null>(null);

  useEditorShortcuts([
    defineShortcut('toolSelect', () => setActiveTool('select')),
    defineShortcut('toolPan', () => setActiveTool('pan')),
  ]);

  useEffect(() => subscribeMetroWayfindingInspectorSnapshot(editorId, setSnapshot), [editorId]);

  // 导出 / 预览失败统一转 toast：导视牌工作台不经过表单工作台的拦截订阅。
  useEffect(
    () =>
      subscribeMaterialStudioActionBlocked(studioId, (message) => {
        publishToastRequested({
          dedupeKey: `material-studio-blocked:${studioId}`,
          message,
          tone: 'warning',
        });
      }),
    [studioId],
  );

  const layout = snapshot?.layout ?? initialLayout;
  const canvasWidthPx = snapshot?.canvasWidth ?? 128;
  const canvasWidthM = canvasWidthPx / 128;
  const canvasHeightM = snapshot?.canvasHeight ?? 1;
  const rowCount = layout.mode === 'double' ? 2 : 1;
  const visibleRows = layout.rows.slice(0, rowCount);
  const totalElementCount = visibleRows.reduce((total, row) => total + row.length, 0);
  const selectedRowIndex = snapshot?.rowIndex ?? 0;
  const activeElements = layout.rows[selectedRowIndex] ?? [];
  const selectedElement = activeElements.find(
    (element) => element.id === snapshot?.selectedElementId,
  );
  const selectedElementIndex = selectedElement
    ? activeElements.findIndex((element) => element.id === selectedElement.id)
    : -1;
  const hasSelection = Boolean(selectedElement);
  const canvasBackgroundOptions = mergeMetroColorOptions(
    metroWayfindingBackgroundPalette,
    lineColorOptions,
  );

  // 选中别的元素、或子元素已随组合框一起删掉时，清掉子元素定位，避免高亮残留。
  useEffect(() => {
    setSelectedCombinationChildId((current) => {
      if (!current) return current;
      if (selectedElement?.type !== 'combination') return null;
      return selectedElement.children.some((child) => child.id === current) ? current : null;
    });
  }, [selectedElement]);

  useEditorLayerScroll(
    treeRef,
    snapshot ? `${snapshot.rowIndex}:${snapshot.selectedElementId}` : null,
  );

  const dispatchElement = (rowIndex: number, action: MetroWayfindingElementAction) => {
    dispatchMetroWayfindingCompositionAction({
      editorId,
      action: { ...action, rowIndex },
    });
  };
  const selectElement = (
    rowIndex: number,
    elementId: string,
    combinationChildId: string | null = null,
  ) => {
    setSelectedCombinationChildId(combinationChildId);
    dispatchMetroWayfindingCompositionAction({
      editorId,
      action: { type: 'select', rowIndex, elementId },
    });
  };
  const selectGlobal = () => {
    selectElement(0, '');
    closeInspector();
  };
  const dispatchWorkspaceCommand = (
    command: Parameters<typeof dispatchMetroWayfindingWorkspaceCommand>[0]['command'],
  ) => {
    dispatchMetroWayfindingWorkspaceCommand({ editorId, command });
  };
  const replaceLayout = (patch: Partial<MetroWayfindingLayout>) => {
    dispatchMetroWayfindingCompositionAction({
      editorId,
      action: { type: 'replace', layout: { ...layout, ...patch } },
    });
  };
  const addElement = () => {
    dispatchElement(selectedRowIndex, {
      type: 'add',
      element: createMetroWayfindingElement('facility'),
    });
  };

  const rowWarnings = visibleRows.map((elements) => {
    if (layout.mode === 'vertical') {
      const sizing = resolveMetroWayfindingVerticalLayoutSizing(elements, canvasHeightM * 128);
      return sizing.isHeightInsufficient;
    }
    const sizing = resolveMetroWayfindingLayoutSizing(elements, canvasWidthPx);
    return sizing.isWidthInsufficient || sizing.hasUnresolvedOverflow;
  });

  const addElementItem = (
    id: string,
    icon: string,
    label: string,
    elementType: MetroWayfindingElement['type'],
  ): EditorToolbarOverflowItem => ({
    id: `add-${id}`,
    icon,
    label: `添加${label}`,
    disabled,
    onClick: () =>
      dispatchElement(selectedRowIndex, {
        type: 'add',
        element: createMetroWayfindingElement(elementType),
      }),
  });

  // 7 种元素各一个添加按钮，平铺在工具栏；新增元素永远落在当前选中行。
  const addElementItems: EditorToolbarOverflowItem[] = [
    addElementItem('facility', 'apps', '设施图标', 'facility'),
    addElementItem('arrow', 'arrow_forward', '箭头', 'arrow'),
    addElementItem('text', 'text_fields', '文字', 'text'),
    addElementItem('largeText', 'title', '大文字', 'largeText'),
    addElementItem('space', 'space_bar', '空白', 'space'),
    addElementItem('divider', 'splitscreen', '分割线', 'divider'),
    addElementItem('combination', 'widgets', '组合框', 'combination'),
  ];

  const arrangeItems: EditorToolbarOverflowItem[] = [
    {
      id: 'library',
      icon: 'dashboard_customize',
      label: t('metroWayfindingEditor.action.openTemplateLibrary'),
      disabled,
      onClick: () => dispatchWorkspaceCommand({ type: 'open-project-dialog', view: 'examples' }),
    },
    {
      id: 'reverse',
      icon: 'flip',
      label: t('metroWayfindingEditor.action.reverse'),
      disabled: disabled || layout.mode === 'vertical',
      onClick: () =>
        dispatchMetroWayfindingCompositionAction({ editorId, action: { type: 'reverse' } }),
    },
    {
      id: 'clear',
      icon: 'delete_sweep',
      label: t('metroWayfindingEditor.action.clear'),
      disabled,
      onClick: () => dispatchWorkspaceCommand({ type: 'clear-layout' }),
    },
  ];

  const tools: EditorTool[] = [
    { id: 'select', icon: 'near_me', label: '选择工具', shortcut: 'V' },
    { id: 'pan', icon: 'pan_tool', label: '手型工具', shortcut: 'H' },
  ];
  const historyItem = materialActionItems.find((item) => item.id === 'history');
  const exportEntryItem: EditorToolbarOverflowItem = {
    id: 'export-entry',
    icon: 'download',
    label: badge ? `保存与下载 · ${badge.label}` : '保存与下载',
    active: Boolean(badge),
    disabled: saveBusy,
    onClick: () => setExportDialogOpen(true),
  };
  const materialItems = [exportEntryItem, ...(historyItem ? [historyItem] : [])];
  // 图标直接反映当前数据来源：服务器=立方体，示例=线路，导入项目=上传文件。
  const sourceToggleGlyph =
    transitSource === 'server'
      ? 'view_in_ar'
      : transitSourceOrigin === 'imported'
        ? 'upload_file'
        : 'route';
  const dataSourceLabel =
    transitSource === 'server'
      ? '服务器线网 · 点击切换到自定义'
      : `${transitSourceOrigin === 'sample' ? '示例线网' : '自定义项目'} · 点击切换到服务器`;
  const dataSourceItems: EditorToolbarOverflowItem[] = [
    {
      id: 'data-source-toggle',
      icon: sourceToggleGlyph,
      label: dataSourceLabel,
      disabled: !onToggleTransitSource,
      onClick: () => onToggleTransitSource?.(),
    },
    {
      id: 'data-source-settings',
      icon: 'database',
      badgeIcon: 'more_horiz',
      label: '数据来源设置',
      onClick: () => setDataSourceDialogOpen(true),
    },
  ];
  const operationGroups = [
    { id: 'add', ariaLabel: '添加元素', items: addElementItems },
    { id: 'arrange', ariaLabel: '牌面结构', items: arrangeItems },
    { id: 'data', ariaLabel: '数据来源', items: dataSourceItems },
    { id: 'material', ariaLabel: '保存与下载', items: materialItems },
  ];

  const renderToolbar = (inHeader: boolean, compact: boolean) => (
    <EditorToolbar
      activeToolId={activeTool}
      ariaLabel="公共交通导视工具"
      className={inHeader ? 'is-in-header' : undefined}
      panels={{
        visible: panelsVisible,
        onToggle: togglePanels,
        label: panelsVisible ? '隐藏全部面板' : '显示全部面板',
      }}
      onToolChange={(toolId) => setActiveTool(toolId === 'pan' ? 'pan' : 'select')}
      sections={[
        { id: 'tools', ariaLabel: '画布工具', tools },
        ...(compact
          ? [
              {
                id: 'operations',
                ariaLabel: '工具与动作',
                actions: (
                  <EditorToolbarCompactActions
                    groups={operationGroups.map((group) => ({
                      id: group.id,
                      items: group.items,
                    }))}
                  />
                ),
              },
            ]
          : operationGroups.map((group) => ({
              id: group.id,
              ariaLabel: group.ariaLabel,
              // 交给工具条按单个按钮收纳，避免整组按钮一起消失。
              items: group.items,
            }))),
      ]}
    />
  );

  const inspectorTitle = selectedElement
    ? describeMetroWayfindingElementContent(selectedElement)
    : layout.mode === 'vertical'
      ? '全局属性 · 竖向'
      : `全局属性 · ${layoutModeLabels[layout.mode]}`;
  const inspectorMeta = selectedElement
    ? `第 ${selectedRowIndex + 1} 行 · 第 ${selectedElementIndex + 1} 个元素`
    : `${canvasWidthM} × ${canvasHeightM} 米 · ${totalElementCount} 个元素`;
  const downloadNote = badge?.requiresLogin
    ? '当前未登录：可下载带水印的预览图；登录并验证账号后可下载清晰原图。'
    : badge
      ? `当前状态：${badge.label}。下载为带水印预览图；提交审核通过后可下载清晰原图。`
      : canDownloadWatermarkFree
        ? '当前账号可直接下载清晰原图。'
        : '下载为带水印预览图。';

  return (
    <div
      className={`transit-visual-workspace transit-wayfinding-workspace${panelStateClass}${
        hasSelection ? ' has-layer-selection' : ''
      }`}
    >
      {/* 编辑器内核隐藏挂载：所有版式状态与弹窗仍由它负责，工作台只做呈现与事件转发。 */}
      {editor ? <div className="transit-wayfinding-engine">{editor}</div> : null}

      <section className="transit-wayfinding-canvas-stage" aria-label="导视牌画布">
        <MetroWayfindingCanvas
          canvasHeightM={canvasHeightM}
          canvasWidthM={canvasWidthM}
          disabled={disabled}
          layout={layout}
          onAddElement={addElement}
          onElementAction={dispatchElement}
          onFocusInspector={() => {
            openInspector();
            focusInspector();
          }}
          onOpenTemplateLibrary={() =>
            dispatchWorkspaceCommand({ type: 'open-project-dialog', view: 'examples' })
          }
          onSelect={selectElement}
          panTool={activeTool === 'pan'}
          selectedElementId={snapshot?.selectedElementId ?? ''}
          selectedRowIndex={selectedRowIndex}
          viewportKey={panelsVisible ? 'panels' : 'canvas'}
        />
      </section>

      <EditorRailBridge
        activeToolId={activeTool}
        ownerId="transit-wayfinding"
        panels={{ visible: panelsVisible, onToggle: togglePanels }}
        sections={[
          { id: 'add', priority: 80, items: addElementItems },
          { id: 'arrange', priority: 70, items: arrangeItems },
          { id: 'data', priority: 65, items: dataSourceItems },
          { id: 'material', priority: 60, items: materialItems },
        ]}
        tools={tools}
        onToolChange={(toolId) => setActiveTool(toolId === 'pan' ? 'pan' : 'select')}
      />

      {panelsVisible ? (
        <aside className="poi-visual-layer-panel" aria-label="导视牌结构">
          <EditorPanelHeading
            meta={`${visibleRows.length} 行 · ${totalElementCount} 个元素`}
            title="导视牌结构"
          >
            <EditorInspectorEntry onOpen={openInspector} />
          </EditorPanelHeading>
          <div className="poi-visual-layer-body" ref={treeRef}>
            <ul className="poi-visual-layer-tree">
              <li>
                <div className={`poi-visual-layer-row${hasSelection ? '' : ' is-active'}`}>
                  <button
                    className={`poi-visual-layer-group${hasSelection ? '' : ' is-active'}`}
                    type="button"
                    onClick={selectGlobal}
                    onDoubleClick={() => {
                      selectGlobal();
                      openInspector();
                      focusInspector();
                    }}
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">
                      signpost
                    </span>
                    <span className="poi-visual-layer-label">{templateTitle}</span>
                    <span className="poi-visual-layer-count">{templateMeta ?? ''}</span>
                  </button>
                </div>
                <ul className="poi-visual-layer-points">
                  {visibleRows.map((elements, rowIndex) => (
                    <li key={rowIndex}>
                      <div className="poi-visual-layer-row">
                        <button
                          className="poi-visual-layer-group"
                          type="button"
                          title={`选中第 ${rowIndex + 1} 行`}
                          onClick={() => selectElement(rowIndex, elements[0]?.id ?? '')}
                        >
                          <span className="material-symbols-outlined" aria-hidden="true">
                            {rowWarnings[rowIndex] ? 'warning' : 'view_stream'}
                          </span>
                          <span className="poi-visual-layer-label">{`第 ${rowIndex + 1} 行`}</span>
                          <span className="poi-visual-layer-count">{elements.length} 个</span>
                        </button>
                      </div>
                      <ul className="poi-visual-layer-points">
                        {elements.map((element, elementIndex) => {
                          const isActive =
                            rowIndex === selectedRowIndex &&
                            element.id === snapshot?.selectedElementId;
                          return (
                            <li key={element.id}>
                              <div
                                className={`poi-visual-layer-row${isActive ? ' is-active' : ''}`}
                              >
                                <button
                                  className={`poi-visual-layer-point${isActive ? ' is-active' : ''}`}
                                  type="button"
                                  onClick={() => selectElement(rowIndex, element.id)}
                                  onDoubleClick={() => {
                                    selectElement(rowIndex, element.id);
                                    openInspector();
                                    focusInspector();
                                  }}
                                >
                                  <MetroWayfindingElementGlyph element={element} />
                                  <span className="poi-visual-layer-label">
                                    {element.type === 'combination'
                                      ? `组合框${
                                          element.children.length
                                            ? ` · ${element.children.length} 项`
                                            : ''
                                        }`
                                      : describeMetroWayfindingElementContent(element)}
                                  </span>
                                  <span className="poi-visual-layer-count">{elementIndex + 1}</span>
                                </button>
                                <EditorLayerRowActions
                                  actions={[
                                    {
                                      id: 'duplicate',
                                      icon: 'content_copy',
                                      label: '创建副本',
                                      disabled,
                                      onClick: () =>
                                        dispatchElement(rowIndex, {
                                          type: 'duplicate',
                                          elementId: element.id,
                                          element: duplicateMetroWayfindingElement(element),
                                        }),
                                    },
                                    {
                                      id: 'up',
                                      icon: 'arrow_upward',
                                      label: '上移',
                                      disabled: disabled || elementIndex === 0,
                                      onClick: () =>
                                        dispatchElement(rowIndex, {
                                          type: 'move',
                                          elementId: element.id,
                                          direction: 'up',
                                        }),
                                    },
                                    {
                                      id: 'down',
                                      icon: 'arrow_downward',
                                      label: '下移',
                                      disabled: disabled || elementIndex === elements.length - 1,
                                      onClick: () =>
                                        dispatchElement(rowIndex, {
                                          type: 'move',
                                          elementId: element.id,
                                          direction: 'down',
                                        }),
                                    },
                                    {
                                      id: 'remove',
                                      icon: 'delete',
                                      label: '移除',
                                      danger: true,
                                      disabled,
                                      onClick: () =>
                                        dispatchElement(rowIndex, {
                                          type: 'remove',
                                          elementId: element.id,
                                        }),
                                    },
                                  ]}
                                />
                              </div>
                              {element.type === 'combination' && element.children.length ? (
                                // 组合框子元素作为组合框节点的子节点展开：
                                // 选中仍落在组合框上（属性面板编辑的是整个框），
                                // 子项高亮只用于把「组合框子元素」弹窗定位到对应子元素。
                                <ul className="poi-visual-layer-points is-combination-children">
                                  {element.children.map((child, childIndex) => {
                                    const childActive =
                                      isActive && selectedCombinationChildId === child.id;
                                    return (
                                      <li key={child.id}>
                                        <div
                                          className={`poi-visual-layer-row${
                                            childActive ? ' is-active' : ''
                                          }`}
                                        >
                                          <button
                                            className={`poi-visual-layer-point is-combination-child${
                                              childActive ? ' is-active' : ''
                                            }`}
                                            type="button"
                                            title={`选中组合框第 ${childIndex + 1} 个子元素`}
                                            onClick={() =>
                                              selectElement(rowIndex, element.id, child.id)
                                            }
                                            onDoubleClick={() => {
                                              selectElement(rowIndex, element.id, child.id);
                                              openInspector();
                                              focusInspector();
                                            }}
                                          >
                                            <MetroWayfindingElementGlyph element={child} />
                                            <span className="poi-visual-layer-label">
                                              {describeMetroWayfindingElementContent(child)}
                                            </span>
                                            <span className="poi-visual-layer-count">
                                              {childIndex + 1}
                                            </span>
                                          </button>
                                        </div>
                                      </li>
                                    );
                                  })}
                                </ul>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                    </li>
                  ))}
                </ul>
              </li>
            </ul>
            {totalElementCount === 0 ? (
              <p className="poi-visual-panel-empty">
                牌面还是空的，使用工具栏的添加按钮或「模板库」开始。
              </p>
            ) : null}
          </div>
          {selectedElement ? (
            <div className="poi-visual-layer-footer transit-wayfinding-suggestions">
              <MetroWayfindingInsertionSuggestions
                compact
                element={selectedElement}
                elements={activeElements}
                layoutMode={layout.mode}
                disabled={disabled}
                lineColorOptions={snapshot?.lineColorOptions ?? []}
                lineKeysByColor={lineKeysByColor}
                onAction={(action) => dispatchElement(selectedRowIndex, action)}
              />
            </div>
          ) : null}
        </aside>
      ) : null}

      {panelsVisible ? (
        <aside className="poi-visual-inspector" aria-label="属性检查器" ref={inspectorRef}>
          <EditorPanelHeading meta={inspectorMeta} title={inspectorTitle}>
            {hasSelection ? (
              <button
                aria-label="返回全局属性"
                className="poi-visual-inspector-back"
                title="返回全局属性"
                type="button"
                onClick={selectGlobal}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  arrow_back
                </span>
              </button>
            ) : (
              // 全局属性状态下也提供关闭入口，避免中等宽度下打开检查器后无法退出。
              <button
                aria-label="关闭属性面板"
                className="poi-visual-inspector-back"
                title="关闭属性面板"
                type="button"
                onClick={closeInspector}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  close
                </span>
              </button>
            )}
          </EditorPanelHeading>
          <div className="poi-visual-coordinate-panel-body">
            {selectedElement ? (
              <>
                <MetroWayfindingInspector
                  editorId={editorId}
                  lineKeysByColor={lineKeysByColor}
                  showSuggestions={false}
                  onAction={(rowIndex, action) => dispatchElement(rowIndex, action)}
                />
                <MetroWayfindingElementEditor
                  backgroundColorOptions={backgroundColorOptions}
                  combinationChildId={selectedCombinationChildId ?? undefined}
                  disabled={disabled}
                  element={selectedElement}
                  inheritedBackgroundColor={layout.backgroundColor}
                  inheritedForegroundColor={layout.foregroundColor}
                  layoutMode={layout.mode}
                  lineColorOptions={lineColorOptions}
                  onAction={(action) => dispatchElement(selectedRowIndex, action)}
                  textSuggestions={textSuggestions}
                />
              </>
            ) : (
              <>
                {/* 未选中时也保留尺寸警告：它只依赖版式与画布尺寸，与选中谁无关。 */}
                <MetroWayfindingInspector
                  editorId={editorId}
                  lineKeysByColor={lineKeysByColor}
                  showSuggestions={false}
                  onAction={(rowIndex, action) => dispatchElement(rowIndex, action)}
                />
                <div className="transit-wayfinding-global">
                  <section className="transit-visual-inspector-section">
                    <h3 className="transit-visual-inspector-section-title">模板与版式</h3>
                    {templateControls}
                  </section>
                  <section className="transit-visual-inspector-section">
                    <h3 className="transit-visual-inspector-section-title">牌面样式</h3>
                    <FieldGroup label="版式">
                      <SegmentedControl
                        ariaLabel="牌面版式"
                        className="transit-visual-segmented"
                        value={layout.mode}
                        disabled={disabled}
                        onChange={(mode) =>
                          dispatchWorkspaceCommand({ type: 'set-layout-mode', mode })
                        }
                        options={[
                          { value: 'single', label: '单行' },
                          { value: 'double', label: '双行' },
                          { value: 'vertical', label: '竖向' },
                        ]}
                        wrapperClassName=""
                      />
                    </FieldGroup>
                    <ColorControl
                      label={t('metroWayfindingEditor.field.backgroundColor')}
                      value={layout.backgroundColor}
                      palette={metroWayfindingBackgroundPalette}
                      disabled={disabled}
                      onChange={(backgroundColor) => replaceLayout({ backgroundColor })}
                    />
                    <ColorControl
                      label={t('metroWayfindingEditor.field.defaultForegroundColor')}
                      value={layout.foregroundColor}
                      palette={metroWayfindingForegroundPalette}
                      disabled={disabled}
                      onChange={(foregroundColor) => replaceLayout({ foregroundColor })}
                    />
                    {layout.mode === 'double' ? (
                      <CheckboxRow
                        variant="material"
                        checked={layout.dividerBetweenRows}
                        disabled={disabled}
                        label={t('metroWayfindingEditor.field.rowDivider')}
                        onChange={(event) =>
                          replaceLayout({ dividerBetweenRows: event.currentTarget.checked })
                        }
                      />
                    ) : null}
                  </section>
                  {canvasSettings ? (
                    <section className="transit-visual-inspector-section">
                      <h3 className="transit-visual-inspector-section-title">画布尺寸</h3>
                      {canvasSettings}
                    </section>
                  ) : null}
                </div>
              </>
            )}
          </div>
        </aside>
      ) : null}

      <EditorHeaderToolsPortal>
        <EditorHeaderToolbar
          compact={renderToolbar(true, true)}
          full={renderToolbar(true, false)}
        />
      </EditorHeaderToolsPortal>
      {renderToolbar(false, true)}

      {exportDialogOpen ? (
        <MaterialSaveDownloadDialog
          busy={saveBusy}
          canExportProject={Boolean(onExportProject)}
          downloadNote={downloadNote}
          maxPxPerMeter={maxPxPerMeter}
          onClose={() => setExportDialogOpen(false)}
          onDownload={() => {
            setExportDialogOpen(false);
            onDownload?.();
          }}
          onExportProject={
            onExportProject
              ? () => {
                  setExportDialogOpen(false);
                  onExportProject();
                }
              : undefined
          }
          onPxPerMeterChange={
            onPxPerMeterChange
              ? (value) => onPxPerMeterChange(Math.min(value, maxPxPerMeter))
              : undefined
          }
          onSubmitReview={
            onSubmitReview
              ? () => {
                  setExportDialogOpen(false);
                  onSubmitReview();
                }
              : undefined
          }
          outputHeightPx={Math.round(canvasHeightM * pxPerMeter)}
          outputWidthPx={Math.round(canvasWidthM * pxPerMeter)}
          pxPerMeter={pxPerMeter}
          showPxPerMeter={Boolean(onPxPerMeterChange)}
        />
      ) : null}

      {dataSourceDialogOpen ? (
        <EditorDialogPortal>
          <Modal
            labelledBy="transit-wayfinding-data-source-title"
            backdropClassName="editor-dialog-backdrop"
            className="transit-wayfinding-data-source-dialog"
            onBackdropClick={() => setDataSourceDialogOpen(false)}
          >
            <header>
              <div>
                <span>数据来源</span>
                <h2 id="transit-wayfinding-data-source-title">公共交通网络</h2>
              </div>
              <IconButton
                variant="icon"
                icon="close"
                label="关闭"
                onClick={() => setDataSourceDialogOpen(false)}
              />
            </header>
            <div className="transit-wayfinding-data-source-body">
              {dataSourceControls ?? (
                <p className="poi-visual-panel-empty">当前模板没有可配置的公共交通网络。</p>
              )}
            </div>
          </Modal>
        </EditorDialogPortal>
      ) : null}
    </div>
  );
}
