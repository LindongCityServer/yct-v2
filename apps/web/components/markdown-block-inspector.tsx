'use client';

import type { ContentAsset } from '@yct/contracts';
import { useEffect, useRef, useState } from 'react';
import { appPath } from '../lib/app-paths';
import { uploadContentAsset } from '../lib/content-assets-client';
import { publishToastRequested } from '../lib/client-toast-events';
import {
  getMarkdownBlockSourceLines,
  markdownBlockPlainText,
  replaceMarkdownBlockSource,
  serializeCodeBlock,
  serializeHeadingBlock,
  serializeImageBlock,
  serializeListBlock,
  type MarkdownBlock,
} from '../lib/editor/markdown-blocks';
import { useEditorFieldDraft as useFieldDraft } from '../lib/editor/use-editor-field-draft';
import { SegmentedControl } from './segmented-control';
import { Button, IconButton } from './ui/button';
import { Field, Input, Textarea } from './ui/field';

/** 单个 Markdown 块的属性检查器：按块类型给出可写控件。 */
export function MarkdownBlockInspector({
  block,
  canMoveDown,
  canMoveUp,
  disabled,
  markdown,
  onChangeMarkdown,
  onDuplicate,
  onMoveDown,
  onMoveUp,
  onRemove,
  onAssetUploaded,
}: Readonly<{
  block: MarkdownBlock;
  canMoveDown: boolean;
  canMoveUp: boolean;
  disabled: boolean;
  markdown: string;
  onChangeMarkdown: (markdown: string) => void;
  onDuplicate: () => void;
  onMoveDown: () => void;
  onMoveUp: () => void;
  onRemove: () => void;
  onAssetUploaded: (asset: ContentAsset) => void;
}>) {
  const sourceLines = getMarkdownBlockSourceLines(markdown, block);
  const characterLabel =
    block.type === 'code' || block.type === 'ui'
      ? `${block.body.length} 字符`
      : `${markdownBlockPlainText(block).length} 字`;
  return (
    <div className="markdown-block-inspector">
      <dl className="poi-visual-global-summary">
        <div>
          <dt>块类型</dt>
          <dd>{markdownBlockTypeLabel(block)}</dd>
        </div>
        <div>
          <dt>源码行</dt>
          <dd>{`${block.startLine + 1}–${block.endLine}`}</dd>
        </div>
        <div>
          <dt>源码行数</dt>
          <dd>{`${sourceLines.length} 行`}</dd>
        </div>
        <div>
          <dt>字数</dt>
          <dd>{characterLabel}</dd>
        </div>
      </dl>

      <MarkdownBlockFields
        block={block}
        disabled={disabled}
        markdown={markdown}
        onAssetUploaded={onAssetUploaded}
        onChangeMarkdown={onChangeMarkdown}
      />

      <div className="poi-visual-inspector-actions">
        <Button
          variant="secondary"
          icon="arrow_upward"
          disabled={disabled || !canMoveUp}
          onClick={onMoveUp}
        >
          上移
        </Button>
        <Button
          variant="secondary"
          icon="arrow_downward"
          disabled={disabled || !canMoveDown}
          onClick={onMoveDown}
        >
          下移
        </Button>
        <Button variant="secondary" icon="content_copy" disabled={disabled} onClick={onDuplicate}>
          复制
        </Button>
        <Button variant="secondary" icon="delete" disabled={disabled} onClick={onRemove}>
          移除
        </Button>
      </div>
    </div>
  );
}

