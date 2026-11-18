'use client';

import type {
  CSSProperties,
  PointerEvent as ReactPointerEvent,
  WheelEvent as ReactWheelEvent,
} from 'react';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  MapMarkerSnapshot,
  MapSpatialProfile,
  TileProviderDescriptor,
  TransitDataRevision,
  TransitLineRouteNodeSnapshot,
  TransitLineSegmentPathSnapshot,
  TransitStationDetailSnapshot,
  TransitStationFacilitySnapshot,
} from '@yct/contracts';
import dynamic from 'next/dynamic';
import { appPath } from '../lib/app-paths';
import { publishAdminDataChanged } from '../lib/client-admin-data-events';
import { selectMapTileTemplates } from '../lib/map-tile-templates';
import { defineShortcut } from '../lib/editor/shortcut-builders';
import { EDITOR_SHORTCUT_CATALOG } from '../lib/editor/shortcuts';
import { useEditorInspectorFocus } from '../lib/editor/use-editor-inspector-focus';
import { useEditorLayerScroll } from '../lib/editor/use-editor-layer-scroll';
import { useEditorPanels } from '../lib/editor/use-editor-panels';
import type { EditorTool } from '../lib/editor/types';
import { useEditorShortcuts } from '../lib/editor/use-editor-shortcuts';
import { useSnapshotHistory } from '../lib/editor/use-snapshot-history';
import {
  isTransitLineDirectionIncluded,
  type TransitLineTravelDirection,
} from '../lib/transit-line-direction';
import { isTransitPoiMarkerCompatibleWithStation } from '../lib/transit-station-mode';
import { findTransitStationDetail } from '../lib/transit-station-detail-match';
import { TRANSIT_STATION_FACILITY_OPTIONS } from '../lib/transit-station-facility-options';
import { SegmentedControl } from './segmented-control';
import {
  buildVisualRoadGraph,
  isVisualRoadMarker,
  resolveVisualRoute,
  resolveVisualRouteCoordinates,
  type VisualRoadGraph,
} from '../lib/transit-line-visual-routing';
import { CurrentPlayerLocationButton } from './current-player-location-button';
import { LayeredMapTile } from './layered-map-tile';
import { EditorHeaderToolbar } from './editor/editor-header-toolbar';
import { EditorInspectorEntry } from './editor/editor-inspector-entry';
import { EditorLayerRowActions } from './editor/editor-layer-row-actions';
import { EditorLoadingState } from './editor/editor-loading-state';
import { EditorPanelHeading } from './editor/editor-panel-heading';
import { EditorRailBridge } from './editor/editor-rail-bridge';
import { EditorToolbar } from './editor/editor-toolbar';
import { buildEditorToolbarSections } from './editor/editor-toolbar-sections';
import type { EditorToolbarOverflowItem } from './editor/editor-toolbar-overflow';
import { EditorZoomControls } from './editor/editor-zoom-controls';
import { VisualEditorShell } from './visual-editor-shell';
import { Field, Input } from './ui/field';

// 站点弹窗体量较大且只在点开时使用，按需加载避免拖慢线路工作台首屏。
const TransitStationCoordinateDialog = dynamic(
  () => import('./admin-transit-panel').then((module) => module.TransitStationCoordinateDialog),
  { ssr: false },
);
const TransitStationDetailDialog = dynamic(
  () => import('./admin-transit-panel').then((module) => module.TransitStationDetailDialog),
  { ssr: false },
);

type TransitLine = TransitDataRevision['lines'][number];
type TransitStation = TransitDataRevision['stations'][number];
type LineEditorTool = 'select' | 'pan' | 'station' | 'waypoint';
type Direction = 'both' | 'up' | 'down';
type InsertionMode = 'append' | 'nearest' | 'prepend';

const transitModeSemanticColors: Record<TransitLine['mode'], string> = {
  metro: '#2584E8',
  tram: '#C64255',
  bus: '#F59B22',
  coach: '#8BBF35',
  ferry: '#168AA5',
  railway: '#8B5E34',
  custom: '#168F78',
};

interface EditorStationNode {
  boundPoiCategoryId?: string;
  boundPoiLabel?: string;
  boundPoiMarkerId?: string;
  /** 站点可绑定多个 POI；第一个作为车站默认位置。 */
  boundPoiRefs?: NonNullable<TransitStation['boundPoiRefs']>;
  coordinate: [number, number] | null;
  direction: Direction;
  draftClientId?: string;
  id: string;
  kind: 'station';
  name: string;
  operationStatus?: NonNullable<TransitStation['operationStatus']>;
  stationSourceId: string;
}

interface EditorWaypointNode {
  boundPoiLabel?: string;
  boundPoiMarkerId?: string;
  coordinate: [number, number];
  direction: Direction;
  id: string;
  kind: 'waypoint';
}

type EditorNode = EditorStationNode | EditorWaypointNode;

/** 图层树里的区间条目：相邻两个站点之间的路段。 */
interface EditorSegmentEntry {
  fromIndex: number;
  fromNode: EditorStationNode;
  /** 选中与 React key 使用；环线重复经过同一站时也不会冲突。 */
  id: string;
  key: string;
  toIndex: number;
  toNode: EditorStationNode;
  waypointCount: number;
  /** 区间内的途径点，按里程顺序作为区间子节点展示。 */
  waypoints: Array<{ index: number; node: EditorWaypointNode }>;
}

interface MapView {
  centerX: number;
  centerZ: number;
  zoom: number;
}

interface ViewportSize {
  height: number;
  width: number;
}

interface PointerGesture {
  centerX: number;
  centerZ: number;
  kind: 'add' | 'move-node' | 'pan';
  longPressTriggered: boolean;
  moved: boolean;
  pointerId: number;
  pointerType: string;
  nodeId?: string;
  /** 拖动开始时该节点是否已绑定 POI，用于结束时区分「改绑」与「解绑」。 */
  hadPoiBinding?: boolean;
  /** 拖动开始时绑定的主 POI；拖离 POI 时只移除该绑定，保留其他同站 POI。 */
  startBoundPoiMarkerId?: string;
  /** 拖动过程中最近吸附到的 POI 名称；null 表示当前没有吸附。 */
  snapMarkerLabel?: string | null;
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
  timerId?: number;
}

interface EditorTouchPoint {
  clientX: number;
  clientY: number;
}

interface EditorPinchGesture {
  anchorWorld: [number, number];
  pointerIds: [number, number];
  startDistance: number;
  startZoom: number;
}

interface VisibleTile {
  displaySize: number;
  fallbackUrl?: string;
  freshUrl?: string;
  id: string;
  left: number;
  top: number;
}

interface EditorData {
  defaultY: number;
  /** POI 原图标的基底地址，来自地图标记接口。 */
  iconBaseUrl: string;
  junctionSnapTolerance: number;
  line: TransitLine;
  markers: MapMarkerSnapshot['markers'];
  revision: TransitDataRevision;
  freshTileTemplate: string | null;
  tileTemplate: string | null;
  verticalTolerance: number;
  worldId: string;
}

const defaultView: MapView = { centerX: 0, centerZ: 0, zoom: -1 };
const longPressDurationMs = 560;

