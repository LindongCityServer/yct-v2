import { NextResponse } from 'next/server';
import { createApiMeta } from '../../../../lib/api-meta';
import { readRuntimeConfig } from '../../../../lib/runtime-config';

interface UnminedMapPropertiesSnapshot {
  minZoom: number;
  maxZoom: number;
  defaultZoom: number;
  imageFormat: string;
  minRegionX: number;
  minRegionZ: number;
  maxRegionX: number;
  maxRegionZ: number;
  centerX: number;
  centerZ: number;
}

interface UnminedRegionGroupSnapshot {
  x: number;
  z: number;
  m: number[];
}

export async function GET() {
  const config = readRuntimeConfig();
  const baseUrl = config.unminedMapBaseUrl.endsWith('/')
    ? config.unminedMapBaseUrl
    : `${config.unminedMapBaseUrl}/`;

  try {
    const [propertiesSource, regionsSource] = await Promise.all([
      fetchText(new URL('unmined.map.properties.js', baseUrl)),
      fetchText(new URL('unmined.map.regions.js', baseUrl)),
    ]);

    const response = {
      meta: createApiMeta('ready'),
      properties: parseUnminedMapProperties(propertiesSource),
      regions: parseUnminedRegions(regionsSource),
    };

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        meta: createApiMeta(
          'unavailable',
          error instanceof Error ? error.message : 'uNmINeD 区域索引暂不可用。',
        ),
        properties: null,
        regions: [],
      },
      { status: 502 },
    );
  }
}

async function fetchText(url: URL): Promise<string> {
  const response = await fetch(url, {
    next: { revalidate: 300 },
  });

  if (!response.ok) {
    throw new Error(`读取 ${url.pathname} 失败：${response.status}`);
  }

  return response.text();
}

function parseUnminedMapProperties(source: string): UnminedMapPropertiesSnapshot {
  return {
    minZoom: readNumberProperty(source, 'minZoom'),
    maxZoom: readNumberProperty(source, 'maxZoom'),
    defaultZoom: readNumberProperty(source, 'defaultZoom'),
    imageFormat: readStringProperty(source, 'imageFormat'),
    minRegionX: readNumberProperty(source, 'minRegionX'),
    minRegionZ: readNumberProperty(source, 'minRegionZ'),
    maxRegionX: readNumberProperty(source, 'maxRegionX'),
    maxRegionZ: readNumberProperty(source, 'maxRegionZ'),
    centerX: readNumberProperty(source, 'centerX'),
    centerZ: readNumberProperty(source, 'centerZ'),
  };
}

function parseUnminedRegions(source: string): UnminedRegionGroupSnapshot[] {
  const regionPattern =
    /\{\s*x:\s*(-?\d+),\s*z:\s*(-?\d+),\s*m:\s*new Uint32Array\(\[([\s\S]*?)\]\)\s*\}/g;
  const regions: UnminedRegionGroupSnapshot[] = [];

  for (const match of source.matchAll(regionPattern)) {
    regions.push({
      x: Number.parseInt(match[1] ?? '0', 10),
      z: Number.parseInt(match[2] ?? '0', 10),
      m: parseUint32List(match[3] ?? ''),
    });
  }

  if (regions.length === 0) {
    throw new Error('未能解析 uNmINeD 区域索引。');
  }

  return regions;
}

function parseUint32List(source: string): number[] {
  return source
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => Number.parseInt(value, 10))
    .filter(Number.isFinite);
}

function readNumberProperty(source: string, propertyName: string): number {
  const match = new RegExp(`${propertyName}:\\s*(-?\\d+)`).exec(source);
  if (!match) {
    throw new Error(`缺少 uNmINeD 属性 ${propertyName}。`);
  }

  return Number.parseInt(match[1], 10);
}

function readStringProperty(source: string, propertyName: string): string {
  const match = new RegExp(`${propertyName}:\\s*"([^"]+)"`).exec(source);
  if (!match) {
    throw new Error(`缺少 uNmINeD 属性 ${propertyName}。`);
  }

  return match[1];
}
