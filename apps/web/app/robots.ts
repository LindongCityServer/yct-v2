import type { MetadataRoute } from 'next';
import { appPath } from '../lib/app-paths';
import { publicSiteUrl } from '../lib/public-api';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: [appPath('/'), appPath('/api/v1/public')],
      disallow: [
        appPath('/account'),
        appPath('/admin'),
        appPath('/auth'),
        appPath('/offline'),
        appPath('/search'),
        appPath('/api'),
      ],
    },
    sitemap: publicSiteUrl('/sitemap.xml'),
    host: new URL(publicSiteUrl('/')).origin,
  };
}
