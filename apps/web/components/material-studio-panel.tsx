'use client';

import type { MaterialTransitNetworkSnapshot } from '@yct/contracts';
import { useEffect, useId, useMemo, useState } from 'react';
import { appPath } from '../lib/app-paths';
import { publishLoginRequiredForResponse } from '../lib/client-auth-events';
import { findTextContinuation } from '../lib/text-continuation';
import {
  publishMaterialStudioActionBlocked,
  publishMaterialStudioState,
  subscribeMaterialStudioActions,
} from '../lib/client-material-studio-events';
import {
  publishTransitNetworkLineNameEditorRequested,
  subscribeTransitNetworkLineNamesChanged,
  subscribeTransitNetworkSourceChanged,
} from '../lib/client-transit-network-events';
import { METRO_WAYFINDING_TEMPLATE_ID } from '../lib/metro-wayfinding';
import {
  listMaterialTransitNetworkPalette,
  listMaterialTransitNetworkNodeDirections,
  listMaterialTransitNetworkNodeLineDirections,
  listMaterialTransitNetworkNodeLines,
  type MaterialTransitNetworkNodeLineOption,
} from '../lib/rmp-transit-network';
import { EmbeddedMapLocationPicker } from './embedded-map-location-picker';
import { MetroWayfindingEditor } from './metro-wayfinding-editor';
import { TransitNetworkSourceControl } from './transit-network-source-control';

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
  projectLines?: MaterialTransitNetworkNodeLineOption[];
}

