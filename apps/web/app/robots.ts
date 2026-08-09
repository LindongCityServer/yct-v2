import type { MetadataRoute } from 'next';
import { appPath } from '../lib/app-paths';
import { publicSiteUrl } from '../lib/public-api';

// 站点地址来自部署环境，不能在本地打包阶段固化。
export const dynamic = 'force-dynamic';

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
