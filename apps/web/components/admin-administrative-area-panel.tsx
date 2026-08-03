'use client';

import type { AdministrativeArea, AdministrativeAreaLevel, MapGeometry } from '@yct/contracts';
import { useEffect, useState, type FormEvent } from 'react';
import { appPath } from '../lib/app-paths';
import { publishAdminDataChanged } from '../lib/client-admin-data-events';
import { AdminRefreshButton } from './admin-refresh-button';

type AreaForm = {
  code: string;
  name: string;
  level: AdministrativeAreaLevel;
  parentAreaId: string;
  boundaryText: string;
  labelX: string;
  labelZ: string;
  fillColor: string;
  fillOpacity: string;
  strokeColor: string;
  strokeOpacity: string;
  minZoom: string;
  maxZoom: string;
};

const emptyForm: AreaForm = {
  code: '',
  name: '',
  level: 'custom',
  parentAreaId: '',
  boundaryText: '',
  labelX: '',
  labelZ: '',
  fillColor: '#64748b',
  fillOpacity: '0.14',
  strokeColor: '#475569',
  strokeOpacity: '0.72',
  minZoom: '',
  maxZoom: '',
};

export function AdminAdministrativeAreaPanel() {
  const [areas, setAreas] = useState<AdministrativeArea[]>([]);
  const [target, setTarget] = useState<AdministrativeArea | null>(null);
  const [form, setForm] = useState<AreaForm>(emptyForm);
  const [status, setStatus] = useState('正在读取行政区划');
  const [busy, setBusy] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);

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

  useEffect(() => {
    void load();
  }, []);

  const edit = (area: AdministrativeArea | null) => {
    setTarget(area);
    setForm(area ? areaToForm(area) : { ...emptyForm });
    setIsEditorOpen(true);
  };

  const openCreateEditor = () => edit(null);

  const closeEditor = () => {
    setTarget(null);
    setForm(emptyForm);
    setIsEditorOpen(false);
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    let boundary: MapGeometry;
    try {
      boundary = JSON.parse(form.boundaryText) as MapGeometry;
    } catch {
      setStatus('边界 JSON 无法解析');
      return;
    }
    setBusy(true);
    try {
      const payload = {
        code: form.code.trim(),
        name: form.name.trim(),
        level: form.level,
        parentAreaId: form.parentAreaId || undefined,
        boundary,
        labelPosition:
          form.labelX.trim() && form.labelZ.trim()
            ? [Number(form.labelX), Number(form.labelZ)]
            : undefined,
        style: {
          fillColor: form.fillColor || undefined,
          fillOpacity: parseNumber(form.fillOpacity),
          strokeColor: form.strokeColor || undefined,
          strokeOpacity: parseNumber(form.strokeOpacity),
        },
        minZoom: parseNumber(form.minZoom),
        maxZoom: parseNumber(form.maxZoom),
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
            onClick={() => openCreateEditor()}
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
                {area.code} · {area.level} · {area.status}
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
            </div>
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
            <label>
              <span>边界几何 JSON</span>
              <textarea
                value={form.boundaryText}
                onChange={(event) => setForm({ ...form, boundaryText: event.currentTarget.value })}
                rows={8}
                required
              />
            </label>
            <div className="admin-poi-edit-coordinate-fields">
              <label>
                <span>标签 X</span>
                <input
                  value={form.labelX}
                  onChange={(event) => setForm({ ...form, labelX: event.currentTarget.value })}
                />
              </label>
              <label>
                <span>标签 Z</span>
                <input
                  value={form.labelZ}
                  onChange={(event) => setForm({ ...form, labelZ: event.currentTarget.value })}
                />
              </label>
              <label>
                <span>最小缩放级别</span>
                <input
                  value={form.minZoom}
                  onChange={(event) => setForm({ ...form, minZoom: event.currentTarget.value })}
                />
              </label>
              <label>
                <span>最大缩放级别</span>
                <input
                  value={form.maxZoom}
                  onChange={(event) => setForm({ ...form, maxZoom: event.currentTarget.value })}
                />
              </label>
              <label>
                <span>填充透明度</span>
                <input
                  value={form.fillOpacity}
                  onChange={(event) => setForm({ ...form, fillOpacity: event.currentTarget.value })}
                />
              </label>
              <label>
                <span>填充颜色</span>
                <input
                  type="color"
                  value={form.fillColor}
                  onChange={(event) => setForm({ ...form, fillColor: event.currentTarget.value })}
                />
              </label>
              <label>
                <span>描边透明度</span>
                <input
                  value={form.strokeOpacity}
                  onChange={(event) =>
                    setForm({ ...form, strokeOpacity: event.currentTarget.value })
                  }
                />
              </label>
              <label>
                <span>描边颜色</span>
                <input
                  type="color"
                  value={form.strokeColor}
                  onChange={(event) => setForm({ ...form, strokeColor: event.currentTarget.value })}
                />
              </label>
            </div>
            <div className="admin-content-actions">
              <button type="button" onClick={closeEditor} disabled={busy}>
                取消
              </button>
              <button type="submit" disabled={busy}>
                保存
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
    boundaryText: JSON.stringify(area.boundary, null, 2),
    labelX: area.labelPosition ? String(area.labelPosition[0]) : '',
    labelZ: area.labelPosition ? String(area.labelPosition[1]) : '',
    fillColor: area.style?.fillColor ?? emptyForm.fillColor,
    fillOpacity:
      area.style?.fillOpacity === undefined
        ? emptyForm.fillOpacity
        : String(area.style.fillOpacity),
    strokeColor: area.style?.strokeColor ?? emptyForm.strokeColor,
    strokeOpacity:
      area.style?.strokeOpacity === undefined
        ? emptyForm.strokeOpacity
        : String(area.style.strokeOpacity),
    minZoom: area.minZoom === undefined ? '' : String(area.minZoom),
    maxZoom: area.maxZoom === undefined ? '' : String(area.maxZoom),
  };
}

function parseNumber(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
