import type { Metadata, Viewport } from 'next';
import '@yct/design-tokens/tokens.css';
import { EmbeddedContextBridge } from '../components/embedded-context-bridge';
import { PreferenceBridge } from '../components/preference-bridge';
import { PwaBridge } from '../components/pwa-bridge';
import { appPath } from '../lib/app-paths';
import './globals.css';

export const metadata: Metadata = {
  applicationName: 'Yuchengtong',
  title: {
    default: '雨城通',
    template: '%s - 雨城通',
  },
  description: '雨城通 Yuchengtong',
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
    <html lang="zh-CN" data-color-scheme="system">
      <head>
        {shouldExposePwaManifest ? (
          <link rel="manifest" href={appPath('/manifest.webmanifest')} />
        ) : null}
      </head>
      <body>
        <EmbeddedContextBridge />
        <PreferenceBridge />
        <PwaBridge />
        {children}
      </body>
    </html>
  );
}
