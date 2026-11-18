import type { ButtonHTMLAttributes, CSSProperties, HTMLAttributes, ReactNode } from 'react';

/**
 * 芯片与状态芯片原语。
 *
 * - Chip：筛选/分类芯片（.category-chip + tone-* + is-active），按钮语义。
 * - StatusChip：状态芯片，按语义族选择基础类（operation-tag / admin-poi-status-chip），
 *   tone 映射到既有 is-* 修饰类，颜色由状态而不是页面决定。
 */
export interface ChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** 交通方式或语义色 tone（对应现有 tone-* 类）。 */
  tone?: string;
  active?: boolean;
  /** Material Symbols 图标名。 */
  icon?: string;
  children: ReactNode;
}

export function Chip({
  tone,
  active = false,
  icon,
  className,
  children,
  type = 'button',
  ...rest
}: ChipProps) {
  const classes = [
    'category-chip',
    tone ? 'tone-' + tone : '',
    active ? 'is-active' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button {...rest} type={type} className={classes} aria-pressed={active}>
      {icon ? (
        <span className="material-symbols-outlined" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <span>{children}</span>
    </button>
  );
}

/** 搜索/分类筛选条容器（.search-filter-strip）。 */
export function FilterStrip({
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return (
    <div {...rest} className={['search-filter-strip', className].filter(Boolean).join(' ')}>
      {children}
    </div>
  );
}

export interface TransferLineChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** 换乘线路色（写入 --transfer-line-color）。 */
  color?: string;
  /** 区域芯片额外类名。 */
  region?: boolean;
  children: ReactNode;
}

/** 地图换乘/区域线路芯片。 */
export function TransferLineChip({
  color,
  region = false,
  className,
  type = 'button',
  children,
  ...rest
}: TransferLineChipProps) {
  const classes = ['map-transfer-line-chip', region ? 'map-poi-region-chip' : '', className]
    .filter(Boolean)
    .join(' ');
  return (
    <button
      {...rest}
      type={type}
      className={classes}
      style={color ? ({ '--transfer-line-color': color } as CSSProperties) : undefined}
    >
      {children}
    </button>
  );
}

export interface MapHudChipProps {
  variant: 'source' | 'coordinate';
  icon: string;
  title?: string;
  children: ReactNode;
}

/** 地图 HUD 数据源/坐标芯片。 */
export function MapHudChip({ variant, icon, title, children }: MapHudChipProps) {
  return (
    <div className={variant === 'source' ? 'map-source-chip' : 'map-coordinate-chip'} title={title}>
      <span className="material-symbols-outlined" aria-hidden="true">
        {icon}
      </span>
      <span>{children}</span>
    </div>
  );
}

export interface MapPresenceChipProps {
  status: 'online' | 'offline';
  icon: string;
  children: ReactNode;
}

/** 地图玩家在线状态芯片。 */
export function MapPresenceChip({ status, icon, children }: MapPresenceChipProps) {
  return (
    <span className={`map-player-list-presence is-${status}`}>
      <span className="material-symbols-outlined" aria-hidden="true">
        {icon}
      </span>
      {children}
    </span>
  );
}

/** 选路方案特性徽标。 */
export function RouteOptionBadge({ children }: Readonly<{ children: ReactNode }>) {
  return <span className="map-route-option-badge">{children}</span>;
}

export type StatusChipVariant = 'operation' | 'poi' | 'ticket';

const STATUS_VARIANT_CLASS: Record<StatusChipVariant, string> = {
  operation: 'operation-tag',
  poi: 'admin-poi-status-chip',
  ticket: 'ticket-order-status-badge',
};

export type StatusChipTone =
  'default' | 'ok' | 'warning' | 'danger' | 'accent' | 'approved' | 'rejected' | 'legacy';

export interface StatusChipProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: StatusChipVariant;
  /** 内置状态 + 业务动态状态（如 published / pending）均可，统一映射为 is-*。 */
  tone?: StatusChipTone | string;
  children: ReactNode;
}

export function StatusChip({
  variant = 'operation',
  tone = 'default',
  className,
  children,
  ...rest
}: StatusChipProps) {
  const classes = [STATUS_VARIANT_CLASS[variant], tone === 'default' ? '' : 'is-' + tone, className]
    .filter(Boolean)
    .join(' ');
  return (
    <span {...rest} className={classes}>
      {children}
    </span>
  );
}
