'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { MaterialSymbol } from '../../../components/material-symbol';
import registry from './controls-registry.json';

/**
 * 组件展示页的目录与文档模板。
 *
 * 信息架构参考 Ant Design 组件文档：左侧按分类分组导航，右侧为组件页
 * （标题 / 状态 / 摘要 / 类名与别名 / 示例 / 规范）。数据全部来自
 * controls-registry.json，页面本身不重复维护一份标题与分类。
 */

export type ControlsSection = (typeof registry.sections)[number];
export type ControlsCategory = (typeof registry.categories)[number];

export const controlsSections: ControlsSection[] = registry.sections;
export const controlsCategories: ControlsCategory[] = registry.categories;

const categoryOrder = new Map<string, number>(
  controlsCategories.map((category, index) => [category.id, index]),
);

/** 与现有展示板一致：只有「已归一」一个稳定状态，未知状态按已归一处理。 */
const statusLabels: Record<string, string> = {
  stable: '已归一',
  beta: '实验中',
  deprecated: '已废弃',
};

export function ControlsCatalogNav() {
  const [query, setQuery] = useState('');
  const [activeId, setActiveId] = useState(controlsSections[0]?.id ?? '');
  const keyword = query.trim().toLowerCase();

  const groups = useMemo(() => {
    const matched = keyword
      ? controlsSections.filter((section) =>
          [section.text, section.name, section.summary, ...section.classes]
            .join(' ')
            .toLowerCase()
            .includes(keyword),
        )
      : controlsSections;
    return controlsCategories
      .map((category) => ({
        ...category,
        sections: matched.filter((section) => section.category === category.id),
      }))
      .filter((group) => group.sections.length > 0)
      .sort(
        (left, right) =>
          (categoryOrder.get(left.id) ?? 0) - (categoryOrder.get(right.id) ?? 0),
      );
  }, [keyword]);

  // 目录高亮跟随滚动位置；rootMargin 让顶部标题栏（96px）以下的区块才算进入视口。
  useEffect(() => {
    const targets = controlsSections
      .map((section) => document.getElementById(section.id))
      .filter((element): element is HTMLElement => Boolean(element));
    if (!targets.length || typeof IntersectionObserver === 'undefined') {
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const topmost = entries
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => left.boundingClientRect.top - right.boundingClientRect.top)[0];
        if (topmost) {
          setActiveId(topmost.target.id);
        }
      },
      { rootMargin: '-96px 0px -62% 0px', threshold: 0 },
    );
    targets.forEach((target) => observer.observe(target));
    return () => observer.disconnect();
  }, []);

  return (
    <nav className="controls-catalog" aria-label="组件目录">
      <label className="controls-catalog-search">
        <MaterialSymbol name="search" aria-hidden="true" />
        <input
          type="search"
          value={query}
          placeholder="搜索组件或类名"
          aria-label="搜索组件或类名"
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
      </label>
      <div className="controls-catalog-groups">
        {groups.map((group) => (
          <section className="controls-catalog-group" key={group.id}>
            <h3>{group.label}</h3>
            <ul>
              {group.sections.map((section) => (
                <li key={section.id}>
                  <a
                    className={section.id === activeId ? 'is-active' : undefined}
                    href={`#${section.id}`}
                    aria-current={section.id === activeId ? 'location' : undefined}
                  >
                    <span>{section.text}</span>
                    <span className={`controls-catalog-dot is-${section.status}`} aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ))}
        {groups.length === 0 ? (
          <p className="controls-catalog-empty">没有匹配的组件</p>
        ) : null}
      </div>
      <p className="controls-catalog-footer">
        {controlsSections.length} 个组件 · {controlsCategories.length} 个分类
      </p>
    </nav>
  );
}

export function ControlsDocHeader({ sectionId }: Readonly<{ sectionId: string }>) {
  const section = controlsSections.find((item) => item.id === sectionId);
  if (!section) {
    return null;
  }
  const statusLabel = statusLabels[section.status] ?? statusLabels.stable;
  return (
    <header className="controls-doc-header">
      <div className="controls-doc-title-row">
        <h2>{section.name}</h2>
        <span className={`controls-doc-status is-${section.status}`}>{statusLabel}</span>
      </div>
      <p className="controls-doc-summary">{section.summary}</p>
      {section.classes.length ? (
        <div className="controls-doc-classes">
          <span className="controls-doc-label">标准类名</span>
          {section.classes.map((className) => (
            <code key={className}>{className}</code>
          ))}
        </div>
      ) : null}
      {section.aliases.length ? (
        <div className="controls-doc-aliases">
          <span className="controls-doc-label">历史别名</span>
          {section.aliases.map((alias) => (
            <span className="controls-doc-alias" key={alias.name}>
              <code>{alias.name}</code>
              <span>{alias.note}</span>
            </span>
          ))}
        </div>
      ) : null}
    </header>
  );
}

export function ControlsDocBlock({
  title,
  hint,
  children,
}: Readonly<{ title: string; hint?: string; children: ReactNode }>) {
  return (
    <section className="controls-doc-block">
      <div className="controls-doc-block-heading">
        <h3>{title}</h3>
        {hint ? <span>{hint}</span> : null}
      </div>
      {children}
    </section>
  );
}

export function ControlsDocTable({
  columns,
  rows,
}: Readonly<{ columns: string[]; rows: ReactNode[][] }>) {
  return (
    <div className="controls-doc-table-wrap">
      <table className="controls-doc-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th scope="col" key={column}>
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ControlsDocDos({
  dos,
  donts,
}: Readonly<{ dos: string[]; donts: string[] }>) {
  return (
    <div className="controls-doc-dos">
      <div className="controls-doc-do">
        <h4>Do</h4>
        <ul>
          {dos.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
      <div className="controls-doc-dont">
        <h4>Don&apos;t</h4>
        <ul>
          {donts.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
