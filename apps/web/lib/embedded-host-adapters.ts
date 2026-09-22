/**
 * 嵌入式宿主（网页桌面 / Web Desktop 容器）适配层。
 *
 * 「嵌入模式」本身与具体产品无关：只要本站被放进跨站 iframe，
 * 就需要「顶层弹窗登录 + `SameSite=None` 会话 Cookie」这一套通用编排，
 * 相关实现见 `client-embedded-auth.ts`、`embedded-auth-protocol.ts`。
 *
 * 宿主专属能力（例如某个宿主特有的存储统计握手）不属于通用层：
 * 每个宿主实现一个 `EmbeddedHostAdapter`，由 `EmbeddedHostBridges` 按需挂载。
 * 没有任何专属协议的宿主什么都不用做，也能获得完整的嵌入登录能力。
 */

export interface EmbeddedHostAdapter {
  /** 稳定标识，用于调试定位，例如 `some-desktop`。 */
  readonly id: string;
  /**
   * 该宿主允许的来源，用于校验它发来的 postMessage。
   *
   * 跨源 iframe 读不到 `window.top.location`，因此宿主身份只能靠来源白名单，
   * 或由宿主主动 postMessage 自报。
   */
  resolveOrigins(): Set<string>;
}

/**
 * 读取通用宿主来源配置。
 *
 * 宿主数量不定，因此用一份逗号分隔的来源列表统一配置；
 * 未配置时退回该适配器自带的默认来源。
 *
 * 调用方需要直接写 `process.env.NEXT_PUBLIC_*` 字面量，Next 才会在构建期内联。
 */
export function resolveConfiguredEmbedHostOrigins(
  configured: string | undefined,
  fallback: readonly string[],
): Set<string> {
  const origins = (configured ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  return new Set(origins.length > 0 ? origins : fallback);
}
