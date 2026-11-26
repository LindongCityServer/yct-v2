'use client';

import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import {
  DEFAULT_GESTURE_SLOP,
  clampViewportZoom,
  hasPointerMoved,
  resolveLayoutCenter,
  resolvePanViewport,
  resolvePinchViewport,
  resolvePointerDistance,
  resolvePointerMidpoint,
  type ViewportPan,
  type ViewportPoint,
  type ViewportTransform,
} from './viewport-gestures';

/** 默认把按钮 / 输入框当成「保留原生交互」的控件，落在它们上面的指针不参与画布手势。 */
export const defaultInteractiveTargetSelector =
  'button, input, select, textarea, a[href], [contenteditable="true"]';

export function isInteractiveCanvasTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest(defaultInteractiveTargetSelector));
}

export interface EditorViewportOptions {
  zoom: number;
  pan: ViewportPan;
  minZoom: number;
  maxZoom: number;
  /** 手型工具：左键 / 单指直接拖拽平移；双指手势不受它限制。 */
  panEnabled?: boolean;
  /** 禁用时忽略指针、滚轮与空格临时手型。 */
  disabled?: boolean;
  /** 滚轮每档的缩放倍率。 */
  wheelStep?: number;
  /** 单指拖拽多少像素后判定为手势。 */
  dragSlop?: number;
  /** 画布根节点：指针事件与滚轮都挂在这里。 */
  stageRef: RefObject<HTMLElement | null>;
  /** 带 `translate(...) scale(...)` 的元素，`transform-origin` 必须是 center。 */
  transformRef: RefObject<HTMLElement | null>;
  onChange: (next: ViewportTransform) => void;
  /** 覆盖「保留原生交互」的控件判定，内容层的命中框 / 热区应返回 false。 */
  isInteractiveTarget?: (target: EventTarget | null) => boolean;
}

export interface EditorViewportStageProps {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void;
  onLostPointerCapture: (event: ReactPointerEvent<HTMLElement>) => void;
  onClickCapture: (event: ReactMouseEvent<HTMLElement>) => void;
}

export interface EditorViewportState {
  /** 空格临时手型是否生效（用于抓手光标）。 */
  spacePanning: boolean;
  /** 是否正在拖拽 / 捏合（用于抓手光标）。 */
  gesturing: boolean;
  /** 直接展开到画布根节点：`<div {...stageProps} />`。 */
  stageProps: EditorViewportStageProps;
}

interface ActivePointer extends ViewportPoint {
  pointerType: string;
  /** 落在按钮 / 输入框上：不参与单指平移，也不参与双指捏合。 */
  interactive: boolean;
}

interface PanGesture {
  kind: 'pan';
  pointerId: number;
  startPointer: ViewportPoint;
  startPan: ViewportPan;
  moved: boolean;
}

interface PinchGesture {
  kind: 'pinch';
  pointerIds: [number, number];
  startTransform: ViewportTransform;
  layoutCenter: ViewportPoint;
  startMidpoint: ViewportPoint;
  startDistance: number;
  moved: boolean;
}

type ViewportGesture = PanGesture | PinchGesture;

/**
 * 编辑器画布的视口手势：滚轮缩放、空格 / 中键 / 手型工具拖拽平移、双指捏合缩放与
 * 两指拖动平移。
 *
 * 触屏上单指要看当前工具：手型工具（或按住空格）时单指直接平移；其他工具下单指留给
 * 命中框选中 / 双击编辑，视口操作交给双指手势。手势经过阈值后会吞掉随后的一次
 * `click`，避免「拖完画布顺手选中了一个元素」。
 *
 * 组件仍各自持有 zoom / pan 状态，Hook 只负责读手势并回调 `onChange`，这样缩放条、
 * 适配、`Ctrl+0` 等既有入口都不用改。
 */
