import { Fragment } from 'react';

export function TitleWithBreaks({
  title,
  segments,
}: Readonly<{
  title: string;
  segments?: string[];
}>) {
  const titleSegments = segments?.length ? segments : splitTitleSegments(title);

  return (
    <>
      {titleSegments.map((segment, index) => (
        <Fragment key={`${segment}-${index}`}>
          {segment}
          {index < titleSegments.length - 1 ? <wbr /> : null}
        </Fragment>
      ))}
    </>
  );
}

export function normalizeTitleForSearch(title: string): string {
  return splitTitleSegments(title).join('').toLowerCase();
}

function splitTitleSegments(title: string): string[] {
  const segments = title
    .split(/\|+/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (segments.length > 0) {
    return segments;
  }

  const normalizedTitle = title.replace(/\|+/g, '').trim();
  return [normalizedTitle || title];
}
