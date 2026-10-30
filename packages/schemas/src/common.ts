import { z } from 'zod';

export const idSchema = z.string().trim().min(1).max(128);
export const isoDateTimeSchema = z.string().datetime({ offset: true });
export const urlSchema = z.string().url();

/** Only absolute web links are suitable for user-configured external navigation. */
export function getSafeHttpUrl(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || !/^https?:\/\//i.test(trimmed) || /[\u0000-\u0020\u007f]/.test(trimmed)) {
    return undefined;
  }
  try {
    const url = new URL(trimmed);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname
      ? trimmed
      : undefined;
  } catch {
    return undefined;
  }
}

/** Empty text explicitly clears an optional URL; omission preserves an existing value. */
export const optionalHttpUrlSchema = z
  .string()
  .trim()
  .max(2000)
  .refine((value) => !value || Boolean(getSafeHttpUrl(value)), '请填写有效的 http/https 完整网址')
  .optional();

export const nonEmptyTextSchema = z.string().trim().min(1).max(200);

export const markdownSchema = z
  .string()
  .min(1)
  .max(120_000)
  .refine((value) => value.trim().length > 0, 'Markdown 内容不能为空白')
  .refine((value) => !/<script[\s>]/i.test(value), 'Markdown 内容不能包含 script 标签')
  .refine((value) => !/<iframe[\s>]/i.test(value), 'Markdown 内容不能包含 iframe 标签');
