// 用法（先启动本地 Web：pnpm --filter @yct/web exec next dev -p 3333）：
//   node scripts/checks/verify-map-poi-escape-browser.cjs                    // 默认 Chromium + Firefox + WebKit
//   node scripts/checks/verify-map-poi-escape-browser.cjs --browser=chromium // 只跑系统 Edge
//   node scripts/checks/verify-map-poi-escape-browser.cjs --browser=firefox,webkit
// 环境变量：
//   YCT_TEST_BASE_URL       本地服务地址，默认 http://127.0.0.1:3333（仅允许回环地址）
//   PLAYWRIGHT_MODULE_PATH  Playwright 模块路径；未设置时用仓库内的 playwright
// 引擎与 IME 保真度：
//   chromium  系统 Edge，使用 CDP Input.imeSetComposition 注入真实输入法组合态。
//   firefox   页面内派发 compositionstart → isComposing:true 的 keydown → compositionend，属事件层模拟。
//   webkit    同 firefox 的模拟方式；Windows 上的 WebKit 是 Playwright 引擎，不等同于 macOS Safari。
const playwright = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const assert = require('node:assert/strict');

const base = process.env.YCT_TEST_BASE_URL || 'http://127.0.0.1:3333';
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(base).hostname))
  throw new Error('Use a loopback test server');

const engines = {
  chromium: {
    label: 'Chromium(Edge)',
    imeMode: 'CDP 真实组合态',
    launch: () => playwright.chromium.launch({ channel: 'msedge', headless: true }),
    cdp: true,
  },
  firefox: {
    label: 'Firefox',
    imeMode: '事件层模拟',
    launch: () => playwright.firefox.launch({ headless: true }),
    cdp: false,
  },
  webkit: {
    label: 'WebKit',
    imeMode: '事件层模拟（非 macOS Safari）',
    launch: () => playwright.webkit.launch({ headless: true }),
    cdp: false,
  },
};

function parseEngines() {
  const arg = process.argv.find((value) => value.startsWith('--browser='));
  const requested = (arg ? arg.slice('--browser='.length) : 'all').toLowerCase();
  if (requested === 'all') return Object.keys(engines);
  const names = requested.split(',').filter(Boolean);
  const unknown = names.filter((name) => !engines[name]);
  if (unknown.length) throw new Error(`Unknown browser: ${unknown.join(', ')}`);
  return names;
}

async function mockApi(context) {
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
}

async function installEscRecorder(page) {
  await page.evaluate(() => {
    window.__escEvents = [];
    window.addEventListener(
      'keydown',
      (event) => {
        if (
          event.key !== 'Escape' &&
          event.key !== 'Esc' &&
          event.keyCode !== 27 &&
          event.keyCode !== 229
        )
          return;
        window.__escEvents.push({
          key: event.key,
          keyCode: event.keyCode,
          isComposing: event.isComposing,
          defaultPrevented: event.defaultPrevented,
        });
      },
      true,
    );
  });
}

