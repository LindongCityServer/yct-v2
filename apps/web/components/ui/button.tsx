import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';

/**
 * 标准按钮原语。
 *
 * 视觉契约完全复用 globals.css「控件统一标准层」：
 * - primary   -> .primary-action-button
 * - secondary -> .secondary-action-button
 * - emphasis  -> .secondary-action-button.is-emphasis
 *
 * 原语只承载状态与可访问性（loading / disabled / busy），不接管业务布局；
 * className 仅用于布局，不要用它覆盖视觉。
 */
export type ButtonVariant = 'primary' | 'secondary' | 'emphasis';

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: 'primary-action-button',
  secondary: 'secondary-action-button',
  emphasis: 'secondary-action-button is-emphasis',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** 加载中：禁用点击并暴露 aria-busy，图标由原语负责。 */
  loading?: boolean;
  /** Material Symbols 图标名；不传则不渲染图标。 */
  icon?: string;
  children?: ReactNode;
}

export function Button({
  variant = 'primary',
  loading = false,
  icon,
  className,
  disabled,
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  const classes = [VARIANT_CLASS[variant], className].filter(Boolean).join(' ');
  return (
    <button
      {...rest}
      type={type}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {loading || icon ? (
        <span
          className={
            loading ? 'material-symbols-outlined busy-state-indicator' : 'material-symbols-outlined'
          }
          aria-hidden="true"
        >
          {loading ? 'progress_activity' : icon}
        </span>
      ) : null}
      {children}
    </button>
  );
}

export type IconButtonVariant = 'action' | 'icon';

const ICON_VARIANT_CLASS: Record<IconButtonVariant, string> = {
  action: 'icon-action-button',
  icon: 'icon-button',
};

export interface ButtonLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  /** 与 Button 相同的三个语义层级。 */
  variant?: ButtonVariant;
  /** Material Symbols 图标名；不传则不渲染图标。 */
  icon?: string;
  children?: ReactNode;
}

/** 链接型按钮：保留 <a> 语义（导航/新窗口），视觉契约与 Button 一致。 */
export function ButtonLink({
  variant = 'secondary',
  icon,
  className,
  children,
  ...rest
}: ButtonLinkProps) {
  const classes = [VARIANT_CLASS[variant], className].filter(Boolean).join(' ');
  return (
    <a {...rest} className={classes}>
      {icon ? (
        <span className="material-symbols-outlined" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      {children}
    </a>
  );
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Material Symbols 图标名；与 children 二选一（自定义图形用 children）。 */
  icon?: string;
  /** 必需的可访问名称，同时作为 title。 */
  label: string;
  /** action -> .icon-action-button（默认）；icon -> .icon-button（弹窗关闭等旧形态）。 */
  variant?: IconButtonVariant;
}

export interface IconLinkProps extends Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  'children' | 'aria-label'
> {
  /** 必需的可访问名称，同时作为 title。 */
  label: string;
  icon?: string;
  /** 与 IconButton 相同的两种形态。 */
  variant?: IconButtonVariant;
  children?: ReactNode;
}

/** 锚点型图标链接（.icon-button/.icon-action-button），用于导航型图标按钮。 */
export function IconLink({
  label,
  icon,
  variant = 'action',
  className,
  title,
  children,
  ...rest
}: IconLinkProps) {
  const classes = [ICON_VARIANT_CLASS[variant], className].filter(Boolean).join(' ');
  return (
    <a {...rest} className={classes} aria-label={label} title={title ?? label}>
      {children ??
        (icon ? (
          <span className="material-symbols-outlined" aria-hidden="true">
            {icon}
          </span>
        ) : null)}
    </a>
  );
}

export function IconButton({
  icon,
  label,
  variant = 'action',
  className,
  type = 'button',
  title,
  children,
  ...rest
}: IconButtonProps) {
  const classes = [ICON_VARIANT_CLASS[variant], className].filter(Boolean).join(' ');
  return (
    <button {...rest} type={type} className={classes} aria-label={label} title={title ?? label}>
      {children ??
        (icon ? (
          <span className="material-symbols-outlined" aria-hidden="true">
            {icon}
          </span>
        ) : null)}
    </button>
  );
}
