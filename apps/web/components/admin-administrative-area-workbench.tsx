'use client';

import type {
  AdministrativeArea,
  AdministrativeAreaLevel,
  MapMarkerSnapshot,
  TileProviderDescriptor,
} from '@yct/contracts';
import { ADMINISTRATIVE_AREA_DEFAULT_MAX_ZOOM } from '@yct/contracts';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  administrativeAreaToFormValues,
  administrativeAreaLevelOptions,
  buildAdministrativeAreaColorOptions,
  buildAdministrativeAreaStyle,
  emptyAdministrativeAreaForm,
  formatAdministrativeAreaLevel,
  normalizeAdministrativeAreaCode,
  parseAdministrativeAreaNumber,
  semanticAdministrativeAreaColorOptions,
  type AdministrativeAreaColorSource,
  type AdministrativeAreaFormValues,
} from '../lib/administrative-area-form';
import { appPath } from '../lib/app-paths';
import { publishAdminDataChanged } from '../lib/client-admin-data-events';
import { getGeometryRepresentativeCoordinate } from '../lib/map-geometry-coordinate';
import { selectMapTileTemplates } from '../lib/map-tile-templates';
import {
  buildMapGeometryFromDraft,
  createEmptyPoiGeometryDraft,
  createPoiGeometryDraft,
  isRegionGeometry,
  RegionGeometryWorkspace,
  type AdminMapMarker,
  type PoiGeometryDraft,
  type PoiTilePreviewConfig,
  type RegionGeometryDraft,
} from './admin-poi-panel';
import { EditorLoadingState } from './editor/editor-loading-state';
import { RangeInput } from './range-input';
import { VisualEditorShell } from './visual-editor-shell';
import { Field, FieldGroup, Input, Select } from './ui/field';

/**
 * 区划编辑工作台。
 * 几何与图层树直接复用 POI 几何内核，这里只负责区划字段、保存语义与返回地址。
 */