export function AdminTransitLineMapEditor({
  lineSourceId,
  revisionId,
}: Readonly<{ lineSourceId: string; revisionId: string }>) {
  const normalizedLineSourceId = decodeRouteIdentifier(lineSourceId);
  const normalizedRevisionId = decodeRouteIdentifier(revisionId);
  // 关闭编辑器后回到后台，并自动重新打开该线路的编辑弹窗。
  const backToAdminPath = `/admin/transit?section=lines&openLineId=${encodeURIComponent(
    normalizedLineSourceId,
  )}`;
  const backToAdminHref = appPath(backToAdminPath);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const gestureRef = useRef<PointerGesture | null>(null);
  const touchPointersRef = useRef<Map<number, EditorTouchPoint>>(new Map());
  const pinchGestureRef = useRef<EditorPinchGesture | null>(null);
  const [data, setData] = useState<EditorData | null>(null);
  const [nodes, setNodes] = useState<EditorNode[]>([]);
  const [lineName, setLineName] = useState('');
  const [routeMode, setRouteMode] = useState<'road' | 'straight'>('straight');
  const [activeTool, setActiveTool] = useState<LineEditorTool>('pan');
  const [insertionMode, setInsertionMode] = useState<InsertionMode>('append');
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [altDown, setAltDown] = useState(false);
  const [shiftDown, setShiftDown] = useState(false);
  const [mapView, setMapView] = useState<MapView>(defaultView);
  const [viewportSize, setViewportSize] = useState<ViewportSize>({ height: 0, width: 0 });
  const [status, setStatus] = useState('正在读取线路和地图数据');
  const [isSaving, setIsSaving] = useState(false);
  const {
    panelsVisible,
    panelStateClass,
    setPanelsVisible,
    togglePanels,
    openInspector,
    closeInspector,
  } = useEditorPanels();
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const [stationCoordinateTargetId, setStationCoordinateTargetId] = useState<string | null>(null);
  const [stationDetailTargetId, setStationDetailTargetId] = useState<string | null>(null);
  const [stationDialogBusy, setStationDialogBusy] = useState(false);
  const [previewDirection, setPreviewDirection] = useState<TransitLineTravelDirection>('forward');
  const inspectorRef = useRef<HTMLElement | null>(null);
  const layerBodyRef = useRef<HTMLDivElement | null>(null);
  const toolbarLocationProxyRef = useRef<HTMLDivElement | null>(null);
  useEditorLayerScroll(
    layerBodyRef,
    selectedNodeId || selectedSegmentId
      ? `${selectedNodeId ?? ''}:${selectedSegmentId ?? ''}`
      : null,
  );
  const [segmentOperationStatusByKey, setSegmentOperationStatusByKey] = useState<
    Record<string, NonNullable<TransitLineSegmentPathSnapshot['operationStatus']>>
  >({});
  const [segmentTravelMinutesByKey, setSegmentTravelMinutesByKey] = useState<
    Record<string, string>
  >({});

  // 节点历史：只在 nodes 真正变化时入栈；加载初始数据时重置，避免撤销回到空线路。
  const snapshotHistory = useSnapshotHistory<EditorNode[]>();
  const previousNodesRef = useRef<EditorNode[] | null>(null);
  const applyingHistoryRef = useRef(false);
  const nodeDragStartRef = useRef<EditorNode[] | null>(null);

  useEffect(() => {
    const previous = previousNodesRef.current;
    previousNodesRef.current = nodes;
    if (previous === null || previous === nodes) {
      return;
    }
    if (applyingHistoryRef.current) {
      applyingHistoryRef.current = false;
      return;
    }
    // 拖拽过程中每帧都会更新节点坐标，历史在 pointerup 时统一补一条。
    if (gestureRef.current?.kind === 'move-node') {
      return;
    }
    snapshotHistory.push(previous);
  }, [nodes, snapshotHistory.push]);

  const undoNodes = () => {
    const previous = snapshotHistory.undo(nodes);
    if (!previous) {
      return;
    }
    applyingHistoryRef.current = true;
    setNodes(previous);
  };

  const redoNodes = () => {
    const next = snapshotHistory.redo(nodes);
    if (!next) {
      return;
    }
    applyingHistoryRef.current = true;
    setNodes(next);
  };

  // 快捷键统一走 useEditorShortcuts，具体注册放在所有操作函数定义之后。

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [revisionResponse, markerResponse, tileResponse, spatialProfileResponse] =
          await Promise.all([
            fetch(appPath('/api/admin/transit/datasets'), { cache: 'no-store' }),
            fetch(appPath('/api/map/markers'), { cache: 'no-store' }),
            fetch(appPath('/api/map/tile-providers'), { cache: 'no-store' }),
            fetch(appPath('/api/map/spatial-profile'), { cache: 'no-store' }),
          ]);
        const revisionData = (await revisionResponse.json()) as {
          items?: TransitDataRevision[];
          message?: string;
        };
        const markerData = (await markerResponse.json()) as {
          iconBaseUrl?: string;
          snapshot?: MapMarkerSnapshot;
          message?: string;
        };
        const tileData = (await tileResponse.json()) as { items?: TileProviderDescriptor[] };
        const spatialProfileData = (await spatialProfileResponse.json().catch(() => ({}))) as {
          profile?: MapSpatialProfile;
        };
        if (!revisionResponse.ok) {
          throw new Error(revisionData.message ?? '交通数据版本读取失败。');
        }
        const revision = revisionData.items?.find(
          (item) => item.revisionId === normalizedRevisionId,
        );
        const line = revision?.lines.find((item) => item.sourceId === normalizedLineSourceId);
        if (!revision || !line) {
          throw new Error('找不到需要编辑的线路或交通数据版本。');
        }
        const markers = markerResponse.ok ? (markerData.snapshot?.markers ?? []) : [];
        const tileTemplates = selectMapTileTemplates(tileData.items ?? []);
        if (cancelled) {
          return;
        }
        const initialNodes = buildInitialEditorNodes(line, revision.stations);
        setData({
          defaultY: spatialProfileData.profile?.defaultY ?? 64,
          iconBaseUrl: markerData.iconBaseUrl ?? '',
          junctionSnapTolerance: spatialProfileData.profile?.roadTiming.junctionSnapTolerance ?? 30,
          line,
          markers,
          revision,
          freshTileTemplate: tileTemplates.freshTileTemplate,
          tileTemplate: tileTemplates.tileTemplate,
          verticalTolerance: spatialProfileData.profile?.verticalTolerance ?? 0,
          worldId: spatialProfileData.profile?.worldId ?? 'lindong-overworld',
        });
        setNodes(initialNodes);
        previousNodesRef.current = initialNodes;
        snapshotHistory.reset();
        setRouteMode(line.routeMode ?? defaultRouteMode(line));
        setLineName(line.name);
        setStationCoordinateTargetId(null);
        setStationDetailTargetId(null);
        setSegmentOperationStatusByKey(
          Object.fromEntries(
            (line.segmentPaths ?? []).map((path) => [
              segmentOperationStatusKey(path.fromStationSourceId, path.toStationSourceId),
              path.operationStatus ?? 'operating',
            ]),
          ),
        );
        setSegmentTravelMinutesByKey(
          Object.fromEntries(
            (line.segmentPaths ?? []).flatMap((path) =>
              path.travelMinutes === undefined
                ? []
                : [
                    [
                      segmentOperationStatusKey(path.fromStationSourceId, path.toStationSourceId),
                      String(path.travelMinutes),
                    ],
                  ],
            ),
          ),
        );
        setMapView(fitEditorView(initialNodes, markers));
        setStatus('');
      } catch (error) {
        if (!cancelled) {
          setStatus(error instanceof Error ? error.message : '可视化线路编辑器读取失败。');
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [normalizedLineSourceId, normalizedRevisionId]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) {
      return undefined;
    }
    const updateSize = () => {
      const rect = stage.getBoundingClientRect();
      setViewportSize({ width: rect.width, height: rect.height });
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [data]);

  // 只跟踪 Alt / Shift 的按下状态；工具与插入模式改走 useEditorShortcuts。
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      setAltDown(event.altKey);
      setShiftDown(event.shiftKey);
      // 单独按住 Alt 会激活浏览器菜单，尽量拦下，避免临时换工具时闪菜单。
      if (event.key === 'Alt') {
        event.preventDefault();
      }
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      setAltDown(event.altKey);
      setShiftDown(event.shiftKey);
    };
    const handleBlur = () => {
      setAltDown(false);
      setShiftDown(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  const pointMarkers = useMemo(
    () => data?.markers.filter(hasPointGeometry).slice(0, 800) ?? [],
    [data],
  );
  const modeMatchedMarkerIds = useMemo(() => {
    if (!data) {
      return new Set<string>();
    }
    return new Set(
      pointMarkers
        .filter((marker) => isTransitPoiMarkerCompatibleWithStation(marker, [data.line.mode]))
        .map((marker) => marker.id),
    );
  }, [data, pointMarkers]);
  const markerIconUrlById = useMemo(() => {
    const urls = new Map<string, string>();
    if (!data) {
      return urls;
    }
    for (const marker of pointMarkers) {
      if (marker.iconFileName) {
        urls.set(marker.id, toMarkerIconUrl(marker.iconFileName, data.iconBaseUrl));
      }
    }
    return urls;
  }, [data, pointMarkers]);
  const stationSnapCandidates = useMemo(
    () =>
      data
        ? pointMarkers.filter((marker) =>
            isTransitPoiMarkerCompatibleWithStation(marker, [data.line.mode]),
          )
        : [],
    [data, pointMarkers],
  );
  const roadGraph = useMemo(
    () =>
      data
        ? buildVisualRoadGraph(data.markers, data.junctionSnapTolerance, {
            defaultTravelMode: data.line.mode === 'coach' ? 'coach' : 'bus',
            defaultY: data.defaultY,
            verticalTolerance: data.verticalTolerance,
            worldId: data.worldId,
          })
        : undefined,
    [data],
  );
  const controlCoordinates = useMemo(
    () => nodes.flatMap((node) => (node.coordinate ? [node.coordinate] : [])),
    [nodes],
  );
  const fullRouteResolution = useMemo(
    () => resolveVisualRoute(controlCoordinates, routeMode, roadGraph),
    [controlCoordinates, roadGraph, routeMode],
  );
  const previewNodes = useMemo(() => {
    const includedNodes = nodes.filter((node) =>
      isTransitLineDirectionIncluded(node.direction, previewDirection),
    );
    return previewDirection === 'forward' ? includedNodes : includedNodes.reverse();
  }, [nodes, previewDirection]);
  const previewControlCoordinates = useMemo(
    () => previewNodes.flatMap((node) => (node.coordinate ? [node.coordinate] : [])),
    [previewNodes],
  );
  const previewRouteResolution = useMemo(
    () => resolveVisualRoute(previewControlCoordinates, routeMode, roadGraph),
    [previewControlCoordinates, roadGraph, routeMode],
  );
  const resolvedRouteCoordinates = previewRouteResolution.coordinates;
  const routePreviewWarning =
    routeMode === 'road' && previewRouteResolution.unresolvedSegmentCount > 0
      ? `${previewRouteResolution.unresolvedSegmentCount} 个相邻节点暂时无法通过道路连通。`
      : '';
  const visibleTiles = useMemo(
    () =>
      buildEditorTiles(
        mapView,
        viewportSize,
        data?.tileTemplate ?? null,
        data?.freshTileTemplate ?? null,
      ),
    [data?.freshTileTemplate, data?.tileTemplate, mapView, viewportSize],
  );
  const effectiveTool: LineEditorTool =
    altDown && activeTool === 'station'
      ? 'waypoint'
      : altDown && activeTool === 'waypoint'
        ? 'station'
        : activeTool;
  const effectiveSnapEnabled = shiftDown ? !snapEnabled : snapEnabled;

  const stationEntries = useMemo(
    () =>
      nodes.flatMap((node, index) => (node.kind === 'station' ? [{ index, node }] : [])) as Array<{
        index: number;
        node: EditorStationNode;
      }>,
    [nodes],
  );
  const waypointEntries = useMemo(
    () =>
      nodes.flatMap((node, index) => (node.kind === 'waypoint' ? [{ index, node }] : [])) as Array<{
        index: number;
        node: EditorWaypointNode;
      }>,
    [nodes],
  );
  const segmentEntries = useMemo<EditorSegmentEntry[]>(() => {
    const entries: EditorSegmentEntry[] = [];
    let previous: { index: number; node: EditorStationNode } | null = null;
    nodes.forEach((node, index) => {
      if (node.kind !== 'station') {
        return;
      }
      if (previous) {
        const key = segmentOperationStatusKey(previous.node.stationSourceId, node.stationSourceId);
        const fromIndex = previous.index;
        const waypoints = nodes
          .slice(fromIndex + 1, index)
          .flatMap((item, offset) =>
            item.kind === 'waypoint' ? [{ index: fromIndex + 1 + offset, node: item }] : [],
          );
        entries.push({
          key,
          id: `${key}\u0001${entries.length}`,
          fromIndex,
          fromNode: previous.node,
          toIndex: index,
          toNode: node,
          waypointCount: waypoints.length,
          waypoints,
        });
      }
      previous = { index, node };
    });
    return entries;
  }, [nodes]);
  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId],
  );
  const selectedSegment = useMemo(
    () => segmentEntries.find((entry) => entry.id === selectedSegmentId) ?? null,
    [segmentEntries, selectedSegmentId],
  );
  const hasLayerSelection = Boolean(selectedNode || selectedSegment);
  const segmentByFromIndex = useMemo(
    () => new Map(segmentEntries.map((segment) => [segment.fromIndex, segment] as const)),
    [segmentEntries],
  );
  const firstStationIndex = stationEntries[0]?.index ?? -1;
  const lastStationIndex = stationEntries.at(-1)?.index ?? -1;
  const orphanWaypointEntries = useMemo(
    () =>
      waypointEntries.filter(({ index }) => index < firstStationIndex || index > lastStationIndex),
    [waypointEntries, firstStationIndex, lastStationIndex],
  );
  const totalRouteLength = useMemo(
    () => getCoordinateChainLength(fullRouteResolution.coordinates),
    [fullRouteResolution],
  );
  const selectedStationDetail = useMemo(() => {
    if (!data || selectedNode?.kind !== 'station') {
      return undefined;
    }
    return findTransitStationDetail(
      data.revision.stationDetails,
      data.line.name,
      selectedNode.name,
    );
  }, [data, selectedNode]);
  const markerCoordinateById = useMemo(() => {
    const coordinates = new Map<string, string>();
    if (!data) {
      return coordinates;
    }
    for (const marker of data.markers) {
      if (marker.geometry.type === 'Point') {
        coordinates.set(marker.id, formatCoordinate(marker.geometry.coordinates));
      }
    }
    return coordinates;
  }, [data]);
  const selectedPlatformFacilities = useMemo(() => {
    if (!selectedStationDetail) {
      return [];
    }
    const platformFloor = selectedStationDetail.layers.find(
      (layer) => layer.type === 'platform',
    )?.floor;
    if (!platformFloor) {
      return selectedStationDetail.facilities;
    }
    return selectedStationDetail.facilities.filter(
      (facility) => !facility.floor || facility.floor === platformFloor,
    );
  }, [selectedStationDetail]);
  const stationCoordinateTargetNode = useMemo(() => {
    if (!stationCoordinateTargetId) {
      return null;
    }
    const node = nodes.find((candidate) => candidate.id === stationCoordinateTargetId);
    return node?.kind === 'station' ? node : null;
  }, [nodes, stationCoordinateTargetId]);
  const stationCoordinateTargetStation = useMemo(() => {
    if (!data || !stationCoordinateTargetNode || stationCoordinateTargetNode.draftClientId) {
      return undefined;
    }
    return data.revision.stations.find(
      (station) => station.sourceId === stationCoordinateTargetNode.stationSourceId,
    );
  }, [data, stationCoordinateTargetNode]);
  const stationDetailTargetNode = useMemo(() => {
    if (!stationDetailTargetId) {
      return null;
    }
    const node = nodes.find((candidate) => candidate.id === stationDetailTargetId);
    return node?.kind === 'station' ? node : null;
  }, [nodes, stationDetailTargetId]);
  const stationDetailTarget = useMemo<TransitStationDetailSnapshot | null>(() => {
    if (!data || !stationDetailTargetNode) {
      return null;
    }
    return (
      findTransitStationDetail(
        data.revision.stationDetails,
        data.line.name,
        stationDetailTargetNode.name,
      ) ?? {
        sourceId: stationDetailTargetNode.stationSourceId,
        lineName: data.line.name,
        stationName: stationDetailTargetNode.name,
        layers: [],
        facilities: [],
        transfers: [],
        exits: [],
        surroundingStationNames: [],
      }
    );
  }, [data, stationDetailTargetNode]);

  // 删除节点后同步清理失效的选中项与弹窗目标。
  useEffect(() => {
    if (selectedNodeId && !nodes.some((node) => node.id === selectedNodeId)) {
      setSelectedNodeId(null);
    }
    if (stationCoordinateTargetId && !nodes.some((node) => node.id === stationCoordinateTargetId)) {
      setStationCoordinateTargetId(null);
    }
    if (stationDetailTargetId && !nodes.some((node) => node.id === stationDetailTargetId)) {
      setStationDetailTargetId(null);
    }
  }, [nodes, selectedNodeId, stationCoordinateTargetId, stationDetailTargetId]);

  useEffect(() => {
    if (selectedSegmentId && !segmentEntries.some((entry) => entry.id === selectedSegmentId)) {
      setSelectedSegmentId(null);
    }
  }, [segmentEntries, selectedSegmentId]);

  const removeNodeAtClientPoint = useCallback(
    (clientX: number, clientY: number, hitRadius: number) => {
      const stage = stageRef.current;
      if (!stage) {
        return;
      }
      const rect = stage.getBoundingClientRect();
      setNodes((current) => {
        if (current.length === 0) {
          setStatus('当前没有可删除的站点或途径点。');
          return current;
        }
        const removeIndex =
          insertionMode === 'append'
            ? current.length - 1
            : insertionMode === 'prepend'
              ? 0
              : findNearestEditorNodeScreenIndex(
                  current,
                  clientX - rect.left,
                  clientY - rect.top,
                  mapView,
                  viewportSize,
                  hitRadius,
                );
        if (removeIndex < 0) {
          setStatus('右键或长按位置附近没有站点或途径点。');
          return current;
        }
        const removed = current[removeIndex];
        setStatus(
          removed?.kind === 'station'
            ? `已删除站点“${removed.name || '未命名站点'}”。`
            : '已删除途径点。',
        );
        return current.filter((_, index) => index !== removeIndex);
      });
    },
    [insertionMode, mapView, viewportSize],
  );

  /** 根据吸附结果生成新节点；站点优先复用已绑定该 POI 的既有站点。 */
  const buildNodeFromSnap = (
    kind: 'station' | 'waypoint',
    coordinate: [number, number],
    snapMarker: ReturnType<typeof findNearestSnapMarker>,
  ): EditorNode => {
    const rounded = roundCoordinate(coordinate);
    if (kind === 'waypoint') {
      return {
        id: createClientId('waypoint'),
        kind: 'waypoint',
        coordinate: rounded,
        direction: 'both',
        boundPoiMarkerId: snapMarker?.id,
        boundPoiLabel: snapMarker?.label,
      };
    }
    const existingStation =
      snapMarker && data ? findStationBoundToMarker(data.revision.stations, snapMarker) : undefined;
    if (existingStation) {
      return createExistingStationNode(existingStation, nodes.length);
    }
    const clientId = createClientId('station');
    return {
      id: clientId,
      kind: 'station',
      stationSourceId: `draft:${clientId}`,
      draftClientId: clientId,
      // 直接绑定现有 POI 时沿用该 POI 的名称，避免再手动填一次站名。
      name: snapMarker?.label ?? '',
      coordinate: rounded,
      direction: 'both',
      operationStatus: 'operating',
      boundPoiMarkerId: snapMarker?.id,
      boundPoiLabel: snapMarker?.label,
      boundPoiCategoryId: snapMarker?.categoryId,
    };
  };

  const addNodeAtClientPoint = useCallback(
    (clientX: number, clientY: number) => {
      const stage = stageRef.current;
      if (!stage || !data || effectiveTool === 'pan' || effectiveTool === 'select') {
        return;
      }
      setSelectedSegmentId(null);
      const rect = stage.getBoundingClientRect();
      const coordinate = unprojectClientPoint(clientX, clientY, rect, mapView);
      const snapCandidates = effectiveTool === 'station' ? stationSnapCandidates : pointMarkers;
      const snapMarker = effectiveSnapEnabled
        ? findNearestSnapMarker(coordinate, snapCandidates, mapView.zoom, 48)
        : undefined;
      const resolvedCoordinate = snapMarker?.geometry.coordinates ?? coordinate;

      const selectedNode = selectedNodeId
        ? nodes.find((node) => node.id === selectedNodeId)
        : undefined;
      if (selectedNode && selectedNode.kind === effectiveTool) {
        setNodes((current) =>
          current.map((node) =>
            node.id === selectedNode.id
              ? {
                  ...node,
                  coordinate: roundCoordinate(resolvedCoordinate),
                  boundPoiMarkerId: snapMarker?.id,
                  boundPoiLabel: snapMarker?.label,
                  ...(node.kind === 'station'
                    ? {
                        boundPoiCategoryId: snapMarker?.categoryId,
                        boundPoiRefs: snapMarker
                          ? mergeStationBoundPoiRef(node.boundPoiRefs, snapMarker)
                          : node.boundPoiRefs,
                        // 尚未命名的站点在绑定 POI 后直接套用 POI 名称。
                        name:
                          node.draftClientId && !node.name.trim() && snapMarker
                            ? snapMarker.label
                            : node.name,
                      }
                    : {}),
                }
              : node,
          ),
        );
        setSelectedNodeId(null);
        setStatus(`已设置${selectedNode.kind === 'station' ? '站点' : '途径点'}坐标。`);
        return;
      }

      const node = buildNodeFromSnap(effectiveTool, resolvedCoordinate, snapMarker);
      setNodes((current) => insertEditorNode(current, node, insertionMode, routeMode, roadGraph));
      if (node.kind === 'station') {
        setStatus(
          snapMarker
            ? `已添加站点“${node.name || snapMarker.label}”（绑定该 POI），可在检查器改名。`
            : '已添加新站点，请在检查器填写站名。',
        );
      } else {
        setStatus(snapMarker ? `已添加吸附到“${snapMarker.label}”的途径点。` : '已添加途径点。');
      }
    },
    [
      data,
      effectiveSnapEnabled,
      effectiveTool,
      insertionMode,
      mapView,
      nodes,
      pointMarkers,
      roadGraph,
      routeMode,
      selectedNodeId,
      stationSnapCandidates,
    ],
  );

  /** 图层树底部的结构操作：在画布中心新增节点，自动套用当前吸附与插入模式。 */
  const addNodeFromPanel = (kind: 'station' | 'waypoint') => {
    const stage = stageRef.current;
    if (!stage || !data) {
      return;
    }
    const rect = stage.getBoundingClientRect();
    const coordinate = unprojectClientPoint(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2,
      rect,
      mapView,
    );
    const snapCandidates = kind === 'station' ? stationSnapCandidates : pointMarkers;
    const snapMarker = effectiveSnapEnabled
      ? findNearestSnapMarker(coordinate, snapCandidates, mapView.zoom, 48)
      : undefined;
    const node = buildNodeFromSnap(
      kind,
      snapMarker?.geometry.coordinates ?? coordinate,
      snapMarker,
    );
    setNodes((current) => insertEditorNode(current, node, insertionMode, routeMode, roadGraph));
    setSelectedNodeId(node.id);
    setSelectedSegmentId(null);
    setStatus(kind === 'station' ? '已在画布中心添加站点。' : '已在画布中心添加途径点。');
  };

  /** 把当前定位追加为途径点，工具栏与移动端侧栏共用。 */
  const appendLocationWaypoint = (coordinate: [number, number]) => {
    const waypoint: EditorWaypointNode = {
      id: createClientId('waypoint'),
      kind: 'waypoint',
      coordinate: roundCoordinate(coordinate),
      direction: 'both',
    };
    setNodes((current) => insertEditorNode(current, waypoint, insertionMode, routeMode, roadGraph));
    setMapView((current) => ({
      ...current,
      centerX: coordinate[0],
      centerZ: coordinate[1],
    }));
    setStatus('已追加当前位置为途径点。');
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button === 2) {
      return;
    }
    const isPanGesture = event.button === 1 || effectiveTool === 'pan';
    if (!isPanGesture && event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    if (event.pointerType === 'touch') {
      touchPointersRef.current.set(event.pointerId, {
        clientX: event.clientX,
        clientY: event.clientY,
      });
      if (touchPointersRef.current.size === 2) {
        const points = Array.from(touchPointersRef.current.entries());
        const first = points[0];
        const second = points[1];
        if (first && second) {
          const rect = event.currentTarget.getBoundingClientRect();
          const midpoint = getEditorTouchMidpoint(first[1], second[1]);
          pinchGestureRef.current = {
            pointerIds: [first[0], second[0]],
            startDistance: getEditorTouchDistance(first[1], second[1]),
            startZoom: mapView.zoom,
            anchorWorld: unprojectClientPoint(midpoint[0], midpoint[1], rect, mapView),
          };
          if (gestureRef.current?.timerId) {
            window.clearTimeout(gestureRef.current.timerId);
          }
          gestureRef.current = null;
          return;
        }
      }
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const hitNodeIndex = isPanGesture
      ? -1
      : findNearestEditorNodeScreenIndex(
          nodes,
          event.clientX - rect.left,
          event.clientY - rect.top,
          mapView,
          viewportSize,
          event.pointerType === 'touch' ? 24 : 16,
        );
    const hitNode = hitNodeIndex >= 0 ? nodes[hitNodeIndex] : undefined;
    const canMoveNode = Boolean(
      hitNode && (effectiveTool === 'select' || hitNode.kind === effectiveTool),
    );
    if (effectiveTool === 'select' && !canMoveNode) {
      // 选择工具下点击空白既不新增节点，也不接管指针，只清空选中。
      setSelectedNodeId(null);
      setSelectedSegmentId(null);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      return;
    }
    const gesture: PointerGesture = {
      centerX: mapView.centerX,
      centerZ: mapView.centerZ,
      kind: isPanGesture ? 'pan' : canMoveNode ? 'move-node' : 'add',
      longPressTriggered: false,
      moved: false,
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      nodeId: canMoveNode ? hitNode?.id : undefined,
      hadPoiBinding: canMoveNode ? Boolean(hitNode?.boundPoiMarkerId) : undefined,
      startBoundPoiMarkerId:
        canMoveNode && hitNode?.kind === 'station' ? hitNode.boundPoiMarkerId : undefined,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
    };
    if (event.pointerType === 'touch' && gesture.kind === 'add') {
      gesture.timerId = window.setTimeout(() => {
        const current = gestureRef.current;
        if (!current || current.pointerId !== event.pointerId || current.moved) {
          return;
        }
        current.longPressTriggered = true;
        navigator.vibrate?.(35);
        removeNodeAtClientPoint(event.clientX, event.clientY, 44);
      }, longPressDurationMs);
    }
    if (gesture.kind === 'move-node') {
      nodeDragStartRef.current = nodes;
    }
    gestureRef.current = gesture;
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch') {
      touchPointersRef.current.set(event.pointerId, {
        clientX: event.clientX,
        clientY: event.clientY,
      });
      const pinch = pinchGestureRef.current;
      if (pinch?.pointerIds.includes(event.pointerId)) {
        const first = touchPointersRef.current.get(pinch.pointerIds[0]);
        const second = touchPointersRef.current.get(pinch.pointerIds[1]);
        if (first && second) {
          const distance = Math.max(1, getEditorTouchDistance(first, second));
          const nextZoom = clampZoom(
            pinch.startZoom + Math.log2(distance / Math.max(1, pinch.startDistance)),
          );
          const midpoint = getEditorTouchMidpoint(first, second);
          const rect = event.currentTarget.getBoundingClientRect();
          const scale = getEditorScale(nextZoom);
          setMapView({
            centerX: pinch.anchorWorld[0] - (midpoint[0] - rect.left - rect.width / 2) / scale,
            centerZ: pinch.anchorWorld[1] - (midpoint[1] - rect.top - rect.height / 2) / scale,
            zoom: nextZoom,
          });
          return;
        }
      }
    }
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) {
      return;
    }
    if (gesture.longPressTriggered) {
      return;
    }
    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;
    if (Math.hypot(deltaX, deltaY) > 7) {
      gesture.moved = true;
      if (gesture.timerId) {
        window.clearTimeout(gesture.timerId);
        gesture.timerId = undefined;
      }
    }
    if (gesture.kind === 'move-node' && gesture.nodeId && gesture.moved) {
      const stage = stageRef.current;
      const movingNode = nodes.find((node) => node.id === gesture.nodeId);
      if (stage && movingNode) {
        const coordinate = roundCoordinate(
          unprojectClientPoint(
            event.clientX,
            event.clientY,
            stage.getBoundingClientRect(),
            mapView,
          ),
        );
        // 吸附开启时：拖到 POI 上就改绑，拖离后解绑；关闭吸附则只改坐标。
        const snapMarker = effectiveSnapEnabled
          ? findNearestSnapMarker(
              coordinate,
              movingNode.kind === 'station' ? stationSnapCandidates : pointMarkers,
              mapView.zoom,
              48,
            )
          : undefined;
        gesture.snapMarkerLabel = effectiveSnapEnabled ? (snapMarker?.label ?? null) : undefined;
        const nextCoordinate = snapMarker?.geometry.coordinates ?? coordinate;
        setNodes((current) =>
          current.map((node) => {
            if (node.id !== gesture.nodeId) {
              return node;
            }
            if (snapMarker) {
              return {
                ...node,
                coordinate: nextCoordinate,
                boundPoiMarkerId: snapMarker.id,
                boundPoiLabel: snapMarker.label,
                ...(node.kind === 'station'
                  ? {
                      boundPoiCategoryId: snapMarker.categoryId,
                      boundPoiRefs: mergeStationBoundPoiRef(node.boundPoiRefs, snapMarker),
                    }
                  : {}),
              };
            }
            if (!effectiveSnapEnabled) {
              return { ...node, coordinate: nextCoordinate };
            }
            if (node.kind === 'station') {
              // 拖离 POI 时只解绑当前主 POI，站点绑定的其他 POI 继续保留。
              const nextRefs = (node.boundPoiRefs ?? []).filter(
                (ref) => ref.markerId !== gesture.startBoundPoiMarkerId,
              );
              const nextPrimaryRef = nextRefs[0];
              return {
                ...node,
                coordinate: nextCoordinate,
                boundPoiMarkerId: nextPrimaryRef?.markerId,
                boundPoiLabel: nextPrimaryRef?.label,
                boundPoiCategoryId: nextPrimaryRef?.categoryId,
                boundPoiRefs: nextRefs,
              };
            }
            return {
              ...node,
              coordinate: nextCoordinate,
              boundPoiMarkerId: undefined,
              boundPoiLabel: undefined,
            };
          }),
        );
        setSelectedNodeId(gesture.nodeId);
        setSelectedSegmentId(null);
      }
      return;
    }
    if (
      gesture.kind === 'pan' ||
      (gesture.kind === 'add' && gesture.pointerType === 'touch' && gesture.moved)
    ) {
      const scale = getEditorScale(mapView.zoom);
      setMapView((current) => ({
        ...current,
        centerX: gesture.centerX - deltaX / scale,
        centerZ: gesture.centerZ - deltaY / scale,
      }));
    }
  };

  const finishPointerGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    touchPointersRef.current.delete(event.pointerId);
    if (pinchGestureRef.current?.pointerIds.includes(event.pointerId)) {
      pinchGestureRef.current = null;
      gestureRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      return;
    }
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) {
      return;
    }
    if (gesture.timerId) {
      window.clearTimeout(gesture.timerId);
    }
    if (gesture.kind === 'add' && !gesture.moved && !gesture.longPressTriggered) {
      addNodeAtClientPoint(event.clientX, event.clientY);
    } else if (gesture.kind === 'move-node') {
      if (gesture.moved) {
        const dragStart = nodeDragStartRef.current;
        if (dragStart) {
          snapshotHistory.push(dragStart);
        }
        setStatus(
          gesture.snapMarkerLabel
            ? `已移动到“${gesture.snapMarkerLabel}”并绑定该 POI；保存线路后写入坐标。`
            : gesture.snapMarkerLabel === null && gesture.hadPoiBinding
              ? '已拖离原 POI，绑定已解除；保存线路后写入坐标。'
              : '已移动节点；保存线路后写入坐标。',
        );
      }
      // 单击节点即选中；拖动结束后也保持选中，方便继续在检查器里改坐标。
      if (gesture.nodeId) {
        setSelectedNodeId(gesture.nodeId);
        setSelectedSegmentId(null);
      }
    }
    nodeDragStartRef.current = null;
    gestureRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const before = unprojectClientPoint(event.clientX, event.clientY, rect, mapView);
    const nextZoom = clampZoom(mapView.zoom + (event.deltaY < 0 ? 0.4 : -0.4));
    const nextScale = getEditorScale(nextZoom);
    setMapView({
      centerX: before[0] - (event.clientX - rect.left - rect.width / 2) / nextScale,
      centerZ: before[1] - (event.clientY - rect.top - rect.height / 2) / nextScale,
      zoom: nextZoom,
    });
  };

  const zoomBy = (delta: number) => {
    setMapView((current) => ({ ...current, zoom: clampZoom(current.zoom + delta) }));
  };

  const fitView = () => setMapView(fitEditorView(nodes, data?.markers ?? []));

  const updateNode = (id: string, updater: (node: EditorNode) => EditorNode) => {
    setNodes((current) => current.map((node) => (node.id === id ? updater(node) : node)));
  };

  /** 检查器里的坐标输入：保留另一轴，缺少坐标时以当前视野中心作为基准。 */
  const updateSelectedNodeCoordinate = (axis: 0 | 1, text: string) => {
    if (!selectedNode || text.trim() === '') {
      return;
    }
    const value = Number(text);
    if (!Number.isFinite(value)) {
      return;
    }
    updateNode(selectedNode.id, (node) => {
      const coordinate = node.coordinate ?? [mapView.centerX, mapView.centerZ];
      return {
        ...node,
        coordinate: axis === 0 ? [value, coordinate[1]] : [coordinate[0], value],
      };
    });
  };

  const selectNode = (id: string) => {
    setSelectedNodeId(id);
    setSelectedSegmentId(null);
  };

  const selectSegment = (key: string) => {
    setSelectedSegmentId(key);
    setSelectedNodeId(null);
  };

  const clearSelection = () => {
    setSelectedNodeId(null);
    setSelectedSegmentId(null);
    closeInspector();
  };

  // 双击图层行时把焦点送进检查器的第一个字段（移动端会顺势展开属性抽屉）。
  const focusInspector = useEditorInspectorFocus(inspectorRef);

  const focusNode = (node: EditorNode) => {
    selectNode(node.id);
    const boundMarker = data?.markers.find(
      (marker) =>
        marker.geometry.type === 'Point' &&
        (marker.id === node.boundPoiMarkerId ||
          (node.boundPoiLabel &&
            normalizeText(marker.label) === normalizeText(node.boundPoiLabel)) ||
          (node.kind === 'station' && normalizeText(marker.label) === normalizeText(node.name))),
    );
    const focusCoordinate =
      node.coordinate ??
      (boundMarker?.geometry.type === 'Point' ? boundMarker.geometry.coordinates : null);
    if (!focusCoordinate) {
      setStatus(`请在地图上点击，为“${node.kind === 'station' ? node.name : '途径点'}”设置坐标。`);
      return;
    }
    setMapView((current) => ({
      ...current,
      centerX: focusCoordinate[0],
      centerZ: focusCoordinate[1],
      zoom: Math.max(current.zoom, 1.5),
    }));
    setStatus(
      node.coordinate
        ? `已定位到“${node.kind === 'station' ? node.name : '途径点'}”。`
        : `已定位到匹配的 POI；请在地图点击以确认“${node.kind === 'station' ? node.name : '途径点'}”坐标。`,
    );
  };

  const moveNode = (index: number, offset: -1 | 1) => {
    const targetIndex = index + offset;
    if (targetIndex < 0 || targetIndex >= nodes.length) {
      return;
    }
    setNodes((current) => {
      const next = [...current];
      [next[index], next[targetIndex]] = [next[targetIndex]!, next[index]!];
      return next;
    });
  };

  const duplicateNodeById = (id: string) => {
    const index = nodes.findIndex((node) => node.id === id);
    const source = nodes[index];
    if (!source) {
      return;
    }
    let copy: EditorNode;
    if (source.kind === 'station') {
      // 既有站点复制成新的草稿站点，避免保存时把同一 stationSourceId 重复写入序列。
      const clientId = createClientId('station');
      copy = {
        ...source,
        id: clientId,
        stationSourceId: `draft:${clientId}`,
        draftClientId: clientId,
        name: source.name.trim() ? `${source.name} 副本` : '',
      };
    } else {
      copy = { ...source, id: createClientId('waypoint') };
    }
    setNodes((current) => {
      const next = [...current];
      next.splice(index + 1, 0, copy);
      return next;
    });
    selectNode(copy.id);
    setStatus('已创建副本。');
  };

  const removeNodeById = (id: string) => {
    setNodes((current) => current.filter((node) => node.id !== id));
    if (selectedNodeId === id) {
      setSelectedNodeId(null);
    }
  };

  const moveNodeById = (id: string, offset: -1 | 1) => {
    const index = nodes.findIndex((node) => node.id === id);
    if (index < 0) {
      return;
    }
    moveNode(index, offset);
  };

  /** 站点弹窗保存后同步服务端版本，保证后续线路保存使用最新站点与详情。 */
  const applyRevision = (revision: TransitDataRevision) => {
    setData((current) =>
      current
        ? {
            ...current,
            revision,
            line:
              revision.lines.find((line) => line.sourceId === current.line.sourceId) ??
              current.line,
          }
        : current,
    );
  };

  const save = async (): Promise<void | boolean> => {
    if (!data) {
      return false;
    }
    const stationNodes = nodes.filter((node): node is EditorStationNode => node.kind === 'station');
    if (nodes[0]?.kind !== 'station' || nodes.at(-1)?.kind !== 'station') {
      setStatus('线路必须以站点开始并以站点结束。');
      return false;
    }
    if (stationNodes.length < 2) {
      setStatus('线路至少需要两个站点。');
      return false;
    }
    const unnamedDraft = stationNodes.find((node) => node.draftClientId && !node.name.trim());
    if (unnamedDraft) {
      setStatus('请先填写所有新站点的站名。');
      return false;
    }
    if (stationNodes.some((node) => !node.coordinate)) {
      setStatus('线路中仍有站点缺少地图坐标。');
      return false;
    }
    if (routeMode === 'road' && fullRouteResolution.unresolvedSegmentCount > 0) {
      setStatus('沿路模式仍有节点无法通过道路连通，请补充途径点或切换为折线模式。');
      return false;
    }

    const segmentPaths = buildEditorSegmentPaths(
      nodes,
      routeMode,
      roadGraph,
      segmentOperationStatusByKey,
      segmentTravelMinutesByKey,
    );
    const routeNodes: TransitLineRouteNodeSnapshot[] = nodes.map((node) =>
      node.kind === 'station'
        ? {
            kind: 'station',
            stationSourceId: node.stationSourceId,
            direction: node.direction,
          }
        : {
            kind: 'waypoint',
            x: node.coordinate[0],
            z: node.coordinate[1],
            direction: node.direction,
            boundPoiMarkerId: node.boundPoiMarkerId,
            boundPoiLabel: node.boundPoiLabel,
          },
    );
    const payload = {
      mode: data.line.mode,
      name: lineName.trim() || data.line.name,
      color: data.line.color,
      routeMode,
      routeNodes,
      stationSourceIds: stationNodes.map((node) => node.stationSourceId),
      oneWayStops: stationNodes
        .filter((node) => node.direction !== 'both')
        .map((node) => ({
          stationSourceId: node.stationSourceId,
          oneWay: node.direction as 'down' | 'up',
        })),
      segmentPaths,
      operator: data.line.operator,
      fare: data.line.fare,
      firstBus: data.line.firstLastBus?.first,
      lastBus: data.line.firstLastBus?.last,
      departureTimes: data.line.departureTimes,
      departureRules: data.line.departureRules,
      operatingDateRule: data.line.operatingDateRule,
      bookingUrl: data.line.bookingUrl,
      stationDrafts: stationNodes.flatMap((node) =>
        node.draftClientId && node.coordinate
          ? [
              {
                clientId: node.draftClientId,
                name: node.name.trim(),
                x: node.coordinate[0],
                z: node.coordinate[1],
                operationStatus: node.operationStatus ?? 'operating',
                boundPoiMarkerId: node.boundPoiMarkerId,
                boundPoiLabel: node.boundPoiLabel,
                boundPoiCategoryId: node.boundPoiCategoryId,
                boundPoiRefs: node.boundPoiRefs?.length ? node.boundPoiRefs : undefined,
              },
            ]
          : [],
      ),
    };
    setIsSaving(true);
    setStatus('正在保存线路');
    try {
      const originalStationById = new Map(
        data.revision.stations.map((station) => [station.sourceId, station]),
      );
      const changedExistingStations = stationNodes.filter((node) => {
        if (node.draftClientId || !node.coordinate) {
          return false;
        }
        const original = originalStationById.get(node.stationSourceId);
        const coordinateChanged =
          original?.x !== node.coordinate[0] || original?.z !== node.coordinate[1];
        const bindingChanged = !areStationPoiBindingsEqual(
          getStationBoundPoiRefs(original),
          node.boundPoiRefs ?? [],
        );
        const statusChanged =
          (original?.operationStatus ?? 'operating') !== (node.operationStatus ?? 'operating');
        return coordinateChanged || bindingChanged || statusChanged;
      });
      for (const node of changedExistingStations) {
        const original = originalStationById.get(node.stationSourceId);
        setStatus(`正在保存站点“${node.name}”的坐标、运营状态与绑定`);
        const stationResponse = await fetch(
          appPath(
            `/api/admin/transit/datasets/${encodeURIComponent(normalizedRevisionId)}/stations/${encodeURIComponent(node.stationSourceId)}`,
          ),
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              x: node.coordinate![0],
              z: node.coordinate![1],
              operationStatus: node.operationStatus ?? original?.operationStatus ?? 'operating',
              boundPoiRefs: node.boundPoiRefs ?? [],
              boundPoiMarkerId: node.boundPoiMarkerId ?? null,
              boundPoiLabel: node.boundPoiLabel ?? null,
            }),
          },
        );
        if (!stationResponse.ok) {
          const stationResult = (await stationResponse.json()) as { message?: string };
          setStatus(stationResult.message ?? `站点“${node.name}”坐标保存失败。`);
          return false;
        }
      }
      setStatus('正在保存线路');
      const response = await fetch(
        appPath(
          `/api/admin/transit/datasets/${encodeURIComponent(normalizedRevisionId)}/lines/${encodeURIComponent(normalizedLineSourceId)}`,
        ),
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      const result = (await response.json()) as { message?: string };
      if (!response.ok) {
        setStatus(result.message ?? '线路保存失败。');
        return false;
      }
      publishAdminDataChanged({
        resource: 'transit',
        reason: 'record_updated',
        occurredAt: new Date().toISOString(),
      });
      setStatus('线路已保存。');
      return true;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '线路保存失败。');
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const editorTools = useMemo<EditorTool[]>(
    () => [
      {
        id: 'select',
        icon: 'near_me',
        label: EDITOR_SHORTCUT_CATALOG.toolSelect.label,
        shortcut: EDITOR_SHORTCUT_CATALOG.toolSelect.displayKeys[0],
      },
      {
        id: 'pan',
        icon: 'pan_tool',
        label: EDITOR_SHORTCUT_CATALOG.toolPan.label,
        shortcut: EDITOR_SHORTCUT_CATALOG.toolPan.displayKeys[0],
      },
      {
        id: 'station',
        icon: 'add_location_alt',
        label: EDITOR_SHORTCUT_CATALOG.toolStation.label,
        shortcut: EDITOR_SHORTCUT_CATALOG.toolStation.displayKeys[0],
      },
      {
        id: 'waypoint',
        icon: 'add_road',
        label: EDITOR_SHORTCUT_CATALOG.toolWaypoint.label,
        shortcut: EDITOR_SHORTCUT_CATALOG.toolWaypoint.displayKeys[0],
      },
    ],
    [],
  );

  const removeSelectedNode = () => {
    if (selectedNodeId) {
      removeNodeById(selectedNodeId);
    }
  };

  const duplicateSelectedNode = () => {
    if (selectedNodeId) {
      duplicateNodeById(selectedNodeId);
    }
  };

  const moveSelectedNode = (offset: -1 | 1) => {
    if (selectedNodeId) {
      moveNodeById(selectedNodeId, offset);
    }
  };

  // 业务操作随渲染刷新，注册表只负责键位分发；保存与保存并返回由外壳统一处理。
  useEditorShortcuts([
    defineShortcut('toolSelect', () => setActiveTool('select')),
    defineShortcut('toolPan', () => setActiveTool('pan')),
    defineShortcut('toolMove', () => setActiveTool('select')),
    defineShortcut('toolStation', () => setActiveTool('station')),
    defineShortcut('toolWaypoint', () => setActiveTool('waypoint')),
    defineShortcut('insertPrepend', () => setInsertionMode('prepend')),
    defineShortcut('insertAppend', () => setInsertionMode('append')),
    defineShortcut('insertNearest', () => setInsertionMode('nearest')),
    defineShortcut('undo', undoNodes),
    defineShortcut('redo', redoNodes),
    defineShortcut('redoY', redoNodes),
    defineShortcut('duplicateSelection', duplicateSelectedNode),
    defineShortcut('moveUp', () => moveSelectedNode(-1)),
    defineShortcut('moveDown', () => moveSelectedNode(1)),
    defineShortcut('deleteSelection', removeSelectedNode),
    defineShortcut('deleteSelection', removeSelectedNode, {
      id: `${EDITOR_SHORTCUT_CATALOG.deleteSelection.id}-backspace`,
      keys: 'backspace',
    }),
  ]);

  // 工具栏分组的单一来源：宽屏平铺到各自胶囊，窄屏收进各自的溢出菜单。
  const insertionActionItems: EditorToolbarOverflowItem[] = [
    {
      id: 'prepend',
      icon: 'first_page',
      label: '反向追加模式（[）',
      active: insertionMode === 'prepend',
      onClick: () => setInsertionMode('prepend'),
    },
    {
      id: 'append',
      icon: 'last_page',
      label: '追加模式（]）',
      active: insertionMode === 'append',
      onClick: () => setInsertionMode('append'),
    },
    {
      id: 'nearest',
      icon: 'conversion_path',
      label: '就近模式（\\）',
      active: insertionMode === 'nearest',
      onClick: () => setInsertionMode('nearest'),
    },
  ];

  const historyActionItems: EditorToolbarOverflowItem[] = [
    {
      id: 'undo',
      icon: 'undo',
      label: '撤销（Ctrl+Z）',
      onClick: undoNodes,
    },
    {
      id: 'redo',
      icon: 'redo',
      label: '重做（Ctrl+Shift+Z）',
      onClick: redoNodes,
    },
  ];

  const viewActionItems: EditorToolbarOverflowItem[] = [
    {
      id: 'snap',
      icon: 'location_searching',
      label: '切换吸附（Shift）',
      active: snapEnabled,
      onClick: () => setSnapEnabled((current) => !current),
    },
  ];

  const locationActionItems: EditorToolbarOverflowItem[] = [
    {
      id: 'location',
      icon: 'my_location',
      label: '使用当前位置',
      onClick: () => toolbarLocationProxyRef.current?.querySelector('button')?.click(),
    },
  ];

  // 宽屏时工具胶囊移入标题栏；窄屏仍浮在画布上，所有非工具组统一收进一个图标菜单。
  const renderEditorToolbar = (variant: 'full' | 'compact', inHeader: boolean) => (
    <EditorToolbar
      activeToolId={activeTool}
      ariaLabel="线路编辑工具"
      className={inHeader ? 'is-in-header' : undefined}
      panels={{
        visible: panelsVisible,
        onToggle: togglePanels,
        label: panelsVisible ? '隐藏全部面板' : '显示全部面板',
      }}
      onToolChange={(toolId) => setActiveTool(toolId as LineEditorTool)}
      sections={buildEditorToolbarSections({
        variant,
        tools: editorTools,
        toolsAriaLabel: '线路编辑工具',
        compactAriaLabel: '线路编辑操作',
        groups: [
          { id: 'insertion', ariaLabel: '插入模式', items: insertionActionItems },
          { id: 'history', ariaLabel: '历史', items: historyActionItems },
          { id: 'view', ariaLabel: '视图', items: viewActionItems },
          { id: 'location', ariaLabel: '定位', items: locationActionItems },
        ],
      })}
    />
  );

  if (!data) {
    return (
      <EditorLoadingState
        backHref={backToAdminHref}
        backLabel="返回线路后台"
        icon="route"
        status={status}
      />
    );
  }

  return (
    <VisualEditorShell
      backHref={backToAdminPath}
      editorKind="transit-line"
      headerTools={
        <EditorHeaderToolbar
          compact={renderEditorToolbar('compact', true)}
          full={renderEditorToolbar('full', true)}
        />
      }
      isBusy={isSaving}
      onSave={() => save()}
      sessionId={`transit-line:${normalizedRevisionId}:${normalizedLineSourceId}`}
      title={`编辑${lineName || data.line.name}`}
      workspace
    >
      <div
        className={`transit-visual-workspace is-tool-${effectiveTool}${panelStateClass}${
          hasLayerSelection ? ' has-layer-selection' : ''
        }`}
      >
        <div
          className={`transit-visual-map-stage is-tool-${effectiveTool}`}
          ref={stageRef}
          onContextMenu={(event) => {
            event.preventDefault();
            removeNodeAtClientPoint(event.clientX, event.clientY, 28);
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishPointerGesture}
          onPointerCancel={finishPointerGesture}
          onWheel={handleWheel}
        >
          <div className="transit-visual-map-tiles" aria-hidden="true">
            {visibleTiles.map((tile) => (
              <LayeredMapTile
                className="transit-visual-map-tile"
                fallbackUrl={tile.fallbackUrl}
                freshUrl={tile.freshUrl}
                key={tile.id}
                tileKey={tile.id}
                style={{
                  height: tile.displaySize,
                  left: tile.left,
                  top: tile.top,
                  width: tile.displaySize,
                }}
              />
            ))}
          </div>
          <svg className="transit-visual-map-overlay" aria-label="线路地图预览">
            {data.markers.filter(isRoadLinearMarker).map((marker) => {
              const coordinates = getLinearMarkerCoordinates(marker);
              const points = projectCoordinateChain(coordinates, mapView, viewportSize);
              return points ? (
                <polyline className="transit-visual-road" points={points} key={marker.id} />
              ) : null;
            })}
            {resolvedRouteCoordinates.length >= 2 ? (
              <polyline
                className="transit-visual-route"
                points={
                  projectCoordinateChain(resolvedRouteCoordinates, mapView, viewportSize) ?? ''
                }
                style={{ '--visual-line-color': data.line.color ?? '#2f9e85' } as CSSProperties}
              />
            ) : null}
            {pointMarkers.map((marker) => {
              const point = projectWorldCoordinate(
                marker.geometry.coordinates,
                mapView,
                viewportSize,
              );
              const modeMatched = modeMatchedMarkerIds.has(marker.id);
              const iconUrl = markerIconUrlById.get(marker.id) ?? '';
              const iconSize = modeMatched ? 20 : 12;
              return isPointVisible(point, viewportSize, 30) ? (
                <g
                  className={`transit-visual-poi${modeMatched ? ' is-mode-match' : ''}`}
                  key={marker.id}
                  style={
                    {
                      '--visual-mode-color': transitModeSemanticColors[data.line.mode],
                    } as CSSProperties
                  }
                  transform={`translate(${point[0]} ${point[1]})`}
                >
                  {iconUrl ? (
                    <image
                      href={iconUrl}
                      height={iconSize}
                      preserveAspectRatio="xMidYMid meet"
                      width={iconSize}
                      x={-iconSize / 2}
                      y={-iconSize / 2}
                    />
                  ) : (
                    <circle r={modeMatched ? 4 : 2} />
                  )}
                  {modeMatched && !isStationAccessMarker(marker) ? (
                    <text x={iconSize / 2 + 4} y="4">
                      {formatVisualMarkerLabel(marker.label)}
                    </text>
                  ) : null}
                  <title>{marker.label}</title>
                </g>
              ) : null;
            })}
            {previewNodes.map((node, index) => {
              if (!node.coordinate) {
                return null;
              }
              const point = projectWorldCoordinate(node.coordinate, mapView, viewportSize);
              if (!isPointVisible(point, viewportSize, 40)) {
                return null;
              }
              return (
                <g
                  className={
                    node.kind === 'station'
                      ? 'transit-visual-node is-station'
                      : 'transit-visual-node is-waypoint'
                  }
                  key={node.id}
                  transform={`translate(${point[0]} ${point[1]})`}
                >
                  <circle r={node.kind === 'station' ? 7 : 5} />
                  <text y="-10">{node.kind === 'station' ? index + 1 : '·'}</text>
                </g>
              );
            })}
          </svg>
        </div>

        {panelsVisible ? (
          <aside className="poi-visual-layer-panel" aria-label="线路图层">
            <EditorPanelHeading
              meta={`${stationEntries.length} 站 · ${waypointEntries.length} 途径点 · ${segmentEntries.length} 区间`}
              title="图层"
              toolbar={
                <div className="transit-visual-layer-heading-actions">
                  <span>预览</span>
                  <SegmentedControl
                    ariaLabel="预览方向"
                    className="transit-visual-segmented"
                    onChange={setPreviewDirection}
                    options={[
                      { value: 'forward', label: '正向', title: '正向（按站序）' },
                      { value: 'reverse', label: '反向', title: '反向（逆站序）' },
                    ]}
                    value={previewDirection}
                    wrapperClassName=""
                  />
                </div>
              }
              withInspectorEntry
            >
              <EditorInspectorEntry onOpen={openInspector} />
            </EditorPanelHeading>
            <div className="poi-visual-layer-body" ref={layerBodyRef}>
              <p className="muted transit-visual-layer-hint">
                站点、区间与途径点按里程顺序排列；拖动站点会修改车站共享坐标与默认
                POI，属性检查器里可修改绑定 POI 与站内设施。
              </p>
              {status || routePreviewWarning ? (
                <p className="transit-visual-panel-status" role="status">
                  {status || routePreviewWarning}
                </p>
              ) : null}
              <ul className="poi-visual-layer-tree">
                {stationEntries.map(({ index, node }, stationOrder) => {
                  const segment = segmentByFromIndex.get(index);
                  return (
                    <Fragment key={node.id}>
                      <li>
                        <div
                          className={`poi-visual-layer-row${selectedNodeId === node.id ? ' is-active' : ''}`}
                        >
                          <button
                            aria-pressed={selectedNodeId === node.id}
                            className="poi-visual-layer-group"
                            type="button"
                            title={node.coordinate ? formatCoordinate(node.coordinate) : '缺少坐标'}
                            onClick={() => focusNode(node)}
                            onDoubleClick={() => {
                              focusNode(node);
                              focusInspector();
                            }}
                          >
                            <span className="material-symbols-outlined" aria-hidden="true">
                              location_on
                            </span>
                            <span className="poi-visual-layer-label">
                              {node.name || '未命名站点'}
                            </span>
                            <span className="poi-visual-layer-count">{stationOrder + 1}</span>
                          </button>
                          <TransitLayerRowActions
                            canMoveDown={index < nodes.length - 1}
                            canMoveUp={index > 0}
                            onDuplicate={() => duplicateNodeById(node.id)}
                            onMoveDown={() => moveNode(index, 1)}
                            onMoveUp={() => moveNode(index, -1)}
                            onRemove={() => removeNodeById(node.id)}
                          />
                        </div>
                      </li>
                      {segment ? (
                        <li key={segment.id}>
                          <div
                            className={`poi-visual-layer-row${
                              selectedSegmentId === segment.id ? ' is-active' : ''
                            }`}
                          >
                            <button
                              aria-pressed={selectedSegmentId === segment.id}
                              className="poi-visual-layer-group"
                              type="button"
                              title={`${segment.fromNode.name} 至 ${segment.toNode.name}`}
                              onClick={() => selectSegment(segment.id)}
                              onDoubleClick={() => {
                                selectSegment(segment.id);
                                focusInspector();
                              }}
                            >
                              <span className="material-symbols-outlined" aria-hidden="true">
                                route
                              </span>
                              <span className="poi-visual-layer-label">
                                {`区间 ${stationOrder + 1} · ${segment.fromNode.name} → ${segment.toNode.name}`}
                              </span>
                              <span className="poi-visual-layer-count">
                                {`${segment.waypointCount} 途经`}
                              </span>
                            </button>
                          </div>
                          {segment.waypoints.length > 0 ? (
                            <ul className="poi-visual-layer-points">
                              {segment.waypoints.map(({ index: waypointIndex, node: waypoint }) => (
                                <li key={waypoint.id}>
                                  <div
                                    className={`poi-visual-layer-row${
                                      selectedNodeId === waypoint.id ? ' is-active' : ''
                                    }`}
                                  >
                                    <button
                                      aria-pressed={selectedNodeId === waypoint.id}
                                      className="poi-visual-layer-point"
                                      type="button"
                                      title={formatCoordinate(waypoint.coordinate)}
                                      onClick={() => focusNode(waypoint)}
                                      onDoubleClick={() => {
                                        focusNode(waypoint);
                                        focusInspector();
                                      }}
                                    >
                                      <span className="poi-visual-layer-label">
                                        {`途径点 ${waypointIndex + 1}`}
                                      </span>
                                      <span className="poi-visual-layer-coordinate">
                                        {formatCoordinate(waypoint.coordinate)}
                                      </span>
                                    </button>
                                    <TransitLayerRowActions
                                      canMoveDown={waypointIndex < nodes.length - 1}
                                      canMoveUp={waypointIndex > 0}
                                      onDuplicate={() => duplicateNodeById(waypoint.id)}
                                      onMoveDown={() => moveNode(waypointIndex, 1)}
                                      onMoveUp={() => moveNode(waypointIndex, -1)}
                                      onRemove={() => removeNodeById(waypoint.id)}
                                    />
                                  </div>
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </li>
                      ) : null}
                    </Fragment>
                  );
                })}
                {orphanWaypointEntries.length > 0 ? (
                  <li>
                    <p className="transit-visual-layer-section-title">未归属途径点</p>
                    <ul className="poi-visual-layer-points">
                      {orphanWaypointEntries.map(({ index, node }) => (
                        <li key={node.id}>
                          <div
                            className={`poi-visual-layer-row${selectedNodeId === node.id ? ' is-active' : ''}`}
                          >
                            <button
                              aria-pressed={selectedNodeId === node.id}
                              className="poi-visual-layer-point"
                              type="button"
                              title={formatCoordinate(node.coordinate)}
                              onClick={() => focusNode(node)}
                              onDoubleClick={() => {
                                focusNode(node);
                                focusInspector();
                              }}
                            >
                              <span className="poi-visual-layer-label">{`途径点 ${index + 1}`}</span>
                              <span className="poi-visual-layer-coordinate">
                                {formatCoordinate(node.coordinate)}
                              </span>
                            </button>
                            <TransitLayerRowActions
                              canMoveDown={index < nodes.length - 1}
                              canMoveUp={index > 0}
                              onDuplicate={() => duplicateNodeById(node.id)}
                              onMoveDown={() => moveNode(index, 1)}
                              onMoveUp={() => moveNode(index, -1)}
                              onRemove={() => removeNodeById(node.id)}
                            />
                          </div>
                        </li>
                      ))}
                    </ul>
                  </li>
                ) : null}
              </ul>
            </div>
            <div className="poi-visual-layer-footer">
              <button type="button" onClick={() => addNodeFromPanel('station')}>
                添加站点
              </button>
              <button type="button" onClick={() => addNodeFromPanel('waypoint')}>
                添加途径点
              </button>
            </div>
          </aside>
        ) : null}

        {panelsVisible ? (
          <aside className="poi-visual-inspector" aria-label="属性检查器" ref={inspectorRef}>
            <EditorPanelHeading
              meta={
                selectedNode
                  ? selectedNode.coordinate
                    ? formatCoordinate(selectedNode.coordinate)
                    : '缺少坐标'
                  : selectedSegment
                    ? `${selectedSegment.waypointCount} 个途径点`
                    : `${stationEntries.length} 站 · ${formatRouteLength(totalRouteLength)}`
              }
              title={
                selectedNode
                  ? selectedNode.kind === 'station'
                    ? '站点属性'
                    : '途径点属性'
                  : selectedSegment
                    ? '区间属性'
                    : '全局属性'
              }
            >
              <button
                aria-label="返回图层"
                className="poi-visual-inspector-back"
                onClick={clearSelection}
                title="返回图层"
                type="button"
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  arrow_back
                </span>
              </button>
            </EditorPanelHeading>
            <div className="poi-visual-coordinate-panel-body">
              {selectedNode ? (
                <>
                  <div className="poi-visual-inspector-heading">
                    <strong>
                      {selectedNode.kind === 'station'
                        ? selectedNode.name || '未命名站点'
                        : `途径点 ${nodes.findIndex((node) => node.id === selectedNode.id) + 1}`}
                    </strong>
                    <span>{selectedNode.kind === 'station' ? '站点' : '途径点'}</span>
                  </div>
                  {selectedNode.kind === 'station' && selectedNode.draftClientId ? (
                    <Field label={<>站名</>}>
                      <Input
                        placeholder="填写新站点名称"
                        value={selectedNode.name}
                        onChange={(event) =>
                          updateNode(selectedNode.id, (current) =>
                            current.kind === 'station'
                              ? { ...current, name: event.currentTarget.value }
                              : current,
                          )
                        }
                      />
                    </Field>
                  ) : null}
                  <div className="poi-visual-point-fields">
                    <Field label={<>X</>}>
                      <Input
                        inputMode="decimal"
                        value={selectedNode.coordinate?.[0] ?? ''}
                        onChange={(event) =>
                          updateSelectedNodeCoordinate(0, event.currentTarget.value)
                        }
                      />
                    </Field>
                    <Field label={<>Z</>}>
                      <Input
                        inputMode="decimal"
                        value={selectedNode.coordinate?.[1] ?? ''}
                        onChange={(event) =>
                          updateSelectedNodeCoordinate(1, event.currentTarget.value)
                        }
                      />
                    </Field>
                  </div>
                  <div className="transit-visual-field">
                    <span>方向</span>
                    <SegmentedControl
                      ariaLabel="节点方向"
                      className="transit-visual-segmented"
                      onChange={(direction) =>
                        updateNode(selectedNode.id, (current) => ({
                          ...current,
                          direction,
                        }))
                      }
                      options={[
                        { value: 'both', label: '双向' },
                        { value: 'down', label: '仅正向' },
                        { value: 'up', label: '仅反向' },
                      ]}
                      value={selectedNode.direction}
                      wrapperClassName=""
                    />
                  </div>
                  {selectedNode.kind === 'station' ? (
                    <div className="transit-visual-field">
                      <span>运营状态</span>
                      <SegmentedControl
                        ariaLabel="站点运营状态"
                        className="transit-visual-segmented"
                        onChange={(operationStatus) =>
                          updateNode(selectedNode.id, (current) =>
                            current.kind === 'station' ? { ...current, operationStatus } : current,
                          )
                        }
                        options={[
                          { value: 'operating' as const, label: '运营中' },
                          { value: 'planned' as const, label: '规划中' },
                          { value: 'closed' as const, label: '已关闭' },
                        ]}
                        value={selectedNode.operationStatus ?? 'operating'}
                        wrapperClassName=""
                      />
                    </div>
                  ) : null}
                  <dl className="poi-visual-global-summary">
                    <div>
                      <dt>类型</dt>
                      <dd>{selectedNode.kind === 'station' ? '站点' : '途径点'}</dd>
                    </div>
                    <div>
                      <dt>吸附对象</dt>
                      <dd>{selectedNode.boundPoiLabel ?? '未吸附'}</dd>
                    </div>
                    <div>
                      <dt>所属区间</dt>
                      <dd>{describeNodeSegment(nodes, selectedNode.id)}</dd>
                    </div>
                  </dl>
                  {selectedNode.kind === 'station' ? (
                    <>
                      <div className="transit-visual-inspector-section">
                        <div className="transit-visual-inspector-section-heading">
                          <h3 className="transit-visual-inspector-section-title">
                            站点 POI / 出口
                          </h3>
                          <button
                            className="transit-visual-inspector-edit"
                            type="button"
                            disabled={Boolean(selectedNode.draftClientId)}
                            onClick={() => setStationCoordinateTargetId(selectedNode.id)}
                          >
                            编辑坐标与 POI
                          </button>
                        </div>
                        {(selectedNode.boundPoiRefs ?? []).length === 0 ? (
                          <p className="poi-visual-panel-empty">未绑定 POI。</p>
                        ) : (
                          <p className="transit-visual-summary-text">
                            {(selectedNode.boundPoiRefs ?? [])
                              .map((ref) => {
                                const coordinate = markerCoordinateById.get(ref.markerId);
                                return coordinate ? `${ref.label}（${coordinate}）` : ref.label;
                              })
                              .join('、')}
                          </p>
                        )}
                        {selectedNode.draftClientId ? (
                          <p className="poi-visual-panel-empty">
                            保存站点后可在原弹窗中编辑坐标与 POI 绑定。
                          </p>
                        ) : null}
                      </div>
                      <div className="transit-visual-inspector-section">
                        <div className="transit-visual-inspector-section-heading">
                          <h3 className="transit-visual-inspector-section-title">站内设施</h3>
                          <button
                            className="transit-visual-inspector-edit"
                            type="button"
                            disabled={Boolean(selectedNode.draftClientId)}
                            onClick={() => setStationDetailTargetId(selectedNode.id)}
                          >
                            编辑设施
                          </button>
                        </div>
                        {selectedPlatformFacilities.length === 0 ? (
                          <p className="poi-visual-panel-empty">站台层暂无设施。</p>
                        ) : (
                          <div className="transit-visual-facility-track">
                            {selectedPlatformFacilities.map((facility, index) => {
                              const icon = getStationFacilityIcon(facility);
                              const label =
                                TRANSIT_STATION_FACILITY_OPTIONS.find(
                                  ([value]) => value === facility.type,
                                )?.[1] ?? facility.type;
                              return (
                                <span
                                  className="map-metro-station-facility-icon"
                                  key={`${facility.type}-${facility.floor ?? 'default'}-${index}`}
                                  title={label}
                                >
                                  <span
                                    className="map-metro-station-facility-symbols"
                                    aria-hidden="true"
                                  >
                                    {icon.assetName ? (
                                      <i
                                        className="map-metro-station-facility-asset"
                                        style={
                                          {
                                            '--map-metro-station-facility-asset': `url("${appPath(
                                              `/metro-facilities/plain/${icon.assetName}.svg`,
                                            )}")`,
                                          } as CSSProperties
                                        }
                                      />
                                    ) : (
                                      <i className="material-symbols-outlined">{icon.symbol}</i>
                                    )}
                                  </span>
                                </span>
                              );
                            })}
                          </div>
                        )}
                        <p className="transit-visual-summary-text">
                          {`${selectedStationDetail?.facilities.length ?? 0} 项设施 · ${
                            selectedStationDetail?.layers.length ?? 0
                          } 层 · ${selectedStationDetail?.exits.length ?? 0} 个出口`}
                        </p>
                        {selectedNode.draftClientId ? (
                          <p className="poi-visual-panel-empty">
                            保存站点后可在原弹窗中设置站内设施。
                          </p>
                        ) : null}
                      </div>
                    </>
                  ) : null}
                </>
              ) : selectedSegment ? (
                <>
                  <div className="poi-visual-inspector-heading">
                    <strong>{`${selectedSegment.fromNode.name} → ${selectedSegment.toNode.name}`}</strong>
                    <span>{`${selectedSegment.waypointCount} 个途径点`}</span>
                  </div>
                  <div className="transit-visual-field">
                    <span>运营状态</span>
                    <SegmentedControl
                      ariaLabel="区间运营状态"
                      className="transit-visual-segmented"
                      onChange={(operationStatus) =>
                        setSegmentOperationStatusByKey((current) => ({
                          ...current,
                          [selectedSegment.key]: operationStatus,
                        }))
                      }
                      options={[
                        { value: 'operating', label: '已运营' },
                        { value: 'planned', label: '规划中' },
                        { value: 'closed', label: '已关闭' },
                      ]}
                      value={segmentOperationStatusByKey[selectedSegment.key] ?? 'operating'}
                      wrapperClassName=""
                    />
                  </div>
                  <Field label={<>区间用时（分钟，留空自动估算）</>}>
                    <Input
                      type="number"
                      min={0.01}
                      max={1440}
                      step="0.01"
                      value={segmentTravelMinutesByKey[selectedSegment.key] ?? ''}
                      onChange={(event) =>
                        setSegmentTravelMinutesByKey((current) => ({
                          ...current,
                          [selectedSegment.key]: event.currentTarget.value,
                        }))
                      }
                    />
                  </Field>
                  <dl className="poi-visual-global-summary">
                    <div>
                      <dt>起点</dt>
                      <dd>{selectedSegment.fromNode.name}</dd>
                    </div>
                    <div>
                      <dt>终点</dt>
                      <dd>{selectedSegment.toNode.name}</dd>
                    </div>
                    <div>
                      <dt>途径点</dt>
                      <dd>{`${selectedSegment.waypointCount} 个`}</dd>
                    </div>
                  </dl>
                </>
              ) : (
                <>
                  <div className="poi-visual-inspector-heading">
                    <strong>全局</strong>
                    <span>{data.line.mode}</span>
                  </div>
                  <Field label={<>线路名</>}>
                    <Input
                      value={lineName}
                      onChange={(event) => setLineName(event.currentTarget.value)}
                    />
                  </Field>
                  <dl className="poi-visual-global-summary">
                    <div>
                      <dt>站点</dt>
                      <dd>{`${stationEntries.length} 个`}</dd>
                    </div>
                    <div>
                      <dt>途径点</dt>
                      <dd>{`${waypointEntries.length} 个`}</dd>
                    </div>
                    <div>
                      <dt>区间</dt>
                      <dd>{`${segmentEntries.length} 段`}</dd>
                    </div>
                    <div>
                      <dt>总长</dt>
                      <dd>{formatRouteLength(totalRouteLength)}</dd>
                    </div>
                  </dl>
                  <div className="transit-visual-field">
                    <span>线路运行方式</span>
                    <SegmentedControl
                      ariaLabel="线路运行方式"
                      className="transit-visual-segmented"
                      onChange={setRouteMode}
                      options={[
                        { value: 'straight', label: '折线' },
                        { value: 'road', label: '沿路' },
                      ]}
                      value={routeMode}
                      wrapperClassName=""
                    />
                  </div>
                  <p className="poi-visual-panel-empty">
                    在画布或图层树中单击选中，双击直接进入编辑。
                  </p>
                </>
              )}
            </div>
          </aside>
        ) : null}

        {renderEditorToolbar('compact', false)}

        <div className="transit-visual-rail-proxy" ref={toolbarLocationProxyRef} aria-hidden="true">
          <CurrentPlayerLocationButton
            title="追加当前位置为途径点"
            onUse={appendLocationWaypoint}
          />
        </div>

        <EditorRailBridge
          activeToolId={activeTool}
          ownerId="transit-line-editor"
          panels={{ visible: panelsVisible, onToggle: togglePanels }}
          sections={[
            { id: 'insertion', priority: 50, items: insertionActionItems },
            { id: 'history', priority: 70, items: historyActionItems },
            { id: 'view', priority: 80, items: viewActionItems },
            { id: 'location', priority: 60, items: locationActionItems },
          ]}
          tools={editorTools}
          onToolChange={(toolId) => setActiveTool(toolId as LineEditorTool)}
        />

        <EditorZoomControls
          fitLabel="适配整条线路"
          onFit={fitView}
          onZoomIn={() => zoomBy(0.5)}
          onZoomOut={() => zoomBy(-0.5)}
          scale={2 ** mapView.zoom}
        />
      </div>

      {stationCoordinateTargetNode && stationCoordinateTargetStation ? (
        <TransitStationCoordinateDialog
          isBusy={stationDialogBusy}
          mapMarkers={data.markers}
          revision={data.revision}
          station={stationCoordinateTargetStation}
          tilePreviewFreshTemplate={data.freshTileTemplate}
          tilePreviewTemplate={data.tileTemplate}
          onClose={() => setStationCoordinateTargetId(null)}
          onSubmit={async (payload) => {
            setStationDialogBusy(true);
            try {
              const response = await fetch(
                appPath(
                  `/api/admin/transit/datasets/${encodeURIComponent(
                    normalizedRevisionId,
                  )}/stations/${encodeURIComponent(stationCoordinateTargetNode.stationSourceId)}`,
                ),
                {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(payload),
                },
              );
              const result = (await response.json()) as TransitDataRevision & { message?: string };
              if (!response.ok) {
                return result.message ?? '站点坐标保存失败。';
              }
              applyRevision(result);
              updateNode(stationCoordinateTargetNode.id, (node) =>
                node.kind === 'station'
                  ? {
                      ...node,
                      coordinate: [payload.x, payload.z],
                      boundPoiRefs: payload.boundPoiRefs,
                      boundPoiMarkerId: payload.boundPoiMarkerId,
                      boundPoiLabel: payload.boundPoiLabel,
                      boundPoiCategoryId: payload.boundPoiRefs?.[0]?.categoryId,
                    }
                  : node,
              );
              setStationCoordinateTargetId(null);
              setStatus('站点坐标与 POI 绑定已保存。');
              return null;
            } finally {
              setStationDialogBusy(false);
            }
          }}
        />
      ) : null}

      {stationDetailTargetNode && stationDetailTarget ? (
        <TransitStationDetailDialog
          detail={stationDetailTarget}
          isBusy={stationDialogBusy}
          mapMarkers={data.markers}
          revision={data.revision}
          stationSourceId={stationDetailTargetNode.stationSourceId}
          onClose={() => setStationDetailTargetId(null)}
          onSubmit={async (patch) => {
            setStationDialogBusy(true);
            try {
              const response = await fetch(
                appPath(
                  `/api/admin/transit/datasets/${encodeURIComponent(
                    normalizedRevisionId,
                  )}/stations/${encodeURIComponent(stationDetailTarget.sourceId)}/details`,
                ),
                {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    ...patch,
                    lineSourceId: normalizedLineSourceId,
                    stationSourceId: stationDetailTargetNode.stationSourceId,
                  }),
                },
              );
              const result = (await response.json()) as TransitDataRevision & { message?: string };
              if (!response.ok) {
                return result.message ?? '站内设施保存失败。';
              }
              applyRevision(result);
              setStationDetailTargetId(null);
              setStatus('站内设施已保存。');
              return null;
            } finally {
              setStationDialogBusy(false);
            }
          }}
        />
      ) : null}
    </VisualEditorShell>
  );
}

function insertEditorNode(
  nodes: EditorNode[],
  node: EditorNode,
  mode: InsertionMode,
  routeMode: 'road' | 'straight',
  roadGraph: VisualRoadGraph | undefined,
): EditorNode[] {
  if (mode === 'prepend') {
    return [node, ...nodes];
  }
  if (mode === 'append' || nodes.length === 0 || !node.coordinate) {
    return [...nodes, node];
  }

  let selectedIndex = nodes.length;
  let selectedLength = Number.POSITIVE_INFINITY;
  for (let index = 0; index <= nodes.length; index += 1) {
    const candidate = [...nodes.slice(0, index), node, ...nodes.slice(index)];
    const length = getEditorNodeSequenceLength(candidate, routeMode, roadGraph);
    if (length < selectedLength) {
      selectedIndex = index;
      selectedLength = length;
    }
  }
  return [...nodes.slice(0, selectedIndex), node, ...nodes.slice(selectedIndex)];
}

function getEditorNodeSequenceLength(
  nodes: EditorNode[],
  routeMode: 'road' | 'straight',
  roadGraph: VisualRoadGraph | undefined,
): number {
  const coordinates = nodes.flatMap((node) => (node.coordinate ? [node.coordinate] : []));
  const resolvedCoordinates = resolveVisualRouteCoordinates(coordinates, routeMode, roadGraph);
  return resolvedCoordinates.slice(1).reduce((total, coordinate, index) => {
    const previous = resolvedCoordinates[index];
    return previous ? total + coordinateDistance(previous, coordinate) : total;
  }, 0);
}

function findNearestEditorNodeScreenIndex(
  nodes: EditorNode[],
  clientX: number,
  clientY: number,
  view: MapView,
  viewportSize: ViewportSize,
  hitRadius: number,
): number {
  let selectedIndex = -1;
  let selectedDistance = hitRadius;
  nodes.forEach((node, index) => {
    if (!node.coordinate) {
      return;
    }
    const point = projectWorldCoordinate(node.coordinate, view, viewportSize);
    const distance = Math.hypot(point[0] - clientX, point[1] - clientY);
    if (distance <= selectedDistance) {
      selectedIndex = index;
      selectedDistance = distance;
    }
  });
  return selectedIndex;
}

/** 图层树行内操作：创建副本、上移、下移、移除，与 POI 几何工作台一致。 */
function TransitLayerRowActions({
  canMoveDown,
  canMoveUp,
  onDuplicate,
  onMoveDown,
  onMoveUp,
  onRemove,
}: Readonly<{
  canMoveDown: boolean;
  canMoveUp: boolean;
  onDuplicate: () => void;
  onMoveDown: () => void;
  onMoveUp: () => void;
  onRemove: () => void;
}>) {
  return (
    <EditorLayerRowActions
      actions={[
        {
          id: 'duplicate',
          icon: 'content_copy',
          label: '创建副本',
          title: '创建副本（Ctrl+D）',
          onClick: onDuplicate,
        },
        {
          id: 'move-up',
          icon: 'arrow_upward',
          label: '上移',
          title: '上移（Ctrl+[）',
          disabled: !canMoveUp,
          onClick: onMoveUp,
        },
        {
          id: 'move-down',
          icon: 'arrow_downward',
          label: '下移',
          title: '下移（Ctrl+]）',
          disabled: !canMoveDown,
          onClick: onMoveDown,
        },
        { id: 'remove', icon: 'close', label: '移除', title: '移除（Delete）', onClick: onRemove },
      ]}
    />
  );
}

/** 判断站点 POI 绑定是否发生变化，顺序即主 POI 顺序。 */
function areStationPoiBindingsEqual(
  left: NonNullable<EditorStationNode['boundPoiRefs']>,
  right: NonNullable<EditorStationNode['boundPoiRefs']>,
): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((ref, index) => {
    const other = right[index];
    if (!other) {
      return false;
    }
    return ref.markerId === other.markerId && ref.label === other.label;
  });
}

/** 站台层设施图标沿用地图页的设施资产；无资产时退回 Material Symbols。 */
function getStationFacilityIcon(facility: TransitStationFacilitySnapshot): {
  assetName?: string;
  symbol?: string;
} {
  if (facility.type === 'escalator_and_stairs') {
    return { assetName: 'escalator-and-stairs' };
  }
  if (facility.type === 'stairs') {
    return { assetName: facility.direction === 'downwards' ? 'stairs-down' : 'stairs-up' };
  }
  const assets: Record<string, string> = {
    toilet: 'restroom',
    mens_restroom: 'mens-restroom',
    womens_restroom: 'womens-restroom',
    family_restroom: 'family-restroom',
    accessible_restroom: 'accessible-restroom',
    third_restroom: 'family-restroom',
    elevator: 'accessible-elevator',
    stairs_two_way: 'stairs-two-way',
    escalator: 'escalator',
    nursing_room: 'nursing-room',
    waiting_room: 'waiting-room',
    wheelchair_lift: 'wheelchair-lift',
    wheelchair: 'wheelchair',
    subway: 'subway',
    passenger_service_center: 'passenger-service-center',
    ticket_machine: 'ticket-machine',
    meeting_point: 'meeting-point',
    exit: 'exit',
  };
  const assetName = assets[facility.type];
  if (assetName) {
    return { assetName };
  }
  const symbols: Record<string, string> = {
    platform_door: 'door_open',
    police: 'local_police',
    wheelchair: 'accessible',
  };
  return { symbol: symbols[facility.type] ?? 'location_on' };
}

/** 检查器里的「所属区间」：取节点前后最近的站点。 */
function describeNodeSegment(nodes: EditorNode[], nodeId: string): string {
  const index = nodes.findIndex((node) => node.id === nodeId);
  if (index < 0) {
    return '—';
  }
  const previous = [...nodes.slice(0, index)]
    .reverse()
    .find((node): node is EditorStationNode => node.kind === 'station');
  const next = nodes
    .slice(index + 1)
    .find((node): node is EditorStationNode => node.kind === 'station');
  if (previous && next) {
    return `${previous.name} → ${next.name}`;
  }
  if (next) {
    return `起点 · 接 ${next.name}`;
  }
  if (previous) {
    return `终点 · 接 ${previous.name}`;
  }
  return '尚未成区间';
}

function getCoordinateChainLength(coordinates: Array<[number, number]>): number {
  return coordinates.slice(1).reduce((total, coordinate, index) => {
    const previous = coordinates[index];
    return previous ? total + coordinateDistance(previous, coordinate) : total;
  }, 0);
}

function formatRouteLength(length: number): string {
  if (!Number.isFinite(length) || length <= 0) {
    return '—';
  }
  // 世界坐标以「格」为单位，与地图测距面板保持一致（1000 格 = 1 km）。
  return length >= 1000 ? `${(length / 1000).toFixed(2)} km` : `${Math.round(length)} 格`;
}

function decodeRouteIdentifier(value: string): string {
  let decoded = value;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) {
        break;
      }
      decoded = next;
    } catch {
      break;
    }
  }
  return decoded;
}

