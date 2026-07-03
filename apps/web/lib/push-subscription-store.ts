import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { PushDeviceSubscription } from '@yct/contracts';
import { readRuntimeConfig } from './runtime-config';

interface PushSubscriptionStoreSnapshot {
  version: 1;
  subscriptions: PushDeviceSubscription[];
}

const emptySnapshot: PushSubscriptionStoreSnapshot = {
  version: 1,
  subscriptions: [],
};

export async function listActivePushSubscriptionsForUser(
  userId: string,
): Promise<PushDeviceSubscription[]> {
  const snapshot = await readSnapshot();
  return snapshot.subscriptions
    .filter((subscription) => subscription.userId === userId && subscription.status === 'active')
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function upsertPushSubscription(input: {
  userId: string;
  ldpassUserId: string;
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  userAgent?: string;
}): Promise<{ subscription: PushDeviceSubscription; created: boolean }> {
  const snapshot = await readSnapshot();
  const now = new Date().toISOString();
  const subscriptionId = createSubscriptionId(input.endpoint);
  const existing = snapshot.subscriptions.find(
    (subscription) => subscription.subscriptionId === subscriptionId,
  );

  const subscription: PushDeviceSubscription = {
    subscriptionId,
    userId: input.userId,
    ldpassUserId: input.ldpassUserId,
    endpoint: input.endpoint,
    keys: input.keys,
    userAgent: input.userAgent,
    status: 'active',
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    lastSeenAt: now,
  };

  await writeSnapshot({
    ...snapshot,
    subscriptions: existing
      ? snapshot.subscriptions.map((item) =>
          item.subscriptionId === subscriptionId ? subscription : item,
        )
      : [...snapshot.subscriptions, subscription],
  });

  return { subscription, created: !existing };
}

export async function revokePushSubscription(input: {
  userId: string;
  endpoint?: string;
  subscriptionId?: string;
}): Promise<PushDeviceSubscription | null> {
  if (!input.endpoint && !input.subscriptionId) {
    return null;
  }

  const snapshot = await readSnapshot();
  const subscriptionId = input.subscriptionId ?? createSubscriptionId(input.endpoint ?? '');
  const existing = snapshot.subscriptions.find(
    (subscription) =>
      subscription.userId === input.userId &&
      (subscription.subscriptionId === subscriptionId || subscription.endpoint === input.endpoint),
  );

  if (!existing) {
    return null;
  }

  const now = new Date().toISOString();
  const revoked: PushDeviceSubscription = {
    ...existing,
    status: 'revoked',
    updatedAt: now,
    revokedAt: now,
  };

  await writeSnapshot({
    ...snapshot,
    subscriptions: snapshot.subscriptions.map((subscription) =>
      subscription.subscriptionId === existing.subscriptionId ? revoked : subscription,
    ),
  });

  return revoked;
}

async function readSnapshot(): Promise<PushSubscriptionStoreSnapshot> {
  const storePath = resolveStorePath();

  try {
    const source = await readFile(storePath, 'utf8');
    const parsed = JSON.parse(source) as PushSubscriptionStoreSnapshot;
    return {
      version: 1,
      subscriptions: Array.isArray(parsed.subscriptions) ? parsed.subscriptions : [],
    };
  } catch {
    return emptySnapshot;
  }
}

async function writeSnapshot(snapshot: PushSubscriptionStoreSnapshot): Promise<void> {
  const storePath = resolveStorePath();
  await mkdir(path.dirname(storePath), { recursive: true });
  await writeFile(storePath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
}

function resolveStorePath(): string {
  const config = readRuntimeConfig();
  return path.isAbsolute(config.pushSubscriptionStorePath)
    ? config.pushSubscriptionStorePath
    : path.join(/*turbopackIgnore: true*/ process.cwd(), config.pushSubscriptionStorePath);
}

function createSubscriptionId(endpoint: string): string {
  return `push_${createHash('sha256').update(endpoint).digest('hex').slice(0, 32)}`;
}
