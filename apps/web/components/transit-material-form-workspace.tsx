'use client';

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { subscribeMaterialStudioActionBlocked } from '../lib/client-material-studio-events';
import { publishToastRequested } from '../lib/client-toast-events';
import { defineShortcut } from '../lib/editor/shortcut-builders';
import type { EditorTool } from '../lib/editor/types';
import { useEditorPanels } from '../lib/editor/use-editor-panels';
import { useEditorShortcuts } from '../lib/editor/use-editor-shortcuts';
import { EditorHeaderToolbar } from './editor/editor-header-toolbar';
import { EditorHeaderToolsPortal } from './editor/editor-header-tools-portal';
import { EditorInspectorEntry } from './editor/editor-inspector-entry';
import { EditorPanelHeading } from './editor/editor-panel-heading';
import { EditorRailBridge } from './editor/editor-rail-bridge';
import { EditorToolbar } from './editor/editor-toolbar';
import { EditorToolbarCompactActions } from './editor/editor-toolbar-actions';
import type { EditorToolbarOverflowItem } from './editor/editor-toolbar-overflow';
import { EditorZoomControls } from './editor/editor-zoom-controls';
import {
  MaterialPreviewErrorNotice,
  MaterialSaveDownloadDialog,
} from './material-save-download-dialog';
import { useMaterialStudioToolbarItems } from './use-material-studio-toolbar-items';
import { Button } from './ui/button';

export interface TransitMaterialFormFieldNode {
  key: string;
  label: string;
}

export interface TransitMaterialFormGroup {
  key: string;
  label: string;
  icon: string;
  fieldKeys: string[];
}

export interface TransitMaterialFormStationNode {
  index: number;
  name: string;
  isCurrent: boolean;
}

/** 预览图上的可交互区域（设计坐标，单位与模板画布一致）。 */
export interface TransitMaterialFormRegion {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  groupKey?: string;
  stationIndex?: number;
  fieldKey?: string;
  fontSize?: number;
  /** 单击热区时直接选中字段节点（路牌等没有分组子项的模板使用）。 */
  selectField?: boolean;
}

type SelectedNode =
  | { type: 'group'; key: string }
  | { type: 'field'; key: string }
  | { type: 'station'; index: number }
  | { type: 'source' }
  | { type: 'canvas' }
  | null;

/**
 * 公共交通类物料（公交站牌、线路图等）的通用工作台适配层。
 *
 * 与地铁导视牌共用同一套外壳语义：左侧结构树、中间服务端出图预览、右侧全局 / 元素属性。
 * 表单字段、数据来源选择器、画布尺寸与预览节点都由宿主传入，适配层本身不持有业务状态。
 */
