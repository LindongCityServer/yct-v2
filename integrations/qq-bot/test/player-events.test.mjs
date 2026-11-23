import assert from 'node:assert/strict';
import test from 'node:test';
import { PlayerEventMonitor } from '../src/player-events.mjs';

test('玩家进出轮询首次建立基线，之后只发变化', async () => {
  let online = ['小明'];
  const events = [];
  const monitor = new PlayerEventMonitor({
    baseUrl: 'http://127.0.0.1:3300',
    intervalMs: 10_000,
    onEvent: (event) => events.push(event),
    fetchImpl: async () => ({
      ok: true,
      async json() {
        return {
          snapshot: {
            markers: online.map((name) => ({
              label: name,
              playerLocation: { presence: 'online', serverAccountName: name },
            })),
          },
        };
      },
    }),
  });

  await monitor.poll();
  assert.deepEqual(events, []);

  online = ['小明', '小红'];
  await monitor.poll();
  assert.deepEqual(events, [{ type: 'join', name: '小红' }]);

  online = ['小红'];
  await monitor.poll();
  assert.deepEqual(events, [
    { type: 'join', name: '小红' },
    { type: 'leave', name: '小明' },
  ]);
});

test('没有 YCT 地址时不启动轮询', () => {
  const monitor = new PlayerEventMonitor({
    baseUrl: '',
    onEvent: () => {},
  });

  assert.equal(monitor.enabled, false);
});
