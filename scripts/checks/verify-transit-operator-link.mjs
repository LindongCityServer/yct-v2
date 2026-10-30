import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import {
  getSafeHttpUrl,
  optionalHttpUrlSchema,
  transitLineDraftSchema,
} from '../../packages/schemas/src/index.ts';
import { parseLegacyTransitSource } from '../../packages/legacy-import/src/transit.ts';

test('operator URL accepts absolute web links and rejects unsafe or malformed inputs', () => {
  for (const value of [
    'https://example.com/wiki?q=%E9%9B%A8#company',
    'http://example.com/',
    'HTTPS://example.com',
  ]) {
    assert.equal(optionalHttpUrlSchema.safeParse(value).success, true);
    assert.equal(getSafeHttpUrl(value), value);
  }
  for (const value of [
    'javascript:alert(1)',
    'data:text/html,x',
    'file:///c:/x',
    '//example.com',
    '/company',
    'https://',
    'https://exa mple.com',
    'https://example.com/\nscript',
  ]) {
    assert.equal(optionalHttpUrlSchema.safeParse(value).success, false, value);
    assert.equal(getSafeHttpUrl(value), undefined, value);
  }
  assert.equal(optionalHttpUrlSchema.parse('  '), '');
  assert.equal(optionalHttpUrlSchema.parse(undefined), undefined);
  assert.equal(optionalHttpUrlSchema.parse(' https://example.com '), 'https://example.com');
});

test('legacy line import keeps the optional operator URL through JSON round trips', () => {
  const input = {
    source: `const lines = [{name:'测试线',operator:'测试公司',operatorUrl:'https://example.com/company',stations:['甲站','乙站']}];`,
    sourcePath: 'fixture.js',
    mode: 'bus',
    exportExpression: 'lines',
    sourcePrefix: 'test',
  };
  const result = parseLegacyTransitSource(input);
  assert.equal(
    JSON.parse(JSON.stringify(result)).lines[0].operatorUrl,
    'https://example.com/company',
  );
  const old = parseLegacyTransitSource({
    ...input,
    source: input.source.replace(",operatorUrl:'https://example.com/company'", ''),
  });
  assert.equal(old.lines[0].operatorUrl, undefined);
});

test('rendered operator links are escaped, open separately and safely degrade to text', async () => {
  const require = createRequire(new URL('../../apps/web/package.json', import.meta.url));
  const React = require('react');
  globalThis.React = React;
  const { renderToStaticMarkup } = require('react-dom/server');
  const { TransitOperatorName } =
    await import('../../apps/web/components/transit-operator-name.tsx');
  const render = (props) =>
    renderToStaticMarkup(
      React.createElement(TransitOperatorName, { fallback: '待补充', ...props }),
    );
  const valid = render({ name: '公司<script>', url: 'https://example.com/?a=1&b=2' });
  assert.match(valid, /target="_blank"/);
  assert.match(valid, /rel="noopener noreferrer"/);
  assert.match(valid, /公司&lt;script&gt;/);
  for (const url of [undefined, '', 'javascript:alert(1)', 'https://']) {
    assert.equal(render({ name: '公司', url }), '公司');
  }
  assert.equal(render({ name: ' ', url: 'https://example.com' }), '待补充');
});

