/**
 * 编辑器内核的公共类型。
 * 内核不认识任何业务实体（POI / 线路 / 班次），业务通过 id 与回调接入。
 */

export interface EditorPoint {
  x: number;
  y: number;
}

export interface EditorSize {
  width: number;
  height: number;
}

/**
 * 画布视口：世界坐标先乘 scale，再加 offset 得到屏幕坐标。
 * 屏幕坐标以画布容器左上角为原点。
 */
export interface EditorViewport {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export interface EditorBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** 工具定义，由业务方声明，内核只负责展示与快捷键映射。 */
export interface EditorTool {
  id: string;
  label: string;
  /** Material Symbols 图标名。 */
  icon: string;
  /** 展示用键位文案，例如 V / H / P。 */
  shortcut?: string;
  disabled?: boolean;
}

export const DEFAULT_EDITOR_VIEWPORT: EditorViewport = {
  scale: 1,
  offsetX: 0,
  offsetY: 0,
};