function buildInitialEditorNodes(line: TransitLine, stations: TransitStation[]): EditorNode[] {
  const stationById = new Map(stations.map((station) => [station.sourceId, station]));
  if (line.routeNodes?.length) {
    return line.routeNodes.map((node, index) =>
      node.kind === 'station'
        ? createExistingStationNode(stationById.get(node.stationSourceId), index, node)
        : {
            id: `waypoint-${index}`,
            kind: 'waypoint',
            coordinate: [node.x, node.z],
            direction: node.direction ?? 'both',
            boundPoiMarkerId: node.boundPoiMarkerId,
            boundPoiLabel: node.boundPoiLabel,
          },
    );
  }

  const stopByStationId = new Map(line.stops.map((stop) => [stop.stationSourceId, stop]));
  const pathBySegment = new Map(
    (line.segmentPaths ?? []).map((path) => [
      `${path.fromStationSourceId}\u0000${path.toStationSourceId}`,
      path,
    ]),
  );
  return line.stationSourceIds.flatMap((stationSourceId, index) => {
    const stationNode = createExistingStationNode(stationById.get(stationSourceId), index, {
      kind: 'station',
      stationSourceId,
      direction: stopByStationId.get(stationSourceId)?.oneWay ?? 'both',
    });
    const nextStationSourceId = line.stationSourceIds[index + 1];
    if (!nextStationSourceId) {
      return [stationNode];
    }
    const path = pathBySegment.get(`${stationSourceId}\u0000${nextStationSourceId}`);
    return [
      stationNode,
      ...(path?.waypoints ?? []).map((point, waypointIndex): EditorWaypointNode => ({
        id: `waypoint-${index}-${waypointIndex}`,
        kind: 'waypoint',
        coordinate: [point.x, point.z],
        direction: point.direction ?? 'both',
        boundPoiMarkerId: point.boundPoiMarkerId,
        boundPoiLabel: point.boundPoiLabel,
      })),
    ];
  });
}

