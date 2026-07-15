'use client';

import type {
  CSSProperties,
  PointerEvent as ReactPointerEvent,
  WheelEvent as ReactWheelEvent,
} from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  MapMarkerSnapshot,
  TileProviderDescriptor,
  TransitDataRevision,
  TransitLineRouteNodeSnapshot,
  TransitLineSegmentPathSnapshot,
} from '@yct/contracts';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { appPath } from '../lib/app-paths';
import {
  buildVisualRoadGraph,
  isVisualRoadMarker,
  resolveVisualRoute,
  resolveVisualRouteCoordinates,
  type VisualRoadGraph,
} from '../lib/transit-line-visual-routing';

type TransitLine = TransitDataRevision['lines'][number];
type TransitStation = TransitDataRevision['stations'][number];
type EditorTool = 'pan' | 'station' | 'waypoint';
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
  coordinate: [number, number] | null;
  direction: Direction;
  draftClientId?: string;
  id: string;
  kind: 'station';
  name: string;
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
  kind: 'add' | 'pan';
  longPressTriggered: boolean;
  moved: boolean;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
  timerId?: number;
}

interface VisibleTile {
  displaySize: number;
  id: string;
  left: number;
  top: number;
  url: string;
}

interface EditorData {
  line: TransitLine;
  markers: MapMarkerSnapshot['markers'];
  revision: TransitDataRevision;
  tileTemplate: string | null;
}

const defaultView: MapView = { centerX: 0, centerZ: 0, zoom: -1 };
const longPressDurationMs = 560;

