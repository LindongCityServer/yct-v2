'use client';

import { useEffect, useMemo, useState } from 'react';
import { appPath } from '../lib/app-paths';

type MaterialFamily = 'road_sign' | 'address_sign' | 'bus_stop' | 'custom';

interface MaterialField {
  key: string;
  label: string;
  kind: 'text' | 'number' | 'select';
  required?: boolean;
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
  operator?: string;
  stationCount: number;
  stations: Array<{
    stationSourceId: string;
    stationName: string;
  }>;
}

interface MaterialDraft {
  id: string;
  templateId: string;
  templateVersion: number;
  status: 'draft' | 'pending_review' | 'approved' | 'rejected';
  createdAt: string;
  reviewReason?: string;
}

type StudioMode = 'manual' | 'server';

export function MaterialStudioPanel({
  title,
  families,
  serverSource,
}: Readonly<{
  title: string;
  families: MaterialFamily[];
  serverSource?: 'transit_line';
}>) {
  const [items, setItems] = useState<PublishedMaterialTemplate[]>([]);
  const [drafts, setDrafts] = useState<MaterialDraft[]>([]);
  const [transitLines, setTransitLines] = useState<TransitLineOption[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [mode, setMode] = useState<StudioMode>('manual');
  const [input, setInput] = useState<Record<string, string>>({});
  const [canvas, setCanvas] = useState<MaterialCanvas | null>(null);
  const [selectedLineId, setSelectedLineId] = useState('');
  const [selectedStationSourceId, setSelectedStationSourceId] = useState('');
  const [statusText, setStatusText] = useState('正在读取模板');
  const [isBusy, setIsBusy] = useState(false);

  const templates = useMemo(
    () => items.filter((item) => families.includes(item.template.family)),
    [families, items],
  );
  const selected = templates.find((item) => item.id === selectedTemplateId) ?? templates[0];
  const activeCanvas = canvas ?? selected?.template.defaultCanvas ?? null;
  const existingDraft = drafts
    .filter(
      (draft) =>
        draft.templateId === selected?.id &&
        draft.templateVersion === selected?.template.version &&
        draft.status === 'approved',
    )
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
  const selectedLine = transitLines.find((line) => line.id === selectedLineId);

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
        setStatusText(templateData.message ?? '请先登录后使用物料工作台。');
        return;
      }

      const nextItems = templateData.items ?? [];
      setItems(nextItems);
      const firstTemplate = nextItems.find((item) => families.includes(item.template.family));
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
      if (serverSource === 'transit_line') {
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
      await Promise.all(pendingRequests);
      setStatusText(firstTemplate ? '已读取可用模板。' : '当前没有可用模板。');
    } catch {
      setStatusText('物料工作台暂时不可用。');
    }
  };

  useEffect(() => {
    void loadWorkspace();
  }, []);

  useEffect(() => {
    if (!selected) {
      return;
    }
    setInput(Object.fromEntries(selected.template.fields.map((field) => [field.key, ''])));
    setCanvas(selected.template.defaultCanvas);
  }, [selected?.id, selected?.template.version]);

  const selectTemplate = (templateId: string) => {
    setSelectedTemplateId(templateId);
    setStatusText('');
  };

  const updateCanvas = <TKey extends keyof MaterialCanvas>(
    key: TKey,
    value: MaterialCanvas[TKey],
  ) => {
    setCanvas((current) => (current ? { ...current, [key]: value } : current));
  };

  const downloadBlob = async (response: Response) => {
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = `${selected?.template.title ?? title}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
  };

  const submitManualDraft = async () => {
    if (!selected || !activeCanvas) {
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
        setStatusText(created.message ?? '无法保存自定义物料。');
        return;
      }
      const submitResponse = await fetch(
        appPath(`/api/materials/drafts/${encodeURIComponent(created.id)}/submit`),
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
      );
      const submitted = (await submitResponse.json()) as MaterialDraft & { message?: string };
      if (!submitResponse.ok) {
        setStatusText(submitted.message ?? '物料已保存，但提交审核失败。');
        return;
      }
      setDrafts((current) => [submitted, ...current.filter((item) => item.id !== submitted.id)]);
      setStatusText('自定义物料已提交审核。');
    } catch {
      setStatusText('提交审核时发生网络错误。');
    } finally {
      setIsBusy(false);
    }
  };

  const exportManualDraft = async () => {
    if (!existingDraft) {
      setStatusText('当前模板尚无已通过审核的自定义物料。');
      return;
    }
    setIsBusy(true);
    try {
      const response = await fetch(appPath('/api/materials/exports'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'custom', draftId: existingDraft.id }),
      });
      if (!response.ok) {
        const data = (await response.json()) as { message?: string };
        setStatusText(data.message ?? '下载物料失败。');
        return;
      }
      await downloadBlob(response);
      setStatusText('图片已下载。');
    } catch {
      setStatusText('下载物料时发生网络错误。');
    } finally {
      setIsBusy(false);
    }
  };

  const exportFromServer = async () => {
    if (!selected || !activeCanvas || !selectedLineId) {
      setStatusText('请先选择模板和服务器线路。');
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
          source: {
            kind: 'transit_line',
            lineId: selectedLineId,
            stationSourceId: selectedStationSourceId || undefined,
          },
        }),
      });
      if (!response.ok) {
        const data = (await response.json()) as { message?: string };
        setStatusText(data.message ?? '下载物料失败。');
        return;
      }
      await downloadBlob(response);
      setStatusText('已记录本次下载并保存图片。');
    } catch {
      setStatusText('下载物料时发生网络错误。');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <section className="material-studio" aria-label={title}>
      <div className="section-heading material-studio-heading">
        <div>
          <span className="eyebrow">物料工作台</span>
          <h1>{title}</h1>
        </div>
        <p className="muted">{statusText}</p>
      </div>

      <div className="material-studio-layout">
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
          {serverSource ? (
            <div className="material-mode-switch" role="group" aria-label="数据来源">
              <button
                className={mode === 'manual' ? 'is-active' : ''}
                type="button"
                onClick={() => setMode('manual')}
              >
                手动输入
              </button>
              <button
                className={mode === 'server' ? 'is-active' : ''}
                type="button"
                onClick={() => setMode('server')}
              >
                服务器数据
              </button>
            </div>
          ) : null}
          <CanvasEditor
            canvas={activeCanvas}
            onChange={updateCanvas}
            disabled={isBusy || !selected}
          />
        </aside>

        <div className="material-studio-editor">
          {!selected ? (
            <p className="material-studio-empty">暂无可用模板。</p>
          ) : mode === 'server' && serverSource === 'transit_line' ? (
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
                  onChange={(event) => setSelectedStationSourceId(event.currentTarget.value)}
                  disabled={isBusy || !selectedLine?.stations.length}
                >
                  {selectedLine?.stations.map((station) => (
                    <option key={station.stationSourceId} value={station.stationSourceId}>
                      {station.stationName}
                    </option>
                  ))}
                </select>
              </label>
              <div className="material-action-row">
                <button
                  type="button"
                  className="is-primary"
                  onClick={() => void exportFromServer()}
                  disabled={isBusy || !selectedLineId}
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    download
                  </span>
                  下载图片
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="material-field-grid">
                {selected.template.fields.map((field) => (
                  <MaterialFieldEditor
                    key={field.key}
                    field={field}
                    value={input[field.key] ?? ''}
                    disabled={isBusy}
                    onChange={(value) =>
                      setInput((current) => ({ ...current, [field.key]: value }))
                    }
                  />
                ))}
              </div>
              <div className="material-action-row">
                <button type="button" onClick={() => void submitManualDraft()} disabled={isBusy}>
                  提交审核
                </button>
                <button
                  type="button"
                  className="is-primary"
                  onClick={() => void exportManualDraft()}
                  disabled={isBusy || !existingDraft}
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    download
                  </span>
                  下载图片
                </button>
              </div>
              {existingDraft ? <p className="muted">当前模板已有可下载的审核通过版本。</p> : null}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function CanvasEditor({
  canvas,
  disabled,
  onChange,
}: Readonly<{
  canvas: MaterialCanvas | null;
  disabled: boolean;
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
        <span>宽度（米）</span>
        <input
          type="number"
          min="0.01"
          max="64"
          step="0.01"
          value={canvas.widthM}
          onChange={(event) => onChange('widthM', Number(event.currentTarget.value))}
        />
      </label>
      <label>
        <span>高度（米）</span>
        <input
          type="number"
          min="0.01"
          max="64"
          step="0.01"
          value={canvas.heightM}
          onChange={(event) => onChange('heightM', Number(event.currentTarget.value))}
        />
      </label>
      <label>
        <span>DPI</span>
        <input
          type="number"
          min="16"
          max="1024"
          step="1"
          value={canvas.pxPerMeter}
          onChange={(event) => onChange('pxPerMeter', Number(event.currentTarget.value))}
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
