import type { Metadata } from 'next';

export const SITE_NAME = '雨城通';
export const SITE_APPLICATION_NAME = 'Yuchengtong';
export const SITE_DESCRIPTION =
  '雨城通整合临东市服务器运营信息、地图探索、公共交通出行与生活服务。';

interface PageMetadataInput {
  title: string;
  description: string;
  noIndex?: boolean;
}

export function createSiteMetadata(): Metadata {
  return {
    applicationName: SITE_APPLICATION_NAME,
    title: {
      default: SITE_NAME,
      template: `%s｜${SITE_NAME}`,
    },
    description: SITE_DESCRIPTION,
    openGraph: {
      type: 'website',
      locale: 'zh_CN',
      siteName: SITE_NAME,
      title: SITE_NAME,
      description: SITE_DESCRIPTION,
    },
    twitter: {
      card: 'summary',
      title: SITE_NAME,
      description: SITE_DESCRIPTION,
    },
  };
}

export function createPageMetadata({
  title,
  description,
  noIndex = false,
}: PageMetadataInput): Metadata {
  const fullTitle = `${title}｜${SITE_NAME}`;

  return {
    title,
    description,
    openGraph: {
      type: 'website',
      locale: 'zh_CN',
      siteName: SITE_NAME,
      title: fullTitle,
      description,
    },
    twitter: {
      card: 'summary',
      title: fullTitle,
      description,
    },
    ...(noIndex
      ? {
          robots: {
            index: false,
            follow: false,
          },
        }
      : {}),
  };
}

export function normalizeMetadataDescription(value: string | undefined, fallback: string): string {
  const normalized = value?.replace(/\s+/g, ' ').trim() || fallback;
  return normalized.length > 160 ? `${normalized.slice(0, 157)}...` : normalized;
}

export const pageMetadata = {
  account: createPageMetadata({
    title: '账号设置',
    description: '管理雨城通账号、外观、语言、通知、离线数据与本地记录。',
    noIndex: true,
  }),
  map: createPageMetadata({
    title: '地图探索',
    description:
      '在雨城通探索临东市服务器地图，查询地点、道路、公共交通线路与站点，并规划出行路线。',
  }),
  offline: createPageMetadata({
    title: '离线',
    description: '在离线状态下访问雨城通已缓存的运营信息、线路、站点详情和服务入口。',
    noIndex: true,
  }),
  search: createPageMetadata({
    title: '搜索',
    description: '搜索雨城通中的运营信息、公共服务与功能入口。',
    noIndex: true,
  }),
  services: createPageMetadata({
    title: '更多服务',
    description: '使用雨城通提供的公共交通导视、路牌物料等工具，并访问更多服务器服务。',
  }),
  faq: createPageMetadata({
    title: '帮助与常见问题',
    description: '查看雨城通常用功能、账号、地图、出行与服务工具的使用说明和问题解答。',
  }),
  roadMaterials: createPageMetadata({
    title: '路牌物料',
    description: '根据道路和地点数据生成雨城通路牌、道路名牌与楼栋地址物料。',
  }),
  transitMaterials: createPageMetadata({
    title: '公共交通导视',
    description: '根据已发布的公共交通线路和站点数据生成公交站牌与地铁导视物料。',
  }),
  transitNetworkHealth: createPageMetadata({
    title: '公共交通网络健康度',
    description: '统计已发布公共交通线路、站点和拓扑连接状况，查看网络健康度与改进建议。',
  }),
  travel: createPageMetadata({
    title: '出行',
    description: '查看临东市服务器公共交通概览、运营状态与常用出行入口。',
  }),
  travelSchedules: createPageMetadata({
    title: '班次查询',
    description: '查询客运班次，查看发到站、时间、票务可用性与行程提醒。',
  }),
  travelScreen: createPageMetadata({
    title: '智运大屏',
    description: '查看临东市服务器客运班次大屏与发车信息。',
  }),
  ticketOrder: createPageMetadata({
    title: '票务订单',
    description: '查看当前雨城通票务订单的占座与处理状态。',
    noIndex: true,
  }),
  admin: createPageMetadata({
    title: '管理后台',
    description: '管理雨城通内容、交通、地图、服务、物料、翻译、成员与审计数据。',
    noIndex: true,
  }),
  adminAuditEvents: createPageMetadata({
    title: '审计事件',
    description: '查看雨城通后台业务操作与状态变更的审计事件。',
    noIndex: true,
  }),
  adminMapAreas: createPageMetadata({
    title: '行政区划',
    description: '维护雨城通地图使用的行政区划数据。',
    noIndex: true,
  }),
  adminMapPoi: createPageMetadata({
    title: 'POI 后台',
    description: '审核和维护雨城通地图地点、设施与空间关联数据。',
    noIndex: true,
  }),
  adminMapSettings: createPageMetadata({
    title: '地图设置',
    description: '配置雨城通地图空间参数与数据源设置。',
    noIndex: true,
  }),
  adminMaterials: createPageMetadata({
    title: '物料后台',
    description: '维护雨城通路牌与公共交通导视物料模板。',
    noIndex: true,
  }),
  adminMemberships: createPageMetadata({
    title: '管理员成员',
    description: '管理雨城通后台成员、角色与账号状态。',
    noIndex: true,
  }),
  adminOperations: createPageMetadata({
    title: '内容后台',
    description: '创建、审核、发布和归档雨城通运营内容。',
    noIndex: true,
  }),
  adminServices: createPageMetadata({
    title: '服务后台',
    description: '维护雨城通服务入口、分类与展示顺序。',
    noIndex: true,
  }),
  adminTransit: createPageMetadata({
    title: '线路与班次后台',
    description: '导入、审核和发布雨城通公共交通线路、站点与班次数据。',
    noIndex: true,
  }),
  adminTransitLineEditor: createPageMetadata({
    title: '线路地图编辑',
    description: '编辑雨城通公共交通线路的地图路径与站点位置。',
    noIndex: true,
  }),
  adminTranslations: createPageMetadata({
    title: '名称翻译后台',
    description: '维护雨城通线路、站点与地图实体的正式译名。',
    noIndex: true,
  }),
} as const;
