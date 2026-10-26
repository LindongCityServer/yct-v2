'use client';

import { useEffect } from 'react';
import {
  readMaterialPreference,
  subscribeMaterialPreferenceChanged,
} from '../lib/client-material-preference';
import { createLiquidMaterialMap } from '../lib/liquid-material';
import { useMaterialContentShadows } from './use-material-content-shadows';

// 高级材质候选名单；实际嵌在另一块材质内的普通控件不再注册第二层滤镜。
const surfaceSelector = [
  '.rail',
  '.app-toast',
  '.map-search-box',
  '.map-route-plan-card',
  '.map-routing-status',
  '.map-marker-list',
  '.map-coordinate-pick-hint',
  '.map-toolbar',
  '.map-poi-detail-panel',
  '.map-layer-panel',
  '.transit-visual-route-panel',
  '.transit-visual-toolbar',
  '.poi-visual-coordinate-panel',
  '.poi-visual-toolbox',
  '.poi-visual-viewport-controls',
  '.telegraph-history-panel',
  '.telegraph-confirm-dialog',
  '.telegraph-floating-toolbar',
  '.modal-panel',
  '.bottom-nav',
  '.topbar > :has(> :is(button, a)):not(.secondary-actions)',
  '.topbar > :is(button, a):not(.brand)',
  '.secondary-topbar > .secondary-actions > .admin-edit-link:only-child',
  '.secondary-topbar > .secondary-actions:has(> .admin-edit-link):has(> .operation-toc)',
  '.material-studio-topbar-actions',
  // 标题栏工具栏中的操作按钮：可视化编辑页的返回/确定/保存/取消与实体标题栏操作，
  // 透光模式下作为独立液态表面（选择器需与 globals.css 的 advanced 配方同步）。
  '.visual-editor-page-header > :is(button, a)',
  '.visual-editor-page-actions > :is(button, a)',
  '.visual-editor-page-back',
  '.transit-entity-heading-actions > :is(button, a)',
  '.hero-carousel-controls',
  '.operation-toc-panel',
  '.operation-toc-toggle',
  // 控件展示板右下角「全局外观」悬浮面板（仅 /dev/controls 存在）。
  '.controls-appearance-panel',
  // 二级页面标题栏中唯一的独立按钮/链接；成组容器由各自的组规则覆盖，
  // 组内按钮不逐个注册第二层滤镜。
  '.secondary-topbar > .secondary-actions > :is(button, a):only-child',
  // 弹窗标题栏上的独立图标按钮（关闭钮等）。
  '.modal-panel > :is(.section-heading, .shortcut-dialog-header, .material-preview-heading, .material-history-heading, .telegraph-output-heading, header) > :is(.icon-action-button, .icon-button)',
  // 物料历史弹窗关闭钮被 actions 包裹层多包了一层，单独注册。
  '.modal-panel > .material-history-heading > .material-history-heading-actions > :is(.icon-action-button, .icon-button)',
  // 弹窗复合底栏：胶囊整体作为一块材质（map-share、导视导入 footer）。
  '.modal-panel > .map-share-actions',
  '.modal-panel.metro-wayfinding-import-dialog > footer',
  // 纯按钮底栏：容器不承载材质，按钮逐个注册为独立液态表面。
  '.modal-panel > .admin-content-actions > :is(button, a)',
  '.modal-panel > .telegraph-confirm-actions > :is(button, a)',
  '.modal-panel > .material-action-row > :is(button, a)',
  '.modal-panel.metro-wayfinding-segment-dialog > footer > button',
  '.modal-panel.metro-wayfinding-combination-dialog > footer > button',
].join(',');

// 弹窗内部新增的“独立材质表面”：它们嵌在 modal-panel 材质内，但需要作为
// root 单独注册（关闭钮、复合底栏胶囊、纯按钮底栏内逐个按钮），
// 不能被嵌套判定降级为 nested。
const standaloneFloatingSurfaceSelector =
  '.modal-panel > :is(.section-heading, .shortcut-dialog-header, .material-preview-heading, .material-history-heading, .telegraph-output-heading, header) > :is(.icon-action-button, .icon-button), ' +
  '.modal-panel > .material-history-heading > .material-history-heading-actions > :is(.icon-action-button, .icon-button), ' +
  [
    '.modal-panel > .map-share-actions',
    '.modal-panel.metro-wayfinding-import-dialog > footer',
    '.modal-panel > .admin-content-actions > :is(button, a)',
    '.modal-panel > .telegraph-confirm-actions > :is(button, a)',
    '.modal-panel > .material-action-row > :is(button, a)',
    '.modal-panel.metro-wayfinding-segment-dialog > footer > button',
    '.modal-panel.metro-wayfinding-combination-dialog > footer > button',
  ].join(', ');

const svgNamespace = 'http://www.w3.org/2000/svg';
let nextFilterId = 0;

/**
 * 判断浏览器是否真的能用 SVG 引用做 backdrop-filter。
 * Safari / iOS 全版本都不支持，但 CSS.supports 的语法检测会把它误判为支持；
 * 一旦写入 url(...)，Safari 会丢掉整条滤镜（连普通模糊一起失效），
 * 因此这里对 WebKit（非 Chromium）直接降级为普通模糊。
 */
