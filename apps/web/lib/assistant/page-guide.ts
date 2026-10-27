import type { LocaleCode } from '@yct/contracts';

interface PageGuide {
  title: string;
  summary: string;
}

type GuideTable = Record<string, PageGuide>;

const zhCnGuides: GuideTable = {
  '/map': {
    title: '地图',
    summary:
      '地图页用于查看地点、线路、站点和周边。可以直接在地图内搜索地点或线路，点击标记查看详情，规划路线、收藏地点或分享当前位置。',
  },
  '/travel/schedules': {
    title: '班次查询',
    summary:
      '班次查询页用于按出发地、目的地和时间筛选船班、车次等班次，可以查看出发到达时间、票价和运营方。',
  },
  '/travel/ticketing': {
    title: '购票',
    summary: '购票页用于选择班次、填写乘客信息并生成订单，已登录后可以查看订单和乘车凭证。',
  },
  '/travel': {
    title: '出行',
    summary: '出行页汇总班次查询、购票和行程提醒等出行相关入口。',
  },
  '/services/faq': {
    title: '帮助与常见问题',
    summary: '帮助页按主题整理了使用说明和常见问题，可以直接在页面内查找关键词。',
  },
  '/services/transit-materials': {
    title: '公共交通导视',
    summary:
      '用于生成公交站牌和地铁导视物料（线路图、站名、方向），可选择服务器线网、示例项目、导入项目或手动输入，编辑后预览、提交审核并下载。',
  },
  '/services/road-materials': {
    title: '路牌物料',
    summary:
      '用于生成路牌和地址牌，按道路坐标或地图地点设置安装位置、朝向和尺寸，预览后提交审核或下载。',
  },
  '/services': {
    title: '服务',
    summary: '服务页提供导视物料、路牌、RMP 导入等站内工具入口。',
  },
  '/account': {
    title: '账号设置',
    summary:
      '账号设置页用于登录账号、调整外观与材质、管理离线包和通知，以及配置搜索与问一问的模型 Key。',
  },
  '/operations': {
    title: '运营信息',
    summary: '运营信息页发布公告、停运调整和服务变更，详情页包含发布时间和正文。',
  },
  '/search': {
    title: '搜索',
    summary: '搜索页按运营信息、地点、班次和服务分类展示结果，可以把当前关键词交给问一问继续追问。',
  },
  '/': {
    title: '首页',
    summary: '首页汇总搜索、乘车码、地图、出行和运营信息等常用入口。',
  },
};

const zhHantGuides: GuideTable = {
  '/map': {
    title: '地圖',
    summary:
      '地圖頁用於查看地點、路線、站點和周邊。可以直接在地圖內搜尋地點或路線，點擊標記查看詳情，規劃路線、收藏地點或分享目前位置。',
  },
  '/travel/schedules': {
    title: '班次查詢',
    summary:
      '班次查詢頁用於依出發地、目的地和時間篩選船班、車次等班次，可以查看出發到達時間、票價和營運方。',
  },
  '/travel/ticketing': {
    title: '購票',
    summary: '購票頁用於選擇班次、填寫乘客資訊並產生訂單，已登入後可以查看訂單和乘車憑證。',
  },
  '/travel': { title: '出行', summary: '出行頁彙整班次查詢、購票和行程提醒等出行相關入口。' },
  '/services/faq': {
    title: '說明與常見問題',
    summary: '說明頁依主題整理了使用說明和常見問題，可以直接在頁面內查找關鍵字。',
  },
  '/services/transit-materials': {
    title: '公共運輸導視',
    summary:
      '用於產生公車站牌和捷運導視物料（路線圖、站名、方向），可選擇伺服器路網、範例專案、匯入專案或手動輸入，編輯後預覽、提交審核並下載。',
  },
  '/services/road-materials': {
    title: '路牌物料',
    summary:
      '用於產生路牌和地址牌，依道路座標或地圖地點設定安裝位置、朝向和尺寸，預覽後提交審核或下載。',
  },
  '/services': { title: '服務', summary: '服務頁提供導視物料、路牌、RMP 匯入等站內工具入口。' },
  '/account': {
    title: '帳號設定',
    summary:
      '帳號設定頁用於登入帳號、調整外觀與材質、管理離線包和通知，以及設定搜尋與問一問的模型 Key。',
  },
  '/operations': {
    title: '營運資訊',
    summary: '營運資訊頁發布公告、停運調整和服務變更，詳情頁包含發布時間和正文。',
  },
  '/search': {
    title: '搜尋',
    summary: '搜尋頁依營運資訊、地點、班次和服務分類展示結果，可以把目前關鍵字交給問一問繼續追問。',
  },
  '/': { title: '首頁', summary: '首頁彙整搜尋、乘車碼、地圖、出行和營運資訊等常用入口。' },
};

const enGuides: GuideTable = {
  '/map': {
    title: 'Map',
    summary:
      'The map page shows places, lines, stations and nearby facilities. You can search in the map, open markers, plan routes, save places and share a location.',
  },
  '/travel/schedules': {
    title: 'Schedules',
    summary:
      'The schedules page filters ferry, coach and rail trips by origin, destination and time, including departure, arrival, fare and operator.',
  },
  '/travel/ticketing': {
    title: 'Ticketing',
    summary:
      'The ticketing page selects a trip, collects passenger details and creates an order; signed-in users can review orders and travel passes.',
  },
  '/travel': {
    title: 'Travel',
    summary: 'The travel page groups schedules, ticketing and trip reminders.',
  },
  '/services/faq': {
    title: 'Help and FAQ',
    summary: 'The help page groups usage guides and frequently asked questions by topic.',
  },
  '/services/transit-materials': {
    title: 'Transit wayfinding materials',
    summary:
      'Generates bus stop and metro wayfinding materials (line maps, station names, directions) from server data, sample or imported projects, or manual input, then previews, reviews and downloads them.',
  },
  '/services/road-materials': {
    title: 'Road sign materials',
    summary:
      'Generates road and address signs from road coordinates or map places, including installation position, orientation and size, then previews, reviews and downloads them.',
  },
  '/services': {
    title: 'Services',
    summary: 'The services page links to wayfinding materials, road signs and the RMP importer.',
  },
  '/account': {
    title: 'Account settings',
    summary:
      'Account settings manages sign-in, appearance and material, offline packages, notifications and the model key for search and Ask.',
  },
  '/operations': {
    title: 'Operations',
    summary: 'Operations publishes announcements, service changes and disruptions with timestamps.',
  },
  '/search': {
    title: 'Search',
    summary:
      'Search groups results into operations, places, schedules and services, and can hand the current keyword to Ask.',
  },
  '/': {
    title: 'Home',
    summary: 'Home groups search, ride code, map, travel and operations entries.',
  },
};

const routesBySpecificity = Object.keys(zhCnGuides).sort(
  (left, right) => right.length - left.length,
);

export function buildPageGuide(pathname: string, locale: LocaleCode): PageGuide | undefined {
  const table = locale === 'en' ? enGuides : locale === 'zh-Hant' ? zhHantGuides : zhCnGuides;
  if (!pathname) {
    return undefined;
  }

  const normalized = pathname.replace(/\/+$/, '') || '/';
  if (normalized === '/') {
    return table['/'];
  }

  for (const route of routesBySpecificity) {
    if (route === '/') {
      continue;
    }
    if (normalized === route || normalized.endsWith(route) || normalized.includes(`${route}/`)) {
      return table[route];
    }
  }

  return undefined;
}
