'use client';

import type {
  AdministrativeArea,
  AdministrativeAreaLevel,
  MapGeometry,
  MapMarkerSnapshot,
  MapStyleBinding,
  TileProviderDescriptor,
} from '@yct/contracts';
import { ADMINISTRATIVE_AREA_DEFAULT_MAX_ZOOM } from '@yct/contracts';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { appPath } from '../lib/app-paths';
import { publishAdminDataChanged } from '../lib/client-admin-data-events';
import { selectMapTileTemplates } from '../lib/map-tile-templates';
import { AdminRefreshButton } from './admin-refresh-button';
import {
  RegionGeometryEditor,
  type AdminMapMarker,
  type PoiTilePreviewConfig,
  type RegionMapGeometry,
} from './admin-poi-panel';

type AreaForm = {
  code: string;
  name: string;
  level: AdministrativeAreaLevel;
  parentAreaId: string;
  boundary?: RegionMapGeometry;
  boundaryType: RegionMapGeometry['type'];
  labelPositionPoiId: string;
  colorBinding: string;
  fillOpacity: string;
  strokeOpacity: string;
  minZoom: string;
  maxZoom: string;
};

interface TransitLineColor {
  color?: string;
  id: string;
  name: string;
}

interface AreaColorOption {
  color: string;
  label: string;
  lineId?: string;
  value: string;
}

const defaultColorBinding = 'semantic:neutral';
const semanticColorOptions: AreaColorOption[] = [
  { value: 'semantic:primary', label: '主色', color: '#168f78' },
  { value: 'semantic:info', label: '信息', color: '#2584e8' },
  { value: 'semantic:warning', label: '警示', color: '#f59b22' },
  { value: 'semantic:danger', label: '危险', color: '#c93a3a' },
  { value: defaultColorBinding, label: '中性', color: '#6f7775' },
];

const emptyForm: AreaForm = {
  code: '',
  name: '',
  level: 'custom',
  parentAreaId: '',
  boundaryType: 'Polygon',
  labelPositionPoiId: '',
  colorBinding: defaultColorBinding,
  fillOpacity: '0.14',
  strokeOpacity: '0.72',
  minZoom: '',
  maxZoom: String(ADMINISTRATIVE_AREA_DEFAULT_MAX_ZOOM),
};

