import { z } from 'zod';
import { idSchema, nonEmptyTextSchema, urlSchema } from './common';

const coordinateSchema = z.tuple([z.number().finite(), z.number().finite()]);

export const rectangleBoundsSchema = z
  .object({
    minX: z.number().finite(),
    minZ: z.number().finite(),
    maxX: z.number().finite(),
    maxZ: z.number().finite(),
  })
  .refine((value) => value.minX < value.maxX, {
    message: 'minX 必须小于 maxX',
    path: ['maxX'],
  })
  .refine((value) => value.minZ < value.maxZ, {
    message: 'minZ 必须小于 maxZ',
    path: ['maxZ'],
  });

export const mapGeometrySchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('Point'),
    coordinates: coordinateSchema,
  }),
  z.object({
    type: z.literal('MultiPoint'),
    coordinates: z.array(coordinateSchema).min(2).max(2000),
  }),
  z.object({
    type: z.literal('LineString'),
    coordinates: z.array(coordinateSchema).min(2).max(2000),
  }),
  z.object({
    type: z.literal('Rectangle'),
    bounds: rectangleBoundsSchema,
  }),
  z.object({
    type: z.literal('MultiRectangle'),
    rectangles: z.array(rectangleBoundsSchema).min(1).max(256),
  }),
  z.object({
    type: z.literal('Polygon'),
    coordinates: z.array(z.array(coordinateSchema).min(4).max(2000)).min(1).max(64),
  }),
  z.object({
    type: z.literal('MultiPolygon'),
    coordinates: z
      .array(z.array(z.array(coordinateSchema).min(4).max(2000)).min(1).max(64))
      .min(1)
      .max(32),
  }),
]);

export const tileProviderConfigSchema = z.object({
  id: idSchema,
  name: nonEmptyTextSchema,
  sourceKind: z.enum(['fresh-http', 'safe-https-static', 'proxied', 'custom']),
  tileTemplate: z
    .string()
    .trim()
    .min(1)
    .refine((value) => value.includes('{x}') && value.includes('{y}') && value.includes('{z}'), {
      message: '瓦片模板必须包含 {x}、{y}、{z}',
    }),
  attribution: z.string().trim().max(300).optional(),
});

export const poiIconMappingSchema = z.object({
  categoryId: idSchema,
  iconFileNames: z.array(z.string().trim().min(1).max(160)).min(1).max(32),
  defaultIconFileName: z.string().trim().min(1).max(160),
});

export const poiCategorySchema = z.object({
  id: idSchema,
  name: nonEmptyTextSchema,
  iconMapping: poiIconMappingSchema,
  acceptsPublicSubmissions: z.boolean(),
  sortOrder: z.number().int().min(0).max(100_000),
});

export const poiCategoryProfileUpdateSchema = z.object({
  categories: z
    .array(poiCategorySchema)
    .max(200)
    .superRefine((categories, context) => {
      const seenIds = new Set<string>();
      categories.forEach((category, index) => {
        if (seenIds.has(category.id)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'POI 分类 ID 不能重复',
            path: [index, 'id'],
          });
        }
        seenIds.add(category.id);

        if (category.iconMapping.categoryId !== category.id) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: '图标映射分类 ID 必须与分类 ID 一致',
            path: [index, 'iconMapping', 'categoryId'],
          });
        }

        if (
          !category.iconMapping.iconFileNames.includes(category.iconMapping.defaultIconFileName)
        ) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: '默认图标必须包含在分类图标列表中',
            path: [index, 'iconMapping', 'defaultIconFileName'],
          });
        }
      });
    }),
});

export const poiCategoryIconRenameSchema = z.object({
  iconFileName: z.string().trim().min(1).max(300),
  displayName: z.string().trim().min(1).max(80),
});

