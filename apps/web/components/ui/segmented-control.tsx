'use client';

import { useRef } from 'react';
import type { CSSProperties, ReactNode } from 'react';

export interface SegmentedControlOption<TValue extends string> {
  value: TValue;
  label: ReactNode;
  disabled?: boolean;
  title?: string;
  ariaLabel?: string;
  panelId?: string;
  /** 选中时用该颜色填充按钮（用于模板里的颜色预设）。 */
  accentColor?: string;
}

export function SegmentedControl<TValue extends string>({
  ariaLabel,
  className,
  wrapperClassName,
  disabled = false,
  onChange,
  options,
  role = 'group',
  value,
}: Readonly<{
  ariaLabel: string;
  className?: string;
  /** 需要外层 .segmented-control 轨道时传入（空字符串表示仅轨道）。 */
  wrapperClassName?: string;
  disabled?: boolean;
  onChange: (value: TValue) => void;
  options: ReadonlyArray<SegmentedControlOption<TValue>>;
  role?: 'group' | 'tablist';
  value: TValue;
}>) {
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = options.findIndex((option) => option.value === value && !option.disabled);
  const focusIndex =
    selectedIndex >= 0 ? selectedIndex : options.findIndex((option) => !option.disabled);

  const control = (
    <div className={className} role={role} aria-label={ariaLabel}>
      {options.map((option, index) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            ref={(element) => {
              buttons.current[index] = element;
            }}
            className={
              [active ? 'is-active' : '', option.accentColor ? 'has-accent' : '']
                .filter(Boolean)
                .join(' ') || undefined
            }
            style={
              option.accentColor
                ? ({ '--yct-segmented-accent': option.accentColor } as CSSProperties)
                : undefined
            }
            type="button"
            role={role === 'tablist' ? 'tab' : undefined}
            aria-selected={role === 'tablist' ? active : undefined}
            aria-pressed={role === 'group' ? active : undefined}
            aria-controls={option.panelId}
            aria-label={option.ariaLabel}
            title={option.title}
            disabled={disabled || option.disabled}
            tabIndex={role === 'tablist' ? (index === focusIndex ? 0 : -1) : undefined}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => {
              if (
                role !== 'tablist' ||
                !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)
              )
                return;
              event.preventDefault();
              const enabled = options.flatMap((item, itemIndex) =>
                item.disabled ? [] : [itemIndex],
              );
              const current = enabled.indexOf(index);
              const next =
                event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? enabled.length - 1
                    : (current + (event.key === 'ArrowRight' ? 1 : -1) + enabled.length) %
                      enabled.length;
              const nextIndex = enabled[next];
              if (nextIndex === undefined) return;
              onChange(options[nextIndex].value);
              buttons.current[nextIndex]?.focus();
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
  if (wrapperClassName === undefined) return control;
  return (
    <div className={['segmented-control', wrapperClassName].filter(Boolean).join(' ')}>
      {control}
    </div>
  );
}

export interface SegmentedTabOption<TValue extends string> {
  value: TValue;
  label: ReactNode;
  disabled?: boolean;
}

export interface SegmentedTabsProps<TValue extends string> {
  label?: ReactNode;
  className?: string;
  /** 视觉隐藏 legend（如 sr-only）。 */
  legendClassName?: string;
  /** fieldset 的 aria-label（与 legend 二选一或共存）。 */
  ariaLabel?: string;
  as?: 'fieldset' | 'div';
  disabled?: boolean;
  onChange: (value: TValue) => void;
  options: ReadonlyArray<SegmentedTabOption<TValue>>;
  value: TValue;
}

/** 历史手写「fieldset.segmented-control + legend + 一组按钮」的标签页组。 */
export function SegmentedTabs<TValue extends string>({
  label,
  className,
  legendClassName,
  ariaLabel,
  as = 'fieldset',
  disabled = false,
  onChange,
  options,
  value,
}: Readonly<SegmentedTabsProps<TValue>>) {
  const Tag = as;
  return (
    <Tag
      className={['segmented-control', disabled ? 'is-disabled' : '', className]
        .filter(Boolean)
        .join(' ')}
      aria-label={ariaLabel}
    >
      {as === 'fieldset' && label ? <legend className={legendClassName}>{label}</legend> : null}
      <div>
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              className={active ? 'is-active' : ''}
              type="button"
              aria-pressed={active}
              disabled={disabled || option.disabled}
              onClick={() => onChange(option.value)}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </Tag>
  );
}
