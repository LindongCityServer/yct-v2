import { z } from 'zod';
import { idSchema } from './common';

const fieldKeySchema = z
  .string()
  .trim()
  .regex(/^[a-z][a-zA-Z0-9_]{0,63}$/);

export const materialCanvasSchema = z.object({
  widthM: z.number().positive().max(64),
  heightM: z.number().positive().max(64),
  pxPerMeter: z.number().int().min(16).max(1024).default(128),
  alignToTile: z.boolean().default(true),
  tileSizePx: z.number().int().min(16).max(4096).default(128),
});

export const materialTemplateFieldSchema = z
  .object({
    key: fieldKeySchema,
    label: z.string().trim().min(1).max(48),
    kind: z.enum(['text', 'number', 'select']),
    required: z.boolean().optional(),
    maxLength: z.number().int().min(1).max(1000).optional(),
    minimum: z.number().finite().optional(),
    maximum: z.number().finite().optional(),
    options: z
      .array(
        z.object({
          value: z.string().trim().min(1).max(120),
          label: z.string().trim().min(1).max(120),
        }),
      )
      .min(1)
      .max(64)
      .optional(),
    selectVariableValues: z
      .record(z.string().trim().min(1).max(120), z.record(fieldKeySchema, z.string().max(2_000)))
      .optional(),
    textFit: z
      .object({
        maxWidth: z.number().positive().max(32_768),
        fontSize: z.number().positive().max(8_192),
        defaultScaleX: z.number().positive().max(1).optional(),
        maxLetterSpacing: z.number().nonnegative().max(1_024).optional(),
        additionalFields: z
          .array(
            z.object({
              fieldKey: fieldKeySchema,
              fontSize: z.number().positive().max(8_192),
            }),
          )
          .max(8)
          .optional(),
      })
      .optional(),
    glyph: z
      .object({
        renderer: z.enum(['nostalgic_digits', 'nostalgic_address_number', 'chill_jinshu_vertical']),
        layoutWidth: z.number().positive().max(32_768),
        layoutHeight: z.number().positive().max(32_768),
        fontSize: z.number().positive().max(8_192).optional(),
        maxLetterSpacing: z.number().nonnegative().max(1_024).optional(),
        suffixFieldKey: fieldKeySchema.optional(),
      })
      .optional(),
  })
  .superRefine((field, ctx) => {
    if (field.kind === 'select' && !field.options?.length) {
      ctx.addIssue({ code: 'custom', message: '下拉字段必须提供选项。', path: ['options'] });
    }
    if (field.selectVariableValues && field.kind !== 'select') {
      ctx.addIssue({
        code: 'custom',
        message: '选择项派生变量只支持下拉字段。',
        path: ['selectVariableValues'],
      });
    }
    if (
      field.selectVariableValues &&
      field.options?.some((option) => !field.selectVariableValues?.[option.value])
    ) {
      ctx.addIssue({
        code: 'custom',
        message: '每个下拉选项都必须提供选择项派生变量。',
        path: ['selectVariableValues'],
      });
    }
    if (
      field.minimum !== undefined &&
      field.maximum !== undefined &&
      field.minimum > field.maximum
    ) {
      ctx.addIssue({ code: 'custom', message: '最小值不能大于最大值。', path: ['minimum'] });
    }
    if (field.textFit && field.kind !== 'text') {
      ctx.addIssue({
        code: 'custom',
        message: '自适应排字只支持文本字段。',
        path: ['textFit'],
      });
    }
    if (field.glyph && field.kind !== 'text') {
      ctx.addIssue({
        code: 'custom',
        message: '字形渲染只支持文本字段。',
        path: ['glyph'],
      });
    }
    if (field.glyph?.renderer === 'chill_jinshu_vertical' && !field.glyph.fontSize) {
      ctx.addIssue({
        code: 'custom',
        message: '竖排字形渲染必须指定字号。',
        path: ['glyph', 'fontSize'],
      });
    }
    if (field.glyph?.renderer === 'nostalgic_address_number' && !field.glyph.suffixFieldKey) {
      ctx.addIssue({
        code: 'custom',
        message: '怀旧门牌组合字形必须指定附标字段。',
        path: ['glyph', 'suffixFieldKey'],
      });
    }
  });

export const materialTypographyProfileSchema = z.object({
  designSpeedFieldKey: fieldKeySchema,
  rules: z
    .array(
      z
        .object({
          minDesignSpeedKph: z.number().nonnegative().max(400),
          maxDesignSpeedKph: z.number().nonnegative().max(400),
          primaryTextHeightMm: z.number().positive().max(2000),
          secondaryTextHeightMm: z.number().positive().max(2000).optional(),
          captionTextHeightMm: z.number().positive().max(2000).optional(),
        })
        .refine((rule) => rule.minDesignSpeedKph <= rule.maxDesignSpeedKph, {
          message: '设计时速下限不能大于上限。',
          path: ['minDesignSpeedKph'],
        }),
    )
    .min(1)
    .max(32),
});

