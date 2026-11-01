const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const assert = require('node:assert/strict');
const base = process.env.YCT_TEST_BASE_URL || 'http://127.0.0.1:3333';
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(base).hostname))
  throw new Error('Use a loopback test server');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const context = await browser.newContext();
    await context.route('**/api/**', async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      let data = {
        items: [],
        meta: { sourceStatus: 'ready' },
        snapshot: { markers: [] },
        lines: [],
        results: [],
      };
      if (pathname === '/api/map/markers')
        data.snapshot.markers = [
          {
            id: 'poi-esc',
            label: 'Esc测试地点',
            categoryId: 'commerce',
            geometry: { type: 'Point', coordinates: [100, 200] },
            description: '测试说明',
          },
        ];
      if (pathname === '/api/account/status')
        data = { accountStatus: 'anonymous', badge: { kind: 'none', count: 0, label: '' } };
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const details = () => page.locator('.map-poi-detail-panel');
    const open = async () => {
      await page.goto(base + '/map?marker=poi-esc');
      await details().waitFor({ timeout: 120000 });
    };
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await open();
      const close = details().getByRole('button', { name: '关闭地点信息', exact: true });
      assert.equal(await close.getAttribute('aria-keyshortcuts'), 'Escape');
      assert.equal(await close.getAttribute('title'), null);
      await close.focus();
      await page.keyboard.press('Escape');
      await details().waitFor({ state: 'detached' });
      assert.equal(await page.evaluate(() => document.activeElement?.className), 'map-viewport');

      await open();
      await close.click();
      await details().waitFor({ state: 'detached' });
      assert.equal(await page.evaluate(() => document.activeElement?.className), 'map-viewport');

      await open();
      await details().getByRole('button', { name: '收起地点信息', exact: true }).click();
      await page.keyboard.press('Escape');
      await details().waitFor({ state: 'detached' });

      await open();
      for (const extra of [
        { repeat: true },
        { isComposing: true },
        { ctrlKey: true },
        { altKey: true },
        { metaKey: true },
        { shiftKey: true },
      ]) {
        await page.evaluate(
          (options) =>
            document.body.dispatchEvent(
              new KeyboardEvent('keydown', {
                key: 'Escape',
                bubbles: true,
                cancelable: true,
                ...options,
              }),
            ),
          extra,
        );
        assert.equal(await details().count(), 1);
      }
      await page.evaluate(() => {
        const consume = (event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            document.removeEventListener('keydown', consume);
          }
        };
        document.addEventListener('keydown', consume);
      });
      await page.keyboard.press('Escape');
      assert.equal(await details().count(), 1);
      await page.keyboard.press('Escape');
      await details().waitFor({ state: 'detached' });
      console.log(
        `PASS ${width}px: Esc/close/collapsed details, accessible shortcut metadata, focus fallback, consumed/repeated/composing/modified Escape`,
      );
    }
    await page.setViewportSize({ width: 1280, height: 844 });
    await open();
    await details().getByRole('button', { name: '关闭地点信息', exact: true }).click();
    await details().waitFor({ state: 'detached' });
    const opener = page.locator('.map-marker-list-item').filter({ hasText: 'Esc测试地点' }).first();
    await opener.click();
    await details().getByRole('button', { name: '关闭地点信息', exact: true }).focus();
    await page.keyboard.press('Escape');
    await details().waitFor({ state: 'detached' });
    assert.equal(await page.evaluate(() => document.activeElement?.className), 'map-viewport');
    console.log('PASS focus falls back to map after POI list trigger is replaced');

    await open();
    await details().locator('button[aria-label*="分享"]').first().click();
    await page.locator('.map-share-backdrop').waitFor();
    await page.keyboard.press('Escape');
    await page.locator('.map-share-backdrop').waitFor({ state: 'detached' });
    assert.equal(await details().count(), 1);
    await page.keyboard.press('Escape');
    await details().waitFor({ state: 'detached' });
    console.log('PASS share dialog closes before the underlying POI');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
