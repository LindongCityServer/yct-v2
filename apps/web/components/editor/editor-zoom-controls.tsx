'use client';

/**
 * 统一缩放控件：缩小 / 当前比例 / 放大 / 适配。
 * 桌面端位于画布右下角，移动端移至画布右上角，避免与底部工具胶囊重叠。
 */
export function EditorZoomControls({
  className,
  fitLabel = '适配全部内容',
  onFit,
  onZoomIn,
  onZoomOut,
  scale,
}: Readonly<{
  className?: string;
  fitLabel?: string;
  onFit: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  scale: number;
}>) {
  return (
    <div
      className={`editor-zoom-controls${className ? ` ${className}` : ''}`}
      role="group"
      aria-label="画布缩放"
    >
      <button aria-label="缩小" onClick={onZoomOut} title="缩小" type="button">
        <span className="material-symbols-outlined" aria-hidden="true">
          remove
        </span>
      </button>
      <span className="editor-zoom-value" aria-live="polite">
        {`${Math.round(scale * 100)}%`}
      </span>
      <button aria-label="放大" onClick={onZoomIn} title="放大" type="button">
        <span className="material-symbols-outlined" aria-hidden="true">
          add
        </span>
      </button>
      <button aria-label={fitLabel} onClick={onFit} title={fitLabel} type="button">
        <span className="material-symbols-outlined" aria-hidden="true">
          fit_screen
        </span>
      </button>
    </div>
  );
}
