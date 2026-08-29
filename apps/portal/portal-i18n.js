(function initializeLindongPortalI18n() {
  'use strict';

  const eventNames = Object.freeze({
    localeRequested: 'portal:locale-requested',
    localeChanged: 'portal:locale-changed',
  });
  const localeStorageKey = 'lindong-portal:locale';
  const supportedLocales = Object.freeze(['zh-CN', 'zh-Hant', 'en']);
  const simplifiedChineseLanguagePrefixes = new Set(['ug', 'bo', 'ii', 'mn']);

  const translations = Object.freeze({
    'zh-CN': Object.freeze({
      'meta.title': '个人学习网站｜临东市服务器',
      'meta.siteName': '个人学习网站',
      'meta.description':
        '临东市服务器始于 2016 年。十几位建设者把对不同家乡的记忆带进同一个 Minecraft 世界。',
      'a11y.skip': '跳到主要内容',
      'header.home': '临东市服务器首页',
      'header.navLabel': '页面导航',
      'header.tools': '创作工具',
      'header.maps': '城市地图',
      'header.services': '服务器服务',
      'header.community': '加入临东',
      'language.label': '语言',
      'hero.kicker': '始于 2016 年',
      'hero.title': '临东市服务器',
      'hero.slogan': '向往临东 美好生活',
      'hero.summary':
        '十几位建设者，把各自对家乡的记忆带进同一个 Minecraft 世界，慢慢拼成了今天的临东。',
      'hero.useTools': '使用创作工具',
      'hero.browseCity': '浏览城市',
      'hero.showing': '正在展示',
      'hero.next': '换一处临东景观',
      'heroPlace.city-government.label': '临东市政府',
      'heroPlace.city-government.alt': '临东市政府与周边城市景观',
      'heroPlace.snow-government.label': '雪乡乡政府',
      'heroPlace.snow-government.alt': '雪乡乡政府前的城市广场',
      'heroPlace.luojiabao-station.label': '骆家堡站',
      'heroPlace.luojiabao-station.alt': '骆家堡站的站房与站台',
      'heroPlace.telegraph-building.label': '电报大楼',
      'heroPlace.telegraph-building.alt': '电报大楼与周边街道',
      'heroPlace.foreign-affairs-building.label': '外事大厦',
      'heroPlace.foreign-affairs-building.alt': '外事大厦建筑立面',
      'heroPlace.first-high-school.label': '临东市第一高级中学',
      'heroPlace.first-high-school.alt': '临东市第一高级中学校园',
      'heroPlace.snow-coach-station.label': '雪乡客运站',
      'heroPlace.snow-coach-station.alt': '雪乡客运站站房与站前道路',
      'heroPlace.lindong-station-exit.label': '临东站站 B 出口',
      'heroPlace.lindong-station-exit.alt': '地铁临东站站 B 出口与公交车辆',
      'heroPlace.dingxiang-market.label': '爱临丁香超市',
      'heroPlace.dingxiang-market.alt': '爱临丁香超市内部',
      'heroPlace.zhaoda-plaza.label': '兆达商业广场',
      'heroPlace.zhaoda-plaza.alt': '兆达商业广场街景',
      'story.kicker': '认识临东',
      'story.title': '<span>一座由不同家乡</span><span>拼成的城市</span>',
      'story.paragraph1':
        '临东从一份存档出发，经历联机、中国版房间与独立服务器，逐渐成为一座由许多人共同建设的虚拟城市。熟悉的街道、公交、车站、学校和社区被带到同一个世界里，也留下了每个人对家乡不同的理解。',
      'story.paragraph2':
        '近十年里，玩家来来往往，建设却没有停下。地图、导视、影像、年度报告和纪念活动又把这座城市带到游戏之外：有人在这里找到归属，有人把想法变成作品，也有人从一件工具开始认识临东。',
      'story.more': '继续了解',
      'story.cityWiki': 'Wiki：临东市',
      'story.annualReports': '历年年度报告',
      'story.annualReport2025': '2025 年度报告',
      'tools.kicker': '不必先了解 Minecraft',
      'tools.title': '创作工具',
      'tools.intro': '路牌、公共交通导视、动态线路图与电报纸都可独立使用。选择一个任务，直接开始创作。',
      'tools.roadAlt': '多个临东道路指示牌、路名牌和楼牌成品拼贴',
      'tools.roadTitle': '路牌与楼牌工作台',
      'tools.roadDescription': '设计道路指示牌、路名牌和楼栋地名标志。',
      'tools.roadInputLabel': '手动输入',
      'tools.roadInputDetail': '道路、地名和编号',
      'tools.roadLocationLabel': '服务器位置',
      'tools.roadLocationDetail': '道路坐标或楼牌标记点',
      'tools.openRoad': '打开路牌工作台',
      'tools.transitAlt': '公交站牌、线路牌与轨道交通导视成品拼贴',
      'tools.transitTitle': '公共交通导视',
      'tools.transitDescription': '选择服务器线网或导入兼容项目，制作公交站牌与轨道交通导视。',
      'tools.transitNetworkLabel': '自定义线网',
      'tools.transitRmpProject': 'RMP 项目',
      'tools.transitContinueLabel': '继续编辑',
      'tools.transitNalProject': 'NaL VITool 项目',
      'tools.transitChitoseProject': '千岁导视牌项目',
      'tools.openTransit': '打开导视工作台',
      'tools.dynamicAlt': '多种动态线路图成品拼贴',
      'tools.dynamicTitle': '动态线路图',
      'tools.dynamicDescription': '导入线路数据，展示车辆运行、到站与播报信息。',
      'tools.openDynamic': '打开线路图',
      'tools.editData': '编辑线路数据',
      'tools.telegram': '电报纸生成器',
      'tools.telegramAlt': '印有临东电报大楼字样的电报纸、信封和电码纸',
      'tools.telegramDescription': '填写电报纸，生成电码，体验拍发、打印、收报和装入信封的完整流程。',
      'tools.openTelegram': '打开电报纸生成器',
      'maps.kicker': '地图入口',
      'maps.title': '从雨城通地图开始',
      'maps.intro': '一个整合入口，两套原始地图。地点、线路和路线规划都集中在这里。',
      'maps.recommended': '推荐',
      'maps.yctTitle': '雨城通地图',
      'maps.yctDescription': '整合地点、公共交通、路线规划与底图切换',
      'maps.sources': '原始地图入口',
      'maps.staticTitle': '高清静态地图',
      'maps.staticDescription': 'HTTPS · 精细瓦片与地点标记，更新较慢',
      'maps.liveTitle': '较新实时地图',
      'maps.liveDescription': 'HTTP · 较新瓦片与玩家位置，浏览器可能提示不安全',
      'services.kicker': '进入这座城市',
      'services.title': '城市与服务器服务',
      'services.intro':
        '从公共交通与生活服务，到统一账号、建设资料和视觉物料，在这里选择需要的入口。',
      'services.yctTitle': '雨城通',
      'services.yctDescription': '公共交通、运营信息与生活服务',
      'services.passTitle': '临东通',
      'services.passDescription': '统一账号与身份入口',
      'services.wikiTitle': '服务器 Wiki',
      'services.wikiDescription': '资料、规则、历史与建设档案',
      'services.galleryTitle': '物料与周边图鉴',
      'services.galleryDescription': '临东视觉物料、纪念品与实体周边档案',
      'community.kicker': '继续了解，或者一起建设',
      'community.title': '临东仍在生长',
      'community.intro':
        '从视频和社区动态认识临东，加入讨论，或者通过爱发电支持服务器、地图和公共工具继续运行。',
      'community.navLabel': '临东社区与社交账号',
      'community.qq': 'QQ 群',
      'community.wechat': '微信',
      'community.qqChannel': 'QQ 频道',
      'community.support': '爱发电支持',
      'friends.kicker': '共同建设的世界',
      'friends.title': '友情链接',
      'friends.intro': '在临东之外，看看这些服务器、社区与创作项目。',
      'friends.navLabel': '友情链接',
      'friends.pending': '待确认',
      'friends.inactive': '不活跃',
      'friends.contactPrompt': '希望交换友链？欢迎通过',
      'friends.contactLink': '社交账号联系我们',
      'friends.contactEnd': '。',
      'friends.emltsj': '湖水工艺服务器 Wiki',
      'friends.feiyue': '飞跃工作室',
      'friends.huinan': '回南市服务器 Wiki（Fandom）',
      'legacyLink.notPublishedTitle': '对应内容尚未在雨城通发布',
      'legacyLink.notPublishedBody':
        '自动检查显示这篇文章尚未在雨城通公开。你可以手动尝试打开对应页面，或继续浏览本页。',
      'legacyLink.unavailableTitle': '暂时无法确认对应内容',
      'legacyLink.unavailableBody':
        '自动检查可能受跨域策略或网络影响，暂时无法确认内容状态。你可以手动打开对应页面，或继续浏览本页。',
      'legacyLink.open': '手动打开',
      'legacyLink.close': '关闭',
      'legacyLink.closeLabel': '关闭旧链接提示',
      'footer.siteName': '个人学习网站',
      'footer.description':
        'shangxiaoguan.top · 临东市服务器与相关公共工具的个人学习、创作入口。原个人站点已停止更新，历史文章与媒体资料已完成归档保全。',
      'footer.aiDisclosure': '本网页部分代码由人工智能辅助生成，并经人工审阅与调整。',
      'footer.filings': '备案信息',
      'wechatDialog.kicker': '微信公众号',
      'wechatDialog.title': '临东微志',
      'wechatDialog.close': '关闭',
      'wechatDialog.closeLabel': '关闭微信公众号海报',
      'wechatDialog.posterAlt': '临东微志微信公众号二维码海报',
      'wechatDialog.footer': '临东市服务器微信公众号',
      'wechatDialog.original': '查看原图',
    }),
    'zh-Hant': Object.freeze({
      'meta.title': '个人学习网站｜臨東市伺服器',
      'meta.siteName': '个人学习网站',
      'meta.description':
        '臨東市伺服器始於 2016 年。十多位建設者把對不同家鄉的記憶帶進同一個 Minecraft 世界。',
      'a11y.skip': '跳至主要內容',
      'header.home': '臨東市伺服器首頁',
      'header.navLabel': '頁面導覽',
      'header.tools': '創作工具',
      'header.maps': '城市地圖',
      'header.services': '伺服器服務',
      'header.community': '加入臨東',
      'language.label': '語言',
      'hero.kicker': '始於 2016 年',
      'hero.title': '臨東市伺服器',
      'hero.slogan': '嚮往臨東 美好生活',
      'hero.summary':
        '十多位建設者，把各自對家鄉的記憶帶進同一個 Minecraft 世界，慢慢拼成了今天的臨東。',
      'hero.useTools': '使用創作工具',
      'hero.browseCity': '瀏覽城市',
      'hero.showing': '正在展示',
      'hero.next': '換一處臨東景觀',
      'heroPlace.city-government.label': '臨東市政府',
      'heroPlace.city-government.alt': '臨東市政府與周邊城市景觀',
      'heroPlace.snow-government.label': '雪鄉鄉政府',
      'heroPlace.snow-government.alt': '雪鄉鄉政府前的城市廣場',
      'heroPlace.luojiabao-station.label': '駱家堡站',
      'heroPlace.luojiabao-station.alt': '駱家堡站的站房與月台',
      'heroPlace.telegraph-building.label': '電報大樓',
      'heroPlace.telegraph-building.alt': '電報大樓與周邊街道',
      'heroPlace.foreign-affairs-building.label': '外事大廈',
      'heroPlace.foreign-affairs-building.alt': '外事大廈建築立面',
      'heroPlace.first-high-school.label': '臨東市第一高級中學',
      'heroPlace.first-high-school.alt': '臨東市第一高級中學校園',
      'heroPlace.snow-coach-station.label': '雪鄉客運站',
      'heroPlace.snow-coach-station.alt': '雪鄉客運站站房與站前道路',
      'heroPlace.lindong-station-exit.label': '臨東站站 B 出口',
      'heroPlace.lindong-station-exit.alt': '地鐡臨東站站 B 出口與公車',
      'heroPlace.dingxiang-market.label': '愛臨丁香超市',
      'heroPlace.dingxiang-market.alt': '愛臨丁香超市內部',
      'heroPlace.zhaoda-plaza.label': '兆達商業廣場',
      'heroPlace.zhaoda-plaza.alt': '兆達商業廣場街景',
      'story.kicker': '認識臨東',
      'story.title': '<span>一座由不同家鄉</span><span>拼成的城市</span>',
      'story.paragraph1':
        '臨東從一份存檔出發，經歷多人遊戲、中國版房間與獨立伺服器，逐漸成為一座由許多人共同建設的虛擬城市。熟悉的街道、公車、車站、學校和社區被帶到同一個世界裡，也留下了每個人對家鄉不同的理解。',
      'story.paragraph2':
        '近十年裡，玩家來來往往，建設卻沒有停下。地圖、導視、影像、年度報告和紀念活動又把這座城市帶到遊戲之外：有人在這裡找到歸屬，有人把想法變成作品，也有人從一件工具開始認識臨東。',
      'story.more': '繼續瞭解',
      'story.cityWiki': 'Wiki：臨東市',
      'story.annualReports': '歷年年度報告',
      'story.annualReport2025': '2025 年度報告',
      'tools.kicker': '不必先瞭解 Minecraft',
      'tools.title': '創作工具',
      'tools.intro': '路牌、公共交通導視、動態路線圖與電報紙都可獨立使用。選擇一個任務，直接開始創作。',
      'tools.roadAlt': '多個臨東道路指示牌、路名牌和樓牌成品拼貼',
      'tools.roadTitle': '路牌與樓牌工作臺',
      'tools.roadDescription': '設計道路指示牌、路名牌和樓棟地名標誌。',
      'tools.roadInputLabel': '手動輸入',
      'tools.roadInputDetail': '道路、地名與編號',
      'tools.roadLocationLabel': '伺服器位置',
      'tools.roadLocationDetail': '道路座標或樓牌標記點',
      'tools.openRoad': '開啟路牌工作臺',
      'tools.transitAlt': '公車站牌、路線牌與軌道交通導視成品拼貼',
      'tools.transitTitle': '公共交通導視',
      'tools.transitDescription': '選擇伺服器路網或匯入相容專案，製作公車站牌與軌道交通導視。',
      'tools.transitNetworkLabel': '自訂路網',
      'tools.transitRmpProject': 'RMP 專案',
      'tools.transitContinueLabel': '繼續編輯',
      'tools.transitNalProject': 'NaL VITool 專案',
      'tools.transitChitoseProject': '千歲導視牌專案',
      'tools.openTransit': '開啟導視工作臺',
      'tools.dynamicAlt': '多種動態路線圖成品拼貼',
      'tools.dynamicTitle': '動態路線圖',
      'tools.dynamicDescription': '匯入路線資料，展示車輛運行、到站與播報資訊。',
      'tools.openDynamic': '開啟路線圖',
      'tools.editData': '編輯路線資料',
      'tools.telegram': '電報紙產生器',
      'tools.telegramAlt': '印有臨東電報大樓字樣的電報紙、信封和電碼紙',
      'tools.telegramDescription': '填寫電報紙，產生電碼，體驗拍發、列印、收報和裝入信封的完整流程。',
      'tools.openTelegram': '開啟電報紙產生器',
      'maps.kicker': '地圖入口',
      'maps.title': '從雨城通地圖開始',
      'maps.intro': '一個整合入口，兩套原始地圖。地點、路線和路徑規劃都集中在這裡。',
      'maps.recommended': '推薦',
      'maps.yctTitle': '雨城通地圖',
      'maps.yctDescription': '整合地點、公共交通、路徑規劃與底圖切換',
      'maps.sources': '原始地圖入口',
      'maps.staticTitle': '高畫質靜態地圖',
      'maps.staticDescription': 'HTTPS · 精細圖磚與地點標記，更新較慢',
      'maps.liveTitle': '較新即時地圖',
      'maps.liveDescription': 'HTTP · 較新圖磚與玩家位置，瀏覽器可能提示不安全',
      'services.kicker': '進入這座城市',
      'services.title': '城市與伺服器服務',
      'services.intro':
        '從公共交通與生活服務，到統一帳戶、建設資料和視覺物料，都可以在這裡找到入口。',
      'services.yctTitle': '雨城通',
      'services.yctDescription': '公共交通、營運資訊與生活服務',
      'services.passTitle': '臨東通',
      'services.passDescription': '統一帳戶與身分入口',
      'services.wikiTitle': '伺服器 Wiki',
      'services.wikiDescription': '資料、規則、歷史與建設檔案',
      'services.galleryTitle': '物料與周邊圖鑑',
      'services.galleryDescription': '臨東視覺物料、紀念品與實體周邊檔案',
      'community.kicker': '繼續瞭解，或者一起建設',
      'community.title': '臨東仍在生長',
      'community.intro':
        '從影片和社群動態認識臨東、加入討論，或者透過愛發電支持伺服器、地圖和公共工具繼續運行。',
      'community.navLabel': '臨東社群與社交帳戶',
      'community.qq': 'QQ 群',
      'community.wechat': '微信',
      'community.qqChannel': 'QQ 頻道',
      'community.support': '愛發電支持',
      'friends.kicker': '共同建設的世界',
      'friends.title': '友情連結',
      'friends.intro': '在臨東之外，看看這些伺服器、社群與創作專案。',
      'friends.navLabel': '友情連結',
      'friends.pending': '待確認',
      'friends.inactive': '不活躍',
      'friends.contactPrompt': '希望交換友情連結？歡迎透過',
      'friends.contactLink': '社交帳戶聯絡我們',
      'friends.contactEnd': '。',
      'friends.emltsj': '湖水工藝伺服器 Wiki',
      'friends.feiyue': '飛躍工作室',
      'friends.huinan': '回南市伺服器 Wiki（Fandom）',
      'legacyLink.notPublishedTitle': '對應內容尚未在雨城通發佈',
      'legacyLink.notPublishedBody':
        '自動檢查顯示這篇文章尚未在雨城通公開。你可以手動嘗試開啟對應頁面，或繼續瀏覽本頁。',
      'legacyLink.unavailableTitle': '暫時無法確認對應內容',
      'legacyLink.unavailableBody':
        '自動檢查可能受跨來源政策或網路影響，暫時無法確認內容狀態。你可以手動開啟對應頁面，或繼續瀏覽本頁。',
      'legacyLink.open': '手動開啟',
      'legacyLink.close': '關閉',
      'legacyLink.closeLabel': '關閉舊連結提示',
      'footer.siteName': '个人学习网站',
      'footer.description':
        'shangxiaoguan.top · 臨東市伺服器與相關公共工具的個人學習、創作入口。原個人網站已停止更新，歷史文章與媒體資料已完成封存保全。',
      'footer.aiDisclosure': '本網頁部分程式碼由人工智慧輔助產生，並經人工審閱與調整。',
      'footer.filings': '備案資訊',
      'wechatDialog.kicker': '微信公眾號',
      'wechatDialog.title': '臨東微志',
      'wechatDialog.close': '關閉',
      'wechatDialog.closeLabel': '關閉微信公眾號海報',
      'wechatDialog.posterAlt': '臨東微志微信公眾號 QR Code 海報',
      'wechatDialog.footer': '臨東市伺服器微信公眾號',
      'wechatDialog.original': '查看原圖',
    }),
    en: Object.freeze({
      'meta.title': '个人学习网站 | Lindong City Server',
      'meta.siteName': '个人学习网站',
      'meta.description':
        'Lindong City Server began in 2016. More than a dozen builders have brought memories of their hometowns into one Minecraft world.',
      'a11y.skip': 'Skip to main content',
      'header.home': 'Lindong City Server home',
      'header.navLabel': 'Page navigation',
      'header.tools': 'Tools',
      'header.maps': 'Maps',
      'header.services': 'Services',
      'header.community': 'Community',
      'language.label': 'Language',
      'hero.kicker': 'Established in 2016',
      'hero.title': 'Lindong City Server',
      'hero.slogan': 'Aspire to Lindong, Embrace a Beautiful Life.',
      'hero.summary':
        'More than a dozen builders brought memories of their hometowns into one Minecraft world and slowly shaped the Lindong of today.',
      'hero.useTools': 'Use creative tools',
      'hero.browseCity': 'Explore the city',
      'hero.showing': 'Now showing',
      'hero.next': 'Show another Lindong view',
      'heroPlace.city-government.label': 'Lindong City Hall',
      'heroPlace.city-government.alt': 'Lindong City Hall and the surrounding cityscape',
      'heroPlace.snow-government.label': 'Xuexiang Township Hall',
      'heroPlace.snow-government.alt': 'The city square outside Xuexiang Township Hall',
      'heroPlace.luojiabao-station.label': 'Luojiapu Station',
      'heroPlace.luojiabao-station.alt': 'Luojiapu Station and its platform',
      'heroPlace.telegraph-building.label': 'Telegraph Building',
      'heroPlace.telegraph-building.alt': 'The Telegraph Building and nearby streets',
      'heroPlace.foreign-affairs-building.label': 'Foreign Affairs Building',
      'heroPlace.foreign-affairs-building.alt': 'Facade of the Foreign Affairs Building',
      'heroPlace.first-high-school.label': 'Lindong No. 1 Senior High School',
      'heroPlace.first-high-school.alt': 'Campus of Lindong No. 1 Senior High School',
      'heroPlace.snow-coach-station.label': 'Xuexiang Coach Station',
      'heroPlace.snow-coach-station.alt': 'Xuexiang Coach Station and the road outside',
      'heroPlace.lindong-station-exit.label': 'LINDONGZHAN Station, Exit B',
      'heroPlace.lindong-station-exit.alt':
        'Exit B of LINDONGZHAN Metro Station with a bus outside',
      'heroPlace.dingxiang-market.label': 'Ailin Dingxiang Market',
      'heroPlace.dingxiang-market.alt': 'Ailin Dingxiang Market interior',
      'heroPlace.zhaoda-plaza.label': 'Zhaoda Plaza',
      'heroPlace.zhaoda-plaza.alt': 'Street view of Zhaoda Plaza',
      'story.kicker': 'Meet Lindong',
      'story.title': '<span>A city assembled</span> <span>from many hometowns</span>',
      'story.paragraph1':
        'Lindong began as an offline level. After multiplayer sessions from both Pocket Edition and China Edition then an independent server, Lindong has grown into a virtual city built by many people. Familiar streets, buses, stations, schools and neighborhoods now share one world, preserving different ideas of what home means.',
      'story.paragraph2':
        'Players have come and gone over nearly a decade, but construction has continued. Maps, wayfinding, images, annual reports and anniversary events have carried the city beyond the game: some find a sense of belonging, some turn ideas into work, and some first meet Lindong through a tool.',
      'story.more': 'Read more',
      'story.cityWiki': 'Wiki: Lindong City',
      'story.annualReports': 'Annual report archive',
      'story.annualReport2025': '2025 annual report',
      'tools.kicker': 'No Minecraft knowledge required',
      'tools.title': 'Creative tools',
      'tools.intro':
        'Create street signs, transit wayfinding, live route displays and telegram sheets as standalone projects.',
      'tools.roadAlt': 'A collage of Lindong street, road-name and address signs',
      'tools.roadTitle': 'Street & address signs',
      'tools.roadDescription': 'Design direction signs, road-name plates and building markers.',
      'tools.roadInputLabel': 'Manual input',
      'tools.roadInputDetail': 'Names and numbers',
      'tools.roadLocationLabel': 'Server location',
      'tools.roadLocationDetail': 'Road coordinates or address markers',
      'tools.openRoad': 'Open sign workspace',
      'tools.transitAlt': 'A collage of bus stop and metro wayfinding designs',
      'tools.transitTitle': 'Transit wayfinding',
      'tools.transitDescription':
        'Choose the server network or import a compatible project to create bus stop and metro wayfinding.',
      'tools.transitNetworkLabel': 'Custom network',
      'tools.transitRmpProject': 'RMP project',
      'tools.transitContinueLabel': 'Continue editing',
      'tools.transitNalProject': 'NaL VITool project',
      'tools.transitChitoseProject': 'Chitose Sign Maker project',
      'tools.openTransit': 'Open wayfinding workspace',
      'tools.dynamicAlt': 'A collage of live route display designs',
      'tools.dynamicTitle': 'Live route display',
      'tools.dynamicDescription':
        'Import route data and present vehicle, arrival and announcement states.',
      'tools.openDynamic': 'Open display',
      'tools.editData': 'Edit route data',
      'tools.telegram': 'Telegram sheet generator',
      'tools.telegramAlt': 'Telegram sheets, an envelope and a code sheet marked with Lindong Telegraph Building',
      'tools.telegramDescription':
        'Fill in a telegram sheet, generate its code, then experience sending, printing, receiving and packing it in an envelope.',
      'tools.openTelegram': 'Open telegram generator',
      'maps.kicker': 'Map directory',
      'maps.title': 'Start with the Yuchengtong map',
      'maps.intro': 'One integrated entry and two source maps for places, transit and directions.',
      'maps.recommended': 'Recommended',
      'maps.yctTitle': 'Yuchengtong Map',
      'maps.yctDescription': 'Places, public transit, directions and basemap switching',
      'maps.sources': 'Source map links',
      'maps.staticTitle': 'Detailed static map',
      'maps.staticDescription': 'HTTPS · Detailed tiles and place markers; updated less often',
      'maps.liveTitle': 'Newer live map',
      'maps.liveDescription': 'HTTP · Newer tiles and player locations; browsers may warn',
      'services.kicker': 'Enter the city',
      'services.title': 'City & server services',
      'services.intro':
        'Choose an entry for transit and city services, your account, construction records or visual assets.',
      'services.yctTitle': 'Yuchengtong',
      'services.yctDescription': 'Public transit, operations and everyday services',
      'services.passTitle': 'LDPASS',
      'services.passDescription': 'Unified account and identity access',
      'services.wikiTitle': 'Server Wiki',
      'services.wikiDescription': 'Guides, rules, history and construction archive',
      'services.galleryTitle': 'Material & merchandise archive',
      'services.galleryDescription': 'Visual assets, keepsakes and physical Lindong items',
      'community.kicker': 'Learn more or build with us',
      'community.title': 'Lindong keeps growing',
      'community.intro':
        'Follow videos and updates, join the conversation, or support the server, maps and public tools on Afdian.',
      'community.navLabel': 'Lindong community and social accounts',
      'community.qq': 'QQ Group',
      'community.wechat': 'WeChat',
      'community.qqChannel': 'QQ Channel',
      'community.support': 'Support on Afdian',
      'friends.kicker': 'Worlds built together',
      'friends.title': 'Friends',
      'friends.intro': 'Explore more servers, communities and creative projects beyond Lindong.',
      'friends.navLabel': 'Friend links',
      'friends.pending': 'To verify',
      'friends.inactive': 'Inactive',
      'friends.contactPrompt': 'Interested in exchanging links? ',
      'friends.contactLink': 'Contact us through our social accounts',
      'friends.contactEnd': '.',
      'friends.emltsj': 'Leungcraft Server Wiki',
      'friends.feiyue': 'Feiyue Studio',
      'friends.huinan': 'Huinan City Server Wiki (Fandom)',
      'legacyLink.notPublishedTitle': 'This content is not yet published on Yuchengtong',
      'legacyLink.notPublishedBody':
        'The automatic check reports that this article is not yet public on Yuchengtong. You can try opening the page manually or continue here.',
      'legacyLink.unavailableTitle': 'The linked content could not be checked',
      'legacyLink.unavailableBody':
        'Cross-origin policy or network conditions may have blocked the automatic check. You can open the page manually or continue here.',
      'legacyLink.open': 'Open manually',
      'legacyLink.close': 'Close',
      'legacyLink.closeLabel': 'Dismiss the old-link notice',
      'footer.siteName': '个人学习网站',
      'footer.description':
        'shangxiaoguan.top · A personal learning and creative gateway to Lindong City Server and related public tools. The former personal site is no longer updated; its articles and media have been archived.',
      'footer.aiDisclosure':
        'Some code on this page was generated with AI assistance and then reviewed and adjusted by a person.',
      'footer.filings': 'Website registrations',
      'wechatDialog.kicker': 'WeChat Official Account',
      'wechatDialog.title': 'Lindong Journal',
      'wechatDialog.close': 'Close',
      'wechatDialog.closeLabel': 'Close the WeChat poster',
      'wechatDialog.posterAlt': 'QR code poster for the Lindong Journal WeChat account',
      'wechatDialog.footer': 'Lindong City Server on WeChat',
      'wechatDialog.original': 'View original',
    }),
  });

  function normalizeLanguageTag(languageTag) {
    return String(languageTag ?? '')
      .trim()
      .replaceAll('_', '-')
      .toLowerCase();
  }

  function resolveSystemLocale(languageTags = navigator.languages ?? [navigator.language]) {
    for (const languageTag of languageTags) {
      const normalized = normalizeLanguageTag(languageTag);
      const languagePrefix = normalized.split('-')[0];

      if (simplifiedChineseLanguagePrefixes.has(languagePrefix)) {
        return 'zh-CN';
      }
      if (
        normalized.startsWith('zh-hant') ||
        normalized.startsWith('zh-tw') ||
        normalized.startsWith('zh-hk') ||
        normalized.startsWith('zh-mo')
      ) {
        return 'zh-Hant';
      }
      if (normalized.startsWith('zh')) {
        return 'zh-CN';
      }
      if (normalized.startsWith('en')) {
        return 'en';
      }
    }
    return 'en';
  }

  function readStoredLocale() {
    try {
      const locale = window.localStorage.getItem(localeStorageKey);
      return supportedLocales.includes(locale) ? locale : null;
    } catch {
      return null;
    }
  }

  function rememberLocale(locale) {
    try {
      window.localStorage.setItem(localeStorageKey, locale);
    } catch {
      // 隐私模式或存储受限时，当前页面仍可正常切换语言。
    }
  }

  function translate(locale, key) {
    return translations[locale]?.[key] ?? translations['zh-CN'][key] ?? key;
  }

  function applyLocale(locale) {
    const normalizedLocale = supportedLocales.includes(locale) ? locale : 'en';
    document.documentElement.lang = normalizedLocale;
    document.title = translate(normalizedLocale, 'meta.title');

    for (const element of document.querySelectorAll('[data-i18n]')) {
      element.textContent = translate(normalizedLocale, element.dataset.i18n);
    }
    for (const element of document.querySelectorAll('[data-i18n-html]')) {
      element.innerHTML = translate(normalizedLocale, element.dataset.i18nHtml);
    }
    for (const element of document.querySelectorAll('[data-i18n-content]')) {
      element.setAttribute('content', translate(normalizedLocale, element.dataset.i18nContent));
    }
    for (const element of document.querySelectorAll('[data-i18n-aria-label]')) {
      element.setAttribute(
        'aria-label',
        translate(normalizedLocale, element.dataset.i18nAriaLabel),
      );
    }
    for (const element of document.querySelectorAll('[data-i18n-title]')) {
      element.setAttribute('title', translate(normalizedLocale, element.dataset.i18nTitle));
    }
    for (const element of document.querySelectorAll('[data-i18n-alt]')) {
      element.setAttribute('alt', translate(normalizedLocale, element.dataset.i18nAlt));
    }
    for (const button of document.querySelectorAll('[data-locale]')) {
      button.setAttribute('aria-pressed', String(button.dataset.locale === normalizedLocale));
    }

    return normalizedLocale;
  }

  document.addEventListener(eventNames.localeRequested, (event) => {
    const requestedLocale = event.detail?.locale;
    const locale = supportedLocales.includes(requestedLocale)
      ? requestedLocale
      : resolveSystemLocale();
    const source = event.detail?.source ?? 'system';
    applyLocale(locale);

    if (source === 'user') {
      rememberLocale(locale);
    }

    document.dispatchEvent(
      new CustomEvent(eventNames.localeChanged, {
        detail: { locale, source },
      }),
    );
  });

  for (const button of document.querySelectorAll('[data-locale]')) {
    button.addEventListener('click', () => {
      document.dispatchEvent(
        new CustomEvent(eventNames.localeRequested, {
          detail: { locale: button.dataset.locale, source: 'user' },
        }),
      );
    });
  }

  const storedLocale = readStoredLocale();
  document.dispatchEvent(
    new CustomEvent(eventNames.localeRequested, {
      detail: {
        locale: storedLocale ?? resolveSystemLocale(),
        source: storedLocale ? 'stored' : 'system',
      },
    }),
  );

  window.LINDONG_PORTAL_I18N = Object.freeze({
    applyLocale,
    resolveSystemLocale,
    supportedLocales,
    translate,
  });
})();
