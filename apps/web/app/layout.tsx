import type { Metadata, Viewport } from 'next';
import '@yct/design-tokens/tokens.css';
import { EmbeddedContextBridge } from '../components/embedded-context-bridge';
import { KeyboardShortcutBridge } from '../components/keyboard-shortcut-bridge';
import { LoginRequiredBridge } from '../components/login-required-bridge';
import { PreferenceBridge } from '../components/preference-bridge';
import { PwaBridge } from '../components/pwa-bridge';
import { appPath } from '../lib/app-paths';
import { publicSiteUrl } from '../lib/public-api';
import { createSiteMetadata, serializeJsonLd } from '../lib/site-metadata';
import './globals.css';

// 站点地址来自部署环境，确保 JSON-LD 和 metadataBase 不会在构建机上固化为 localhost。
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  ...createSiteMetadata(),
  metadataBase: new URL(publicSiteUrl('/')),
  icons: {
    icon: [
      { url: appPath('/icons/yct-logo.svg'), type: 'image/svg+xml' },
      { url: appPath('/icons/yct-logo-192.png'), sizes: '192x192', type: 'image/png' },
    ],
    shortcut: [{ url: appPath('/icons/yct-logo.svg'), type: 'image/svg+xml' }],
    apple: [{ url: appPath('/icons/yct-logo-192.png'), sizes: '192x192', type: 'image/png' }],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#168F78',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const shouldExposePwaManifest = process.env.NODE_ENV === 'production';

  return (
    <html lang="zh-CN" data-color-scheme="system" data-material-mode="balanced">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: serializeJsonLd({
              '@context': 'https://schema.org',
              '@type': 'WebSite',
              name: '雨城通',
              alternateName: 'Yuchengtong',
              url: publicSiteUrl('/'),
              description: '雨城通整合临东市服务器运营信息、地图探索、公共交通出行与生活服务。',
              potentialAction: {
                '@type': 'SearchAction',
                target: `${publicSiteUrl('/search')}?q={search_term_string}`,
                'query-input': 'required name=search_term_string',
              },
            }),
          }}
        />
        {shouldExposePwaManifest ? (
          <link rel="manifest" href={appPath('/manifest.webmanifest')} />
        ) : null}
      </head>
      <body>
        <EmbeddedContextBridge />
        <KeyboardShortcutBridge />
        <LoginRequiredBridge />
        <PreferenceBridge />
        <PwaBridge />
        {children}
      </body>
    </html>
  );
}