function createExistingStationNode(
  station: TransitStation | undefined,
  index: number,
  routeNode?: Extract<TransitLineRouteNodeSnapshot, { kind: 'station' }>,
): EditorStationNode {
  const stationSourceId = routeNode?.stationSourceId ?? station?.sourceId ?? '';
  const boundPoiRefs = getStationBoundPoiRefs(station);
  const primaryBoundPoiRef = boundPoiRefs[0];
  return {
    id: `station-${stationSourceId || index}-${index}`,
    kind: 'station',
    stationSourceId,
    name: station?.name ?? stationSourceId,
    coordinate: station?.x !== undefined && station.z !== undefined ? [station.x, station.z] : null,
    direction: routeNode?.direction ?? 'both',
    operationStatus: station?.operationStatus ?? 'operating',
    boundPoiMarkerId: station?.boundPoiMarkerId ?? primaryBoundPoiRef?.markerId,
    boundPoiLabel: station?.boundPoiLabel ?? primaryBoundPoiRef?.label,
    boundPoiCategoryId: primaryBoundPoiRef?.categoryId,
    boundPoiRefs,
  };
}

function getStationBoundPoiRefs(
  station: TransitStation | undefined,
): NonNullable<TransitStation['boundPoiRefs']> {
  if (!station) {
    return [];
  }

  const refs = (station.boundPoiRefs ?? []).filter(
    (ref, index, all) =>
      Boolean(ref.markerId.trim() && ref.label.trim()) &&
      all.findIndex((item) => item.markerId === ref.markerId) === index,
  );
  const primaryMarkerId = station.boundPoiMarkerId?.trim();
  const primaryLabel = station.boundPoiLabel?.trim();
  if (primaryMarkerId && primaryLabel && !refs.some((ref) => ref.markerId === primaryMarkerId)) {
    refs.unshift({ markerId: primaryMarkerId, label: primaryLabel });
  }
  const primaryIndex = primaryMarkerId
    ? refs.findIndex((ref) => ref.markerId === primaryMarkerId)
    : -1;
  if (primaryIndex > 0) {
    const primaryRef = refs.splice(primaryIndex, 1)[0];
    if (primaryRef) {
      refs.unshift(primaryRef);
    }
  }
  return refs;
}

