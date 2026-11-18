import type { InputHTMLAttributes } from 'react';

/**
 * 开关原语：label 容器 + 原生 checkbox（role=switch）+ 视觉层 span。
 * 视觉尺寸由 .switch-control 负责，命中区在 pointer:coarse 下扩展到 44px。
 */
export interface SwitchControlProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'children'
> {
  /** 无可见文本时的可访问名称；也可通过 aria-labelledby 关联外部标题。 */
  label?: string;
  /** 悬停提示文案（放在 label 容器上，保持原命中区）。 */
  labelTitle?: string;
}

export function SwitchControl({ label, labelTitle, className, ...rest }: SwitchControlProps) {
  return (
    // 内联 className 让 AST 控件清单能识别原语渲染的标准类名（switch-control）。
    <label className={['switch-control', className].filter(Boolean).join(' ')} title={labelTitle}>
      <input {...rest} type="checkbox" role="switch" aria-label={label} />
      <span aria-hidden="true" />
    </label>
  );
}
