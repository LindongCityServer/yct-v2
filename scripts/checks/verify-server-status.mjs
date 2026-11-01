import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createBedrockStatusChecker } from '../../apps/web/lib/bedrock-server-status.ts';
import {
  mergePlayerLocationObservation,
  readPlayerLocationSnapshot,
} from '../../apps/web/lib/player-location-store.ts';
import { syncPlayerLocations } from '../../apps/web/lib/player-location-workflow.ts';
import { readOperationsServerStatus } from '../../apps/web/lib/operations-server-status.ts';
import { getAppEventBus } from '../../apps/web/lib/app-event-bus.ts';

const response = (online, now = Date.now(), expires = now + 60_000) =>
  Response.json({ online, retrieved_at: now, expires_at: expires });

test('MCBE checker validates freshness, coalesces calls and separates probe errors from offline', async () => {
  let time = Date.now();
  let calls = 0;
  let mode = 'online';
  const check = createBedrockStatusChecker(
    async (url, options) => {
      calls++;
      assert.equal(url.origin, 'https://api.mcstatus.io');
      assert.equal(decodeURIComponent(url.pathname), '/v2/status/bedrock/example.com:19132');
      assert.equal(options.cache, 'no-store');
      if (mode === 'rate-limit') return new Response('Too many requests', { status: 429 });
      if (mode === 'malformed') return Response.json({ online: 'false' });
      if (mode === 'stale') return response(false, time - 180_000, time - 120_000);
      if (mode === 'future') return response(false, time + 60_000, time + 120_000);
      if (mode === 'invalid-json') return new Response('{');
      if (mode === 'network-error') throw new Error('Network unavailable');
      return response(mode === 'online', time, time + 5_000);
    },
    () => time,
  );
  const first = await Promise.all(
    Array.from({ length: 10 }, () => check('example.com:19132', 1000)),
  );
  assert.equal(calls, 1);
  assert.ok(first.every((item) => item.availability === 'online'));
  mode = 'offline';
  time += 6_000; // Provider expires_at expires before the local 30-second cache.
  const expired = await Promise.all(
    Array.from({ length: 10 }, () => check('example.com:19132', 1000)),
  );
  assert.ok(expired.every((item) => item.availability === 'offline'));
  assert.equal(calls, 2);
  for (mode of ['rate-limit', 'malformed', 'stale', 'future', 'invalid-json', 'network-error']) {
    time += 31_000;
    assert.equal((await check('example.com:19132', 1000)).availability, 'unknown', mode);
  }
  const previousCalls = calls;
  assert.equal((await check('https://invalid.example', 1000)).availability, 'unknown');
  assert.equal((await check('example.com:99999', 1000)).availability, 'unknown');
  assert.equal(calls, previousCalls);
  const timeoutCheck = createBedrockStatusChecker(
    (_url, { signal }) =>
      new Promise((_resolve, reject) =>
        signal.addEventListener('abort', () => reject(new Error('timeout'))),
      ),
  );
  assert.equal((await timeoutCheck('example.com:19132', 100)).availability, 'unknown');
});