export const materialTemplateDraftSchema = z
  .object({
    title: z.string().trim().min(1).max(100),
    description: z.string().trim().max(500).optional(),
    family: z.enum(['road_sign', 'address_sign', 'bus_stop', 'custom']),
    // Figma 导出的精确 SVG 路径可能超过 160 KiB，例如复杂公交站牌详情模板。
    source: z.string().trim().min(1).max(384_000),
    fields: z.array(materialTemplateFieldSchema).min(1).max(80),
    typographyProfile: materialTypographyProfileSchema.optional(),
    defaultCanvas: materialCanvasSchema,
  })
  .superRefine((template, ctx) => {
    for (const [fieldIndex, field] of template.fields.entries()) {
      for (const [additionalIndex, additional] of (
        field.textFit?.additionalFields ?? []
      ).entries()) {
        const referencedField = template.fields.find(
          (candidate) => candidate.key === additional.fieldKey,
        );
        if (
          additional.fieldKey === field.key ||
          !referencedField ||
          referencedField.kind !== 'text'
        ) {
          ctx.addIssue({
            code: 'custom',
            message: '参与组合排字的附加字段必须引用另一个文本字段。',
            path: ['fields', fieldIndex, 'textFit', 'additionalFields', additionalIndex],
          });
        }
      }
      const suffixFieldKey = field.glyph?.suffixFieldKey;
      if (suffixFieldKey) {
        const referencedField = template.fields.find(
          (candidate) => candidate.key === suffixFieldKey,
        );
        if (suffixFieldKey === field.key || !referencedField || referencedField.kind !== 'text') {
          ctx.addIssue({
            code: 'custom',
            message: '组合字形的附标字段必须引用另一个文本字段。',
            path: ['fields', fieldIndex, 'glyph', 'suffixFieldKey'],
          });
        }
      }
    }

    if (
      template.typographyProfile &&
      !template.fields.some(
        (field) => field.key === template.typographyProfile?.designSpeedFieldKey,
      )
    ) {
      ctx.addIssue({
        code: 'custom',
        message: '字体规则引用的设计时速字段不存在。',
        path: ['typographyProfile', 'designSpeedFieldKey'],
      });
    }

    if (template.typographyProfile) {
      const sortedRules = [...template.typographyProfile.rules].sort(
        (left, right) => left.minDesignSpeedKph - right.minDesignSpeedKph,
      );
      for (let index = 1; index < sortedRules.length; index += 1) {
        if (sortedRules[index].minDesignSpeedKph <= sortedRules[index - 1].maxDesignSpeedKph) {
          ctx.addIssue({
            code: 'custom',
            message: '设计时速字高规则不能重叠。',
            path: ['typographyProfile', 'rules'],
          });
          break;
        }
      }
    }
  });

export const materialTemplateRevisionSchema = materialTemplateDraftSchema.extend({
  baseVersion: z.number().int().positive(),
});

export const materialDraftInputSchema = z.object({
  templateId: idSchema,
  templateVersion: z.number().int().positive(),
  input: z.record(fieldKeySchema, z.string().max(2000)),
  canvas: materialCanvasSchema,
});

export const materialReviewDecisionSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  reason: z.string().trim().max(500).optional(),
});

export const materialServerSourceSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('transit_line'),
    lineId: idSchema,
    stationSourceId: idSchema.optional(),
  }),
  z.object({
    kind: z.literal('transit_station'),
    stationMarkerId: idSchema,
    direction: z.enum(['east', 'west', 'north', 'south']),
    lineIds: z.array(idSchema).min(1).max(12),
    terminalRole: z.enum(['origin', 'terminal']).optional(),
  }),
  z.object({
    kind: z.literal('map_location'),
    locationId: idSchema,
  }),
  z.object({
    kind: z.literal('road_coordinate'),
    x: z.number().finite().min(-30_000_000).max(30_000_000),
    z: z.number().finite().min(-30_000_000).max(30_000_000),
  }),
]);

export const materialExportRequestSchema = z
  .object({
    mode: z.enum(['server', 'custom']),
    draftId: idSchema.optional(),
    templateId: idSchema.optional(),
    templateVersion: z.number().int().positive().optional(),
    canvas: materialCanvasSchema.optional(),
    source: materialServerSourceSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.mode === 'custom' && !value.draftId) {
      ctx.addIssue({ code: 'custom', message: '自定义导出必须指定物料草稿。', path: ['draftId'] });
    }
    if (value.mode === 'server' && (!value.templateId || !value.templateVersion || !value.source)) {
      ctx.addIssue({ code: 'custom', message: '服务器导出必须指定模板和真实数据来源。' });
    }
  });

export const materialPreviewRequestSchema = z
  .object({
    mode: z.enum(['manual', 'server']),
    templateId: idSchema,
    templateVersion: z.number().int().positive(),
    canvas: materialCanvasSchema,
    input: z.record(fieldKeySchema, z.string().max(2000)).optional(),
    source: materialServerSourceSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.mode === 'manual' && !value.input) {
      ctx.addIssue({ code: 'custom', message: '手动预览必须提供字段输入。', path: ['input'] });
    }
    if (value.mode === 'server' && !value.source) {
      ctx.addIssue({
        code: 'custom',
        message: '服务器预览必须指定真实数据来源。',
        path: ['source'],
      });
    }
  });

export type MaterialTemplateDraftInput = z.infer<typeof materialTemplateDraftSchema>;
export type MaterialDraftInput = z.infer<typeof materialDraftInputSchema>;
export type MaterialExportRequestInput = z.infer<typeof materialExportRequestSchema>;
export type MaterialPreviewRequestInput = z.infer<typeof materialPreviewRequestSchema>;
export type MaterialServerSourceInput = z.infer<typeof materialServerSourceSchema>;
