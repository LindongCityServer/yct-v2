import type {
  TicketInventoryPool,
  TicketInventoryPoolSummary,
  TravelFareProduct,
  TravelFareProductSummary,
  TravelTicketingAvailability,
  TravelTripInstance,
} from '@yct/contracts';
import { readTicketingCatalog } from './ticketing-catalog-store';

export async function attachTicketingAvailability(
  trips: TravelTripInstance[],
): Promise<TravelTripInstance[]> {
  const catalog = await readTicketingCatalog();
  return trips.map((trip) => ({
    ...trip,
    ticketing: resolveTicketingAvailability(trip, catalog),
  }));
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
  catalog: Awaited<ReturnType<typeof readTicketingCatalog>>,
): TravelTicketingAvailability {
  const activeFareProducts = catalog.fareProducts.filter(
    (product) => product.status === 'active' && fareProductMatchesTrip(product, trip),
  );
  const activeFareProductIds = new Set(activeFareProducts.map((product) => product.fareProductId));
  const activeInventoryPools = catalog.inventoryPools.filter(
    (pool) =>
      pool.status === 'active' &&
      pool.tripInstanceId === trip.tripInstanceId &&
      activeFareProductIds.has(pool.fareProductId),
  );
  const availablePools = activeInventoryPools.filter(
    (pool) => pool.availableCapacity === undefined || pool.availableCapacity > 0,
  );
  const availableCapacity = sumAvailableCapacity(availablePools);
  const base = {
    tripInstanceId: trip.tripInstanceId,
    serviceKind: trip.serviceKind,
    requiresLogin: true,
    fareProducts: activeFareProducts.map(toFareProductSummary),
    inventoryPools: activeInventoryPools.map(toInventoryPoolSummary),
    availableCapacity,
    bookingUrl: trip.bookingUrl,
    checkedAt: new Date().toISOString(),
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

function toInventoryPoolSummary(pool: TicketInventoryPool): TicketInventoryPoolSummary {
  return {
    inventoryPoolId: pool.inventoryPoolId,
    fareProductId: pool.fareProductId,
    totalCapacity: pool.totalCapacity,
    availableCapacity: pool.availableCapacity,
  };
}

function sumAvailableCapacity(pools: TicketInventoryPool[]): number | undefined {
  const capacities = pools
    .map((pool) => pool.availableCapacity)
    .filter((capacity): capacity is number => capacity !== undefined);
  return capacities.length === pools.length
    ? capacities.reduce((total, capacity) => total + capacity, 0)
    : undefined;
}