/** 块属性表单：右侧检查器与画布内联编辑共用同一套控件。 */
export function MarkdownBlockFields({
  block,
  disabled,
  markdown,
  onAssetUploaded,
  onChangeMarkdown,
}: Readonly<{
  block: MarkdownBlock;
  disabled: boolean;
  markdown: string;
  onAssetUploaded: (asset: ContentAsset) => void;
  onChangeMarkdown: (markdown: string) => void;
}>) {
  const sourceLines = getMarkdownBlockSourceLines(markdown, block);
  const commit = (nextLines: string[]) => {
    onChangeMarkdown(replaceMarkdownBlockSource(markdown, block, nextLines));
  };

  if (block.type === 'heading') {
    return <HeadingBlockForm block={block} disabled={disabled} onCommit={commit} />;
  }
  if (block.type === 'image') {
    return (
      <ImageBlockForm
        block={block}
        disabled={disabled}
        onAssetUploaded={onAssetUploaded}
        onCommit={commit}
      />
    );
  }
  if (block.type === 'list') {
    return (
      <ListBlockForm
        block={block}
        disabled={disabled}
        onCommit={commit}
        sourceLines={sourceLines}
      />
    );
  }
  if (block.type === 'code') {
    return <CodeBlockForm block={block} disabled={disabled} onCommit={commit} />;
  }
  if (block.type === 'ui') {
    return <UiBlockForm block={block} />;
  }
  if (block.type === 'divider') {
    return (
      <p className="poi-visual-panel-empty">分割线没有可编辑属性，可通过底部操作调整位置或移除。</p>
    );
  }

  return (
    <RawSourceBlockForm
      block={block}
      disabled={disabled}
      markdown={markdown}
      note={
        block.type === 'table'
          ? '表格按 Markdown 源码编辑，保留对齐与转义写法。'
          : block.type === 'quote'
            ? '引用块按源码编辑，支持多行与嵌套引用。'
            : '段落按源码编辑，可直接换行或使用行内 Markdown。'
      }
      onChangeMarkdown={onChangeMarkdown}
    />
  );
}

/** 画布内联块编辑器：双击块后用输入控件直接替换块本身。 */
export function MarkdownInlineBlockEditor({
  block,
  disabled,
  markdown,
  onChangeMarkdown,
  onExit,
}: Readonly<{
  block: MarkdownBlock;
  disabled: boolean;
  markdown: string;
  onChangeMarkdown: (markdown: string) => void;
  onExit: () => void;
}>) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const headingField = useFieldDraft(block.type === 'heading' ? block.text : '');
  const listField = useFieldDraft(block.type === 'list' ? block.items.join('\n') : '');
  const sourceValue = getMarkdownBlockSourceLines(markdown, block).join('\n');

  useEffect(() => {
    const field = containerRef.current?.querySelector<HTMLElement>('input, textarea');
    if (!field) {
      return;
    }
    field.focus();
    if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
      field.select();
    }
  }, [block.startLine, block.type]);

  const commitList = (value: string) => {
    const items = value
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean);
    if (items.length === 0) {
      return;
    }
    onChangeMarkdown(
      replaceMarkdownBlockSource(
        markdown,
        block,
        serializeListBlock(block.type === 'list' ? block.ordered : false, items),
      ),
    );
  };

  if (block.type === 'image' || block.type === 'divider' || block.type === 'ui') {
    return null;
  }

  return (
    <div
      className="markdown-inline-text-editor"
      ref={containerRef}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          onExit();
        }
      }}
    >
      {block.type === 'heading' ? (
        <input
          aria-label="标题文字"
          className="markdown-inline-text markdown-inline-text-heading"
          disabled={disabled}
          value={headingField.value}
          onBlur={() => {
            headingField.handleBlur();
            if (!headingField.value.trim()) {
              headingField.setValue(block.text);
            }
          }}
          onChange={(event) => {
            const nextText = event.currentTarget.value;
            headingField.setValue(nextText);
            if (nextText.trim()) {
              onChangeMarkdown(
                replaceMarkdownBlockSource(
                  markdown,
                  block,
                  serializeHeadingBlock(block.level, nextText),
                ),
              );
            }
          }}
          onFocus={headingField.handleFocus}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              event.currentTarget.blur();
            }
          }}
        />
      ) : block.type === 'list' ? (
        <textarea
          aria-label="列表项"
          className="markdown-inline-text"
          disabled={disabled}
          placeholder="每行一个列表项"
          rows={Math.max(3, block.items.length)}
          value={listField.value}
          onBlur={() => {
            listField.handleBlur();
            commitList(listField.value);
          }}
          onChange={(event) => {
            const nextValue = event.currentTarget.value;
            listField.setValue(nextValue);
            commitList(nextValue);
          }}
          onFocus={listField.handleFocus}
        />
      ) : (
        <textarea
          aria-label="Markdown 源码"
          className="markdown-inline-text"
          disabled={disabled}
          rows={Math.max(3, sourceValue.split('\n').length)}
          spellCheck={block.type !== 'code' && block.type !== 'table'}
          value={sourceValue}
          onChange={(event) =>
            onChangeMarkdown(
              replaceMarkdownBlockSource(markdown, block, event.currentTarget.value.split('\n')),
            )
          }
        />
      )}
      <div className="markdown-inline-text-footer">
        <span>{`${markdownBlockTypeLabel(block)} · Esc 退出`}</span>
        <IconButton icon="check" label="完成编辑" title="完成编辑" onClick={onExit} />
      </div>
    </div>
  );
}

