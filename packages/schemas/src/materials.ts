import { z } from 'zod';
import { idSchema } from './common';

const fieldKeySchema = z
  .string()
  .trim()
  .regex(/^[a-z][a-zA-Z0-9_]{0,63}$/);
const materialColorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/);
const materialInputRecordSchema = z.record(fieldKeySchema, z.string().max(16_000));

export const materialCanvasMaxLongSidePx = 4096;
export const materialCanvasMaxPxPerMeter = 4096;

export const materialCanvasSchema = z
  .object({
    widthM: z.number().positive('画布宽度必须大于 0').max(64, '画布宽度不能超过 64 米'),
    heightM: z.number().positive('画布高度必须大于 0').max(64, '画布高度不能超过 64 米'),
    pxPerMeter: z
      .number()
      .int('每米像素数必须是整数')
      .min(16, '每米像素数不能小于 16')
      .max(materialCanvasMaxPxPerMeter, `每米像素数不能大于 ${materialCanvasMaxPxPerMeter}`)
      .default(128),
    alignToTile: z.boolean().default(true),
    tileSizePx: z
      .number()
      .int('对齐单位必须是整数')
      .min(16, '对齐单位不能小于 16')
      .max(4096, '对齐单位不能大于 4096')
      .default(128),
  })
  .superRefine((canvas, ctx) => {
    const widthPx = resolveSchemaOutputSide(canvas.widthM, canvas);
    const heightPx = resolveSchemaOutputSide(canvas.heightM, canvas);
    const longSidePx = Math.max(widthPx, heightPx);
    if (longSidePx > materialCanvasMaxLongSidePx) {
      ctx.addIssue({
        code: 'custom',
        message: `画布最长边不能超过 ${materialCanvasMaxLongSidePx} 像素（当前 ${longSidePx} 像素），请降低每米像素数或缩小画布。`,
        path: ['pxPerMeter'],
      });
    }
  });

function resolveSchemaOutputSide(
  meters: number,
  canvas: { pxPerMeter: number; alignToTile: boolean; tileSizePx: number },
): number {
  const contentPx = Math.max(1, Math.round(meters * canvas.pxPerMeter));
  const tileSizePx = Math.max(1, canvas.tileSizePx);
  return canvas.alignToTile ? Math.ceil(contentPx / tileSizePx) * tileSizePx : contentPx;
}

