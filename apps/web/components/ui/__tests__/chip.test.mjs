import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  Chip,
  FilterStrip,
  MapHudChip,
  MapPresenceChip,
  RouteOptionBadge,
  StatusChip,
  TransferLineChip,
} from '../chip.tsx';

const render = (element) => renderToStaticMarkup(element);

test('地图芯片原语渲染对应标准类名', () => {
  assert.match(
    render(createElement(TransferLineChip, { color: '#123456' }, '1 号线')),
    /class="map-transfer-line-chip"/,
  );
  assert.match(
    render(createElement(TransferLineChip, { region: true }, '区域')),
    /map-poi-region-chip/,
  );
  assert.match(
    render(createElement(MapHudChip, { variant: 'source', icon: 'map' }, '数据源')),
    /class="map-source-chip"/,
  );
  assert.match(
    render(createElement(MapHudChip, { variant: 'coordinate', icon: 'gps_fixed' }, 'X 1')),
    /class="map-coordinate-chip"/,
  );
  assert.match(
    render(createElement(MapPresenceChip, { status: 'online', icon: 'wifi' }, '在线')),
    /class="map-player-list-presence is-online"/,
  );
  assert.match(render(createElement(RouteOptionBadge, null, '最快')), /map-route-option-badge/);
});

test('FilterStrip 渲染筛选条容器', () => {
  const html = render(createElement(FilterStrip, { 'aria-label': '筛选' }, '内容'));
  assert.match(html, /class="search-filter-strip"/);
  assert.match(html, /aria-label="筛选"/);
});

test('Chip 渲染分类芯片与 tone / 选中态', () => {
  const html = render(
    createElement(Chip, { tone: 'metro', active: true, icon: 'subway', onClick: () => {} }, '地铁'),
  );
  assert.match(html, /class="category-chip tone-metro is-active"/);
  assert.match(html, /aria-pressed="true"/);
  assert.match(html, /material-symbols-outlined/);
  assert.match(html, /<span>地铁<\/span>/);
});

test('Chip 未选中时 aria-pressed=false', () => {
  const html = render(createElement(Chip, { tone: 'bus' }, '公交'));
  assert.match(html, /class="category-chip tone-bus"/);
  assert.match(html, /aria-pressed="false"/);
});

test('StatusChip 默认 operation 语义族并支持 tone', () => {
  const html = render(createElement(StatusChip, { tone: 'warning' }, '已停用'));
  assert.match(html, /class="operation-tag is-warning"/);
  assert.match(html, /已停用/);
});

test('StatusChip ticket 变体渲染票务状态徽标', () => {
  const html = render(createElement(StatusChip, { variant: 'ticket' }, '已出票'));
  assert.match(html, /class="ticket-order-status-badge"/);
});

test('StatusChip poi 语义族支持 approved / legacy', () => {
  assert.match(
    render(createElement(StatusChip, { variant: 'poi', tone: 'approved' }, '允许投稿')),
    /class="admin-poi-status-chip is-approved"/,
  );
  assert.match(
    render(createElement(StatusChip, { variant: 'poi', tone: 'legacy' }, '旧有数据')),
    /class="admin-poi-status-chip is-legacy"/,
  );
});
