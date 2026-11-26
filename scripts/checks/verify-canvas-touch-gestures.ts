/**
 * 物料工作台画布的触屏手势回归契约。
 *
 * 背景：导视牌画布（`metro-wayfinding-canvas.tsx`）和通用表单工作台预览
 * （`transit-material-form-workspace.tsx`）原先各自手写平移，`pointerdown` 之后的
 * 拖动在触屏上会被浏览器当成滚动 / 页面缩放接管，`pointercancel` 一来手势就断，
 * 手型工具因此「按得下去、拖不动」；也没有双指捏合。
 *
 * 现在两条画布共用 `useEditorViewport` + `viewport-gestures.ts`：
 *   A. 纯函数层保证捏合围绕两指中点锚定、双指同向滑动即平移、缩放有上下限；
 *   B. Hook 负责指针捕获、阈值判定、手势后吞掉一次 click、空格临时手型；
 *   C. 两个画布都接上 Hook，CSS 明确 `touch-action: none`，手型工具下热区让位。
 */
import { readFileSync } from 'node:fs';
import { readAppStyles } from './app-styles.ts';
import {
  clampViewportZoom,
  hasPointerMoved,
  resolveLayoutCenter,
  resolvePanViewport,
  resolvePinchViewport,
  resolvePointerMidpoint,
  type ViewportPoint,
  type ViewportTransform,
} from '../../apps/web/lib/editor/viewport-gestures.ts';

const HOOK = readFileSync(
  new URL('../../apps/web/lib/editor/use-editor-viewport.ts', import.meta.url),
  'utf8',
);
const METRO_CANVAS = readFileSync(
  new URL('../../apps/web/components/metro-wayfinding-canvas.tsx', import.meta.url),
  'utf8',
);
const FORM_WORKSPACE = readFileSync(
  new URL('../../apps/web/components/transit-material-form-workspace.tsx', import.meta.url),
  'utf8',
);
const WAYFINDING_WORKSPACE = readFileSync(
  new URL('../../apps/web/components/transit-wayfinding-workspace.tsx', import.meta.url),
  'utf8',
);
const CSS = readAppStyles();

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean) {
  if (ok) {
    passed += 1;
    console.log(`✅ ${name}`);
  } else {
    failed += 1;
    console.log(`❌ ${name}`);
  }
}

function near(actual: number, expected: number, tolerance = 1e-9): boolean {
  return Math.abs(actual - expected) <= tolerance;
}

function nearPoint(actual: ViewportPoint, expected: ViewportPoint, tolerance = 1e-9): boolean {
  return near(actual.x, expected.x, tolerance) && near(actual.y, expected.y, tolerance);
}

/** 用画布实际的 CSS 变换把内容坐标投影回屏幕坐标，用于验证锚点没有被挪走。 */
function projectToScreen(
  transform: ViewportTransform,
  layoutCenter: ViewportPoint,
  content: ViewportPoint,
): ViewportPoint {
  return {
    x: layoutCenter.x + transform.pan.x + transform.zoom * (content.x - layoutCenter.x),
    y: layoutCenter.y + transform.pan.y + transform.zoom * (content.y - layoutCenter.y),
  };
}

function contentAtScreen(
  transform: ViewportTransform,
  layoutCenter: ViewportPoint,
  screen: ViewportPoint,
): ViewportPoint {
  return {
    x: layoutCenter.x + (screen.x - layoutCenter.x - transform.pan.x) / transform.zoom,
    y: layoutCenter.y + (screen.y - layoutCenter.y - transform.pan.y) / transform.zoom,
  };
}

console.log('── 1. 捏合缩放：围绕两指中点锚定 ──────────────');

