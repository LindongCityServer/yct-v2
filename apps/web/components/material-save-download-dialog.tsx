'use client';

import type { ReactNode } from 'react';
import { EditorDialogPortal } from './editor/editor-dialog-portal';
import { Button, IconButton } from './ui/button';
import { Field, Input } from './ui/field';
import { Modal } from './ui/modal';

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
      <Modal labelledBy="material-save-download-title" backdropClassName="editor-dialog-backdrop" className="transit-wayfinding-export-dialog" onBackdropClick={() => onClose()}>
          <header>
            <div>
              <span>保存与下载</span>
              <h2 id="material-save-download-title">保存、审核与下载</h2>
            </div>
            <IconButton variant="icon" icon="close" label="关闭" onClick={onClose} />
          </header>
          {canvas && onCanvasSizeChange ? (
            <div className="transit-wayfinding-export-canvas">
              <Field label="画布宽度（米）">
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0.25}
                  max={64}
                  step={0.25}
                  value={canvas.widthM}
                  disabled={busy || canvasLocks?.width}
                  onChange={(event) => updateCanvasSide('widthM', event.currentTarget.value)}
                />
              </Field>
              <Field label="画布高度（米）">
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0.25}
                  max={64}
                  step={0.25}
                  value={canvas.heightM}
                  disabled={busy || canvasLocks?.height}
                  onChange={(event) => updateCanvasSide('heightM', event.currentTarget.value)}
                />
              </Field>
            </div>
          ) : null}
          {showPxPerMeter && pxPerMeter !== undefined && onPxPerMeterChange ? (
            <Field
              label="每格像素数"
              className="transit-wayfinding-export-density"
              hint={
                <>
                  输出尺寸：{outputWidthPx ?? '—'} × {outputHeightPx ?? '—'} px
                  {maxPxPerMeter ? ` · 上限 ${maxPxPerMeter} px/米` : ''}
                </>
              }
            >
              <Input
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
            </Field>
          ) : null}
          <p className="transit-wayfinding-export-note">{downloadNote}</p>
          <div className="transit-wayfinding-export-actions">
            {canExportProject && onExportProject ? (
              <Button variant="secondary" icon="save" disabled={busy} onClick={onExportProject}>
                导出工程
              </Button>
            ) : null}
            {onSubmitReview ? (
              <Button variant="secondary" icon="publish" disabled={busy} onClick={onSubmitReview}>
                提交审核
              </Button>
            ) : null}
            <Button icon="download" disabled={busy} onClick={onDownload}>
              下载图片
            </Button>
          </div>
        </Modal>
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
