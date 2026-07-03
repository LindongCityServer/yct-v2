import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { TicketInventoryPool, TravelFareProduct } from '@yct/contracts';
import { ticketingCatalogSnapshotSchema } from '@yct/schemas';
import { readRuntimeConfig } from './runtime-config';

export interface TicketingCatalogSnapshot {
  version: 1;
  fareProducts: TravelFareProduct[];
  inventoryPools: TicketInventoryPool[];
  updatedAt?: string;
  updatedBy?: string;
}

const emptySnapshot: TicketingCatalogSnapshot = {
  version: 1,
  fareProducts: [],
  inventoryPools: [],
};

export async function readTicketingCatalog(): Promise<TicketingCatalogSnapshot> {
  const storePath = resolveStorePath();

  try {
    const source = await readFile(storePath, 'utf8');
    const parsed = ticketingCatalogSnapshotSchema.safeParse(JSON.parse(source));
    if (!parsed.success) {
      return emptySnapshot;
    }

    return {
      version: 1,
      fareProducts: parsed.data.fareProducts,
      inventoryPools: parsed.data.inventoryPools,
      updatedAt: parsed.data.updatedAt,
      updatedBy: parsed.data.updatedBy,
    };
  } catch {
    return emptySnapshot;
  }
}

function resolveStorePath(): string {
  const config = readRuntimeConfig();
  return path.isAbsolute(config.ticketingCatalogStorePath)
    ? config.ticketingCatalogStorePath
    : path.join(/*turbopackIgnore: true*/ process.cwd(), config.ticketingCatalogStorePath);
}
