'use client';

import type { ContentAsset } from '@yct/contracts';
import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { appPath } from '../lib/app-paths';
import { MOBILE_NAV_MEDIA_QUERY } from '../lib/breakpoints';
import type { AdminContentRecord } from '../lib/content-workflow';
import type { ContentEditorDraft } from '../lib/content-editor-draft';
import { markdownAssetInsertSnippet, mergeAssetIds } from '../lib/content-assets-client';
import { CONTENT_CATEGORIES } from '../lib/content-categories';
import { publishToastRequested } from '../lib/client-toast-events';
import { defineShortcut } from '../lib/editor/shortcut-builders';
import {
  countMarkdownVisibleCharacters,
  duplicateMarkdownBlock,
  extractMarkdownHeadingsFromBlocks,
  insertMarkdownBlock,
  moveMarkdownBlock,
  parseMarkdownBlocks,
  removeMarkdownBlock,
  splitMarkdownLines,
  type MarkdownBlock,
} from '../lib/editor/markdown-blocks';
import { useEditorInspectorFocus } from '../lib/editor/use-editor-inspector-focus';
import { useEditorLayerScroll } from '../lib/editor/use-editor-layer-scroll';
import { useEditorPanels } from '../lib/editor/use-editor-panels';
import { useEditorShortcuts } from '../lib/editor/use-editor-shortcuts';
import { EditorHeaderToolbar } from './editor/editor-header-toolbar';
import { EditorHeaderToolsPortal } from './editor/editor-header-tools-portal';
import { EditorInspectorEntry } from './editor/editor-inspector-entry';
import { EditorLayerRowActions } from './editor/editor-layer-row-actions';
import { EditorPanelHeading } from './editor/editor-panel-heading';
import { EditorRailBridge } from './editor/editor-rail-bridge';
import { EditorToolbar } from './editor/editor-toolbar';
import { EditorToolbarActionButton } from './editor/editor-toolbar-actions';
import type { EditorToolbarOverflowItem } from './editor/editor-toolbar-overflow';
import { MarkdownBlocks } from './markdown-blocks';
import { MarkdownBlockInspector, MarkdownInlineBlockEditor } from './markdown-block-inspector';
import { MarkdownDocumentInspector, MarkdownHeaderFields } from './markdown-document-inspector';
import { ContentCoverColorPicker } from './content-cover-color-picker';
import { SegmentedControl } from './segmented-control';
import { Field, Input } from './ui/field';
import { IconButton } from './ui/button';

type MarkdownViewMode = 'preview' | 'split' | 'source';
type MarkdownSelection = { kind: 'header' } | { kind: 'block'; blockIndex: number };

const addBlockOptions = [
  { value: 'heading', label: '标题', icon: 'title' },
  { value: 'paragraph', label: '段落', icon: 'notes' },
  { value: 'list', label: '列表', icon: 'format_list_bulleted' },
  { value: 'table', label: '表格', icon: 'table_chart' },
  { value: 'quote', label: '引用', icon: 'format_quote' },
  { value: 'divider', label: '分割线', icon: 'horizontal_rule' },
  { value: 'code', label: '代码块', icon: 'code' },
] as const;

type AddBlockType = (typeof addBlockOptions)[number]['value'];
type MarkdownPreviewWidth = 'narrow' | 'medium' | 'wide';
type MarkdownHeaderField = 'title' | 'category' | 'excerpt' | 'cover';