function mergeStationBoundPoiRef(
  refs: EditorStationNode['boundPoiRefs'],
  marker: MapMarkerSnapshot['markers'][number],
): NonNullable<TransitStation['boundPoiRefs']> {
  return [
    {
      markerId: marker.id,
      label: marker.label,
      categoryId: marker.categoryId,
    },
    ...(refs ?? []).filter((ref) => ref.markerId !== marker.id),
  ];
}

function buildEditorSegmentPaths(
  nodes: EditorNode[],
  routeMode: 'road' | 'straight',
  graph: VisualRoadGraph | undefined,
  operationStatusByKey: Record<
    string,
    NonNullable<TransitLineSegmentPathSnapshot['operationStatus']>
  >,
  travelMinutesByKey: Record<string, string>,
): TransitLineSegmentPathSnapshot[] {
  const stationIndexes = nodes.flatMap((node, index) => (node.kind === 'station' ? [index] : []));
  const paths: TransitLineSegmentPathSnapshot[] = [];
  for (let index = 1; index < stationIndexes.length; index += 1) {
    const startIndex = stationIndexes[index - 1];
    const endIndex = stationIndexes[index];
    if (startIndex === undefined || endIndex === undefined) {
      continue;
    }
    const segmentNodes = nodes.slice(startIndex, endIndex + 1);
    const from = segmentNodes[0];
    const to = segmentNodes.at(-1);
    const coordinates = segmentNodes.flatMap((node) => (node.coordinate ? [node.coordinate] : []));
    if (from?.kind !== 'station' || to?.kind !== 'station' || coordinates.length < 2) {
      continue;
    }
    const resolved = resolveVisualRouteCoordinates(coordinates, routeMode, graph);
    const authoredWaypointByCoordinate = new Map(
      segmentNodes.flatMap((node) =>
        node.kind === 'waypoint' ? [[coordinateKey(node.coordinate), node] as const] : [],
      ),
    );
    const waypoints = limitPathCoordinates(resolved.slice(1, -1), 256).map(([x, z]) => {
      const authored = authoredWaypointByCoordinate.get(coordinateKey([x, z]));
      return {
        x,
        z,
        direction: authored?.direction ?? 'both',
        boundPoiMarkerId: authored?.boundPoiMarkerId,
        boundPoiLabel: authored?.boundPoiLabel,
      };
    });
    const operationStatus =
      operationStatusByKey[segmentOperationStatusKey(from.stationSourceId, to.stationSourceId)] ??
      'operating';
    const travelMinutesText =
      travelMinutesByKey[
        segmentOperationStatusKey(from.stationSourceId, to.stationSourceId)
      ]?.trim();
    const travelMinutes = travelMinutesText ? Number(travelMinutesText) : undefined;
    if (waypoints.length > 0 || operationStatus !== 'operating' || travelMinutes !== undefined) {
      paths.push({
        fromStationSourceId: from.stationSourceId,
        toStationSourceId: to.stationSourceId,
        mode: routeMode,
        operationStatus,
        travelMinutes,
        waypoints,
      });
    }
  }
  return paths;
}

