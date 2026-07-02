import type { MetadataRoute } from 'next';
import { appPath } from '../lib/app-paths';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '雨城通',
    short_name: 'YCT',
    description: '雨城通 Yuchengtong',
    start_url: appPath('/'),
    scope: appPath('/'),
    display: 'standalone',
    background_color: '#F7F8F8',
    theme_color: '#168F78',
    icons: [
      {
        src: appPath('/icons/yct-icon-192.png'),
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: appPath('/icons/yct-icon-512.png'),
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: appPath('/icons/yct-icon-maskable.png'),
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