function HeadingBlockForm({
  block,
  disabled,
  onCommit,
}: Readonly<{
  block: Extract<MarkdownBlock, { type: 'heading' }>;
  disabled: boolean;
  onCommit: (lines: string[]) => void;
}>) {
  const [level, setLevel] = useState(block.level);
  const textField = useFieldDraft(block.text);

  useEffect(() => {
    setLevel(block.level);
  }, [block.level, block.startLine, block.type]);

  const commit = (nextLevel: 1 | 2 | 3 | 4, nextText: string) => {
    if (!nextText.trim()) {
      return;
    }
    onCommit(serializeHeadingBlock(nextLevel, nextText));
  };

  return (
    <div className="markdown-inspector-section">
      <div className="markdown-inspector-section-heading">
        <p className="markdown-inspector-section-title">标题</p>
      </div>
      <div className="markdown-inspector-field">
        <span>级别</span>
        <SegmentedControl
          ariaLabel="标题级别"
          className="transit-visual-segmented"
          disabled={disabled}
          options={[
            { value: '1', label: 'H1' },
            { value: '2', label: 'H2' },
            { value: '3', label: 'H3' },
            { value: '4', label: 'H4' },
          ]}
          value={String(level)}
          onChange={(value) => {
            const nextLevel = Number(value) as 1 | 2 | 3 | 4;
            setLevel(nextLevel);
            commit(nextLevel, textField.value.trim() ? textField.value : block.text);
          }}
          wrapperClassName=""
        />
      </div>
      <Field label={<>标题文字</>}>
        <Input
          disabled={disabled}
          value={textField.value}
          onBlur={() => {
            textField.handleBlur();
            if (textField.value.trim()) {
              commit(level, textField.value);
            }
          }}
          onChange={(event) => {
            const nextText = event.currentTarget.value;
            textField.setValue(nextText);
            if (nextText.trim()) {
              commit(level, nextText);
            }
          }}
          onFocus={textField.handleFocus}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              event.currentTarget.blur();
            }
          }}
        />
      </Field>
      <p className="poi-visual-panel-empty">标题文字实时写回 Markdown 源码。</p>
    </div>
  );
}

function ImageBlockForm({
  block,
  disabled,
  onAssetUploaded,
  onCommit,
}: Readonly<{
  block: Extract<MarkdownBlock, { type: 'image' }>;
  disabled: boolean;
  onAssetUploaded: (asset: ContentAsset) => void;
  onCommit: (lines: string[]) => void;
}>) {
  const altField = useFieldDraft(block.alt);
  const srcField = useFieldDraft(block.src);
  const [srcError, setSrcError] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setSrcError(false);
  }, [block.startLine, block.src]);

  const replaceImage = async (file: File) => {
    setReplacing(true);
    try {
      const result = await uploadContentAsset(file);
      if (!result.ok || !result.record) {
        publishToastRequested({ message: result.message ?? '替换图片失败。', tone: 'error' });
        return;
      }
      const nextSrc = appPath(result.record.asset.url);
      const nextAlt = altField.value.trim() || result.record.asset.fileName;
      altField.setValue(nextAlt);
      srcField.setValue(nextSrc);
      setSrcError(false);
      onAssetUploaded(result.record.asset);
      onCommit(serializeImageBlock(nextAlt, nextSrc));
      publishToastRequested({ message: '图片已替换。', tone: 'success' });
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } finally {
      setReplacing(false);
    }
  };

  return (
    <div className="markdown-inspector-section">
      <div className="markdown-inspector-section-heading">
        <p className="markdown-inspector-section-title">图片</p>
      </div>
      <Field label={<>替代文字</>}>
        <Input
          disabled={disabled}
          value={altField.value}
          onBlur={() => {
            altField.handleBlur();
            onCommit(
              serializeImageBlock(
                altField.value,
                srcField.value.trim() ? srcField.value : block.src,
              ),
            );
          }}
          onChange={(event) => {
            const nextAlt = event.currentTarget.value;
            altField.setValue(nextAlt);
            onCommit(
              serializeImageBlock(nextAlt, srcField.value.trim() ? srcField.value : block.src),
            );
          }}
          onFocus={altField.handleFocus}
        />
      </Field>
      <Field label="图片链接" hint={srcError ? '图片链接不能为空。' : undefined}>
        <Input
          disabled={disabled}
          placeholder="/content-assets/... 或 https://..."
          value={srcField.value}
          onBlur={() => {
            srcField.handleBlur();
            if (!srcField.value.trim()) {
              setSrcError(true);
              return;
            }
            setSrcError(false);
            onCommit(serializeImageBlock(altField.value, srcField.value));
          }}
          onChange={(event) => {
            const nextSrc = event.currentTarget.value;
            srcField.setValue(nextSrc);
            if (nextSrc.trim()) {
              setSrcError(false);
              onCommit(serializeImageBlock(altField.value, nextSrc));
            } else {
              setSrcError(true);
            }
          }}
          onFocus={srcField.handleFocus}
        />
      </Field>
      <div className="markdown-image-replace" data-inspector-section="image-replace">
        <Field label={<>替换图片</>}>
          <Input
            ref={fileInputRef}
            accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml,image/avif"
            disabled={disabled || replacing}
            type="file"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) {
                void replaceImage(file);
              }
            }}
          />
        </Field>
        {replacing ? <small className="muted">正在上传并替换…</small> : null}
      </div>
      {isImageHref(srcField.value) ? (
        <figure className="markdown-image markdown-inspector-image-preview">
          <img alt={altField.value} loading="lazy" src={appPath(srcField.value)} />
          {altField.value ? <figcaption>{altField.value}</figcaption> : null}
        </figure>
      ) : null}
      <p className="poi-visual-panel-empty">
        图片文字与链接实时写回 Markdown 源码，也可以直接上传新文件替换当前图片。
      </p>
    </div>
  );
}

