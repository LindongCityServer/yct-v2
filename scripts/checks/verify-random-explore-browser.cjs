const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const assert = require('node:assert/strict');
const base = process.env.YCT_TEST_BASE_URL || 'http://127.0.0.1:3313';
if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(base).hostname))
  throw new Error('Browser checks require a loopback test server');
const meta = { sourceStatus: 'ready', fetchedAt: new Date().toISOString() };
const poi = {
  id: 'poi-a',
  label: '彩蛋商店',
  categoryId: 'commerce',
  geometry: { type: 'Point', coordinates: [100, 200] },
  description: '彩蛋测试资料',
};
const line = {
  id: 'transit-line-open',
  label: '彩蛋运营线',
  categoryId: 'transit-line',
  geometry: {
    type: 'MultiPoint',
    coordinates: [
      [0, 0],
      [100, 200],
    ],
  },
  transitLineSegments: [
    {
      coordinates: [
        [0, 0],
        [100, 200],
      ],
      operationStatus: 'operating',
    },
  ],
};
const overview = {
  meta,
  summary: [],
  lines: [
    {
      id: 'open',
      name: '彩蛋运营线',
      mode: 'bus',
      operationStatus: 'operating',
      stationCount: 2,
      stationNames: ['甲站', '乙站'],
      stationStops: [
        { stationName: '甲站', x: 0, z: 0 },
        { stationName: '乙站', x: 100, z: 200 },
      ],
      firstStationName: '甲站',
      lastStationName: '乙站',
    },
  ],
};
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const context = await browser.newContext();
    let mode = 'normal',
      failures = 0,
      delayed = false,
      fullLoads = 0;
    const errors = [];
    await context.addInitScript(() => {
      Math.random = () => 0.1;
    });
    await context.route('**/api/**', async (route) => {
      const req = route.request(),
        p = new URL(req.url()).pathname;
      let status = 200,
        data = {
          meta,
          items: [],
          lines: [],
          snapshot: { markers: [] },
          trips: [],
          results: [],
          groups: [],
        };
      if (p === '/api/map/markers') {
        fullLoads++;
        if (delayed) await new Promise((r) => setTimeout(r, 800));
        if (failures > 0) {
          failures--;
          status = 503;
          data = { error: 'fixture_unavailable', message: '模拟失败' };
        } else {
          const extra =
            mode === 'ask'
              ? Array.from({ length: 20 }, (_, i) => ({
                  ...poi,
                  id: `ask-${i}`,
                  label: `随机地点${i}`,
                }))
              : [];
          data = {
            meta,
            snapshot: {
              markers: mode === 'empty' ? [] : mode === 'one' ? [poi] : [poi, line, ...extra],
            },
          };
        }
      }
      if (p === '/api/transit/overview')
        data = mode === 'empty' || mode === 'one' ? { meta, lines: [], summary: [] } : overview;
      if (p === '/api/account/status')
        data = { accountStatus: 'anonymous', badge: { kind: 'none', count: 0, label: '' } };
      if (p === '/api/operations') data = { meta, items: [] };
      await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
    });
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    const trigger = () => page.locator('.topbar-page-title').click();
    const title = () => page.locator('#map-poi-detail-title');
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 844 });
      mode = 'normal';
      await page.goto(base + '/map');
      await trigger();
      await title().waitFor();
      assert.equal(await page.getByText('正在寻找一个好去处…', { exact: true }).count(), 0);
      const resultToast = page.locator('.app-toast').filter({ hasText: '手气不错：' });
      await resultToast.waitFor();
      await resultToast.waitFor({ state: 'hidden', timeout: 3000 });
      const first = await title().textContent();
      const loads = fullLoads;
      await page.locator('.topbar-page-title').focus();
      await page.keyboard.press('Enter');
      await page.waitForFunction(
        (previous) => document.querySelector('#map-poi-detail-title')?.textContent !== previous,
        first,
      );
      assert.ok(['彩蛋商店', '彩蛋运营线'].includes(await title().textContent()));
      assert.equal(fullLoads, loads, 'repeat selection reuses loaded markers');
      console.log(
        `PASS ${width}px: no waiting toast, short-lived result, title click/keyboard, POI/line details, no immediate repeat or candidate refetch`,
      );
    }
    mode = 'one';
    await page.goto(base + '/map?lucky=one');
    await title().waitFor();
    assert.equal(await title().textContent(), '彩蛋商店');
    await trigger();
    await title().waitFor();
    assert.equal(await title().textContent(), '彩蛋商店');
    console.log('PASS single candidate remains usable');
    mode = 'empty';
    await page.goto(base + '/map?lucky=empty');
    await page.getByText('暂时没有可探索的地点或运营线路。', { exact: true }).waitFor();
    assert.equal(await title().count(), 0);
    console.log('PASS empty candidate list reports status');
    mode = 'normal';
    failures = 1;
    await page.goto(base + '/map?lucky=failed');
    await page.getByText('暂时无法读取探索资料，请再次点击标题重试。', { exact: true }).waitFor();
    await trigger();
    await title().waitFor();
    console.log('PASS failed marker request retries from title and recovers');
    delayed = true;
    await page.goto(base + '/map?lucky=initial-delayed');
    await trigger();
    await trigger();
    await title().waitFor();
    assert.ok(new URL(page.url()).searchParams.has('lucky'));
    delayed = false;
    console.log('PASS delayed data and rapid title clicks resolve to a valid target');
    mode = 'ask';
    await page.goto(base + '/ask');
    await page.locator('.global-search-suggestion').first().waitFor();
    const input = page.locator('textarea.global-search-input').first();
    const before = await page.locator('.global-search-suggestion').allTextContents();
    await page.evaluate(() => {
      Math.random = () => 0.7;
    });
    await page.getByRole('button', { name: '换一批', exact: true }).click();
    await page.waitForFunction(
      (previous) =>
        JSON.stringify(
          [...document.querySelectorAll('.global-search-suggestion')].map((e) => e.textContent),
        ) !== JSON.stringify(previous),
      before,
    );
    const after = await page.locator('.global-search-suggestion').allTextContents();
    assert.equal(new Set(after).size, after.length);
    const expectedQuery = await page
      .locator('.global-search-suggestion')
      .first()
      .locator('span')
      .last()
      .textContent();
    await page.locator('.global-search-suggestion').first().click();
    assert.equal(await input.inputValue(), expectedQuery);
    assert.equal(new URL(page.url()).pathname, '/ask');
    assert.equal(errors.length, 0, errors.join('\n'));
    console.log(
      'PASS Ask random refresh changes unique suggestions and preserves input-only clicks',
    );
    // A title on another page should also enter the map and perform exploration.
    await trigger();
    await page.waitForURL((url) => url.pathname === '/map');
    await title().waitFor();
    console.log('PASS cross-page title enters map and selects a target');
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
