import type { ContentAsset } from '@yct/contracts';
import { appPath } from './app-paths';

/** 运营消息素材记录的客户端视图，与 /api/admin/operations/assets 返回结构一致。 */
export interface AdminContentAssetRecord {
  asset: ContentAsset;
  sourceKind: 'legacy' | 'upload' | 'external';
  migratedPath?: string;
  sha256?: string;
  references: Array<{
    entryId: string;
    referenceKind: string;
    contentId: string;
    contentTitle: string;
    sourcePageUrl?: string;
  }>;
  duplicateGroupId?: string;
  createdAt: string;
  updatedAt: string;
}

export function parseAssetIds(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[\s,，]+/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

export function mergeAssetIds(current: string[], next: string[]): string[] {
  return Array.from(
    new Set([...current, ...next].map((assetId) => assetId.trim()).filter(Boolean)),
  );
}

export function mergeAssetIdText(current: string, assetId: string): string {
  return mergeAssetIds(parseAssetIds(current), [assetId]).join('\n');
}

export function contentAssetStatusLabel(status: ContentAsset['status']): string {
  const labels: Record<ContentAsset['status'], string> = {
    pending_review: '待审核',
    approved: '已通过',
    rejected: '已驳回',
    archived: '已归档',
  };
  return labels[status];
}

/** 素材列表里展示的 Markdown 片段；非图片素材沿用原始 URL。 */
export function markdownImageSnippet(asset: ContentAsset): string {
  if (asset.kind !== 'image') {
    return asset.url;
  }

  return `![${asset.fileName}](${appPath(asset.url)})`;
}

/** 插入正文时使用：图片写图片语法，附件写链接语法。 */
export function markdownAssetInsertSnippet(asset: ContentAsset): string {
  const url = appPath(asset.url);
  if (asset.kind === 'image') {
    return `![${asset.fileName}](${url})`;
  }
  return `[${asset.fileName}](${url})`;
}

export async function fetchContentAssets(): Promise<{
  ok: boolean;
  items: AdminContentAssetRecord[];
  message?: string;
}> {
  const response = await fetch(appPath('/api/admin/operations/assets'), { cache: 'no-store' });
  const data = (await response.json()) as {
    items?: AdminContentAssetRecord[];
    message?: string;
  };
  if (!response.ok) {
    return { ok: false, items: [], message: data.message ?? '素材读取失败。' };
  }
  return { ok: true, items: data.items ?? [] };
}

export async function uploadContentAsset(file: File): Promise<{
  ok: boolean;
  record?: AdminContentAssetRecord;
  reused?: boolean;
  message?: string;
}> {
  const body = new FormData();
  body.set('asset', file);
  const response = await fetch(appPath('/api/admin/operations/assets/upload'), {
    method: 'POST',
    body,
  });
  const data = (await response.json()) as {
    message?: string;
    record?: AdminContentAssetRecord;
    reused?: boolean;
  };
  if (!response.ok || !data.record) {
    return { ok: false, message: data.message ?? '上传素材失败。' };
  }
  return { ok: true, record: data.record, reused: data.reused };
}