/** 运营消息工作台：左结构树 / 中预览与源码 / 右属性检查器。 */
export function AdminMarkdownEditorWorkspace({
  disabled,
  draft,
  onChange,
  record,
}: Readonly<{
  disabled: boolean;
  draft: ContentEditorDraft;
  onChange: (patch: Partial<ContentEditorDraft>) => void;
  record: AdminContentRecord;
}>) {
  const [viewMode, setViewMode] = useState<MarkdownViewMode>('preview');
  const [previewWidth, setPreviewWidth] = useState<MarkdownPreviewWidth>('wide');
  const [selection, setSelection] = useState<MarkdownSelection | null>(null);
  const [editingBlockIndex, setEditingBlockIndex] = useState<number | null>(null);
  const [editingHeaderField, setEditingHeaderField] = useState<MarkdownHeaderField | null>(null);
  const {
    panelsVisible,
    panelStateClass,
    setPanelsVisible,
    togglePanels,
    openInspector,
    closeInspector,
  } = useEditorPanels();
  const inspectorRef = useRef<HTMLElement | null>(null);
  const previewRef = useRef<HTMLElement | null>(null);
  const sourceRef = useRef<HTMLTextAreaElement | null>(null);
  const treeRef = useRef<HTMLDivElement | null>(null);
  const focusInspector = useEditorInspectorFocus(inspectorRef);
  const isCompactViewport = useIsCompactViewport();

  const blocks = useMemo(() => parseMarkdownBlocks(draft.markdown), [draft.markdown]);
  const headings = useMemo(() => extractMarkdownHeadingsFromBlocks(blocks), [blocks]);
  const characterCount = useMemo(() => countMarkdownVisibleCharacters(blocks), [blocks]);
  const selectedBlockIndex = selection?.kind === 'block' ? selection.blockIndex : undefined;
  const selectedBlock =
    selectedBlockIndex !== undefined && selectedBlockIndex < blocks.length
      ? blocks[selectedBlockIndex]
      : undefined;

  useEditorLayerScroll(
    treeRef,
    selection ? (selection.kind === 'header' ? 'header' : selection.blockIndex) : null,
  );

  useEffect(() => {
    if (selection?.kind === 'block' && selection.blockIndex >= blocks.length) {
      setSelection(null);
    }
  }, [blocks.length, selection]);

  useEffect(() => {
    if (editingBlockIndex !== null && editingBlockIndex >= blocks.length) {
      setEditingBlockIndex(null);
    }
  }, [blocks.length, editingBlockIndex]);

  useEffect(() => {
    if (isCompactViewport && viewMode === 'split') {
      setViewMode('preview');
    }
  }, [isCompactViewport, viewMode]);

  const scrollPreviewToBlock = (index: number) => {
    const target = previewRef.current?.querySelector<HTMLElement>(
      `[data-markdown-block-index="${index}"]`,
    );
    target?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };

  const focusSourceBlock = (index: number) => {
    const textarea = sourceRef.current;
    const block = blocks[index];
    if (!textarea || !block) {
      return;
    }
    const lines = splitMarkdownLines(draft.markdown);
    const start = lines.slice(0, block.startLine).join('\n').length + (block.startLine > 0 ? 1 : 0);
    const end = lines.slice(0, block.endLine).join('\n').length + (block.endLine > 0 ? 1 : 0);
    textarea.focus();
    textarea.setSelectionRange(start, end);
  };

  const selectBlock = (index: number) => {
    if (index < 0 || index >= blocks.length) {
      return;
    }
    setSelection({ kind: 'block', blockIndex: index });
  };

  const selectHeader = () => {
    setSelection({ kind: 'header' });
  };

  const updateHeaderMetadata = (patch: Partial<ContentEditorDraft['metadata']>) => {
    onChange({ metadata: { ...draft.metadata, ...patch } });
  };

  const clearSelection = () => {
    setSelection(null);
    setEditingBlockIndex(null);
    setEditingHeaderField(null);
    closeInspector();
  };

  const handleTreeSelect = (index: number) => {
    setEditingBlockIndex(null);
    setEditingHeaderField(null);
    selectBlock(index);
    if (viewMode === 'source') {
      focusSourceBlock(index);
      return;
    }
    scrollPreviewToBlock(index);
  };

  const handleTreeDoubleClick = (index: number) => {
    setEditingBlockIndex(null);
    setEditingHeaderField(null);
    selectBlock(index);
    focusInspector();
  };

  const handleHeaderSelect = () => {
    setEditingBlockIndex(null);
    setEditingHeaderField(null);
    selectHeader();
    if (viewMode !== 'source') {
      previewRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleHeaderDoubleClick = () => {
    setEditingBlockIndex(null);
    setEditingHeaderField(null);
    selectHeader();
    focusInspector();
  };

  const handleHeaderFieldDoubleClick = (field: MarkdownHeaderField) => {
    setEditingBlockIndex(null);
    setEditingHeaderField(field);
    selectHeader();
  };

  const handlePreviewBlockSelect = (index: number) => {
    if (editingBlockIndex !== null && editingBlockIndex !== index) {
      setEditingBlockIndex(null);
    }
    if (editingHeaderField) {
      setEditingHeaderField(null);
    }
    selectBlock(index);
  };

  const focusInspectorImageSection = () => {
    const target = inspectorRef.current?.querySelector<HTMLElement>(
      '[data-inspector-section="image-replace"]',
    );
    if (!target) {
      return;
    }
    target.scrollIntoView({ block: 'nearest' });
    target.querySelector<HTMLElement>('input[type="file"]')?.focus();
  };

  const handlePreviewBlockDoubleClick = (index: number) => {
    const block = blocks[index];
    if (!block) {
      return;
    }
    setEditingHeaderField(null);
    if (block.type === 'image') {
      setEditingBlockIndex(null);
      selectBlock(index);
      setPanelsVisible(true);
      openInspector();
      window.requestAnimationFrame(focusInspectorImageSection);
      return;
    }
    if (block.type === 'divider' || block.type === 'ui') {
      setEditingBlockIndex(null);
      selectBlock(index);
      openInspector();
      return;
    }
    setEditingBlockIndex(index);
    selectBlock(index);
  };

  const handlePreviewBlankClick = (event: ReactMouseEvent<HTMLElement>) => {
    const target = event.target;
    if (
      target instanceof Element &&
      target.closest(
        '[data-markdown-block-index], [data-markdown-header], a, button, input, select, textarea',
      )
    ) {
      return;
    }
    clearSelection();
  };

  const notifyBlockChange = (nextIndex: number) => {
    setEditingBlockIndex(null);
    setEditingHeaderField(null);
    setSelection({ kind: 'block', blockIndex: nextIndex });
    window.requestAnimationFrame(() => {
      scrollPreviewToBlock(nextIndex);
    });
  };

  const handleMove = (index: number, offset: -1 | 1) => {
    const next = moveMarkdownBlock(draft.markdown, index, offset);
    if (next === draft.markdown) {
      return;
    }
    onChange({ markdown: next });
    notifyBlockChange(index + offset);
  };

  const handleDuplicate = (index: number) => {
    const next = duplicateMarkdownBlock(draft.markdown, index);
    if (next === draft.markdown) {
      return;
    }
    onChange({ markdown: next });
    notifyBlockChange(index + 1);
  };

  const handleRemove = (index: number) => {
    if (blocks.length === 0) {
      return;
    }
    if (blocks.length === 1) {
      onChange({ markdown: '' });
      setEditingBlockIndex(null);
      setEditingHeaderField(null);
      setSelection(null);
      return;
    }
    const next = removeMarkdownBlock(draft.markdown, index);
    onChange({ markdown: next });
    notifyBlockChange(Math.min(index, blocks.length - 2));
  };

  const handleAddBlock = (type: AddBlockType) => {
    const insertAt =
      selection?.kind === 'block'
        ? selection.blockIndex + 1
        : selection?.kind === 'header'
          ? 0
          : blocks.length;
    const next = insertMarkdownBlock(draft.markdown, insertAt, createBlockSource(type));
    onChange({ markdown: next });
    notifyBlockChange(insertAt);
  };

  const handleInsertAsset = (asset: ContentAsset) => {
    const snippet = markdownAssetInsertSnippet(asset);
    const textarea = sourceRef.current;
    let nextMarkdown: string;

    if (textarea && viewMode !== 'preview') {
      const start = textarea.selectionStart ?? draft.markdown.length;
      const end = textarea.selectionEnd ?? start;
      const before = draft.markdown.slice(0, start);
      const after = draft.markdown.slice(end);
      const prefix = before && !before.endsWith('\n') ? '\n\n' : '';
      const suffix = after && !after.startsWith('\n') ? '\n' : '';
      nextMarkdown = `${before}${prefix}${snippet}${suffix}${after}`;
      window.requestAnimationFrame(() => {
        const position = before.length + prefix.length + snippet.length;
        textarea.focus();
        textarea.setSelectionRange(position, position);
      });
    } else {
      const trimmed = draft.markdown.replace(/\s+$/, '');
      nextMarkdown = `${trimmed}${trimmed ? '\n\n' : ''}${snippet}\n`;
    }

    onChange({
      markdown: nextMarkdown,
      assetIds: mergeAssetIds(draft.assetIds, [asset.id]),
    });
    publishToastRequested({
      message: asset.kind === 'image' ? '图片已插入正文。' : '素材链接已插入正文。',
      tone: 'success',
    });
  };

  useEditorShortcuts(
    [
      defineShortcut('duplicateSelection', () => {
        if (selection?.kind === 'block') {
          handleDuplicate(selection.blockIndex);
        }
      }),
      defineShortcut('moveUp', () => {
        if (selection?.kind === 'block' && selection.blockIndex > 0) {
          handleMove(selection.blockIndex, -1);
        }
      }),
      defineShortcut('moveDown', () => {
        if (selection?.kind === 'block' && selection.blockIndex < blocks.length - 1) {
          handleMove(selection.blockIndex, 1);
        }
      }),
      defineShortcut('deleteSelection', () => {
        if (selection?.kind === 'block') {
          handleRemove(selection.blockIndex);
        }
      }),
    ],
    { enabled: !disabled },
  );

  const viewItems: EditorToolbarOverflowItem[] = [
    {
      id: 'preview',
      icon: 'visibility',
      label: '预览',
      active: viewMode === 'preview',
      onClick: () => setViewMode('preview'),
    },
    {
      id: 'split',
      icon: 'splitscreen',
      label: '分栏',
      active: viewMode === 'split',
      disabled: isCompactViewport,
      onClick: () => setViewMode('split'),
    },
    {
      id: 'source',
      icon: 'code',
      label: '源码',
      active: viewMode === 'source',
      onClick: () => setViewMode('source'),
    },
  ];

  const previewWidthItems: EditorToolbarOverflowItem[] = [
    {
      id: 'narrow',
      icon: 'smartphone',
      label: '窄屏预览（240px）',
      active: previewWidth === 'narrow',
      onClick: () => setPreviewWidth('narrow'),
    },
    {
      id: 'medium',
      icon: 'desktop_windows',
      label: '桌面预览（340px）',
      active: previewWidth === 'medium',
      onClick: () => setPreviewWidth('medium'),
    },
    {
      id: 'wide',
      icon: 'tablet_mac',
      label: '宽屏预览（760px）',
      active: previewWidth === 'wide',
      onClick: () => setPreviewWidth('wide'),
    },
  ];

  const renderToolbar = (inHeader = false) => (
    <EditorToolbar
      activeToolId=""
      ariaLabel="运营消息编辑视图"
      className={inHeader ? 'is-in-header' : undefined}
      panels={{
        visible: panelsVisible,
        onToggle: togglePanels,
        label: panelsVisible ? '隐藏全部面板' : '显示全部面板',
      }}
      onToolChange={() => undefined}
      sections={[
        {
          id: 'view',
          ariaLabel: '画布视图',
          actions: isCompactViewport ? (
            <SegmentedControl
              ariaLabel="画布视图"
              className="transit-visual-segmented"
              options={[
                { value: 'preview', label: '预览' },
                { value: 'source', label: '源码' },
              ]}
              value={viewMode === 'source' ? 'source' : 'preview'}
              onChange={(value) => setViewMode(value)}
              wrapperClassName="markdown-view-switch"
            />
          ) : (
            viewItems.map((item) => <EditorToolbarActionButton item={item} key={item.id} />)
          ),
        },
        {
          id: 'previewWidth',
          ariaLabel: '预览宽度',
          actions: previewWidthItems.map((item) => (
            <EditorToolbarActionButton item={item} key={item.id} />
          )),
        },
      ]}
    />
  );

  const inspectorTitle =
    selection?.kind === 'header'
      ? '封面与标题'
      : selectedBlock
        ? markdownBlockTypeLabel(selectedBlock)
        : '全局属性';
  const inspectorMeta =
    selection?.kind === 'header'
      ? `${draft.categoryId || '未分类'} · ${draft.metadata.showInBanner ? '首页重点' : '列表入口'}`
      : selectedBlock && selectedBlockIndex !== undefined
        ? `块 ${selectedBlockIndex + 1} · ${markdownBlockTypeLabel(selectedBlock)}`
        : `${contentStatusLabel(record.revision.status)} · ${characterCount} 字`;

  return (
    <div
      className={`markdown-visual-workspace${panelStateClass}${
        selection ? ' has-layer-selection' : ''
      }`}
    >
      <section className={`markdown-visual-canvas is-mode-${viewMode}`} aria-label="Markdown 画布">
        <div className="markdown-canvas-source">
          <div className="markdown-canvas-source-heading">
            <strong>Markdown 源码</strong>
            <span>{`${draft.markdown.length} 字符 · ${draft.markdown.split('\n').length} 行`}</span>
          </div>
          <textarea
            ref={sourceRef}
            aria-label="Markdown 源码"
            disabled={disabled}
            spellCheck={false}
            value={draft.markdown}
            onChange={(event) => onChange({ markdown: event.currentTarget.value })}
          />
        </div>

        <article
          className={`markdown-canvas-preview markdown-visual-preview is-preview-width-${previewWidth}`}
          aria-label="内容预览"
          ref={previewRef}
          onClick={handlePreviewBlankClick}
        >
          <div
            className={`markdown-visual-header${selection?.kind === 'header' ? ' is-active' : ''}`}
            data-markdown-header
            onClick={(event) => {
              event.stopPropagation();
              selectHeader();
              const target = event.target;
              if (
                target instanceof Element &&
                target.closest('.markdown-inline-header-control, .markdown-inline-cover-editor')
              ) {
                return;
              }
              setEditingBlockIndex(null);
              setEditingHeaderField(null);
            }}
            onDoubleClick={(event) => {
              event.stopPropagation();
              const target = event.target;
              if (
                target instanceof Element &&
                target.closest('.markdown-inline-header-control, .markdown-inline-cover-editor')
              ) {
                return;
              }
              const fieldTarget =
                target instanceof Element
                  ? target.closest<HTMLElement>('[data-markdown-header-field]')
                  : null;
              const field = fieldTarget?.dataset.markdownHeaderField;
              if (
                field === 'title' ||
                field === 'category' ||
                field === 'excerpt' ||
                field === 'cover'
              ) {
                handleHeaderFieldDoubleClick(field);
                return;
              }
              handleHeaderDoubleClick();
            }}
          >
            {draft.metadata.coverImageUrl || draft.metadata.coverColor ? (
              <div
                className="admin-editor-preview-cover"
                data-markdown-header-field="cover"
                style={
                  draft.metadata.coverImageUrl
                    ? { backgroundImage: `url("${appPath(draft.metadata.coverImageUrl)}")` }
                    : { backgroundColor: draft.metadata.coverColor }
                }
              />
            ) : null}
            {editingHeaderField === 'cover' ? (
              <div
                className="markdown-inline-cover-editor"
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.stopPropagation();
                    setEditingHeaderField(null);
                  }
                }}
              >
                <div className="markdown-inline-block-heading">
                  <strong>封面</strong>
                  <span>画布内编辑 · Esc 退出</span>
                  <IconButton
                    icon="check"
                    label="完成封面编辑"
                    onClick={() => setEditingHeaderField(null)}
                  />
                </div>
                <ContentCoverColorPicker
                  value={draft.metadata.coverColor ?? ''}
                  onChange={(coverColor) =>
                    updateHeaderMetadata({ coverColor: coverColor || undefined })
                  }
                />
                <Field label={<>封面图链接</>}>
                  <Input
                    autoFocus
                    value={draft.metadata.coverImageUrl ?? ''}
                    onChange={(event) =>
                      updateHeaderMetadata({
                        coverImageUrl: event.currentTarget.value || undefined,
                      })
                    }
                  />
                </Field>
              </div>
            ) : null}
            <header className="markdown-visual-preview-heading">
              {editingHeaderField === 'category' ? (
                <select
                  autoFocus
                  aria-label="分类"
                  className="markdown-inline-header-control markdown-inline-header-category"
                  value={draft.categoryId}
                  onBlur={() => setEditingHeaderField(null)}
                  onChange={(event) => {
                    onChange({ categoryId: event.currentTarget.value });
                    setEditingHeaderField(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      event.currentTarget.blur();
                    }
                  }}
                >
                  {draft.categoryId &&
                  !(CONTENT_CATEGORIES as readonly string[]).includes(draft.categoryId) ? (
                    <option value={draft.categoryId}>{draft.categoryId}</option>
                  ) : null}
                  {CONTENT_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              ) : (
                <span data-markdown-header-field="category">{draft.categoryId}</span>
              )}
              {editingHeaderField === 'title' ? (
                <input
                  autoFocus
                  aria-label="标题"
                  className="markdown-inline-header-control markdown-inline-header-title"
                  value={draft.title}
                  onBlur={() => setEditingHeaderField(null)}
                  onChange={(event) => onChange({ title: event.currentTarget.value })}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      event.currentTarget.blur();
                    } else if (event.key === 'Escape') {
                      event.currentTarget.blur();
                    }
                  }}
                />
              ) : (
                <h2 data-markdown-header-field="title">{draft.title.trim() || '未命名内容'}</h2>
              )}
              {editingHeaderField === 'excerpt' ? (
                <textarea
                  autoFocus
                  aria-label="摘要"
                  className="markdown-inline-header-control markdown-inline-header-excerpt"
                  value={draft.metadata.excerpt ?? ''}
                  onBlur={() => setEditingHeaderField(null)}
                  onChange={(event) => updateHeaderMetadata({ excerpt: event.currentTarget.value })}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      event.currentTarget.blur();
                    }
                  }}
                />
              ) : draft.metadata.excerpt ? (
                <p data-markdown-header-field="excerpt">{draft.metadata.excerpt}</p>
              ) : (
                <p className="is-empty" data-markdown-header-field="excerpt">
                  添加摘要…
                </p>
              )}
            </header>
          </div>
          <MarkdownBlocks
            activeBlockIndex={selectedBlockIndex}
            editingBlockIndex={editingBlockIndex ?? undefined}
            markdown={draft.markdown}
            onBlockDoubleClick={handlePreviewBlockDoubleClick}
            onBlockSelect={handlePreviewBlockSelect}
            renderBlock={(block, index) =>
              editingBlockIndex === index ? (
                <MarkdownInlineBlockEditor
                  block={block}
                  disabled={disabled}
                  markdown={draft.markdown}
                  onChangeMarkdown={(markdown) => onChange({ markdown })}
                  onExit={() => setEditingBlockIndex(null)}
                />
              ) : null
            }
            renderUiBlock={(body) => (
              <div className="markdown-ui-placeholder">
                <span className="material-symbols-outlined" aria-hidden="true">
                  smart_toy
                </span>
                <span>{`AI 卡片 · ${body.length} 字符`}</span>
              </div>
            )}
          />
        </article>
      </section>

      <EditorRailBridge
        activeToolId=""
        ownerId="markdown-editor"
        panels={{ visible: panelsVisible, onToggle: togglePanels }}
        sections={[
          {
            id: 'view',
            priority: 60,
            items: isCompactViewport ? viewItems.filter((item) => item.id !== 'split') : viewItems,
          },
          { id: 'previewWidth', priority: 50, items: previewWidthItems },
        ]}
        tools={[]}
        onToolChange={() => undefined}
      />

      {panelsVisible ? (
        <aside className="poi-visual-layer-panel" aria-label="文档结构">
          <EditorPanelHeading
            meta={`${blocks.length} 块 · ${headings.length} 个标题`}
            title="文档结构"
          >
            <EditorInspectorEntry onOpen={openInspector} />
          </EditorPanelHeading>
          <div className="poi-visual-layer-body" ref={treeRef}>
            <BlockTree
              blocks={blocks}
              disabled={disabled}
              headerCategory={draft.categoryId}
              onDoubleClick={handleTreeDoubleClick}
              onDuplicate={handleDuplicate}
              onHeaderDoubleClick={handleHeaderDoubleClick}
              onHeaderSelect={handleHeaderSelect}
              onMoveDown={(index) => handleMove(index, 1)}
              onMoveUp={(index) => handleMove(index, -1)}
              onRemove={handleRemove}
              onSelect={handleTreeSelect}
              selection={selection}
            />
            {blocks.length === 0 ? (
              <p className="poi-visual-panel-empty">正文还是空的，使用底部的「添加块」开始编写。</p>
            ) : null}
          </div>
          <div className="poi-visual-layer-footer">
            <span className="markdown-add-block-label">添加块</span>
            <div className="markdown-add-block-bar" role="group" aria-label="添加块">
              {addBlockOptions.map((option) => (
                <IconButton
                  key={option.value}
                  icon={option.icon}
                  label={`添加${option.label}`}
                  disabled={disabled}
                  onClick={() => handleAddBlock(option.value)}
                />
              ))}
            </div>
          </div>
        </aside>
      ) : null}

      {panelsVisible ? (
        <aside className="poi-visual-inspector" aria-label="属性检查器" ref={inspectorRef}>
          <EditorPanelHeading meta={inspectorMeta} title={inspectorTitle}>
            {selection ? (
              <button
                aria-label="返回全局属性"
                className="poi-visual-inspector-back"
                title="返回全局属性"
                type="button"
                onClick={clearSelection}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  arrow_back
                </span>
              </button>
            ) : (
              // 全局属性状态下也提供关闭入口，避免中等宽度下打开检查器后无法退出。
              <button
                aria-label="关闭属性面板"
                className="poi-visual-inspector-back"
                title="关闭属性面板"
                type="button"
                onClick={closeInspector}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  close
                </span>
              </button>
            )}
          </EditorPanelHeading>
          <div className="poi-visual-coordinate-panel-body">
            {selection?.kind === 'header' ? (
              <div className="markdown-header-inspector">
                <p className="poi-visual-panel-empty">
                  点击预览中的封面、分类、标题或摘要都会选中这里；首页入口预览会随字段实时更新。
                </p>
                <MarkdownHeaderFields
                  disabled={disabled}
                  draft={draft}
                  onChange={onChange}
                  onAssetUploaded={(asset) =>
                    onChange({ assetIds: mergeAssetIds(draft.assetIds, [asset.id]) })
                  }
                />
              </div>
            ) : selectedBlock && selectedBlockIndex !== undefined ? (
              <MarkdownBlockInspector
                block={selectedBlock}
                canMoveDown={selectedBlockIndex < blocks.length - 1}
                canMoveUp={selectedBlockIndex > 0}
                disabled={disabled}
                markdown={draft.markdown}
                onAssetUploaded={(asset) =>
                  onChange({ assetIds: mergeAssetIds(draft.assetIds, [asset.id]) })
                }
                onChangeMarkdown={(markdown) => onChange({ markdown })}
                onDuplicate={() => handleDuplicate(selectedBlockIndex)}
                onMoveDown={() => handleMove(selectedBlockIndex, 1)}
                onMoveUp={() => handleMove(selectedBlockIndex, -1)}
                onRemove={() => handleRemove(selectedBlockIndex)}
              />
            ) : (
              <MarkdownDocumentInspector
                disabled={disabled}
                draft={draft}
                onChange={onChange}
                onInsertAsset={handleInsertAsset}
                record={record}
              />
            )}
          </div>
        </aside>
      ) : null}

      <EditorHeaderToolsPortal>
        <EditorHeaderToolbar compact={renderToolbar(true)} full={renderToolbar(true)} />
      </EditorHeaderToolsPortal>

      {renderToolbar()}
    </div>
  );
}