export function TransitMaterialFormWorkspace({
  studioId,
  title,
  templateTitle,
  templateMeta,
  fields,
  groups,
  stations,
  regions,
  regionViewBox,
  regionValue,
  onRegionEdit,
  renderField,
  renderStation,
  sourceControls,
  onOpenApplyWizard,
  canApplySource = false,
  canvasSettings,
  canvasSize,
  canvasLocks,
  onCanvasSizeChange,
  showFieldNodes = false,
  templateControls,
  preview,
  hasPreview,
  previewError,
  invalidFieldKeys,
  onExportProject,
  onSubmitReview,
  onDownload,
  saveBusy = false,
  isRendering = false,
  disabled,
}: Readonly<{
  studioId: string;
  title: string;
  templateTitle: string;
  templateMeta?: string;
  fields: ReadonlyArray<TransitMaterialFormFieldNode>;
  /** 逻辑分组：站名、运营信息、线路编号、站点列表等。 */
  groups: ReadonlyArray<TransitMaterialFormGroup>;
  /** 站点列表（来自 routeStations 的真实拆分结果）。 */
  stations?: ReadonlyArray<TransitMaterialFormStationNode>;
  /** 预览图上的可点击区域，与图层树选择联动。 */
  regions?: ReadonlyArray<TransitMaterialFormRegion>;
  regionViewBox?: { width: number; height: number };
  regionValue?: (region: TransitMaterialFormRegion) => string;
  onRegionEdit?: (region: TransitMaterialFormRegion, value: string) => void;
  renderField: (fieldKey: string) => ReactNode;
  renderStation?: (index: number) => ReactNode;
  /** 服务器站点 / 线路 / 地点等真实数据源选择器。 */
  sourceControls?: ReactNode;
  /** 打开「模板库」向导。 */
  onOpenApplyWizard?: () => void;
  canApplySource?: boolean;
  canvasSettings?: ReactNode;
  /** 下载弹窗内可调整的画布宽高。 */
  canvasSize?: { widthM: number; heightM: number };
  canvasLocks?: { width?: boolean; height?: boolean };
  onCanvasSizeChange?: (patch: { widthM?: number; heightM?: number }) => void;
  /** 图层树是否展开普通分组里的字段节点（路牌等没有 routes 分组的模板）。 */
  showFieldNodes?: boolean;
  templateControls?: ReactNode;
  preview: ReactNode;
  hasPreview: boolean;
  /** 最近一次预览失败原因；为空表示没有错误。 */
  previewError?: string;
  /** 渲染失败的字段：对应热区加红框标出，方便直接定位。 */
  invalidFieldKeys?: ReadonlyArray<string>;
  onExportProject?: () => void;
  onSubmitReview?: () => void;
  onDownload?: () => void;
  saveBusy?: boolean;
  isRendering?: boolean;
  disabled: boolean;
}>) {
  const { panelsVisible, panelStateClass, togglePanels, openInspector, closeInspector } =
    useEditorPanels();
  const { items: materialActionItems, badge } = useMaterialStudioToolbarItems(studioId);
  const [selectedNode, setSelectedNode] = useState<SelectedNode>(null);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [activeTool, setActiveTool] = useState<'select' | 'pan'>('select');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isSpacePanning, setIsSpacePanning] = useState(false);
  const stageRef = useRef<HTMLElement | null>(null);
  const panStateRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);

  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  useEditorShortcuts([
    defineShortcut('toolSelect', () => setActiveTool('select')),
    defineShortcut('toolPan', () => setActiveTool('pan')),
    defineShortcut('canvasFit', resetView),
  ]);

  // 滚轮缩放需要非被动监听，否则浏览器会忽略 preventDefault。
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) {
      return undefined;
    }
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
      setZoom((current) => Math.min(4, Math.max(0.4, current * factor)));
    };
    stage.addEventListener('wheel', handleWheel, { passive: false });
    return () => stage.removeEventListener('wheel', handleWheel);
  }, []);

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

  const handlePointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    const isPanGesture =
      event.button === 1 || (event.button === 0 && (isSpacePanning || activeTool === 'pan'));
    if (!isPanGesture) {
      return;
    }
    event.preventDefault();
    panStateRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const state = panStateRef.current;
    if (!state || state.pointerId !== event.pointerId) {
      return;
    }
    const deltaX = event.clientX - state.x;
    const deltaY = event.clientY - state.y;
    panStateRef.current = { ...state, x: event.clientX, y: event.clientY };
    setPan((current) => ({ x: current.x + deltaX, y: current.y + deltaY }));
  };

  const endPan = (event: ReactPointerEvent<HTMLElement>) => {
    if (panStateRef.current?.pointerId !== event.pointerId) {
      return;
    }
    panStateRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  // 预览 / 提交失败等动作拦截统一转成 toast，避免错误被静默吞掉。
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

  const selectedGroup = useMemo(
    () =>
      selectedNode?.type === 'group'
        ? groups.find((group) => group.key === selectedNode.key)
        : undefined,
    [groups, selectedNode],
  );
  const selectedStation =
    selectedNode?.type === 'station' ? stations?.[selectedNode.index] : undefined;
  const selectedField =
    selectedNode?.type === 'field'
      ? fields.find((field) => field.key === selectedNode.key)
      : undefined;
  const [regionEditor, setRegionEditor] = useState<{
    region: TransitMaterialFormRegion;
    value: string;
  } | null>(null);
  const hasSelection = Boolean(selectedNode);
  const selectNode = (node: SelectedNode) => {
    setSelectedNode(node);
    if (node) {
      openInspector();
    } else {
      closeInspector();
    }
  };

  const isRegionSelected = (region: TransitMaterialFormRegion) => {
    if (region.stationIndex !== undefined) {
      return selectedNode?.type === 'station' && selectedNode.index === region.stationIndex;
    }
    if (selectedNode?.type === 'field' && region.fieldKey) {
      return selectedNode.key === region.fieldKey;
    }
    if (region.groupKey) {
      return selectedNode?.type === 'group' && selectedNode.key === region.groupKey;
    }
    return false;
  };

  const selectRegion = (region: TransitMaterialFormRegion) => {
    if (region.stationIndex !== undefined) {
      selectNode({ type: 'station', index: region.stationIndex });
      return;
    }
    // 线路概览的每个线路编号是独立子项，命中区直接选中对应字段。
    if (region.fieldKey && (region.groupKey === 'routes' || region.selectField)) {
      selectNode({ type: 'field', key: region.fieldKey });
      return;
    }
    if (region.groupKey) {
      selectNode({ type: 'group', key: region.groupKey });
    }
  };

  const beginRegionEdit = (region: TransitMaterialFormRegion) => {
    if (!region.fieldKey || !onRegionEdit) {
      return;
    }
    selectRegion(region);
    setRegionEditor({ region, value: regionValue?.(region) ?? '' });
  };

  const commitRegionEdit = () => {
    const editor = regionEditor;
    if (!editor) {
      return;
    }
    setRegionEditor(null);
    const previous = regionValue?.(editor.region) ?? '';
    if (editor.value !== previous) {
      onRegionEdit?.(editor.region, editor.value);
    }
  };

  // 表单模板的动作只保留「历史」；提交 / 下载统一收敛到「保存与下载」弹窗。
  const materialItems: EditorToolbarOverflowItem[] = [];
  const historyItem = materialActionItems.find((item) => item.id === 'history');
  const exportEntryItem: EditorToolbarOverflowItem = {
    id: 'save-download-entry',
    icon: 'download',
    label: badge ? `保存与下载 · ${badge.label}` : '保存与下载',
    active: Boolean(badge),
    disabled: saveBusy,
    onClick: () => setSaveDialogOpen(true),
  };
  if (historyItem) {
    materialItems.push(historyItem);
  }
  // 数据来源统一在「套用线网数据…」弹窗里切换与选择，工具栏不再单列来源按钮。
  const applyWizardItem: EditorToolbarOverflowItem = {
    id: 'apply-data-wizard',
    icon: 'dashboard_customize',
    label: '套用线网数据…',
    disabled: !onOpenApplyWizard,
    onClick: () => onOpenApplyWizard?.(),
  };
  const tools: EditorTool[] = [
    { id: 'select', icon: 'near_me', label: '选择工具', shortcut: 'V' },
    { id: 'pan', icon: 'pan_tool', label: '手型工具', shortcut: 'H' },
  ];
  const operationGroups = [
    { id: 'data', ariaLabel: '数据来源', items: [applyWizardItem] },
    // 「保存与下载」是工具条一级按钮，历史记录仍收在更多操作里。
    { id: 'material', ariaLabel: '保存与下载', items: [exportEntryItem, ...materialItems] },
  ];

  const renderToolbar = (inHeader: boolean, compact: boolean) => (
    <EditorToolbar
      activeToolId={activeTool}
      ariaLabel="物料工具"
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

  const inspectorTitle = selectedField
    ? selectedField.label
    : selectedGroup
      ? selectedGroup.label
      : selectedStation
        ? selectedStation.name
        : selectedNode?.type === 'source'
          ? '数据来源'
          : selectedNode?.type === 'canvas'
            ? '画布尺寸'
            : '全局属性';
  const inspectorMeta = selectedField
    ? `${templateTitle} · 字段`
    : selectedGroup
      ? `${templateTitle} · ${selectedGroup.fieldKeys.length} 个字段`
      : selectedStation
        ? `${templateTitle} · 第 ${selectedStation.index + 1} 站 / 共 ${stations?.length ?? 0} 站`
        : selectedNode?.type === 'source'
          ? '站点 / 线路 / 地点'
          : selectedNode?.type === 'canvas'
            ? '输出尺寸'
            : `${fields.length} 个字段`;

  const hasRegionLayer = hasPreview && Boolean(regions?.length && regionViewBox);

  return (
    <div
      className={`transit-visual-workspace transit-material-form-workspace${panelStateClass}${
        hasSelection ? ' has-layer-selection' : ''
      }`}
    >
      <section
        className={`transit-material-preview-stage${isSpacePanning ? ' is-pan-ready' : ''}${
          activeTool === 'pan' ? ' is-pan-tool' : ''
        }`}
        aria-label={`${title}预览`}
        ref={stageRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endPan}
        onPointerCancel={endPan}
      >
        <div
          className="transit-material-preview-zoom"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
        >
          <div className={`transit-material-preview-frame${isRendering ? ' is-rendering' : ''}`}>
            {hasRegionLayer && regions && regionViewBox ? (
              <div
                className="transit-material-preview-interactive"
                style={
                  {
                    '--canvas-ratio': regionViewBox.width / Math.max(regionViewBox.height, 1),
                  } as CSSProperties
                }
              >
                <div className="transit-material-preview-media">{preview}</div>
                <svg
                  className="transit-material-region-layer"
                  viewBox={`0 0 ${regionViewBox.width} ${regionViewBox.height}`}
                  preserveAspectRatio="none"
                  aria-label="牌面可编辑区域"
                >
                  {regions.map((region) => {
                    const isInvalid =
                      Boolean(region.fieldKey) &&
                      Boolean(invalidFieldKeys?.includes(region.fieldKey!));
                    return (
                      <rect
                        key={region.id}
                        className={`transit-material-region${
                          isRegionSelected(region) ? ' is-selected' : ''
                        }${isInvalid ? ' is-invalid' : ''}`}
                        x={region.x}
                        y={region.y}
                        width={region.width}
                        height={region.height}
                        rx={1}
                        role="button"
                        tabIndex={0}
                        aria-label={`${region.label}，双击编辑`}
                        onClick={(event) => {
                          event.stopPropagation();
                          selectRegion(region);
                        }}
                        onDoubleClick={(event) => {
                          event.stopPropagation();
                          beginRegionEdit(region);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            selectRegion(region);
                          }
                        }}
                      />
                    );
                  })}
                </svg>
                {regionEditor && regionViewBox ? (
                  <input
                    className="transit-material-region-input"
                    aria-label={regionEditor.region.label}
                    autoFocus
                    value={regionEditor.value}
                    style={{
                      left: `${(regionEditor.region.x / regionViewBox.width) * 100}%`,
                      top: `${(regionEditor.region.y / regionViewBox.height) * 100}%`,
                      width: `${(regionEditor.region.width / regionViewBox.width) * 100}%`,
                      height: `${(regionEditor.region.height / regionViewBox.height) * 100}%`,
                    }}
                    onClick={(event) => event.stopPropagation()}
                    onDoubleClick={(event) => event.stopPropagation()}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setRegionEditor((current) => (current ? { ...current, value } : current));
                    }}
                    onBlur={commitRegionEdit}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        commitRegionEdit();
                      } else if (event.key === 'Escape') {
                        event.preventDefault();
                        setRegionEditor(null);
                      }
                    }}
                  />
                ) : null}
              </div>
            ) : (
              preview
            )}
          </div>
        </div>
        {!hasPreview ? (
          <div className="transit-material-preview-empty" role="status">
            <span className="material-symbols-outlined" aria-hidden="true">
              {previewError ? 'error' : 'visibility'}
            </span>
            <strong>{previewError ? '预览未生成' : '正在生成实时预览'}</strong>
            <p>{previewError ?? '修改字段后画布会自动更新，无需手动生成。'}</p>
          </div>
        ) : null}
        {hasPreview && previewError ? (
          <MaterialPreviewErrorNotice>{previewError}</MaterialPreviewErrorNotice>
        ) : null}
        <EditorZoomControls
          fitLabel="适配预览"
          scale={zoom}
          onFit={resetView}
          onZoomIn={() => setZoom((current) => Math.min(4, current * 1.2))}
          onZoomOut={() => setZoom((current) => Math.max(0.4, current / 1.2))}
        />
      </section>

      <EditorRailBridge
        activeToolId={activeTool}
        ownerId="transit-material-form"
        panels={{ visible: panelsVisible, onToggle: togglePanels }}
        sections={operationGroups.map((group) => ({ id: group.id, items: group.items }))}
        tools={tools}
        onToolChange={(toolId) => setActiveTool(toolId === 'pan' ? 'pan' : 'select')}
      />

      {panelsVisible ? (
        <aside className="poi-visual-layer-panel" aria-label="物料结构">
          <EditorPanelHeading meta={`${fields.length} 个字段`} title="物料结构">
            <EditorInspectorEntry onOpen={openInspector} />
          </EditorPanelHeading>
          <div className="poi-visual-layer-body">
            <ul className="poi-visual-layer-tree">
              <li>
                <div className={`poi-visual-layer-row${hasSelection ? '' : ' is-active'}`}>
                  <button
                    className={`poi-visual-layer-group${hasSelection ? '' : ' is-active'}`}
                    type="button"
                    onClick={() => selectNode(null)}
                    onDoubleClick={() => {
                      selectNode(null);
                      openInspector();
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
                  {groups.map((group) => {
                    const active = selectedNode?.type === 'group' && selectedNode.key === group.key;
                    const stationCount = group.key === 'stations' ? (stations?.length ?? 0) : 0;
                    return (
                      <li key={group.key}>
                        <div className={`poi-visual-layer-row${active ? ' is-active' : ''}`}>
                          <button
                            className={`poi-visual-layer-point${active ? ' is-active' : ''}`}
                            type="button"
                            onClick={() => selectNode({ type: 'group', key: group.key })}
                            onDoubleClick={() => {
                              selectNode({ type: 'group', key: group.key });
                              openInspector();
                            }}
                          >
                            <span className="material-symbols-outlined" aria-hidden="true">
                              {group.icon}
                            </span>
                            <span className="poi-visual-layer-label">{group.label}</span>
                            <span className="poi-visual-layer-count">
                              {stationCount ? `${stationCount} 站` : group.fieldKeys.length}
                            </span>
                          </button>
                        </div>
                        {group.key === 'stations' && stations?.length ? (
                          <ul className="poi-visual-layer-points is-nested">
                            {stations.map((station) => {
                              const stationActive =
                                selectedNode?.type === 'station' &&
                                selectedNode.index === station.index;
                              return (
                                <li key={station.index}>
                                  <div
                                    className={`poi-visual-layer-row${
                                      stationActive ? ' is-active' : ''
                                    }`}
                                  >
                                    <button
                                      className={`poi-visual-layer-point is-nested${
                                        stationActive ? ' is-active' : ''
                                      }`}
                                      type="button"
                                      onClick={() =>
                                        selectNode({ type: 'station', index: station.index })
                                      }
                                      onDoubleClick={() => {
                                        selectNode({ type: 'station', index: station.index });
                                        openInspector();
                                      }}
                                    >
                                      <span
                                        className="material-symbols-outlined"
                                        aria-hidden="true"
                                      >
                                        place
                                      </span>
                                      <span className="poi-visual-layer-label">
                                        {station.name || `第 ${station.index + 1} 站`}
                                      </span>
                                      <span className="poi-visual-layer-count">
                                        {station.isCurrent ? '当前' : station.index + 1}
                                      </span>
                                    </button>
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        ) : null}
                        {/* 属性都收进节点自身的属性面板，图层树不再展开逐字段子节点。 */}
                        {showFieldNodes ? (
                          <ul className="poi-visual-layer-points is-nested">
                            {group.fieldKeys.map((fieldKey, index) => {
                              const field = fields.find((item) => item.key === fieldKey);
                              const fieldActive =
                                selectedNode?.type === 'field' && selectedNode.key === fieldKey;
                              return (
                                <li key={fieldKey}>
                                  <div
                                    className={`poi-visual-layer-row${
                                      fieldActive ? ' is-active' : ''
                                    }`}
                                  >
                                    <button
                                      className={`poi-visual-layer-point is-nested${
                                        fieldActive ? ' is-active' : ''
                                      }`}
                                      type="button"
                                      onClick={() => selectNode({ type: 'field', key: fieldKey })}
                                      onDoubleClick={() => {
                                        selectNode({ type: 'field', key: fieldKey });
                                        openInspector();
                                      }}
                                    >
                                      <span
                                        className="material-symbols-outlined"
                                        aria-hidden="true"
                                      >
                                        route
                                      </span>
                                      <span className="poi-visual-layer-label">
                                        {field?.label ?? fieldKey}
                                      </span>
                                      <span className="poi-visual-layer-count">{index + 1}</span>
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
                  {/* 画布尺寸统一在「保存与下载」弹窗里调整，图层树不再单列节点。 */}
                </ul>
              </li>
            </ul>
            {!fields.length ? (
              <p className="poi-visual-panel-empty">当前模板没有可编辑字段。</p>
            ) : null}
          </div>
        </aside>
      ) : null}

      {panelsVisible ? (
        <aside className="poi-visual-inspector" aria-label="属性检查器">
          <EditorPanelHeading meta={inspectorMeta} title={inspectorTitle}>
            {hasSelection ? (
              <button
                aria-label="返回全局属性"
                className="poi-visual-inspector-back"
                title="返回全局属性"
                type="button"
                onClick={() => selectNode(null)}
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
            {selectedField ? (
              <div className="material-field-grid transit-material-field-grid">
                {renderField(selectedField.key)}
              </div>
            ) : selectedGroup ? (
              <div className="material-field-grid transit-material-field-grid">
                {selectedGroup.fieldKeys.map((fieldKey) => (
                  <Fragment key={fieldKey}>{renderField(fieldKey)}</Fragment>
                ))}
              </div>
            ) : selectedStation && renderStation ? (
              <div className="transit-material-source-form">
                {renderStation(selectedStation.index)}
              </div>
            ) : selectedNode?.type === 'source' ? (
              <div className="transit-material-source-form">
                {onOpenApplyWizard ? (
                  <div className="transit-material-source-apply">
                    <Button
                      variant="primary"
                      icon="dashboard_customize"
                      disabled={disabled || !canApplySource}
                      onClick={onOpenApplyWizard}
                    >
                      模板库…
                    </Button>
                  </div>
                ) : null}
                {sourceControls ?? <p className="poi-visual-panel-empty">暂无数据来源选项。</p>}
              </div>
            ) : selectedNode?.type === 'canvas' ? (
              <div className="transit-material-source-form">
                {canvasSettings ?? (
                  <p className="poi-visual-panel-empty">当前模板没有画布尺寸设置。</p>
                )}
              </div>
            ) : (
              <div className="transit-wayfinding-global">
                <section className="transit-visual-inspector-section">
                  <h3 className="transit-visual-inspector-section-title">模板与版式</h3>
                  {templateControls}
                </section>
              </div>
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

      {saveDialogOpen ? (
        <MaterialSaveDownloadDialog
          busy={saveBusy}
          canExportProject={Boolean(onExportProject)}
          canvas={canvasSize}
          canvasLocks={canvasLocks}
          onCanvasSizeChange={onCanvasSizeChange}
          downloadNote={
            badge
              ? `当前状态：${badge.label}。下载为带水印预览图；提交审核通过后可下载清晰原图。`
              : '当前文本未修改，可直接下载标准清晰度图片；登录并验证账号后可下载清晰原图。'
          }
          onClose={() => setSaveDialogOpen(false)}
          onDownload={() => {
            setSaveDialogOpen(false);
            onDownload?.();
          }}
          onExportProject={
            onExportProject
              ? () => {
                  setSaveDialogOpen(false);
                  onExportProject();
                }
              : undefined
          }
          onSubmitReview={
            onSubmitReview
              ? () => {
                  setSaveDialogOpen(false);
                  onSubmitReview();
                }
              : undefined
          }
          showPxPerMeter={false}
        />
      ) : null}
    </div>
  );
}
