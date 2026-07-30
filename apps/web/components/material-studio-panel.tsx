'use client';

import { useEffect, useMemo, useState } from 'react';
import { appPath } from '../lib/app-paths';
import {
  publishMaterialStudioActionBlocked,
  publishMaterialStudioState,
  subscribeMaterialStudioActions,
} from '../lib/client-material-studio-events';
import { METRO_WAYFINDING_TEMPLATE_ID } from '../lib/metro-wayfinding';
import { EmbeddedMapLocationPicker } from './embedded-map-location-picker';
import { MetroWayfindingEditor } from './metro-wayfinding-editor';

type MaterialFamily = 'road_sign' | 'address_sign' | 'bus_stop' | 'custom';
type MaterialServerSource = 'transit_line' | 'transit_station' | 'map_location' | 'road_coordinate';

interface MaterialField {
  key: string;
  label: string;
  kind: 'text' | 'number' | 'select' | 'color';
  required?: boolean;
  defaultValue?: string;
  userEditable?: boolean;
  serverOverride?: boolean;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  options?: Array<{ value: string; label: string }>;
}

interface MaterialCanvas {
  widthM: number;
  heightM: number;
  pxPerMeter: number;
  alignToTile: boolean;
  tileSizePx: number;
}

interface MaterialTemplate {
  version: number;
  title: string;
  description?: string;
  family: MaterialFamily;
  fields: MaterialField[];
  defaultCanvas: MaterialCanvas;
}

interface PublishedMaterialTemplate {
  id: string;
  template: MaterialTemplate;
}

interface TransitLineOption {
  id: string;
  name: string;
  mode: string;
  color?: string;
  operator?: string;
  stationCount: number;
  stations: Array<{
    stationSourceId: string;
    stationName: string;
  }>;
}

interface TransitStationLineOption {
  id: string;
  lineId: string;
  travelDirection: 'forward' | 'reverse';
  name: string;
  operator?: string;
  firstLastBus: string;
  destinationName: string;
  stationNames: string[];
  currentStationIndex: number;
  nextStationName?: string;
  direction: 'east' | 'west' | 'north' | 'south' | 'unknown';
  isOriginAtStation: boolean;
  isTerminalAtStation: boolean;
}

interface TransitStationOption {
  markerId: string;
  stationSourceId: string;
  stationName: string;
  coordinate?: [number, number];
  directionOptions: Array<{
    value: 'east' | 'west' | 'north' | 'south';
    label: string;
  }>;
  lines: TransitStationLineOption[];
}

interface MaterialLocationOption {
  id: string;
  label: string;
  categoryId: string;
  address?: string;
  coordinate?: [number, number];
}

interface MaterialDraft {
  id: string;
  templateId: string;
  templateVersion: number;
  input: Record<string, string>;
  canvas: MaterialCanvas;
  status: 'draft' | 'pending_review' | 'approved' | 'rejected';
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  submittedAt?: string;
  reviewedAt?: string;
  reviewReason?: string;
}

type StudioMode = 'manual' | 'server';

const MATERIAL_PREVIEW_DIALOG_MEDIA_QUERY = '(max-width: 959px)';

