import { z } from 'zod';

export const localeCodeSchema = z.enum(['zh-CN', 'zh-Hant', 'en']);
export const localePreferenceValueSchema = z.enum(['system', 'zh-CN', 'zh-Hant', 'en']);

export const localePreferenceSchema = z.object({
  locale: localePreferenceValueSchema,
});

export const entityTranslationUpdateSchema = z.object({
  entityKind: z.enum(['map_marker', 'transit_line', 'transit_station']),
  entityId: z.string().trim().min(1).max(300),
  sourceText: z.string().trim().min(1).max(300),
  localizedLabels: z.object({
    'zh-Hant': z.string().trim().max(300).optional(),
    en: z.string().trim().max(300).optional(),
  }),
});

export type LocalePreferenceInput = z.infer<typeof localePreferenceSchema>;
export type EntityTranslationUpdateInput = z.infer<typeof entityTranslationUpdateSchema>;
