'use client';

export function MapLayerToggle({
  checked,
  detail,
  disabled = false,
  icon,
  onChange,
  title,
}: Readonly<{
  checked: boolean;
  detail: string;
  disabled?: boolean;
  icon: string;
  onChange: (checked: boolean) => void;
  title: string;
}>) {
  return (
    <label className="map-layer-toggle">
      <span className="material-symbols-outlined" aria-hidden="true">
        {icon}
      </span>
      <span>
        <strong>{title}</strong>
        <small>{detail}</small>
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
    </label>
  );
}
