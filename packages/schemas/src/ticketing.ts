import { z } from 'zod';
import { idSchema, isoDateTimeSchema, nonEmptyTextSchema } from './common';

export const ticketableServiceKindSchema = z.enum([
  'coach',
  'ferry',
  'flight',
  'railway',
  'custom',
]);

export const travelFareCurrencySchema = z.enum(['CNY', 'SERVER_CREDIT', 'CUSTOM']);
export const travelFareProductStatusSchema = z.enum(['draft', 'active', 'suspended', 'archived']);
export const ticketInventoryPoolStatusSchema = z.enum(['draft', 'active', 'suspended', 'archived']);
export const ticketInventoryHoldStatusSchema = z.enum([
  'held',
  'confirmed',
  'expired',
  'cancelled',
  'released',
]);
export const ticketOrderStatusSchema = z.enum([
  'draft',
  'pending_issue',
  'issued',
  'checked_in',
  'completed',
  'cancelled',
  'refund_requested',
  'refunded',
  'expired',
  'manual_review',
]);
export const ticketStatusSchema = z.enum([
  'pending_issue',
  'issued',
  'redemption_linked',
  'checked_in',
  'cancelled',
  'refunded',
  'expired',
  'manual_review',
]);
export const ticketRefundStatusSchema = z.enum([
  'requested',
  'approved',
  'rejected',
  'processing',
  'completed',
  'failed',
  'cancelled',
]);
export const ticketOrderCancellationReasonSchema = z.enum([
  'user_cancelled',
  'inventory_expired',
  'issue_failed',
  'admin_cancelled',
  'system',
]);
export const travelTicketingAvailabilityStatusSchema = z.enum([
  'order_available',
  'legacy_reference_only',
  'fare_not_configured',
  'inventory_not_configured',
  'sold_out',
  'service_not_connected',
  'trip_not_found',
  'ticketing_unavailable',
]);

export const travelFareProductSchema = z.object({
  fareProductId: idSchema,
  serviceKind: ticketableServiceKindSchema,
  serviceId: idSchema.optional(),
  tripInstanceId: idSchema.optional(),
  name: nonEmptyTextSchema,
  priceAmount: z.number().finite().nonnegative(),
  currency: travelFareCurrencySchema,
  status: travelFareProductStatusSchema,
  rules: z.record(z.string(), z.unknown()).default({}),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  sourcePath: z.string().trim().min(1).max(500).optional(),
});

export const ticketInventoryPoolSchema = z.object({
  inventoryPoolId: idSchema,
  serviceKind: ticketableServiceKindSchema,
  tripInstanceId: idSchema,
  fareProductId: idSchema,
  totalCapacity: z.number().int().nonnegative().optional(),
  availableCapacity: z.number().int().nonnegative().optional(),
  status: ticketInventoryPoolStatusSchema,
  updatedAt: isoDateTimeSchema,
});

export const ticketInventoryHoldSchema = z.object({
  inventoryHoldId: idSchema,
  inventoryPoolId: idSchema,
  tripInstanceId: idSchema,
  fareProductId: idSchema,
  userId: idSchema,
  ldpassUserId: idSchema,
  quantity: z.number().int().positive().max(20),
  status: ticketInventoryHoldStatusSchema,
  heldAt: isoDateTimeSchema,
  expiresAt: isoDateTimeSchema,
  confirmedAt: isoDateTimeSchema.optional(),
  releasedAt: isoDateTimeSchema.optional(),
  orderId: idSchema.optional(),
});

export const ticketOrderSchema = z.object({
  orderId: idSchema,
  userId: idSchema,
  ldpassUserId: idSchema,
  serviceKind: ticketableServiceKindSchema,
  tripInstanceId: idSchema,
  fareProductId: idSchema,
  inventoryHoldId: idSchema.optional(),
  passengerCount: z.number().int().positive().max(20),
  status: ticketOrderStatusSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  issuedAt: isoDateTimeSchema.optional(),
  checkedInAt: isoDateTimeSchema.optional(),
  completedAt: isoDateTimeSchema.optional(),
  cancelledAt: isoDateTimeSchema.optional(),
  cancellationReason: ticketOrderCancellationReasonSchema.optional(),
  refundRequestedAt: isoDateTimeSchema.optional(),
  refundedAt: isoDateTimeSchema.optional(),
  legacyOrderId: z.string().trim().max(160).optional(),
});