const poiSubmissionImageUrlSchema = z.union([
  urlSchema,
  z
    .string()
    .trim()
    .regex(/^\/api\/map\/poi-submission-images\/[a-f0-9]{24}\.(?:png|jpg|gif|webp|avif)$/),
]);

const poiSubmissionImageUrlsSchema = z
  .array(poiSubmissionImageUrlSchema)
  .max(12)
  .transform((urls) => Array.from(new Set(urls)))
  .optional();

const poiParentMarkerIdSchema = z.string().trim().min(1).max(220).optional();
const poiFloorLabelSchema = z.string().trim().max(40).optional();
const poiBoundRegionMarkerIdsSchema = z
  .array(z.string().trim().min(1).max(220))
  .max(32)
  .transform((ids) => Array.from(new Set(ids)))
  .optional();

const poiOpeningHoursSchema = z.string().trim().max(500).optional();
const poiAddressSchema = z.string().trim().max(300).optional();
const poiAddressRoadMarkerIdSchema = z.string().trim().min(1).max(220).optional();
export const poiFacilitySchema = z.object({
  symbolIcon: z
    .string()
    .trim()
    .regex(/^[a-z0-9_]{1,64}$/),
  description: z.string().trim().min(1).max(300),
});
const poiFacilitiesSchema = z.array(poiFacilitySchema).max(64).optional();

function validatePoiAddressRoadBinding(
  value: { address?: string; addressRoadMarkerId?: string },
  context: z.RefinementCtx,
): void {
  if (value.addressRoadMarkerId?.trim() && !value.address?.trim()) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: '绑定地址道路前必须填写文字地址',
      path: ['addressRoadMarkerId'],
    });
  }
}

export const poiSubmissionSchema = z
  .object({
    title: nonEmptyTextSchema,
    categoryId: idSchema,
    description: z.string().trim().max(1000).optional(),
    href: urlSchema.optional(),
    imageUrls: poiSubmissionImageUrlsSchema,
    imageUrl: poiSubmissionImageUrlSchema.optional(),
    geometry: mapGeometrySchema,
    parentMarkerId: poiParentMarkerIdSchema,
    floorLabel: poiFloorLabelSchema,
    boundRegionMarkerIds: poiBoundRegionMarkerIdsSchema,
    openingHours: poiOpeningHoursSchema,
    address: poiAddressSchema,
    addressRoadMarkerId: poiAddressRoadMarkerIdSchema,
    facilities: poiFacilitiesSchema,
    visibility: z.enum(['private', 'public_pending_review']),
  })
  .superRefine(validatePoiAddressRoadBinding);

export const poiSubmissionReviewDecisionSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  reason: z.string().trim().max(500).optional(),
});

const poiSubmissionAdminUpdateBaseSchema = z.object({
  title: nonEmptyTextSchema,
  categoryId: idSchema,
  iconFileName: z.union([z.string().trim().min(1).max(160), z.literal('')]).optional(),
  description: z.string().trim().max(1000).optional(),
  href: z.union([urlSchema, z.literal('')]).optional(),
  imageUrls: poiSubmissionImageUrlsSchema,
  imageUrl: z.union([poiSubmissionImageUrlSchema, z.literal('')]).optional(),
  geometry: mapGeometrySchema.optional(),
  parentMarkerId: z.union([poiParentMarkerIdSchema.unwrap(), z.literal('')]).optional(),
  floorLabel: z.union([poiFloorLabelSchema.unwrap(), z.literal('')]).optional(),
  boundRegionMarkerIds: poiBoundRegionMarkerIdsSchema,
  openingHours: z.union([poiOpeningHoursSchema.unwrap(), z.literal('')]).optional(),
  address: z.union([poiAddressSchema.unwrap(), z.literal('')]).optional(),
  addressRoadMarkerId: z.union([poiAddressRoadMarkerIdSchema.unwrap(), z.literal('')]).optional(),
  facilities: poiFacilitiesSchema,
});

