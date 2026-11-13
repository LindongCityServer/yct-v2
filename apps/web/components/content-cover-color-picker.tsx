'use client';

export const CONTENT_COVER_COLOR_OPTIONS = [
  { value: 'var(--yct-color-primary)', label: '品牌主色' },
  { value: 'var(--yct-color-secondary)', label: '地铁' },
  { value: 'var(--yct-color-tertiary)', label: '公交' },
  { value: 'var(--yct-color-tram)', label: '有轨' },
  { value: 'var(--yct-color-ferry)', label: '水运' },
  { value: 'var(--yct-color-railway)', label: '铁路' },
  { value: 'var(--yct-color-warning)', label: '提醒' },
  { value: 'var(--yct-color-error)', label: '紧急' },
] as const;

/** 运营消息封面色选择：内容弹窗与工作台全局属性共用。 */
export function ContentCoverColorPicker({
  disabled = false,
  value,
  onChange,
}: Readonly<{
  disabled?: boolean;
  value: string;
  onChange: (value: string) => void;
}>) {
  const trimmed = value.trim();

  return (
    <fieldset className="admin-cover-color-picker" disabled={disabled}>
      <legend>封面色</legend>
      <div>
        <button
          aria-pressed={!trimmed}
          className={!trimmed ? 'is-selected' : undefined}
          disabled={disabled}
          type="button"
          onClick={() => onChange('')}
        >
          <span className="admin-cover-color-swatch is-none" aria-hidden="true" />
          <span>不设置</span>
        </button>
        {trimmed && !CONTENT_COVER_COLOR_OPTIONS.some((option) => option.value === trimmed) ? (
          <button
            aria-pressed
            className="is-selected"
            disabled={disabled}
            type="button"
            onClick={() => onChange('')}
          >
            <span
              className="admin-cover-color-swatch"
              aria-hidden="true"
              style={{ backgroundColor: trimmed }}
            />
            <span>现有颜色</span>
          </button>
        ) : null}
        {CONTENT_COVER_COLOR_OPTIONS.map((option) => (
          <button
            aria-pressed={trimmed === option.value}
            className={trimmed === option.value ? 'is-selected' : undefined}
            disabled={disabled}
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
          >
            <span
              className="admin-cover-color-swatch"
              aria-hidden="true"
              style={{ backgroundColor: option.value }}
            />
            <span>{option.label}</span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}