export const ticketRecordSchema = z.object({
  ticketId: idSchema,
  orderId: idSchema,
  userId: idSchema,
  ldpassUserId: idSchema,
  status: ticketStatusSchema,
  ldpassPassId: idSchema.optional(),
  actionLinkId: idSchema.optional(),
  redemptionRequestId: idSchema.optional(),
  issuedAt: isoDateTimeSchema.optional(),
  checkedInAt: isoDateTimeSchema.optional(),
  cancelledAt: isoDateTimeSchema.optional(),
  refundedAt: isoDateTimeSchema.optional(),
  updatedAt: isoDateTimeSchema,
});

export const ticketRefundRequestSchema = z.object({
  refundRequestId: idSchema,
  orderId: idSchema,
  ticketId: idSchema,
  userId: idSchema,
  status: ticketRefundStatusSchema,
  reason: z.string().trim().max(1000).optional(),
  amount: z.number().finite().nonnegative().optional(),
  requestedAt: isoDateTimeSchema,
  reviewedAt: isoDateTimeSchema.optional(),
  completedAt: isoDateTimeSchema.optional(),
  failedAt: isoDateTimeSchema.optional(),
  updatedAt: isoDateTimeSchema,
});

export const ticketOrderDraftCreateSchema = z.object({
  tripInstanceId: idSchema,
  serviceDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  fareProductId: idSchema.optional(),
  passengerCount: z.number().int().positive().max(9).default(1),
});

export const travelFareProductSummarySchema = travelFareProductSchema.pick({
  fareProductId: true,
  name: true,
  priceAmount: true,
  currency: true,
});

export const ticketInventoryPoolSummarySchema = ticketInventoryPoolSchema.pick({
  inventoryPoolId: true,
  fareProductId: true,
  totalCapacity: true,
  availableCapacity: true,
});

export const travelTicketingAvailabilitySchema = z.object({
  tripInstanceId: idSchema,
  serviceKind: ticketableServiceKindSchema.optional(),
  status: travelTicketingAvailabilityStatusSchema,
  orderSupported: z.boolean(),
  requiresLogin: z.boolean(),
  message: nonEmptyTextSchema,
  fareProducts: z.array(travelFareProductSummarySchema).max(50),
  inventoryPools: z.array(ticketInventoryPoolSummarySchema).max(50),
  availableCapacity: z.number().int().nonnegative().optional(),
  bookingUrl: z.string().url().optional(),
  checkedAt: isoDateTimeSchema,
});

export const ticketingCatalogSnapshotSchema = z.object({
  version: z.literal(1).default(1),
  fareProducts: z.array(travelFareProductSchema).max(2000).default([]),
  inventoryPools: z.array(ticketInventoryPoolSchema).max(5000).default([]),
  updatedAt: isoDateTimeSchema.optional(),
  updatedBy: idSchema.optional(),
});

export const ticketOrderDraftResultSchema = z.object({
  order: ticketOrderSchema,
  inventoryHold: ticketInventoryHoldSchema,
  fareProduct: travelFareProductSummarySchema,
  ticketing: travelTicketingAvailabilitySchema,
});

export const ticketOrderListItemSchema = z.object({
  order: ticketOrderSchema,
  inventoryHold: ticketInventoryHoldSchema.optional(),
});

export const ticketOrderStoreSnapshotSchema = z.object({
  version: z.literal(1).default(1),
  orders: z.array(ticketOrderSchema).max(5000).default([]),
  inventoryHolds: z.array(ticketInventoryHoldSchema).max(5000).default([]),
  updatedAt: isoDateTimeSchema.optional(),
});

export type TravelFareProductInput = z.infer<typeof travelFareProductSchema>;
export type TicketInventoryPoolInput = z.infer<typeof ticketInventoryPoolSchema>;
export type TicketInventoryHoldInput = z.infer<typeof ticketInventoryHoldSchema>;
export type TicketOrderInput = z.infer<typeof ticketOrderSchema>;
export type TicketRecordInput = z.infer<typeof ticketRecordSchema>;
export type TicketRefundRequestInput = z.infer<typeof ticketRefundRequestSchema>;
export type TicketOrderDraftCreateInput = z.infer<typeof ticketOrderDraftCreateSchema>;
export type TravelTicketingAvailabilityInput = z.infer<typeof travelTicketingAvailabilitySchema>;
export type TicketingCatalogSnapshotInput = z.infer<typeof ticketingCatalogSnapshotSchema>;
export type TicketOrderDraftResultInput = z.infer<typeof ticketOrderDraftResultSchema>;
export type TicketOrderListItemInput = z.infer<typeof ticketOrderListItemSchema>;
export type TicketOrderStoreSnapshotInput = z.infer<typeof ticketOrderStoreSnapshotSchema>;
