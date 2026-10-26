import { networkInterfaces } from 'node:os';
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
  // Next 16 默认拦截局域网 IP 对 /_next 资源与 HMR 的跨源请求。
  // 自动收集本机网卡 IPv4，并允许用 YCT_DEV_ORIGINS（逗号分隔）追加其他主机。
  allowedDevOrigins: resolveAllowedDevOrigins(),
  images: {
    // LQIP 阶梯使用 32/64/128/256/512/1024；512 与 1024 需要显式加入允许宽度。
    deviceSizes: [512, 640, 750, 828, 1024, 1080, 1200, 1920, 2048, 3840],
    // 远程内容图只放行已知来源，避免把优化器变成开放图片代理。
    remotePatterns: [
      { protocol: 'https', hostname: 'minotar.net' },
      { protocol: 'https', hostname: 'mc-heads.net' },
      { protocol: 'https', hostname: 'shangxiaoguan.top' },
      { protocol: 'https', hostname: '**.shangxiaoguan.top' },
    ],
  },
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

function resolveAllowedDevOrigins() {
  const configured = (process.env.YCT_DEV_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  // 本机用 127.0.0.1 / localhost 访问时也要允许 dev 资源与 HMR，
  // 否则 Next 会拒绝 HMR WebSocket，页面可能停在未 hydrate 状态。
  const localOrigins = ['localhost', '127.0.0.1'];
  const localAddresses = Object.values(networkInterfaces())
    .flat()
    .filter(
      (address) =>
        address && !address.internal && (address.family === 'IPv4' || address.family === 4),
    )
    .map((address) => address.address)
    .filter((address) => !address.startsWith('169.254.'));

  return [...new Set([...localOrigins, ...configured, ...localAddresses])];
}

function normalizeBasePath(value) {
  const trimmed = value.trim().replace(/\/+$/g, '');
  if (!trimmed || trimmed === '/') {
    return '';
  }

  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}