const layoutCenter = { x: 400, y: 300 };
const start: ViewportTransform = { zoom: 1, pan: { x: 0, y: 0 } };
const startMidpoint = { x: 520, y: 260 };
const pinchedOut = resolvePinchViewport({
  start,
  layoutCenter,
  startMidpoint,
  currentMidpoint: { x: 540, y: 250 },
  startDistance: 120,
  currentDistance: 240,
  minZoom: 0.2,
  maxZoom: 6,
});
check('两指间距翻倍 → 缩放翻倍', near(pinchedOut.zoom, 2));
check(
  '起手时中点下的内容仍落在当前两指中点上',
  nearPoint(
    projectToScreen(pinchedOut, layoutCenter, contentAtScreen(start, layoutCenter, startMidpoint)),
    { x: 540, y: 250 },
    1e-6,
  ),
);

const clamped = resolvePinchViewport({
  start,
  layoutCenter,
  startMidpoint,
  currentMidpoint: { x: 600, y: 200 },
  startDistance: 100,
  currentDistance: 100000,
  minZoom: 0.2,
  maxZoom: 4,
});
check('捏合放大受 maxZoom 限制', near(clamped.zoom, 4));
check(
  '撞到上限后锚点依旧不漂移',
  nearPoint(
    projectToScreen(clamped, layoutCenter, contentAtScreen(start, layoutCenter, startMidpoint)),
    {
      x: 600,
      y: 200,
    },
    1e-6,
  ),
);

const zoomedInStart: ViewportTransform = { zoom: 2.5, pan: { x: -60, y: 35 } };
const pinchBack = resolvePinchViewport({
  start: zoomedInStart,
  layoutCenter,
  startMidpoint: { x: 430, y: 330 },
  currentMidpoint: { x: 430, y: 330 },
  startDistance: 200,
  currentDistance: 100,
  minZoom: 0.2,
  maxZoom: 6,
});
check(
  '已有缩放 / 平移时，捏合缩小的锚点同样保持',
  near(zoomedInStart.zoom * 0.5, pinchBack.zoom) &&
    nearPoint(
      projectToScreen(
        pinchBack,
        layoutCenter,
        contentAtScreen(zoomedInStart, layoutCenter, { x: 430, y: 330 }),
      ),
      { x: 430, y: 330 },
      1e-6,
    ),
);

console.log('\n── 2. 双指同向滑动 = 平移 ─────────────────────');

const twoFingerPan = resolvePinchViewport({
  start,
  layoutCenter,
  startMidpoint: { x: 500, y: 300 },
  currentMidpoint: { x: 530, y: 280 },
  startDistance: 160,
  currentDistance: 160,
  minZoom: 0.2,
  maxZoom: 6,
});
check('间距不变 → 缩放不变', near(twoFingerPan.zoom, 1));
check('平移量等于两指中点的位移', nearPoint(twoFingerPan.pan, { x: 30, y: -20 }));

console.log('\n── 3. 单指平移 / 阈值 / 布局中心 ──────────────');

check(
  '单指拖拽只按位移平移',
  nearPoint(resolvePanViewport({ x: 10, y: -4 }, { x: 200, y: 200 }, { x: 215, y: 190 }), {
    x: 25,
    y: -14,
  }),
);
check('轻点（小于阈值）不算手势', !hasPointerMoved({ x: 10, y: 10 }, { x: 12, y: 11 }, 4));
check('拖动超过阈值才算手势', hasPointerMoved({ x: 10, y: 10 }, { x: 20, y: 11 }, 4));
check(
  '由变换后中心反推布局中心（减去 pan）',
  nearPoint(resolveLayoutCenter({ x: 500, y: 380 }, { x: 100, y: 80 }), layoutCenter),
);
check('缩放上下限可互换传参也不出错', near(clampViewportZoom(9, 4, 1), 4));
check(
  '两指中点计算',
  nearPoint(resolvePointerMidpoint({ x: 0, y: 0 }, { x: 10, y: 20 }), { x: 5, y: 10 }),
);

console.log('\n── 4. Hook：指针捕获 / 手势后吞 click / 空格手型 ──');

