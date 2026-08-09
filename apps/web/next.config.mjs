import { createReleaseManifest } from '../../scripts/release-manifest.mjs';

const rawBasePath = process.env.NEXT_PUBLIC_YCT_BASE_PATH ?? process.env.YCT_BASE_PATH ?? '';
const normalizedBasePath = normalizeBasePath(rawBasePath);
const releaseManifest = createReleaseManifest({
  buildId: process.env.NEXT_PUBLIC_YCT_BUILD_ID ?? process.env.YCT_BUILD_ID,
  requirePreparedRelease: process.env.YCT_REQUIRE_PREPARED_RELEASE === 'true',
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ['@resvg/resvg-js'],
  assetPrefix: normalizedBasePath || undefined,
  env: {
    NEXT_PUBLIC_YCT_BASE_PATH: normalizedBasePath,
    NEXT_PUBLIC_YCT_RELEASE_VERSION: releaseManifest.currentVersion,
    YCT_RELEASE_MANIFEST: JSON.stringify(releaseManifest),
  },
  async headers() {
    const serviceWorkerHeaders = [
      {
        key: 'Cache-Control',
        value: 'no-store, max-age=0, must-revalidate',
      },
      {
        key: 'Pragma',
        value: 'no-cache',
      },
      {
        key: 'Expires',
        value: '0',
      },
    ];

    return [
      {
        source: '/sw.js',
        headers: serviceWorkerHeaders,
      },
      {
        source: '/:path*/sw.js',
        headers: serviceWorkerHeaders,
      },
    ];
  },
};

export default nextConfig;

function normalizeBasePath(value) {
  const trimmed = value.trim().replace(/\/+$/g, '');
  if (!trimmed || trimmed === '/') {
    return '';
  }

  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}
