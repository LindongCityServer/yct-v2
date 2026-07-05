import { appPath } from './app-paths';

export type MapTileProxySource = 'fresh-http' | 'safe-https-static' | 'unmined-static';

export function buildUnminedTileTemplate(baseUrl: string): string {
  const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return `${normalizedBaseUrl}tiles/zoom.{z}/{xd}/{yd}/tile.{x}.{y}.jpeg`;
}

export function buildMapTileProxyTemplate(source: MapTileProxySource): string {
  return appPath(`/api/map/tile-proxy?source=${source}&z={z}&x={x}&y={y}&xd={xd}&yd={yd}`);
}

export function fillMapTileTemplate(
  template: string,
  values: { z: string; x: string; y: string; xd: string; yd: string },
): string {
  return template
    .replaceAll('{z}', values.z)
    .replaceAll('{xd}', values.xd)
    .replaceAll('{yd}', values.yd)
    .replaceAll('{x}', values.x)
    .replaceAll('{y}', values.y);
}