check(
  'Hook 用 Map 跟踪多指',
  /pointersRef = useRef\(new Map<number, ActivePointer>\(\)\)/.test(HOOK),
);
check('Hook 调用纯函数捏合求解', /resolvePinchViewport\(\{/.test(HOOK));
check('Hook 按阈值判定手势', /hasPointerMoved\(/.test(HOOK));
check(
  'Hook 捕获 / 释放指针',
  /setPointerCapture\(/.test(HOOK) && /releasePointerCapture\(/.test(HOOK),
);
check('Hook 提供 click 吞掉通道', /onClickCapture/.test(HOOK) && /stopPropagation\(\)/.test(HOOK));
check('Hook 接管空格临时手型', /event\.code === 'Space'/.test(HOOK) && /spacePanning/.test(HOOK));
check(
  'Hook 用非被动监听接管滚轮',
  /addEventListener\('wheel', handleWheel, \{ passive: false \}\)/.test(HOOK),
);
check('窗口失焦时收起手势', /addEventListener\('blur', handleWindowBlur\)/.test(HOOK));

console.log('\n── 5. 两条画布接上 Hook ───────────────────────');

check(
  '导视牌画布：调用 useEditorViewport',
  /const viewport = useEditorViewport\(\{/.test(METRO_CANVAS),
);
check('导视牌画布：手型工具作为 panEnabled', /panEnabled: panTool/.test(METRO_CANVAS));
check('导视牌画布：展开 stageProps', /\{\.\.\.viewport\.stageProps\}/.test(METRO_CANVAS));
check(
  '导视牌画布：捏合按变换层中心锚定',
  /ref=\{transformRef\}/.test(METRO_CANVAS) && /transformRef,\r?\n/.test(METRO_CANVAS),
);
check(
  '导视牌画布：牌面命中框不算原生控件（双指可从牌面起手）',
  /button:not\(\.metro-wayfinding-canvas-hit\)/.test(METRO_CANVAS),
);
check('导视牌画布：不再手写 panStateRef', !/panStateRef/.test(METRO_CANVAS));
check('导视牌画布：不再各自挂滚轮监听', !/addEventListener\('wheel'/.test(METRO_CANVAS));
check(
  '导视牌画布：空格临时手型仍走 Hook 状态',
  /viewport\.spacePanning/.test(METRO_CANVAS) && /viewport\.gesturing/.test(METRO_CANVAS),
);
check(
  '导视牌工作台仍把手型工具传给画布',
  /panTool=\{activeTool === 'pan'\}/.test(WAYFINDING_WORKSPACE),
);

check(
  '表单工作台：调用 useEditorViewport',
  /const viewport = useEditorViewport\(\{/.test(FORM_WORKSPACE),
);
check(
  '表单工作台：手型工具作为 panEnabled',
  /panEnabled: activeTool === 'pan'/.test(FORM_WORKSPACE),
);
check('表单工作台：展开 stageProps', /\{\.\.\.viewport\.stageProps\}/.test(FORM_WORKSPACE));
check(
  '表单工作台：捏合按变换层中心锚定',
  /ref=\{transformRef\}/.test(FORM_WORKSPACE) && /transformRef,\r?\n/.test(FORM_WORKSPACE),
);
check('表单工作台：不再手写 panStateRef', !/panStateRef/.test(FORM_WORKSPACE));
check('表单工作台：不再各自挂滚轮监听', !/addEventListener\('wheel'/.test(FORM_WORKSPACE));

console.log('\n── 6. CSS：触屏手势不被浏览器抢走 ─────────────');

check(
  '表单预览舞台声明 touch-action: none',
  /\.transit-material-preview-stage \{[^}]*touch-action: none;/.test(CSS),
);
check(
  '导视牌画布保持 touch-action: none',
  /\.metro-wayfinding-canvas \{[^}]*touch-action: none;/.test(CSS),
);
check(
  '手型工具下热区让位给拖拽',
  /\.transit-material-preview-stage\.is-pan-tool \.transit-material-region-layer \{[^}]*pointer-events: none;/.test(
    CSS,
  ),
);
check(
  '拖拽 / 捏合时显示抓手光标',
  /\.transit-material-preview-stage\.is-gesturing,[\s\S]{0,120}?cursor: grabbing;/.test(CSS),
);

console.log(`\n${passed}/${passed + failed} 通过`);
if (failed > 0) process.exit(1);
