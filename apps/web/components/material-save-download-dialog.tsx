'use client';

import type { ReactNode } from 'react';
import { EditorDialogPortal } from './editor/editor-dialog-portal';

/**
 * 「保存与下载」弹窗：两种工作台共用。
 *
 * 提交审核、下载图片、导出工程按模板能力显示；表单模板与导视牌只在
 * 回调与文案上不同，不再各自维护一套弹窗结构。
 */
export function MaterialSaveDownloadDialog({
  busy,
  canExportProject,
  canvas,
  canvasLocks,
  downloadNote,
  maxPxPerMeter,
  onCanvasSizeChange,
  onClose,
  onDownload,
  onExportProject,
  onPxPerMeterChange,
  onSubmitReview,
  outputHeightPx,
  outputWidthPx,
  pxPerMeter,
  showPxPerMeter,
}: Readonly<{
  busy: boolean;
  canExportProject: boolean;
  /** 当前画布尺寸；提供后弹窗内可直接调整宽高。 */
  canvas?: { widthM: number; heightM: number };
  /** 被模板锁定的维度不可修改。 */
  canvasLocks?: { width?: boolean; height?: boolean };
  downloadNote: string;
  /** pxPerMeter 输入上限：按当前画布尺寸保证最长边 ≤ 4096。 */
  maxPxPerMeter?: number;
  onCanvasSizeChange?: (patch: { widthM?: number; heightM?: number }) => void;
  onClose: () => void;
  onDownload: () => void;
  onExportProject?: () => void;
  onPxPerMeterChange?: (value: number) => void;
  onSubmitReview?: () => void;
  outputHeightPx?: number;
  outputWidthPx?: number;
  pxPerMeter?: number;
  showPxPerMeter: boolean;
}>) {
  const updateCanvasSide = (side: 'widthM' | 'heightM', raw: string) => {
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) {
      return;
    }
    onCanvasSizeChange?.({ [side]: Math.min(value, 64) });
  };
  return (
    <EditorDialogPortal>
      <div
        className="modal-backdrop editor-dialog-backdrop"
        role="presentation"
        onMouseDown={(event) => {
          if (event.currentTarget === event.target) {
            onClose();
          }
        }}
      >
        <section
          className="modal-panel transit-wayfinding-export-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="material-save-download-title"
        >
          <header>
            <div>
              <span>保存与下载</span>
              <h2 id="material-save-download-title">保存、审核与下载</h2>
            </div>
            <button
              type="button"
              className="icon-button"
              aria-label="关闭"
              title="关闭"
              onClick={onClose}
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                close
              </span>
            </button>
          </header>
          {canvas && onCanvasSizeChange ? (
            <div className="transit-wayfinding-export-canvas">
              <label className="material-field">
                <span>画布宽度（米）</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0.25}
                  max={64}
                  step={0.25}
                  value={canvas.widthM}
                  disabled={busy || canvasLocks?.width}
                  onChange={(event) => updateCanvasSide('widthM', event.currentTarget.value)}
                />
              </label>
              <label className="material-field">
                <span>画布高度（米）</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0.25}
                  max={64}
                  step={0.25}
                  value={canvas.heightM}
                  disabled={busy || canvasLocks?.height}
                  onChange={(event) => updateCanvasSide('heightM', event.currentTarget.value)}
                />
              </label>
            </div>
          ) : null}
          {showPxPerMeter && pxPerMeter !== undefined && onPxPerMeterChange ? (
            <label className="material-field transit-wayfinding-export-density">
              <span>每格像素数</span>
              <input
                type="number"
                inputMode="numeric"
                min={16}
                max={maxPxPerMeter ?? 4096}
                step={8}
                value={pxPerMeter}
                disabled={busy}
                onChange={(event) => {
                  const value = Number(event.currentTarget.value);
                  if (Number.isFinite(value) && value > 0) {
                    onPxPerMeterChange(Math.min(value, maxPxPerMeter ?? 4096));
                  }
                }}
              />
              <small>
                输出尺寸：{outputWidthPx ?? '—'} × {outputHeightPx ?? '—'} px
                {maxPxPerMeter ? ` · 上限 ${maxPxPerMeter} px/米` : ''}
              </small>
            </label>
          ) : null}
          <p className="transit-wayfinding-export-note">{downloadNote}</p>
          <div className="transit-wayfinding-export-actions">
            {canExportProject && onExportProject ? (
              <button
                type="button"
                className="secondary-action-button"
                disabled={busy}
                onClick={onExportProject}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  save
                </span>
                导出工程
              </button>
            ) : null}
            {onSubmitReview ? (
              <button
                type="button"
                className="secondary-action-button"
                disabled={busy}
                onClick={onSubmitReview}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  publish
                </span>
                提交审核
              </button>
            ) : null}
            <button
              type="button"
              className="primary-action-button"
              disabled={busy}
              onClick={onDownload}
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                download
              </span>
              下载图片
            </button>
          </div>
        </section>
      </div>
    </EditorDialogPortal>
  );
}

/** 预览区常驻错误提示：toast 一闪而过后仍可回看失败原因。 */
export function MaterialPreviewErrorNotice({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="material-preview-error" role="alert">
      <span className="material-symbols-outlined" aria-hidden="true">
        error
      </span>
      <div>
        <strong>预览未生成</strong>
        <p>{children}</p>
      </div>
    </div>
  );
}
