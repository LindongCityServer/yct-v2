'use client';

import type { ContentAsset } from '@yct/contracts';
import { useEffect, useMemo, useRef, useState } from 'react';
import { appPath } from '../lib/app-paths';
import { publishAdminDataChanged } from '../lib/client-admin-data-events';
import { publishToastRequested } from '../lib/client-toast-events';
import {
  contentAssetStatusLabel,
  fetchContentAssets,
  mergeAssetIds,
  uploadContentAsset,
  type AdminContentAssetRecord,
} from '../lib/content-assets-client';
import { Field, Input } from './ui/field';
import { Button, IconButton } from './ui/button';

const assetAccept =
  'image/png,image/jpeg,image/gif,image/webp,image/svg+xml,image/avif,application/pdf,text/plain,text/markdown,.md';

/** 运营消息工作台的素材区：读取、上传、复制链接与插入正文。 */
export function MarkdownAssetSection({
  assetIds,
  disabled,
  onAssetIdsChange,
  onInsert,
}: Readonly<{
  assetIds: string[];
  disabled: boolean;
  onAssetIdsChange: (ids: string[]) => void;
  onInsert: (asset: ContentAsset) => void;
}>) {
  const [assets, setAssets] = useState<AdminContentAssetRecord[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [brokenImageIds, setBrokenImageIds] = useState<Set<string>>(() => new Set());
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadAssets = async () => {
    setLoadState('loading');
    const result = await fetchContentAssets();
    if (!result.ok) {
      setLoadState('error');
      setLoadError(result.message ?? '素材读取失败。');
      return;
    }
    setAssets(result.items);
    setLoadError('');
    setLoadState('ready');
  };

  useEffect(() => {
    void loadAssets();
  }, []);

  const visibleAssets = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return [...assets]
      .sort((left, right) => right.asset.uploadedAt.localeCompare(left.asset.uploadedAt))
      .filter((record) => {
        if (!normalizedQuery) {
          return true;
        }
        return [record.asset.fileName, record.asset.id, record.asset.url]
          .join(' ')
          .toLowerCase()
          .includes(normalizedQuery);
      })
      .slice(0, 40);
  }, [assets, query]);

  const upload = async () => {
    if (!selectedFile || uploading) {
      return;
    }
    setUploading(true);
    try {
      const result = await uploadContentAsset(selectedFile);
      if (!result.ok || !result.record) {
        publishToastRequested({ message: result.message ?? '上传素材失败。', tone: 'error' });
        return;
      }
      onAssetIdsChange(mergeAssetIds(assetIds, [result.record.asset.id]));
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      publishToastRequested({
        message: result.reused ? '素材已存在，已复用现有记录。' : '素材已上传，等待审核。',
        tone: result.reused ? 'info' : 'success',
      });
      publishAdminDataChanged({
        resource: 'operations',
        reason: 'record_created',
        occurredAt: new Date().toISOString(),
      });
      await loadAssets();
    } finally {
      setUploading(false);
    }
  };

  const copyUrl = async (asset: ContentAsset) => {
    try {
      await navigator.clipboard.writeText(appPath(asset.url));
      publishToastRequested({ message: '素材链接已复制。', tone: 'success' });
    } catch {
      publishToastRequested({ message: '复制失败，请手动选择素材链接。', tone: 'error' });
    }
  };

  return (
    <div className="markdown-inspector-section markdown-asset-section">
      <div className="markdown-inspector-section-heading">
        <p className="markdown-inspector-section-title">素材</p>
        <div className="markdown-asset-heading-actions">
          <span>{`${assets.length} 条 · 已关联 ${assetIds.length}`}</span>
          <IconButton
            icon="refresh"
            label="刷新素材"
            disabled={loadState === 'loading'}
            onClick={() => void loadAssets()}
          />
        </div>
      </div>

      <Field label={<>搜索素材</>}>
        <Input
          placeholder="文件名 / 素材 ID"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
      </Field>

      <div className="markdown-asset-upload">
        <Field label={<>上传素材</>}>
          <Input
            ref={fileInputRef}
            accept={assetAccept}
            disabled={disabled || uploading}
            type="file"
            onChange={(event) => setSelectedFile(event.currentTarget.files?.[0] ?? null)}
          />
        </Field>
        <Button
          variant="secondary"
          icon="upload"
          loading={uploading}
          disabled={disabled || uploading || !selectedFile}
          onClick={() => void upload()}
        >
          {uploading ? '上传中' : '上传'}
        </Button>
      </div>

      {loadState === 'loading' ? (
        <p className="poi-visual-panel-empty">正在读取素材…</p>
      ) : loadState === 'error' ? (
        <p className="poi-visual-panel-empty">{loadError}</p>
      ) : visibleAssets.length === 0 ? (
        <p className="poi-visual-panel-empty">没有匹配的素材。上传后会先进入待审核状态。</p>
      ) : (
        <ul className="markdown-asset-list">
          {visibleAssets.map((record) => {
            const associated = assetIds.includes(record.asset.id);
            return (
              <li className="markdown-asset-row" key={record.asset.id}>
                <span className="markdown-asset-thumb" aria-hidden="true" title={record.asset.url}>
                  {record.asset.kind === 'image' &&
                  record.asset.url.trim() &&
                  !brokenImageIds.has(record.asset.id) ? (
                    <img
                      alt=""
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      src={appPath(record.asset.url)}
                      onError={() =>
                        setBrokenImageIds((current) => new Set(current).add(record.asset.id))
                      }
                    />
                  ) : (
                    <span className="material-symbols-outlined">
                      {record.asset.kind === 'image' ? 'broken_image' : 'description'}
                    </span>
                  )}
                </span>
                <span className="markdown-asset-info">
                  <strong>{record.asset.fileName}</strong>
                  <small>
                    {`${contentAssetStatusLabel(record.asset.status)} · ${formatFileSize(
                      record.asset.sizeBytes,
                    )}${associated ? ' · 已关联' : ''}`}
                  </small>
                </span>
                <span className="markdown-asset-actions">
                  <IconButton
                    icon={record.asset.kind === 'image' ? 'add_photo_alternate' : 'link'}
                    label={record.asset.kind === 'image' ? '插入图片' : '插入链接'}
                    disabled={disabled}
                    onClick={() => onInsert(record.asset)}
                  />
                  <IconButton
                    icon="content_copy"
                    label="复制链接"
                    onClick={() => void copyUrl(record.asset)}
                  />
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function formatFileSize(sizeBytes: number): string {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return '0 B';
  }
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }
  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`;
  }
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}
