import type { Metadata, Viewport } from 'next';
import '@yct/design-tokens/tokens.css';
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
  return (
    <html lang="zh-CN" data-color-scheme="system">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="manifest" href={appPath('/manifest.webmanifest')} />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
          rel="stylesheet"
        />
      </head>
      <body>
        <PreferenceBridge />
        <PwaBridge />
        {children}
      </body>
    </html>
  );
}
