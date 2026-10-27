import { appPath } from './app-paths';

/** 搜索结果的图片地址：外链/内联地址原样使用，站内路径补 basePath。 */
export function resolveSearchImageSrc(value: string): string {
  return /^(?:https?:|data:|blob:)/i.test(value) ? value : appPath(value);
}
