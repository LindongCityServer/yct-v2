export const wikiBaseUrl = 'https://wiki.shangxiaoguan.top';
const defaultLimit = 5;
// Wiki 偶发慢响应，单次 2.5 秒会误伤正常查询；重试一次并放宽超时。
const requestTimeoutMs = 4000;
const thumbnailTimeoutMs = 2500;
const requestAttempts = 2;
const cacheTtlMs = 5 * 60 * 1000;
const maximumCacheEntries = 100;

export interface WikiSearchResult {
  title: string;
  href: string;
  snippet: string;
  updatedAt: string;
  /** 条目首图，用于搜索结果缩略图；没有首图时为 undefined。 */
  thumbnailUrl?: string;
}

interface WikiSearchResponse {
  query?: {
    search?: Array<{
      title?: string;
      snippet?: string;
      timestamp?: string;
    }>;
  };
}

interface WikiThumbnailResponse {
  query?: {
    pages?: Record<
      string,
      { title?: string; thumbnail?: { source?: string; width?: number; height?: number } }
    >;
  };
}

const cache = new Map<string, { expiresAt: number; results: WikiSearchResult[] }>();

/** 查询临东 Wiki（MediaWiki）。失败时返回空数组，不阻塞站内检索。 */
export async function searchWiki(query: string, limit = defaultLimit): Promise<WikiSearchResult[]> {
  const normalizedQuery = query.trim();
  if (normalizedQuery.length < 2) {
    return [];
  }

  const cacheKey = `${normalizedQuery.toLocaleLowerCase()}|${limit}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.results;
  }

  const params = new URLSearchParams({
    action: 'query',
    list: 'search',
    srsearch: normalizedQuery,
    srlimit: String(limit),
    srnamespace: '0',
    srprop: 'snippet|timestamp',
    format: 'json',
  });

  for (let attempt = 0; attempt < requestAttempts; attempt += 1) {
    const results = await requestWikiResults(params);
    if (results) {
      // 首图单独查询，失败时保留纯文本结果，不阻塞搜索。
      const thumbnails = await requestWikiThumbnails(results.map((item) => item.title));
      const enriched = results.map((item) => ({
        ...item,
        thumbnailUrl: thumbnails.get(normalizeWikiTitle(item.title)),
      }));

      cache.set(cacheKey, { expiresAt: Date.now() + cacheTtlMs, results: enriched });
      if (cache.size > maximumCacheEntries) {
        const oldestKey = cache.keys().next().value;
        if (oldestKey) {
          cache.delete(oldestKey);
        }
      }
      return enriched;
    }
  }

  return [];
}

/** 单次请求；失败返回 undefined，由外层决定是否重试。 */
async function requestWikiResults(
  params: URLSearchParams,
): Promise<WikiSearchResult[] | undefined> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

  try {
    const response = await fetch(`${wikiBaseUrl}/api.php?${params.toString()}`, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'YuchengtongSearch/1.0 (+https://yct.local)',
      },
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!response.ok) {
      return undefined;
    }

    const payload = (await response.json()) as WikiSearchResponse;
    return (payload.query?.search ?? [])
      .map((item) => {
        const title = typeof item.title === 'string' ? item.title.trim() : '';
        if (!title) {
          return null;
        }

        return {
          title,
          href: `${wikiBaseUrl}/${encodeURIComponent(title.replace(/ /g, '_'))}`,
          snippet: typeof item.snippet === 'string' ? cleanWikiSnippet(item.snippet) : '',
          updatedAt: typeof item.timestamp === 'string' ? item.timestamp : '',
        } satisfies WikiSearchResult;
      })
      .filter((item): item is WikiSearchResult => item !== null);
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}

/** 批量查条目首图；失败返回空表，不影响搜索结果本身。 */
async function requestWikiThumbnails(titles: string[]): Promise<Map<string, string>> {
  const thumbnails = new Map<string, string>();
  if (titles.length === 0) {
    return thumbnails;
  }

  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    prop: 'pageimages',
    piprop: 'thumbnail',
    pithumbsize: '480',
    titles: titles.join('|'),
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), thumbnailTimeoutMs);

  try {
    const response = await fetch(`${wikiBaseUrl}/api.php?${params.toString()}`, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'YuchengtongSearch/1.0 (+https://yct.local)',
      },
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!response.ok) {
      return thumbnails;
    }

    const payload = (await response.json()) as WikiThumbnailResponse;
    for (const page of Object.values(payload.query?.pages ?? {})) {
      const title = typeof page.title === 'string' ? page.title : '';
      const source = page.thumbnail?.source;
      if (title && typeof source === 'string' && source) {
        thumbnails.set(normalizeWikiTitle(title), source);
      }
    }
    return thumbnails;
  } catch {
    return thumbnails;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeWikiTitle(value: string): string {
  return value.replace(/_/g, ' ').trim();
}

function cleanWikiSnippet(value: string): string {
  return decodeHtmlEntities(value)
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, '$2')
    .replace(/\[https?:\/\/[^\s\]]+\s+([^\]]+)\]/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 320);
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}
