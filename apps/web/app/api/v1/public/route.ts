import {
  createPublicApiMetaFromStatus,
  createPublicJsonResponse,
  publicApiPath,
  publicSiteUrl,
} from '../../../../lib/public-api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return createPublicJsonResponse(
    {
      data: {
        name: '雨城通公共只读 API',
        version: 'v1',
        description: '提供已发布的运营内容、服务目录、公共交通、班次和地图路线规划数据。',
        documentationUrl: publicSiteUrl(publicApiPath('openapi')),
        endpoints: {
          operations: publicSiteUrl(publicApiPath('operations')),
          services: publicSiteUrl(publicApiPath('services')),
          transitOverview: publicSiteUrl(publicApiPath('transit/overview')),
          transitStations: publicSiteUrl(publicApiPath('transit/stations')),
          mapMarkers: publicSiteUrl(publicApiPath('map/markers')),
          mapRoutePlan: publicSiteUrl(publicApiPath('map/route-plan')),
          travelSchedules: publicSiteUrl(publicApiPath('travel/schedules')),
        },
      },
      meta: createPublicApiMetaFromStatus(request, 'ready', {
        canonicalPath: '/api/v1/public',
      }),
    },
    { cacheSeconds: 300 },
  );
}

export function OPTIONS() {
  return createPublicJsonResponse(null);
}
