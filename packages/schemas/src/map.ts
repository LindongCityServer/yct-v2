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

const poiSubmissionImageUrlSchema = z.union([
  urlSchema,
  z
    .string()
    .trim()
    .regex(/^\/api\/map\/poi-submission-images\/[a-f0-9]{24}\.(?:png|jpg|gif|webp|avif)$/),
]);

export const poiSubmissionSchema = z.object({
  title: nonEmptyTextSchema,
  categoryId: idSchema,
  description: z.string().trim().max(1000).optional(),
  href: urlSchema.optional(),
  imageUrl: poiSubmissionImageUrlSchema.optional(),
  geometry: mapGeometrySchema,
  visibility: z.enum(['private', 'public_pending_review']),
});

export const poiSubmissionReviewDecisionSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  reason: z.string().trim().max(500).optional(),
});

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
export type PoiSubmissionInput = z.infer<typeof poiSubmissionSchema>;
export type PoiSubmissionReviewDecisionInput = z.infer<typeof poiSubmissionReviewDecisionSchema>;
export type MapMarkerSourceConfigInput = z.infer<typeof mapMarkerSourceConfigSchema>;
export type MapFavoritesInput = z.infer<typeof mapFavoritesSchema>;
