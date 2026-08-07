import {
  createPublicJsonResponse,
  publicApiPath,
  publicSiteUrl,
} from '../../../../../lib/public-api';

export const dynamic = 'force-dynamic';

export function GET() {
  return createPublicJsonResponse(buildOpenApiDocument(), { cacheSeconds: 3600 });
}

export function OPTIONS() {
  return createPublicJsonResponse(null);
}

function buildOpenApiDocument() {
  const localeParameter = {
    in: 'query',
    name: 'locale',
    required: false,
    schema: { type: 'string', enum: ['zh-CN', 'zh-Hant', 'en'] },
    description: '响应元数据使用的语言标识。业务实体会保留正式译名字段。',
  } as const;
  const successResponse = {
    description: '请求成功。',
    content: {
      'application/json': {
        schema: {
          type: 'object',
          required: ['data', 'meta'],
          properties: {
            data: {},
            meta: { $ref: '#/components/schemas/PublicApiMeta' },
          },
        },
      },
    },
  } as const;

  return {
    openapi: '3.1.0',
    info: {
      title: '雨城通公共只读 API',
      version: '1.0.0',
      description:
        '面向搜索引擎、AI 助手和第三方只读客户端的稳定接口。仅返回已发布或明确公开的数据。',
    },
    servers: [{ url: publicSiteUrl(publicApiPath()) }],
    paths: {
      '/operations': {
        get: {
          operationId: 'listOperations',
          summary: '获取已发布运营内容',
          parameters: [localeParameter],
          responses: { '200': successResponse },
        },
      },
      '/operations/{id}': {
        get: {
          operationId: 'getOperation',
          summary: '获取单条已发布运营内容',
          parameters: [
            {
              in: 'path',
              name: 'id',
              required: true,
              schema: { type: 'string' },
            },
            localeParameter,
          ],
          responses: {
            '200': successResponse,
            '404': { description: '内容不存在或当前未公开。' },
          },
        },
      },
      '/services': {
        get: {
          operationId: 'listServices',
          summary: '获取已发布服务目录',
          parameters: [localeParameter],
          responses: { '200': successResponse },
        },
      },
      '/transit/overview': {
        get: {
          operationId: 'getTransitOverview',
          summary: '获取已发布公共交通概览',
          parameters: [localeParameter],
          responses: { '200': successResponse },
        },
      },
      '/transit/stations': {
        get: {
          operationId: 'listTransitStationDetails',
          summary: '获取公开站内设施详情',
          parameters: [localeParameter],
          responses: { '200': successResponse },
        },
      },
      '/map/markers': {
        get: {
          operationId: 'listMapMarkers',
          summary: '获取公开地图地点和线路标记',
          parameters: [localeParameter],
          responses: { '200': successResponse },
        },
      },
      '/travel/schedules': {
        get: {
          operationId: 'queryTravelSchedules',
          summary: '查询公开班次',
          parameters: [
            localeParameter,
            queryParameter('q', '按线路、车次或文本搜索。'),
            queryParameter('stationName', '筛选经过的站点。'),
            queryParameter('from', '筛选起点。'),
            queryParameter('to', '筛选终点。'),
            queryParameter('date', '服务日期，格式为 YYYY-MM-DD。'),
            {
              in: 'query',
              name: 'serviceKind',
              required: false,
              schema: {
                type: 'string',
                enum: ['all', 'coach', 'ferry', 'flight', 'railway', 'custom'],
              },
            },
            {
              in: 'query',
              name: 'timeScope',
              required: false,
              schema: { type: 'string', enum: ['all', 'upcoming', 'past'] },
            },
          ],
          responses: { '200': successResponse },
        },
      },
    },
    components: {
      schemas: {
        PublicApiMeta: {
          type: 'object',
          required: ['apiVersion', 'generatedAt', 'sourceStatus', 'locale', 'timezone'],
          properties: {
            apiVersion: { type: 'string', const: 'v1' },
            generatedAt: { type: 'string', format: 'date-time' },
            sourceStatus: {
              type: 'string',
              enum: ['ready', 'not_configured', 'unavailable'],
            },
            message: { type: 'string' },
            locale: { type: 'string', enum: ['zh-CN', 'zh-Hant', 'en'] },
            timezone: { type: 'string', const: 'Asia/Shanghai' },
            asOf: { type: 'string', format: 'date-time' },
            canonicalUrl: { type: 'string', format: 'uri' },
          },
        },
      },
    },
  };
}

function queryParameter(name: string, description: string) {
  return {
    in: 'query',
    name,
    required: false,
    schema: { type: 'string' },
    description,
  } as const;
}