function ListBlockForm({
  block,
  disabled,
  onCommit,
  sourceLines,
}: Readonly<{
  block: Extract<MarkdownBlock, { type: 'list' }>;
  disabled: boolean;
  onCommit: (lines: string[]) => void;
  sourceLines: string[];
}>) {
  const [ordered, setOrdered] = useState(block.ordered);
  const itemsField = useFieldDraft(block.items.join('\n'));

  useEffect(() => {
    setOrdered(block.ordered);
  }, [block.ordered, block.startLine, block.type]);

  if (sourceLines.some((line) => /^\s+\S/.test(line))) {
    return (
      <div className="markdown-inspector-section">
        <p className="markdown-inspector-section-title">列表</p>
        <p className="poi-visual-panel-empty">检测到缩进，已切换为源码编辑以保留嵌套层级。</p>
        <SourceTextarea
          disabled={disabled}
          label="列表源码"
          value={sourceLines.join('\n')}
          onChange={(value) => onCommit(value.split('\n'))}
        />
      </div>
    );
  }

  const commit = (nextOrdered: boolean, rawItems = itemsField.value) => {
    const items = rawItems
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean);
    if (items.length === 0) {
      return;
    }
    onCommit(serializeListBlock(nextOrdered, items));
  };

  return (
    <div className="markdown-inspector-section">
      <div className="markdown-inspector-section-heading">
        <p className="markdown-inspector-section-title">列表</p>
      </div>
      <div className="markdown-inspector-field">
        <span>类型</span>
        <SegmentedControl
          ariaLabel="列表类型"
          className="transit-visual-segmented"
          disabled={disabled}
          options={[
            { value: 'unordered', label: '无序' },
            { value: 'ordered', label: '有序' },
          ]}
          value={ordered ? 'ordered' : 'unordered'}
          onChange={(value) => {
            const nextOrdered = value === 'ordered';
            setOrdered(nextOrdered);
            commit(nextOrdered);
          }}
          wrapperClassName=""
        />
      </div>
      <Field label={<>列表项（每行一个）</>}>
        <Textarea
          disabled={disabled}
          value={itemsField.value}
          onBlur={() => {
            itemsField.handleBlur();
            if (itemsField.value.trim()) {
              commit(ordered);
            }
          }}
          onChange={(event) => {
            const nextText = event.currentTarget.value;
            itemsField.setValue(nextText);
            commit(ordered, nextText);
          }}
          onFocus={itemsField.handleFocus}
        />
      </Field>
      <p className="poi-visual-panel-empty">列表项实时写回源码；嵌套列表请使用源码模式。</p>
    </div>
  );
}

