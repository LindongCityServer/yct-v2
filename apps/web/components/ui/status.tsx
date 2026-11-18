import type { HTMLAttributes, ReactNode } from 'react';

/**
 * 状态文本与空态原语。
 *
 * - StatusText：弱化说明 / 加载 / 错误状态行，渲染 .status-note。
 * - EmptyState：空数据占位，渲染 .empty-state（可选 is-compact、图标与任意子内容）。
 */
export interface StatusTextProps extends HTMLAttributes<HTMLParagraphElement> {
  children: ReactNode;
}

export function StatusText({ className, children, ...rest }: StatusTextProps) {
  const classes = ['status-note', className].filter(Boolean).join(' ');
  return (
    <p {...rest} className={classes}>
      {children}
    </p>
  );
}

export interface EyebrowProps extends HTMLAttributes<HTMLElement> {
  /** 渲染标签：默认 span，部分页面用 p。 */
  as?: 'span' | 'p';
  children: ReactNode;
}

/** 分区小标题（.eyebrow），仅控制文本样式。 */
export function Eyebrow({ as = 'span', className, children, ...rest }: EyebrowProps) {
  const Tag = as;
  return (
    <Tag {...rest} className={['eyebrow', className].filter(Boolean).join(' ')}>
      {children}
    </Tag>
  );
}

export interface FormErrorTextProps extends HTMLAttributes<HTMLParagraphElement> {
  children: ReactNode;
}

/** 表单错误文本：渲染 .form-error-text，默认 role=alert。 */
export function FormErrorText({
  className,
  children,
  role = 'alert',
  ...rest
}: FormErrorTextProps) {
  return (
    <p {...rest} role={role} className={['form-error-text', className].filter(Boolean).join(' ')}>
      {children}
    </p>
  );
}

export interface EmptyStateProps extends HTMLAttributes<HTMLElement> {
  /** Material Symbols 图标名，可选。 */
  icon?: string;
  /** 紧凑形态（列表内 / 抽屉内）。 */
  compact?: boolean;
  /** 渲染标签；changelog 等旧用法是 <p>，详情占位可能是 <section>，默认 <div>。 */
  as?: 'div' | 'p' | 'section';
  children: ReactNode;
}

export function EmptyState({
  icon,
  compact = false,
  as = 'div',
  className,
  children,
  ...rest
}: EmptyStateProps) {
  const Tag = as;
  const classes = ['empty-state', compact ? 'is-compact' : '', className].filter(Boolean).join(' ');
  return (
    <Tag {...rest} className={classes}>
      {icon ? (
        <span className="material-symbols-outlined" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      {children}
    </Tag>
  );
}
