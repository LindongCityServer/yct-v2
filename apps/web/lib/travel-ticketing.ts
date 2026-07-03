import type {
  TicketInventoryPool,
  TicketInventoryPoolSummary,
  TicketInventoryHold,
  TravelFareProduct,
  TravelFareProductSummary,
  TravelTicketingAvailability,
  TravelTripInstance,
} from '@yct/contracts';
import type { TicketingCatalogSnapshot } from './ticketing-catalog-store';
import { readTicketOrderStore, type TicketOrderStoreSnapshot } from './ticket-order-store';
import { readTicketingCatalog } from './ticketing-catalog-store';

export type TicketingOrderCandidate =
  | {
      ok: true;
      fareProduct: TravelFareProduct;
      inventoryPool: TicketInventoryPool;
      ticketing: TravelTicketingAvailability;
    }
  | {
      ok: false;
      ticketing: TravelTicketingAvailability;
    };

export async function attachTicketingAvailability(
  trips: TravelTripInstance[],
): Promise<TravelTripInstance[]> {
  const [catalog, orderStore] = await Promise.all([readTicketingCatalog(), readTicketOrderStore()]);
  return trips.map((trip) => ({
    ...trip,
    ticketing: resolveTicketingAvailability(trip, catalog, orderStore),
  }));
}

export function findTicketingOrderCandidate(input: {
  trip: TravelTripInstance;
  catalog: TicketingCatalogSnapshot;
  orderStore: TicketOrderStoreSnapshot;
  fareProductId?: string;
  passengerCount: number;
  now?: Date;
}): TicketingOrderCandidate {
  const now = input.now ?? new Date();
  const activeFareProducts = getActiveFareProducts(input.catalog.fareProducts, input.trip);
  const candidateFareProducts = input.fareProductId
    ? activeFareProducts.filter((product) => product.fareProductId === input.fareProductId)
    : activeFareProducts;
  const candidateFareProductIds = new Set(
    candidateFareProducts.map((product) => product.fareProductId),
  );
  const candidatePools = getActiveInventoryPools(input.catalog.inventoryPools, input.trip).filter(
    (pool) => candidateFareProductIds.has(pool.fareProductId),
  );
  const poolState = getAvailablePoolStates(candidatePools, input.orderStore.inventoryHolds, now)
    .filter((state) => state.remainingCapacity === undefined || state.remainingCapacity > 0)
    .find(
      (state) =>
        state.remainingCapacity === undefined || state.remainingCapacity >= input.passengerCount,
    );

  const ticketing = resolveTicketingAvailability(
    input.trip,
    input.catalog,
    input.orderStore,
    now,
    input.fareProductId,
  );

  if (!poolState) {
    return {
      ok: false,
      ticketing,
    };
  }

  const fareProduct = candidateFareProducts.find(
    (product) => product.fareProductId === poolState.pool.fareProductId,
  );
  if (!fareProduct) {
    return {
      ok: false,
      ticketing,
    };
  }

  return {
    ok: true,
    fareProduct,
    inventoryPool: poolState.pool,
    ticketing,
  };
}

export function resolveTripNotFoundTicketingAvailability(
  tripInstanceId: string,
): TravelTicketingAvailability {
  return {
    tripInstanceId,
    status: 'trip_not_found',
    orderSupported: false,
    requiresLogin: true,
    message: '没有找到对应班次，无法创建新版票务订单。',
    fareProducts: [],
    inventoryPools: [],
    checkedAt: new Date().toISOString(),
  };
}

