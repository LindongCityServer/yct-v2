import type { Metadata, Viewport } from 'next';
import '@yct/design-tokens/tokens.css';
import { EmbeddedContextBridge } from '../components/embedded-context-bridge';
import { KeyboardShortcutBridge } from '../components/keyboard-shortcut-bridge';
import { LoginRequiredBridge } from '../components/login-required-bridge';
import { PreferenceBridge } from '../components/preference-bridge';
import { PwaBridge } from '../components/pwa-bridge';
import { ToastViewport } from '../components/toast-viewport';
import { appPath } from '../lib/app-paths';
import { publicSiteUrl } from '../lib/public-api';
import {
  createSiteMetadata,
  getSiteDescription,
  getSiteName,
  resolveRequestLocale,
  serializeJsonLd,
} from '../lib/site-metadata';
import './globals.css';

// 站点地址来自部署环境，确保 JSON-LD 和 metadataBase 不会在构建机上固化为 localhost。
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await resolveRequestLocale();
  return {
    ...createSiteMetadata(locale),
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
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#168F78',
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const shouldExposePwaManifest = process.env.NODE_ENV === 'production';
  const locale = await resolveRequestLocale();
  const siteName = getSiteName(locale);

  return (
    <html lang={locale} data-color-scheme="system" data-material-mode="balanced">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: serializeJsonLd({
              '@context': 'https://schema.org',
              '@type': 'WebSite',
              name: siteName,
              alternateName: 'Yuchengtong',
              url: publicSiteUrl('/'),
              description: getSiteDescription(locale),
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
        <ToastViewport />
        {children}
      </body>
    </html>
  );
}