function supportsDistortionFilter() {
  if (typeof CSS === 'undefined' || typeof CSS.supports !== 'function') return false;
  if (!CSS.supports('backdrop-filter', 'url("#yct-liquid-probe")')) return false;
  const userAgent = navigator.userAgent;
  return !/AppleWebKit/i.test(userAgent) || /Chrome|Chromium|Edg|OPR/i.test(userAgent);
}

function resolveRadiusPart(value: string, size: number) {
  const trimmed = value.trim();
  if (trimmed.endsWith('%')) return (Number.parseFloat(trimmed) / 100) * size;
  const pixels = Number.parseFloat(trimmed);
  return Number.isFinite(pixels) ? pixels : 0;
}

function getEffectiveBorderRadius(element: HTMLElement, width: number, height: number) {
  const style = getComputedStyle(element);
  const corners = [
    style.borderTopLeftRadius,
    style.borderTopRightRadius,
    style.borderBottomRightRadius,
    style.borderBottomLeftRadius,
  ];
  const radius = corners.reduce((maximum, value) => {
    const [horizontal = '0', vertical = horizontal] = value.split(/\s+/);
    return Math.max(
      maximum,
      resolveRadiusPart(horizontal, width),
      resolveRadiusPart(vertical, height),
    );
  }, 0);
  return Math.min(radius, width / 2, height / 2);
}

