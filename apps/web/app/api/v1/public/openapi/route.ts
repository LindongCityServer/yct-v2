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
  const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
  const localeParameter = {
    in: 'query',
    name: 'locale',
    required: false,
    schema: { type: 'string', enum: ['zh-CN', 'zh-Hant', 'en'] },
    description: '响应元数据使用的语言标识。业务实体会保留正式译名字段。',
  } as const;
  const successResponse = (data: Record<string, unknown>) => ({
    description: '请求成功。',
    content: {
      'application/json': {
        schema: {
          type: 'object',
          required: ['data', 'meta'],
          properties: { data, meta: ref('PublicApiMeta') },
        },
      },
    },
  });
  const errorResponse = {
    description: '请求失败。',
    content: {
      'application/json': {
        schema: ref('PublicApiErrorResponse'),
      },
    },
  };

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
          responses: {
            '200': successResponse({ type: 'array', items: ref('OperationSummary') }),
          },
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
            '200': successResponse(ref('OperationDetail')),
            '404': { ...errorResponse, description: '内容不存在或当前未公开。' },
          },
        },
      },
      '/services': {
        get: {
          operationId: 'listServices',
          summary: '获取已发布服务目录',
          parameters: [localeParameter],
          responses: {
            '200': successResponse({ type: 'array', items: ref('ServiceEntryGroup') }),
          },
        },
      },
      '/transit/overview': {
        get: {
          operationId: 'getTransitOverview',
          summary: '获取已发布公共交通概览',
          parameters: [localeParameter],
          responses: { '200': successResponse(ref('TransitOverview')) },
        },
      },
      '/transit/stations': {
        get: {
          operationId: 'listTransitStationDetails',
          summary: '获取公开站内设施详情',
          parameters: [localeParameter],
          responses: {
            '200': successResponse({ type: 'array', items: ref('TransitStationDetail') }),
          },
        },
      },
      '/map/markers': {
        get: {
          operationId: 'listMapMarkers',
          summary: '获取公开地图地点和线路标记',
          parameters: [localeParameter],
          responses: {
            '200': successResponse(ref('MapMarkerSnapshot')),
            '502': { ...errorResponse, description: '地图标记源暂不可用。' },
          },
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
          responses: { '200': successResponse(ref('TravelScheduleQueryResult')) },
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
        PublicApiErrorResponse: {
          type: 'object',
          required: ['error', 'meta'],
          properties: {
            error: { $ref: '#/components/schemas/PublicApiError' },
            meta: { $ref: '#/components/schemas/PublicApiMeta' },
          },
        },
        PublicApiError: {
          type: 'object',
          required: ['code', 'message'],
          properties: {
            code: { type: 'string', enum: ['not_found', 'source_unavailable'] },
            message: { type: 'string' },
          },
        },
        OperationSummary: {
          type: 'object',
          required: ['id', 'title'],
          properties: {
            id: { type: 'string' },
            title: { type: 'string' },
            summary: { type: 'string' },
            status: { type: 'string' },
            publishedAt: { type: 'string', format: 'date-time' },
            canonicalUrl: { type: 'string', format: 'uri' },
            tags: { type: 'array', items: { type: 'string' } },
          },
          additionalProperties: true,
        },
        OperationDetail: {
          allOf: [
            { $ref: '#/components/schemas/OperationSummary' },
            {
              type: 'object',
              properties: {
                markdown: { type: 'string' },
                sourceKind: { type: 'string' },
              },
            },
          ],
        },
        ServiceEntry: {
          type: 'object',
          required: [
            'id',
            'title',
            'categoryId',
            'icon',
            'href',
            'openMode',
            'status',
            'sortOrder',
          ],
          properties: {
            id: { type: 'string' },
            title: { type: 'string' },
            description: { type: 'string' },
            categoryId: { type: 'string' },
            icon: { type: 'string' },
            href: { type: 'string', format: 'uri-reference' },
            openMode: { type: 'string', enum: ['same_tab', 'new_tab'] },
            status: { type: 'string' },
            sortOrder: { type: 'integer' },
            publishedAt: { type: 'string', format: 'date-time' },
          },
          additionalProperties: true,
        },
        ServiceEntryGroup: {
          type: 'object',
          required: ['categoryId', 'title', 'items'],
          properties: {
            categoryId: { type: 'string' },
            title: { type: 'string' },
            items: {
              type: 'array',
              items: { $ref: '#/components/schemas/ServiceEntry' },
            },
          },
        },
        TransitOverview: {
          type: 'object',
          required: ['lines'],
          properties: {
            lines: { type: 'array', items: { type: 'object', additionalProperties: true } },
            stations: { type: 'array', items: { type: 'object', additionalProperties: true } },
            sourceFiles: { type: 'array', items: { type: 'string' } },
          },
          additionalProperties: true,
        },
        TransitStationDetail: {
          type: 'object',
          required: [
            'sourceId',
            'lineName',
            'stationName',
            'layers',
            'facilities',
            'transfers',
            'exits',
          ],
          properties: {
            sourceId: { type: 'string' },
            lineName: { type: 'string' },
            stationName: { type: 'string' },
            layers: { type: 'array', items: { type: 'object', additionalProperties: true } },
            facilities: { type: 'array', items: { type: 'object', additionalProperties: true } },
            transfers: { type: 'array', items: { type: 'object', additionalProperties: true } },
            exits: { type: 'array', items: { type: 'object', additionalProperties: true } },
            surroundingStationNames: { type: 'array', items: { type: 'string' } },
          },
          additionalProperties: true,
        },
        MapMarkerSnapshot: {
          type: 'object',
          required: ['fetchedAt', 'markers', 'iconBaseUrl'],
          properties: {
            fetchedAt: { type: 'string', format: 'date-time' },
            iconBaseUrl: { type: 'string', format: 'uri-reference' },
            markers: { type: 'array', items: { $ref: '#/components/schemas/MapMarker' } },
          },
        },
        MapMarker: {
          type: 'object',
          required: ['id', 'label', 'geometry'],
          properties: {
            id: { type: 'string' },
            label: { type: 'string' },
            categoryId: { type: 'string' },
            geometry: { type: 'object', additionalProperties: true },
            description: { type: 'string' },
            href: { type: 'string', format: 'uri-reference' },
            imageUrls: { type: 'array', items: { type: 'string', format: 'uri-reference' } },
            transitOperationStatus: { type: 'string', enum: ['operating', 'planned', 'closed'] },
          },
          additionalProperties: true,
        },
        TravelScheduleQueryResult: {
          type: 'object',
          required: ['services', 'trips', 'stationOptions', 'sourceFiles'],
          properties: {
            services: { type: 'array', items: { type: 'object', additionalProperties: true } },
            trips: { type: 'array', items: { type: 'object', additionalProperties: true } },
            stationOptions: { type: 'array', items: { type: 'string' } },
            sourceFiles: { type: 'array', items: { type: 'string' } },
            serviceDate: { type: 'string', format: 'date' },
            notice: { type: 'string' },
          },
          additionalProperties: true,
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