function resolveTicketingAvailability(
  trip: TravelTripInstance,
  catalog: TicketingCatalogSnapshot,
  orderStore: TicketOrderStoreSnapshot,
  now = new Date(),
  selectedFareProductId?: string,
): TravelTicketingAvailability {
  const activeFareProducts = getActiveFareProducts(catalog.fareProducts, trip).filter(
    (product) => !selectedFareProductId || product.fareProductId === selectedFareProductId,
  );
  const activeFareProductIds = new Set(activeFareProducts.map((product) => product.fareProductId));
  const activeInventoryPools = getActiveInventoryPools(catalog.inventoryPools, trip).filter(
    (pool) => activeFareProductIds.has(pool.fareProductId),
  );
  const poolStates = getAvailablePoolStates(activeInventoryPools, orderStore.inventoryHolds, now);
  const availablePools = poolStates.filter(
    (state) => state.remainingCapacity === undefined || state.remainingCapacity > 0,
  );
  const availableCapacity = sumAvailableCapacity(availablePools);
  const base = {
    tripInstanceId: trip.tripInstanceId,
    serviceKind: trip.serviceKind,
    requiresLogin: true,
    fareProducts: activeFareProducts.map(toFareProductSummary),
    inventoryPools: poolStates.map(toInventoryPoolSummary),
    availableCapacity,
    bookingUrl: trip.bookingUrl,
    checkedAt: now.toISOString(),
  };

  if (trip.availability === 'not_connected') {
    return {
      ...base,
      status: 'service_not_connected',
      orderSupported: false,
      message: `${trip.serviceLabel}班次尚未接入统一平台。`,
    };
  }

  if (activeFareProducts.length === 0) {
    return {
      ...base,
      status: trip.bookingUrl ? 'legacy_reference_only' : 'fare_not_configured',
      orderSupported: false,
      message: trip.bookingUrl
        ? '新版票务尚未配置票种，可暂时打开旧版参考入口。'
        : '新版票务尚未配置票种，当前只提供班次查询和提醒。',
    };
  }

  if (activeInventoryPools.length === 0) {
    return {
      ...base,
      status: 'inventory_not_configured',
      orderSupported: false,
      message: '新版票务已配置票种，但尚未配置库存或可售容量。',
    };
  }

  if (availablePools.length === 0) {
    return {
      ...base,
      status: 'sold_out',
      orderSupported: false,
      message: '当前班次暂无可售余量。',
    };
  }

  return {
    ...base,
    status: 'order_available',
    orderSupported: true,
    message: '新版票务目录已配置，后续订单创建需要使用临东通账号。',
  };
}

function getActiveFareProducts(
  products: TravelFareProduct[],
  trip: TravelTripInstance,
): TravelFareProduct[] {
  return products.filter(
    (product) => product.status === 'active' && fareProductMatchesTrip(product, trip),
  );
}

function getActiveInventoryPools(
  pools: TicketInventoryPool[],
  trip: TravelTripInstance,
): TicketInventoryPool[] {
  return pools.filter(
    (pool) => pool.status === 'active' && pool.tripInstanceId === trip.tripInstanceId,
  );
}

function fareProductMatchesTrip(product: TravelFareProduct, trip: TravelTripInstance): boolean {
  if (product.serviceKind !== trip.serviceKind) {
    return false;
  }

  if (product.tripInstanceId) {
    return product.tripInstanceId === trip.tripInstanceId;
  }

  if (product.serviceId) {
    return Boolean(trip.serviceId) && product.serviceId === trip.serviceId;
  }

  return true;
}

function toFareProductSummary(product: TravelFareProduct): TravelFareProductSummary {
  return {
    fareProductId: product.fareProductId,
    name: product.name,
    priceAmount: product.priceAmount,
    currency: product.currency,
  };
}

function toInventoryPoolSummary(state: {
  pool: TicketInventoryPool;
  remainingCapacity?: number;
}): TicketInventoryPoolSummary {
  return {
    inventoryPoolId: state.pool.inventoryPoolId,
    fareProductId: state.pool.fareProductId,
    totalCapacity: state.pool.totalCapacity,
    availableCapacity: state.remainingCapacity,
  };
}

function getAvailablePoolStates(
  pools: TicketInventoryPool[],
  holds: TicketInventoryHold[],
  now: Date,
): Array<{ pool: TicketInventoryPool; remainingCapacity?: number }> {
  return pools.map((pool) => {
    if (pool.availableCapacity === undefined) {
      return { pool };
    }

    const heldQuantity = holds
      .filter((hold) => isActiveHoldForPool(hold, pool, now))
      .reduce((total, hold) => total + hold.quantity, 0);
    return {
      pool,
      remainingCapacity: Math.max(pool.availableCapacity - heldQuantity, 0),
    };
  });
}

function isActiveHoldForPool(
  hold: TicketInventoryHold,
  pool: TicketInventoryPool,
  now: Date,
): boolean {
  return (
    hold.inventoryPoolId === pool.inventoryPoolId &&
    (hold.status === 'held' || hold.status === 'confirmed') &&
    new Date(hold.expiresAt).getTime() > now.getTime()
  );
}

function sumAvailableCapacity(pools: Array<{ remainingCapacity?: number }>): number | undefined {
  const capacities = pools
    .map((pool) => pool.remainingCapacity)
    .filter((capacity): capacity is number => capacity !== undefined);
  return capacities.length === pools.length
    ? capacities.reduce((total, capacity) => total + capacity, 0)
    : undefined;
}
