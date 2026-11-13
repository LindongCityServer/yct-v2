'use client';

export interface EditorLayerRowAction {
  id: string;
  icon: string;
  /** 无障碍标签。 */
  label: string;
  /** 悬停提示；省略时沿用 label。 */
  title?: string;
  disabled?: boolean;
  /** 危险的删除类操作。 */
  danger?: boolean;
  onClick: () => void;
}

/** 图层树行内操作按钮组：三个工作台的班次行、站点行、控制点行共用。 */
export function EditorLayerRowActions({ actions }: Readonly<{ actions: EditorLayerRowAction[] }>) {
  return (
    <div className="poi-visual-layer-row-actions">
      {actions.map((action) => (
        <button
          aria-label={action.label}
          className={action.danger ? 'is-danger' : undefined}
          disabled={action.disabled}
          key={action.id}
          title={action.title ?? action.label}
          type="button"
          onClick={action.onClick}
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            {action.icon}
          </span>
        </button>
      ))}
    </div>
  );
}
