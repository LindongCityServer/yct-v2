'use client';

import { useMemo, useState } from 'react';
import { appPath } from '../../../lib/app-paths';
import inventory from './controls-inventory.json';
import registry from './controls-registry.json';
import { ControlsDocHeader } from './controls-doc';

const pageSize = 30;
const kinds = { control: '交互控件', component: '组件引用', surface: '样式容器' };

export function ControlsInventory() {
  const [query, setQuery] = useState('');
  const [route, setRoute] = useState('');
  const [kind, setKind] = useState('control');
  const [coverage, setCoverage] = useState('');
  const [pageIndex, setPageIndex] = useState(0);
  const entries = useMemo(
    () =>
      inventory.files.flatMap((file) =>
        file.controls.map((control) => ({
          ...control,
          source: file.source,
          routes: file.routes,
          preview: registry.sharedPreviews.find(
            (preview) => preview.source === file.source && preview.component === control.owner,
          ),
        })),
      ),
    [],
  );
  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return entries.filter(
      (entry) =>
        (!kind || entry.kind === kind) &&
        (!route || entry.routes.includes(route)) &&
        (!coverage || Boolean(entry.preview) === (coverage === 'shared')) &&
        (!keyword ||
          [
            entry.source,
            entry.owner,
            entry.element,
            ...entry.classes,
            ...entry.types,
            ...entry.states,
          ]
            .join(' ')
            .toLowerCase()
            .includes(keyword)),
    );
  }, [entries, query, route, kind, coverage]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.min(pageIndex, pageCount - 1);
  const visible = filtered.slice(page * pageSize, (page + 1) * pageSize);

  return (
    <section className="controls-card" id="controls-inventory">
      <ControlsDocHeader sectionId="controls-inventory" />
      <span className="muted">
        {inventory.routes.length} 个页面 · {inventory.files.length} 个源码文件 ·{' '}
        {registry.sharedPreviews.length} 个共享预览组件
      </span>
      <div className="controls-inventory-filters">
        <label className="material-field">
          <span>页面</span>
          <select
            value={route}
            onChange={(event) => {
              setRoute(event.currentTarget.value);
              setPageIndex(0);
            }}
          >
            <option value="">全部页面（含后台）</option>
            {inventory.routes.map((item) => (
              <option value={item.path} key={item.path}>
                {item.path}
              </option>
            ))}
          </select>
        </label>
        <label className="material-field">
          <span>类型</span>
          <select
            value={kind}
            onChange={(event) => {
              setKind(event.currentTarget.value);
              setPageIndex(0);
            }}
          >
            <option value="">全部节点</option>
            {Object.entries(kinds).map(([value, label]) => (
              <option value={value} key={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="material-field">
          <span>预览状态</span>
          <select
            value={coverage}
            onChange={(event) => {
              setCoverage(event.currentTarget.value);
              setPageIndex(0);
            }}
          >
            <option value="">全部</option>
            <option value="shared">共享组件预览</option>
            <option value="source">源码登记，待共享预览</option>
          </select>
        </label>
        <label className="material-field">
          <span>搜索</span>
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.currentTarget.value);
              setPageIndex(0);
            }}
          />
        </label>
      </div>
      <div className="controls-inventory-results">
        {visible.map((entry) => (
          <details className="controls-inventory-item" key={`${entry.source}:${entry.lines[0]}`}>
            <summary>
              <span>
                <strong>{entry.owner}</strong>
                <code>
                  {entry.element}
                  {entry.types.length ? ` · ${entry.types.join(' / ')}` : ''}
                </code>
              </span>
              <span className="muted">
                {entry.preview ? '共享组件预览' : '源码登记，待共享预览'}
              </span>
            </summary>
            <div className="controls-inventory-detail">
              <code>
                {entry.source}:{entry.lines.join(', ')}
              </code>
              {entry.classes.length ? (
                <p>
                  <strong>样式：</strong>
                  <code>{entry.classes.join(' ')}</code>
                </p>
              ) : null}
              {entry.states.length ? (
                <p>
                  <strong>状态属性：</strong>
                  <code>{entry.states.join(', ')}</code>
                </p>
              ) : null}
              {entry.roles.length ? (
                <p>
                  <strong>语义：</strong>
                  <code>{entry.roles.join(', ')}</code>
                </p>
              ) : null}
              <div className="controls-inventory-links">
                {entry.preview ? <a href={`#${entry.preview.section}`}>查看共享预览</a> : null}
                {entry.routes.map((pathname) =>
                  pathname.includes('[') ? (
                    <code key={pathname}>{pathname}</code>
                  ) : (
                    <a href={appPath(pathname)} key={pathname} target="_blank" rel="noreferrer">
                      {pathname}
                    </a>
                  ),
                )}
                {!entry.routes.length ? <span className="muted">未被当前页面引用</span> : null}
              </div>
            </div>
          </details>
        ))}
        {!visible.length ? <p className="status-note">没有匹配的控件</p> : null}
      </div>
      <div className="controls-inventory-pagination">
        <span role="status">
          {filtered.length} 组源码节点 · 第 {page + 1} / {pageCount} 页
        </span>
        <button
          className="icon-action-button"
          type="button"
          aria-label="上一页"
          title="上一页"
          disabled={page === 0}
          onClick={() => setPageIndex(page - 1)}
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            chevron_left
          </span>
        </button>
        <button
          className="icon-action-button"
          type="button"
          aria-label="下一页"
          title="下一页"
          disabled={page + 1 >= pageCount}
          onClick={() => setPageIndex(page + 1)}
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            chevron_right
          </span>
        </button>
      </div>
    </section>
  );
}
