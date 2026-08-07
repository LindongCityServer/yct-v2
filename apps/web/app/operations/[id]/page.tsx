import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import type { OperationsContentDetail } from '@yct/contracts';
import { SecondaryShell } from '../../../components/app-shell';
import { AdminEditLink } from '../../../components/admin-edit-link';
import { MarkdownBlocks, extractMarkdownHeadings } from '../../../components/markdown-blocks';
import { OperationTableOfContents } from '../../../components/operation-table-of-contents';
import { OperationRelatedPois } from '../../../components/operation-related-pois';
import { TitleWithBreaks } from '../../../components/title-with-breaks';
import { appPath } from '../../../lib/app-paths';
import { readOperationDetail } from '../../../lib/operations-content';
import { publicSiteUrl } from '../../../lib/public-api';
import {
  createPageMetadata,
  normalizeMetadataDescription,
  serializeJsonLd,
} from '../../../lib/site-metadata';

export const dynamic = 'force-dynamic';

type OperationDetailPageProps = Readonly<{
  params: Promise<{ id: string }>;
}>;

const readOperationPageDetail = cache(readOperationDetail);

export async function generateMetadata({ params }: OperationDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const { item } = await readOperationPageDetail(decodeSegment(id));

  if (!item) {
    return createPageMetadata({
      title: '运营信息',
      description: '查看雨城通发布的交通运营动态、服务公告与服务器资讯。',
      noIndex: true,
    });
  }

  return {
    ...createPageMetadata({
      title: item.title,
      description: normalizeMetadataDescription(item.excerpt, '查看雨城通发布的运营信息与详情。'),
    }),
    alternates: {
      canonical: appPath(`/operations/${encodeURIComponent(item.id)}`),
    },
  };
}

export default async function OperationDetailPage({ params }: OperationDetailPageProps) {
  const { id } = await params;
  const decodedId = decodeSegment(id);
  const { item } = await readOperationPageDetail(decodedId);

  if (!item) {
    notFound();
  }

  const headings = item.markdown.trim() ? extractMarkdownHeadings(item.markdown) : [];

  return (
    <SecondaryShell
      title="运营信息"
      titleKey="page.operations"
      secondaryActions={
        <>
          <AdminEditLink
            href={`/admin/operations?contentId=${encodeURIComponent(item.id)}`}
            label="编辑运营消息"
          />
          <OperationTableOfContents headings={headings} />
        </>
      }
    >
      <article className="operation-detail">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: serializeJsonLd({
              '@context': 'https://schema.org',
              '@type': 'Article',
              headline: item.title,
              description: item.excerpt,
              datePublished: item.publishedAt,
              dateModified: item.publishedAt,
              mainEntityOfPage: publicSiteUrl(`/operations/${encodeURIComponent(item.id)}`),
              isPartOf: {
                '@type': 'WebSite',
                name: '雨城通',
                url: publicSiteUrl('/'),
              },
            }),
          }}
        />
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

        <OperationRelatedPois markerIds={item.relatedPoiMarkerIds} />

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
