import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { RideFareRule, RideGateDeviceConfig } from '@yct/contracts';
import { readRuntimeConfig } from './runtime-config';

interface RideGateConfigSnapshot {
  version: 1;
  devices: RideGateDeviceConfig[];
  fareRules: RideFareRule[];
}

const emptySnapshot: RideGateConfigSnapshot = {
  version: 1,
  devices: [],
  fareRules: [],
};

export async function findEnabledRideGateDevice(
  deviceId: string,
): Promise<RideGateDeviceConfig | undefined> {
  const snapshot = await readSnapshot();
  return snapshot.devices.find((device) => device.id === deviceId && device.enabled);
}

export async function calculateRideFare(input: {
  fareProfileId: string;
  entryStationId: string;
  exitStationId: string;
}): Promise<string | undefined> {
  const snapshot = await readSnapshot();
  const rule = snapshot.fareRules.find(
    (candidate) =>
      candidate.fareProfileId === input.fareProfileId &&
      candidate.entryStationId === input.entryStationId &&
      candidate.exitStationId === input.exitStationId,
  );
  return rule && isNonNegativeDecimal(rule.fareValue) ? rule.fareValue : undefined;
}

async function readSnapshot(): Promise<RideGateConfigSnapshot> {
  const storePath = resolveStorePath();

  try {
    const source = await readFile(storePath, 'utf8');
    const parsed = JSON.parse(source) as RideGateConfigSnapshot;
    return {
      version: 1,
      devices: Array.isArray(parsed.devices) ? parsed.devices : [],
      fareRules: Array.isArray(parsed.fareRules) ? parsed.fareRules : [],
    };
  } catch {
    return emptySnapshot;
  }
}

function resolveStorePath(): string {
  const config = readRuntimeConfig();
  return path.isAbsolute(config.rideGateConfigStorePath)
    ? config.rideGateConfigStorePath
    : path.join(/*turbopackIgnore: true*/ process.cwd(), config.rideGateConfigStorePath);
}

function isNonNegativeDecimal(value: string): boolean {
  return /^\d+(?:\.\d{1,6})?$/.test(value) && Number(value) >= 0;
}