function segmentOperationStatusKey(leftStationId: string, rightStationId: string): string {
  return [leftStationId, rightStationId].sort().join('\u0000');
}

function limitPathCoordinates(
  coordinates: Array<[number, number]>,
  limit: number,
): Array<[number, number]> {
  if (coordinates.length <= limit) {
    return coordinates;
  }
  const step = (coordinates.length - 1) / (limit - 1);
  return Array.from({ length: limit }, (_, index) => coordinates[Math.round(index * step)]!).filter(
    (coordinate, index, values) =>
      index === 0 || coordinateKey(coordinate) !== coordinateKey(values[index - 1]!),
  );
}

function fitEditorView(nodes: EditorNode[], markers: MapMarkerSnapshot['markers']): MapView {
  const nodeCoordinates = nodes.flatMap((node) => (node.coordinate ? [node.coordinate] : []));
  const coordinates =
    nodeCoordinates.length > 0
      ? nodeCoordinates
      : markers.flatMap((marker) =>
          marker.geometry.type === 'Point' ? [marker.geometry.coordinates] : [],
        );
  if (coordinates.length === 0) {
    return defaultView;
  }
  const bounds = coordinates.reduce(
    (current, [x, z]) => ({
      minX: Math.min(current.minX, x),
      maxX: Math.max(current.maxX, x),
      minZ: Math.min(current.minZ, z),
      maxZ: Math.max(current.maxZ, z),
    }),
    {
      minX: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      minZ: Number.POSITIVE_INFINITY,
      maxZ: Number.NEGATIVE_INFINITY,
    },
  );
  const span = Math.max(320, bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ);
  return {
    centerX: (bounds.minX + bounds.maxX) / 2,
    centerZ: (bounds.minZ + bounds.maxZ) / 2,
    zoom: clampZoom(Math.log2(680 / span)),
  };
}

