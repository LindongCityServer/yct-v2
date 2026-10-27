'use client';

import type { TransitTripLabelPool } from '@yct/contracts';

export interface TransitTripLabelDraftConfig {
  mode: 'off' | 'sequential' | 'random';
  poolIds: string[];
}

export function TransitLineTripLabelFields({
  config,
  departureTimes,
  labels,
  onConfigChange,
  onLabelsChange,
  pools,
  title,
}: Readonly<{
  config: TransitTripLabelDraftConfig;
  departureTimes: readonly string[];
  labels: Record<string, string>;
  onConfigChange: (config: TransitTripLabelDraftConfig) => void;
  onLabelsChange: (labels: Record<string, string>) => void;
  pools: readonly TransitTripLabelPool[];
  title: string;
}>) {
  const togglePool = (poolId: string) => {
    const nextPoolIds = config.poolIds.includes(poolId)
      ? config.poolIds.filter((id) => id !== poolId)
      : [...config.poolIds, poolId];
    onConfigChange({ ...config, poolIds: nextPoolIds });
  };

  return (
    <fieldset className="transit-line-trip-label-fields">
      <legend>{`${title}班次标签`}</legend>
      <div className="transit-line-trip-label-toolbar">
        <label>
          抽取方式
          <select
            value={config.mode}
            onChange={(event) =>
              onConfigChange({
                ...config,
                mode: event.currentTarget.value as TransitTripLabelDraftConfig['mode'],
              })
            }
          >
            <option value="off">不启用</option>
            <option value="sequential">按顺序抽取</option>
            <option value="random">随机抽取（每天换一批）</option>
          </select>
        </label>
        <span className="muted">
          {config.mode === 'off'
            ? '仅使用下方手动填写的标签。'
            : '多个池合并后统一抽取；手动填写的标签优先，且不会被再次分配。'}
        </span>
      </div>
      {config.mode !== 'off' ? (
        pools.length === 0 ? (
          <p className="muted">还没有可用的标签池，请先在「车队 / 机队标签池」中创建。</p>
        ) : (
          <div className="transit-line-trip-label-pool-options" aria-label="参与抽取的标签池">
            {pools.map((pool) => (
              <label key={pool.id}>
                <input
                  type="checkbox"
                  checked={config.poolIds.includes(pool.id)}
                  onChange={() => togglePool(pool.id)}
                />
                <span>{`${pool.name}（${pool.labels.length}）`}</span>
              </label>
            ))}
          </div>
        )
      ) : null}
      {departureTimes.length === 0 ? (
        <p className="muted">先填写发车时刻，之后可以给每个班次单独更名。</p>
      ) : (
        <div className="transit-line-trip-label-grid" aria-label={`${title}班次标签`}>
          {departureTimes.map((departureTime) => (
            <label className="transit-line-trip-label-row" key={departureTime}>
              <span>{departureTime}</span>
              <input
                type="text"
                maxLength={40}
                value={labels[departureTime] ?? ''}
                placeholder="自动"
                onChange={(event) => {
                  const value = event.currentTarget.value.trim();
                  const next = { ...labels };
                  if (value) {
                    next[departureTime] = value;
                  } else {
                    delete next[departureTime];
                  }
                  onLabelsChange(next);
                }}
              />
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );
}
