import { z } from 'zod';
import { idSchema, nonEmptyTextSchema, urlSchema } from './common';

const coordinateSchema = z.tuple([z.number().finite(), z.number().finite()]);
const colorWithAlphaSchema = z.string().regex(/^#[0-9A-Fa-f]{6}(?:[0-9A-Fa-f]{2})?$/);

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

export const mapSpatialProfileUpdateSchema = z.object({
  worldName: z.string().trim().min(1).max(80),
  defaultY: z.number().finite().min(-4096).max(4096),
  verticalTolerance: z.number().finite().min(0).max(16),
  defaultDrivingSpeedKmh: z.number().finite().positive().max(1000),
  roadTiming: z.object({
    defaultBusSpeedKmh: z.number().finite().positive().max(1000),
    junctionSnapTolerance: z.number().finite().min(0).max(64),
    taxiJunctionDelaySeconds: z.number().finite().min(0).max(3600),
    busJunctionDelaySeconds: z.number().finite().min(0).max(3600),
  }),
  taxiFare: z
    .object({
      baseFareCents: z.number().int().min(0).max(1_000_000),
      baseDistanceMeters: z.number().int().positive().max(1_000_000),
      incrementDistanceMeters: z.number().int().positive().max(1_000_000),
      incrementFareCents: z.number().int().positive().max(1_000_000),
      longDistanceThresholdMeters: z.number().int().positive().max(10_000_000),
      longDistanceSurchargePermille: z.number().int().min(0).max(10_000),
      longDistanceSurchargeScope: z.enum(['excess_distance', 'whole_metered_fare']),
    })
    .refine((value) => value.longDistanceThresholdMeters >= value.baseDistanceMeters, {
      message: '返空费起算距离不能小于起步里程',
      path: ['longDistanceThresholdMeters'],
    }),
  transitFare: z.object({
    busDefaultFareCents: z.number().int().min(0).max(1_000_000),
    ferryDefaultFareCents: z.number().int().min(0).max(1_000_000),
    railDistanceBands: z
      .array(
        z.object({
          maximumDistanceMeters: z.number().int().positive().max(100_000_000),
          fareCents: z.number().int().min(0).max(1_000_000),
        }),
      )
      .min(1)
      .max(64)
      .refine(
        (bands) =>
          bands.every(
            (band, index) =>
              index === 0 || band.maximumDistanceMeters > bands[index - 1]!.maximumDistanceMeters,
          ),
        '轨道票价里程上限必须严格递增',
      ),
  }),
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

const mapStyleBindingSchema = z.object({
  fillColor: colorWithAlphaSchema.optional(),
  fillOpacity: z.number().finite().min(0).max(1).optional(),
  strokeColor: colorWithAlphaSchema.optional(),
  strokeOpacity: z.number().finite().min(0).max(1).optional(),
  lineColorTransitLineIds: z.array(z.string().trim().min(1).max(120)).max(16).optional(),
});

const mapVolumeGeometrySchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('ExtrudedRectangle'),
    bounds: rectangleBoundsSchema,
    minY: z.number().finite(),
    maxY: z.number().finite(),
  }),
  z.object({
    type: z.literal('MultiExtrudedRectangle'),
    volumes: z
      .array(
        z.object({
          bounds: rectangleBoundsSchema,
          minY: z.number().finite(),
          maxY: z.number().finite(),
        }),
      )
      .min(1)
      .max(256),
  }),
  z.object({
    type: z.literal('ExtrudedPolygon'),
    coordinates: z.array(z.array(coordinateSchema).min(4).max(2000)).min(1).max(64),
    minY: z.number().finite(),
    maxY: z.number().finite(),
  }),
  z.object({
    type: z.literal('MultiExtrudedPolygon'),
    volumes: z
      .array(
        z.object({
          coordinates: z.array(z.array(coordinateSchema).min(4).max(2000)).min(1).max(64),
          minY: z.number().finite(),
          maxY: z.number().finite(),
        }),
      )
      .min(1)
      .max(64),
  }),
]);

