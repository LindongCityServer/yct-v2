import { z } from 'zod';

export const idSchema = z.string().trim().min(1).max(128);
export const isoDateTimeSchema = z.string().datetime({ offset: true });
export const urlSchema = z.string().url();

export const nonEmptyTextSchema = z.string().trim().min(1).max(200);

export const markdownSchema = z
  .string()
  .min(1)
  .max(120_000)
  .refine((value) => !/<script[\s>]/i.test(value), 'Markdown 内容不能包含 script 标签')
  .refine((value) => !/<iframe[\s>]/i.test(value), 'Markdown 内容不能包含 iframe 标签');
