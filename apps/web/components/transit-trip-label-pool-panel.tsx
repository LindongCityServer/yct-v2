'use client';

import type { TransitTripLabelPool } from '@yct/contracts';
import { useEffect, useState } from 'react';
import { appPath } from '../lib/app-paths';
import {
  buildTripLabelNumberRange,
  expandTripLabelBatchText,
} from '../lib/transit-trip-label-batch';

interface PoolDraft {
  id: string;
  name: string;
  labelsText: string;
  ruleText: string;
  maxConsecutiveTrips: string;
  maxContinuousWorkMinutes: string;
  mandatoryRestMinutes: string;
  isNew: boolean;
}

interface PoolBatchState {
  rangePrefix: string;
  rangeStart: string;
  rangeEnd: string;
  rangeWidth: string;
  rangeError: string;
}

const emptyBatchState: PoolBatchState = {
  rangePrefix: '',
  rangeStart: '1',
  rangeEnd: '10',
  rangeWidth: '',
  rangeError: '',
};

/** 与服务端 schema 保持一致，便于在提交前给出具体字段提示。 */
const poolLimitFields = [
  { key: 'maxConsecutiveTrips', label: '最大连续班次数', max: 999, unit: '' },
  { key: 'maxContinuousWorkMinutes', label: '最大连续值乘时长', max: 1440, unit: '分钟' },
  { key: 'mandatoryRestMinutes', label: '强制休息时长', max: 1440, unit: '分钟' },
] as const;

const poolFieldLabels: Record<string, string> = {
  name: '标签池标题',
  labels: '标签',
  ruleText: '标签规则',
  maxConsecutiveTrips: '最大连续班次数',
  maxContinuousWorkMinutes: '最大连续值乘时长',
  mandatoryRestMinutes: '强制休息时长',
};

