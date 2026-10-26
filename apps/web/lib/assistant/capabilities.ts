import type { CommonMessageKey } from '../client-i18n';
import { appPath } from '../app-paths';

export type AssistantCapabilityKind = 'navigate' | 'prefill' | 'query' | 'guide';

export interface AssistantCapability {
  id: string;
  keywords: string[];
  labelKey: CommonMessageKey;
  kind: AssistantCapabilityKind;
  buildHref: (query: string) => string;
}

export interface CapabilityMatch {
  capability: AssistantCapability;
  score: number;
}

const capabilities: AssistantCapability[] = [
  {
    id: 'schedule',
    keywords: [
      '班次',
      '船',
      '航班',
      '车次',
      '列车',
      '大巴',
      '客运',
      '几点',
      '出发',
      '到达',
      'ferry',
      'flight',
      'train',
      'schedule',
      'departure',
      'arrival',
      '班機',
      '列車',
      '出發',
      '到達',
    ],
    labelKey: 'globalSearch.capability.schedule',
    kind: 'navigate',
    buildHref: (query) => `${appPath('/travel/schedules')}?q=${encodeURIComponent(query.trim())}`,
  },
  {
    id: 'transit-materials',
    keywords: [
      '站牌',
      '导视',
      '導視',
      '公交站牌',
      '地铁',
      '地鐵',
      '线路图',
      '路線圖',
      '站名',
      '方向',
      'signage',
      'bus stop',
      'metro',
    ],
    labelKey: 'globalSearch.capability.transitMaterials',
    kind: 'navigate',
    buildHref: () => appPath('/services/transit-materials'),
  },
  {
    id: 'rmp',
    keywords: ['rmp', '导入', '匯入', 'import', '线路图项目', '路線圖專案'],
    labelKey: 'globalSearch.capability.rmp',
    kind: 'navigate',
    buildHref: () => appPath('/services/transit-materials'),
  },
  {
    id: 'road-materials',
    keywords: ['路牌', '路名', '楼栋', '樓棟', '门牌', '門牌', '路标', '路標', 'road sign'],
    labelKey: 'globalSearch.capability.roadMaterials',
    kind: 'navigate',
    buildHref: () => appPath('/services/road-materials'),
  },
  {
    id: 'map',
    keywords: [
      '地图',
      '地圖',
      '路线',
      '路線',
      '怎么走',
      '怎麼走',
      '导航',
      '導航',
      '位置',
      '在哪',
      '附近',
      'map',
      'route',
      'direction',
      'nearby',
    ],
    labelKey: 'globalSearch.capability.map',
    kind: 'navigate',
    buildHref: () => appPath('/map'),
  },
  {
    id: 'account',
    keywords: [
      '登录',
      '登入',
      '账号',
      '帳號',
      '乘车码',
      '乘車碼',
      '离线',
      '離線',
      '通知',
      '推送',
      '主题',
      '主題',
      '语言',
      '語言',
      'login',
      'account',
      'ride code',
      'offline',
      'notification',
      'theme',
      'language',
    ],
    labelKey: 'globalSearch.capability.account',
    kind: 'navigate',
    buildHref: () => appPath('/account'),
  },
  {
    id: 'operations',
    keywords: [
      '公告',
      '停运',
      '停運',
      '运营',
      '營運',
      '通知',
      '更新',
      'notice',
      'update',
      'service',
    ],
    labelKey: 'globalSearch.capability.operations',
    kind: 'navigate',
    buildHref: () => appPath('/'),
  },
  {
    id: 'faq',
    keywords: ['帮助', '幫助', '常见问题', '常見問題', 'faq', 'help', '怎么用', '怎麼用', 'how to'],
    labelKey: 'globalSearch.capability.faq',
    kind: 'guide',
    buildHref: () => appPath('/services/faq'),
  },
];

export function resolveCapabilities(query: string): CapabilityMatch[] {
  const normalizedQuery = normalizeCapabilityText(query);
  if (!normalizedQuery) {
    return [];
  }

  const matches = capabilities
    .map((capability) => {
      const score = capability.keywords.reduce((total, keyword) => {
        const normalizedKeyword = normalizeCapabilityText(keyword);
        return normalizedKeyword && normalizedQuery.includes(normalizedKeyword)
          ? total + normalizedKeyword.length * 2 + 1
          : total;
      }, 0);

      return { capability, score };
    })
    .filter((match) => match.score > 0)
    .sort((left, right) => right.score - left.score);

  const deduped = new Map<string, CapabilityMatch>();
  for (const match of matches) {
    const href = match.capability.buildHref(query);
    if (!deduped.has(href)) {
      deduped.set(href, match);
    }
  }

  return [...deduped.values()].slice(0, 2);
}

function normalizeCapabilityText(value: string): string {
  return value.toLocaleLowerCase().replace(/[\s　|]+/g, '');
}
