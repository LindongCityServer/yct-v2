import type { MetadataRoute } from 'next';
import { readOperationsDetails } from '../lib/operations-content';
import { publicSiteUrl } from '../lib/public-api';
import { readTransitOverview } from '../lib/transit-data';

export const dynamic = 'force-dynamic';

const staticEntries: Array<{
  path: string;
  changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'];
  priority: number;
}> = [
  { path: '/', changeFrequency: 'daily', priority: 1 },
  { path: '/map', changeFrequency: 'daily', priority: 0.9 },
  { path: '/travel', changeFrequency: 'daily', priority: 0.9 },
  { path: '/travel/schedules', changeFrequency: 'hourly', priority: 0.9 },
  { path: '/services', changeFrequency: 'weekly', priority: 0.8 },
  { path: '/services/faq', changeFrequency: 'monthly', priority: 0.7 },
  { path: '/services/changelog', changeFrequency: 'weekly', priority: 0.6 },
  { path: '/services/road-materials', changeFrequency: 'monthly', priority: 0.5 },
  { path: '/services/transit-materials', changeFrequency: 'monthly', priority: 0.5 },
  { path: '/services/transit-network-health', changeFrequency: 'weekly', priority: 0.6 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [operationsResult, transitResult] = await Promise.allSettled([
    readOperationsDetails(),
    readTransitOverview(),
  ]);
  const operations = operationsResult.status === 'fulfilled' ? operationsResult.value.items : [];
  const transitLines = transitResult.status === 'fulfilled' ? transitResult.value.lines : [];

  return [
    ...staticEntries.map((entry) => ({
      url: publicSiteUrl(entry.path),
      changeFrequency: entry.changeFrequency,
      priority: entry.priority,
    })),
    ...operations.map((item) => ({
      url: publicSiteUrl(`/operations/${encodeURIComponent(item.id)}`),
      lastModified: item.publishedAt ? new Date(item.publishedAt) : undefined,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
    ...transitLines.map((line) => ({
      url: publicSiteUrl(`/map/lines/${encodeURIComponent(line.id)}`),
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
  ];
}
