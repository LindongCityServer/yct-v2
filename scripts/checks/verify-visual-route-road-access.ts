/**
 * 校验线路走向的道路吸附半径（横版公交线路详情的走向图依赖它）。
 *
 * 背景：站点附近没有已测绘道路时，旧逻辑会退回到「全局最近道路」，
 * 整条线路每个区间都被接到同一个远处路口，横版线路详情右侧的走向图
 * 于是呈放射状。这里把「超出吸附半径 → 回退直线」固化成断言。
 *
 * 运行：`pnpm exec tsx scripts/checks/verify-visual-route-road-access.ts`
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { MapMarkerSnapshot } from '@yct/contracts';
import {
  buildVisualRoadGraph,
  resolveVisualRoute,
} from '../../apps/web/lib/transit-line-visual-routing';

type Marker = MapMarkerSnapshot['markers'][number];
type Coordinate = [number, number];

const worldId = 'verify-route-world';
const defaultY = 64;

function roadMarker(id: string, coordinates: Coordinate[]): Marker {
  return {
    id,
    label: '测试路',
    categoryId: 'road',
    iconFileName: 'road',
    geometry: { type: 'LineString', coordinates },
    spatial: { worldId, direction: 'both', defaultY },
  };
}

function buildGraph(markers: Marker[]) {
  const graph = buildVisualRoadGraph(markers, 30, {
    defaultY,
    verticalTolerance: 0,
    worldId,
  });
  assert.ok(graph, '测试路网应能构建');
  return graph;
}

function assertStraightRoute(label: string, stations: Coordinate[], roadX: number): void {
  const graph = buildGraph([
    roadMarker('road-far', [
      [roadX, -1000],
      [roadX, 1000],
    ]),
  ]);
  const resolution = resolveVisualRoute(stations, 'road', graph, 'bus');
  assert.deepEqual(
    resolution.coordinates,
    stations,
    `${label}：超出吸附半径时应回退为站点直线，不能接到远处道路`,
  );
  assert.equal(
    resolution.unresolvedSegmentCount,
    stations.length - 1,
    `${label}：每个区间的回退都要计入 unresolvedSegmentCount`,
  );
}

let passed = 0;
function check(name: string, run: () => void): void {
  run();
  passed += 1;
  console.log(`✅ ${name}`);
}

// 1. 生产环境 170 路的实际形状：站点在路网西侧约 2000 格，最近道路只有一个路口。
const productionStations: Coordinate[] = [
  [-2623, -768],
  [-2929, -1029],
  [-2929, -1359],
  [-3157, -1540],
  [-3468, -1377],
  [-3468, -1047],
  [-3468, -767],
  [-3468, -447],
  [-3468, -87],
  [-3468, 233],
  [-3122, 420],
  [-2922, 600],
  [-3254, 966],
  [-3507, 1101],
  [-3299, 1273],
  [-2959, 1273],
];
check('170 路式场景：站点远离路网时不再汇聚到同一路口', () => {
  const graph = buildGraph([
    roadMarker('road-hub', [
      [-654.5, -1801.9],
      [-838.1, -1803.2],
      [-843.6, -1677.5],
    ]),
  ]);
  const resolution = resolveVisualRoute(productionStations, 'road', graph, 'bus');
  assert.deepEqual(resolution.coordinates, productionStations, '应回退为站点直线');
  assert.equal(resolution.unresolvedSegmentCount, productionStations.length - 1);
  const hub = [-843.6, -1677.5];
  assert.ok(
    !resolution.coordinates.some(
      (coordinate) => coordinate[0] === hub[0] && coordinate[1] === hub[1],
    ),
    '走向图不应包含远处路口的坐标',
  );
});

// 2. 吸附半径内仍然沿道路走。
check('吸附半径内（59 格）仍沿道路解析', () => {
  const stations: Coordinate[] = [
    [0, -10],
    [0, 10],
  ];
  const graph = buildGraph([
    roadMarker('road-near', [
      [59, -1000],
      [59, 1000],
    ]),
  ]);
  const resolution = resolveVisualRoute(stations, 'road', graph, 'bus');
  assert.equal(resolution.unresolvedSegmentCount, 0, '半径内不应回退');
  assert.ok(
    resolution.coordinates.some((coordinate) => coordinate[0] === 59),
    '应包含道路上的接入点',
  );
  assert.deepEqual(resolution.coordinates[0], stations[0]);
  assert.deepEqual(resolution.coordinates.at(-1), stations[1]);
});

// 3. 刚好超出吸附半径（61 格）回退直线，避免把阈值改成“无限远”。
check('刚好超出吸附半径（61 格）回退直线', () => {
  assertStraightRoute(
    '61 格',
    [
      [0, -10],
      [0, 10],
    ],
    61,
  );
});

// 4. 反向也成立：站点在道路东侧同样不能跨街区吸附。
check('站点在道路东侧且超出半径时同样回退直线', () => {
  const stations: Coordinate[] = [
    [1000, -100],
    [1000, 0],
    [1000, 100],
  ];
  const graph = buildGraph([
    roadMarker('road-west', [
      [-1000, -1000],
      [-1000, 1000],
    ]),
  ]);
  const resolution = resolveVisualRoute(stations, 'road', graph, 'bus');
  assert.deepEqual(resolution.coordinates, stations);
  assert.equal(resolution.unresolvedSegmentCount, 2);
});

// 5. 物料走向图的路网必须用「合并后的地点/道路标记」，而不是原始 uNmINeD 点标记：
//    原始标记只有 Point，buildVisualRoadGraph 会直接忽略，路网为空/稀疏。
check('物料走向图使用与地点候选相同的合并标记集', () => {
  const source = readFileSync(
    resolve(import.meta.dirname, '../../apps/web/lib/material-location-source.ts'),
    'utf8',
  );
  assert.match(
    source,
    /export async function listMaterialMapMarkers[\s\S]{0,400}?readMaterialLocations\(\)/,
    'listMaterialMapMarkers 应读取合并后的地点条目',
  );
  assert.match(
    source,
    /createRoadEndpointEntries\(staticEntries\)/,
    '合并条目应包含同名道路端点归并出的道路',
  );
});

console.log(`\n${passed} 项检查通过。`);