export const mapMarkerSpatialMetadataSchema = z
  .object({
    worldId: z.string().trim().min(1).max(120).optional(),
    defaultY: z.number().finite().optional(),
    coordinateY: z.array(z.number().finite().nullable()).max(100_000).optional(),
    networkKind: z.enum(['road', 'pedestrian']).optional(),
    direction: z.enum(['both', 'forward', 'reverse']).default('both'),
    allowedModes: z
      .array(z.enum(['walk', 'taxi', 'bus', 'coach']))
      .max(4)
      .transform((modes) => Array.from(new Set(modes)))
      .optional(),
    verticalConnectorKind: z.enum(['ramp', 'stairs', 'escalator', 'elevator']).optional(),
    accessible: z.boolean().optional(),
    style: mapStyleBindingSchema.optional(),
    volume: mapVolumeGeometrySchema.optional(),
    dynamicSymbol: z
      .object({
        kind: z.enum(['metro_exit', 'road_ref', 'highway_ref']),
        ref: z
          .string()
          .trim()
          .min(1)
          .max(12)
          .regex(/^[A-Za-z0-9-]+$/),
        variant: z.string().trim().min(1).max(40).optional(),
        backgroundColor: colorWithAlphaSchema.optional(),
        textColor: colorWithAlphaSchema.optional(),
      })
      .optional(),
    parentPlaceId: z.string().trim().min(1).max(220).optional(),
    stationId: z.string().trim().min(1).max(160).optional(),
    ref: z.string().trim().min(1).max(40).optional(),
  })
  .superRefine((value, context) => {
    const volumes = value.volume
      ? value.volume.type === 'ExtrudedRectangle' || value.volume.type === 'ExtrudedPolygon'
        ? [value.volume]
        : value.volume.volumes
      : [];
    volumes.forEach((volume, index) => {
      if (volume.maxY <= volume.minY) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: '立体 POI 的 maxY 必须大于 minY。',
          path: ['volume', 'volumes', index, 'maxY'],
        });
      }
    });
    if (value.verticalConnectorKind && !value.networkKind) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: '跨层连接器必须同时指定道路或步行网络类型。',
        path: ['verticalConnectorKind'],
      });
    }
  });

const administrativeAreaBoundarySchema = z.union([
  z.object({ type: z.literal('Rectangle'), bounds: rectangleBoundsSchema }),
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

export const administrativeAreaUpsertSchema = z
  .object({
    code: z.string().trim().min(1).max(80),
    name: z.string().trim().min(1).max(160),
    level: z.enum(['country', 'province', 'prefecture', 'county', 'township', 'custom']),
    parentAreaId: z.string().trim().min(1).max(160).optional(),
    boundary: administrativeAreaBoundarySchema,
    labelPosition: coordinateSchema.optional(),
    style: mapStyleBindingSchema.optional(),
    minZoom: z.number().finite().min(-20).max(20).optional(),
    maxZoom: z.number().finite().min(-20).max(20).optional(),
  })
  .refine(
    (value) =>
      value.minZoom === undefined || value.maxZoom === undefined || value.minZoom <= value.maxZoom,
    { message: 'minZoom 不能大于 maxZoom。', path: ['maxZoom'] },
  );

export const administrativeAreaStatusActionSchema = z.object({
  action: z.enum(['publish', 'archive', 'restore']),
});

export type AdministrativeAreaUpsertInput = z.infer<typeof administrativeAreaUpsertSchema>;
export type AdministrativeAreaStatusActionInput = z.infer<
  typeof administrativeAreaStatusActionSchema
>;

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
    spatial: mapMarkerSpatialMetadataSchema.optional(),
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
  spatial: mapMarkerSpatialMetadataSchema.optional(),
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
    spatial: mapMarkerSpatialMetadataSchema.optional(),
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
export type MapSpatialProfileUpdateInput = z.infer<typeof mapSpatialProfileUpdateSchema>;
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