function CodeBlockForm({
  block,
  disabled,
  onCommit,
}: Readonly<{
  block: Extract<MarkdownBlock, { type: 'code' }>;
  disabled: boolean;
  onCommit: (lines: string[]) => void;
}>) {
  const languageField = useFieldDraft(block.language);
  const bodyField = useFieldDraft(block.body);
  const containsFence = bodyField.value.split('\n').some((line) => line.trim().startsWith('```'));

  return (
    <div className="markdown-inspector-section">
      <div className="markdown-inspector-section-heading">
        <p className="markdown-inspector-section-title">代码块</p>
      </div>
      <Field label={<>语言</>}>
        <Input
          disabled={disabled}
          placeholder="例如 json / ts / text"
          value={languageField.value}
          onBlur={() => {
            languageField.handleBlur();
            onCommit(serializeCodeBlock(languageField.value, bodyField.value, true));
          }}
          onChange={(event) => {
            const nextLanguage = event.currentTarget.value;
            languageField.setValue(nextLanguage);
            onCommit(serializeCodeBlock(nextLanguage, bodyField.value, true));
          }}
          onFocus={languageField.handleFocus}
        />
      </Field>
      <Field label={<>代码内容</>}>
        <Textarea
          disabled={disabled}
          spellCheck={false}
          value={bodyField.value}
          onBlur={() => {
            bodyField.handleBlur();
            onCommit(serializeCodeBlock(languageField.value, bodyField.value, true));
          }}
          onChange={(event) => {
            const nextBody = event.currentTarget.value;
            bodyField.setValue(nextBody);
            onCommit(serializeCodeBlock(languageField.value, nextBody, true));
          }}
          onFocus={bodyField.handleFocus}
        />
      </Field>
      {containsFence ? (
        <p className="poi-visual-panel-empty">
          内容里包含 ``` 行，保存后会提前闭合代码块，请改用其他写法。
        </p>
      ) : null}
      <p className="poi-visual-panel-empty">代码内容实时写回，保存时自动补齐闭合围栏。</p>
    </div>
  );
}

function UiBlockForm({
  block,
}: Readonly<{
  block: Extract<MarkdownBlock, { type: 'ui' }>;
}>) {
  return (
    <div className="markdown-inspector-section">
      <div className="markdown-inspector-section-heading">
        <p className="markdown-inspector-section-title">AI 指令卡片（只读）</p>
      </div>
      <p className="poi-visual-panel-empty">
        该块由「问一问」助手生成，用于下发结构化卡片指令；正文编辑不需要修改它。
      </p>
      <pre className="markdown-ui-readonly">{block.body}</pre>
    </div>
  );
}

function RawSourceBlockForm({
  block,
  disabled,
  markdown,
  note,
  onChangeMarkdown,
}: Readonly<{
  block: MarkdownBlock;
  disabled: boolean;
  markdown: string;
  note: string;
  onChangeMarkdown: (markdown: string) => void;
}>) {
  const value = getMarkdownBlockSourceLines(markdown, block).join('\n');

  return (
    <div className="markdown-inspector-section">
      <div className="markdown-inspector-section-heading">
        <p className="markdown-inspector-section-title">{markdownBlockTypeLabel(block)}</p>
      </div>
      <SourceTextarea
        disabled={disabled}
        label="源码"
        value={value}
        onChange={(nextValue) =>
          onChangeMarkdown(replaceMarkdownBlockSource(markdown, block, nextValue.split('\n')))
        }
      />
      <p className="poi-visual-panel-empty">{note}</p>
    </div>
  );
}

function SourceTextarea({
  disabled,
  label,
  onChange,
  value,
}: Readonly<{
  disabled: boolean;
  label: string;
  onChange: (value: string) => void;
  value: string;
}>) {
  return (
    <Field label={<>{label}</>}>
      <Textarea
        disabled={disabled}
        spellCheck={false}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </Field>
  );
}

function markdownBlockTypeLabel(block: MarkdownBlock): string {
  const labels: Record<MarkdownBlock['type'], string> = {
    heading: '标题',
    paragraph: '段落',
    divider: '分割线',
    table: '表格',
    list: '列表',
    quote: '引用',
    image: '图片',
    code: '代码块',
    ui: 'UI 指令块',
  };
  return labels[block.type];
}

function isImageHref(href: string): boolean {
  return /\.(png|jpe?g|gif|webp|svg|avif)(\?.*)?$/i.test(href.trim());
}