interface ImportedTransitLineOption {
  id: string;
  lineKey: string;
  direction: 'east' | 'west' | 'north' | 'south';
  name: string;
  secondaryName?: string;
  color: string;
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

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function MaterialStudioPanel({
  studioId,
  title,
  families,
  serverSource,
  serverSources,
  serverFamilies,
  includedTemplateIds,
  allowTransitNetworkImport = false,
}: Readonly<{
  studioId: string;
  title: string;
  families: MaterialFamily[];
  serverSource?: MaterialServerSource;
  serverSources?: Partial<Record<MaterialFamily, MaterialServerSource>>;
  serverFamilies?: MaterialFamily[];
  includedTemplateIds?: string[];
  allowTransitNetworkImport?: boolean;
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
  const [selectedImportedStationNodeId, setSelectedImportedStationNodeId] = useState('');
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
  const [transitNetworkSource, setTransitNetworkSource] = useState<'server' | 'rmp'>('server');
  const [importedTransitNetwork, setImportedTransitNetwork] =
    useState<MaterialTransitNetworkSnapshot>();

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
  const metroLineColorOptions = useMemo(() => {
    if (transitNetworkSource === 'rmp' && importedTransitNetwork) {
      return listMaterialTransitNetworkPalette(importedTransitNetwork);
    }
    return transitLines
      .filter(
        (line) =>
          line.mode === 'metro' && Boolean(line.color && /^#[0-9A-Fa-f]{6}$/.test(line.color)),
      )
      .map((line) => ({
        value: line.color!.toUpperCase(),
        label: `${line.name} · ${line.color!.toUpperCase()}`,
      }));
  }, [importedTransitNetwork, transitLines, transitNetworkSource]);
  const metroTextSuggestions = useMemo(() => {
    const values = [
      ...transitStations.map((station) => station.stationName),
      ...locations.map((location) => location.label),
      ...(importedTransitNetwork?.nodes.flatMap((node) => node.names) ?? []),
    ];
    return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b, 'zh-CN'),
    );
  }, [importedTransitNetwork, locations, transitStations]);
  const serverLocationSuggestions = useMemo(
    () => Array.from(new Set(locations.map((location) => location.label.trim()).filter(Boolean))),
    [locations],
  );
  const requiresTransitTerminalRole = Boolean(
    selected?.template.fields.some((field) => field.key === 'terminalRole'),
  );
  const selectedTransitStation = transitStations.find(
    (station) => station.markerId === selectedTransitStationMarkerId,
  );
  const importedTransitStations = useMemo<TransitStationOption[]>(() => {
    if (!importedTransitNetwork) return [];
    return importedTransitNetwork.nodes
      .filter((node) => node.kind === 'station' && node.names.length)
      .map((node) => {
        const directions = new Set(
          listMaterialTransitNetworkNodeDirections(importedTransitNetwork, node.id),
        );
        return {
          markerId: node.id,
          stationSourceId: '',
          stationName: node.names[0]!,
          coordinate: [node.x, node.y] as [number, number],
          directionOptions: listDiagramDirectionOptions().filter((option) =>
            directions.has(option.value),
          ),
          lines: [],
          projectLines: listMaterialTransitNetworkNodeLines(importedTransitNetwork, node.id),
        };
      })
      .sort((left, right) => left.stationName.localeCompare(right.stationName, 'zh-CN'));
  }, [importedTransitNetwork]);
  const selectedImportedTransitStation = importedTransitStations.find(
    (station) => station.markerId === selectedImportedStationNodeId,
  );
  const activeTransitStation =
    transitNetworkSource === 'rmp' ? selectedImportedTransitStation : selectedTransitStation;
  const selectableImportedTransitLines = useMemo<ImportedTransitLineOption[]>(() => {
    if (!importedTransitNetwork || !selectedImportedTransitStation) return [];
    return (selectedImportedTransitStation.projectLines ?? []).flatMap((line) =>
      listMaterialTransitNetworkNodeLineDirections(
        importedTransitNetwork,
        selectedImportedTransitStation.markerId,
        line.lineKey,
      ).map((direction) => ({
        id: `${line.lineKey}\u0000${direction}`,
        lineKey: line.lineKey,
        direction,
        name: line.label,
        secondaryName: line.secondaryLabel,
        color: line.color,
      })),
    );
  }, [importedTransitNetwork, selectedImportedTransitStation]);
  const selectableServerTransitLines = useMemo(
    () =>
      (selectedTransitStation?.lines ?? []).filter(
        (line) =>
          line.direction === transitDirection &&
          (!requiresTransitTerminalRole ||
            (transitTerminalRole === 'origin' ? line.isOriginAtStation : line.isTerminalAtStation)),
      ),
    [requiresTransitTerminalRole, selectedTransitStation, transitDirection, transitTerminalRole],
  );
  const selectableTransitLines = useMemo(
    () =>
      transitNetworkSource === 'rmp'
        ? selectableImportedTransitLines.filter((line) => line.direction === transitDirection)
        : selectableServerTransitLines,
    [
      selectableImportedTransitLines,
      selectableServerTransitLines,
      transitDirection,
      transitNetworkSource,
    ],
  );
  const primarySelectedTransitLine = selectedTransitStation?.lines.find(
    (line) => line.id === selectedTransitLineIds[0],
  );
  const primarySelectedImportedLine = selectableImportedTransitLines.find(
    (line) => line.id === selectedTransitLineIds[0],
  );
  const primaryServerTransitLine = transitLines.find(
    (line) => line.id === primarySelectedTransitLine?.lineId,
  );
  const activeTransitLineColor =
    transitNetworkSource === 'rmp'
      ? primarySelectedImportedLine?.color
      : primaryServerTransitLine?.color?.toUpperCase();
  const linkedDataModeLabel = transitNetworkSource === 'rmp' ? '项目数据' : '服务器数据';
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
        setWorkspaceBlockMessage(templateData.message ?? '无法读取物料模板。');
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
        serverSource === 'transit_station' ||
        Object.values(serverSources ?? {}).includes('transit_line') ||
        Object.values(serverSources ?? {}).includes('transit_station') ||
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
      const requiresLocationList =
        allowTransitNetworkImport ||
        serverSource === 'map_location' ||
        serverSource === 'road_coordinate' ||
        Object.values(serverSources ?? {}).some(
          (source) => source === 'map_location' || source === 'road_coordinate',
        );
      if (requiresLocationList) {
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
      }
      if (
        serverSource === 'map_location' ||
        serverSource === 'road_coordinate' ||
        Object.values(serverSources ?? {}).some(
          (source) => source === 'map_location' || source === 'road_coordinate',
        )
      ) {
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

  useEffect(
    () =>
      subscribeTransitNetworkSourceChanged(studioId, ({ source, snapshot, clearSnapshot }) => {
        setTransitNetworkSource(source);
        if (snapshot) setImportedTransitNetwork(snapshot);
        if (clearSnapshot) setImportedTransitNetwork(undefined);
        setSelectedTransitLineIds([]);
        clearPreview();
      }),
    [studioId],
  );

  useEffect(
    () =>
      subscribeTransitNetworkLineNamesChanged(studioId, ({ snapshot }) => {
        setImportedTransitNetwork(snapshot);
        setSelectedTransitLineIds([]);
        clearPreview();
      }),
    [studioId],
  );

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
    if (transitNetworkSource !== 'rmp') return;
    setSelectedImportedStationNodeId((current) =>
      importedTransitStations.some((station) => station.markerId === current)
        ? current
        : (importedTransitStations[0]?.markerId ?? ''),
    );
  }, [importedTransitStations, transitNetworkSource]);

