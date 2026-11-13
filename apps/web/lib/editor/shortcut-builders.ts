'use client';

import { EDITOR_SHORTCUT_CATALOG, type EditorShortcut } from './shortcuts';

type ShortcutCatalogKey = keyof typeof EDITOR_SHORTCUT_CATALOG;

/**
 * 从快捷键目录生成注册项：id / keys / label / group 全部取自目录，
 * 调用方只声明「按下时做什么」，避免三个工作台重复抄写同一组字段。
 * 同一目录键需要注册多个键位（例如 Backspace 与 Delete）时用 overrides 覆盖。
 */
export function defineShortcut(
  key: ShortcutCatalogKey,
  run: EditorShortcut['run'],
  overrides?: Partial<Pick<EditorShortcut, 'id' | 'keys' | 'label' | 'group' | 'allowInInput'>>,
): EditorShortcut {
  const entry = EDITOR_SHORTCUT_CATALOG[key];
  return {
    id: entry.id,
    keys: entry.keys,
    label: entry.label,
    group: entry.group,
    ...overrides,
    run,
  };
}