function BlockTree({
  blocks,
  disabled,
  headerCategory,
  onDoubleClick,
  onDuplicate,
  onHeaderDoubleClick,
  onHeaderSelect,
  onMoveDown,
  onMoveUp,
  onRemove,
  onSelect,
  selection,
}: Readonly<{
  blocks: MarkdownBlock[];
  disabled: boolean;
  headerCategory: string;
  onDoubleClick: (index: number) => void;
  onDuplicate: (index: number) => void;
  onHeaderDoubleClick: () => void;
  onHeaderSelect: () => void;
  onMoveDown: (index: number) => void;
  onMoveUp: (index: number) => void;
  onRemove: (index: number) => void;
  onSelect: (index: number) => void;
  selection: MarkdownSelection | null;
}>) {
  let headingDepth = -1;

  return (
    <ul className="poi-visual-layer-tree">
      <li>
        <div className={`poi-visual-layer-row${selection?.kind === 'header' ? ' is-active' : ''}`}>
          <button
            aria-pressed={selection?.kind === 'header'}
            className="poi-visual-layer-group markdown-document-header"
            type="button"
            onClick={onHeaderSelect}
            onDoubleClick={onHeaderDoubleClick}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              web_asset
            </span>
            <span className="poi-visual-layer-label">封面与标题</span>
            <span className="poi-visual-layer-count">{headerCategory || '未分类'}</span>
          </button>
        </div>
      </li>
      {blocks.map((block, index) => {
        const isHeading = block.type === 'heading';
        if (isHeading) {
          headingDepth = block.level - 2;
        }
        const indent = Math.min(3, Math.max(0, isHeading ? headingDepth : headingDepth + 1));
        const selected = selection?.kind === 'block' && selection.blockIndex === index;

        return (
          <li data-markdown-tree-index={index} key={`${block.startLine}-${block.endLine}-${index}`}>
            <div className={`poi-visual-layer-row${selected ? ' is-active' : ''}`}>
              <button
                aria-pressed={selected}
                className={
                  isHeading
                    ? 'poi-visual-layer-group markdown-tree-heading'
                    : 'poi-visual-layer-point'
                }
                style={{ paddingLeft: `${8 + indent * 14}px` }}
                type="button"
                onClick={() => onSelect(index)}
                onDoubleClick={() => onDoubleClick(index)}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  {markdownBlockIcon(block)}
                </span>
                <span
                  className={isHeading ? 'poi-visual-layer-label' : 'poi-visual-layer-coordinate'}
                >
                  {describeMarkdownBlock(block)}
                </span>
                <span className="poi-visual-layer-count">{describeMarkdownBlockMeta(block)}</span>
              </button>
              <EditorLayerRowActions
                actions={[
                  {
                    id: 'move-up',
                    icon: 'arrow_upward',
                    label: '上移块',
                    disabled: disabled || index === 0,
                    onClick: () => onMoveUp(index),
                  },
                  {
                    id: 'move-down',
                    icon: 'arrow_downward',
                    label: '下移块',
                    disabled: disabled || index === blocks.length - 1,
                    onClick: () => onMoveDown(index),
                  },
                  {
                    id: 'duplicate',
                    icon: 'content_copy',
                    label: '复制块',
                    disabled,
                    onClick: () => onDuplicate(index),
                  },
                  {
                    id: 'remove',
                    icon: 'delete',
                    label: '移除块',
                    danger: true,
                    disabled,
                    onClick: () => onRemove(index),
                  },
                ]}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function createBlockSource(type: AddBlockType): string[] {
  switch (type) {
    case 'heading':
      return ['## 新标题'];
    case 'list':
      return ['- 列表项'];
    case 'table':
      return ['| 列 1 | 列 2 |', '| --- | --- |', '| 内容 | 内容 |'];
    case 'quote':
      return ['> 引用内容'];
    case 'divider':
      return ['---'];
    case 'code':
      return ['```text', '代码内容', '```'];
    case 'paragraph':
    default:
      return ['新段落'];
  }
}

function describeMarkdownBlock(block: MarkdownBlock): string {
  switch (block.type) {
    case 'heading':
      return block.text || '未命名标题';
    case 'paragraph':
      return truncateText(block.text, 32) || '空段落';
    case 'divider':
      return '分割线';
    case 'table':
      return `${block.headers.length} 列 · ${block.rows.length} 行`;
    case 'list':
      return block.items[0] ? truncateText(block.items[0], 28) : '空列表';
    case 'quote':
      return truncateText(block.text, 28) || '空引用';
    case 'image':
      return block.alt || '图片';
    case 'code':
      return block.language ? `代码 · ${block.language}` : '代码块';
    case 'ui':
      return 'AI 指令卡片';
    default:
      return '块';
  }
}

function describeMarkdownBlockMeta(block: MarkdownBlock): string {
  switch (block.type) {
    case 'heading':
      return `H${block.level}`;
    case 'paragraph':
      return `${block.text.length} 字`;
    case 'divider':
      return '—';
    case 'table':
      return `${block.rows.length} 行`;
    case 'list':
      return `${block.items.length} 项`;
    case 'quote':
      return `${block.text.length} 字`;
    case 'image':
      return '图片';
    case 'code':
      return `${block.body.split('\n').length} 行`;
    case 'ui':
      return '只读';
    default:
      return '';
  }
}

function markdownBlockIcon(block: MarkdownBlock): string {
  const icons: Record<MarkdownBlock['type'], string> = {
    heading: 'title',
    paragraph: 'notes',
    divider: 'horizontal_rule',
    table: 'table_chart',
    list: 'format_list_bulleted',
    quote: 'format_quote',
    image: 'image',
    code: 'code',
    ui: 'smart_toy',
  };
  return icons[block.type];
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
    ui: 'AI 指令卡片',
  };
  return labels[block.type];
}

function contentStatusLabel(status: AdminContentRecord['revision']['status']): string {
  const labels: Record<AdminContentRecord['revision']['status'], string> = {
    draft: '草稿',
    pending_review: '待审核',
    approved: '已通过',
    rejected: '已驳回',
    published: '已发布',
    archived: '已归档',
  };
  return labels[status];
}

function truncateText(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}…` : normalized;
}

function useIsCompactViewport(): boolean {
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const query = window.matchMedia(MOBILE_NAV_MEDIA_QUERY);
    const update = () => setCompact(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  return compact;
}
