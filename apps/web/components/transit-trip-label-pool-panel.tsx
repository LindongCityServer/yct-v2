'use client';

import type { TransitTripLabelPool } from '@yct/contracts';
import { useEffect, useState } from 'react';
import { appPath } from '../lib/app-paths';
import {
  buildTripLabelNumberRange,
  expandTripLabelBatchText,
} from '../lib/transit-trip-label-batch';

interface DraftPool {
  id: string;
  name: string;
  labelsText: string;
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

export function TransitTripLabelPoolPanel({
  pools,
  onSaved,
}: Readonly<{
  pools: TransitTripLabelPool[];
  onSaved: (pools: TransitTripLabelPool[]) => void;
}>) {
  const [drafts, setDrafts] = useState<DraftPool[]>(() => pools.map(toDraftPool));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [statusText, setStatusText] = useState('');

  useEffect(() => {
    setDrafts(pools.map(toDraftPool));
  }, [pools]);

  const updateDraft = (poolId: string, patch: Partial<DraftPool>) => {
    setDrafts((current) =>
      current.map((pool) => (pool.id === poolId ? { ...pool, ...patch } : pool)),
    );
    setError('');
  };

  const addPool = () => {
    setDrafts((current) => [
      ...current,
      {
        id: `pool_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        name: `标签池 ${current.length + 1}`,
        labelsText: '',
      },
    ]);
  };

  const removePool = (poolId: string) => {
    setDrafts((current) => current.filter((pool) => pool.id !== poolId));
  };

  const appendLabels = (poolId: string, labels: string[]) => {
    setDrafts((current) =>
      current.map((pool) => {
        if (pool.id !== poolId) {
          return pool;
        }
        const existing = pool.labelsText
          .split('\n')
          .map((label) => label.trim())
          .filter(Boolean);
        const seen = new Set(existing);
        for (const label of labels) {
          const trimmed = label.trim();
          if (trimmed && !seen.has(trimmed)) {
            seen.add(trimmed);
            existing.push(trimmed);
          }
        }
        return { ...pool, labelsText: existing.join('\n') };
      }),
    );
    setError('');
  };

  const savePools = async () => {
    const payload: TransitTripLabelPool[] = [];
    for (const draft of drafts) {
      const name = draft.name.trim();
      if (!name) {
        setError('标签池名称不能为空。');
        return;
      }
      const labels = Array.from(
        new Set(
          draft.labelsText
            .split('\n')
            .map((label) => label.trim())
            .filter(Boolean),
        ),
      );
      payload.push({ id: draft.id, name, labels });
    }

    setBusy(true);
    setError('');
    try {
      const response = await fetch(appPath('/api/admin/transit/trip-label-pools'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pools: payload }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        items?: TransitTripLabelPool[];
        message?: string;
      };
      if (!response.ok) {
        setError(data.message ?? '保存标签池失败。');
        return;
      }
      const saved = data.items ?? [];
      onSaved(saved);
      setStatusText(`已保存 ${saved.length} 个标签池`);
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
          <span className="muted">{statusText || `共 ${drafts.length} 个标签池`}</span>
          <button type="button" disabled={busy} onClick={addPool}>
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
      {drafts.length === 0 ? (
        <p className="muted">暂无标签池。先新建一个，再用号段批量添加车辆编号。</p>
      ) : (
        <div className="transit-trip-label-pool-list">
          {drafts.map((pool) => (
            <PoolEditor
              busy={busy}
              key={pool.id}
              onAppend={(labels) => appendLabels(pool.id, labels)}
              onChange={(patch) => updateDraft(pool.id, patch)}
              onRemove={() => removePool(pool.id)}
              pool={pool}
            />
          ))}
        </div>
      )}
      {error ? <p className="muted admin-poi-dialog-error">{error}</p> : null}
      <div className="admin-toolbar">
        <button
          className="secondary-action-button is-primary"
          type="button"
          disabled={busy}
          onClick={() => void savePools()}
        >
          保存标签池
        </button>
      </div>
    </section>
  );
}

function PoolEditor({
  busy,
  onAppend,
  onChange,
  onRemove,
  pool,
}: Readonly<{
  busy: boolean;
  onAppend: (labels: string[]) => void;
  onChange: (patch: Partial<DraftPool>) => void;
  onRemove: () => void;
  pool: DraftPool;
}>) {
  const [batch, setBatch] = useState<PoolBatchState>(emptyBatchState);
  const [batchText, setBatchText] = useState('');
  const labelCount = new Set(
    pool.labelsText
      .split('\n')
      .map((label) => label.trim())
      .filter(Boolean),
  ).size;

  const appendFromText = () => {
    const result = expandTripLabelBatchText(batchText);
    if (result.labels.length > 0) {
      onAppend(result.labels);
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
    onAppend(result.labels);
    setBatch((current) => ({ ...current, rangeError: '' }));
  };

  return (
    <article className="transit-trip-label-pool-item">
      <div className="transit-trip-label-pool-head">
        <label>
          名称
          <input
            type="text"
            maxLength={40}
            value={pool.name}
            onChange={(event) => onChange({ name: event.currentTarget.value })}
          />
        </label>
        <span className="muted">{`${labelCount} 个标签`}</span>
        <button
          className="transit-profile-delete-button"
          type="button"
          disabled={busy}
          onClick={onRemove}
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            delete
          </span>
          <span>删除</span>
        </button>
      </div>
      <label>
        标签（每行一个）
        <textarea
          value={pool.labelsText}
          rows={6}
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
              onChange={(event) =>
                setBatch((current) => ({ ...current, rangePrefix: event.currentTarget.value }))
              }
            />
            <input
              type="number"
              min={0}
              value={batch.rangeStart}
              aria-label="起始号"
              onChange={(event) =>
                setBatch((current) => ({ ...current, rangeStart: event.currentTarget.value }))
              }
            />
            <span>至</span>
            <input
              type="number"
              min={0}
              value={batch.rangeEnd}
              aria-label="结束号"
              onChange={(event) =>
                setBatch((current) => ({ ...current, rangeEnd: event.currentTarget.value }))
              }
            />
            <input
              type="number"
              min={0}
              max={6}
              value={batch.rangeWidth}
              aria-label="位宽"
              placeholder="位宽"
              onChange={(event) =>
                setBatch((current) => ({ ...current, rangeWidth: event.currentTarget.value }))
              }
            />
            <button type="button" disabled={busy} onClick={appendFromRange}>
              追加
            </button>
          </span>
        </label>
        {batch.rangeError ? <small className="muted">{batch.rangeError}</small> : null}
      </div>
    </article>
  );
}

function toDraftPool(pool: TransitTripLabelPool): DraftPool {
  return {
    id: pool.id,
    name: pool.name,
    labelsText: pool.labels.join('\n'),
  };
}
