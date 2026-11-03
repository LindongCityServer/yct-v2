/** 分享卡片简介最多展示的字符数（按 Unicode 码点计，中文与 emoji 都算 1 个）。 */
export const mapShareDescriptionMaxLength = 180;

/**
 * 分享卡片简介：折叠空白、去掉首尾空格，超长时截断并以省略号结尾。
 * 结果只包含纯文本，调用方按普通文本区块渲染，不再包胶囊。
 */
export function buildMapShareDescription(raw: string | null | undefined): string | undefined {
  const normalized = (raw ?? '').replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return undefined;
  }

  const characters = Array.from(normalized);
  if (characters.length <= mapShareDescriptionMaxLength) {
    return normalized;
  }

  return `${characters.slice(0, mapShareDescriptionMaxLength - 1).join('').trimEnd()}…`;
}
