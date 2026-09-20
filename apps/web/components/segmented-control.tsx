'use client';

import { useRef } from 'react';
import type { ReactNode } from 'react';

export interface SegmentedControlOption<TValue extends string> {
  value: TValue;
  label: ReactNode;
  disabled?: boolean;
  title?: string;
  ariaLabel?: string;
  panelId?: string;
}

export function SegmentedControl<TValue extends string>({
  ariaLabel,
  className,
  disabled = false,
  onChange,
  options,
  role = 'group',
  value,
}: Readonly<{
  ariaLabel: string;
  className: string;
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

  return (
    <div className={className} role={role} aria-label={ariaLabel}>
      {options.map((option, index) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            ref={(element) => {
              buttons.current[index] = element;
            }}
            className={active ? 'is-active' : undefined}
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
}
