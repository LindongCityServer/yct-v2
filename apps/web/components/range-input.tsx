'use client';

import type { CSSProperties, InputHTMLAttributes } from 'react';

type RangeInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'value' | 'min' | 'max'
> & {
  value: number;
  min: number;
  max: number;
};

export function RangeInput({ value, min, max, style, ...props }: RangeInputProps) {
  const progress = max > min ? Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100)) : 0;
  return (
    <input
      {...props}
      type="range"
      min={min}
      max={max}
      value={value}
      style={{ ...style, '--yct-range-progress': `${progress}%` } as CSSProperties}
    />
  );
}

type DualRangeInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'value' | 'min' | 'max' | 'onChange' | 'defaultValue'
> & {
  value: [number, number];
  min: number;
  max: number;
  onChange: (value: [number, number]) => void;
};

/**
 * 双滑块范围输入：两个原生 range 叠放，只有滑块本身响应指针事件，
 * 中间选中区用强调色填充，保持与项目现有滑杆视觉一致。
 */
export function DualRangeInput({
  value,
  min,
  max,
  step = 1,
  onChange,
  className,
  id,
  ...props
}: DualRangeInputProps) {
  const safeMin = Math.min(min, max);
  const safeMax = Math.max(min, max);
  const lower = Math.max(safeMin, Math.min(value[0], safeMax));
  const upper = Math.max(lower, Math.min(value[1], safeMax));
  const range = safeMax - safeMin;
  const lowerPercent = range > 0 ? ((lower - safeMin) / range) * 100 : 0;
  const upperPercent = range > 0 ? ((upper - safeMin) / range) * 100 : 100;

  return (
    <span
      className={['dual-range-input', className].filter(Boolean).join(' ')}
      style={
        {
          '--dual-range-start': `${lowerPercent}%`,
          '--dual-range-end': `${upperPercent}%`,
        } as CSSProperties
      }
    >
      <span className="dual-range-input-track" aria-hidden="true">
        <span />
      </span>
      <input
        {...props}
        id={id ? `${id}-start` : undefined}
        type="range"
        min={safeMin}
        max={safeMax}
        step={step}
        value={lower}
        onChange={(event) => {
          const next = Math.min(Number(event.currentTarget.value), upper);
          onChange([next, upper]);
        }}
      />
      <input
        {...props}
        id={id ? `${id}-end` : undefined}
        type="range"
        min={safeMin}
        max={safeMax}
        step={step}
        value={upper}
        onChange={(event) => {
          const next = Math.max(Number(event.currentTarget.value), lower);
          onChange([lower, next]);
        }}
      />
    </span>
  );
}