export function AdminAdministrativeAreaWorkbench({ areaId }: Readonly<{ areaId?: string }>) {
  const sessionId = useId();
  const [areas, setAreas] = useState<AdministrativeArea[]>([]);
  const [area, setArea] = useState<AdministrativeArea | null>(null);
  const [currentAreaId, setCurrentAreaId] = useState<string | undefined>(areaId);
  const [mapMarkers, setMapMarkers] = useState<AdminMapMarker[]>([]);
  const [transitLines, setTransitLines] = useState<AdministrativeAreaColorSource[]>([]);
  const [tilePreviewConfig, setTilePreviewConfig] = useState<PoiTilePreviewConfig>({});
  const [values, setValues] = useState<AdministrativeAreaFormValues>(emptyAdministrativeAreaForm);
  const [draft, setDraft] = useState<RegionGeometryDraft>(
    () => createEmptyPoiGeometryDraft('Polygon') as RegionGeometryDraft,
  );
  const [status, setStatus] = useState('正在读取区划数据');
  const [loadError, setLoadError] = useState<string>();
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const saveInFlightRef = useRef(false);

  const backHref = currentAreaId
    ? `/admin/map-areas?areaId=${encodeURIComponent(currentAreaId)}`
    : '/admin/map-areas';

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [areaResponse, markerResponse, tileResponse, transitResponse] = await Promise.all([
        fetch(appPath('/api/admin/map/administrative-areas'), { cache: 'no-store' }).catch(
          () => null,
        ),
        fetch(appPath('/api/map/markers'), { cache: 'no-store' }).catch(() => null),
        fetch(appPath('/api/map/tile-providers'), { cache: 'no-store' }).catch(() => null),
        fetch(appPath('/api/transit/overview'), { cache: 'no-store' }).catch(() => null),
      ]);
      if (cancelled) {
        return;
      }
      let items: AdministrativeArea[] = [];
      if (areaResponse?.ok) {
        const data = (await areaResponse.json()) as { items?: AdministrativeArea[] };
        items = data.items ?? [];
        setAreas(items);
      } else if (areaId) {
        setStatus('行政区划列表读取失败。');
        setLoadError('请检查网络后重试，或返回列表重新进入工作台。');
        setLoaded(true);
        return;
      }
      if (markerResponse?.ok) {
        const data = (await markerResponse.json()) as { snapshot?: MapMarkerSnapshot };
        setMapMarkers(data.snapshot?.markers ?? []);
      }
      if (tileResponse?.ok) {
        const data = (await tileResponse.json()) as { items?: TileProviderDescriptor[] };
        setTilePreviewConfig(selectMapTileTemplates(data.items ?? []));
      }
      if (transitResponse?.ok) {
        const data = (await transitResponse.json()) as { lines?: AdministrativeAreaColorSource[] };
        setTransitLines(data.lines ?? []);
      }

      if (areaId) {
        const target = items.find((item) => item.id === areaId);
        if (!target) {
          setStatus('未找到该行政区划，可能已被删除或归档。');
          setLoadError('请返回列表后重新选择要编辑的区划。');
          setLoaded(true);
          return;
        }
        setArea(target);
        setValues(administrativeAreaToFormValues(target));
        setDraft(toRegionGeometryDraft(target.boundary));
        setStatus(`正在编辑 ${target.name}`);
        setDirty(false);
      } else {
        setStatus('填写区划信息并在地图上绘制边界后保存。');
      }
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [areaId]);

  const colorOptions = useMemo(
    () => buildAdministrativeAreaColorOptions(transitLines),
    [transitLines],
  );
  const labelPoiOptions = useMemo(
    () =>
      mapMarkers
        .filter(
          (marker) =>
            marker.categoryId !== 'player' &&
            Boolean(getGeometryRepresentativeCoordinate(marker.geometry)),
        )
        .sort((left, right) => left.label.localeCompare(right.label, 'zh-CN')),
    [mapMarkers],
  );
  const selectedColor =
    colorOptions.find((option) => option.value === values.colorBinding) ??
    semanticAdministrativeAreaColorOptions.at(-1)!;

  const updateValues = (patch: Partial<AdministrativeAreaFormValues>) => {
    setValues((current) => ({ ...current, ...patch }));
    setDirty(true);
  };

  const updateDraft = (next: RegionGeometryDraft) => {
    setDraft(next);
    setDirty(true);
  };

  const save = async (): Promise<boolean> => {
    if (saveInFlightRef.current) {
      return false;
    }
    if (!values.name.trim() || !values.code.trim()) {
      setStatus('请填写区划名称与编码后再保存。');
      return false;
    }
    const geometryResult = buildMapGeometryFromDraft(draft);
    if (!geometryResult.geometry || !isRegionGeometry(geometryResult.geometry)) {
      setStatus(geometryResult.error ?? '请先在地图上完成行政区划边界。');
      return false;
    }
    const colorOption = colorOptions.find((option) => option.value === values.colorBinding);
    if (!colorOption) {
      setStatus('请选择有效的语义色或线路色。');
      return false;
    }
    const normalizedCode = normalizeAdministrativeAreaCode(values.code);
    const duplicate = areas.find(
      (item) =>
        item.id !== currentAreaId && normalizeAdministrativeAreaCode(item.code) === normalizedCode,
    );
    if (duplicate) {
      setStatus(`行政区划代码已存在：${duplicate.name}（${duplicate.code}），请修改编码。`);
      return false;
    }

    saveInFlightRef.current = true;
    setBusy(true);
    try {
      const payload = {
        code: values.code.trim(),
        name: values.name.trim(),
        level: values.level,
        parentAreaId: values.parentAreaId || null,
        boundary: geometryResult.geometry,
        labelPositionPoiId: values.labelPositionPoiId || null,
        labelPosition: null,
        style: buildAdministrativeAreaStyle(values, colorOption),
        minZoom: parseAdministrativeAreaNumber(values.minZoom) ?? null,
        maxZoom:
          parseAdministrativeAreaNumber(values.maxZoom) ?? ADMINISTRATIVE_AREA_DEFAULT_MAX_ZOOM,
      };
      const response = await fetch(
        currentAreaId
          ? appPath(`/api/admin/map/administrative-areas/${encodeURIComponent(currentAreaId)}`)
          : appPath('/api/admin/map/administrative-areas'),
        {
          method: currentAreaId ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      const data = (await response.json()) as { area?: AdministrativeArea; message?: string };
      if (!response.ok) {
        setStatus(
          response.status === 409
            ? (data.message ?? '行政区划代码已存在，请修改编码或编辑已有记录。')
            : (data.message ?? '行政区划保存失败。'),
        );
        return false;
      }
      const savedArea = data.area;
      if (savedArea) {
        setArea(savedArea);
        setCurrentAreaId(savedArea.id);
        setAreas((current) =>
          current.some((item) => item.id === savedArea.id)
            ? current.map((item) => (item.id === savedArea.id ? savedArea : item))
            : [...current, savedArea],
        );
        if (!currentAreaId) {
          // 新建成功后把当前地址替换为带 areaId 的地址，刷新页面仍停留在同一条记录。
          window.history.replaceState(
            null,
            '',
            appPath(`/admin/map-areas/editor?areaId=${encodeURIComponent(savedArea.id)}`),
          );
        }
      }
      setStatus(currentAreaId ? '行政区划已保存' : '行政区划已创建为草稿');
      setDirty(false);
      publishAdminDataChanged({
        resource: 'administrative-areas',
        reason: currentAreaId ? 'record_updated' : 'record_created',
        occurredAt: new Date().toISOString(),
      });
      return true;
    } catch {
      setStatus('行政区划保存失败，请检查网络后重试。');
      return false;
    } finally {
      setBusy(false);
      saveInFlightRef.current = false;
    }
  };

  if (!loaded) {
    return (
      <EditorLoadingState
        backHref={backHref}
        backLabel="返回区划列表"
        error={loadError}
        icon="map"
        status={status}
      />
    );
  }

  return (
    <VisualEditorShell
      backHref={backHref}
      editorKind="area"
      isBusy={busy}
      isDirty={dirty}
      onSave={save}
      sessionId={sessionId}
      title={area ? `编辑 ${area.name}` : '新建行政区划'}
      workspace
    >
      <RegionGeometryWorkspace
        draft={draft}
        entityLabel={values.name.trim() || '行政区划'}
        globalFields={
          <div className="transit-visual-inspector-section">
            <div className="transit-visual-inspector-section-heading">
              <p className="transit-visual-inspector-section-title">区划属性</p>
            </div>
            <Field label={<>区划名称</>}>
              <Input
                value={values.name}
                onChange={(event) => updateValues({ name: event.currentTarget.value })}
                required
              />
            </Field>
            <Field label={<>级别</>}>
              <Select
                value={values.level}
                onChange={(event) =>
                  updateValues({ level: event.currentTarget.value as AdministrativeAreaLevel })
                }
              >
                {administrativeAreaLevelOptions.map((option) => (
                  <option value={option.value} key={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={<>编码</>}>
              <Input
                value={values.code}
                onChange={(event) => updateValues({ code: event.currentTarget.value })}
                required
              />
            </Field>
            <Field label={<>上级区划</>}>
              <Select
                value={values.parentAreaId}
                onChange={(event) => updateValues({ parentAreaId: event.currentTarget.value })}
              >
                <option value="">无</option>
                {areas
                  .filter((item) => item.id !== currentAreaId && item.status !== 'archived')
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
              </Select>
            </Field>
            <Field label={<>标签位置</>}>
              <Select
                value={values.labelPositionPoiId}
                onChange={(event) =>
                  updateValues({ labelPositionPoiId: event.currentTarget.value })
                }
              >
                <option value="">自动放在区域内靠近几何中心处</option>
                {labelPoiOptions.map((marker) => (
                  <option key={marker.id} value={marker.id}>
                    绑定 POI · {marker.label}
                  </option>
                ))}
              </Select>
            </Field>
            <FieldGroup as="label" label="区划颜色">
              <span className="admin-map-area-color-control">
                <span
                  className="admin-map-area-color-swatch"
                  style={{ '--admin-map-area-color': selectedColor.color } as React.CSSProperties}
                  aria-hidden="true"
                />
                <select
                  value={values.colorBinding}
                  onChange={(event) => updateValues({ colorBinding: event.currentTarget.value })}
                >
                  <optgroup label="语义色">
                    {semanticAdministrativeAreaColorOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </optgroup>
                  {colorOptions.length > semanticAdministrativeAreaColorOptions.length ? (
                    <optgroup label="线路色">
                      {colorOptions
                        .slice(semanticAdministrativeAreaColorOptions.length)
                        .map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                    </optgroup>
                  ) : null}
                </select>
              </span>
            </FieldGroup>
            <div className="admin-map-area-opacity-grid">
              <FieldGroup as="label" label={`填充透明度 · ${values.fillOpacity}`}>
                <RangeInput
                  min={0}
                  max={1}
                  step="0.05"
                  value={Number(values.fillOpacity)}
                  onChange={(event) => updateValues({ fillOpacity: event.currentTarget.value })}
                />
              </FieldGroup>
              <FieldGroup as="label" label={`描边透明度 · ${values.strokeOpacity}`}>
                <RangeInput
                  min={0}
                  max={1}
                  step="0.05"
                  value={Number(values.strokeOpacity)}
                  onChange={(event) => updateValues({ strokeOpacity: event.currentTarget.value })}
                />
              </FieldGroup>
            </div>
            <div className="poi-visual-point-fields">
              <Field label={<>最小缩放</>}>
                <Input
                  type="number"
                  min="-20"
                  max="20"
                  step="1"
                  value={values.minZoom}
                  onChange={(event) => updateValues({ minZoom: event.currentTarget.value })}
                />
              </Field>
              <Field label={<>标签最大缩放</>}>
                <Input
                  type="number"
                  min="-20"
                  max="20"
                  step="1"
                  value={values.maxZoom}
                  onChange={(event) => updateValues({ maxZoom: event.currentTarget.value })}
                  required
                />
              </Field>
            </div>
          </div>
        }
        layerRoot={{
          icon: 'map',
          label: values.name.trim() || '区划',
          meta: formatAdministrativeAreaLevel(values.level),
        }}
        layerStatus={status}
        onChange={updateDraft}
        tilePreviewConfig={tilePreviewConfig}
      />
    </VisualEditorShell>
  );
}

function toRegionGeometryDraft(boundary: AdministrativeArea['boundary']): RegionGeometryDraft {
  const draft = createPoiGeometryDraft(boundary);
  if (isRegionGeometryDraft(draft)) {
    return draft;
  }
  return createEmptyPoiGeometryDraft('Polygon') as RegionGeometryDraft;
}

function isRegionGeometryDraft(draft: PoiGeometryDraft): draft is RegionGeometryDraft {
  return (
    draft.type === 'Rectangle' ||
    draft.type === 'MultiRectangle' ||
    draft.type === 'Polygon' ||
    draft.type === 'MultiPolygon'
  );
}