export function AdminTransitLineMapEditor({
  lineSourceId,
  revisionId,
}: Readonly<{ lineSourceId: string; revisionId: string }>) {
  const normalizedLineSourceId = decodeRouteIdentifier(lineSourceId);
  const normalizedRevisionId = decodeRouteIdentifier(revisionId);
  const router = useRouter();
  const stageRef = useRef<HTMLDivElement | null>(null);
  const gestureRef = useRef<PointerGesture | null>(null);
  const [data, setData] = useState<EditorData | null>(null);
  const [nodes, setNodes] = useState<EditorNode[]>([]);
  const [routeMode, setRouteMode] = useState<'road' | 'straight'>('straight');
  const [activeTool, setActiveTool] = useState<EditorTool>('pan');
  const [insertionMode, setInsertionMode] = useState<InsertionMode>('append');
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [controlDown, setControlDown] = useState(false);
  const [shiftDown, setShiftDown] = useState(false);
  const [mapView, setMapView] = useState<MapView>(defaultView);
  const [viewportSize, setViewportSize] = useState<ViewportSize>({ height: 0, width: 0 });
  const [status, setStatus] = useState('正在读取线路和地图数据');
  const [isSaving, setIsSaving] = useState(false);
  const [routePanelCollapsed, setRoutePanelCollapsed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [revisionResponse, markerResponse, tileResponse] = await Promise.all([
          fetch(appPath('/api/admin/transit/datasets'), { cache: 'no-store' }),
          fetch(appPath('/api/map/markers'), { cache: 'no-store' }),
          fetch(appPath('/api/map/tile-providers'), { cache: 'no-store' }),
        ]);
        const revisionData = (await revisionResponse.json()) as {
          items?: TransitDataRevision[];
          message?: string;
        };
        const markerData = (await markerResponse.json()) as {
          snapshot?: MapMarkerSnapshot;
          message?: string;
        };
        const tileData = (await tileResponse.json()) as { items?: TileProviderDescriptor[] };
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
        const tileTemplate = selectTileTemplate(tileData.items ?? []);
        if (cancelled) {
          return;
        }
        const initialNodes = buildInitialEditorNodes(line, revision.stations);
        setData({ line, markers, revision, tileTemplate });
        setNodes(initialNodes);
        setRouteMode(line.routeMode ?? defaultRouteMode(line));
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

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      setControlDown(event.ctrlKey);
      setShiftDown(event.shiftKey);
      if (isEditableKeyboardTarget(event.target)) {
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }
      const key = event.key.toLowerCase();
      const toolByKey: Partial<Record<string, EditorTool>> = {
        v: 'pan',
        s: 'station',
        r: 'waypoint',
      };
      const modeByKey: Partial<Record<string, InsertionMode>> = {
        '[': 'prepend',
        ']': 'append',
        '\\': 'nearest',
      };
      const nextTool = toolByKey[key];
      const nextMode = modeByKey[event.key];
      if (nextTool) {
        event.preventDefault();
        setActiveTool(nextTool);
      } else if (nextMode) {
        event.preventDefault();
        setInsertionMode(nextMode);
      }
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      setControlDown(event.ctrlKey);
      setShiftDown(event.shiftKey);
    };
    const handleBlur = () => {
      setControlDown(false);
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
  const roadGraph = useMemo(() => (data ? buildVisualRoadGraph(data.markers) : undefined), [data]);
  const controlCoordinates = useMemo(
    () => nodes.flatMap((node) => (node.coordinate ? [node.coordinate] : [])),
    [nodes],
  );
  const routeResolution = useMemo(
    () => resolveVisualRoute(controlCoordinates, routeMode, roadGraph),
    [controlCoordinates, roadGraph, routeMode],
  );
  const resolvedRouteCoordinates = routeResolution.coordinates;
  const routePreviewWarning =
    routeMode === 'road' && routeResolution.unresolvedSegmentCount > 0
      ? `${routeResolution.unresolvedSegmentCount} 个相邻节点暂时无法通过道路连通。`
      : '';
  const visibleTiles = useMemo(
    () => buildEditorTiles(mapView, viewportSize, data?.tileTemplate ?? null),
    [data?.tileTemplate, mapView, viewportSize],
  );
  const effectiveTool: EditorTool =
    controlDown && activeTool === 'station'
      ? 'waypoint'
      : controlDown && activeTool === 'waypoint'
        ? 'station'
        : activeTool;
  const effectiveSnapEnabled = shiftDown ? !snapEnabled : snapEnabled;

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

  const addNodeAtClientPoint = useCallback(
    (clientX: number, clientY: number) => {
      const stage = stageRef.current;
      if (!stage || !data || effectiveTool === 'pan') {
        return;
      }
      const rect = stage.getBoundingClientRect();
      const coordinate = unprojectClientPoint(clientX, clientY, rect, mapView);
      const snapMarker = effectiveSnapEnabled
        ? findNearestSnapMarker(coordinate, pointMarkers, mapView.zoom, 48)
        : undefined;
      const resolvedCoordinate = snapMarker?.geometry.coordinates ?? coordinate;

      if (effectiveTool === 'waypoint') {
        setNodes((current) =>
          insertEditorNode(
            current,
            {
              id: createClientId('waypoint'),
              kind: 'waypoint',
              coordinate: roundCoordinate(resolvedCoordinate),
              direction: 'both',
              boundPoiMarkerId: snapMarker?.id,
              boundPoiLabel: snapMarker?.label,
            },
            insertionMode,
            routeMode,
            roadGraph,
          ),
        );
        setStatus(snapMarker ? `已添加吸附到“${snapMarker.label}”的途径点。` : '已添加途径点。');
        return;
      }

      const existingStation = snapMarker
        ? findStationBoundToMarker(data.revision.stations, snapMarker)
        : undefined;
      if (existingStation) {
        setNodes((current) =>
          insertEditorNode(
            current,
            createExistingStationNode(existingStation, current.length),
            insertionMode,
            routeMode,
            roadGraph,
          ),
        );
        setStatus(`已添加站点“${existingStation.name}”。`);
        return;
      }
      const clientId = createClientId('station');
      setNodes((current) =>
        insertEditorNode(
          current,
          {
            id: clientId,
            kind: 'station',
            stationSourceId: `draft:${clientId}`,
            draftClientId: clientId,
            name: '',
            coordinate: roundCoordinate(resolvedCoordinate),
            direction: 'both',
            boundPoiMarkerId: snapMarker?.id,
            boundPoiLabel: snapMarker?.label,
            boundPoiCategoryId: snapMarker?.categoryId,
          },
          insertionMode,
          routeMode,
          roadGraph,
        ),
      );
      setStatus(
        snapMarker
          ? `已添加吸附到“${snapMarker.label}”的新站点，请在列表填写站名。`
          : '已添加新站点，请在列表填写站名。',
      );
    },
    [
      data,
      effectiveSnapEnabled,
      effectiveTool,
      insertionMode,
      mapView,
      pointMarkers,
      roadGraph,
      routeMode,
    ],
  );

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
    const gesture: PointerGesture = {
      centerX: mapView.centerX,
      centerZ: mapView.centerZ,
      kind: isPanGesture ? 'pan' : 'add',
      longPressTriggered: false,
      moved: false,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
    };
    if (event.pointerType === 'touch') {
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
    gestureRef.current = gesture;
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
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
    if (gesture.kind === 'pan') {
      const scale = getEditorScale(mapView.zoom);
      setMapView((current) => ({
        ...current,
        centerX: gesture.centerX - deltaX / scale,
        centerZ: gesture.centerZ - deltaY / scale,
      }));
    }
  };

  const finishPointerGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) {
      return;
    }
    if (gesture.timerId) {
      window.clearTimeout(gesture.timerId);
    }
    if (gesture.kind === 'add' && !gesture.moved && !gesture.longPressTriggered) {
      addNodeAtClientPoint(event.clientX, event.clientY);
    }
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

  const updateNode = (id: string, updater: (node: EditorNode) => EditorNode) => {
    setNodes((current) => current.map((node) => (node.id === id ? updater(node) : node)));
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

  const save = async () => {
    if (!data) {
      return;
    }
    const stationNodes = nodes.filter((node): node is EditorStationNode => node.kind === 'station');
    if (nodes[0]?.kind !== 'station' || nodes.at(-1)?.kind !== 'station') {
      setStatus('线路必须以站点开始并以站点结束。');
      return;
    }
    if (stationNodes.length < 2) {
      setStatus('线路至少需要两个站点。');
      return;
    }
    const unnamedDraft = stationNodes.find((node) => node.draftClientId && !node.name.trim());
    if (unnamedDraft) {
      setStatus('请先填写所有新站点的站名。');
      return;
    }
    if (stationNodes.some((node) => !node.coordinate)) {
      setStatus('线路中仍有站点缺少地图坐标。');
      return;
    }
    if (routeMode === 'road' && routeResolution.unresolvedSegmentCount > 0) {
      setStatus('沿路模式仍有节点无法通过道路连通，请补充途径点或切换为折线模式。');
      return;
    }

    const segmentPaths = buildEditorSegmentPaths(nodes, routeMode, roadGraph);
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
      name: data.line.name,
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
                boundPoiMarkerId: node.boundPoiMarkerId,
                boundPoiLabel: node.boundPoiLabel,
                boundPoiCategoryId: node.boundPoiCategoryId,
              },
            ]
          : [],
      ),
    };
    setIsSaving(true);
    setStatus('正在保存线路');
    try {
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
        return;
      }
      router.push(appPath('/admin/transit'));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '线路保存失败。');
    } finally {
      setIsSaving(false);
    }
  };

  if (!data) {
    return (
      <main className="transit-visual-editor is-loading">
        <span className="material-symbols-outlined" aria-hidden="true">
          route
        </span>
        <p>{status}</p>
        <Link href={appPath('/admin/transit')}>返回线路后台</Link>
      </main>
    );
  }

  return (
    <main className="transit-visual-editor">
      <header className="transit-visual-editor-header">
        <Link className="transit-visual-editor-cancel" href={appPath('/admin/transit')}>
          <span className="material-symbols-outlined" aria-hidden="true">
            close
          </span>
          <span>取消</span>
        </Link>
        <h1>{`编辑${data.line.name}`}</h1>
        <button type="button" disabled={isSaving} onClick={() => void save()}>
          <span className="material-symbols-outlined" aria-hidden="true">
            save
          </span>
          <span>保存</span>
        </button>
      </header>

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
            <img
              draggable={false}
              key={tile.id}
              src={tile.url}
              style={{
                height: tile.displaySize,
                left: tile.left,
                top: tile.top,
                width: tile.displaySize,
              }}
              alt=""
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
              points={projectCoordinateChain(resolvedRouteCoordinates, mapView, viewportSize) ?? ''}
              style={{ '--visual-line-color': data.line.color ?? '#2f9e85' } as CSSProperties}
            />
          ) : null}
          {pointMarkers.map((marker) => {
            const point = projectWorldCoordinate(
              marker.geometry.coordinates,
              mapView,
              viewportSize,
            );
            const modeMatched = isMarkerForTransitMode(marker, data.line.mode);
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
                <circle r={modeMatched ? 5 : 3.5} />
                {modeMatched ? (
                  <text x="9" y="4">
                    {formatVisualMarkerLabel(marker.label)}
                  </text>
                ) : null}
                <title>{marker.label}</title>
              </g>
            ) : null;
          })}
          {nodes.map((node, index) => {
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

      <aside
        className={`transit-visual-route-panel${routePanelCollapsed ? ' is-collapsed' : ''}`}
        aria-label="站点和途径点列表"
      >
        <div className="transit-visual-route-panel-heading">
          <div>
            <strong>{data.line.name}</strong>
            <span>{`${nodes.filter((node) => node.kind === 'station').length} 站 · ${nodes.filter((node) => node.kind === 'waypoint').length} 途径点`}</span>
          </div>
          <div className="transit-visual-route-panel-actions">
            <div className="segmented-control transit-visual-route-mode">
              <div>
                <button
                  className={routeMode === 'straight' ? 'is-active' : ''}
                  type="button"
                  aria-label="折线模式"
                  aria-pressed={routeMode === 'straight'}
                  title="折线模式"
                  onClick={() => setRouteMode('straight')}
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    polyline
                  </span>
                </button>
                <button
                  className={routeMode === 'road' ? 'is-active' : ''}
                  type="button"
                  aria-label="沿路模式"
                  aria-pressed={routeMode === 'road'}
                  title="沿路模式"
                  onClick={() => setRouteMode('road')}
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    route
                  </span>
                </button>
              </div>
            </div>
            <button
              className="transit-visual-route-panel-toggle"
              type="button"
              aria-expanded={!routePanelCollapsed}
              aria-label={routePanelCollapsed ? '展开节点列表' : '收起节点列表'}
              title={routePanelCollapsed ? '展开节点列表' : '收起节点列表'}
              onClick={() => setRoutePanelCollapsed((current) => !current)}
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                {routePanelCollapsed ? 'expand_more' : 'expand_less'}
              </span>
            </button>
          </div>
        </div>
        {routePanelCollapsed ? null : (
          <div className="transit-visual-node-list">
            {nodes.map((node, index) => (
              <div className={`transit-visual-node-row is-${node.kind}`} key={node.id}>
                <span className="material-symbols-outlined" aria-hidden="true">
                  {node.kind === 'station' ? 'location_on' : 'add_road'}
                </span>
                <div className="transit-visual-node-main">
                  {node.kind === 'station' && node.draftClientId ? (
                    <input
                      value={node.name}
                      placeholder="填写新站点名称"
                      aria-label={`第 ${index + 1} 个新站点名称`}
                      onChange={(event) =>
                        updateNode(node.id, (current) =>
                          current.kind === 'station'
                            ? { ...current, name: event.currentTarget.value }
                            : current,
                        )
                      }
                    />
                  ) : (
                    <strong>{node.kind === 'station' ? node.name : `途径点 ${index + 1}`}</strong>
                  )}
                  <span>
                    {node.coordinate ? formatCoordinate(node.coordinate) : '缺少坐标'}
                    {node.boundPoiLabel ? ` · ${node.boundPoiLabel}` : ''}
                  </span>
                </div>
                <select
                  value={node.direction}
                  aria-label={`${node.kind === 'station' ? '站点' : '途径点'}方向`}
                  onChange={(event) =>
                    updateNode(node.id, (current) => ({
                      ...current,
                      direction: event.currentTarget.value as Direction,
                    }))
                  }
                >
                  <option value="both">双向</option>
                  <option value="up">仅上行</option>
                  <option value="down">仅下行</option>
                </select>
                <div className="transit-visual-node-actions">
                  <button
                    type="button"
                    title="上移"
                    aria-label="上移"
                    disabled={index === 0}
                    onClick={() => moveNode(index, -1)}
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">
                      arrow_upward
                    </span>
                  </button>
                  <button
                    type="button"
                    title="下移"
                    aria-label="下移"
                    disabled={index === nodes.length - 1}
                    onClick={() => moveNode(index, 1)}
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">
                      arrow_downward
                    </span>
                  </button>
                  <button
                    type="button"
                    title="删除"
                    aria-label="删除"
                    onClick={() =>
                      setNodes((current) => current.filter((item) => item.id !== node.id))
                    }
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">
                      close
                    </span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </aside>

      <nav className="transit-visual-toolbar" aria-label="地图编辑工具">
        {(
          [
            ['pan', 'pan_tool', '拖移工具（V）'],
            ['station', 'add_location_alt', '站点工具（S）'],
            ['waypoint', 'add_road', '途径点工具（R）'],
          ] as const
        ).map(([tool, icon, label]) => (
          <button
            className={activeTool === tool ? 'is-active' : ''}
            type="button"
            aria-label={label}
            aria-pressed={activeTool === tool}
            title={label}
            key={tool}
            onClick={() => setActiveTool(tool)}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              {icon}
            </span>
          </button>
        ))}
        <span className="transit-visual-toolbar-divider" aria-hidden="true" />
        {(
          [
            ['prepend', 'first_page', '反向追加模式（[）'],
            ['append', 'last_page', '追加模式（]）'],
            ['nearest', 'conversion_path', '就近模式（\\）'],
          ] as const
        ).map(([mode, icon, label]) => (
          <button
            className={insertionMode === mode ? 'is-active' : ''}
            type="button"
            aria-label={label}
            aria-pressed={insertionMode === mode}
            title={label}
            key={mode}
            onClick={() => setInsertionMode(mode)}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              {icon}
            </span>
          </button>
        ))}
        <span className="transit-visual-toolbar-divider" aria-hidden="true" />
        <button
          className={snapEnabled ? 'is-active' : ''}
          type="button"
          aria-label="切换吸附"
          aria-pressed={snapEnabled}
          title="切换吸附（按住 Shift 临时反转）"
          onClick={() => setSnapEnabled((current) => !current)}
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            location_searching
          </span>
        </button>
      </nav>
      {status || routePreviewWarning ? (
        <p className="transit-visual-status" role="status">
          {status || routePreviewWarning}
        </p>
      ) : null}
    </main>
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

function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName))
  );
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
  return {
    id: `station-${stationSourceId || index}-${index}`,
    kind: 'station',
    stationSourceId,
    name: station?.name ?? stationSourceId,
    coordinate: station?.x !== undefined && station.z !== undefined ? [station.x, station.z] : null,
    direction: routeNode?.direction ?? 'both',
    boundPoiMarkerId: station?.boundPoiMarkerId,
    boundPoiLabel: station?.boundPoiLabel,
    boundPoiCategoryId: station?.boundPoiRefs?.[0]?.categoryId,
  };
}

function buildEditorSegmentPaths(
  nodes: EditorNode[],
  routeMode: 'road' | 'straight',
  graph: VisualRoadGraph | undefined,
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
    if (waypoints.length > 0) {
      paths.push({
        fromStationSourceId: from.stationSourceId,
        toStationSourceId: to.stationSourceId,
        mode: routeMode,
        waypoints,
      });
    }
  }
  return paths;
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
): VisibleTile[] {
  if (!tileTemplate || size.width <= 0 || size.height <= 0) {
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
        url: buildTileUrl(tileTemplate, tileZoom, tileX, tileZ),
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

function isMarkerForTransitMode(
  marker: MapMarkerSnapshot['markers'][number],
  mode: TransitLine['mode'],
): boolean {
  const source = [marker.categoryId, marker.iconFileName, marker.symbolIcon]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (isVisualRoadMarker(marker)) {
    return false;
  }
  switch (mode) {
    case 'metro':
      return /metro|subway/.test(source);
    case 'tram':
      return /tram|light[-_ ]?rail/.test(source);
    case 'bus':
      return /bus|stop/.test(source);
    case 'coach':
      return /coach|bus[-_ ]?station|terminal/.test(source);
    case 'ferry':
      return /ferry|port|pier/.test(source);
    case 'railway':
      return /railway|rail[-_ ]?station|train/.test(source);
    case 'custom':
      return false;
  }
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

function orderRoadPoints(coordinates: Array<[number, number]>): Array<[number, number]> {
  if (coordinates.length < 3) {
    return coordinates;
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
  return ordered;
}

function selectTileTemplate(providers: TileProviderDescriptor[]): string | null {
  return (
    providers.find((provider) => provider.sourceKind === 'safe-https-static')?.tileTemplate ??
    providers.find((provider) => provider.id === 'lindong-unmined-static')?.tileTemplate ??
    providers[0]?.tileTemplate ??
    null
  );
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
