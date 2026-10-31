import type { CSSProperties, ReactNode } from 'react';
import Link from 'next/link';
import { appPath } from '../lib/app-paths';
import { MaterialSymbol } from './material-symbol';

/**
 * 问一问卡片的基础组件。
 *
 * 只在前端组合使用：模型仍然只选择“组合好的卡片”（place_list / line_strip / trip_card），
 * 原子在这里统一结构与视觉，避免每加一种卡片就复制一套样式。
 */

/** 带彩色图标的列表项：地点、出口、设施等“一行一个实体”的通用形态。 */
export function IconRow({
  href,
  icon,
  title,
  subtitle,
  color,
  onNavigate,
}: Readonly<{
  href: string;
  icon: string;
  title: string;
  subtitle?: string;
  /** 图标底色，按分类语义传入；缺省用主色。 */
  color?: string;
  onNavigate: () => void;
}>) {
  return (
    <Link
      className="assistant-icon-row"
      href={appPath(href)}
      style={{ '--assistant-icon-color': color } as CSSProperties}
      onClick={onNavigate}
    >
      <span className="assistant-icon-badge" aria-hidden="true">
        <MaterialSymbol name={icon} />
      </span>
      <span className="assistant-icon-body">
        <span className="assistant-icon-title">{title}</span>
        {subtitle ? <span className="assistant-icon-meta">{subtitle}</span> : null}
      </span>
      <MaterialSymbol name="chevron_right" aria-hidden="true" />
    </Link>
  );
}

/** 图标列表容器：统一 ul / li 结构。 */
export function IconList({ children }: Readonly<{ children: ReactNode }>) {
  return <ul className="assistant-icon-list">{children}</ul>;
}

/** 卡片外壳：有 href 时整卡可点，否则是普通容器；标题行与内容由调用方组合。 */
export function CardSection({
  className,
  style,
  href,
  onNavigate,
  children,
}: Readonly<{
  className: string;
  style?: CSSProperties;
  href?: string;
  onNavigate?: () => void;
  children: ReactNode;
}>) {
  if (href) {
    return (
      <Link className={className} style={style} href={appPath(href)} onClick={onNavigate}>
        {children}
      </Link>
    );
  }

  return (
    <div className={className} style={style}>
      {children}
    </div>
  );
}

/** 状态标签组：班次性质、余票、票价等。 */
export function Tags({ items }: Readonly<{ items: Array<{ label: string; strong?: boolean }> }>) {
  return (
    <>
      {items.map((item) => (
        <span className={`assistant-tag${item.strong ? ' is-strong' : ''}`} key={item.label}>
          {item.label}
        </span>
      ))}
    </>
  );
}