test('editing, omission, station reorder, clear and publish keep operator URL semantics', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'yct-operator-link-'));
  const env = {
    YCT_TRANSIT_DATA_STORE_PATH: path.join(directory, 'transit.json'),
    YCT_EVENT_OUTBOX_STORE_PATH: path.join(directory, 'outbox.json'),
  };
  const original = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
  Object.assign(process.env, env);
  try {
    const { saveTransitLine, updateTransitLineStationOrder, updateTransitLineApprovalStatus } =
      await import('../../apps/web/lib/transit-data-workflow.ts');
    const { findTransitDataRevision } = await import('../../apps/web/lib/transit-data-store.ts');
    const { readPublishedTransitEntitySnapshot } =
      await import('../../apps/web/lib/published-transit-read-model.ts');
    const { buildTransitOverview } = await import('../../apps/web/lib/legacy-transit.ts');
    const stations = [
      { sourceId: 'a', name: '甲站', aliases: [], x: 0, z: 0 },
      { sourceId: 'b', name: '乙站', aliases: [], x: 100, z: 100 },
    ];
    const baseLine = {
      sourceId: 'line',
      mode: 'bus',
      name: '测试线',
      operationStatus: 'operating',
      operator: '测试公司',
      operatorUrl: 'https://example.com/old',
      stationSourceIds: ['a', 'b'],
      stops: stations.map((s, i) => ({ stationSourceId: s.sourceId, sequence: i + 1 })),
    };
    const revision = {
      revisionId: 'draft',
      datasetId: 'default-transit',
      profileId: 'default',
      status: 'imported',
      sourceProviderId: 'fixture',
      sourcePath: 'fixture',
      sourceFiles: [],
      summary: [{ mode: 'bus', label: '公交', lineCount: 1, stationCount: 2 }],
      lines: [{ ...baseLine, approvalStatus: 'imported' }],
      stations,
      validation: { errorCount: 0, warningCount: 0, issues: [] },
      importedBy: 'tester',
      importedAt: '2026-10-30T01:00:00Z',
    };
    const published = {
      ...revision,
      revisionId: 'published',
      status: 'published',
      importedAt: '2026-10-29T01:00:00Z',
      lines: [{ ...baseLine, approvalStatus: 'published' }],
    };
    await writeFile(
      env.YCT_TRANSIT_DATA_STORE_PATH,
      JSON.stringify({ version: 1, revisions: [revision, published] }),
    );
    const patch = {
      mode: 'bus',
      name: '测试线',
      operationStatus: 'operating',
      operator: '测试公司',
      stationSourceIds: ['a', 'b'],
    };
    const save = (extra) =>
      saveTransitLine({
        revisionId: 'draft',
        actorId: 'tester',
        lineSourceId: 'line',
        patch: { ...patch, ...extra },
      });
    assert.equal((await save({ operatorUrl: 'https://example.com/new' })).ok, true);
    assert.equal(
      (await readPublishedTransitEntitySnapshot()).lines[0].operatorUrl,
      'https://example.com/old',
    );
    assert.equal((await save({})).ok, true);
    assert.equal(
      (await findTransitDataRevision('draft')).lines[0].operatorUrl,
      'https://example.com/new',
    );
    assert.equal(
      (
        await updateTransitLineStationOrder({
          revisionId: 'draft',
          actorId: 'tester',
          lineSourceId: 'line',
          stationSourceIds: ['b', 'a'],
        })
      ).ok,
      true,
    );
    assert.equal(
      (await findTransitDataRevision('draft')).lines[0].operatorUrl,
      'https://example.com/new',
    );
    const before = await readFile(env.YCT_TRANSIT_DATA_STORE_PATH, 'utf8');
    assert.equal((await save({ operatorUrl: 'javascript:alert(1)' })).ok, false);
    assert.equal(await readFile(env.YCT_TRANSIT_DATA_STORE_PATH, 'utf8'), before);
    assert.equal((await save({ operatorUrl: '' })).ok, true);
    const cleared = (await findTransitDataRevision('draft')).lines[0];
    assert.equal(cleared.operatorUrl, undefined);
    assert.equal(cleared.operator, '测试公司');
    assert.equal((await save({ operatorUrl: 'https://example.com/final' })).ok, true);
    for (const action of ['submit', 'approve', 'publish']) {
      assert.equal(
        (
          await updateTransitLineApprovalStatus({
            revisionId: 'draft',
            actorId: 'tester',
            lineSourceId: 'line',
            action,
          })
        ).ok,
        true,
        action,
      );
    }
    const snapshot = await readPublishedTransitEntitySnapshot();
    assert.equal(snapshot.lines[0].operatorUrl, 'https://example.com/final');
    const overview = buildTransitOverview(snapshot, {
      status: 'ok',
      generatedAt: new Date().toISOString(),
    });
    assert.equal(overview.lines[0].operatorUrl, 'https://example.com/final');
    assert.equal(transitLineDraftSchema.parse({ ...patch, operatorUrl: '' }).operatorUrl, '');
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(directory, { recursive: true, force: true });
  }
});