async function runEngine(name) {
  const engine = engines[name];
  const result = {
    name: engine.label,
    engine: name,
    imeMode: engine.imeMode,
    status: 'PASS',
    cases: {},
  };
  let browser;
  try {
    browser = await engine.launch();
  } catch (error) {
    result.status = 'SKIPPED';
    result.reason = error.message.split('\n')[0];
    console.log(`[${name}] SKIPPED: ${result.reason}`);
    return result;
  }

  try {
    const context = await browser.newContext({ locale: 'zh-CN' });
    await mockApi(context);
    const page = await context.newPage();
    const cdp = engine.cdp ? await context.newCDPSession(page) : null;
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    const details = () => page.locator('.map-poi-detail-panel');
    const activeClass = () =>
      page.evaluate(() => document.activeElement?.className || document.activeElement?.tagName);
    const open = async () => {
      await page.goto(base + '/map?marker=poi-esc');
      await details().waitFor({ timeout: 120000 });
      // 面板 DOM 先于 useEffect 注册 document 捕获监听；慢引擎上留一帧以免测到注册前的瞬间。
      await page.waitForTimeout(200);
    };
    const addInput = async (id) => {
      await page.evaluate((inputId) => {
        const input = document.createElement('input');
        input.id = inputId;
        input.style.cssText = 'position:fixed;left:8px;top:8px;z-index:9999';
        document.querySelector('.map-poi-detail-panel').appendChild(input);
        input.focus();
      }, id);
    };
    const readEscEvents = () => page.evaluate(() => window.__escEvents.splice(0));

    const runCase = async (key, fn) => {
      try {
        await fn();
        result.cases[key] = 'PASS';
      } catch (error) {
        result.cases[key] = 'FAIL';
        result.reason = `${key}: ${error.message.split('\n')[0]}`;
      }
    };

    await page.setViewportSize({ width: 1280, height: 844 });

    await runCase('normal', async () => {
      await open();
      const close = details().getByRole('button', { name: '关闭地点信息', exact: true });
      assert.equal(await close.getAttribute('aria-keyshortcuts'), 'Escape');
      assert.equal(await close.getAttribute('title'), null);
      await close.focus();
      await page.keyboard.press('Escape');
      await details().waitFor({ state: 'detached' });
      assert.equal(await activeClass(), 'map-viewport');
    });

    await runCase('closeButton', async () => {
      await open();
      await details().getByRole('button', { name: '关闭地点信息', exact: true }).click();
      await details().waitFor({ state: 'detached' });
      assert.equal(await activeClass(), 'map-viewport');
    });

    await runCase('collapsed', async () => {
      await open();
      await details().getByRole('button', { name: '收起地点信息', exact: true }).click();
      await page.keyboard.press('Escape');
      await details().waitFor({ state: 'detached' });
    });

    await runCase('repeatModifiers', async () => {
      await open();
      for (const extra of [
        { repeat: true },
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
    });

    await runCase('consumed', async () => {
      await open();
      await page.evaluate(() => {
        const consume = (event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            window.removeEventListener('keydown', consume, true);
          }
        };
        window.addEventListener('keydown', consume, true);
      });
      await page.keyboard.press('Escape');
      assert.equal(await details().count(), 1);
      await page.keyboard.press('Escape');
      await details().waitFor({ state: 'detached' });
    });

    await runCase('inputFocus', async () => {
      await open();
      await addInput('__poi_focus_probe');
      await page.keyboard.press('Escape');
      await details().waitFor({ state: 'detached' });
      assert.equal(await activeClass(), 'map-viewport');
    });

    await runCase('ime', async () => {
      await open();
      await addInput('__poi_ime_probe');
      await installEscRecorder(page);
      if (cdp) {
        await cdp.send('Input.imeSetComposition', {
          text: '雨',
          selectionStart: 1,
          selectionEnd: 1,
        });
        await page.keyboard.press('Escape');
      } else {
        // 事件层模拟：先进入 composition，再派发带 isComposing 的 Esc；部分引擎可能忽略该初始化字段。
        await page.evaluate(() => {
          const input = document.querySelector('#__poi_ime_probe');
          input.dispatchEvent(
            new CompositionEvent('compositionstart', { bubbles: true, data: '雨' }),
          );
          input.dispatchEvent(
            new CompositionEvent('compositionupdate', { bubbles: true, data: '雨' }),
          );
          input.dispatchEvent(
            new KeyboardEvent('keydown', {
              key: 'Escape',
              code: 'Escape',
              keyCode: 27,
              which: 27,
              bubbles: true,
              cancelable: true,
              isComposing: true,
            }),
          );
          input.dispatchEvent(
            new CompositionEvent('compositionend', { bubbles: true, data: '雨' }),
          );
        });
      }
      await page.waitForTimeout(800);
      result.imeEvent = (await readEscEvents())[0] || null;
      result.imePanelAfter = await details().count();
      result.imeActiveAfter = await activeClass();
      assert.equal(result.imePanelAfter, 0);
      assert.equal(result.imeActiveAfter, 'map-viewport');
    });

    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await runCase(`w${width}-normal`, async () => {
        await open();
        await details().getByRole('button', { name: '关闭地点信息', exact: true }).focus();
        await page.keyboard.press('Escape');
        await details().waitFor({ state: 'detached' });
        assert.equal(await activeClass(), 'map-viewport');
      });
    }

    await page.setViewportSize({ width: 1280, height: 844 });
    await runCase('focusFallback', async () => {
      await open();
      await details().getByRole('button', { name: '关闭地点信息', exact: true }).click();
      await details().waitFor({ state: 'detached' });
      await page
        .locator('.map-marker-list-item')
        .filter({ hasText: 'Esc测试地点' })
        .first()
        .click();
      await details().getByRole('button', { name: '关闭地点信息', exact: true }).focus();
      await page.keyboard.press('Escape');
      await details().waitFor({ state: 'detached' });
      assert.equal(await activeClass(), 'map-viewport');
    });

    await runCase('shareLayer', async () => {
      await open();
      await details().locator('button[aria-label*="分享"]').first().click();
      await page.locator('.map-share-backdrop').waitFor();
      await page.keyboard.press('Escape');
      await page.locator('.map-share-backdrop').waitFor({ state: 'detached' });
      assert.equal(await details().count(), 1);
      await page.keyboard.press('Escape');
      await details().waitFor({ state: 'detached' });
    });

    result.pageErrors = pageErrors;
    const summary = Object.entries(result.cases)
      .map(([key, value]) => `${key}=${value}`)
      .join(' ');
    console.log(`[${name}] ${summary}`);
    if (result.imeEvent)
      console.log(
        `[${name}] IME event fields: ${JSON.stringify(result.imeEvent)} panelAfter=${result.imePanelAfter} activeAfter=${result.imeActiveAfter}`,
      );
    if (pageErrors.length) result.status = 'FAIL';
  } catch (error) {
    result.status = 'FAIL';
    result.reason = error.message.split('\n')[0];
  } finally {
    await browser.close();
  }

  if (Object.values(result.cases).includes('FAIL')) result.status = 'FAIL';
  return result;
}

(async () => {
  const results = [];
  for (const name of parseEngines()) results.push(await runEngine(name));

  console.log('\nengine\tstatus\tIME 保真度');
  for (const result of results)
    console.log(`${result.engine}\t${result.status}\t${result.imeMode}`);
  const failed = results.filter((result) => result.status === 'FAIL');
  if (failed.length) {
    for (const result of failed)
      console.error(`${result.engine}: ${result.reason || 'case failed'}`);
    process.exitCode = 1;
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
