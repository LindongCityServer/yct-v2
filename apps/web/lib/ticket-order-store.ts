import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { TicketInventoryHold, TicketOrder } from '@yct/contracts';
import { ticketOrderStoreSnapshotSchema } from '@yct/schemas';
import { readRuntimeConfig } from './runtime-config';

export interface TicketOrderStoreSnapshot {
  version: 1;
  orders: TicketOrder[];
  inventoryHolds: TicketInventoryHold[];
  updatedAt?: string;
}

const emptySnapshot: TicketOrderStoreSnapshot = {
  version: 1,
  orders: [],
  inventoryHolds: [],
};

export async function readTicketOrderStore(): Promise<TicketOrderStoreSnapshot> {
  const storePath = resolveStorePath();

  try {
    const source = await readFile(storePath, 'utf8');
    const parsed = ticketOrderStoreSnapshotSchema.safeParse(JSON.parse(source));
    if (!parsed.success) {
      return emptySnapshot;
    }

    return {
      version: 1,
      orders: parsed.data.orders,
      inventoryHolds: parsed.data.inventoryHolds,
      updatedAt: parsed.data.updatedAt,
    };
  } catch {
    return emptySnapshot;
  }
}

export async function writeTicketOrderStore(
  snapshot: TicketOrderStoreSnapshot,
): Promise<TicketOrderStoreSnapshot> {
  const updated: TicketOrderStoreSnapshot = {
    version: 1,
    orders: snapshot.orders,
    inventoryHolds: snapshot.inventoryHolds,
    updatedAt: new Date().toISOString(),
  };
  const storePath = resolveStorePath();
  await mkdir(path.dirname(storePath), { recursive: true });
  await writeFile(storePath, `${JSON.stringify(updated, null, 2)}\n`, 'utf8');
  return updated;
}

function resolveStorePath(): string {
  const config = readRuntimeConfig();
  return path.isAbsolute(config.ticketOrderStorePath)
    ? config.ticketOrderStorePath
    : path.join(/*turbopackIgnore: true*/ process.cwd(), config.ticketOrderStorePath);
}