function buildEditorTiles(
  view: MapView,
  size: ViewportSize,
  tileTemplate: string | null,
  freshTileTemplate: string | null,
): VisibleTile[] {
  if ((!tileTemplate && !freshTileTemplate) || size.width <= 0 || size.height <= 0) {
    return [];
  }
  const scale = getEditorScale(view.zoom);
  const tileZoom = Math.min(3, Math.max(-7, Math.round(view.zoom)));
  const tileScale = 2 ** tileZoom;
  const tileSize = 256;
  const displaySize = tileSize * (scale / tileScale);
  const minWorldX = view.centerX - size.width / (2 * scale);
  const maxWorldX = view.centerX + size.width / (2 * scale);
  const minWorldZ = view.centerZ - size.height / (2 * scale);
  const maxWorldZ = view.centerZ + size.height / (2 * scale);
  const minTileX = Math.floor((minWorldX * tileScale) / tileSize) - 1;
  const maxTileX = Math.floor((maxWorldX * tileScale) / tileSize) + 1;
  const minTileZ = Math.floor((minWorldZ * tileScale) / tileSize) - 1;
  const maxTileZ = Math.floor((maxWorldZ * tileScale) / tileSize) + 1;
  const tiles: VisibleTile[] = [];
  for (let tileX = minTileX; tileX <= maxTileX; tileX += 1) {
    for (let tileZ = minTileZ; tileZ <= maxTileZ; tileZ += 1) {
      tiles.push({
        id: `${tileZoom}:${tileX}:${tileZ}`,
        displaySize,
        left: size.width / 2 + (tileX * tileSize * scale) / tileScale - view.centerX * scale,
        top: size.height / 2 + (tileZ * tileSize * scale) / tileScale - view.centerZ * scale,
        fallbackUrl: tileTemplate ? buildTileUrl(tileTemplate, tileZoom, tileX, tileZ) : undefined,
        freshUrl: freshTileTemplate
          ? buildTileUrl(freshTileTemplate, tileZoom, tileX, tileZ)
          : undefined,
      });
    }
  }
  return tiles;
}

