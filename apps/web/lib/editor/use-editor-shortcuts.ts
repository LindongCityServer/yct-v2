'use client';

import { useEffect, useRef } from 'react';
import { isEditableTarget, normalizeShortcut, type EditorShortcut } from './shortcuts';

/**
 * 编辑器快捷键统一入口。
 * 只注册一个 window 监听器，绑定表通过 ref 更新，避免每次渲染重复挂载。
 */
export function useEditorShortcuts(
  shortcuts: EditorShortcut[],
  options: { enabled?: boolean } = {},
) {
  const shortcutsRef = useRef(shortcuts);
  const enabledRef = useRef(options.enabled ?? true);

  useEffect(() => {
    shortcutsRef.current = shortcuts;
    enabledRef.current = options.enabled ?? true;
  });

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!enabledRef.current || event.defaultPrevented) {
        return;
      }
      const combo = normalizeShortcut(event);
      if (!combo) {
        return;
      }
      const editable = isEditableTarget(event.target);
      const matched = shortcutsRef.current.find(
        (shortcut) => shortcut.keys === combo && (!editable || shortcut.allowInInput),
      );
      if (!matched) {
        return;
      }
      event.preventDefault();
      matched.run(event);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}
