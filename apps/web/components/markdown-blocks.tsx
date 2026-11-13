import { Fragment, type ReactNode } from 'react';
import { appPath } from '../lib/app-paths';
import {
  extractMarkdownHeadingsFromBlocks,
  parseMarkdownBlocks,
  type MarkdownBlock,
} from '../lib/editor/markdown-blocks';
import { ProgressiveImage } from './progressive-image';

export { extractMarkdownHeadings, parseMarkdownBlocks } from '../lib/editor/markdown-blocks';
export type { MarkdownBlock, MarkdownHeading } from '../lib/editor/markdown-blocks';

export function MarkdownBlocks({
  markdown,
  renderUiBlock,
  activeBlockIndex,
  editingBlockIndex,
  onBlockSelect,
  onBlockDoubleClick,
  renderBlock,
}: Readonly<{
  markdown: string;
  /** 渲染 ```ui 代码块；未提供时直接隐藏，避免把指令 JSON 漏到界面上。 */
  renderUiBlock?: (body: string) => ReactNode;
  /** 工作台选中块下标；公开页面不传，DOM 结构与改造前一致。 */
  activeBlockIndex?: number;
  /** 工作台画布内联编辑中的块下标。 */
  editingBlockIndex?: number;
  /** 工作台点击块定位；公开页面不传，不包额外容器。 */
  onBlockSelect?: (index: number) => void;
  /** 工作台双击块进入属性编辑。 */
  onBlockDoubleClick?: (index: number) => void;
  /** 用自定义编辑器替换指定块的渲染；返回空时回退到只读渲染。 */
  renderBlock?: (block: MarkdownBlock, index: number) => ReactNode;
}>) {
  const blocks = parseMarkdownBlocks(markdown);
  const headingIdByBlock = new Map(
    extractMarkdownHeadingsFromBlocks(blocks).map((heading) => [heading.blockIndex, heading.id]),
  );

  return (
    <div className="markdown-blocks">
      {blocks.map((block, index) => {
        const content =
          renderBlock?.(block, index) ??
          renderMarkdownBlock(block, index, headingIdByBlock.get(index), renderUiBlock);
        if (!onBlockSelect) {
          return content;
        }

        return (
          <div
            className={`markdown-visual-block${activeBlockIndex === index ? ' is-active' : ''}${
              editingBlockIndex === index ? ' is-editing' : ''
            }`}
            data-markdown-block-index={index}
            data-markdown-block-type={block.type}
            key={index}
            onClick={(event) => {
              const target = event.target;
              if (
                target instanceof Element &&
                target.closest('a, button, input, select, textarea')
              ) {
                return;
              }
              onBlockSelect(index);
            }}
            onDoubleClick={(event) => {
              const target = event.target;
              if (
                target instanceof Element &&
                target.closest('a, button, input, select, textarea')
              ) {
                return;
              }
              onBlockDoubleClick?.(index);
            }}
          >
            {content}
          </div>
        );
      })}
    </div>
  );
}

function renderMarkdownBlock(
  block: MarkdownBlock,
  index: number,
  headingId?: string,
  renderUiBlock?: (body: string) => ReactNode,
): ReactNode {
  switch (block.type) {
    case 'heading': {
      const HeadingTag = `h${block.level}` as 'h1' | 'h2' | 'h3' | 'h4';
      return (
        <HeadingTag id={headingId} key={index}>
          {renderInlineMarkdown(block.text)}
        </HeadingTag>
      );
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
      return (
        <blockquote key={index}>
          {block.lines.map((line, lineIndex) => (
            <Fragment key={`${index}-${lineIndex}`}>
              {lineIndex > 0 ? <br /> : null}
              {renderInlineMarkdown(line)}
            </Fragment>
          ))}
        </blockquote>
      );
    case 'divider':
      return <hr key={index} />;
    case 'table':
      return (
        <div className="markdown-table-wrapper" key={index}>
          <table>
            <thead>
              <tr>
                {block.headers.map((header, cellIndex) => (
                  <th scope="col" key={`${index}-header-${cellIndex}`}>
                    {renderInlineMarkdown(header)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={`${index}-row-${rowIndex}`}>
                  {row.map((cell, cellIndex) => (
                    <td key={`${index}-${rowIndex}-${cellIndex}`}>{renderInlineMarkdown(cell)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'image':
      return renderMarkdownImage(block, index);
    case 'code':
      return (
        <pre className="markdown-code-block" key={index}>
          <code data-language={block.language || undefined}>{block.body}</code>
        </pre>
      );
    case 'ui': {
      // 流式过程中代码块还没闭合，先不渲染，等闭合后再交给卡片组件。
      if (!block.closed || !renderUiBlock) {
        return null;
      }
      const rendered = renderUiBlock(block.body);
      return rendered ? <div key={index}>{rendered}</div> : null;
    }
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
      <ProgressiveImage src={appPath(block.src)} alt={block.alt} loading="lazy" />
      {block.alt ? <figcaption>{block.alt}</figcaption> : null}
    </figure>
  );
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
