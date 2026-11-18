import type { InputHTMLAttributes, ReactNode } from 'react';

/**
 * 复选框行 / 单选行原语。
 *
 * 结构复用现有标准类名：
 *   <label class="checkbox-row"><input type="checkbox"><span>...</span></label>
 * 工作台字段使用 material 变体（.material-checkbox-row / .material-radio-row）。
 * 整行是 label，命中区覆盖整行；输入框尺寸与配色由全局原生控件规则接管。
 */
export type CheckboxRowVariant = 'row' | 'material';

/** 行内前置图形（色块/图标），渲染在 input 与文字之间。 */
export interface RowIconSlot {
  icon?: ReactNode;
}

export interface CheckboxRowProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'children'
> {
  label: ReactNode;
  /** row -> .checkbox-row（默认）；material -> .material-checkbox-row（工作台字段）。 */
  variant?: CheckboxRowVariant;
  /** 行内前置图形（色块/图标）。 */
  icon?: ReactNode;
}

export function CheckboxRow({
  label,
  variant = 'row',
  icon,
  className,
  ...rest
}: CheckboxRowProps) {
  return (
    <label
      className={[variant === 'material' ? 'material-checkbox-row' : 'checkbox-row', className]
        .filter(Boolean)
        .join(' ')}
    >
      <input {...rest} type="checkbox" />
      {icon}
      <span>{label}</span>
    </label>
  );
}

export interface RadioRowProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'children'
> {
  label: ReactNode;
  /** row -> .radio-row（默认）；material -> .material-radio-row（工作台字段）。 */
  variant?: CheckboxRowVariant;
  /** 行内前置图形（色块/图标）。 */
  icon?: ReactNode;
}

export function RadioRow({ label, variant = 'row', icon, className, ...rest }: RadioRowProps) {
  return (
    <label
      className={[variant === 'material' ? 'material-radio-row' : 'radio-row', className]
        .filter(Boolean)
        .join(' ')}
    >
      <input {...rest} type="radio" />
      {icon}
      <span>{label}</span>
    </label>
  );
}
