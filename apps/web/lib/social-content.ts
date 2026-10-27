import { scoreSearchMatch } from './text-search';

export type SocialTopic = 'transit' | 'operations' | 'place';

export interface SocialPost {
  id: string;
  platform: 'bilibili';
  title: string;
  text: string;
  href: string;
  publishedAt: string;
  topics: SocialTopic[];
}

const bilibiliDynamicUrl =
  'https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/space?host_mid=106279202';
const requestTimeoutMs = 2200;
const cacheTtlMs = 10 * 60 * 1000;

/**
 * B站接口在高频访问时会返回 412，且图片动态没有正文。
 * 这里保留一份已发布内容的快照，接口可用时再用最新动态覆盖。
 */
const socialPostSnapshot: SocialPost[] = [
  {
    id: '1154087979101192213',
    platform: 'bilibili',
    title: '【MCBE临东市】我在公交车后屏搞了联动',
    text: '我在《我的世界》公交车上装了转向灯。本视频仅为效果展示，车体模仿沈阳 XMQ6127AGPHEVN52 车型，车尾屏支持与转向灯和车门的联动，该车型将在个人服务器的 170 路、K881 路投入运营。',
    href: 'https://t.bilibili.com/1154087979101192213',
    publishedAt: '2026-01-04T16:50:47.000Z',
    topics: ['transit'],
  },
  {
    id: '1239388628039237652',
    platform: 'bilibili',
    title: '【MCBE临东市】晨光中追风逐浪，但是临东十周年混剪',
    text: '临东十周年混剪，感谢 @flijo 制作视频。我们 2036 年再见。',
    href: 'https://t.bilibili.com/1239388628039237652',
    publishedAt: '2026-08-22T13:40:52.000Z',
    topics: ['operations'],
  },
];

let cache: { expiresAt: number; posts: SocialPost[] } | null = null;

/** 读取官方 B 站动态；接口不可用时回退到内置快照。 */
export async function readSocialPosts(): Promise<SocialPost[]> {
  if (cache && cache.expiresAt > Date.now()) {
    return cache.posts;
  }

  const fetched = await fetchBilibiliPosts();
  const posts = mergePosts(fetched, socialPostSnapshot);
  cache = { expiresAt: Date.now() + cacheTtlMs, posts };
  return posts;
}

/** 按关键词或主题挑选与问题相关的动态，最多两条。 */
export function rankSocialPosts(posts: SocialPost[], query: string, limit = 2): SocialPost[] {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    return [];
  }

  const scored = posts
    .map((post) => ({
      post,
      score: scoreSearchMatch(`${post.title} ${post.text}`, normalizedQuery),
    }))
    .filter((entry) => entry.score >= 6)
    .sort(
      (left, right) =>
        right.score - left.score ||
        Date.parse(right.post.publishedAt) - Date.parse(left.post.publishedAt),
    )
    .map((entry) => entry.post);

  if (scored.length > 0) {
    return scored.slice(0, limit);
  }

  const topic = detectTopic(normalizedQuery);
  if (!topic) {
    return [];
  }

  return posts
    .filter((post) => post.topics.includes(topic))
    .sort((left, right) => Date.parse(right.publishedAt) - Date.parse(left.publishedAt))
    .slice(0, 1);
}

function detectTopic(query: string): SocialTopic | undefined {
  if (/公交|地铁|线路|站点|班次|交通|车辆|转向灯|轮渡|客运/.test(query)) {
    return 'transit';
  }
  if (/运营|停运|公告|活动|周年|十周年/.test(query)) {
    return 'operations';
  }
  if (/地点|地图|怎么走|在哪/.test(query)) {
    return 'place';
  }
  return undefined;
}

async function fetchBilibiliPosts(): Promise<SocialPost[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

  try {
    const response = await fetch(bilibiliDynamicUrl, {
      headers: {
        Accept: 'application/json',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        Referer: 'https://space.bilibili.com/106279202/dynamic',
      },
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!response.ok) {
      return [];
    }

    const payload = (await response.json()) as BilibiliDynamicResponse;
    return (payload.data?.items ?? [])
      .map((item) => toSocialPost(item))
      .filter((post): post is SocialPost => post !== null);
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

function toSocialPost(item: BilibiliDynamicItem): SocialPost | null {
  const id = item.id_str?.trim();
  const text = extractText(item);
  const publishedAt = item.modules?.module_author?.pub_ts;
  if (!id || !text || !publishedAt) {
    return null;
  }

  const timestamp = Number(publishedAt);
  if (!Number.isFinite(timestamp)) {
    return null;
  }

  const title = text.length > 60 ? `${text.slice(0, 58)}…` : text;

  return {
    id,
    platform: 'bilibili',
    title,
    text,
    href: `https://t.bilibili.com/${id}`,
    publishedAt: new Date(timestamp * 1000).toISOString(),
    topics: detectPostTopics(text),
  };
}

function extractText(item: BilibiliDynamicItem): string {
  const dynamic = item.modules?.module_dynamic;
  const parts = [
    dynamic?.desc?.text,
    dynamic?.major?.archive?.title,
    dynamic?.major?.archive?.desc,
    dynamic?.major?.opus?.title,
    dynamic?.major?.opus?.summary?.text,
    dynamic?.major?.article?.title,
    dynamic?.major?.article?.desc,
  ];

  return parts
    .filter((part): part is string => typeof part === 'string')
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('。')
    .slice(0, 400);
}

function detectPostTopics(text: string): SocialTopic[] {
  const topics: SocialTopic[] = [];
  if (/公交|地铁|线路|车辆|站点|班次|交通|转向灯/.test(text)) {
    topics.push('transit');
  }
  if (/运营|公告|活动|周年|十周年|停运/.test(text)) {
    topics.push('operations');
  }
  return topics;
}

function mergePosts(fetched: SocialPost[], fallback: SocialPost[]): SocialPost[] {
  const byId = new Map<string, SocialPost>();
  for (const post of fallback) {
    byId.set(post.id, post);
  }
  for (const post of fetched) {
    byId.set(post.id, post);
  }
  return [...byId.values()].sort(
    (left, right) => Date.parse(right.publishedAt) - Date.parse(left.publishedAt),
  );
}

interface BilibiliDynamicResponse {
  data?: {
    items?: BilibiliDynamicItem[];
  };
}

interface BilibiliDynamicItem {
  id_str?: string;
  modules?: {
    module_author?: { pub_ts?: string | number };
    module_dynamic?: {
      desc?: { text?: string };
      major?: {
        archive?: { title?: string; desc?: string };
        opus?: { title?: string; summary?: { text?: string } };
        article?: { title?: string; desc?: string };
      };
    };
  };
}
