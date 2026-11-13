'use client';

import { useCallback, useRef } from 'react';

export interface EditorSnapshotHistory<T> {
  /** 入栈并清空重做栈；超出上限时丢弃最旧的一条。 */
  push: (snapshot: T) => void;
  /** 撤销：把当前快照换到重做栈，返回上一条快照；没有可撤销项时返回 null。 */
  undo: (current: T) => T | null;
  /** 重做：把当前快照换到撤销栈，返回下一条快照；没有可重做项时返回 null。 */
  redo: (current: T) => T | null;
  reset: () => void;
}

/**
 * 编辑器快照历史栈：四个工作台的历史语义不同（整份草稿 / 节点数组），
 * 这里只统一栈容器、上限与「入栈即清空重做」的规则，快照构造仍由调用方负责。
 */
export function useSnapshotHistory<T>(limit = 100): EditorSnapshotHistory<T> {
  const undoStackRef = useRef<T[]>([]);
  const redoStackRef = useRef<T[]>([]);

  const push = useCallback(
    (snapshot: T) => {
      undoStackRef.current.push(snapshot);
      if (undoStackRef.current.length > limit) {
        undoStackRef.current.shift();
      }
      redoStackRef.current = [];
    },
    [limit],
  );

  const undo = useCallback((current: T): T | null => {
    const previous = undoStackRef.current.pop();
    if (previous === undefined) {
      return null;
    }
    redoStackRef.current.push(current);
    return previous;
  }, []);

  const redo = useCallback((current: T): T | null => {
    const next = redoStackRef.current.pop();
    if (next === undefined) {
      return null;
    }
    undoStackRef.current.push(current);
    return next;
  }, []);

  const reset = useCallback(() => {
    undoStackRef.current = [];
    redoStackRef.current = [];
  }, []);

  return { push, undo, redo, reset };
}