export function useEditorViewport({
  zoom,
  pan,
  minZoom,
  maxZoom,
  panEnabled = false,
  disabled = false,
  wheelStep = 1.12,
  dragSlop = DEFAULT_GESTURE_SLOP,
  stageRef,
  transformRef,
  onChange,
  isInteractiveTarget = isInteractiveCanvasTarget,
}: EditorViewportOptions): EditorViewportState {
  const [spacePanning, setSpacePanning] = useState(false);
  const [gesturing, setGesturing] = useState(false);

  const pointersRef = useRef(new Map<number, ActivePointer>());
  const gestureRef = useRef<ViewportGesture | null>(null);
  // 手势结束后吞掉一次 click：拖拽 / 捏合不应顺带选中元素。
  const suppressClickRef = useRef(false);
  // Hook 自己改过的视口要立刻生效，否则同一帧内的连续 wheel / pointermove 会读到旧值。
  const viewportRef = useRef<ViewportTransform>({ zoom, pan });
  const latestRef = useRef({
    minZoom,
    maxZoom,
    panEnabled,
    disabled,
    wheelStep,
    dragSlop,
    onChange,
    isInteractiveTarget,
  });

  useEffect(() => {
    viewportRef.current = { zoom, pan };
  });

  useEffect(() => {
    latestRef.current = {
      minZoom,
      maxZoom,
      panEnabled,
      disabled,
      wheelStep,
      dragSlop,
      onChange,
      isInteractiveTarget,
    };
  });

  const applyViewport = (next: ViewportTransform) => {
    viewportRef.current = next;
    latestRef.current.onChange(next);
  };

  /** 结束当前手势；只有真的拖动过才拦截随后的 click。 */
  const finishGesture = (moved: boolean) => {
    if (moved) {
      suppressClickRef.current = true;
    }
    gestureRef.current = null;
    setGesturing(false);
  };

  // 空格临时手型：不改变当前工具，松开即恢复。
  useEffect(() => {
    const isEditable = (target: EventTarget | null) =>
      target instanceof HTMLElement &&
      (target.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName));
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space' && !isEditable(event.target)) {
        setSpacePanning(true);
      }
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        setSpacePanning(false);
      }
    };
    const handleWindowBlur = () => {
      setSpacePanning(false);
      pointersRef.current.clear();
      if (gestureRef.current) {
        gestureRef.current = null;
        setGesturing(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleWindowBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, []);

  // 禁用时立刻收起进行中的手势，避免继续向已锁定的画布写视口。
  useEffect(() => {
    if (!disabled) {
      return;
    }
    pointersRef.current.clear();
    gestureRef.current = null;
    setGesturing(false);
    setSpacePanning(false);
  }, [disabled]);

  // 滚轮缩放需要非被动监听，否则浏览器会忽略 preventDefault。
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || disabled) {
      return undefined;
    }
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const current = viewportRef.current;
      const factor = event.deltaY < 0 ? wheelStep : 1 / wheelStep;
      const nextZoom = clampViewportZoom(current.zoom * factor, minZoom, maxZoom);
      if (nextZoom === current.zoom) {
        return;
      }
      applyViewport({ zoom: nextZoom, pan: current.pan });
    };
    stage.addEventListener('wheel', handleWheel, { passive: false });
    return () => stage.removeEventListener('wheel', handleWheel);
  }, [disabled, maxZoom, minZoom, stageRef, wheelStep]);

  const capturePointer = (element: Element, pointerId: number) => {
    try {
      element.setPointerCapture(pointerId);
    } catch {
      // 指针已经抬起（快速点击）时 setPointerCapture 会抛错，忽略即可。
    }
  };

  const releasePointer = (element: Element, pointerId: number) => {
    try {
      if (element.hasPointerCapture(pointerId)) {
        element.releasePointerCapture(pointerId);
      }
    } catch {
      // 指针已失效时 release 也可能抛错。
    }
  };

  const beginPinchGesture = (stage: Element, previous: ViewportGesture | null) => {
    const entries = Array.from(pointersRef.current.entries()).slice(0, 2);
    if (entries.length < 2) {
      return;
    }
    const [first, second] = entries;
    // 有一根手指落在按钮 / 输入框上时让原生交互赢，不拉起手势。
    if (first[1].interactive || second[1].interactive) {
      return;
    }
    const transform = transformRef.current ?? stage;
    const rect = transform.getBoundingClientRect();
    const transformViewport = viewportRef.current;
    gestureRef.current = {
      kind: 'pinch',
      pointerIds: [first[0], second[0]],
      startTransform: transformViewport,
      layoutCenter: resolveLayoutCenter(
        { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
        transformViewport.pan,
      ),
      startMidpoint: resolvePointerMidpoint(first[1], second[1]),
      startDistance: Math.max(1, resolvePointerDistance(first[1], second[1])),
      // 单指已经拖过一段再补第二根手指时，别把「已移动」判回轻点。
      moved: previous?.moved ?? false,
    };
    capturePointer(stage, first[0]);
    capturePointer(stage, second[0]);
    setGesturing(true);
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (latestRef.current.disabled) {
      return;
    }
    // 新按下的指针重置上一次手势的 click 拦截，避免吞掉这一次轻点。
    suppressClickRef.current = false;
    const interactive = latestRef.current.isInteractiveTarget(event.target);
    pointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
      pointerType: event.pointerType,
      interactive,
    });

    const gesture = gestureRef.current;
    // 已经有两指在捏合时，第三根手指只记录位置，不重算锚点。
    if (gesture?.kind === 'pinch') {
      return;
    }
    if (pointersRef.current.size >= 2) {
      event.preventDefault();
      beginPinchGesture(event.currentTarget, gesture);
      return;
    }
    if (interactive) {
      return;
    }
    const wantsPan =
      event.button === 1 || (event.button === 0 && (latestRef.current.panEnabled || spacePanning));
    if (!wantsPan) {
      return;
    }
    event.preventDefault();
    gestureRef.current = {
      kind: 'pan',
      pointerId: event.pointerId,
      startPointer: { x: event.clientX, y: event.clientY },
      startPan: viewportRef.current.pan,
      moved: false,
    };
    capturePointer(event.currentTarget, event.pointerId);
    setGesturing(true);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const pointer = pointersRef.current.get(event.pointerId);
    if (!pointer) {
      return;
    }
    pointersRef.current.set(event.pointerId, {
      ...pointer,
      x: event.clientX,
      y: event.clientY,
    });

    const gesture = gestureRef.current;
    if (!gesture) {
      return;
    }
    if (gesture.kind === 'pan') {
      if (gesture.pointerId !== event.pointerId) {
        return;
      }
      const current = { x: event.clientX, y: event.clientY };
      if (!gesture.moved && !hasPointerMoved(gesture.startPointer, current, dragSlop)) {
        return;
      }
      gesture.moved = true;
      applyViewport({
        zoom: viewportRef.current.zoom,
        pan: resolvePanViewport(gesture.startPan, gesture.startPointer, current),
      });
      return;
    }

    if (!gesture.pointerIds.includes(event.pointerId)) {
      return;
    }
    const first = pointersRef.current.get(gesture.pointerIds[0]);
    const second = pointersRef.current.get(gesture.pointerIds[1]);
    if (!first || !second) {
      return;
    }
    const currentMidpoint = resolvePointerMidpoint(first, second);
    const currentDistance = resolvePointerDistance(first, second);
    if (
      !gesture.moved &&
      !hasPointerMoved(gesture.startMidpoint, currentMidpoint, dragSlop) &&
      Math.abs(currentDistance - gesture.startDistance) <= dragSlop
    ) {
      return;
    }
    gesture.moved = true;
    applyViewport(
      resolvePinchViewport({
        start: gesture.startTransform,
        layoutCenter: gesture.layoutCenter,
        startMidpoint: gesture.startMidpoint,
        currentMidpoint,
        startDistance: gesture.startDistance,
        currentDistance,
        minZoom: latestRef.current.minZoom,
        maxZoom: latestRef.current.maxZoom,
      }),
    );
  };

  const finishPointer = (event: ReactPointerEvent<HTMLElement>) => {
    releasePointer(event.currentTarget, event.pointerId);
    pointersRef.current.delete(event.pointerId);

    const gesture = gestureRef.current;
    if (!gesture) {
      return;
    }
    if (gesture.kind === 'pan') {
      if (gesture.pointerId !== event.pointerId) {
        return;
      }
      finishGesture(gesture.moved);
      return;
    }

    if (!gesture.pointerIds.includes(event.pointerId)) {
      return;
    }
    if (gesture.moved) {
      suppressClickRef.current = true;
    }
    const remainingId = gesture.pointerIds.find((id) => id !== event.pointerId);
    const remaining = remainingId === undefined ? undefined : pointersRef.current.get(remainingId);
    // 双指里先抬起一根：剩下的手指继续平移，别让手势突然断在半路。
    if (remaining && remainingId !== undefined && remaining.pointerType !== 'mouse') {
      gestureRef.current = {
        kind: 'pan',
        pointerId: remainingId,
        startPointer: { x: remaining.x, y: remaining.y },
        startPan: viewportRef.current.pan,
        moved: true,
      };
      return;
    }
    finishGesture(gesture.moved);
  };

  const handleClickCapture = (event: ReactMouseEvent<HTMLElement>) => {
    if (!suppressClickRef.current) {
      return;
    }
    suppressClickRef.current = false;
    event.preventDefault();
    event.stopPropagation();
  };

  return {
    spacePanning,
    gesturing,
    stageProps: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: finishPointer,
      onPointerCancel: finishPointer,
      onLostPointerCapture: finishPointer,
      onClickCapture: handleClickCapture,
    },
  };
}
