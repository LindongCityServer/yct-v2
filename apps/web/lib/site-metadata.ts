import { cookies, headers } from 'next/headers';
import type { Metadata } from 'next';
import type { LocaleCode } from '@yct/contracts';
import { isLocaleCode, resolveAcceptLanguage, siteLocaleCookieName } from './locale';

export const SITE_NAME = '雨城通';
export const SITE_APPLICATION_NAME = 'Yuchengtong';

const siteNames: Record<LocaleCode, string> = {
  'zh-CN': '雨城通',
  'zh-Hant': '雨城通',
  en: 'Yuchengtong',
};

const siteDescriptions: Record<LocaleCode, string> = {
  'zh-CN': '雨城通整合临东市服务器运营信息、地图探索、公共交通出行与生活服务。',
  'zh-Hant': '雨城通整合臨東市伺服器營運資訊、地圖探索、公共交通出行與生活服務。',
  en: 'Yuchengtong brings together operations updates, map exploration, public transit, and everyday services for the Lindong City server.',
};

type LocalizedText = Readonly<Record<LocaleCode, string>>;

interface PageMetadataInput {
  title: string;
  description: string;
  locale?: LocaleCode;
  noIndex?: boolean;
}

interface PageMetadataDefinition {
  title: LocalizedText;
  description: LocalizedText;
  noIndex?: boolean;
}

function localized(zhCn: string, zhHant: string, en: string): LocalizedText {
  return { 'zh-CN': zhCn, 'zh-Hant': zhHant, en };
}

export function getSiteName(locale: LocaleCode): string {
  return siteNames[locale];
}

export function getSiteDescription(locale: LocaleCode): string {
  return siteDescriptions[locale];
}

export function createSiteMetadata(locale: LocaleCode = 'zh-CN'): Metadata {
  const siteName = getSiteName(locale);
  const description = getSiteDescription(locale);
  return {
    applicationName: SITE_APPLICATION_NAME,
    title: {
      default: siteName,
      template: `%s｜${siteName}`,
    },
    description,
    openGraph: {
      type: 'website',
      locale: locale === 'en' ? 'en_US' : locale === 'zh-Hant' ? 'zh_TW' : 'zh_CN',
      siteName,
      title: siteName,
      description,
    },
    twitter: {
      card: 'summary',
      title: siteName,
      description,
    },
  };
}

