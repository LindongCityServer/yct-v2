const wikiBaseUrl = 'https://wiki.shangxiaoguan.top';
const defaultLimit = 5;
const requestTimeoutMs = 2500;
const cacheTtlMs = 5 * 60 * 1000;
const maximumCacheEntries = 100;

export interface WikiSearchResult {
  title: string;
  href: string;
  snippet: string;
  updatedAt: string;
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
      return [];
    }

    const payload = (await response.json()) as WikiSearchResponse;
    const results = (payload.query?.search ?? [])
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

    cache.set(cacheKey, { expiresAt: Date.now() + cacheTtlMs, results });
    if (cache.size > maximumCacheEntries) {
      const oldestKey = cache.keys().next().value;
      if (oldestKey) {
        cache.delete(oldestKey);
      }
    }
    return results;
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
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
