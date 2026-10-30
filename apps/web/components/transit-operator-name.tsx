import { getSafeHttpUrl } from '@yct/schemas';

export function TransitOperatorName({
  name,
  url,
  fallback,
}: Readonly<{ name?: string; url?: string; fallback: string }>) {
  const label = name?.trim();
  if (!label) return <>{fallback}</>;
  const href = getSafeHttpUrl(url);
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className="transit-operator-link">
      {label}
      <span className="material-symbols-outlined" aria-hidden="true">
        open_in_new
      </span>
    </a>
  ) : (
    <>{label}</>
  );
}
