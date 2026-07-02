const rawBasePath = process.env.NEXT_PUBLIC_YCT_BASE_PATH ?? process.env.YCT_BASE_PATH ?? '';
const normalizedBasePath = normalizeBasePath(rawBasePath);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  assetPrefix: normalizedBasePath || undefined,
  env: {
    NEXT_PUBLIC_YCT_BASE_PATH: normalizedBasePath,
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
