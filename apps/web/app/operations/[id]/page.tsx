import { notFound } from 'next/navigation';
import type { OperationsContentDetail } from '@yct/contracts';
import type { ReactNode } from 'react';
import { SecondaryShell } from '../../../components/app-shell';
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
    <SecondaryShell title="运营信息">
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

type MarkdownBlock =
  | { type: 'heading'; level: 2 | 3 | 4; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'quote'; text: string }
  | { type: 'image'; alt: string; src: string };

function MarkdownBlocks({ markdown }: Readonly<{ markdown: string }>) {
  const blocks = parseMarkdownBlocks(markdown);

  return (
    <div className="markdown-blocks">
      {blocks.map((block, index) => renderMarkdownBlock(block, index))}
    </div>
  );
}

function renderMarkdownBlock(block: MarkdownBlock, index: number): ReactNode {
  switch (block.type) {
    case 'heading': {
      const HeadingTag = `h${block.level}` as 'h2' | 'h3' | 'h4';
      return <HeadingTag key={index}>{renderInlineMarkdown(block.text)}</HeadingTag>;
    }
    case 'list': {
      const ListTag = block.ordered ? 'ol' : 'ul';
      return (
        <ListTag key={index}>
          {block.items.map((item, itemIndex) => (
            <li key={`${index}-${itemIndex}`}>{renderInlineMarkdown(item)}</li>
          ))}
        </ListTag>
      );
    }
    case 'quote':
      return <blockquote key={index}>{renderInlineMarkdown(block.text)}</blockquote>;
    case 'image':
      return renderMarkdownImage(block, index);
    case 'paragraph':
    default:
      return <p key={index}>{renderInlineMarkdown(block.text)}</p>;
  }
}

function renderMarkdownImage(block: Extract<MarkdownBlock, { type: 'image' }>, index: number) {
  if (!isSafeHref(block.src) || !isImageLikeHref(block.src)) {
    return (
      <p key={index}>
        {block.alt}：{block.src}
      </p>
    );
  }

  return (
    <figure className="markdown-image" key={index}>
      <img src={appPath(block.src)} alt={block.alt} loading="lazy" />
      {block.alt ? <figcaption>{block.alt}</figcaption> : null}
    </figure>
  );
}

function parseMarkdownBlocks(markdown: string): MarkdownBlock[] {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const blocks: MarkdownBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line) {
      index += 1;
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      blocks.push({
        type: 'heading',
        level: (heading[1].length + 1) as 2 | 3 | 4,
        text: heading[2].trim(),
      });
      index += 1;
      continue;
    }

    const image = parseImageLine(line);
    if (image) {
      blocks.push(image);
      index += 1;
      continue;
    }

    const list = parseListBlock(lines, index);
    if (list) {
      blocks.push(list.block);
      index = list.nextIndex;
      continue;
    }

    const quote = parseQuoteBlock(lines, index);
    if (quote) {
      blocks.push(quote.block);
      index = quote.nextIndex;
      continue;
    }

    const paragraph = collectParagraph(lines, index);
    blocks.push({
      type: 'paragraph',
      text: paragraph.lines.join(' '),
    });
    index = paragraph.nextIndex;
  }

  return blocks;
}

function parseImageLine(line: string): MarkdownBlock | undefined {
  const markdownImage = /^!\[([^\]]*)\]\(([^)]+)\)$/.exec(line);
  if (markdownImage) {
    return {
      type: 'image',
      alt: markdownImage[1].trim(),
      src: markdownImage[2].trim(),
    };
  }

  const legacyImage = /^原始图片：(\S+)$/.exec(line);
  if (legacyImage) {
    return {
      type: 'image',
      alt: '原始图片',
      src: legacyImage[1].trim(),
    };
  }

  return undefined;
}

function parseListBlock(
  lines: string[],
  startIndex: number,
): { block: Extract<MarkdownBlock, { type: 'list' }>; nextIndex: number } | undefined {
  const first = parseListItem(lines[startIndex]);
  if (!first) {
    return undefined;
  }

  const items: string[] = [];
  let index = startIndex;
  while (index < lines.length) {
    const item = parseListItem(lines[index]);
    if (!item || item.ordered !== first.ordered) {
      break;
    }
    items.push(item.text);
    index += 1;
  }

  return {
    block: {
      type: 'list',
      ordered: first.ordered,
      items,
    },
    nextIndex: index,
  };
}

function parseListItem(line: string): { ordered: boolean; text: string } | undefined {
  const unordered = /^\s*[-*+]\s+(.+)$/.exec(line);
  if (unordered) {
    return {
      ordered: false,
      text: unordered[1].trim(),
    };
  }

  const ordered = /^\s*\d+[.)]\s+(.+)$/.exec(line);
  if (ordered) {
    return {
      ordered: true,
      text: ordered[1].trim(),
    };
  }

  return undefined;
}

function parseQuoteBlock(
  lines: string[],
  startIndex: number,
): { block: Extract<MarkdownBlock, { type: 'quote' }>; nextIndex: number } | undefined {
  if (!/^\s*>\s?/.test(lines[startIndex])) {
    return undefined;
  }

  const quoteLines: string[] = [];
  let index = startIndex;
  while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
    quoteLines.push(lines[index].replace(/^\s*>\s?/, '').trim());
    index += 1;
  }

  return {
    block: {
      type: 'quote',
      text: quoteLines.join(' '),
    },
    nextIndex: index,
  };
}

function collectParagraph(
  lines: string[],
  startIndex: number,
): { lines: string[]; nextIndex: number } {
  const paragraphLines: string[] = [];
  let index = startIndex;

  while (index < lines.length) {
    const line = lines[index].trim();
    if (
      !line ||
      /^(#{1,3})\s+(.+)$/.test(line) ||
      parseImageLine(line) ||
      parseListItem(line) ||
      /^\s*>\s?/.test(line)
    ) {
      break;
    }

    paragraphLines.push(line);
    index += 1;
  }

  return {
    lines: paragraphLines,
    nextIndex: index,
  };
}

function renderInlineMarkdown(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const tokenPattern = /(!?)\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|`([^`]+)`/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenPattern.exec(text))) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    if (match[2] && match[3]) {
      const isImage = match[1] === '!';
      const label = match[2];
      const href = match[3].trim();

      if (isImage || !isSafeHref(href)) {
        nodes.push(`${label}：${href}`);
      } else {
        nodes.push(
          <a
            href={href}
            target={href.startsWith('http') ? '_blank' : undefined}
            rel="noreferrer"
            key={`${match.index}-link`}
          >
            {label}
          </a>,
        );
      }
    } else if (match[4]) {
      nodes.push(<strong key={`${match.index}-strong`}>{match[4]}</strong>);
    } else if (match[5]) {
      nodes.push(<code key={`${match.index}-code`}>{match[5]}</code>);
    }

    lastIndex = tokenPattern.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes.length > 0 ? nodes : [text];
}

function isSafeHref(href: string): boolean {
  return href.startsWith('https://') || href.startsWith('http://') || href.startsWith('/');
}

function isImageLikeHref(href: string): boolean {
  return /\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i.test(href);
}
