import { z } from 'zod';

export const localeCodeSchema = z.enum(['zh-CN', 'zh-Hant', 'en']);
export const localePreferenceValueSchema = z.enum(['system', 'zh-CN', 'zh-Hant', 'en']);

export const localePreferenceSchema = z.object({
  locale: localePreferenceValueSchema,
});

export type LocalePreferenceInput = z.infer<typeof localePreferenceSchema>;