export const poiSubmissionAdminUpdateSchema = poiSubmissionAdminUpdateBaseSchema.superRefine(
  validatePoiAddressRoadBinding,
);

export const poiSubmissionAdminCreateSchema = poiSubmissionAdminUpdateBaseSchema
  .extend({
    geometry: mapGeometrySchema,
  })
  .superRefine(validatePoiAddressRoadBinding);

export const poiConflictDecisionUpdateSchema = z.object({
  submissionId: idSchema,
  markerId: z.string().trim().min(1).max(220),
  markerLabel: z.string().trim().max(200).optional(),
  submissionTitle: z.string().trim().max(200).optional(),
  decision: z.enum(['ignored', 'duplicate', 'unresolved']),
});

export const poiSubmissionImageReviewUpdateSchema = z.object({
  submissionId: idSchema,
  imageUrl: poiSubmissionImageUrlSchema,
  decision: z.enum(['approved', 'rejected', 'unreviewed']),
  reason: z.string().trim().max(500).optional(),
});

export const legacyMapMarkerAdminUpdateSchema = z
  .object({
    label: nonEmptyTextSchema,
    categoryId: z.union([idSchema, z.literal('')]).optional(),
    iconFileName: z.union([z.string().trim().min(1).max(160), z.literal('')]).optional(),
    description: z.string().trim().max(1000).optional(),
    href: z.union([urlSchema, z.literal('')]).optional(),
    imageUrls: poiSubmissionImageUrlsSchema,
    imageUrl: z.union([poiSubmissionImageUrlSchema, z.literal('')]).optional(),
    geometry: mapGeometrySchema.optional(),
    parentMarkerId: z.union([poiParentMarkerIdSchema.unwrap(), z.literal('')]).optional(),
    floorLabel: z.union([poiFloorLabelSchema.unwrap(), z.literal('')]).optional(),
    boundRegionMarkerIds: poiBoundRegionMarkerIdsSchema,
    openingHours: z.union([poiOpeningHoursSchema.unwrap(), z.literal('')]).optional(),
    address: z.union([poiAddressSchema.unwrap(), z.literal('')]).optional(),
    addressRoadMarkerId: z.union([poiAddressRoadMarkerIdSchema.unwrap(), z.literal('')]).optional(),
    facilities: poiFacilitiesSchema,
  })
  .superRefine(validatePoiAddressRoadBinding);

export const mapMarkerSourceConfigSchema = z.object({
  id: idSchema,
  name: nonEmptyTextSchema,
  baseUrl: urlSchema,
  kind: z.enum(['bdslm', 'static-json', 'custom']),
});

export const mapFavoritesSchema = z.object({
  markerIds: z.array(z.string().trim().min(1).max(220)).max(1000),
});

export type TileProviderConfigInput = z.infer<typeof tileProviderConfigSchema>;
export type PoiCategoryInput = z.infer<typeof poiCategorySchema>;
export type PoiCategoryProfileUpdateInput = z.infer<typeof poiCategoryProfileUpdateSchema>;
export type PoiSubmissionInput = z.infer<typeof poiSubmissionSchema>;
export type PoiSubmissionReviewDecisionInput = z.infer<typeof poiSubmissionReviewDecisionSchema>;
export type PoiSubmissionAdminUpdateInput = z.infer<typeof poiSubmissionAdminUpdateSchema>;
export type PoiSubmissionAdminCreateInput = z.infer<typeof poiSubmissionAdminCreateSchema>;
export type PoiConflictDecisionUpdateInput = z.infer<typeof poiConflictDecisionUpdateSchema>;
export type PoiSubmissionImageReviewUpdateInput = z.infer<
  typeof poiSubmissionImageReviewUpdateSchema
>;
export type MapMarkerSourceConfigInput = z.infer<typeof mapMarkerSourceConfigSchema>;
export type MapFavoritesInput = z.infer<typeof mapFavoritesSchema>;