export function AdminAdministrativeAreaPanel() {
  const [areas, setAreas] = useState<AdministrativeArea[]>([]);
  const [mapMarkers, setMapMarkers] = useState<AdminMapMarker[]>([]);
  const [transitLines, setTransitLines] = useState<TransitLineColor[]>([]);
  const [tilePreviewConfig, setTilePreviewConfig] = useState<PoiTilePreviewConfig>({});
  const [target, setTarget] = useState<AdministrativeArea | null>(null);
  const [form, setForm] = useState<AreaForm>(emptyForm);
  const [status, setStatus] = useState('正在读取行政区划');
  const [busy, setBusy] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);

  const colorOptions = useMemo(
    () => [
      ...semanticColorOptions,
      ...transitLines.flatMap((line): AreaColorOption[] =>
        isHexColor(line.color)
          ? [
              {
                value: `line:${line.id}`,
                label: `线路 · ${line.name}`,
                color: line.color,
                lineId: line.id,
              },
            ]
          : [],
      ),
    ],
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

  const load = async () => {
    try {
      const response = await fetch(appPath('/api/admin/map/administrative-areas'), {
        cache: 'no-store',
      });
      if (!response.ok) {
        setStatus('行政区划读取失败');
        return;
      }
      const data = (await response.json()) as { items?: AdministrativeArea[] };
      setAreas(data.items ?? []);
      setStatus(`共 ${data.items?.length ?? 0} 个行政区划`);
    } catch {
      setStatus('行政区划读取失败，请检查网络后重试');
    }
  };

  const loadEditorSources = async () => {
    const [markerResponse, tileResponse, transitResponse] = await Promise.all([
      fetch(appPath('/api/map/markers'), { cache: 'no-store' }).catch(() => null),
      fetch(appPath('/api/map/tile-providers'), { cache: 'no-store' }).catch(() => null),
      fetch(appPath('/api/transit/overview'), { cache: 'no-store' }).catch(() => null),
    ]);

    if (markerResponse?.ok) {
      const data = (await markerResponse.json()) as { snapshot?: MapMarkerSnapshot };
      setMapMarkers(data.snapshot?.markers ?? []);
    }
    if (tileResponse?.ok) {
      const data = (await tileResponse.json()) as { items?: TileProviderDescriptor[] };
      setTilePreviewConfig(selectMapTileTemplates(data.items ?? []));
    }
    if (transitResponse?.ok) {
      const data = (await transitResponse.json()) as { lines?: TransitLineColor[] };
      setTransitLines(data.lines ?? []);
    }
  };

  useEffect(() => {
    void Promise.all([load(), loadEditorSources()]);
  }, []);

  const edit = (area: AdministrativeArea | null) => {
    setTarget(area);
    setForm(area ? areaToForm(area) : { ...emptyForm });
    setIsEditorOpen(true);
  };

  const closeEditor = () => {
    setTarget(null);
    setForm(emptyForm);
    setIsEditorOpen(false);
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.boundary) {
      setStatus('请在地图中完成行政区划边界');
      return;
    }
    const colorOption = colorOptions.find((option) => option.value === form.colorBinding);
    if (!colorOption) {
      setStatus('请选择有效的语义色或线路色');
      return;
    }

    setBusy(true);
    try {
      const payload = {
        code: form.code.trim(),
        name: form.name.trim(),
        level: form.level,
        parentAreaId: form.parentAreaId || null,
        boundary: form.boundary,
        labelPositionPoiId: form.labelPositionPoiId || null,
        labelPosition: null,
        style: buildAreaStyle(form, colorOption),
        minZoom: parseNumber(form.minZoom) ?? null,
        maxZoom: parseNumber(form.maxZoom) ?? ADMINISTRATIVE_AREA_DEFAULT_MAX_ZOOM,
      };
      const response = await fetch(
        target
          ? appPath(`/api/admin/map/administrative-areas/${encodeURIComponent(target.id)}`)
          : appPath('/api/admin/map/administrative-areas'),
        {
          method: target ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      const data = (await response.json()) as { message?: string };
      if (!response.ok) {
        setStatus(data.message ?? '行政区划保存失败');
        return;
      }
      setStatus(target ? '行政区划已保存' : '行政区划已创建为草稿');
      closeEditor();
      publishAdminDataChanged({
        resource: 'administrative-areas',
        reason: target ? 'record_updated' : 'record_created',
        occurredAt: new Date().toISOString(),
      });
      await load();
    } catch {
      setStatus('行政区划保存失败，请检查网络后重试');
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async (
    area: AdministrativeArea,
    action: 'publish' | 'archive' | 'restore',
  ) => {
    setBusy(true);
    try {
      const response = await fetch(
        appPath(`/api/admin/map/administrative-areas/${encodeURIComponent(area.id)}/status`),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
        },
      );
      const data = (await response.json()) as { message?: string };
      setStatus(response.ok ? '行政区划状态已更新' : (data.message ?? '状态更新失败'));
      if (response.ok) {
        publishAdminDataChanged({
          resource: 'administrative-areas',
          reason: 'status_changed',
          occurredAt: new Date().toISOString(),
        });
        await load();
      }
    } catch {
      setStatus('行政区划状态更新失败，请检查网络后重试');
    } finally {
      setBusy(false);
    }
  };

  const selectedColor =
    colorOptions.find((option) => option.value === form.colorBinding) ??
    semanticColorOptions.at(-1)!;

  return (
    <section className="admin-map-area-panel">
      <div className="section-heading">
        <div>
          <h2>行政区划</h2>
          <p className="muted">独立于 POI 的边界、层级和公开状态。</p>
        </div>
        <div className="admin-content-actions">
          <AdminRefreshButton
            disabled={busy}
            label="刷新区划"
            onRefresh={load}
            resource="administrative-areas"
          />
          <button
            type="button"
            className="secondary-action-button"
            disabled={busy}
            onClick={() => edit(null)}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              add
            </span>
            新建
          </button>
        </div>
      </div>
      <p className="map-source-note">{status}</p>
      <div className="admin-map-area-list">
        {areas.map((area) => (
          <article className="admin-map-area-item" key={area.id}>
            <div>
              <strong>{area.name}</strong>
              <span className="muted">
                {area.code} · {formatAreaLevel(area.level)} · {formatAreaStatus(area.status)} ·
                {` 标签最大缩放 ${area.maxZoom ?? ADMINISTRATIVE_AREA_DEFAULT_MAX_ZOOM}`}
              </span>
            </div>
            <div className="admin-content-actions">
              <button type="button" onClick={() => edit(area)} disabled={busy}>
                编辑
              </button>
              {area.status === 'draft' ? (
                <button
                  type="button"
                  onClick={() => void changeStatus(area, 'publish')}
                  disabled={busy}
                >
                  发布
                </button>
              ) : null}
              {area.status === 'archived' ? (
                <button
                  type="button"
                  onClick={() => void changeStatus(area, 'restore')}
                  disabled={busy}
                >
                  恢复草稿
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void changeStatus(area, 'archive')}
                  disabled={busy}
                >
                  归档
                </button>
              )}
            </div>
          </article>
        ))}
        {areas.length === 0 ? (
          <p className="muted admin-map-area-empty">当前还没有行政区划记录，可以直接新建草稿。</p>
        ) : null}
      </div>
      {isEditorOpen ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={closeEditor}>
          <form
            className="modal-panel admin-map-area-editor"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-map-area-editor-title"
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={save}
          >
            <div className="section-heading">
              <h3 id="admin-map-area-editor-title">{target ? '编辑行政区划' : '新建行政区划'}</h3>
              <button
                className="icon-button"
                type="button"
                aria-label="关闭行政区划编辑器"
                title="关闭"
                onClick={closeEditor}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  close
                </span>
              </button>
            </div>

            <fieldset className="admin-map-area-fieldset">
              <legend>基础信息</legend>
              <div className="admin-poi-edit-coordinate-fields">
                <label>
                  <span>代码</span>
                  <input
                    value={form.code}
                    onChange={(event) => setForm({ ...form, code: event.currentTarget.value })}
                    required
                  />
                </label>
                <label>
                  <span>名称</span>
                  <input
                    value={form.name}
                    onChange={(event) => setForm({ ...form, name: event.currentTarget.value })}
                    required
                  />
                </label>
                <label>
                  <span>层级</span>
                  <select
                    value={form.level}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        level: event.currentTarget.value as AdministrativeAreaLevel,
                      })
                    }
                  >
                    <option value="country">国家</option>
                    <option value="province">省级</option>
                    <option value="prefecture">地级</option>
                    <option value="county">县级</option>
                    <option value="township">乡镇</option>
                    <option value="custom">自定义</option>
                  </select>
                </label>
                <label>
                  <span>上级区划</span>
                  <select
                    value={form.parentAreaId}
                    onChange={(event) =>
                      setForm({ ...form, parentAreaId: event.currentTarget.value })
                    }
                  >
                    <option value="">无</option>
                    {areas
                      .filter((area) => area.id !== target?.id && area.status !== 'archived')
                      .map((area) => (
                        <option key={area.id} value={area.id}>
                          {area.name}
                        </option>
                      ))}
                  </select>
                </label>
              </div>
            </fieldset>

            <fieldset className="admin-map-area-fieldset">
              <legend>地图边界</legend>
              <label>
                <span>几何类型</span>
                <select
                  value={form.boundaryType}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      boundary: undefined,
                      boundaryType: event.currentTarget.value as RegionMapGeometry['type'],
                    })
                  }
                >
                  <option value="Rectangle">矩形区域</option>
                  <option value="MultiRectangle">多矩形区域</option>
                  <option value="Polygon">多边形区域</option>
                  <option value="MultiPolygon">多重多边形区域</option>
                </select>
              </label>
              <RegionGeometryEditor
                geometryType={form.boundaryType}
                markers={mapMarkers}
                onChange={(boundary) => setForm((current) => ({ ...current, boundary }))}
                tilePreviewConfig={tilePreviewConfig}
                value={form.boundary}
              />
            </fieldset>

            <fieldset className="admin-map-area-fieldset">
              <legend>标签与缩放</legend>
              <label>
                <span>标签位置</span>
                <select
                  value={form.labelPositionPoiId}
                  onChange={(event) =>
                    setForm({ ...form, labelPositionPoiId: event.currentTarget.value })
                  }
                >
                  <option value="">自动放在区域内靠近几何中心处</option>
                  {labelPoiOptions.map((marker) => (
                    <option key={marker.id} value={marker.id}>
                      绑定 POI · {marker.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="admin-poi-edit-coordinate-fields">
                <label>
                  <span>最小缩放级别</span>
                  <input
                    type="number"
                    min="-20"
                    max="20"
                    step="1"
                    value={form.minZoom}
                    onChange={(event) => setForm({ ...form, minZoom: event.currentTarget.value })}
                  />
                </label>
                <label>
                  <span>标签最大缩放级别</span>
                  <input
                    type="number"
                    min="-20"
                    max="20"
                    step="1"
                    value={form.maxZoom}
                    onChange={(event) => setForm({ ...form, maxZoom: event.currentTarget.value })}
                    required
                  />
                </label>
              </div>
            </fieldset>

            <fieldset className="admin-map-area-fieldset">
              <legend>样式</legend>
              <label>
                <span>区划颜色</span>
                <span className="admin-map-area-color-control">
                  <span
                    className="admin-map-area-color-swatch"
                    style={{ '--admin-map-area-color': selectedColor.color } as React.CSSProperties}
                    aria-hidden="true"
                  />
                  <select
                    value={form.colorBinding}
                    onChange={(event) =>
                      setForm({ ...form, colorBinding: event.currentTarget.value })
                    }
                  >
                    <optgroup label="语义色">
                      {semanticColorOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </optgroup>
                    {colorOptions.length > semanticColorOptions.length ? (
                      <optgroup label="线路色">
                        {colorOptions.slice(semanticColorOptions.length).map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </optgroup>
                    ) : null}
                  </select>
                </span>
              </label>
              <div className="admin-map-area-opacity-grid">
                <label>
                  <span>填充透明度 · {form.fillOpacity}</span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={form.fillOpacity}
                    onChange={(event) =>
                      setForm({ ...form, fillOpacity: event.currentTarget.value })
                    }
                  />
                </label>
                <label>
                  <span>描边透明度 · {form.strokeOpacity}</span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={form.strokeOpacity}
                    onChange={(event) =>
                      setForm({ ...form, strokeOpacity: event.currentTarget.value })
                    }
                  />
                </label>
              </div>
            </fieldset>

            <div className="admin-content-actions">
              <button type="button" onClick={closeEditor} disabled={busy}>
                取消
              </button>
              <button type="submit" disabled={busy}>
                {busy ? '保存中' : '保存'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}

function areaToForm(area: AdministrativeArea): AreaForm {
  return {
    ...emptyForm,
    code: area.code,
    name: area.name,
    level: area.level,
    parentAreaId: area.parentAreaId ?? '',
    boundary: area.boundary as RegionMapGeometry,
    boundaryType: area.boundary.type as RegionMapGeometry['type'],
    labelPositionPoiId: area.labelPositionPoiId ?? '',
    colorBinding: getAreaColorBinding(area),
    fillOpacity:
      area.style?.fillOpacity === undefined
        ? emptyForm.fillOpacity
        : String(area.style.fillOpacity),
    strokeOpacity:
      area.style?.strokeOpacity === undefined
        ? emptyForm.strokeOpacity
        : String(area.style.strokeOpacity),
    minZoom: area.minZoom === undefined ? '' : String(area.minZoom),
    maxZoom: String(area.maxZoom ?? ADMINISTRATIVE_AREA_DEFAULT_MAX_ZOOM),
  };
}

function buildAreaStyle(form: AreaForm, option: AreaColorOption): MapStyleBinding {
  const opacity = {
    fillOpacity: parseNumber(form.fillOpacity),
    strokeOpacity: parseNumber(form.strokeOpacity),
  };
  return option.lineId
    ? { ...opacity, lineColorTransitLineIds: [option.lineId] }
    : { ...opacity, fillColor: option.color, strokeColor: option.color };
}

function getAreaColorBinding(area: AdministrativeArea): string {
  const lineId = area.style?.lineColorTransitLineIds?.[0];
  if (lineId) {
    return `line:${lineId}`;
  }
  const color = area.style?.strokeColor ?? area.style?.fillColor;
  return (
    semanticColorOptions.find((option) => option.color.toLowerCase() === color?.toLowerCase())
      ?.value ?? defaultColorBinding
  );
}

function getGeometryRepresentativeCoordinate(geometry: MapGeometry): [number, number] | undefined {
  const coordinates =
    geometry.type === 'Point'
      ? [geometry.coordinates]
      : geometry.type === 'MultiPoint' || geometry.type === 'LineString'
        ? geometry.coordinates
        : geometry.type === 'Rectangle'
          ? rectangleCoordinates(geometry.bounds)
          : geometry.type === 'MultiRectangle'
            ? geometry.rectangles.flatMap(rectangleCoordinates)
            : geometry.type === 'Polygon'
              ? geometry.coordinates.flat()
              : geometry.coordinates.flat(2);
  if (coordinates.length === 0) return undefined;
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
  return [(bounds.minX + bounds.maxX) / 2, (bounds.minZ + bounds.maxZ) / 2];
}

function rectangleCoordinates(bounds: {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}): Array<[number, number]> {
  return [
    [bounds.minX, bounds.minZ],
    [bounds.maxX, bounds.minZ],
    [bounds.maxX, bounds.maxZ],
    [bounds.minX, bounds.maxZ],
  ];
}

function parseNumber(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isHexColor(value: string | undefined): value is string {
  return Boolean(value && /^#[0-9a-f]{6}$/i.test(value));
}

function formatAreaLevel(level: AdministrativeAreaLevel): string {
  return {
    country: '国家',
    province: '省级',
    prefecture: '地级',
    county: '县级',
    township: '乡镇',
    custom: '自定义',
  }[level];
}

function formatAreaStatus(status: AdministrativeArea['status']): string {
  return { draft: '草稿', published: '已发布', archived: '已归档' }[status];
}
