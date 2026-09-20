'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';

// 交通方式 chip 的固定几何（与 globals.css 中 .map-route-mode-toggle-list button 对齐）：
// 圆钮宽 30px、钮间距 8px；全选钮同样为 30px。
const CHIP_WIDTH = 30;
const CHIP_GAP = 8;
const SELECT_ALL_WIDTH = 30;
// 展开钮含 18px 图标、左右 8px 内边距、4px 间距与 “+N” 计数文字，预留 60px。
const MORE_BUTTON_WIDTH = 60;

export interface RouteModeToggleOption {
  mode: string;
  icon: string;
  color: string;
  label: string;
  taxi?: boolean;
}

export interface RouteModeToggleListLabels {
  groupAria: string;
  all: string;
  more: (count: number) => string;
  collapse: string;
}

// 方式切换条：折叠态始终单行，按容器实测宽度决定可见 chip 数；
// 全部放得下时隐藏展开钮；放不下时展开钮以 margin-left:auto 与可见钮拉开弹性空格。
export function RouteModeToggleList({
  options,
  enabledModes,
  allModesEnabled,
  onToggle,
  onSetAll,
  labels,
}: Readonly<{
  options: ReadonlyArray<RouteModeToggleOption>;
  enabledModes: Readonly<Record<string, boolean>>;
  allModesEnabled: boolean;
  onToggle: (mode: string) => void;
  onSetAll: (enabled: boolean) => void;
  labels: RouteModeToggleListLabels;
}>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [containerWidth, setContainerWidth] = useState(0);

  useLayoutEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const update = () => setContainerWidth(element.clientWidth);
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const modeCount = options.length;
  // 单行铺满所需宽度：全选钮 + 全部 chip 与各自间距（不含展开钮）。
  const allFitWidth =
    SELECT_ALL_WIDTH + CHIP_GAP + modeCount * CHIP_WIDTH + (modeCount - 1) * CHIP_GAP;
  const allFit = containerWidth > 0 && containerWidth >= allFitWidth;

  const visibleOptions = expanded || allFit ? options : computeVisibleOptions(options, containerWidth);
  const visibleCount = visibleOptions.length;
  const hiddenCount = modeCount - visibleCount;
  const hiddenEnabledCount = options
    .slice(visibleCount)
    .filter((option) => enabledModes[option.mode]).length;
  const showMoreButton = expanded || (!allFit && hiddenCount > 0);

  return (
    <div
      ref={containerRef}
      className={
        expanded ? 'map-route-mode-toggle-list is-expanded' : 'map-route-mode-toggle-list is-collapsed'
      }
      aria-label={labels.groupAria}
    >
      <button
        className={allModesEnabled ? 'is-active' : ''}
        type="button"
        aria-label={labels.all}
        title={labels.all}
        aria-pressed={allModesEnabled}
        onClick={() => onSetAll(!allModesEnabled)}
      >
        <span className="material-symbols-outlined" aria-hidden="true">
          {allModesEnabled ? 'check_box' : 'select_check_box'}
        </span>
      </button>
      {visibleOptions.map((option) => (
        <button
          className={[
            enabledModes[option.mode] ? 'is-active' : '',
            option.taxi ? 'is-taxi' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          type="button"
          key={option.mode}
          aria-label={option.label}
          title={option.label}
          aria-pressed={enabledModes[option.mode]}
          onClick={() => onToggle(option.mode)}
          style={{ '--route-mode-color': option.color } as CSSProperties}
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            {option.icon}
          </span>
        </button>
      ))}
      {showMoreButton ? (
        <button
          className={
            hiddenEnabledCount > 0
              ? 'map-route-mode-toggle-more is-active'
              : 'map-route-mode-toggle-more'
          }
          type="button"
          aria-label={expanded ? labels.collapse : labels.more(hiddenCount)}
          title={expanded ? labels.collapse : labels.more(hiddenCount)}
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            {expanded ? 'keyboard_arrow_up' : 'more_horiz'}
          </span>
          {!expanded && hiddenEnabledCount > 0 ? (
            <span className="map-route-mode-toggle-more-count" aria-hidden="true">
              +{hiddenEnabledCount}
            </span>
          ) : null}
        </button>
      ) : null}
    </div>
  );
}

// 折叠单行容量：扣除全选钮、全选钮后间距、展开钮与其前置间距后，剩余宽度能放几个 38px 槽位。
function computeVisibleOptions(
  options: ReadonlyArray<RouteModeToggleOption>,
  containerWidth: number,
): ReadonlyArray<RouteModeToggleOption> {
  if (containerWidth <= 0) return options;
  const available =
    containerWidth - SELECT_ALL_WIDTH - CHIP_GAP - MORE_BUTTON_WIDTH - CHIP_GAP;
  const visibleCount = Math.max(0, Math.floor(available / (CHIP_WIDTH + CHIP_GAP)));
  return options.slice(0, Math.min(visibleCount, options.length));
}