function svgElement<K extends keyof SVGElementTagNameMap>(
  name: K,
  attributes: Record<string, string>,
) {
  const element = document.createElementNS(svgNamespace, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  return element;
}

interface Surface {
  filter: SVGFilterElement;
  image: SVGFEImageElement;
  transfer: SVGFEComponentTransferElement;
  displacement: SVGFEDisplacementMapElement;
  key: string;
}

export function LiquidMaterialBridge() {
  // 内容阴影独立于 SVG 扭曲能力，普通模糊降级时也要正确处理有底色的子元素。
  useMaterialContentShadows('[data-liquid-material]');
  useEffect(() => {
    const supportsDistortion = supportsDistortionFilter();

    const host = svgElement('svg', {
      class: 'yct-material-filter-defs',
      width: '0',
      height: '0',
      'aria-hidden': 'true',
      focusable: 'false',
    });
    const defs = svgElement('defs', {});
    host.append(defs);
    document.body.append(host);
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    let preference = readMaterialPreference();
    let frame = 0;
    const surfaces = new Map<HTMLElement, Surface>();
    const materialElements = new Set<HTMLElement>();
    const nestedElements = new Set<HTMLElement>();
    const pending = new Set<HTMLElement>();

    function render(element: HTMLElement, surface: Surface) {
      const width = element.offsetWidth;
      const height = element.offsetHeight;
      if (!width || !height) return;
      const radius = getEffectiveBorderRadius(element, width, height);
      const key = `${width}:${height}:${preference.thickness}:${radius}`;
      if (surface.key === key) return;
      surface.key = key;
      const map = createLiquidMaterialMap(width, height, preference.thickness, radius);
      canvas.width = map.mapWidth;
      canvas.height = map.mapHeight;
      const image = context!.createImageData(map.mapWidth, map.mapHeight);
      image.data.set(map.pixels);
      context!.putImageData(image, 0, 0);
      // 滤镜与图像使用控件的实际 CSS 尺寸，不能让百分比参照隐藏 SVG 的视口。
      for (const part of [surface.filter, surface.image, surface.transfer, surface.displacement]) {
        part.setAttribute('width', String(width));
        part.setAttribute('height', String(height));
      }
      surface.image.setAttribute('href', canvas.toDataURL('image/png'));
      surface.displacement.setAttribute('scale', String(map.scale));
      element.style.setProperty('--yct-material-distortion-filter', `url("#${surface.filter.id}")`);
      element.dataset.liquidMaterial = '';
    }

    function schedule(element: HTMLElement) {
      pending.add(element);
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        for (const item of pending) {
          const surface = surfaces.get(item);
          if (surface && item.isConnected) render(item, surface);
        }
        pending.clear();
      });
    }

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) schedule(entry.target as HTMLElement);
    });

    function remove(element: HTMLElement) {
      resizeObserver.unobserve(element);
      pending.delete(element);
      surfaces.get(element)?.filter.remove();
      surfaces.delete(element);
      materialElements.delete(element);
      element.style.removeProperty('--yct-material-distortion-filter');
      delete element.dataset.liquidMaterial;
    }

    function register(element: HTMLElement) {
      // 即使浏览器仅支持普通模糊，材质层级和交互样式也使用同一个标记。
      materialElements.add(element);
      element.dataset.liquidMaterial = '';
      if (!supportsDistortion || !context) return;
      if (surfaces.has(element)) return;
      const filter = svgElement('filter', {
        id: `yct-liquid-${++nextFilterId}`,
        x: '0',
        y: '0',
        filterUnits: 'userSpaceOnUse',
        primitiveUnits: 'userSpaceOnUse',
        'color-interpolation-filters': 'sRGB',
      });
      const image = svgElement('feImage', {
        x: '0',
        y: '0',
        preserveAspectRatio: 'none',
        result: 'edge-map',
      });
      const transfer = svgElement('feComponentTransfer', {
        in: 'edge-map',
        result: 'calibrated-map',
        x: '0',
        y: '0',
      });
      transfer.append(
        svgElement('feFuncR', {
          type: 'linear',
          slope: String(255 / 254),
          intercept: String(-1 / 254),
        }),
        svgElement('feFuncG', {
          type: 'linear',
          slope: String(255 / 254),
          intercept: String(-1 / 254),
        }),
      );
      const displacement = svgElement('feDisplacementMap', {
        in: 'SourceGraphic',
        in2: 'calibrated-map',
        x: '0',
        y: '0',
        xChannelSelector: 'R',
        yChannelSelector: 'G',
      });
      filter.append(image, transfer, displacement);
      defs.append(filter);
      surfaces.set(element, { filter, image, transfer, displacement, key: '' });
      resizeObserver.observe(element);
      schedule(element);
    }

    function refresh() {
      const candidates =
        preference.mode === 'advanced'
          ? Array.from(document.querySelectorAll<HTMLElement>(surfaceSelector))
          : [];
      const roots = new Set<HTMLElement>();
      const nested = new Set<HTMLElement>();
      for (const element of candidates) {
        const ancestor = element.parentElement?.closest(surfaceSelector);
        // 展开的目录/对话框在父控件外单独浮动，仍然是一块独立材质；
        // 弹窗标题栏独立按钮与悬浮胶囊虽然嵌在 modal-panel 内，也按 root 注册。
        const isFloatingPanel =
          (element.matches('.operation-toc-panel, .modal-panel, .telegraph-confirm-dialog') &&
            ['absolute', 'fixed'].includes(getComputedStyle(element).position)) ||
          element.matches(standaloneFloatingSurfaceSelector);
        (ancestor && !isFloatingPanel ? nested : roots).add(element);
      }
      for (const element of materialElements) {
        if (!roots.has(element)) remove(element);
      }
      for (const element of nestedElements) {
        if (!nested.has(element)) {
          delete element.dataset.materialNested;
          nestedElements.delete(element);
        }
      }
      for (const element of nested) {
        element.dataset.materialNested = '';
        nestedElements.add(element);
      }
      roots.forEach(register);
      surfaces.forEach((_, element) => schedule(element));
    }

    let refreshFrame = 0;
    const queueRefresh = () => {
      if (refreshFrame) return;
      refreshFrame = requestAnimationFrame(() => {
        refreshFrame = 0;
        refresh();
      });
    };

    // 性能闸门：整站（尤其地图页）class/DOM 变动极频繁，而 refresh 会对
    // 28+ 个含 :has 的复杂选择器做全文档扫描。先做廉价判断，只有变更可能
    // 影响候选表面集合（节点自身/祖先/子树命中选择器）时才刷新。
    function elementTouchesSurface(node: Node): boolean {
      if (node.nodeType !== Node.ELEMENT_NODE) return false;
      const element = node as HTMLElement;
      return Boolean(
        element.matches(surfaceSelector) ||
        element.closest(surfaceSelector) ||
        element.querySelector(surfaceSelector),
      );
    }

    function mutationIsRelevant(record: MutationRecord): boolean {
      if (record.type === 'attributes') return elementTouchesSurface(record.target);
      for (const node of record.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        const element = node as HTMLElement;
        // 新挂载节点可能就是候选、包含候选，或被挂到某个候选之下（影响嵌套判定）。
        if (
          element.matches(surfaceSelector) ||
          element.querySelector(surfaceSelector) ||
          element.parentElement?.closest(surfaceSelector)
        ) {
          return true;
        }
      }
      for (const node of record.removedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        const element = node as HTMLElement;
        if (element.matches(surfaceSelector) || element.querySelector(surfaceSelector)) {
          return true;
        }
      }
      return false;
    }

    const mutationObserver = new MutationObserver((records) => {
      // 忽略滤镜自身的更新，避免生成 PNG 触发下一轮自身重绘；
      // 与材质表面无关的高频变动（地图 SVG、列表 class 切换等）直接跳过。
      if (records.every((record) => host.contains(record.target))) return;
      if (records.some(mutationIsRelevant)) queueRefresh();
    });
    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class'],
    });
    const unsubscribe = subscribeMaterialPreferenceChanged(({ preference: next }) => {
      preference = next;
      refresh();
    });
    refresh();

    return () => {
      unsubscribe();
      mutationObserver.disconnect();
      resizeObserver.disconnect();
      cancelAnimationFrame(frame);
      cancelAnimationFrame(refreshFrame);
      for (const element of materialElements) remove(element);
      for (const element of nestedElements) delete element.dataset.materialNested;
      host.remove();
    };
  }, []);

  return null;
}