test('map-first workflow persists all-offline transitions, emits once and restores only with online evidence', async (t) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'yct-server-status-'));
  const oldEnv = { ...process.env };
  const oldFetch = globalThis.fetch;
  const oldNow = Date.now;
  let clock = oldNow();
  Date.now = () => clock;
  process.env.YCT_RUNTIME_ROOT = temporary;
  process.env.YCT_PLAYER_LOCATION_STORE_PATH = path.join(temporary, 'players.json');
  process.env.YCT_EVENT_OUTBOX_STORE_PATH = path.join(temporary, 'events.json');
  process.env.YCT_MARKER_BDSLM_BASE_URL = 'http://map.example:19136';
  process.env.YCT_BEDROCK_SERVER_ADDRESS = 'example.com:19132';
  let mapAvailable = true;
  let external = 'online';
  const requests = [];
  const events = [];
  const unsubscribe = [
    'PlayerLocationPresenceChanged',
    'ServerStatusObserved',
    'PlayerLocationsObserved',
  ].map((type) =>
    getAppEventBus().subscribe(type, (event) => {
      events.push(event);
    }),
  );
  globalThis.fetch = async (input) => {
    const url = new URL(input);
    requests.push(url.hostname);
    if (url.hostname === 'map.example') {
      if (!mapAvailable) throw new Error('Map unavailable');
      return Response.json([
        { text: 'Alice', x: 100, z: 200 },
        { text: 'Bob', x: -10, z: -20 },
      ]);
    }
    assert.equal(url.hostname, 'api.mcstatus.io');
    return external === 'error'
      ? new Response('Unavailable', { status: 503 })
      : response(external === 'online');
  };
  const advance = () => {
    clock += 31_000;
    requests.length = 0;
    events.length = 0;
  };
  try {
    await t.test(
      'map success remains online after third-party online; concurrent readers share probes',
      async () => {
        const results = await Promise.all(Array.from({ length: 10 }, () => syncPlayerLocations()));
        assert.ok(results.every((item) => item.status === 'ready' && item.onlineCount === 2));
        assert.deepEqual(requests, ['map.example', 'api.mcstatus.io']);
        const status = await readOperationsServerStatus();
        assert.equal(status.item.availability, 'online');
        assert.equal(status.item.onlinePlayerCount, 2);
      },
    );
    const before = await readPlayerLocationSnapshot();
    let offlineSince;
    await t.test(
      'external offline wins over a working map and marks every stored player offline',
      async () => {
        advance();
        external = 'offline';
        const result = await syncPlayerLocations();
        assert.equal(result.status, 'unavailable');
        assert.equal(result.onlineCount, 0);
        assert.match(result.message, /外网离线，不可访问/);
        assert.ok(result.snapshot.locations.every((player) => player.presence === 'offline'));
        assert.equal(result.snapshot.lastSuccessfulSyncAt, before.lastSuccessfulSyncAt);
        assert.deepEqual(
          result.snapshot.locations.map(({ x, z, lastSeenAt }) => ({ x, z, lastSeenAt })),
          before.locations.map(({ x, z, lastSeenAt }) => ({ x, z, lastSeenAt })),
        );
        assert.equal(
          events.filter((event) => event.type === 'PlayerLocationPresenceChanged').length,
          2,
        );
        const status = await readOperationsServerStatus();
        assert.equal(status.item.availability, 'offline');
        assert.equal(status.item.onlinePlayerCount, 0);
        offlineSince = result.snapshot.locations.map((player) => player.offlineSince);
      },
    );
    await t.test(
      'repeated offline preserves offlineSince and does not emit duplicate transitions',
      async () => {
        advance();
        const result = await syncPlayerLocations();
        assert.equal(result.changed, false);
        assert.deepEqual(
          result.snapshot.locations.map((player) => player.offlineSince),
          offlineSince,
        );
        assert.deepEqual(events, []);
      },
    );
    await t.test('detector failure does not resurrect externally offline players', async () => {
      advance();
      external = 'error';
      const result = await syncPlayerLocations();
      assert.equal(result.status, 'unavailable');
      assert.ok(result.snapshot.locations.every((player) => player.presence === 'offline'));
      assert.match(result.message, /等待在线确认/);
    });
    await t.test(
      'an intervening map outage preserves unresolved external offline state',
      async () => {
        advance();
        mapAvailable = false;
        await syncPlayerLocations();
        advance();
        mapAvailable = true;
        const result = await syncPlayerLocations();
        assert.equal(result.status, 'unavailable');
        assert.equal(result.snapshot.unavailableReason, 'external_offline');
        assert.ok(result.snapshot.locations.every((player) => player.presence === 'offline'));
      },
    );
    await t.test(
      'positive external evidence restores actual map players and emits recovery',
      async () => {
        advance();
        external = 'online';
        const result = await syncPlayerLocations();
        assert.equal(result.status, 'ready');
        assert.equal(result.snapshot.unavailableReason, undefined);
        assert.ok(
          result.snapshot.locations.every(
            (player) => player.presence === 'online' && !player.offlineSince,
          ),
        );
        assert.equal(
          events.filter((event) => event.type === 'PlayerLocationPresenceChanged').length,
          2,
        );
        assert.ok(
          events.some(
            (event) =>
              event.type === 'ServerStatusObserved' && event.payload.availability === 'online',
          ),
        );
      },
    );
    await t.test('map failure has priority, skips third party and persists offline', async () => {
      advance();
      mapAvailable = false;
      const result = await syncPlayerLocations();
      assert.equal(result.status, 'unavailable');
      assert.deepEqual(requests, ['map.example']);
      assert.ok(result.snapshot.locations.every((player) => player.presence === 'offline'));
      const persisted = JSON.parse(
        await readFile(process.env.YCT_PLAYER_LOCATION_STORE_PATH, 'utf8'),
      );
      assert.equal(persisted.unavailableReason, 'map_unavailable');
      assert.ok(persisted.locations.every((player) => player.presence === 'offline'));
    });
    await t.test(
      'a detector error alone does not override recovered map availability',
      async () => {
        advance();
        mapAvailable = true;
        external = 'error';
        const result = await syncPlayerLocations();
        assert.equal(result.status, 'ready');
        assert.equal(result.onlineCount, 2);
        assert.match(result.message, /尚未完成外网确认/);
      },
    );
    await t.test('a legacy online snapshot also becomes offline when the map fails', async () => {
      advance();
      mapAvailable = false;
      await mergePlayerLocationObservation({
        observedAt: '2026-10-01T00:00:00Z',
        latencyMs: 1,
        locations: [{ playerName: 'Legacy', x: 3, z: 4 }],
      });
      const result = await syncPlayerLocations();
      assert.ok(result.snapshot.locations.every((player) => player.presence === 'offline'));
    });
  } finally {
    unsubscribe.forEach((stop) => stop());
    globalThis.fetch = oldFetch;
    Date.now = oldNow;
    for (const key of Object.keys(process.env)) if (!(key in oldEnv)) delete process.env[key];
    Object.assign(process.env, oldEnv);
    await rm(temporary, { recursive: true, force: true });
  }
});
