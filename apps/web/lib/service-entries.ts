import type { ApiListResponse, ServiceEntryGroup, ServiceEntry } from '@yct/contracts';
import { createApiMeta } from './api-meta';
import { listPublishedServiceEntries } from './service-entry-store';

const categoryTitles: Record<ServiceEntry['categoryId'], string> = {
  operations: '运营及周边',
  server_sites: '服务器网站',
  toolbox: '工具箱',
  other: '其他服务',
};

export async function readServiceEntryGroups(): Promise<ApiListResponse<ServiceEntryGroup>> {
  const entries = await listPublishedServiceEntries();
  const groups = Object.entries(categoryTitles)
    .map(([categoryId, title]) => {
      const items = entries.filter((entry) => entry.categoryId === categoryId);
      return {
        categoryId: categoryId as ServiceEntry['categoryId'],
        title,
        items,
      };
    })
    .filter((group) => group.items.length > 0);

  return {
    meta: createApiMeta(
      groups.length > 0 ? 'ready' : 'not_configured',
      groups.length ? undefined : '暂无服务入口。',
    ),
    items: groups,
  };
}
