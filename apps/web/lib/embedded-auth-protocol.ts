/**
 * 嵌入模式登录：完成页 ↔ iframe 的 postMessage 协议。
 *
 * 两侧（服务端渲染的完成页、客户端监听器）必须逐字段一致，
 * 因此单独抽出来共享，而不是各写一份字符串。
 */

export const embeddedAuthMessageSource = 'yct-embedded-auth';
export const embeddedAuthMessageType = 'yct:embedded-auth-result';
export const embeddedAuthMessageVersion = 1;

export interface EmbeddedAuthMessage {
  source: typeof embeddedAuthMessageSource;
  type: typeof embeddedAuthMessageType;
  version: number;
  ok: boolean;
  status: string;
}

/** 判定某个回调结果码是否代表「已成功建立会话」。 */
export function isEmbeddedAuthSuccessStatus(status: string): boolean {
  return status === 'login_success' || status === 'readonly';
}
