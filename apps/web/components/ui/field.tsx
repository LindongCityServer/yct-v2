'use client';

import { createContext, useContext, useId } from 'react';
import type { ComponentPropsWithRef, ReactNode } from 'react';

/**
 * 表单字段族原语。
 *
 * 结构完全复用现有标准类名：
 *   <label class="material-field"><span>标签</span><input /></label>
 * 额外的 hint / error 会输出为 <small> / <span class="form-error-text" role="alert">，
 * 并通过 FieldContext 自动给子控件补 id、required、aria-invalid、aria-describedby。
 */
interface FieldContextValue {
  controlId: string;
  describedBy?: string;
  invalid: boolean;
  required: boolean;
}

const FieldContext = createContext<FieldContextValue | null>(null);

export interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  /** 直接指定控件 id；不传时自动生成。 */
  id?: string;
  /** 仅用于布局的附加类名。 */
  className?: string;
  children: ReactNode;
}

export function Field({
  label,
  hint,
  error,
  required = false,
  id,
  className,
  children,
}: FieldProps) {
  const generatedId = useId();
  const controlId = id || generatedId;
  const errorId = error ? controlId + '-error' : undefined;
  const hintId = hint ? controlId + '-hint' : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;
  const classes = ['material-field', className].filter(Boolean).join(' ');

  return (
    <label className={classes} htmlFor={controlId}>
      <span>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </span>
      <FieldContext.Provider value={{ controlId, describedBy, invalid: Boolean(error), required }}>
        {children}
      </FieldContext.Provider>
      {error ? (
        <span className="form-error-text" id={errorId} role="alert">
          {error}
        </span>
      ) : hint ? (
        <small id={hintId}>{hint}</small>
      ) : null}
    </label>
  );
}

export interface FieldGroupProps {
  /** 字段标签。 */
  label: ReactNode;
  /** 仅布局用的附加类名。 */
  className?: string;
  /** 渲染标签：默认 div；历史上少量是 label（内部仍是复合控件）。 */
  as?: 'div' | 'label';
  children: ReactNode;
}

/** 非单控件字段壳：保留 .material-field 结构，用于分段/滑块/颜色等复合字段。 */
export function FieldGroup({ label, className, as = 'div', children }: FieldGroupProps) {
  const Tag = as;
  const classes = ['material-field', className].filter(Boolean).join(' ');
  return (
    <Tag className={classes}>
      <span>{label}</span>
      {children}
    </Tag>
  );
}

export interface SearchFieldProps extends Omit<ComponentPropsWithRef<'input'>, 'className'> {
  /** 搜索框容器附加类名（布局用）。 */
  className?: string;
  /** Material Symbols 图标名，默认 search。 */
  icon?: string;
  /** 有内容时显示清除按钮的可访问名称。 */
  clearLabel?: string;
  onClear?: () => void;
  /** 清除按钮/尾部附加操作（如随机探索）。 */
  trailing?: ReactNode;
  /** 容器标签；历史上多数是 div，翻译后台用 label。 */
  as?: 'div' | 'label';
}

/** 搜索框：.search-box + 搜索图标 + 输入框 + 可选清除/尾部操作。 */
export function SearchField({
  className,
  icon = 'search',
  clearLabel,
  onClear,
  trailing,
  as = 'div',
  ...inputProps
}: SearchFieldProps) {
  const Tag = as;
  const value = inputProps.value;
  const hasValue = value !== undefined && value !== null && String(value).length > 0;
  return (
    <Tag className={['search-box', className].filter(Boolean).join(' ')}>
      <span className="material-symbols-outlined" aria-hidden="true">
        {icon}
      </span>
      <input {...inputProps} />
      {hasValue && onClear ? (
        <button
          className="search-clear-button"
          type="button"
          aria-label={clearLabel}
          onClick={onClear}
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            close
          </span>
        </button>
      ) : null}
      {trailing}
    </Tag>
  );
}

function useFieldControl<TControl extends 'input' | 'select' | 'textarea'>(
  props: ComponentPropsWithRef<TControl>,
) {
  const field = useContext(FieldContext);
  const ariaInvalid = props['aria-invalid'] ?? (field?.invalid ? true : undefined);
  return {
    id: props.id ?? field?.controlId,
    'aria-invalid': ariaInvalid,
    'aria-describedby': props['aria-describedby'] ?? field?.describedBy,
    required: props.required ?? field?.required,
  };
}

export type InputProps = ComponentPropsWithRef<'input'>;

export function Input(props: InputProps) {
  const proxied = useFieldControl<'input'>(props);
  return <input {...props} {...proxied} />;
}

export type SelectProps = ComponentPropsWithRef<'select'>;

export function Select(props: SelectProps) {
  const proxied = useFieldControl<'select'>(props);
  return <select {...props} {...proxied} />;
}

export type TextareaProps = ComponentPropsWithRef<'textarea'>;

export function Textarea(props: TextareaProps) {
  const proxied = useFieldControl<'textarea'>(props);
  return <textarea {...props} {...proxied} />;
}
