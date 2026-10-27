'use client';

import { useEffect, useState } from 'react';
import { appPath } from './app-paths';
import type { WikiSearchResult } from './wiki-search';

export type WikiSearchStatus = 'idle' | 'loading' | 'ready' | 'unavailable';

/** 通过站内代理检索临东 Wiki，避免浏览器直连第三方站点。 */
export function useWikiSearch(query: string): {
  results: WikiSearchResult[];
  status: WikiSearchStatus;
} {
  const [results, setResults] = useState<WikiSearchResult[]>([]);
  const [status, setStatus] = useState<WikiSearchStatus>('idle');

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setStatus('idle');
      return undefined;
    }

    const controller = new AbortController();
    setStatus('loading');
    const timer = window.setTimeout(async () => {
      try {
        // Wiki 偶发超时，客户端再补一次重试，避免一次失败就显示 Wiki 0。
        const payload = await loadWikiResults(trimmed, controller.signal);
        if (controller.signal.aborted) {
          return;
        }
        if (!payload) {
          setResults([]);
          setStatus('unavailable');
          return;
        }
        setResults(Array.isArray(payload.results) ? payload.results : []);
        setStatus('ready');
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setResults([]);
          setStatus('unavailable');
        }
      }
    }, 300);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  return { results, status };
}

async function loadWikiResults(
  query: string,
  signal: AbortSignal,
): Promise<{ results?: WikiSearchResult[] } | undefined> {
  const params = new URLSearchParams({ q: query });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(appPath(`/api/search/wiki?${params.toString()}`), {
        cache: 'no-store',
        signal,
      });
      if (response.ok) {
        return (await response.json()) as { results?: WikiSearchResult[] };
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw error;
      }
    }
  }
  return undefined;
}
