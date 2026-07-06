const rawBasePath = process.env.NEXT_PUBLIC_YCT_BASE_PATH ?? process.env.YCT_BASE_PATH ?? '';
const normalizedBasePath = normalizeBasePath(rawBasePath);

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  assetPrefix: normalizedBasePath || undefined,
  env: {
    NEXT_PUBLIC_YCT_BASE_PATH: normalizedBasePath,
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
