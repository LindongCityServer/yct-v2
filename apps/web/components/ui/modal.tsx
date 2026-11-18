import { createElement } from 'react';
import type { CSSProperties, FormEventHandler, MouseEvent, ReactNode } from 'react';

/**
 * 弹窗结构壳：只负责遮罩 + 面板 + 对话框语义，不接管呈现方式与事件架构。
 *
 * 业务仍通过 yct:dialog-requested / 站内确认等既有机制决定弹窗如何打开；
 * 需要 Portal 的场景由调用方包一层（如 EditorDialogPortal）。
 *
 * 面板标签默认 section；历史实现里还有 form（提交弹窗）与 div（展示弹窗），
 * 通过 as 指定，避免迁移时改变 DOM 语义。
 */
export type ModalPanelTag = 'section' | 'form' | 'div';

export interface ModalProps {
  /** 与面板内标题 id 对应，保证可访问名称。 */
  labelledBy?: string;
  /** 无标题元素时的可访问名称（aria-label）。 */
  ariaLabel?: string;
  /** 默认 true；少数非阻塞浮层（快捷键说明）历史上是 false。 */
  ariaModal?: boolean;
  /** 面板补充说明（可选）。 */
  ariaDescribedBy?: string;
  /** 仅用于布局/业务形态的附加类名（如 trip-reminder-modal）。 */
  className?: string;
  /** 遮罩附加类名（历史弹窗有 metro-wayfinding-*-backdrop 等）。 */
  backdropClassName?: string;
  /** 面板内联样式（历史弹窗用 style 控制预览宽度等）。 */
  panelStyle?: CSSProperties;
  /** 点击遮罩关闭；不传则不响应遮罩点击。 */
  onBackdropClick?: () => void;
  /** 面板标签：section（默认）/ form / div。 */
  as?: ModalPanelTag;
  /** as='form' 时的提交回调。 */
  onSubmit?: FormEventHandler<HTMLFormElement>;
  /** 表单编辑弹窗的 change 捕获（历史实现用于标记脏状态）。 */
  onChangeCapture?: FormEventHandler<HTMLElement>;
  children: ReactNode;
}

export function Modal({
  labelledBy,
  ariaLabel,
  ariaModal = true,
  ariaDescribedBy,
  className,
  backdropClassName,
  panelStyle,
  onBackdropClick,
  as = 'section',
  onSubmit,
  onChangeCapture,
  children,
}: ModalProps) {
  const classes = ['modal-panel', className].filter(Boolean).join(' ');
  const backdropClasses = ['modal-backdrop', backdropClassName].filter(Boolean).join(' ');
  const panelProps: Record<string, unknown> = {
    className: classes,
    role: 'dialog',
    'aria-modal': ariaModal,
    'aria-labelledby': labelledBy,
    'aria-label': ariaLabel,
    'aria-describedby': ariaDescribedBy,
    onMouseDown: (event: MouseEvent<HTMLElement>) => event.stopPropagation(),
    style: panelStyle,
  };
  if (as === 'form' && onSubmit) panelProps.onSubmit = onSubmit;
  if (onChangeCapture) panelProps.onChangeCapture = onChangeCapture;
  return (
    <div
      className={backdropClasses}
      role="presentation"
      onMouseDown={onBackdropClick ? () => onBackdropClick() : undefined}
    >
      {createElement(as, panelProps, children)}
    </div>
  );
}