export function TransitTripLabelPoolPanel({
  pools,
  onSaved,
}: Readonly<{
  pools: TransitTripLabelPool[];
  onSaved: (pools: TransitTripLabelPool[]) => void;
}>) {
  const [editing, setEditing] = useState<PoolDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [statusText, setStatusText] = useState('');
  const [selectedPoolIds, setSelectedPoolIds] = useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => {
    // 列表刷新时只关闭“已被删除”的编辑态；正在新建或编辑的草稿不能被自动关闭。
    setEditing((current) => {
      if (!current || current.isNew) {
        return current;
      }
      return pools.some((pool) => pool.id === current.id) ? current : null;
    });
    setSelectedPoolIds((current) => {
      if (current.size === 0) {
        return current;
      }
      const next = new Set(
        Array.from(current).filter((id) => pools.some((pool) => pool.id === id)),
      );
      return next.size === current.size ? current : next;
    });
  }, [pools]);

  const putPools = async (
    nextPools: TransitTripLabelPool[],
  ): Promise<TransitTripLabelPool[] | null> => {
    try {
      const response = await fetch(appPath('/api/admin/transit/trip-label-pools'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pools: nextPools }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        items?: TransitTripLabelPool[];
        message?: string;
        issues?: Array<{ path?: Array<string | number>; message?: string }>;
      };
      if (!response.ok) {
        setError(formatPoolSaveError(data));
        return null;
      }
      return data.items ?? [];
    } catch {
      setError('保存标签池失败，请检查网络后重试。');
      return null;
    }
  };

  const submit = async (draft: PoolDraft) => {
    const name = draft.name.trim();
    if (!name) {
      setError('标签池名称不能为空。');
      return;
    }
    const limitError = validatePoolLimits(draft);
    if (limitError) {
      setError(limitError);
      return;
    }
    const labels = parseLabelsText(draft.labelsText);
    const nextPools = draft.isNew
      ? [...pools, toPayload(draft, name, labels)]
      : pools.map((pool) => (pool.id === draft.id ? toPayload(draft, name, labels) : pool));

    setBusy(true);
    setError('');
    try {
      const saved = await putPools(nextPools);
      if (!saved) {
        return;
      }
      onSaved(saved);
      setEditing(null);
      setStatusText(`已保存 ${saved.length} 个标签池`);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (pool: TransitTripLabelPool) => {
    if (!window.confirm(`确认删除标签池“${pool.name}”？已引用该池的线路会失去这批标签。`)) {
      return;
    }
    setBusy(true);
    setError('');
    try {
      const saved = await putPools(pools.filter((item) => item.id !== pool.id));
      if (!saved) {
        return;
      }
      onSaved(saved);
      setStatusText(`已删除标签池“${pool.name}”`);
    } finally {
      setBusy(false);
    }
  };

  const allSelected = pools.length > 0 && pools.every((pool) => selectedPoolIds.has(pool.id));

  const togglePoolSelected = (poolId: string) => {
    setSelectedPoolIds((current) => {
      const next = new Set(current);
      if (next.has(poolId)) {
        next.delete(poolId);
      } else {
        next.add(poolId);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedPoolIds(allSelected ? new Set() : new Set(pools.map((pool) => pool.id)));
  };

  const removeSelected = async () => {
    const selectedCount = selectedPoolIds.size;
    if (selectedCount === 0) {
      return;
    }
    if (
      !window.confirm(
        `确认删除选中的 ${selectedCount} 个标签池？已引用这些池的线路会失去对应标签。`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError('');
    try {
      const saved = await putPools(pools.filter((pool) => !selectedPoolIds.has(pool.id)));
      if (!saved) {
        return;
      }
      onSaved(saved);
      setSelectedPoolIds(new Set());
      setStatusText(`已删除 ${selectedCount} 个标签池`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      className="transit-trip-label-pool-panel"
      aria-labelledby="transit-trip-label-pool-title"
    >
      <div className="section-heading">
        <h2 id="transit-trip-label-pool-title">车队 / 机队标签池</h2>
        <div className="transit-entity-heading-actions">
          <span className="muted">{statusText || `共 ${pools.length} 个标签池`}</span>
          {pools.length > 0 ? (
            <label className="transit-trip-label-pool-select-all">
              <input
                type="checkbox"
                checked={allSelected}
                disabled={busy}
                onChange={toggleSelectAll}
              />
              全选
            </label>
          ) : null}
          {selectedPoolIds.size > 0 ? (
            <button type="button" disabled={busy} onClick={() => void removeSelected()}>
              删除选中（{selectedPoolIds.size}）
            </button>
          ) : null}
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              setEditing({
                id: createPoolId(),
                name: '',
                labelsText: '',
                ruleText: '',
                maxConsecutiveTrips: '',
                maxContinuousWorkMinutes: '240',
                mandatoryRestMinutes: '120',
                isNew: true,
              })
            }
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              add
            </span>
            <span>新建标签池</span>
          </button>
        </div>
      </div>
      <p className="muted">
        标签池可被多条线路、多个方向同时引用；随机抽取每天换一批，但同一天所有用户看到的结果一致。
        同一标签在同一时刻只会分配给一辆在途班次，跨线路同样生效。
      </p>
      {pools.length === 0 ? (
        <p className="muted">暂无标签池。先新建一个，再用号段批量添加车辆编号。</p>
      ) : (
        <ul className="transit-trip-label-pool-list" aria-label="标签池列表">
          {pools.map((pool) => {
            const selected = selectedPoolIds.has(pool.id);
            return (
              <li
                className={[
                  'admin-content-item',
                  'admin-content-record-item',
                  'transit-trip-label-pool-card',
                  selected ? 'is-selected' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                key={pool.id}
              >
                <input
                  type="checkbox"
                  checked={selected}
                  disabled={busy}
                  aria-label={`选择标签池 ${pool.name}`}
                  onChange={() => togglePoolSelected(pool.id)}
                />
                <div className="transit-trip-label-pool-card-main">
                  <div className="transit-trip-label-pool-card-head">
                    <strong>{pool.name}</strong>
                    <span className="transit-trip-label-pool-count">{`${pool.labels.length} 个标签`}</span>
                  </div>
                  <p
                    className="transit-trip-label-pool-card-rule"
                    title={pool.ruleText || '手动维护'}
                  >
                    {pool.ruleText || '手动维护'}
                  </p>
                  <p className="transit-trip-label-pool-card-meta">
                    <span>{pool.createdBy || pool.updatedBy || '未知'}</span>
                    <span>{formatPoolTime(pool.updatedAt)}</span>
                  </p>
                </div>
                <div className="admin-content-actions">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      setEditing({
                        id: pool.id,
                        name: pool.name,
                        labelsText: pool.labels.join('\n'),
                        ruleText: pool.ruleText ?? '',
                        maxConsecutiveTrips:
                          pool.maxConsecutiveTrips === undefined
                            ? ''
                            : String(pool.maxConsecutiveTrips),
                        maxContinuousWorkMinutes:
                          pool.maxContinuousWorkMinutes === undefined
                            ? '240'
                            : String(pool.maxContinuousWorkMinutes),
                        mandatoryRestMinutes:
                          pool.mandatoryRestMinutes === undefined
                            ? '120'
                            : String(pool.mandatoryRestMinutes),
                        isNew: false,
                      })
                    }
                  >
                    编辑
                  </button>
                  <button type="button" disabled={busy} onClick={() => void remove(pool)}>
                    删除
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {error && !editing ? <p className="muted admin-poi-dialog-error">{error}</p> : null}
      {editing ? (
        <PoolDialog
          busy={busy}
          draft={editing}
          error={error}
          onCancel={() => {
            setEditing(null);
            setError('');
          }}
          onChange={(patch) => {
            setEditing((current) => (current ? { ...current, ...patch } : current));
            setError('');
          }}
          onSubmit={(draft) => void submit(draft)}
        />
      ) : null}
    </section>
  );
}

function PoolDialog({
  busy,
  draft,
  error,
  onCancel,
  onChange,
  onSubmit,
}: Readonly<{
  busy: boolean;
  draft: PoolDraft;
  error: string;
  onCancel: () => void;
  onChange: (patch: Partial<PoolDraft>) => void;
  onSubmit: (draft: PoolDraft) => void;
}>) {
  const [batch, setBatch] = useState<PoolBatchState>(emptyBatchState);
  const [batchText, setBatchText] = useState('');
  const labelCount = parseLabelsText(draft.labelsText).length;

  const appendLabels = (labels: string[], ruleText: string) => {
    if (labels.length === 0) {
      return;
    }
    const existing = parseLabelsText(draft.labelsText);
    const seen = new Set(existing);
    for (const label of labels) {
      const trimmed = label.trim();
      if (trimmed && !seen.has(trimmed)) {
        seen.add(trimmed);
        existing.push(trimmed);
      }
    }
    onChange({ labelsText: existing.join('\n'), ruleText });
  };

  const appendFromText = () => {
    const result = expandTripLabelBatchText(batchText);
    if (result.labels.length > 0) {
      appendLabels(result.labels, batchText.trim().slice(0, 120));
    }
    setBatch((current) => ({ ...current, rangeError: result.errors.join(' ') }));
    setBatchText('');
  };

  const appendFromRange = () => {
    const result = buildTripLabelNumberRange({
      prefix: batch.rangePrefix,
      start: Number(batch.rangeStart),
      end: Number(batch.rangeEnd),
      width: batch.rangeWidth.trim() ? Number(batch.rangeWidth) : undefined,
    });
    if (result.labels.length === 0) {
      setBatch((current) => ({
        ...current,
        rangeError: result.errors.join(' ') || '号段没有生成任何标签。',
      }));
      return;
    }
    appendLabels(
      result.labels,
      [
        batch.rangePrefix.trim() ? `前缀 ${batch.rangePrefix.trim()}` : '无前缀',
        `${batch.rangeStart || 0}-${batch.rangeEnd || 0}`,
        batch.rangeWidth.trim() ? `位宽 ${batch.rangeWidth.trim()}` : '',
      ]
        .filter(Boolean)
        .join(' · ')
        .slice(0, 120),
    );
    setBatch((current) => ({ ...current, rangeError: '' }));
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onCancel}>
      <div
        className="modal-panel admin-transit-dialog transit-trip-label-pool-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="transit-trip-label-pool-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="section-heading">
          <h2 id="transit-trip-label-pool-dialog-title">
            {draft.isNew ? '新建标签池' : '编辑标签池'}
          </h2>
          <span className="muted">{`${labelCount} 个标签`}</span>
        </div>
        <label>
          标题
          <input
            type="text"
            maxLength={40}
            value={draft.name}
            autoFocus
            onChange={(event) => onChange({ name: event.currentTarget.value })}
          />
        </label>
        <label>
          标签（每行一个）
          <textarea
            rows={8}
            value={draft.labelsText}
            onChange={(event) => onChange({ labelsText: event.currentTarget.value })}
          />
        </label>
        <div className="transit-trip-label-batch">
          <label>
            文本批量添加
            <span className="transit-trip-label-batch-row">
              <input
                type="text"
                value={batchText}
                placeholder="例如：临东1-临东30，临东32"
                onChange={(event) => setBatchText(event.currentTarget.value)}
              />
              <button type="button" disabled={busy} onClick={appendFromText}>
                追加
              </button>
            </span>
          </label>
          <label>
            号段批量添加
            <span className="transit-trip-label-range-row">
              <input
                type="text"
                value={batch.rangePrefix}
                placeholder="前缀"
                maxLength={20}
                onChange={(event) => {
                  // 事件对象在状态更新回调执行前会被置空，先取值再更新。
                  const value = event.currentTarget.value;
                  setBatch((current) => ({ ...current, rangePrefix: value }));
                }}
              />
              <input
                type="number"
                min={0}
                value={batch.rangeStart}
                aria-label="起始号"
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setBatch((current) => ({ ...current, rangeStart: value }));
                }}
              />
              <span>至</span>
              <input
                type="number"
                min={0}
                value={batch.rangeEnd}
                aria-label="结束号"
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setBatch((current) => ({ ...current, rangeEnd: value }));
                }}
              />
              <input
                type="number"
                min={0}
                max={6}
                value={batch.rangeWidth}
                aria-label="位宽"
                placeholder="位宽"
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setBatch((current) => ({ ...current, rangeWidth: value }));
                }}
              />
              <button type="button" disabled={busy} onClick={appendFromRange}>
                追加
              </button>
            </span>
          </label>
          {batch.rangeError ? <small className="muted">{batch.rangeError}</small> : null}
        </div>
        <label>
          标签规则
          <input
            type="text"
            maxLength={120}
            value={draft.ruleText}
            placeholder="留空时列表显示“手动维护”"
            onChange={(event) => onChange({ ruleText: event.currentTarget.value })}
          />
        </label>
        <fieldset className="transit-trip-label-pool-limits">
          <legend>排班约束</legend>
          <p className="muted">
            连续值乘累计各段运行时间与终点短等待，不含强制休息；达到任一上限后等待强制休息时长，再就近发出下一班。
          </p>
          <div>
            <label>
              最大连续班次数（0–999）
              <input
                type="number"
                min={0}
                max={999}
                value={draft.maxConsecutiveTrips}
                placeholder="不限制"
                onChange={(event) => onChange({ maxConsecutiveTrips: event.currentTarget.value })}
              />
            </label>
            <label>
              最大连续值乘时长（分钟，0–1440）
              <input
                type="number"
                min={0}
                max={1440}
                value={draft.maxContinuousWorkMinutes}
                placeholder="240"
                onChange={(event) =>
                  onChange({ maxContinuousWorkMinutes: event.currentTarget.value })
                }
              />
            </label>
            <label>
              强制休息时长（分钟，0–1440）
              <input
                type="number"
                min={0}
                max={1440}
                value={draft.mandatoryRestMinutes}
                placeholder="120"
                onChange={(event) => onChange({ mandatoryRestMinutes: event.currentTarget.value })}
              />
            </label>
          </div>
        </fieldset>
        {error ? <p className="muted admin-poi-dialog-error">{error}</p> : null}
        <div className="admin-content-actions">
          <button type="button" disabled={busy} onClick={onCancel}>
            取消
          </button>
          <button type="button" disabled={busy} onClick={() => onSubmit(draft)}>
            {draft.isNew ? '创建标签池' : '保存标签池'}
          </button>
        </div>
      </div>
    </div>
  );
}

function validatePoolLimits(draft: PoolDraft): string | undefined {
  for (const field of poolLimitFields) {
    const raw = draft[field.key].trim();
    if (!raw) {
      continue;
    }
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 0 || value > field.max) {
      return formatPoolLimitMessage(field);
    }
  }
  return undefined;
}

function formatPoolLimitMessage(field: (typeof poolLimitFields)[number]): string {
  return `${field.label}需填写 0–${field.max} 之间的整数${field.unit ? `（${field.unit}）` : ''}。`;
}

/** 服务端 schema 校验失败时，尽量指出具体字段而不是只显示笼统提示。 */
function formatPoolSaveError(data: {
  message?: string;
  issues?: Array<{ path?: Array<string | number>; message?: string }>;
}): string {
  const issue = data.issues?.[0];
  const fieldKey = issue?.path?.find(
    (part): part is string => typeof part === 'string' && part in poolFieldLabels,
  );
  if (fieldKey) {
    const limitField = poolLimitFields.find((field) => field.key === fieldKey);
    return limitField
      ? formatPoolLimitMessage(limitField)
      : `${poolFieldLabels[fieldKey]}不符合要求。`;
  }
  return data.message ?? '保存标签池失败。';
}

function parseLabelsText(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split('\n')
        .map((label) => label.trim())
        .filter(Boolean),
    ),
  );
}

function toPayload(draft: PoolDraft, name: string, labels: string[]): TransitTripLabelPool {
  return {
    id: draft.id,
    name,
    labels,
    ruleText: draft.ruleText.trim() || undefined,
    maxConsecutiveTrips: parseOptionalMinutes(draft.maxConsecutiveTrips),
    maxContinuousWorkMinutes: parseOptionalMinutes(draft.maxContinuousWorkMinutes),
    mandatoryRestMinutes: parseOptionalMinutes(draft.mandatoryRestMinutes),
  };
}

function parseOptionalMinutes(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const parsed = Number(trimmed);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

function createPoolId(): string {
  return `pool_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function formatPoolTime(value?: string): string {
  if (!value) {
    return '—';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  // 固定按东八区展示，避免服务端与浏览器时区不同导致水合不一致。
  const shifted = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  const pad = (input: number) => String(input).padStart(2, '0');
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(
    shifted.getUTCDate(),
  )} ${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`;
}
