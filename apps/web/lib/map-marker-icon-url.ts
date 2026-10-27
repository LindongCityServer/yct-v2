import { appPath } from './app-paths';

/**
 * 把地图快照里的 iconFileName 解析成可直接用于 <img> 的地址。
 * 与地图端 toMarkerIconUrl 的规则保持一致：绝对地址原样使用，站内路径补 basePath，其余拼接图源地址。
 */
export function resolveMapMarkerIconUrl(
  fileName: string | undefined,
  baseUrl: string | undefined,
): string | undefined {
  const name = fileName?.trim();
  if (!name) {
    return undefined;
  }

  if (/^https?:\/\//i.test(name)) {
    return name;
  }

  if (name.startsWith('/')) {
    return appPath(name);
  }

  if (!baseUrl) {
    return undefined;
  }

  try {
    return new URL(name.replace(/^\/+/, ''), baseUrl).toString();
  } catch {
    return undefined;
  }
}