  useEffect(() => {
    const selectableIds = new Set(selectableTransitLines.map((line) => line.id));
    setSelectedTransitLineIds((current) => {
      const retained = current.filter((lineId) => selectableIds.has(lineId));
      const next =
        retained.length > 0
          ? retained.slice(0, maximumTransitLineCount)
          : selectableTransitLines.slice(0, maximumTransitLineCount).map((line) => line.id);
      return arraysEqual(current, next) ? current : next;
    });
  }, [maximumTransitLineCount, selectableTransitLines]);

  useEffect(() => {
    const options = activeTransitStation?.directionOptions ?? [];
    if (options.length && !options.some((option) => option.value === transitDirection)) {
      setTransitDirection(options[0]!.value);
    }
  }, [activeTransitStation, transitDirection]);

  useEffect(() => {
    if (
      !activeTransitLineColor ||
      !selected?.template.fields.some((field) => field.key === 'accentColor')
    ) {
      return;
    }
    setInput((current) =>
      current.accentColor === activeTransitLineColor
        ? current
        : { ...current, accentColor: activeTransitLineColor },
    );
    clearPreview();
  }, [activeTransitLineColor, selected?.id]);

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

  const downloadBlob = async (
    response: Response,
    fallbackFileName = `${selected?.template.title ?? title}.png`,
  ) => {
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = resolveMaterialDownloadFileName(response, fallbackFileName);
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
    if (
      activeServerSource === 'transit_station' &&
      transitNetworkSource === 'rmp' &&
      selectedImportedStationNodeId
    ) {
      const lineSelections = selectedTransitLineIds.flatMap((selectedLineId) => {
        const line = selectableImportedTransitLines.find(
          (candidate) => candidate.id === selectedLineId,
        );
        return line ? [{ lineKey: line.lineKey, direction: line.direction }] : [];
      });
      return {
        kind: 'transit_station' as const,
        networkNodeId: selectedImportedStationNodeId,
        lineSelections,
        terminalRole: requiresTransitTerminalRole ? transitTerminalRole : undefined,
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
    if (
      activeServerSource === 'transit_station' &&
      transitNetworkSource === 'rmp' &&
      !selectedImportedStationNodeId
    ) {
      return '导入项目中没有可选择的站点。';
    }
    if (
      activeServerSource === 'transit_station' &&
      transitNetworkSource === 'server' &&
      !selectedTransitStationMarkerId
    ) {
      return '请先选择服务器公交站。';
    }
    if (activeServerSource === 'transit_station' && !selectedTransitLineIds.length) {
      return transitNetworkSource === 'rmp'
        ? '请先选择至少一条当前图上方向的项目线路。'
        : '请先选择至少一条同方向线路。';
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

  const fetchWatermarkedPreview = async (): Promise<Response | undefined> => {
    if (!selected || !activeCanvas) {
      blockAction(workspaceBlockMessage || '当前没有可用模板。');
      return undefined;
    }
    const selectionBlockMessage = mode === 'server' ? getServerSelectionBlockMessage() : null;
    if (selectionBlockMessage) {
      blockAction(selectionBlockMessage);
      return undefined;
    }
    const source = mode === 'server' ? buildServerSource() : undefined;
    if (mode === 'server' && !source) {
      blockAction(`请先选择${linkedDataModeLabel}。`);
      return undefined;
    }

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
              networkGeometry: transitNetworkSource === 'rmp' ? importedTransitNetwork : undefined,
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
      return undefined;
    }
    return response;
  };

  const downloadWatermarkedPreview = async () => {
    const response = await fetchWatermarkedPreview();
    if (!response) {
      return;
    }
    await downloadBlob(response, `${selected?.template.title ?? title}-带水印预览.png`);
  };

  const requestPreview = async () => {
    setIsBusy(true);
    try {
      const response = await fetchWatermarkedPreview();
      if (!response) {
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
      if (publishLoginRequiredForResponse(createResponse)) {
        return;
      }
      if (!createResponse.ok || !created.id) {
        blockAction(created.message ?? '无法保存自定义物料。');
        return;
      }
      const submitResponse = await fetch(
        appPath(`/api/materials/drafts/${encodeURIComponent(created.id)}/submit`),
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
      );
      const submitted = (await submitResponse.json()) as MaterialDraft & { message?: string };
      if (publishLoginRequiredForResponse(submitResponse)) {
        return;
      }
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
      if (response.status === 401 || response.status === 403) {
        await downloadWatermarkedPreview();
        return;
      }
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
      setIsBusy(true);
      try {
        await downloadWatermarkedPreview();
      } catch {
        blockAction('下载带水印预览时发生网络错误。');
      } finally {
        setIsBusy(false);
      }
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
      blockAction(`请先选择模板和${linkedDataModeLabel}。`);
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
          networkGeometry: transitNetworkSource === 'rmp' ? importedTransitNetwork : undefined,
          input: buildServerOverrides(),
        }),
      });
      if (response.status === 401 || response.status === 403) {
        await downloadWatermarkedPreview();
        return;
      }
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
          blockAction(`${linkedDataModeLabel}模式无需提交审核。`);
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
          {allowTransitNetworkImport ? <TransitNetworkSourceControl studioId={studioId} /> : null}
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
                {linkedDataModeLabel}
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
                  suggestions={field.key === 'roadName' ? serverLocationSuggestions : undefined}
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
                <span>{transitNetworkSource === 'rmp' ? '项目站点' : '服务器公交站'}</span>
                <select
                  value={
                    transitNetworkSource === 'rmp'
                      ? selectedImportedStationNodeId
                      : selectedTransitStationMarkerId
                  }
                  onChange={(event) => {
                    if (transitNetworkSource === 'rmp') {
                      setSelectedImportedStationNodeId(event.currentTarget.value);
                    } else {
                      setSelectedTransitStationMarkerId(event.currentTarget.value);
                    }
                    setSelectedTransitLineIds([]);
                    clearPreview();
                  }}
                  disabled={
                    isBusy ||
                    (transitNetworkSource === 'rmp'
                      ? !importedTransitStations.length
                      : !transitStations.length)
                  }
                >
                  {(transitNetworkSource === 'rmp' ? importedTransitStations : transitStations).map(
                    (station) => (
                      <option key={station.markerId} value={station.markerId}>
                        {station.stationName} ·{' '}
                        {transitNetworkSource === 'rmp'
                          ? `${station.projectLines?.length ?? 0} 条项目线路`
                          : `${station.lines.length} 条公交线路`}
                      </option>
                    ),
                  )}
                </select>
              </label>
              {transitNetworkSource === 'rmp' && activeTransitStation?.projectLines?.length ? (
                <div className="transit-network-station-lines" aria-label="当前站点的项目线路">
                  <span>项目线路</span>
                  <div>
                    {activeTransitStation.projectLines.map((line) => (
                      <span key={line.id} title={`${line.lineKey} · ${line.color}`}>
                        <i style={{ backgroundColor: line.color }} aria-hidden="true" />
                        {line.label}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
              <label className="material-field">
                <span>{transitNetworkSource === 'rmp' ? '图上行车方向' : '道路行车方向'}</span>
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
                    isBusy || !activeTransitStation || !activeTransitStation.directionOptions.length
                  }
                >
                  {activeTransitStation?.directionOptions.map((option) => (
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
                    disabled={isBusy || !activeTransitStation}
                  >
                    <option value="origin">始发站</option>
                    <option value="terminal">终点站</option>
                  </select>
                </label>
              ) : null}
              <fieldset
                className="material-canvas-editor"
                disabled={isBusy || !activeTransitStation}
              >
                <legend>
                  {transitNetworkSource === 'rmp' ? '项目线路' : '同方向线路'}
                  {usesSingleTransitLineSelection
                    ? '（单选）'
                    : `（最多 ${maximumTransitLineCount} 条）`}
                </legend>
                {transitNetworkSource === 'rmp' && selectableTransitLines.length ? (
                  selectableImportedTransitLines
                    .filter((line) => line.direction === transitDirection)
                    .map((line) => {
                      const checked = selectedTransitLineIds.includes(line.id);
                      return (
                        <label className="material-checkbox-row" key={line.id}>
                          <input
                            type={usesSingleTransitLineSelection ? 'radio' : 'checkbox'}
                            name={
                              usesSingleTransitLineSelection
                                ? `material-transit-line-${activeTransitStation?.markerId ?? ''}`
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
                          <i
                            className="transit-network-line-swatch"
                            style={{ backgroundColor: line.color }}
                            aria-hidden="true"
                          />
                          <span>
                            {line.name}
                            {line.secondaryName ? ` / ${line.secondaryName}` : ''}
                          </span>
                        </label>
                      );
                    })
                ) : transitNetworkSource === 'server' && selectableServerTransitLines.length ? (
                  selectableServerTransitLines.map((line) => {
                    const checked = selectedTransitLineIds.includes(line.id);
                    return (
                      <label className="material-checkbox-row" key={line.id}>
                        <input
                          type={usesSingleTransitLineSelection ? 'radio' : 'checkbox'}
                          name={
                            usesSingleTransitLineSelection
                              ? `material-transit-line-${activeTransitStation?.markerId ?? ''}`
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
                  <div className="transit-network-match-empty">
                    <p className="muted">
                      {transitNetworkSource === 'rmp'
                        ? '当前项目站点在该图上方向没有线路连接。'
                        : '当前方向没有可用线路。'}
                    </p>
                    {transitNetworkSource === 'rmp' &&
                    activeTransitStation?.projectLines?.length ? (
                      <button
                        type="button"
                        onClick={() => publishTransitNetworkLineNameEditorRequested({ studioId })}
                      >
                        <span className="material-symbols-outlined" aria-hidden="true">
                          edit
                        </span>
                        配置线路名称
                      </button>
                    ) : null}
                  </div>
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
                  canvasWidth={activeCanvas ? activeCanvas.widthM * 128 : 128}
                  canvasHeight={activeCanvas?.heightM ?? 1}
                  disabled={isBusy}
                  lineColorOptions={metroLineColorOptions}
                  textSuggestions={metroTextSuggestions}
                  onCanvasHeightChange={(height) => updateCanvas('heightM', height)}
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
                        suggestions={
                          field.key === 'roadName' ? serverLocationSuggestions : undefined
                        }
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
        <span>{isMetroWayfinding ? '高度（128 像素格数）' : '高度（米）'}</span>
        <input
          type="number"
          min={isMetroWayfinding ? 1 : 0.01}
          max={isMetroWayfinding ? 2 : 64}
          step={isMetroWayfinding ? 1 : 0.01}
          value={canvas.heightM}
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
  suggestions,
  onChange,
}: Readonly<{
  field: MaterialField;
  value: string;
  disabled: boolean;
  suggestions?: string[];
  onChange: (value: string) => void;
}>) {
  const suggestionsId = useId();
  const continuationSuggestion =
    field.kind === 'text' ? findTextContinuation(value, suggestions) : undefined;
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
      ) : field.kind === 'text' && suggestions?.length ? (
        <div className="material-field-text-autocomplete">
          <datalist id={suggestionsId}>
            {suggestions.map((suggestion) => (
              <option key={suggestion} value={suggestion} />
            ))}
          </datalist>
          {continuationSuggestion ? (
            <span className="material-field-text-autocomplete-ghost" aria-hidden="true">
              <span>{value}</span>
              <strong>{continuationSuggestion.slice(value.length)}</strong>
            </span>
          ) : null}
          <input
            type="text"
            value={value}
            maxLength={field.maxLength}
            required={field.required}
            disabled={disabled}
            list={suggestionsId}
            onKeyDown={(event) => {
              if (event.key !== 'Tab' || !continuationSuggestion) return;
              event.preventDefault();
              onChange(continuationSuggestion);
            }}
            onChange={(event) => onChange(event.currentTarget.value)}
          />
        </div>
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

function listDiagramDirectionOptions(): TransitStationOption['directionOptions'] {
  return [
    { value: 'east', label: '向图右' },
    { value: 'west', label: '向图左' },
    { value: 'north', label: '向图上' },
    { value: 'south', label: '向图下' },
  ];
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
