const rawBasePath = process.env.NEXT_PUBLIC_YCT_BASE_PATH ?? process.env.YCT_BASE_PATH ?? '';

export const appBasePath = normalizeBasePath(rawBasePath);

export function appPath(path: string): string {
  if (isExternalOrSpecialPath(path)) {
    return path;
  }

  const cleanPath = path.replace(/^\/+/, '');
  if (!cleanPath) {
    return appBasePath ? `${appBasePath}/` : '/';
  }

  return appBasePath ? `${appBasePath}/${cleanPath}` : `/${cleanPath}`;
}

function normalizeBasePath(value: string): string {
  const trimmed = value.trim().replace(/\/+$/g, '');
  if (!trimmed || trimmed === '/') {
    return '';
  }

  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

function isExternalOrSpecialPath(path: string): boolean {
  return /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(path);
}