export function createPageMetadata({
  title,
  description,
  locale = 'zh-CN',
  noIndex = false,
}: PageMetadataInput): Metadata {
  const fullTitle = `${title}｜${getSiteName(locale)}`;

  return {
    title,
    description,
    openGraph: {
      type: 'website',
      locale: locale === 'en' ? 'en_US' : locale === 'zh-Hant' ? 'zh_TW' : 'zh_CN',
      siteName: getSiteName(locale),
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

export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

export async function resolveRequestLocale(): Promise<LocaleCode> {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(siteLocaleCookieName)?.value;
  if (isLocaleCode(cookieLocale)) {
    return cookieLocale;
  }

  const headerStore = await headers();
  return resolveAcceptLanguage(headerStore.get('accept-language'));
}

export const pageMetadata = {
  account: {
    title: localized('账号设置', '帳號設定', 'Account Settings'),
    description: localized(
      '管理雨城通账号、外观、语言、通知、离线数据与本地记录。',
      '管理雨城通帳號、外觀、語言、通知、離線資料與本機記錄。',
      'Manage your Yuchengtong account, appearance, language, notifications, offline data, and local records.',
    ),
    noIndex: true,
  },
  map: {
    title: localized('地图探索', '地圖探索', 'Map Explore'),
    description: localized(
      '在雨城通探索临东市服务器地图，查询地点、道路、公共交通线路与站点，并规划出行路线。',
      '在雨城通探索臨東市伺服器地圖，查詢地點、道路、公共交通線路與車站，並規劃出行路線。',
      'Explore the Lindong City server map, find places, roads, transit lines, and stations, and plan routes in Yuchengtong.',
    ),
  },
  offline: {
    title: localized('离线', '離線', 'Offline'),
    description: localized(
      '在离线状态下访问雨城通已缓存的运营信息、线路、站点详情和服务入口。',
      '在離線狀態下存取雨城通已快取的營運資訊、線路、車站詳情和服務入口。',
      'Access cached Yuchengtong updates, lines, station details, and service entries while offline.',
    ),
    noIndex: true,
  },
  search: {
    title: localized('搜索', '搜尋', 'Search'),
    description: localized(
      '搜索雨城通中的运营信息、公共服务与功能入口。',
      '搜尋雨城通中的營運資訊、公共服務與功能入口。',
      'Search Yuchengtong updates, public services, and feature entries.',
    ),
    noIndex: true,
  },
  services: {
    title: localized('更多服务', '更多服務', 'More Services'),
    description: localized(
      '使用雨城通提供的公共交通导视、路牌物料等工具，并访问更多服务器服务。',
      '使用雨城通提供的公共交通導視、路牌物料等工具，並存取更多伺服器服務。',
      'Use Yuchengtong transit signage and road-sign tools, and access more server services.',
    ),
  },
  faq: {
    title: localized('帮助与常见问题', '幫助與常見問題', 'Help and FAQ'),
    description: localized(
      '查看雨城通常用功能、账号、地图、出行与服务工具的使用说明和问题解答。',
      '查看雨城通常用功能、帳號、地圖、出行與服務工具的使用說明和問題解答。',
      'Find answers and usage guidance for Yuchengtong accounts, maps, travel, and service tools.',
    ),
  },
  changelog: {
    title: localized('版本更新', '版本更新', 'Changelog'),
    description: localized(
      '查看雨城通面向用户的功能更新、问题修复和界面改进记录。',
      '查看雨城通面向使用者的功能更新、問題修復和介面改進記錄。',
      'Review Yuchengtong feature updates, fixes, and interface improvements.',
    ),
  },
  roadMaterials: {
    title: localized('路牌物料', '路牌物料', 'Road Sign Materials'),
    description: localized(
      '根据道路和地点数据生成雨城通路牌、道路名牌与楼栋地址物料。',
      '根據道路和地點資料生成雨城通路牌、道路名牌與樓棟地址物料。',
      'Generate road signs, road-name signs, and building address materials from map data.',
    ),
  },
  transitMaterials: {
    title: localized('公共交通导视', '公共交通導視', 'Transit Signage'),
    description: localized(
      '根据已发布的公共交通线路和站点数据生成公交站牌与地铁导视物料。',
      '根據已發布的公共交通線路和車站資料生成公車站牌與地鐵導視物料。',
      'Generate bus-stop signs and metro wayfinding materials from published transit data.',
    ),
  },
  transitNetworkHealth: {
    title: localized('公共交通网络健康度', '公共交通網絡健康度', 'Transit Network Health'),
    description: localized(
      '统计已发布公共交通线路、站点和拓扑连接状况，查看网络健康度与改进建议。',
      '統計已發布公共交通線路、車站和拓撲連接狀況，查看網絡健康度與改進建議。',
      'Inspect published transit lines, stations, topology connections, and network health recommendations.',
    ),
  },
  telegraph: {
    title: localized('电报体验', '電報體驗', 'Telegraph Experience'),
    description: localized(
      '填写电报纸，生成电码，体验拍发、打印、收报和装入信封的完整流程。',
      '填寫電報紙，生成電碼，體驗拍發、列印、收報和裝入信封的完整流程。',
      'Fill a telegraph form, generate code, and experience sending, printing, receiving, and enclosing a telegram.',
    ),
  },
  travel: {
    title: localized('出行', '出行', 'Travel'),
    description: localized(
      '查看临东市服务器公共交通概览、运营状态与常用出行入口。',
      '查看臨東市伺服器公共交通概覽、營運狀態與常用出行入口。',
      'View Lindong City server transit overviews, service status, and travel tools.',
    ),
  },
  travelSchedules: {
    title: localized('班次查询', '班次查詢', 'Schedule Search'),
    description: localized(
      '查询客运班次，查看发到站、时间、票务可用性与行程提醒。',
      '查詢客運班次，查看發到站、時間、票務可用性與行程提醒。',
      'Search coach schedules and view stations, times, ticket availability, and trip reminders.',
    ),
  },
  travelScreen: {
    title: localized('智运大屏', '智運大屏', 'Operations Board'),
    description: localized(
      '查看临东市服务器客运班次大屏与发车信息。',
      '查看臨東市伺服器客運班次大屏與發車資訊。',
      'View coach departures and schedule information for the Lindong City server.',
    ),
  },
  ticketOrder: {
    title: localized('票务订单', '票務訂單', 'Ticket Order'),
    description: localized(
      '查看当前雨城通票务订单的占座与处理状态。',
      '查看目前雨城通票務訂單的佔座與處理狀態。',
      'View the current Yuchengtong ticket order hold and processing status.',
    ),
    noIndex: true,
  },
  operations: {
    title: localized('运营信息', '營運資訊', 'Updates'),
    description: localized(
      '查看雨城通发布的交通运营动态、服务公告与服务器资讯。',
      '查看雨城通發布的交通營運動態、服務公告與伺服器資訊。',
      'Read Yuchengtong transit updates, service announcements, and server news.',
    ),
  },
  admin: {
    title: localized('管理后台', '管理後台', 'Admin'),
    description: localized(
      '管理雨城通内容、交通、地图、服务、物料、翻译、成员与审计数据。',
      '管理雨城通內容、交通、地圖、服務、物料、翻譯、成員與稽核資料。',
      'Manage Yuchengtong content, transit, maps, services, materials, translations, members, and audit data.',
    ),
    noIndex: true,
  },
  adminAuditEvents: {
    title: localized('审计事件', '稽核事件', 'Audit Events'),
    description: localized(
      '查看雨城通后台业务操作与状态变更的审计事件。',
      '查看雨城通後台業務操作與狀態變更的稽核事件。',
      'Review audit events for Yuchengtong admin actions and state changes.',
    ),
    noIndex: true,
  },
  adminMapAreas: {
    title: localized('行政区划', '行政區劃', 'Administrative Areas'),
    description: localized(
      '维护雨城通地图使用的行政区划数据。',
      '維護雨城通地圖使用的行政區劃資料。',
      'Maintain administrative area data used by the Yuchengtong map.',
    ),
    noIndex: true,
  },
  adminMapPoi: {
    title: localized('POI 后台', 'POI 後台', 'POI Admin'),
    description: localized(
      '审核和维护雨城通地图地点、设施与空间关联数据。',
      '審核和維護雨城通地圖地點、設施與空間關聯資料。',
      'Review and maintain Yuchengtong map places, facilities, and spatial relationships.',
    ),
    noIndex: true,
  },
  adminMapSettings: {
    title: localized('地图设置', '地圖設定', 'Map Settings'),
    description: localized(
      '配置雨城通地图空间参数与数据源设置。',
      '設定雨城通地圖空間參數與資料來源。',
      'Configure Yuchengtong map spatial parameters and data sources.',
    ),
    noIndex: true,
  },
  adminMaterials: {
    title: localized('物料后台', '物料後台', 'Materials Admin'),
    description: localized(
      '维护雨城通路牌与公共交通导视物料模板。',
      '維護雨城通路牌與公共交通導視物料範本。',
      'Maintain Yuchengtong road-sign and transit-wayfinding material templates.',
    ),
    noIndex: true,
  },
  adminMemberships: {
    title: localized('管理员成员', '管理員成員', 'Admin Members'),
    description: localized(
      '管理雨城通后台成员、角色与账号状态。',
      '管理雨城通後台成員、角色與帳號狀態。',
      'Manage Yuchengtong admin members, roles, and account status.',
    ),
    noIndex: true,
  },
  adminOperations: {
    title: localized('内容后台', '內容後台', 'Content Admin'),
    description: localized(
      '创建、审核、发布和归档雨城通运营内容。',
      '建立、審核、發布和封存雨城通營運內容。',
      'Create, review, publish, and archive Yuchengtong updates.',
    ),
    noIndex: true,
  },
  adminServices: {
    title: localized('服务后台', '服務後台', 'Services Admin'),
    description: localized(
      '维护雨城通服务入口、分类与展示顺序。',
      '維護雨城通服務入口、分類與顯示順序。',
      'Maintain Yuchengtong service entries, categories, and display order.',
    ),
    noIndex: true,
  },
  adminTransit: {
    title: localized('线路与班次后台', '線路與班次後台', 'Transit Admin'),
    description: localized(
      '导入、审核和发布雨城通公共交通线路、站点与班次数据。',
      '匯入、審核和發布雨城通公共交通線路、車站與班次資料。',
      'Import, review, and publish Yuchengtong transit lines, stations, and schedules.',
    ),
    noIndex: true,
  },
  adminTransitLineEditor: {
    title: localized('线路地图编辑', '線路地圖編輯', 'Transit Map Editor'),
    description: localized(
      '编辑雨城通公共交通线路的地图路径与站点位置。',
      '編輯雨城通公共交通線路的地圖路徑與車站位置。',
      'Edit transit map paths and station locations for Yuchengtong lines.',
    ),
    noIndex: true,
  },
  adminTranslations: {
    title: localized('名称翻译后台', '名稱翻譯後台', 'Name Translations Admin'),
    description: localized(
      '维护雨城通线路、站点与地图实体的正式译名。',
      '維護雨城通線路、車站與地圖實體的正式譯名。',
      'Maintain official translations for Yuchengtong lines, stations, and map entities.',
    ),
    noIndex: true,
  },
} satisfies Record<string, PageMetadataDefinition>;

export type PageMetadataKey = keyof typeof pageMetadata;

export async function getPageMetadata(key: PageMetadataKey): Promise<Metadata> {
  const locale = await resolveRequestLocale();
  return createLocalizedPageMetadata(key, locale);
}

export function createLocalizedPageMetadata(key: PageMetadataKey, locale: LocaleCode): Metadata {
  const definition: PageMetadataDefinition = pageMetadata[key];
  return createPageMetadata({
    title: definition.title[locale],
    description: definition.description[locale],
    locale,
    noIndex: definition.noIndex,
  });
}
