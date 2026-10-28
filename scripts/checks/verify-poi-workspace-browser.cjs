/**
 * Optional browser regression against a running local build; all API data is mocked.
 * Requires Playwright plus an installed Microsoft Edge browser. Provide the module
 * via PLAYWRIGHT_MODULE_PATH if Playwright is not resolvable from this checkout.
 * Start the local app, then run pnpm poi:browser:check (POI_TEST_BASE_URL is optional).
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const base = process.env.POI_TEST_BASE_URL || 'http://127.0.0.1:3107';
if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(base).hostname)) {
  throw new Error('Browser regression must use a local test server, never production.');
}
const artifactDirectory = 'tmp/poi-workspace-browser';
fs.mkdirSync(artifactDirectory, { recursive: true });
const results = [];
const poi = {
  id: 'local_poi_test',
  profileId: 'lindong',
  title: '测试商店',
  categoryId: 'commerce',
  description: '原始简介',
  geometry: { type: 'Point', coordinates: [100, 200] },
  facilities: [],
  visibility: 'public',
  status: 'published',
  submittedBy: 'tester',
  publishedAt: '2026-10-28T00:00:00Z',
};
const legacy = {
  id: 'unmined-marker-test--300--400',
  label: '测试旧店',
  categoryId: 'commerce',
  description: '旧店简介',
  geometry: { type: 'Point', coordinates: [300, 400] },
  facilities: [],
};
let failSave = false,
  patches = 0;
async function run() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on('pageerror', (error) => console.log('PAGEERROR:', error.message));
  await context.route('**/api/**', async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      path = url.pathname;
    let data = { items: [] },
      status = 200;
    if (request.method() === 'PATCH' && path.includes('/api/admin/map/')) {
      if (failSave) {
        status = 500;
        data = { message: '模拟保存失败' };
      } else {
        patches++;
        const target = path.includes('/legacy-markers/') ? legacy : poi;
        Object.assign(target, request.postDataJSON());
        data = target;
      }
    } else if (path === '/api/admin/map/poi-submissions') data = { items: [poi] };
    else if (path === '/api/admin/map/poi-categories')
      data = {
        items: [
          {
            id: 'commerce',
            name: '商业',
            acceptsPublicSubmissions: true,
            sortOrder: 0,
            iconMapping: { defaultIconFileName: '', iconFileNames: [] },
          },
        ],
      };
    else if (path === '/api/map/markers') data = { snapshot: { markers: [legacy] } };
    else if (path.includes('session'))
      data = {
        authenticated: true,
        user: { id: 'tester', username: 'tester', roles: ['admin'] },
        roles: ['admin'],
      };
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
  });
  async function openModal(target) {
    await page.goto(base + '/admin/map-poi', { waitUntil: 'domcontentloaded' });
    await page.getByText('已读取 1 条 POI 投稿', { exact: true }).waitFor();
    await page.locator('select').first().selectOption('all');
    await page.locator('select').nth(1).selectOption('commerce');
    await page.getByPlaceholder('标题、分类、投稿人、链接').fill('测试');
    const row = page
      .locator('.admin-poi-item, .admin-poi-legacy-marker-item')
      .filter({ hasText: target.title ?? target.label })
      .first();
    await row
      .getByRole('button', { name: target === legacy ? '编辑' : '修正资料', exact: true })
      .click();
    await page.locator('.admin-poi-edit-dialog').waitFor();
  }
  async function enter(workspace) {
    await page
      .locator('.admin-poi-edit-dialog')
      .getByRole('link', {
        name: `打开${workspace === 'intro' ? '简介' : '几何'}工作台`,
        exact: true,
      })
      .click();
    await page.waitForURL((url) =>
      url.pathname.endsWith(workspace === 'intro' ? '/intro-editor' : '/editor'),
    );
    await page
      .getByRole('button', { name: workspace === 'intro' ? '保存简介' : '保存几何', exact: true })
      .waitFor();
  }
  async function returned() {
    await page.waitForURL(
      (url) => url.pathname === '/admin/map-poi' && url.searchParams.get('edit') === '1',
    );
    await page.locator('.admin-poi-edit-dialog').waitFor();
    assert.equal(await page.getByPlaceholder('标题、分类、投稿人、链接').inputValue(), '测试');
    assert.equal(await page.locator('select').first().inputValue(), 'all');
    assert.equal(await page.locator('select').nth(1).inputValue(), 'commerce');
  }
  try {
    if (!process.env.POI_EXTRA_ONLY) {
      for (const target of [poi, legacy]) {
        if (target === legacy) await page.setViewportSize({ width: 390, height: 844 });
        for (const workspace of ['intro', 'geometry']) {
          await openModal(target);
          await enter(workspace);
          if (workspace === 'intro')
            await page.locator('textarea').first().fill(`${target.id} 已更新简介`);
          else await page.getByLabel('X', { exact: true }).fill('125');
          await page
            .getByRole('button', {
              name: workspace === 'intro' ? '保存简介' : '保存几何',
              exact: true,
            })
            .click();
          await returned();
          assert.equal(
            await page.locator('.admin-poi-edit-dialog input').first().inputValue(),
            target.title ?? target.label,
          );
          if (workspace === 'intro') assert.equal(target.description, `${target.id} 已更新简介`);
          else assert.equal(target.geometry.coordinates[0], 125);
          // Re-saving the returned form must retain the workbench's new fields.
          const before = JSON.parse(JSON.stringify(target));
          await page
            .locator('.admin-poi-edit-dialog')
            .getByRole('button', { name: /^保存(修改|修正)$/ })
            .click();
          await page.locator('.admin-poi-edit-dialog').waitFor({ state: 'detached' });
          assert.equal(target.description, before.description);
          assert.deepEqual(target.geometry, before.geometry);
          assert.equal(new URL(page.url()).searchParams.has('edit'), false);
          results.push(
            `PASS ${target === poi ? 'submission desktop' : 'legacy mobile'} ${workspace}: save returns to same modal, state restored, resave retains update`,
          );
          console.log(results.at(-1));
        }
      }
      await page.setViewportSize({ width: 1280, height: 800 });
      await openModal(poi);
      await enter('intro');
      await page.reload();
      await page.locator('textarea').first().fill('失败时保留的简介');
      failSave = true;
      await page.getByRole('button', { name: '保存简介', exact: true }).click();
      await page.getByText('模拟保存失败', { exact: true }).waitFor();
      assert.equal(new URL(page.url()).pathname, '/admin/map-poi/intro-editor');
      assert.equal(await page.locator('textarea').first().inputValue(), '失败时保留的简介');
      failSave = false;
      const beforeShortcut = patches;
      await page.keyboard.press('Control+Enter');
      await returned();
      assert.equal(patches, beforeShortcut + 1);
      results.push(
        'PASS workbench refresh, failed save retains input, Ctrl+Enter saves once and restores modal',
      );
      console.log(results.at(-1));
      await page
        .locator('.admin-poi-edit-dialog')
        .getByRole('button', { name: '取消', exact: true })
        .click();
      await openModal(poi);
      const titleInput = page.locator('.admin-poi-edit-dialog input').first();
      await titleInput.fill('测试未保存新名称');
      await page
        .locator('.admin-poi-edit-dialog')
        .getByRole('link', { name: '打开简介工作台', exact: true })
        .click();
      await page.getByRole('alert', { name: '进入工作台前处理未保存修改' }).waitFor();
      await page.getByRole('alert').getByRole('button', { name: '取消', exact: true }).click();
      assert.equal(await titleInput.inputValue(), '测试未保存新名称');
      assert.equal(new URL(page.url()).pathname, '/admin/map-poi');
      await page
        .locator('.admin-poi-edit-dialog')
        .getByRole('link', { name: '打开简介工作台', exact: true })
        .click();
      failSave = true;
      await page.getByRole('button', { name: '保存并进入', exact: true }).click();
      await page.getByText('模拟保存失败', { exact: true }).waitFor();
      assert.equal(new URL(page.url()).pathname, '/admin/map-poi');
      failSave = false;
      await page.getByRole('button', { name: '保存并进入', exact: true }).click();
      await page.waitForURL((url) => url.pathname.endsWith('/intro-editor'));
      assert.equal(poi.title, '测试未保存新名称');
      results.push(
        'PASS dirty source: cancel preserves input, failed save stays, save-and-enter persists then navigates',
      );
      console.log(results.at(-1));
      // Direct visits have no return context and therefore return to the list.
      await page.goto(base + '/admin/map-poi/intro-editor?markerId=local_poi_test');
      await page.getByRole('button', { name: '保存简介', exact: true }).click();
      await page.waitForURL((url) => url.pathname === '/admin/map-poi' && !url.search);
      await page.getByPlaceholder('标题、分类、投稿人、链接').waitFor();
      assert.equal(await page.locator('.admin-poi-edit-dialog').count(), 0);
      results.push('PASS direct workspace visit saves back to ordinary list');
      console.log(results.at(-1));
    }
    await openModal(poi);
    const originalTitle = poi.title;
    const beforeDiscard = patches;
    await page.locator('.admin-poi-edit-dialog input').first().fill('测试应放弃的修改');
    await page
      .locator('.admin-poi-edit-dialog')
      .getByRole('link', { name: '打开简介工作台', exact: true })
      .click();
    await page.getByRole('button', { name: '放弃修改进入', exact: true }).click();
    await page.waitForURL((url) => url.pathname.endsWith('/intro-editor'));
    await page.getByRole('button', { name: '保存简介', exact: true }).waitFor();
    assert.equal(patches, beforeDiscard);
    assert.equal(poi.title, originalTitle);
    results.push('PASS discard-and-enter does not save source changes');
    console.log(results.at(-1));
    await page.addInitScript(() =>
      Object.defineProperty(window, 'sessionStorage', {
        configurable: true,
        get() {
          throw new DOMException('Blocked', 'SecurityError');
        },
      }),
    );
    await openModal(poi);
    await enter('intro');
    await page.locator('textarea').first().fill('存储受限时保存');
    await page.getByRole('button', { name: '保存简介', exact: true }).click();
    await page.waitForURL(
      (url) => url.pathname === '/admin/map-poi' && url.searchParams.get('edit') === '1',
    );
    await page.locator('.admin-poi-edit-dialog').waitFor();
    assert.equal(
      await page.locator('.admin-poi-edit-dialog input').first().inputValue(),
      poi.title,
    );
    results.push('PASS blocked sessionStorage still returns to the correct POI modal');
    console.log(results.at(-1));
    await page.goto(base + '/admin/map-poi?markerId=poi-local_poi_test');
    await page.getByText('已定位 POI：' + poi.title, { exact: true }).waitFor();
    assert.equal(await page.locator('.admin-poi-edit-dialog').count(), 0);
    results.push('PASS ordinary markerId deep links keep locate-only behavior');
    console.log(results.at(-1));
    fs.writeFileSync(
      process.env.POI_EXTRA_ONLY
        ? `${artifactDirectory}/extra-results.json`
        : `${artifactDirectory}/results.json`,
      JSON.stringify({ results, patches }, null, 2),
    );
  } catch (error) {
    console.log(
      'Failed URL',
      page.url(),
      'select values',
      await page.locator('select').evaluateAll((nodes) => nodes.map((node) => node.value)),
    );
    fs.writeFileSync(`${artifactDirectory}/page.txt`, await page.locator('body').innerText());
    await page.screenshot({ path: `${artifactDirectory}/page.png`, fullPage: false });
    throw error;
  } finally {
    await browser.close();
  }
}
run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