export const materialTemplateFieldSchema = z
  .object({
    key: fieldKeySchema,
    label: z.string().trim().min(1).max(48),
    kind: z.enum(['text', 'number', 'select', 'color']),
    required: z.boolean().optional(),
    defaultValue: z.string().max(16_000).optional(),
    userEditable: z.boolean().optional(),
    serverOverride: z.boolean().optional(),
    maxLength: z.number().int().min(1).max(16_000).optional(),
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
        renderer: z.enum([
          'nostalgic_digits',
          'nostalgic_address_number',
          'chill_jinshu_vertical',
          'transit_station_list',
          'transit_horizontal_station_list',
          'transit_route_map',
          'metro_wayfinding',
          'metro_line_map_modern',
          'metro_line_map_classic',
          'metro_line_map_vertical_modern',
          'metro_line_map_vertical_classic',
          'metro_line_map_vertical_transition',
          'metro_station_name_modern',
          'metro_station_name_classic',
          'metro_direction_modern',
          'metro_direction_classic',
          'metro_terminus_modern',
          'metro_terminus_classic',
          'metro_platform_sign',
        ]),
        layoutWidth: z.number().positive().max(32_768),
        layoutHeight: z.number().positive().max(32_768),
        fontSize: z.number().positive().max(8_192).optional(),
        maxLetterSpacing: z.number().nonnegative().max(1_024).optional(),
        suffixFieldKey: fieldKeySchema.optional(),
        currentIndexFieldKey: fieldKeySchema.optional(),
        colorFieldKey: fieldKeySchema.optional(),
      })
      .optional(),
  })
  .superRefine((field, ctx) => {
    if (field.kind === 'select' && !field.options?.length) {
      ctx.addIssue({ code: 'custom', message: '下拉字段必须提供选项。', path: ['options'] });
    }
    if (
      field.kind === 'color' &&
      field.defaultValue &&
      !materialColorSchema.safeParse(field.defaultValue).success
    ) {
      ctx.addIssue({
        code: 'custom',
        message: '颜色默认值必须使用 #RRGGBB 格式。',
        path: ['defaultValue'],
      });
    }
    if (
      field.kind === 'select' &&
      field.defaultValue &&
      !field.options?.some((option) => option.value === field.defaultValue)
    ) {
      ctx.addIssue({
        code: 'custom',
        message: '下拉字段默认值必须属于可选项。',
        path: ['defaultValue'],
      });
    }
    if (field.serverOverride && field.userEditable === false) {
      ctx.addIssue({
        code: 'custom',
        message: '服务器覆盖字段必须允许用户编辑。',
        path: ['serverOverride'],
      });
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
    if (
      [
        'transit_station_list',
        'transit_horizontal_station_list',
        'metro_line_map_modern',
        'metro_line_map_classic',
        'metro_line_map_vertical_modern',
        'metro_line_map_vertical_classic',
        'metro_line_map_vertical_transition',
      ].includes(field.glyph?.renderer ?? '') &&
      !field.glyph?.currentIndexFieldKey
    ) {
      ctx.addIssue({
        code: 'custom',
        message: '公交站点列表字形必须指定当前站索引字段。',
        path: ['glyph', 'currentIndexFieldKey'],
      });
    }
    if (
      [
        'transit_route_map',
        'metro_line_map_modern',
        'metro_line_map_classic',
        'metro_line_map_vertical_modern',
        'metro_line_map_vertical_classic',
        'metro_line_map_vertical_transition',
        'metro_station_name_modern',
        'metro_station_name_classic',
        'metro_direction_modern',
        'metro_direction_classic',
        'metro_terminus_modern',
        'metro_terminus_classic',
        'metro_platform_sign',
      ].includes(field.glyph?.renderer ?? '') &&
      !field.glyph?.colorFieldKey
    ) {
      ctx.addIssue({
        code: 'custom',
        message: '线路地图字形必须指定颜色字段。',
        path: ['glyph', 'colorFieldKey'],
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
    family: z.enum(['road_sign', 'address_sign', 'bus_stop', 'metro_line', 'custom']),
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
      const currentIndexFieldKey = field.glyph?.currentIndexFieldKey;
      if (currentIndexFieldKey) {
        const referencedField = template.fields.find(
          (candidate) => candidate.key === currentIndexFieldKey,
        );
        if (
          currentIndexFieldKey === field.key ||
          !referencedField ||
          (referencedField.kind !== 'number' && referencedField.kind !== 'text')
        ) {
          ctx.addIssue({
            code: 'custom',
            message: '公交站点列表字形的当前站索引字段必须是数字或文本字段。',
            path: ['fields', fieldIndex, 'glyph', 'currentIndexFieldKey'],
          });
        }
      }
      const colorFieldKey = field.glyph?.colorFieldKey;
      if (colorFieldKey) {
        const referencedField = template.fields.find(
          (candidate) => candidate.key === colorFieldKey,
        );
        if (colorFieldKey === field.key || !referencedField || referencedField.kind !== 'color') {
          ctx.addIssue({
            code: 'custom',
            message: '线路地图字形的颜色字段必须引用另一个颜色字段。',
            path: ['fields', fieldIndex, 'glyph', 'colorFieldKey'],
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
  input: materialInputRecordSchema,
  canvas: materialCanvasSchema,
  clientDraftId: z.string().trim().min(1).max(120).optional(),
});

export const materialReviewDecisionSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  reason: z.string().trim().max(500).optional(),
});

const materialTransitStationServerSourceSchema = z.object({
  kind: z.literal('transit_station'),
  stationMarkerId: idSchema,
  direction: z.enum(['east', 'west', 'north', 'south']),
  lineIds: z.array(idSchema).min(1).max(12),
  terminalRole: z.enum(['origin', 'terminal']).optional(),
});

const materialTransitStationNetworkSourceSchema = z.object({
  kind: z.literal('transit_station'),
  networkNodeId: idSchema,
  lineSelections: z
    .array(
      z.object({
        lineKey: z.string().trim().min(1).max(120),
        direction: z.enum(['east', 'west', 'north', 'south']),
      }),
    )
    .min(1)
    .max(12),
  terminalRole: z.enum(['origin', 'terminal']).optional(),
});

export const materialServerSourceSchema = z.union([
  z.object({
    kind: z.literal('transit_line'),
    lineId: idSchema,
    stationSourceId: idSchema.optional(),
    // 导入项目线路：lineId 仍用于引用线路键，network 字段用于在项目快照内解析站序。
    networkLineKey: z.string().trim().min(1).max(120).optional(),
    networkNodeId: z.string().trim().min(1).max(120).optional(),
  }),
  materialTransitStationServerSourceSchema,
  materialTransitStationNetworkSourceSchema,
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

const materialTransitNetworkColorSchema = z
  .string()
  .regex(/^#[0-9a-f]{6}$/i)
  .transform((value) => value.toUpperCase());

const materialTransitNetworkNodeSchema = z.object({
  id: z.string().trim().min(1).max(120),
  kind: z.enum(['station', 'junction']),
  names: z.array(z.string().trim().min(1).max(160)).max(8),
  x: z.number().finite().min(-1_000_000).max(1_000_000),
  y: z.number().finite().min(-1_000_000).max(1_000_000),
  lineKeys: z.array(z.string().trim().min(1).max(120)).max(24),
  lineColors: z.array(materialTransitNetworkColorSchema).max(24),
});

const materialTransitNetworkEdgeSchema = z.object({
  id: z.string().trim().min(1).max(120),
  source: z.string().trim().min(1).max(120),
  target: z.string().trim().min(1).max(120),
  lineKeys: z.array(z.string().trim().min(1).max(120)).min(1).max(4),
  colors: z.array(materialTransitNetworkColorSchema).min(1).max(4),
  pathKind: z.enum(['simple', 'diagonal', 'perpendicular', 'rotate-perpendicular', 'unknown']),
  startFrom: z.enum(['from', 'to']).optional(),
  offsetFrom: z.number().finite().min(-10_000).max(10_000).optional(),
  offsetTo: z.number().finite().min(-10_000).max(10_000).optional(),
  roundCornerFactor: z.number().finite().min(0).max(10_000).optional(),
});

export const materialTransitNetworkLineNameSchema = z.object({
  lineKey: z.string().trim().min(1).max(120),
  name: z.string().trim().min(1).max(120),
  secondaryName: z.string().trim().min(1).max(120).optional(),
});

const materialTransitNetworkStationNameSchema = z.object({
  nodeId: z.string().trim().min(1).max(120),
  names: z.array(z.string().trim().min(1).max(160)).min(1).max(8),
});

/**
 * 自定义线网的车站资料：只服务物料/导视渲染，不参与几何。
 * 字段命名尽量对齐官方 `transitStationDetailUpdateSchema`，但去掉了依赖地图 marker 的
 * `placeMarkerId/roadMarkerIds`（自定义线网没有 POI），并补了导视牌需要的 `lineKeys/status/order`。
 */
export const materialTransitStationExitSchema = z.object({
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().max(120).optional(),
  floor: z.string().trim().max(40).optional(),
  direction: z.enum(['upwards', 'downwards']).optional(),
  orientation: z.enum(['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']).optional(),
  status: z.enum(['open', 'closed', 'reserved']).optional(),
  lineKeys: z.array(z.string().trim().min(1).max(120)).max(12).optional(),
  order: z.number().int().min(0).max(10_000).optional(),
  description: z.string().trim().max(300).optional(),
  landmarks: z.array(z.string().trim().min(1).max(120)).max(12).optional(),
});

export const materialTransitStationStructureSchema = z.object({
  position: z.enum(['underground', 'elevated', 'ground', 'mixed']).optional(),
  platformType: z
    .enum(['island', 'side', 'stacked', 'twin-island', 'side-stacked', 'other'])
    .optional(),
  platformCount: z.number().int().min(1).max(16).optional(),
  overGround: z.boolean().optional(),
  platformSide: z.enum(['left', 'right', 'both', 'none']).optional(),
  layers: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(40),
        usage: z.enum(['concourse', 'platform', 'entrance', 'transfer', 'equipment', 'other']),
        order: z.number().int().min(0).max(100).optional(),
        note: z.string().trim().max(200).optional(),
      }),
    )
    .max(64)
    .optional(),
  platforms: z
    .array(
      z.object({
        lineKeys: z.array(z.string().trim().min(1).max(120)).max(12).optional(),
        floor: z.string().trim().max(40).optional(),
        type: z
          .enum(['island', 'side', 'stacked', 'twin-island', 'side-stacked', 'other'])
          .optional(),
        note: z.string().trim().max(200).optional(),
      }),
    )
    .max(24)
    .optional(),
  note: z.string().trim().max(500).optional(),
});

export const materialTransitStationLineGroupSchema = z.object({
  lineKey: z.string().trim().min(1).max(120),
  lineName: z.string().trim().max(120).optional(),
  exits: z.array(materialTransitStationExitSchema).max(256),
});

export const materialTransitStationProfileSchema = z.object({
  nodeId: z.string().trim().min(1).max(120),
  structure: materialTransitStationStructureSchema.optional(),
  exits: z.array(materialTransitStationExitSchema).max(256).optional(),
  lineGroups: z.array(materialTransitStationLineGroupSchema).max(16).optional(),
  note: z.string().trim().max(500).optional(),
});

export const materialTransitNetworkSupplementSchema = z.object({
  stations: z.array(materialTransitStationProfileSchema).max(2_000).optional(),
});

export const materialTransitNetworkSnapshotSchema = z
  .object({
    format: z.literal('rmp'),
    version: z.number().int().positive().max(10_000),
    nodes: z.array(materialTransitNetworkNodeSchema).min(1).max(2_000),
    edges: z.array(materialTransitNetworkEdgeSchema).min(1).max(4_000),
    lineNames: z.array(materialTransitNetworkLineNameSchema).max(256).optional(),
  })
  .superRefine((value, ctx) => {
    const nodeIds = new Set(value.nodes.map((node) => node.id));
    const lineIds = new Set<string>();
    for (const [index, edge] of value.edges.entries()) {
      if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
        ctx.addIssue({
          code: 'custom',
          message: '线网连接引用了不存在的节点。',
          path: ['edges', index],
        });
      }
      edge.colors.forEach((_color, colorIndex) => {
        const lineKey = edge.lineKeys[colorIndex] ?? edge.lineKeys[0];
        if (lineKey) lineIds.add(lineKey);
      });
    }
    const namedLineIds = new Set<string>();
    for (const [index, line] of (value.lineNames ?? []).entries()) {
      const lineId = line.lineKey;
      if (!lineIds.has(lineId) || namedLineIds.has(lineId)) {
        ctx.addIssue({
          code: 'custom',
          message: namedLineIds.has(lineId)
            ? '同一项目线路不能重复命名。'
            : '线路名称引用了不存在的项目线路。',
          path: ['lineNames', index],
        });
      }
      namedLineIds.add(lineId);
    }
  });

export const materialTransitNetworkProjectCreateSchema = z.object({
  fileName: z.string().trim().min(1).max(260),
  snapshot: materialTransitNetworkSnapshotSchema,
});

export const materialTransitNetworkProjectUpdateSchema = z
  .object({
    lineNames: z.array(materialTransitNetworkLineNameSchema).max(256).optional(),
    stationNames: z.array(materialTransitNetworkStationNameSchema).max(2_000).optional(),
    stationProfiles: z.array(materialTransitStationProfileSchema).max(2_000).optional(),
  })
  .superRefine((value, ctx) => {
    if (
      value.lineNames === undefined &&
      value.stationNames === undefined &&
      value.stationProfiles === undefined
    ) {
      ctx.addIssue({ code: 'custom', message: '至少需要提供一项线网补充信息。' });
    }
    const nodeIds = new Set<string>();
    for (const [index, stationName] of (value.stationNames ?? []).entries()) {
      if (nodeIds.has(stationName.nodeId)) {
        ctx.addIssue({
          code: 'custom',
          message: '同一车站不能重复命名。',
          path: ['stationNames', index, 'nodeId'],
        });
      }
      nodeIds.add(stationName.nodeId);
    }
    const profileNodeIds = new Set<string>();
    for (const [index, profile] of (value.stationProfiles ?? []).entries()) {
      if (profileNodeIds.has(profile.nodeId)) {
        ctx.addIssue({
          code: 'custom',
          message: '同一车站不能重复提交资料。',
          path: ['stationProfiles', index, 'nodeId'],
        });
      }
      profileNodeIds.add(profile.nodeId);
      const exitCodes = new Set<string>();
      for (const [exitIndex, exit] of (profile.exits ?? []).entries()) {
        if (exitCodes.has(exit.code)) {
          ctx.addIssue({
            code: 'custom',
            message: '同一车站的出口编号不能重复。',
            path: ['stationProfiles', index, 'exits', exitIndex, 'code'],
          });
        }
        exitCodes.add(exit.code);
      }
    }
  });

export const materialExportRequestSchema = z
  .object({
    mode: z.enum(['server', 'custom', 'manual']),
    draftId: idSchema.optional(),
    templateId: idSchema.optional(),
    templateVersion: z.number().int().positive().optional(),
    canvas: materialCanvasSchema.optional(),
    source: materialServerSourceSchema.optional(),
    networkGeometry: materialTransitNetworkSnapshotSchema.optional(),
    input: materialInputRecordSchema.optional(),
    /**
     * 手动模式下「未修改标签」：套用模板时保存的文本基线。
     * 服务端只比较模板定义的文本字段（导视牌比较 layout 中的文本），
     * 忽略尺寸、颜色、图标等图形差异。
     */
    unmodifiedTemplateBaseline: z
      .object({
        /** 地铁导视牌：文本都在 layout 序列化内容里。 */
        layout: z.string().max(384_000).optional(),
        /** 其它模板：套用时的文本字段取值。 */
        input: materialInputRecordSchema.optional(),
        widthM: z.number().positive().max(64),
        heightM: z.number().positive().max(64),
      })
      .superRefine((baseline, ctx) => {
        if (baseline.layout === undefined && baseline.input === undefined) {
          ctx.addIssue({
            code: 'custom',
            message: '未修改模板基线必须包含文本内容。',
          });
        }
      })
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (value.mode === 'custom' && !value.draftId) {
      ctx.addIssue({ code: 'custom', message: '自定义导出必须指定物料草稿。', path: ['draftId'] });
    }
    if (value.mode === 'server' && (!value.templateId || !value.templateVersion || !value.source)) {
      ctx.addIssue({ code: 'custom', message: '服务器导出必须指定模板和真实数据来源。' });
    }
    if (value.mode === 'manual') {
      if (!value.templateId || !value.templateVersion || !value.canvas || !value.input) {
        ctx.addIssue({ code: 'custom', message: '手动导出必须指定模板、画布与字段输入。' });
      }
      if (!value.unmodifiedTemplateBaseline) {
        ctx.addIssue({
          code: 'custom',
          message: '手动导出必须提供未修改模板基线。',
          path: ['unmodifiedTemplateBaseline'],
        });
      }
    }
    if (
      value.source?.kind === 'transit_station' &&
      'networkNodeId' in value.source &&
      !value.networkGeometry
    ) {
      ctx.addIssue({
        code: 'custom',
        message: '项目站点选择必须同时提交导入的线网数据。',
        path: ['networkGeometry'],
      });
    }
  });

export const materialPreviewRequestSchema = z
  .object({
    mode: z.enum(['manual', 'server']),
    templateId: idSchema,
    templateVersion: z.number().int().positive(),
    canvas: materialCanvasSchema,
    input: materialInputRecordSchema.optional(),
    source: materialServerSourceSchema.optional(),
    networkGeometry: materialTransitNetworkSnapshotSchema.optional(),
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
    if (
      value.source?.kind === 'transit_station' &&
      'networkNodeId' in value.source &&
      !value.networkGeometry
    ) {
      ctx.addIssue({
        code: 'custom',
        message: '项目站点选择必须同时提交导入的线网数据。',
        path: ['networkGeometry'],
      });
    }
  });

export const materialShareLinkDataSourceSchema = z.enum(['server', 'sample', 'project']);

/**
 * 物料分享来源类型。
 *
 * 契约里 `dataSource` 是数据源类别（server / sample / project），`sourceKind` 是细化来源
 * （manual / transit_line / ...）。创建接口两种写法都收：来源类别可直接写在 `sourceKind`，
 * 兼容机器人渲染接口的 `source.kind` 口径，服务端再落到对应字段上。
 */
export const materialShareLinkSourceKindSchema = z.enum([
  'server',
  'sample',
  'project',
  'manual',
  'transit_line',
  'transit_station',
  'map_location',
  'road_coordinate',
]);

/** 工作台发起分享的创建请求。 */
export const materialShareLinkCreateRequestSchema = z.object({
  templateId: idSchema,
  templateVersion: z.number().int().positive(),
  values: materialInputRecordSchema,
  canvas: materialCanvasSchema,
  sourceKind: materialShareLinkSourceKindSchema.optional(),
  sourceRef: z.string().trim().min(1).max(2_000).optional(),
  /** 服务器来源的结构化描述：服务端据此重新解析字段，判定分享图水印。 */
  source: materialServerSourceSchema.optional(),
  networkGeometry: materialTransitNetworkSnapshotSchema.optional(),
  dataSource: materialShareLinkDataSourceSchema.optional(),
  draftId: idSchema.optional(),
  networkName: z.string().trim().max(120).optional(),
  licenseName: z.string().trim().max(160).optional(),
  licenseUrl: z.string().trim().max(500).optional(),
});

export const materialShareLinkCreateResponseSchema = z.object({
  shareId: z.string(),
  shareUrl: z.string(),
  shareImageWatermark: z.boolean(),
});

/** 公开只读的分享记录（脱敏：不含 createdBy / revokedBy / seed / sourceRef）。 */
export const materialShareLinkPublicResponseSchema = z.object({
  shareId: z.string(),
  slug: z.string(),
  createdAt: z.string(),
  kind: z.enum(['road_sign', 'address_sign', 'bus_stop', 'metro_line', 'custom']),
  code: z.string(),
  templateId: z.string(),
  templateVersion: z.number().int().positive(),
  templateTitle: z.string(),
  dataSource: materialShareLinkDataSourceSchema,
  origin: z.enum(['bot', 'workbench']),
  status: z.enum(['active', 'revoked']),
  expired: z.boolean(),
  stub: z.boolean(),
  shareImageWatermark: z.boolean(),
  networkName: z.string().optional(),
  licenseName: z.string().optional(),
  licenseUrl: z.string().optional(),
  values: materialInputRecordSchema.optional(),
  canvas: materialCanvasSchema.optional(),
});

export type MaterialTemplateDraftInput = z.infer<typeof materialTemplateDraftSchema>;
export type MaterialDraftInput = z.infer<typeof materialDraftInputSchema>;
export type MaterialExportRequestInput = z.infer<typeof materialExportRequestSchema>;
export type MaterialPreviewRequestInput = z.infer<typeof materialPreviewRequestSchema>;
export type MaterialServerSourceInput = z.infer<typeof materialServerSourceSchema>;
export type MaterialTransitNetworkSnapshotInput = z.infer<
  typeof materialTransitNetworkSnapshotSchema
>;
export type MaterialTransitNetworkProjectCreateInput = z.infer<
  typeof materialTransitNetworkProjectCreateSchema
>;
export type MaterialTransitNetworkProjectUpdateInput = z.infer<
  typeof materialTransitNetworkProjectUpdateSchema
>;
export type MaterialTransitStationExitInput = z.infer<typeof materialTransitStationExitSchema>;
export type MaterialTransitStationStructureInput = z.infer<
  typeof materialTransitStationStructureSchema
>;
export type MaterialTransitStationProfileInput = z.infer<
  typeof materialTransitStationProfileSchema
>;
export type MaterialTransitNetworkSupplementInput = z.infer<
  typeof materialTransitNetworkSupplementSchema
>;
export type MaterialShareLinkCreateRequestInput = z.infer<
  typeof materialShareLinkCreateRequestSchema
>;
export type MaterialShareLinkCreateResponse = z.infer<typeof materialShareLinkCreateResponseSchema>;
export type MaterialShareLinkPublicResponse = z.infer<typeof materialShareLinkPublicResponseSchema>;
