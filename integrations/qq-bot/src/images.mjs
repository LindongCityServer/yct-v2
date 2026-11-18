/**
 * 从问一问引用里挑一张可以安全发给 QQ 的图片。
 * 目前只有运营内容会带 coverImageUrl；必须是 HTTPS，且在允许的域名内。
 */

export function pickReferenceImage({
  references = [],
  enabled = true,
  publicBaseUrl = '',
  hosts = new Set(),
} = {}) {
  if (!enabled || !publicBaseUrl) {
    return null;
  }

  const allowed = new Set(hosts);
  try {
    allowed.add(new URL(publicBaseUrl).host);
  } catch {
    return null;
  }

  for (const reference of references) {
    const raw = typeof reference?.imageUrl === 'string' ? reference.imageUrl.trim() : '';
    if (!raw) {
      continue;
    }
    let url;
    try {
      url = new URL(raw, publicBaseUrl);
    } catch {
      continue;
    }
    if (url.protocol !== 'https:') {
      continue;
    }
    if (!allowed.has(url.host)) {
      continue;
    }
    return url.toString();
  }

  return null;
}
