'use client';

import { useEffect } from 'react';
import {
  readMaterialPreference,
  subscribeMaterialPreferenceChanged,
} from '../lib/client-material-preference';

const backgroundProperty = '--yct-material-content-background';

function readBackgroundColor(style: CSSStyleDeclaration) {
  // 蒙版图标的 background-color 是图形本身的颜色，不能当作内容底色。
  if (style.maskImage !== 'none') return undefined;
  const color = style.backgroundColor.trim();
  if (!color || color === 'transparent') return undefined;
  // 兼容浏览器返回的 rgba()、color(srgb ... / alpha) 和百分比透明度。
  if (color.includes('/')) {
    return Number.parseFloat(color.split('/').at(-1)!) > 0 ? color : undefined;
  }
  const channels = color.slice(color.indexOf('(') + 1, -1).split(',');
  return channels.length !== 4 || Number.parseFloat(channels[3]!) > 0 ? color : undefined;
}

export function useMaterialContentShadows(surfaceSelector: string) {
  useEffect(() => {
    let advanced = readMaterialPreference().mode === 'advanced';
    let frame = 0;
    let refreshAll = true;
    const pending = new Set<Element>();
    const marked = new Map<
      HTMLElement | SVGElement,
      { color: string; previousValue: string; previousPriority: string }
    >();

    function clear(element: HTMLElement | SVGElement) {
      const entry = marked.get(element);
      if (entry && element.style.getPropertyValue(backgroundProperty) === entry.color) {
        if (entry.previousValue) {
          element.style.setProperty(
            backgroundProperty,
            entry.previousValue,
            entry.previousPriority,
          );
        } else {
          element.style.removeProperty(backgroundProperty);
        }
      }
      element.removeAttribute('data-material-backed-content');
      marked.delete(element);
    }

    function refreshSurface(surface: Element) {
      const updates: { element: HTMLElement | SVGElement; color: string | undefined }[] = [];
      for (const element of surface.querySelectorAll('*')) {
        // 每块嵌套材质自行处理；材质本身的半透明底色不算独立的内容背景。
        if (element.closest(surfaceSelector) !== surface) continue;
        if (!(element instanceof HTMLElement || element instanceof SVGElement)) continue;
        updates.push({ element, color: readBackgroundColor(getComputedStyle(element)) });
      }
      // 先读后写，避免每个子元素都触发样式重新计算。
      for (const { element, color } of updates) {
        if (color) {
          const entry = marked.get(element) ?? {
            color,
            previousValue: element.style.getPropertyValue(backgroundProperty),
            previousPriority: element.style.getPropertyPriority(backgroundProperty),
          };
          entry.color = color;
          marked.set(element, entry);
          if (!element.hasAttribute('data-material-backed-content')) {
            element.setAttribute('data-material-backed-content', '');
          }
          // 仅颜色变化时写入，避免 style 观察器持续触发自身。
          if (element.style.getPropertyValue(backgroundProperty) !== color) {
            element.style.setProperty(backgroundProperty, color);
          }
        } else if (marked.has(element)) {
          clear(element);
        }
      }
    }

    function schedule(target?: Element) {
      if (!advanced) return;
      if (target) {
        const surface = target.closest(surfaceSelector);
        if (surface) pending.add(surface);
      } else {
        refreshAll = true;
      }
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        for (const element of marked.keys()) {
          if (
            !element.isConnected ||
            !element.closest(surfaceSelector) ||
            element.matches(surfaceSelector)
          ) {
            clear(element);
          }
        }
        const surfaces = refreshAll ? document.querySelectorAll(surfaceSelector) : pending;
        for (const surface of surfaces) {
          if (surface.isConnected) refreshSurface(surface);
        }
        pending.clear();
        refreshAll = false;
      });
    }

    const observer = new MutationObserver((records) => {
      for (const record of records) {
        const target =
          record.target instanceof Element ? record.target : record.target.parentElement;
        if (!target || target.closest('.yct-material-filter-defs')) continue;
        if (target.closest(surfaceSelector)) {
          schedule(target);
        } else if (target === document.documentElement || target.querySelector(surfaceSelector)) {
          schedule();
        }
      }
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        'class',
        'style',
        'aria-selected',
        'aria-pressed',
        'aria-current',
        'data-state',
        'data-liquid-material',
        'data-material-nested',
        'open',
      ],
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['style', 'data-color-scheme', 'data-accent'],
    });

    function onInteraction(event: Event) {
      if (event.target instanceof Element) schedule(event.target);
    }
    function onTransition(event: TransitionEvent) {
      if (event.propertyName.startsWith('background')) onInteraction(event);
    }
    function onResize() {
      schedule();
    }
    const interactionEvents = ['pointerover', 'pointerout', 'focusin', 'focusout'];
    for (const name of interactionEvents) document.addEventListener(name, onInteraction, true);
    document.addEventListener('transitionend', onTransition, true);
    document.addEventListener('transitioncancel', onTransition, true);
    window.addEventListener('resize', onResize);
    const unsubscribe = subscribeMaterialPreferenceChanged(({ preference }) => {
      advanced = preference.mode === 'advanced';
      if (advanced) {
        schedule();
      } else {
        cancelAnimationFrame(frame);
        frame = 0;
        pending.clear();
        for (const element of marked.keys()) clear(element);
      }
    });
    schedule();

    return () => {
      unsubscribe();
      observer.disconnect();
      cancelAnimationFrame(frame);
      for (const name of interactionEvents) document.removeEventListener(name, onInteraction, true);
      document.removeEventListener('transitionend', onTransition, true);
      document.removeEventListener('transitioncancel', onTransition, true);
      window.removeEventListener('resize', onResize);
      for (const element of marked.keys()) clear(element);
    };
  }, [surfaceSelector]);
}