function projectWorldCoordinate(
  coordinate: [number, number],
  view: MapView,
  size: ViewportSize,
): [number, number] {
  const scale = getEditorScale(view.zoom);
  return [
    size.width / 2 + (coordinate[0] - view.centerX) * scale,
    size.height / 2 + (coordinate[1] - view.centerZ) * scale,
  ];
}

function projectCoordinateChain(
  coordinates: Array<[number, number]>,
  view: MapView,
  size: ViewportSize,
): string | null {
  if (coordinates.length < 2 || size.width <= 0 || size.height <= 0) {
    return null;
  }
  return coordinates
    .map((coordinate) => projectWorldCoordinate(coordinate, view, size).join(','))
    .join(' ');
}

function unprojectClientPoint(
  clientX: number,
  clientY: number,
  rect: DOMRect,
  view: MapView,
): [number, number] {
  const scale = getEditorScale(view.zoom);
  return [
    view.centerX + (clientX - rect.left - rect.width / 2) / scale,
    view.centerZ + (clientY - rect.top - rect.height / 2) / scale,
  ];
}

function findNearestSnapMarker(
  coordinate: [number, number],
  markers: Array<
    MapMarkerSnapshot['markers'][number] & {
      geometry: { type: 'Point'; coordinates: [number, number] };
    }
  >,
  zoom: number,
  thresholdPixels: number,
) {
  const scale = getEditorScale(zoom);
  let selected: (typeof markers)[number] | undefined;
  let selectedDistance = Number.POSITIVE_INFINITY;
  for (const marker of markers) {
    const distance = coordinateDistance(coordinate, marker.geometry.coordinates);
    if (distance * scale <= thresholdPixels && distance < selectedDistance) {
      selected = marker;
      selectedDistance = distance;
    }
  }
  return selected;
}

function findStationBoundToMarker(
  stations: TransitStation[],
  marker: MapMarkerSnapshot['markers'][number],
): TransitStation | undefined {
  const normalizedLabel = normalizeText(marker.label);
  return stations.find(
    (station) =>
      station.boundPoiMarkerId === marker.id ||
      station.boundPoiRefs?.some((ref) => ref.markerId === marker.id) ||
      normalizeText(station.name) === normalizedLabel,
  );
}

function hasPointGeometry(
  marker: MapMarkerSnapshot['markers'][number],
): marker is MapMarkerSnapshot['markers'][number] & {
  geometry: { type: 'Point'; coordinates: [number, number] };
} {
  return marker.geometry.type === 'Point' && !isVisualRoadMarker(marker);
}

function isRoadLinearMarker(marker: MapMarkerSnapshot['markers'][number]): boolean {
  return (
    isVisualRoadMarker(marker) &&
    (marker.geometry.type === 'MultiPoint' || marker.geometry.type === 'LineString')
  );
}

function toMarkerIconUrl(fileName: string, baseUrl: string): string {
  if (/^https?:\/\//i.test(fileName)) {
    return fileName;
  }
  if (fileName.startsWith('/')) {
    return appPath(fileName);
  }
  if (!baseUrl) {
    // 没有图标基底地址时回退到圆形标记，避免渲染坏图。
    return '';
  }
  return new URL(fileName.replace(/^\/+/, ''), baseUrl).toString();
}

/** 出入口标记不显示文本标签，避免地图上标签过密。 */
function isStationAccessMarker(
  marker: Pick<
    MapMarkerSnapshot['markers'][number],
    'categoryId' | 'iconFileName' | 'label' | 'symbolIcon'
  >,
): boolean {
  const text = [marker.categoryId, marker.iconFileName, marker.symbolIcon, marker.label]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return /(entrance|exit|gate|出入口|入口|出口|正门|侧门|大门|后门|东门|西门|南门|北门)/i.test(
    text,
  );
}

function formatVisualMarkerLabel(label: string): string {
  const normalized = label.trim();
  return normalized.length > 12 ? `${normalized.slice(0, 12)}…` : normalized;
}

function getLinearMarkerCoordinates(
  marker: MapMarkerSnapshot['markers'][number],
): Array<[number, number]> {
  if (marker.geometry.type === 'LineString') {
    return marker.geometry.coordinates;
  }
  if (marker.geometry.type === 'MultiPoint') {
    return orderRoadPoints(marker.geometry.coordinates);
  }
  return [];
}

// 最近邻排序是 O(n²)，且每次渲染都会为每条道路重算；道路坐标数组来自状态且引用稳定，
// 用 WeakMap 缓存排序结果，避免拖动/缩放时反复做全量排序。
const orderedRoadCoordinatesCache = new WeakMap<
  ReadonlyArray<[number, number]>,
  Array<[number, number]>
>();

function orderRoadPoints(coordinates: Array<[number, number]>): Array<[number, number]> {
  if (coordinates.length < 3) {
    return coordinates;
  }
  const cached = orderedRoadCoordinatesCache.get(coordinates);
  if (cached) {
    return cached;
  }
  const remaining = [...coordinates];
  const first = remaining.reduce((selected, coordinate) =>
    coordinate[0] < selected[0] ? coordinate : selected,
  );
  remaining.splice(remaining.indexOf(first), 1);
  const ordered = [first];
  while (remaining.length > 0) {
    const previous = ordered.at(-1)!;
    const nearestIndex = remaining.reduce(
      (bestIndex, coordinate, index) =>
        coordinateDistance(previous, coordinate) <
        coordinateDistance(previous, remaining[bestIndex]!)
          ? index
          : bestIndex,
      0,
    );
    const next = remaining.splice(nearestIndex, 1)[0];
    if (next) {
      ordered.push(next);
    }
  }
  orderedRoadCoordinatesCache.set(coordinates, ordered);
  return ordered;
}

function defaultRouteMode(line: TransitLine): 'road' | 'straight' {
  return line.mode === 'bus' || line.mode === 'coach' ? 'road' : 'straight';
}

function buildTileUrl(template: string, zoom: number, tileX: number, tileZ: number): string {
  return template
    .replaceAll('{z}', String(zoom))
    .replaceAll('{xd}', String(Math.floor(tileX / 10)))
    .replaceAll('{yd}', String(Math.floor(tileZ / 10)))
    .replaceAll('{x}', String(tileX))
    .replaceAll('{y}', String(tileZ));
}

function getEditorScale(zoom: number): number {
  return 2 ** zoom;
}

function clampZoom(zoom: number): number {
  return Math.min(4, Math.max(-7, zoom));
}

function getEditorTouchDistance(left: EditorTouchPoint, right: EditorTouchPoint): number {
  return Math.hypot(left.clientX - right.clientX, left.clientY - right.clientY);
}

function getEditorTouchMidpoint(left: EditorTouchPoint, right: EditorTouchPoint): [number, number] {
  return [(left.clientX + right.clientX) / 2, (left.clientY + right.clientY) / 2];
}

function isPointVisible(point: [number, number], size: ViewportSize, padding: number): boolean {
  return (
    point[0] >= -padding &&
    point[0] <= size.width + padding &&
    point[1] >= -padding &&
    point[1] <= size.height + padding
  );
}

function roundCoordinate(coordinate: [number, number]): [number, number] {
  return [Math.round(coordinate[0] * 100) / 100, Math.round(coordinate[1] * 100) / 100];
}

function formatCoordinate(coordinate: [number, number]): string {
  return `${formatNumber(coordinate[0])}, ${formatNumber(coordinate[1])}`;
}

function formatNumber(value: number): string {
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

function coordinateDistance(left: [number, number], right: [number, number]): number {
  return Math.hypot(left[0] - right[0], left[1] - right[1]);
}

function coordinateKey(coordinate: [number, number]): string {
  return `${coordinate[0].toFixed(4)}:${coordinate[1].toFixed(4)}`;
}

function normalizeText(value: string): string {
  return value.replace(/[\s\u3000|｜]+/g, '').toLowerCase();
}

function createClientId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}
