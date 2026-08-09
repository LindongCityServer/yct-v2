import type { LocaleCode } from '@yct/contracts';

export const siteLocaleCookieName = 'yct.locale.v1';

export const supportedLocaleCodes = [
  'zh-CN',
  'zh-Hant',
  'en',
] as const satisfies readonly LocaleCode[];

export function isLocaleCode(value: string | undefined | null): value is LocaleCode {
  return supportedLocaleCodes.includes(value as LocaleCode);
}

export function resolveAcceptLanguage(value: string | null | undefined): LocaleCode {
  const candidates = (value ?? '')
    .split(',')
    .map((part) => {
      const [tag = '', qValue] = part.trim().split(';q=');
      const q = qValue ? Number(qValue) : 1;
      return { tag, q: Number.isFinite(q) ? q : 0 };
    })
    .filter((item) => item.tag)
    .sort((left, right) => right.q - left.q);

  for (const candidate of candidates) {
    const locale = resolveLocaleTag(candidate.tag);
    if (locale) {
      return locale;
    }
  }

  return 'zh-CN';
}

export function resolveLocaleTag(value: string | undefined): LocaleCode | undefined {
  const tag = value?.trim().toLowerCase();
  if (!tag) {
    return undefined;
  }

  if (
    tag === 'zh-hant' ||
    tag.startsWith('zh-tw') ||
    tag.startsWith('zh-hk') ||
    tag.startsWith('zh-mo')
  ) {
    return 'zh-Hant';
  }

  if (tag === 'zh' || tag === 'zh-cn' || tag === 'zh-sg' || tag.startsWith('zh-hans')) {
    return 'zh-CN';
  }

  if (tag === 'en' || tag.startsWith('en-')) {
    return 'en';
  }

  return undefined;
}
