import type { TransitTripLabelPool } from '@yct/contracts';
import {
  readTransitTripLabelPools,
  writeTransitTripLabelPools,
} from './transit-trip-label-pool-store';
import { clearTransitOverviewCache } from './transit-data';

export interface TransitTripLabelPoolActionResult {
  ok: boolean;
  pools?: TransitTripLabelPool[];
  status?: number;
  error?: string;
  message?: string;
}

export async function listTransitTripLabelPools(): Promise<TransitTripLabelPool[]> {
  return readTransitTripLabelPools();
}

export async function updateTransitTripLabelPools(input: {
  actorId: string;
  actorName?: string;
  pools: TransitTripLabelPool[];
}): Promise<TransitTripLabelPoolActionResult> {
  const pools = await writeTransitTripLabelPools({
    actorId: input.actorId,
    actorName: input.actorName,
    pools: input.pools,
  });
  // 概览缓存里带有按标签池算出的班次标签，池内容变化后必须立即重算。
  clearTransitOverviewCache();

  return { ok: true, pools };
}