export function MaterialStudioPanel({
  studioId,
  title,
  families,
  serverSource,
  serverSources,
  serverFamilies,
  includedTemplateIds,
}: Readonly<{
  studioId: string;
  title: string;
  families: MaterialFamily[];
  serverSource?: MaterialServerSource;
  serverSources?: Partial<Record<MaterialFamily, MaterialServerSource>>;
  serverFamilies?: MaterialFamily[];
  includedTemplateIds?: string[];
}>) {
  const [items, setItems] = useState<PublishedMaterialTemplate[]>([]);
  const [drafts, setDrafts] = useState<MaterialDraft[]>([]);
  const [transitLines, setTransitLines] = useState<TransitLineOption[]>([]);
  const [transitStations, setTransitStations] = useState<TransitStationOption[]>([]);
  const [locations, setLocations] = useState<MaterialLocationOption[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [mode, setMode] = useState<StudioMode>('manual');
  const [input, setInput] = useState<Record<string, string>>({});
  const [canvas, setCanvas] = useState<MaterialCanvas | null>(null);
  const [selectedLineId, setSelectedLineId] = useState('');
  const [selectedStationSourceId, setSelectedStationSourceId] = useState('');
  const [selectedTransitStationMarkerId, setSelectedTransitStationMarkerId] = useState('');
  const [transitDirection, setTransitDirection] = useState<'east' | 'west' | 'north' | 'south'>(
    'east',
  );
  const [transitTerminalRole, setTransitTerminalRole] = useState<'origin' | 'terminal'>('origin');
  const [selectedTransitLineIds, setSelectedTransitLineIds] = useState<string[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState('');
  const [locationQuery, setLocationQuery] = useState('');
  const [roadCoordinate, setRoadCoordinate] = useState<[number, number] | null>(null);
  const [tileTemplate, setTileTemplate] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewSize, setPreviewSize] = useState<{ width: number; height: number } | null>(null);
  const [isPreviewDialogViewport, setIsPreviewDialogViewport] = useState(false);
  const [isSingleColumnViewport, setIsSingleColumnViewport] = useState(false);
  const [isPreviewDialogOpen, setIsPreviewDialogOpen] = useState(false);
  const [workspaceBlockMessage, setWorkspaceBlockMessage] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  const templates = useMemo(
    () =>
      items.filter(
        (item) =>
          families.includes(item.template.family) ||
          includedTemplateIds?.includes(item.id) === true,
      ),
    [families, includedTemplateIds, items],
  );
  const selected = templates.find((item) => item.id === selectedTemplateId) ?? templates[0];
  const activeCanvas = canvas ?? selected?.template.defaultCanvas ?? null;
  const isMetroWayfinding = selected?.id === METRO_WAYFINDING_TEMPLATE_ID;
  const serverOverrideFields =
    selected?.template.fields.filter(
      (field) => field.serverOverride && field.userEditable !== false,
    ) ?? [];
  const existingDraft = drafts
    .filter(
      (draft) =>
        draft.templateId === selected?.id &&
        draft.templateVersion === selected?.template.version &&
        draft.status === 'approved',
    )
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
  const templateVersionByKey = useMemo(() => {
    const map = new Map<string, MaterialTemplate>();
    for (const item of items) {
      map.set(`${item.id}:${item.template.version}`, item.template);
    }
    return map;
  }, [items]);
  const historyDrafts = useMemo(
    () => [...drafts].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    [drafts],
  );
  const selectedLine = transitLines.find((line) => line.id === selectedLineId);
  const metroLineColorOptions = useMemo(
    () =>
      transitLines
        .filter(
          (line) =>
            line.mode === 'metro' && Boolean(line.color && /^#[0-9A-Fa-f]{6}$/.test(line.color)),
        )
        .map((line) => ({
          value: line.color!.toUpperCase(),
          label: `${line.name} · ${line.color!.toUpperCase()}`,
        })),
    [transitLines],
  );
  const selectedTransitStation = transitStations.find(
    (station) => station.markerId === selectedTransitStationMarkerId,
  );
  const activeServerSource = selected
    ? (serverSources?.[selected.template.family] ?? serverSource)
    : serverSource;
  const canUseServerSource = Boolean(
    activeServerSource &&
    selected &&
    (!serverFamilies || serverFamilies.includes(selected.template.family)),
  );
  const visibleLocations = useMemo(() => {
    const query = locationQuery.trim().toLocaleLowerCase();
    return locations
      .filter((location) => {
        if (!query) {
          return true;
        }
        return [location.label, location.categoryId, location.address]
          .filter(Boolean)
          .join(' ')
          .toLocaleLowerCase()
          .includes(query);
      })
      .slice(0, 100);
  }, [locationQuery, locations]);
  const requiresTransitTerminalRole = Boolean(
    selected?.template.fields.some((field) => field.key === 'terminalRole'),
  );
  const selectableTransitLines = useMemo(
    () =>
      (selectedTransitStation?.lines ?? []).filter(
        (line) =>
          line.direction === transitDirection &&
          (!requiresTransitTerminalRole ||
            (transitTerminalRole === 'origin' ? line.isOriginAtStation : line.isTerminalAtStation)),
      ),
    [requiresTransitTerminalRole, selectedTransitStation, transitDirection, transitTerminalRole],
  );
  const maximumTransitLineCount = useMemo(() => {
    const slots = selected?.template.fields
      .map((field) => field.key.match(/^route(\d+)Number$/)?.[1])
      .filter((value): value is string => Boolean(value))
      .map(Number);
    return slots?.length ? Math.max(...slots) : 1;
  }, [selected?.id, selected?.template.fields]);
  const usesSingleTransitLineSelection = maximumTransitLineCount === 1;

  const loadWorkspace = async () => {
    try {
      const templateResponse = await fetch(appPath('/api/materials/templates'), {
        cache: 'no-store',
      });
      const templateData = (await templateResponse.json()) as {
        items?: PublishedMaterialTemplate[];
        message?: string;
      };
      if (!templateResponse.ok) {
        setWorkspaceBlockMessage(templateData.message ?? '请先登录后使用物料工作台。');
        return;
      }

      const nextItems = templateData.items ?? [];
      setItems(nextItems);
      const firstTemplate = nextItems.find(
        (item) =>
          families.includes(item.template.family) ||
          includedTemplateIds?.includes(item.id) === true,
      );
      if (firstTemplate) {
        setSelectedTemplateId((current) => current || firstTemplate.id);
      }

      const pendingRequests: Array<Promise<void>> = [
        fetch(appPath('/api/materials/drafts'), { cache: 'no-store' })
          .then(async (response) => {
            const data = (await response.json()) as { items?: MaterialDraft[] };
            if (response.ok) {
              setDrafts(data.items ?? []);
            }
          })
          .catch(() => undefined),
      ];
      const requiresTransitLineList =
        serverSource === 'transit_line' ||
        Object.values(serverSources ?? {}).includes('transit_line') ||
        nextItems.some(
          (item) =>
            (families.includes(item.template.family) ||
              includedTemplateIds?.includes(item.id) === true) &&
            item.id === METRO_WAYFINDING_TEMPLATE_ID,
        );
      if (requiresTransitLineList) {
        pendingRequests.push(
          fetch(appPath('/api/materials/transit-lines'), { cache: 'no-store' })
            .then(async (response) => {
              const data = (await response.json()) as { items?: TransitLineOption[] };
              if (response.ok) {
                const lines = data.items ?? [];
                setTransitLines(lines);
                setSelectedLineId((current) => current || lines[0]?.id || '');
                setSelectedStationSourceId(
                  (current) => current || lines[0]?.stations[0]?.stationSourceId || '',
                );
              }
            })
            .catch(() => undefined),
        );
      }
      if (
        serverSource === 'transit_station' ||
        Object.values(serverSources ?? {}).includes('transit_station')
      ) {
        pendingRequests.push(
          fetch(appPath('/api/materials/transit-stations'), { cache: 'no-store' })
            .then(async (response) => {
              const data = (await response.json()) as { items?: TransitStationOption[] };
              if (response.ok) {
                const stations = data.items ?? [];
                setTransitStations(stations);
                setSelectedTransitStationMarkerId(
                  (current) => current || stations[0]?.markerId || '',
                );
              }
            })
            .catch(() => undefined),
        );
      }
      if (
        serverSource === 'map_location' ||
        serverSource === 'road_coordinate' ||
        Object.values(serverSources ?? {}).some(
          (source) => source === 'map_location' || source === 'road_coordinate',
        )
      ) {
        pendingRequests.push(
          fetch(appPath('/api/materials/locations'), { cache: 'no-store' })
            .then(async (response) => {
              const data = (await response.json()) as { items?: MaterialLocationOption[] };
              if (response.ok) {
                const nextLocations = data.items ?? [];
                setLocations(nextLocations);
                setSelectedLocationId((current) => current || nextLocations[0]?.id || '');
              }
            })
            .catch(() => undefined),
        );
        pendingRequests.push(
          fetch(appPath('/api/map/tile-providers'), { cache: 'no-store' })
            .then(async (response) => {
              const data = (await response.json()) as {
                items?: Array<{ sourceKind?: string; tileTemplate?: string }>;
              };
              if (!response.ok) {
                return;
              }
              const provider = (data.items ?? []).find(
                (item) => item.sourceKind === 'safe-https-static' && item.tileTemplate,
              );
              setTileTemplate(provider?.tileTemplate ?? null);
            })
            .catch(() => undefined),
        );
      }
      await Promise.all(pendingRequests);
      setWorkspaceBlockMessage(firstTemplate ? '' : '当前没有可用模板。');
    } catch {
      setItems([]);
      setWorkspaceBlockMessage('物料工作台暂时不可用。');
    }
  };

  useEffect(() => {
    void loadWorkspace();
  }, []);

  useEffect(() => {
    if (!selected) {
      return;
    }
    setInput(
      Object.fromEntries(
        selected.template.fields.map((field) => [field.key, field.defaultValue ?? '']),
      ),
    );
    setCanvas({
      ...selected.template.defaultCanvas,
      pxPerMeter: selected.template.defaultCanvas.tileSizePx,
    });
  }, [selected?.id, selected?.template.version]);

  useEffect(() => {
    if (!canUseServerSource && mode === 'server') {
      setMode('manual');
    }
  }, [canUseServerSource, mode]);

  useEffect(() => {
    if (activeServerSource === 'road_coordinate' && !roadCoordinate) {
      const initialCoordinate = locations.find((location) => location.coordinate)?.coordinate;
      if (initialCoordinate) {
        setRoadCoordinate(initialCoordinate);
      }
    }
  }, [activeServerSource, locations, roadCoordinate]);

  useEffect(() => {
    const selectableIds = new Set(selectableTransitLines.map((line) => line.id));
    setSelectedTransitLineIds((current) => {
      const retained = current.filter((lineId) => selectableIds.has(lineId));
      if (retained.length > 0) {
        return retained.slice(0, maximumTransitLineCount);
      }
      return selectableTransitLines.slice(0, maximumTransitLineCount).map((line) => line.id);
    });
  }, [maximumTransitLineCount, selectableTransitLines]);

  useEffect(() => {
    const options = selectedTransitStation?.directionOptions ?? [];
    if (options.length && !options.some((option) => option.value === transitDirection)) {
      setTransitDirection(options[0]!.value);
    }
  }, [selectedTransitStation, transitDirection]);

  useEffect(
    () => () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    },
    [previewUrl],
  );

  useEffect(() => {
    const previewDialogQuery = window.matchMedia(MATERIAL_PREVIEW_DIALOG_MEDIA_QUERY);
    const singleColumnQuery = window.matchMedia('(max-width: 720px)');
    const syncViewport = () => {
      setIsPreviewDialogViewport(previewDialogQuery.matches);
      setIsSingleColumnViewport(singleColumnQuery.matches);
      if (!previewDialogQuery.matches) {
        setIsPreviewDialogOpen(false);
      }
    };

    syncViewport();
    previewDialogQuery.addEventListener('change', syncViewport);
    singleColumnQuery.addEventListener('change', syncViewport);
    return () => {
      previewDialogQuery.removeEventListener('change', syncViewport);
      singleColumnQuery.removeEventListener('change', syncViewport);
    };
  }, []);

  useEffect(() => {
    if (!isPreviewDialogOpen) {
      return;
    }
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsPreviewDialogOpen(false);
      }
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [isPreviewDialogOpen]);

  const selectTemplate = (templateId: string) => {
    setSelectedTemplateId(templateId);
    clearPreview();
  };

  const clearPreview = () => {
    setPreviewUrl(null);
    setPreviewSize(null);
    setIsPreviewDialogOpen(false);
  };

  const updateCanvas = <TKey extends keyof MaterialCanvas>(
    key: TKey,
    value: MaterialCanvas[TKey],
  ) => {
    setCanvas((current) => {
      if (!current) {
        return current;
      }
      if (key === 'tileSizePx') {
        const resolution = Number(value);
        return { ...current, pxPerMeter: resolution, tileSizePx: resolution };
      }
      return { ...current, [key]: value };
    });
    clearPreview();
  };

  const downloadBlob = async (response: Response) => {
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = resolveMaterialDownloadFileName(
      response,
      `${selected?.template.title ?? title}.png`,
    );
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
  };

  const showPreviewBlob = async (response: Response) => {
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    setPreviewUrl(objectUrl);
    setPreviewSize({
      width: Number(response.headers.get('X-Yct-Material-Preview-Width')) || 0,
      height: Number(response.headers.get('X-Yct-Material-Preview-Height')) || 0,
    });
    if (window.matchMedia(MATERIAL_PREVIEW_DIALOG_MEDIA_QUERY).matches) {
      setIsPreviewDialogOpen(true);
    }
  };

  const buildServerSource = () => {
    if (activeServerSource === 'transit_line' && selectedLineId) {
      return {
        kind: 'transit_line' as const,
        lineId: selectedLineId,
        stationSourceId: selectedStationSourceId || undefined,
      };
    }
    if (activeServerSource === 'transit_station' && selectedTransitStationMarkerId) {
      return {
        kind: 'transit_station' as const,
        stationMarkerId: selectedTransitStationMarkerId,
        direction: transitDirection,
        lineIds: selectedTransitLineIds,
        terminalRole: requiresTransitTerminalRole ? transitTerminalRole : undefined,
      };
    }
    if (activeServerSource === 'map_location' && selectedLocationId) {
      return { kind: 'map_location' as const, locationId: selectedLocationId };
    }
    if (activeServerSource === 'road_coordinate' && roadCoordinate) {
      return { kind: 'road_coordinate' as const, x: roadCoordinate[0], z: roadCoordinate[1] };
    }
    return undefined;
  };

  const buildServerOverrides = () =>
    Object.fromEntries(
      serverOverrideFields.map((field) => [
        field.key,
        input[field.key] ?? field.defaultValue ?? '',
      ]),
    );

  const blockAction = (message: string) => {
    publishMaterialStudioActionBlocked({ studioId, message });
  };

  const getServerSelectionBlockMessage = (): string | null => {
    if (activeServerSource === 'transit_station' && !selectedTransitStationMarkerId) {
      return '请先选择服务器公交站。';
    }
    if (activeServerSource === 'transit_station' && !selectedTransitLineIds.length) {
      return '请先选择至少一条同方向线路。';
    }
    if (activeServerSource === 'transit_line' && !selectedLineId) {
      return '请先选择服务器线路。';
    }
    if (activeServerSource === 'map_location' && !selectedLocationId) {
      return '请先选择服务器地点。';
    }
    if (activeServerSource === 'road_coordinate' && !roadCoordinate) {
      return '请先选择路牌安装坐标。';
    }
    return null;
  };

  const requestPreview = async () => {
    if (!selected || !activeCanvas) {
      blockAction(workspaceBlockMessage || '当前没有可用模板。');
      return;
    }
    const selectionBlockMessage = mode === 'server' ? getServerSelectionBlockMessage() : null;
    if (selectionBlockMessage) {
      blockAction(selectionBlockMessage);
      return;
    }
    const source = mode === 'server' ? buildServerSource() : undefined;
    if (mode === 'server' && !source) {
      blockAction('请先选择服务器数据。');
      return;
    }
    setIsBusy(true);
    try {
      const response = await fetch(appPath('/api/materials/previews'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          mode === 'server'
            ? {
                mode: 'server',
                templateId: selected.id,
                templateVersion: selected.template.version,
                canvas: activeCanvas,
                source,
                input: buildServerOverrides(),
              }
            : {
                mode: 'manual',
                templateId: selected.id,
                templateVersion: selected.template.version,
                canvas: activeCanvas,
                input,
              },
        ),
      });
      if (!response.ok) {
        const data = (await response.json()) as { message?: string };
        blockAction(data.message ?? '生成预览失败。');
        return;
      }
      await showPreviewBlob(response);
    } catch {
      blockAction('生成预览时发生网络错误。');
    } finally {
      setIsBusy(false);
    }
  };

  const submitManualDraft = async () => {
    if (!selected || !activeCanvas) {
      blockAction(workspaceBlockMessage || '当前没有可提交的模板。');
      return;
    }
    setIsBusy(true);
    try {
      const createResponse = await fetch(appPath('/api/materials/drafts'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: selected.id,
          templateVersion: selected.template.version,
          input,
          canvas: activeCanvas,
        }),
      });
      const created = (await createResponse.json()) as MaterialDraft & { message?: string };
      if (!createResponse.ok || !created.id) {
        blockAction(created.message ?? '无法保存自定义物料。');
        return;
      }
      const submitResponse = await fetch(
        appPath(`/api/materials/drafts/${encodeURIComponent(created.id)}/submit`),
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
      );
      const submitted = (await submitResponse.json()) as MaterialDraft & { message?: string };
      if (!submitResponse.ok) {
        blockAction(submitted.message ?? '物料已保存，但提交审核失败。');
        return;
      }
      setDrafts((current) => [submitted, ...current.filter((item) => item.id !== submitted.id)]);
    } catch {
      blockAction('提交审核时发生网络错误。');
    } finally {
      setIsBusy(false);
    }
  };

  const exportDraft = async (draft: MaterialDraft) => {
    setIsBusy(true);
    try {
      const response = await fetch(appPath('/api/materials/exports'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'custom', draftId: draft.id }),
      });
      if (!response.ok) {
        const data = (await response.json()) as { message?: string };
        blockAction(data.message ?? '下载物料失败。');
        return;
      }
      await downloadBlob(response);
    } catch {
      blockAction('下载物料时发生网络错误。');
    } finally {
      setIsBusy(false);
    }
  };

  const exportManualDraft = async () => {
    if (!existingDraft) {
      blockAction('当前模板尚无审核通过的自定义物料，请先提交审核。');
      return;
    }
    await exportDraft(existingDraft);
  };

  const exportFromServer = async () => {
    const selectionBlockMessage = getServerSelectionBlockMessage();
    if (selectionBlockMessage) {
      blockAction(selectionBlockMessage);
      return;
    }
    const source = buildServerSource();
    if (!selected || !activeCanvas || !source) {
      blockAction('请先选择模板和服务器数据。');
      return;
    }
    setIsBusy(true);
    try {
      const response = await fetch(appPath('/api/materials/exports'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'server',
          templateId: selected.id,
          templateVersion: selected.template.version,
          canvas: activeCanvas,
          source,
          input: buildServerOverrides(),
        }),
      });
      if (!response.ok) {
        const data = (await response.json()) as { message?: string };
        blockAction(data.message ?? '下载物料失败。');
        return;
      }
      await downloadBlob(response);
    } catch {
      blockAction('下载物料时发生网络错误。');
    } finally {
      setIsBusy(false);
    }
  };

  useEffect(() => {
    publishMaterialStudioState({
      studioId,
      mode,
      hasPreview: Boolean(previewUrl),
      isBusy,
    });
  }, [isBusy, mode, previewUrl, studioId]);

  useEffect(() =>
    subscribeMaterialStudioActions(studioId, (action) => {
      if (isBusy) {
        blockAction('当前操作尚未完成，请稍候。');
        return;
      }
      if (action === 'preview') {
        void requestPreview();
        return;
      }
      if (action === 'submit') {
        if (mode !== 'manual') {
          blockAction('服务器数据模板无需提交审核。');
          return;
        }
        void submitManualDraft();
        return;
      }
      if (mode === 'server') {
        void exportFromServer();
      } else {
        void exportManualDraft();
      }
    }),
  );

  return (
    <section
      className={isBusy ? 'material-studio is-busy' : 'material-studio'}
      aria-label={title}
      aria-busy={isBusy}
    >
      <div className="section-heading material-studio-heading">
        <div>
          <span className="eyebrow">物料工作台</span>
          <h1>{title}</h1>
        </div>
      </div>

      <div
        className="material-studio-layout"
        style={
          isPreviewDialogViewport && !isSingleColumnViewport
            ? { gridTemplateColumns: 'minmax(240px, 280px) minmax(0, 1fr)' }
            : undefined
        }
      >
        <aside className="material-studio-sidebar">
          <label>
            <span>模板</span>
            <select
              value={selected?.id ?? ''}
              onChange={(event) => selectTemplate(event.currentTarget.value)}
              disabled={!templates.length || isBusy}
            >
              {templates.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.template.title}
                </option>
              ))}
            </select>
          </label>
          {selected?.template.description ? <p>{selected.template.description}</p> : null}
          <CanvasEditor
            canvas={activeCanvas}
            onChange={updateCanvas}
            disabled={isBusy || !selected}
            isMetroWayfinding={isMetroWayfinding}
          />
        </aside>

        <div className="material-studio-editor">
          {canUseServerSource ? (
            <div className="material-mode-switch" role="group" aria-label="数据来源">
              <button
                className={mode === 'manual' ? 'is-active' : ''}
                type="button"
                onClick={() => {
                  setMode('manual');
                  clearPreview();
                }}
              >
                手动输入
              </button>
              <button
                className={mode === 'server' ? 'is-active' : ''}
                type="button"
                onClick={() => {
                  setMode('server');
                  clearPreview();
                }}
              >
                服务器数据
              </button>
            </div>
          ) : null}
          {mode === 'server' && serverOverrideFields.length ? (
            <div className="material-field-grid">
              {serverOverrideFields.map((field) => (
                <MaterialFieldEditor
                  key={field.key}
                  field={field}
                  value={input[field.key] ?? field.defaultValue ?? ''}
                  disabled={isBusy}
                  onChange={(value) => {
                    setInput((current) => ({ ...current, [field.key]: value }));
                    clearPreview();
                  }}
                />
              ))}
            </div>
          ) : null}
          {!selected ? (
            <p className="material-studio-empty">暂无可用模板。</p>
          ) : mode === 'server' && activeServerSource === 'transit_station' ? (
            <>
              <label className="material-field">
                <span>服务器公交站</span>
                <select
                  value={selectedTransitStationMarkerId}
                  onChange={(event) => {
                    setSelectedTransitStationMarkerId(event.currentTarget.value);
                    setSelectedTransitLineIds([]);
                    clearPreview();
                  }}
                  disabled={isBusy || !transitStations.length}
                >
                  {transitStations.map((station) => (
                    <option key={station.markerId} value={station.markerId}>
                      {station.stationName} · {station.lines.length} 条公交线路
                    </option>
                  ))}
                </select>
              </label>
              <label className="material-field">
                <span>道路行车方向</span>
                <select
                  value={transitDirection}
                  onChange={(event) => {
                    setTransitDirection(
                      event.currentTarget.value as 'east' | 'west' | 'north' | 'south',
                    );
                    setSelectedTransitLineIds([]);
                    clearPreview();
                  }}
                  disabled={
                    isBusy ||
                    !selectedTransitStation ||
                    !selectedTransitStation.directionOptions.length
                  }
                >
                  {selectedTransitStation?.directionOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              {requiresTransitTerminalRole ? (
                <label className="material-field">
                  <span>站点属性</span>
                  <select
                    value={transitTerminalRole}
                    onChange={(event) => {
                      setTransitTerminalRole(event.currentTarget.value as 'origin' | 'terminal');
                      setSelectedTransitLineIds([]);
                      clearPreview();
                    }}
                    disabled={isBusy || !selectedTransitStation}
                  >
                    <option value="origin">始发站</option>
                    <option value="terminal">终点站</option>
                  </select>
                </label>
              ) : null}
              <fieldset
                className="material-canvas-editor"
                disabled={isBusy || !selectedTransitStation}
              >
                <legend>
                  同方向线路
                  {usesSingleTransitLineSelection
                    ? '（单选）'
                    : `（最多 ${maximumTransitLineCount} 条）`}
                </legend>
                {selectableTransitLines.length ? (
                  selectableTransitLines.map((line) => {
                    const checked = selectedTransitLineIds.includes(line.id);
                    return (
                      <label className="material-checkbox-row" key={line.id}>
                        <input
                          type={usesSingleTransitLineSelection ? 'radio' : 'checkbox'}
                          name={
                            usesSingleTransitLineSelection
                              ? `material-transit-line-${selectedTransitStation?.markerId ?? ''}`
                              : undefined
                          }
                          checked={checked}
                          disabled={
                            !usesSingleTransitLineSelection &&
                            !checked &&
                            selectedTransitLineIds.length >= maximumTransitLineCount
                          }
                          onChange={(event) => {
                            const nextChecked = event.currentTarget.checked;
                            setSelectedTransitLineIds((current) =>
                              usesSingleTransitLineSelection
                                ? [line.id]
                                : nextChecked
                                  ? [...current, line.id].slice(0, maximumTransitLineCount)
                                  : current.filter((lineId) => lineId !== line.id),
                            );
                            clearPreview();
                          }}
                        />
                        <span>
                          {line.name} · 往 {line.destinationName || '终点待维护'} ·{' '}
                          {line.firstLastBus}
                          {line.operator ? ` · ${line.operator}` : ''}
                          {line.isOriginAtStation ? ' · 当前站始发' : ''}
                          {line.isTerminalAtStation ? ' · 当前站终到' : ''}
                        </span>
                      </label>
                    );
                  })
                ) : (
                  <p className="muted">当前方向没有可用线路。</p>
                )}
              </fieldset>
            </>
          ) : mode === 'server' && activeServerSource === 'transit_line' ? (
            <>
              <label className="material-field">
                <span>服务器线路</span>
                <select
                  value={selectedLineId}
                  onChange={(event) => {
                    const lineId = event.currentTarget.value;
                    const line = transitLines.find((item) => item.id === lineId);
                    setSelectedLineId(lineId);
                    setSelectedStationSourceId(line?.stations[0]?.stationSourceId ?? '');
                    clearPreview();
                  }}
                  disabled={isBusy || !transitLines.length}
                >
                  {transitLines.map((line) => (
                    <option key={line.id} value={line.id}>
                      {line.name} · {line.stationCount} 站
                      {line.operator ? ` · ${line.operator}` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label className="material-field">
                <span>服务器站点</span>
                <select
                  value={selectedStationSourceId}
                  onChange={(event) => {
                    setSelectedStationSourceId(event.currentTarget.value);
                    clearPreview();
                  }}
                  disabled={isBusy || !selectedLine?.stations.length}
                >
                  {selectedLine?.stations.map((station) => (
                    <option key={station.stationSourceId} value={station.stationSourceId}>
                      {station.stationName}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : mode === 'server' && activeServerSource === 'map_location' ? (
            <>
              <label className="material-field">
                <span>搜索服务器地点</span>
                <input
                  value={locationQuery}
                  onChange={(event) => setLocationQuery(event.currentTarget.value)}
                  disabled={isBusy}
                />
              </label>
              <label className="material-field">
                <span>服务器地点</span>
                <select
                  value={selectedLocationId}
                  onChange={(event) => {
                    setSelectedLocationId(event.currentTarget.value);
                    clearPreview();
                  }}
                  disabled={isBusy || !visibleLocations.length}
                >
                  {visibleLocations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.label} · {location.categoryId}
                      {location.address ? ` · ${location.address}` : ''}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : mode === 'server' && activeServerSource === 'road_coordinate' ? (
            <>
              <div className="material-field-grid">
                <label className="material-field">
                  <span>安装坐标 X</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={roadCoordinate?.[0] ?? ''}
                    disabled={isBusy}
                    onChange={(event) => {
                      const value = Number(event.currentTarget.value);
                      if (!Number.isFinite(value)) {
                        return;
                      }
                      setRoadCoordinate((current) => [value, current?.[1] ?? 0]);
                      clearPreview();
                    }}
                  />
                </label>
                <label className="material-field">
                  <span>安装坐标 Z</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={roadCoordinate?.[1] ?? ''}
                    disabled={isBusy}
                    onChange={(event) => {
                      const value = Number(event.currentTarget.value);
                      if (!Number.isFinite(value)) {
                        return;
                      }
                      setRoadCoordinate((current) => [current?.[0] ?? 0, value]);
                      clearPreview();
                    }}
                  />
                </label>
              </div>
              <EmbeddedMapLocationPicker
                ariaLabel="在服务器地图预览中点选路牌安装坐标"
                footer={
                  roadCoordinate
                    ? `点击地图确定安装坐标 · X ${formatCoordinate(roadCoordinate[0])} / Z ${formatCoordinate(roadCoordinate[1])}`
                    : '请填写安装坐标后在地图中微调'
                }
                onChange={(coordinate) => {
                  setRoadCoordinate(coordinate);
                  clearPreview();
                }}
                tileTemplate={tileTemplate}
                value={roadCoordinate}
              />
            </>
          ) : (
            <>
              {isMetroWayfinding ? (
                <MetroWayfindingEditor
                  value={input.layout ?? ''}
                  disabled={isBusy}
                  lineColorOptions={metroLineColorOptions}
                  onChange={(value) => {
                    setInput((current) => ({ ...current, layout: value }));
                    clearPreview();
                  }}
                />
              ) : (
                <div className="material-field-grid">
                  {selected.template.fields
                    .filter((field) => field.userEditable !== false)
                    .map((field) => (
                      <MaterialFieldEditor
                        key={field.key}
                        field={field}
                        value={input[field.key] ?? ''}
                        disabled={isBusy}
                        onChange={(value) => {
                          setInput((current) => ({ ...current, [field.key]: value }));
                          clearPreview();
                        }}
                      />
                    ))}
                </div>
              )}
            </>
          )}
        </div>

        {!isPreviewDialogViewport ? (
          <section className="material-preview" aria-label="物料预览">
            <div className="material-preview-heading">
              <h2>预览</h2>
              <MaterialPreviewDescription previewSize={previewSize} />
            </div>
            <MaterialPreviewStage
              previewUrl={previewUrl}
              alt={`${selected?.template.title ?? title}预览`}
            />
          </section>
        ) : null}
      </div>

      {isPreviewDialogViewport && isPreviewDialogOpen && previewUrl ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) {
              setIsPreviewDialogOpen(false);
            }
          }}
        >
          <section
            className="modal-panel material-preview"
            role="dialog"
            aria-modal="true"
            aria-labelledby="material-preview-dialog-heading"
            style={{ width: 'min(760px, 100%)' }}
          >
            <div className="material-preview-heading">
              <div style={{ display: 'grid', gap: 2 }}>
                <h2 id="material-preview-dialog-heading">预览</h2>
                <MaterialPreviewDescription previewSize={previewSize} />
              </div>
              <button
                type="button"
                className="icon-button"
                aria-label="关闭预览"
                title="关闭预览"
                autoFocus
                onClick={() => setIsPreviewDialogOpen(false)}
                style={{ flex: '0 0 40px', width: 40 }}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  close
                </span>
              </button>
            </div>
            <MaterialPreviewStage
              previewUrl={previewUrl}
              alt={`${selected?.template.title ?? title}预览`}
            />
          </section>
        </div>
      ) : null}

      <section className="material-history" aria-labelledby="material-history-heading">
        <div className="material-history-heading">
          <div>
            <h2 id="material-history-heading">我的物料历史</h2>
            <p className="muted">已提交的自定义物料会保留在这里，审核通过后可随时下载。</p>
          </div>
          <span>{historyDrafts.length} 条</span>
        </div>
        {historyDrafts.length ? (
          <div className="material-history-list">
            {historyDrafts.map((draft) => {
              const template = templateVersionByKey.get(
                `${draft.templateId}:${draft.templateVersion}`,
              );
              return (
                <article className="material-history-item" key={draft.id}>
                  <div>
                    <strong>
                      {template?.title ?? draft.templateId} · v{draft.templateVersion} ·{' '}
                      {materialDraftStatusLabel(draft.status)}
                    </strong>
                    <p>{formatStudioDraftInput(draft, template)}</p>
                    <small>
                      提交于 {formatTime(draft.submittedAt ?? draft.createdAt)}
                      {draft.reviewedAt ? ` · 审核于 ${formatTime(draft.reviewedAt)}` : ''}
                      {draft.reviewReason ? ` · ${draft.reviewReason}` : ''}
                    </small>
                  </div>
                  {draft.status === 'approved' ? (
                    <button
                      type="button"
                      className="is-primary"
                      onClick={() => void exportDraft(draft)}
                      disabled={isBusy}
                      title="下载图片"
                    >
                      <span className="material-symbols-outlined" aria-hidden="true">
                        download
                      </span>
                      下载图片
                    </button>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : (
          <p className="material-history-empty">还没有提交过自定义物料。</p>
        )}
      </section>
    </section>
  );
}

function MaterialPreviewDescription({
  previewSize,
}: Readonly<{ previewSize: { width: number; height: number } | null }>) {
  return (
    <span>
      预览含水印
      {previewSize?.width && previewSize.height
        ? ` · ${previewSize.width} × ${previewSize.height} px`
        : ''}
    </span>
  );
}

function MaterialPreviewStage({
  previewUrl,
  alt,
}: Readonly<{ previewUrl: string | null; alt: string }>) {
  return (
    <div className="material-preview-stage">
      {previewUrl ? (
        <div className="material-preview-canvas">
          <img src={previewUrl} alt={alt} />
        </div>
      ) : (
        <span>尚未生成预览</span>
      )}
    </div>
  );
}

function resolveMaterialDownloadFileName(response: Response, fallback: string): string {
  const disposition = response.headers.get('Content-Disposition');
  const encodedFileName = disposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encodedFileName) {
    try {
      return decodeURIComponent(encodedFileName);
    } catch {
      return encodedFileName;
    }
  }
  const plainFileName = disposition?.match(/filename="?([^";]+)"?/i)?.[1];
  return plainFileName || fallback;
}

function CanvasEditor({
  canvas,
  disabled,
  isMetroWayfinding,
  onChange,
}: Readonly<{
  canvas: MaterialCanvas | null;
  disabled: boolean;
  isMetroWayfinding: boolean;
  onChange: <TKey extends keyof MaterialCanvas>(key: TKey, value: MaterialCanvas[TKey]) => void;
}>) {
  if (!canvas) {
    return null;
  }

  const widthPx = Math.round(canvas.widthM * canvas.pxPerMeter);
  const heightPx = Math.round(canvas.heightM * canvas.pxPerMeter);
  const outputWidth = canvas.alignToTile
    ? Math.ceil(widthPx / canvas.tileSizePx) * canvas.tileSizePx
    : widthPx;
  const outputHeight = canvas.alignToTile
    ? Math.ceil(heightPx / canvas.tileSizePx) * canvas.tileSizePx
    : heightPx;

  return (
    <fieldset className="material-canvas-editor" disabled={disabled}>
      <legend>尺寸</legend>
      <label>
        <span>{isMetroWayfinding ? '宽度（128 像素格数）' : '宽度（米）'}</span>
        <input
          type="number"
          min={isMetroWayfinding ? 1 : 0.01}
          max="64"
          step={isMetroWayfinding ? 1 : 0.01}
          value={canvas.widthM}
          onChange={(event) => {
            const value = Number(event.currentTarget.value);
            onChange('widthM', isMetroWayfinding ? Math.max(1, Math.round(value)) : value);
          }}
        />
      </label>
      <label>
        <span>高度（米）</span>
        <input
          type="number"
          min="0.01"
          max="64"
          step="0.01"
          value={isMetroWayfinding ? 1 : canvas.heightM}
          disabled={isMetroWayfinding}
          onChange={(event) => onChange('heightM', Number(event.currentTarget.value))}
        />
      </label>
      <label>
        <span>对齐单位（像素）</span>
        <input
          type="number"
          min="16"
          max="4096"
          step="1"
          value={canvas.tileSizePx}
          onChange={(event) => onChange('tileSizePx', Number(event.currentTarget.value))}
        />
      </label>
      <label className="material-checkbox-row">
        <input
          type="checkbox"
          checked={canvas.alignToTile}
          disabled={isMetroWayfinding}
          onChange={(event) => onChange('alignToTile', event.currentTarget.checked)}
        />
        <span>对齐到整数地图画尺寸</span>
      </label>
      <output>
        {outputWidth} × {outputHeight} px
      </output>
    </fieldset>
  );
}

function MaterialFieldEditor({
  field,
  value,
  disabled,
  onChange,
}: Readonly<{
  field: MaterialField;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}>) {
  return (
    <label className="material-field">
      <span>
        {field.label}
        {field.required ? ' *' : ''}
      </span>
      {field.kind === 'select' ? (
        <select
          value={value}
          onChange={(event) => onChange(event.currentTarget.value)}
          disabled={disabled}
        >
          <option value="">请选择</option>
          {field.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : field.kind === 'color' ? (
        <span
          style={{
            display: 'grid',
            gridTemplateColumns: '48px minmax(0, 1fr)',
            gap: 8,
            alignItems: 'center',
          }}
        >
          <input
            type="color"
            aria-label={`${field.label}色板`}
            value={/^#[0-9A-Fa-f]{6}$/.test(value) ? value : '#26CABA'}
            required={field.required}
            disabled={disabled}
            onChange={(event) => onChange(event.currentTarget.value.toUpperCase())}
            style={{ padding: 4 }}
          />
          <input
            type="text"
            aria-label={`${field.label}十六进制颜色`}
            value={value}
            maxLength={7}
            required={field.required}
            disabled={disabled}
            placeholder="#26CABA"
            onChange={(event) => onChange(event.currentTarget.value.toUpperCase())}
          />
        </span>
      ) : (
        <input
          type={field.kind === 'number' ? 'number' : 'text'}
          value={value}
          min={field.minimum}
          max={field.maximum}
          maxLength={field.maxLength}
          required={field.required}
          disabled={disabled}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
      )}
    </label>
  );
}

function formatCoordinate(value: number): string {
  return String(Math.round(value * 100) / 100);
}

function materialDraftStatusLabel(status: MaterialDraft['status']): string {
  return {
    draft: '草稿',
    pending_review: '待审核',
    approved: '已通过',
    rejected: '已驳回',
  }[status];
}

function formatStudioDraftInput(
  draft: MaterialDraft,
  template: MaterialTemplate | undefined,
): string {
  if (!template) {
    return Object.entries(draft.input)
      .filter(([, value]) => value)
      .map(([key, value]) => `${key}：${value}`)
      .join(' · ');
  }
  return (
    template.fields
      .filter((field) => field.userEditable !== false)
      .map((field) => {
        const value = draft.input[field.key]?.trim();
        if (!value) {
          return undefined;
        }
        const option = field.options?.find((item) => item.value === value);
        return `${field.label}：${option?.label ?? value}`;
      })
      .filter(Boolean)
      .join(' · ') || '未填写字段内容'
  );
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(value),
  );
}
