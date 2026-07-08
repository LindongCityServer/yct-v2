import { notFound } from 'next/navigation';
import type { OperationsContentDetail } from '@yct/contracts';
import { SecondaryShell } from '../../../components/app-shell';
import { MarkdownBlocks } from '../../../components/markdown-blocks';
import { TitleWithBreaks } from '../../../components/title-with-breaks';
import { appPath } from '../../../lib/app-paths';
import { readOperationDetail } from '../../../lib/operations-content';

export const dynamic = 'force-dynamic';

export default async function OperationDetailPage({
  params,
}: Readonly<{
  params: Promise<{ id: string }>;
}>) {
  const { id } = await params;
  const decodedId = decodeSegment(id);
  const { item } = await readOperationDetail(decodedId);

  if (!item) {
    notFound();
  }

  return (
    <SecondaryShell title="运营信息" titleKey="page.operations">
      <article className="operation-detail">
        <header className="operation-detail-header">
          <div className="feed-item-meta">
            <span>{item.categoryId}</span>
            {item.displayDate ? <span>{item.displayDate}</span> : null}
          </div>
          <h1>
            <TitleWithBreaks title={item.title} segments={item.titleSegments} />
          </h1>
          {item.excerpt ? <p>{item.excerpt}</p> : null}
          {item.customTags?.length ? (
            <div className="operation-tag-list" aria-label="内容标签">
              {item.customTags.map((tag) => (
                <span className="operation-tag" key={tag}>
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
        </header>

        {item.coverColor || item.coverImageUrl || item.legacyImagePath ? (
          <div
            className="operation-detail-cover"
            style={
              item.coverColor
                ? { backgroundColor: item.coverColor }
                : item.coverImageUrl
                  ? { backgroundImage: `url("${appPath(item.coverImageUrl)}")` }
                  : undefined
            }
          >
            {item.coverImageUrl ? null : (
              <span className="material-symbols-outlined" aria-hidden="true">
                {item.coverColor ? 'article' : 'image'}
              </span>
            )}
            {item.legacyImagePath && !item.coverColor && !item.coverImageUrl ? (
              <span>{item.legacyImagePath}</span>
            ) : null}
          </div>
        ) : null}

        {item.markdown.trim() ? (
          <MarkdownBlocks markdown={item.markdown} />
        ) : (
          <LegacyBodyFallback item={item} />
        )}

        {item.legacyImageSourceUrl || item.legacyLink ? (
          <p className="operation-source-note">
            {item.legacyImageSourceUrl ? `旧图片来源：${item.legacyImageSourceUrl}` : null}
            {item.legacyImageSourceUrl && item.legacyLink ? ' · ' : null}
            {item.legacyLink ? (
              <a href={item.legacyLink} target="_blank" rel="noreferrer">
                原始链接
              </a>
            ) : null}
          </p>
        ) : null}
      </article>
    </SecondaryShell>
  );
}

function decodeSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function LegacyBodyFallback({ item }: Readonly<{ item: OperationsContentDetail }>) {
  return (
    <div className="operation-empty-body">
      <span className="material-symbols-outlined" aria-hidden="true">
        open_in_new
      </span>
      <div>
        <strong>这条旧运营消息没有独立正文</strong>
        <p>旧系统主要通过外部链接承载详情，新版当前只保留标题、摘要和原始入口。</p>
      </div>
      {item.legacyLink ? (
        <a
          className="secondary-action-button"
          href={item.legacyLink}
          target="_blank"
          rel="noreferrer"
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            open_in_new
          </span>
          <span>打开原始内容</span>
        </a>
      ) : null}
    </div>
  );
}
