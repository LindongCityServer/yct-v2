export interface FaqAnswerLink {
  text: string;
  href: string;
  icon?: string;
}

export interface FaqAnswerIcon {
  icon: string;
  label?: string;
}

export type FaqAnswerPart = string | FaqAnswerLink | FaqAnswerIcon;
export type FaqAnswer = string | FaqAnswerPart[];

export interface FaqItem {
  id: string;
  question: string;
  answer: FaqAnswer;
  keywords?: string[];
}

export interface FaqGroup {
  id: string;
  title: string;
  icon: string;
  items: FaqItem[];
}

export const faqGroups: FaqGroup[] = [
  {
    id: 'getting-started',
    title: '基础使用',
    icon: 'explore',
    items: [
      {
        id: 'login-required',
        question: '使用雨城通必须登录吗？',
        answer:
          '不需要。运营信息、地图、线路和班次查询可以直接使用。登录临东通账号后，才可使用跨设备同步、服务端推送和乘车码等账号能力。',
        keywords: ['游客', '未登录', '匿名使用'],
      },
      {
        id: 'global-search',
        question: '怎样快速找到地点、线路或服务？',
        answer: [
          '使用页面右上角的',
          { icon: 'search', label: '搜索' },
          '按钮，可以统一检索地点、线路、班次、运营信息、服务入口和常见问题。搜索结果取决于当前已经发布的数据。',
        ],
        keywords: ['全局搜索', '查找', '关键词'],
      },
      {
        id: 'data-not-found',
        question: '为什么搜索不到某个地点、线路或班次？',
        answer:
          '雨城通只展示已经录入并发布的数据。请先检查名称和关键词；仍然没有结果时，通常表示对应内容尚未发布，或当前数据源暂不可用。',
        keywords: ['没有结果', '搜不到', '数据缺失'],
      },
      {
        id: 'preferences',
        question: '怎样切换语言、主题或动态效果？',
        answer: [
          '前往',
          { text: '账号设置', href: '/account' },
          '调整语言、明暗主题、材质效果和动态偏好。这些设置可以在未登录时保存在当前设备；支持账号同步的偏好会在登录后与账号合并。',
        ],
        keywords: ['繁体中文', '英文', '深色模式', '动画', '外观'],
      },
      {
        id: 'translation-fallback',
        question: '为什么切换语言后，部分地点或线路名称仍是中文？',
        answer:
          '地点、线路和站点会优先显示当前语言的已发布译名；没有对应译名时，系统会回退到原始名称。不同数据源的翻译完成度不同，因此同一页面中可能同时出现不同语言的名称。',
        keywords: ['翻译', '语言切换', '英文名称', '繁体名称', '名称回退'],
      },
      {
        id: 'external-service-language',
        question: '为什么有些旧版工具没有跟随页面语言切换？',
        answer:
          '雨城通只能切换主站自身的界面与 FAQ 文案。旧版工具和外部服务器网站是独立页面，它们的语言取决于各自是否提供本地化支持。',
        keywords: ['旧版工具', '外部网站', '本地化', '界面语言'],
      },
      {
        id: 'stale-content',
        question: '网站更新后，为什么仍然看到旧页面？',
        answer: [
          '浏览器或已安装应用可能仍在使用缓存。可前往',
          { text: '账号设置', href: '/account' },
          '的“安装与离线”区域使用',
          { icon: 'refresh', label: '刷新缓存' },
          '，再重新打开页面。刷新缓存不会替代尚未同步的本地提醒同步操作。',
        ],
        keywords: ['缓存', '旧版本', '刷新失败', 'PWA 更新'],
      },
    ],
  },
  {
    id: 'operations-and-updates',
    title: '运营信息',
    icon: 'campaign',
    items: [
      {
        id: 'operations-expired',
        question: '已过有效期的运营信息还能查看吗？',
        answer:
          '可以。首页会把超过展示有效期的内容移到当前分类下的“过期消息”折叠区；切换分类后，只会显示该分类的当前和过期内容。被撤回或尚未发布的内容不会在前台显示。',
        keywords: ['过期消息', '历史公告', '有效期', '运营分类', '找不到公告'],
      },
      {
        id: 'server-status-refresh',
        question: '首页的服务器状态和在线人数是实时的吗？',
        answer:
          '服务器状态来自网关的周期性查询，页面大约每 15 秒刷新一次，并不是持续实时连接。短暂查询失败时会保留最近一次明确状态；需要判断具体玩家位置时，请进入地图并结合“最近观测”和“最后在线”时间查看。',
        keywords: ['服务器状态', '在线人数', '延迟', '刷新频率', '状态不更新'],
      },
    ],
  },
  {
    id: 'map-and-routes',
    title: '地图与路线',
    icon: 'map',
    items: [
      {
        id: 'route-unavailable',
        question: '路线规划为什么没有可用方案？',
        answer:
          '请确认起点和终点已经选中，并尝试切换步行或公共交通方式。规划结果依赖已发布的道路、站点和线路拓扑；相关数据缺失或两点尚未连通时，系统可能无法生成方案。',
        keywords: ['无法规划', '没有路线', '起点终点', '不连通'],
      },
      {
        id: 'route-estimate',
        question: '路线时间、距离和票价是准确值吗？',
        answer:
          '页面会标明“沿道路估算”“直线估算”“预计”或“待确认”等状态。带有这些标记的数值只用于行程参考，请以实际运营信息和现场情况为准。',
        keywords: ['预计时间', '距离误差', '票价估算'],
      },
      {
        id: 'favorite-sync',
        question: '更换设备后，地图收藏为什么不见了？',
        answer: [
          '未登录时，收藏保存在当前浏览器中，不会自动出现在其他设备。登录后可前往',
          { text: '账号设置', href: '/account' },
          '查看本地历史和同步状态。',
        ],
        keywords: ['收藏丢失', '跨设备', '同步收藏'],
      },
      {
        id: 'map-sharing',
        question: '怎样把地点、路线或坐标分享给其他人？',
        answer: [
          '打开地图中的地点或路线详情后使用',
          { icon: 'share', label: '分享' },
          '操作。根据当前内容和浏览器能力，可以复制链接、文字、坐标或传送指令，也可以生成二维码或分享图。',
        ],
        keywords: ['二维码', '复制坐标', '传送指令', '分享图', '链接'],
      },
      {
        id: 'map-toolbar-controls',
        question: '地图工具栏里的加号、减号、定位和图层图标分别做什么？',
        answer: [
          '地图工具栏中的',
          { icon: 'add', label: '加号' },
          '和 ',
          { icon: 'remove', label: '减号' },
          '用于缩放，',
          { icon: 'my_location', label: '定位' },
          '用于回到默认地图视图，不是读取手机 GPS；',
          { icon: 'layers', label: '图层' },
          '用于打开浏览模式、投稿和瓦片源设置。',
        ],
        keywords: ['地图工具栏', '加号', '减号', '定位图标', '图层图标', 'GPS'],
      },
      {
        id: 'poi-action-icons',
        question: '地点详情下方的图标按钮分别有什么作用？',
        answer: [
          '地点详情下方的',
          { icon: 'directions', label: '路线' },
          '用于把地点设为路线规划端点，',
          { icon: 'travel_explore', label: '附近' },
          '用于搜索周边内容，',
          { icon: 'bookmark', label: '收藏' },
          '用于保存或取消收藏，',
          { icon: 'share', label: '分享' },
          '用于打开地点分享面板。图标按钮悬停或聚焦时也会显示对应的文字提示。',
        ],
        keywords: ['地点详情', '路线按钮', '附近搜索', '收藏图标', '分享按钮'],
      },
      {
        id: 'map-share-link',
        question: '分享面板中的复制链接、二维码和分享图有什么区别？',
        answer: [
          '地点或路线详情中的',
          { icon: 'share', label: '分享' },
          '面板可以用',
          { icon: 'link', label: '复制链接' },
          '生成可重新打开当前地点或路线的短链接，也可以用',
          { icon: 'qr_code_2', label: '二维码' },
          '让别人扫码打开同一链接。',
          { icon: 'image', label: '分享图' },
          '是当前预览的静态图片，适合转发或保存，不能替代可交互的地图链接。分享这些公开地点或路线不要求登录。',
        ],
        keywords: ['分享链接', '短链接', '二维码', '分享图', '不登录分享'],
      },
      {
        id: 'map-share-troubleshooting',
        question: '分享操作失败或提示浏览器不支持时怎么办？',
        answer: [
          '浏览器不支持系统分享时，可以改用',
          { icon: 'content_copy', label: '复制链接' },
          '或复制文字、坐标和传送指令；如果剪贴板也不可用，请检查当前页面的剪贴板权限后重试。生成短链接需要站点服务可用，遇到暂时失败时可点击',
          { icon: 'refresh', label: '重试' },
          '，或者直接分享当前地址。',
        ],
        keywords: ['分享失败', '浏览器不支持', '剪贴板', '复制链接', '重试'],
      },
      {
        id: 'keyboard-shortcuts',
        question: '怎样查看和使用键盘快捷键？',
        answer: [
          '长按',
          { icon: 'keyboard', label: 'Ctrl' },
          '可以打开当前页面可用的快捷键列表。地图支持加号和减号缩放、斜杠聚焦搜索、数字 0 回到默认视图；选中地点或打开路线规划后，列表还会显示规划路线、交换起终点等当前可执行操作。输入文字时不会触发地图快捷键。',
        ],
        keywords: ['键盘', '快捷键', 'Ctrl', '搜索', '缩放', '默认视图', '交换起终点'],
      },
      {
        id: 'poi-submission',
        question: '地图缺少地点，或者地点信息有误怎么办？',
        answer: [
          '可以在地图中使用',
          { icon: 'add_location_alt', label: '投稿公开 POI' },
          '，填写名称、分类、坐标和说明后提交审核。投稿不会立即公开，管理员审核通过后才会进入已发布地图数据。',
        ],
        keywords: ['新增地点', '纠错', 'POI 投稿', '提交审核', '坐标错误'],
      },
      {
        id: 'player-location-delay',
        question: '地图上的玩家位置为什么有延迟？',
        answer:
          '玩家位置来自服务器网关的周期性观测，不是浏览器 GPS 实时定位。网络、服务器状态和轮询间隔都会带来延迟，请结合“最近观测”和“最后在线”时间判断位置是否仍然有效。',
        keywords: ['实时位置', '玩家离线', '定位不准', '位置轮询'],
      },
      {
        id: 'directional-stop-location',
        question: '为什么同一车站在不同线路或方向上显示的停靠位置不同？',
        answer:
          '车站可以为某条线路设置默认停靠位置，也可以分别设置正向和反向位置。线路详情和路线规划会优先使用当前方向的位置；未配置时依次回退到该线路默认位置和车站默认位置。',
        keywords: ['停靠位置', '上下行', '正向', '反向', '站点位置', '乘车点'],
      },
      {
        id: 'map-tile-provider',
        question: '卫星地图看起来不够新，怎样切换瓦片源？',
        answer: [
          '在卫星模式打开',
          { icon: 'layers', label: '图层与投稿' },
          '。当系统提供多个瓦片源时，可以在“瓦片源”中切换。不同来源的更新速度和可用性不同，当前选择会保存在本浏览器中。',
        ],
        keywords: ['卫星图', '底图', '瓦片源', '地图更新', '图层'],
      },
      {
        id: 'map-tiles-unavailable',
        question: '地图底图或瓦片加载失败怎么办？',
        answer: [
          '先检查网络连接并使用',
          { icon: 'refresh', label: '刷新' },
          '页面。卫星模式下，若图层面板提供其他瓦片源，可以尝试切换；所有来源都不可用时，通常表示当前地图数据源暂时无法访问，请稍后重试。',
        ],
        keywords: ['地图空白', '瓦片加载失败', '底图丢失', '地图数据暂不可用'],
      },
    ],
  },
  {
    id: 'travel-and-ride',
    title: '出行与乘车',
    icon: 'directions_bus',
    items: [
      {
        id: 'schedule-unavailable',
        question: '班次查询显示数据暂不可用怎么办？',
        answer: [
          '班次查询仅提供已经发布且当前有效的计划。可以稍后刷新，或到',
          { text: '运营信息', href: '/' },
          '查看临时调整、停运及其他公告。',
        ],
        keywords: ['时刻表', '车次', '停运', '发车时间'],
      },
      {
        id: 'schedule-filtering',
        question: '怎样缩小班次查询结果范围？',
        answer: [
          '班次查询可使用',
          { icon: 'filter_alt', label: '筛选' },
          '，按服务类型、线路或班次关键词、停靠站、始发站、终到站、服务日期和过去/即将发车时段缩小范围。日期为今天时，过去和即将发车会按当前时间区分；其他日期则按日期范围处理。',
        ],
        keywords: ['筛选班次', '始发站', '终到站', '服务日期', '即将发车', '已过班次'],
      },
      {
        id: 'schedule-pending-fields',
        question: '班次的检票口、运行时间或车型为什么显示待公布？',
        answer:
          '这些字段来自已发布的班次数据。数据源尚未提供、无法确认或不适用于该班次时，页面会显示“待公布”或“待定”，并不代表系统会自行推算出该信息。',
        keywords: ['检票口', '运行时间', '车型', '待定', '待公布'],
      },
      {
        id: 'schedule-booking-link',
        question: '为什么有些班次只有查询信息，没有订票入口？',
        answer:
          '是否提供订票入口取决于该班次已发布数据中是否包含有效的订票链接。没有链接的班次仍可用于查询，不能据此推断该班次一定不可购买。',
        keywords: ['订票', '购票', '预订', '没有链接', '仅查询'],
      },
      {
        id: 'transit-screen-scope',
        question: '智运大屏和班次查询有什么区别？',
        answer:
          '智运大屏用于快速查看当前数据快照中的车站、线路、检票口和近期班次；班次查询提供日期、站点、服务类型和时段等详细筛选。两者都以当前已发布数据为准，页面中的旧版入口可能读取独立数据源。',
        keywords: ['智运大屏', '近期班次', '班次查询', '检票口', '旧版大屏'],
      },
      {
        id: 'ticketing-unavailable',
        question: '为什么班次可以查询，却显示“暂不可订”或不能创建订单草稿？',
        answer:
          '可查询不等于可售。创建新版订单草稿需要有效的临东通登录状态，并且该班次已经接入统一票务、配置真实票种和库存，当前仍有可售余量。旧版订票链接只作为独立参考入口，不代表新版票务已经可用。',
        keywords: ['暂不可订', '库存待配置', '暂无余票', '新票务待接入', '订单草稿'],
      },
      {
        id: 'ticket-draft-not-issued',
        question: '创建订单草稿后，是否已经买到票？',
        answer:
          '没有。订单草稿只会暂时占用对应库存，默认占用 15 分钟，不代表已经出票或取得可核销凭证。草稿取消或超时后会释放占用；只有后续状态明确变为“已出票”并出现有效票券或凭证，才表示出票完成。',
        keywords: ['订单草稿', '占座', '库存占用', '15 分钟', '已出票', '核销凭证'],
      },
      {
        id: 'ride-code-login',
        question: '点击乘车码后为什么跳转到账号页？',
        answer: [
          '打开',
          { icon: 'qr_code_2', label: '乘车码' },
          '需要有效的临东通登录状态。请先完成登录；如果账号处于只读状态、登录服务尚未配置或乘车码服务暂不可用，当前无法打开乘车码。',
        ],
        keywords: ['二维码乘车', '登录失效', '无法打开乘车码'],
      },
      {
        id: 'reminder-missing',
        question: '为什么没有收到行程或票务提醒？',
        answer: [
          '请在',
          { text: '账号设置', href: '/account' },
          '中确认',
          { icon: 'notifications', label: '通知' },
          '总开关、对应提醒分类和免打扰时段，并检查浏览器是否允许通知。未登录时创建的本地提醒还需要同步到账号，才能由服务端向其他设备推送。',
        ],
        keywords: ['通知', 'Push', '免打扰', '没有提醒', '浏览器权限'],
      },
      {
        id: 'local-reminder-sync',
        question: '“待同步提醒”是什么意思？',
        answer:
          '这表示提醒目前只保存在当前浏览器，还没有写入账号。登录后在账号设置中执行同步，成功后才能在其他设备读取，并由服务端参与后续推送。',
        keywords: ['本地提醒', 'syncedAt', '云同步', '账号角标'],
      },
      {
        id: 'legacy-orders',
        question: '旧站 orders 记录为什么不是新版票务订单？',
        answer:
          '从旧站 orders 只读导入的内容只会作为行程提醒快照，用于保留历史和提醒信息，不代表新版订单、票券或核销凭证。同步前系统会单独征求同意。',
        keywords: ['旧版订单', '历史订单', '票券', '核销凭证', '迁移'],
      },
    ],
  },
  {
    id: 'account-and-offline',
    title: '账号与离线',
    icon: 'manage_accounts',
    items: [
      {
        id: 'readonly-account',
        question: '账号显示“只读”是什么意思？',
        answer:
          '系统已经识别到登录身份，但当前会话不能执行需要写入账号的数据操作。你仍可浏览公开内容；收藏同步、订单和部分账号功能需要账号恢复为可用状态后再操作。',
        keywords: ['readonly', '不能同步', '账号异常'],
      },
      {
        id: 'account-badge',
        question: '账号按钮上的数字或圆点表示什么？',
        answer: [
          { icon: 'account_circle', label: '账号' },
          '按钮上的数字通常表示待处理项目数量，例如尚未同步的本地行程提醒或账号侧待处理内容；圆点表示账号配置、会话或其他状态需要注意。打开账号设置可以查看具体来源。',
        ],
        keywords: ['角标', '红点', '待处理', '数字提醒'],
      },
      {
        id: 'push-device-scope',
        question: '为什么换了浏览器后需要重新开启推送？',
        answer:
          '推送订阅按设备和浏览器分别登记，通知权限也由浏览器独立管理。更换设备、浏览器或清除站点权限后，需要在账号设置中重新允许通知并开启本设备推送。',
        keywords: ['通知权限', '设备订阅', '换手机', '换浏览器'],
      },
      {
        id: 'account-session-unavailable',
        question: '登录后仍显示未登录或账号状态暂不可用怎么办？',
        answer:
          '先回到账号设置查看具体状态，再尝试重新登录。公开内容不依赖账号会话；若反复出现会话读取失败、共享 Cookie 缺失或登录服务未配置，通常需要等待对应登录环境恢复后再试。',
        keywords: ['登录失败', '会话失效', 'Cookie', '账号不可用', '重新登录'],
      },
      {
        id: 'private-storage',
        question: '为什么偏好、收藏或瓦片源选择没有保留下来？',
        answer:
          '这些选择会先保存在浏览器本地。隐私浏览模式、站点存储权限受限或存储配额异常时，浏览器可能无法持久保存，只能在当前会话内生效。需要跨设备保留的内容，请登录后完成对应同步。',
        keywords: ['无痕模式', '隐私模式', '本地存储', '偏好丢失', '设置不保存'],
      },
      {
        id: 'offline-capabilities',
        question: '离线时可以继续使用哪些内容？',
        answer:
          '已缓存的近期运营信息、线路、站点详情和服务入口可以继续打开，恢复网络后会刷新最新数据。首次访问或从未缓存过的内容仍然需要网络连接。',
        keywords: ['断网', '离线页面', '缓存内容'],
      },
      {
        id: 'offline-package-boundary',
        question: '保存自定义离线范围后，为什么地图仍有内容无法加载？',
        answer:
          '自定义范围目前用于记录 Minecraft 坐标边界并刷新公开基础数据，不代表该范围内的全部地图瓦片已经下载。完整瓦片离线包仍受生成策略和体积限制。',
        keywords: ['地图瓦片', '自定义范围', '离线包', 'Minecraft 坐标'],
      },
      {
        id: 'install-app',
        question: '怎样把雨城通安装到桌面或主屏幕？',
        answer: [
          '前往',
          { text: '账号设置', href: '/account' },
          '的“安装与离线”区域使用',
          { icon: 'install_mobile', label: '安装' },
          '按钮。是否能够安装取决于浏览器和系统支持；如果没有安装按钮，也可以使用浏览器自带的“添加到主屏幕”功能。',
        ],
        keywords: ['PWA', '添加到主屏幕', '桌面应用', '安装按钮'],
      },
      {
        id: 'changelog',
        question: '怎样查看雨城通最近更新了什么？',
        answer: [
          '打开服务中的',
          { text: '版本更新', href: '/services/changelog', icon: 'history' },
          '页面，可以查看当前版本、构建号和最近发布的功能、修复、性能及样式变更。没有发布清单时，页面会显示暂时没有可展示的记录。',
        ],
        keywords: ['版本更新', '更新记录', '构建号', '发布清单', '变更日志'],
      },
      {
        id: 'clear-local-data',
        question: '清理缓存会删除收藏和本地提醒吗？',
        answer: [
          { icon: 'refresh', label: '刷新缓存' },
          '或离线缓存管理主要处理应用缓存；收藏、偏好和本地提醒使用独立的本地存储与同步流程。执行带有',
          { icon: 'delete_sweep', label: '清除本地记录' },
          '或类似确认提示的操作前，请先阅读确认内容并同步需要保留的数据。',
        ],
        keywords: ['清除数据', 'localStorage', '收藏删除', '提醒删除'],
      },
    ],
  },
  {
    id: 'tools-and-services',
    title: '工具与服务',
    icon: 'construction',
    items: [
      {
        id: 'legacy-service-new-tab',
        question: '为什么有些服务会在新标签页打开？',
        answer:
          '“更多服务”中包含旧版工具和外部服务器网站，这些入口会按其配置在新标签页打开。新页面的登录状态、数据范围和交互方式可能与雨城通主站不同。',
        keywords: ['外部网站', '旧版工具', '跳转', '新窗口'],
      },
      {
        id: 'legacy-data-difference',
        question: '为什么旧版工具和雨城通主站显示的数据不完全一致？',
        answer:
          '旧版工具、外部服务器网站和主站可能读取不同的数据源或不同的发布批次。主站以当前已发布数据为准；跨站比较时，请留意页面注明的数据来源和更新时间。',
        keywords: ['数据不一致', '旧站', '外部服务', '发布批次', '更新时间'],
      },
      {
        id: 'material-data-missing',
        question: '物料生成器里为什么找不到某条线路或地点？',
        answer:
          '服务器数据模式只列出已经发布且具备模板所需字段的线路、站点和地点；草稿、审核中或数据不完整的内容不会出现。公共交通导视切换到项目数据后，只会列出 RMP 中可识别、已命名且在所选图上方向存在有效线路连接的站点和线路。需要自行填写内容时，可以改用手动输入。',
        keywords: ['路牌物料', '公共交通导视', '站牌生成器', '线路数据', '项目数据'],
      },
      {
        id: 'material-data-modes',
        question: '物料工作台的手动输入、服务器数据和项目数据有什么区别？',
        answer: [
          '手动输入用于自行编排模板允许编辑的内容；服务器数据从当前已发布的线路、站点、地点或地图坐标生成；项目数据则从“线网数据”区域通过',
          { icon: 'upload_file', label: '导入 RMP 项目' },
          '取得站点、线路、图上方向和配色。服务器数据与项目数据都属于关联数据模式，只允许修改模板明确开放的覆盖字段，并且不需要提交自定义物料审核。',
        ],
        keywords: ['手动输入', '服务器数据', '项目数据', '关联数据', 'RMP 线网'],
      },
      {
        id: 'material-workspace-actions',
        question: '物料工作台顶部的图标按钮分别做什么？',
        answer: [
          '顶部的',
          { icon: 'visibility', label: '预览' },
          '用于生成含水印预览，生成后会变成',
          { icon: 'refresh', label: '更新预览' },
          '；',
          { icon: 'publish', label: '提交审核' },
          '用于提交手动输入的自定义物料；仅在手动编辑地铁导视牌时出现的',
          { icon: 'save', label: '导出工程文件' },
          '用于保存可再次导入的 JSON 工程；',
          { icon: 'download', label: '下载图片' },
          '按当前数据模式下载图片。工作台也会在有效输入变化后自动更新页面内预览。',
        ],
        keywords: ['预览按钮', '更新预览', '提交审核', '导出工程', '下载图片', '顶部按钮'],
      },
      {
        id: 'material-review-download',
        question: '为什么自定义物料可以预览，却还不能下载？',
        answer: [
          '在',
          { text: '物料工具', href: '/services' },
          '中，预览始终带有水印，未审核的手动输入也只能下载带水印图片。登录后可使用',
          { icon: 'publish', label: '提交审核' },
          '；审核通过的记录会保留在“我的物料历史”，并可使用',
          { icon: 'download', label: '下载' },
          '获取无水印图片。RMP 项目数据不需要审核；使用服务器线网时，需要先验证服务器账号。账号权限不可用或验证未完成时，下载会回退为带水印预览。',
        ],
        keywords: ['物料审核', '无法下载', '预览水印', '自定义物料', '物料历史', '关联数据'],
      },
      {
        id: 'metro-wayfinding-editor',
        question: '地铁导视牌现在可以在工作台里编辑哪些内容？',
        answer:
          '选择“地铁导视牌”模板并保持手动输入后，可以使用单行、双行或竖向版式，调整画布尺寸、底色和默认前景色，并编排设施图标、箭头、普通文字、大文字、组合框、固定或弹性空白和分割线。元素支持拖动排序、移动、复制、删除和逐项配色；空白工程还可以从示例工程开始。出现宽度或高度不足提示时，文字可能已经被压缩，仍溢出的固定尺寸元素需要通过增大画布或减少元素处理。',
        keywords: ['地铁导视牌', '可视化编辑', '单行', '双行', '竖向', '组合框', '尺寸不足'],
      },
      {
        id: 'metro-wayfinding-project-files',
        question: '地铁导视牌可以导入和导出哪些工程文件？',
        answer: [
          '编辑器中的',
          { icon: 'upload_file', label: '导入工程' },
          '支持 YCT 地铁导视工程、',
          {
            text: 'NaL 导向标志设计器',
            href: 'https://centralgo.site/vitool/vitool.html',
          },
          '和“',
          {
            text: 'Chitose.City Sign Maker',
            href: 'https://signmaker.chitose.city/',
          },
          '”的 JSON。一次最多选择 2 个文件、每个不超过 2 MB，不能混合不同生成器；YCT 与 NaL 工程需要逐个导入。外部工程会先显示转换预览和警告，可选择',
          { icon: 'conversion_path', label: '仅语义（推荐）' },
          '或',
          { icon: 'palette', label: '保留源样式' },
          '，确认后会替换当前导视牌且最多保留两行。页面顶部的',
          { icon: 'save', label: '导出工程文件' },
          '只在手动编辑地铁导视牌时出现，导出的 YCT JSON 可以稍后再次导入。',
        ],
        keywords: ['导入工程', '导出工程', 'YCT 工程', 'NaL', 'Chitose', 'JSON', '2 MB'],
      },
      {
        id: 'metro-wayfinding-project-vs-rmp',
        question: '地铁导视的“导入工程”和“导入 RMP 项目”是一回事吗？',
        answer: [
          '不是。地铁导视编辑器里的',
          { icon: 'upload_file', label: '导入工程' },
          '会读取并替换导视牌的版式和元素；“线网数据”区域的',
          { icon: 'upload_file', label: '导入自己的项目' },
          '读取的是 ',
          { text: 'Rail Map Painter', href: 'https://railmapgen.org/?app=rmp' },
          ' 线网，只为项目数据模式提供站点、线路、方向和颜色，不会替换当前导视牌。',
        ],
        keywords: ['导入工程', 'RMP 项目', '线网数据', '导视牌版式', 'Rail Map Painter'],
      },
      {
        id: 'rmp-import-requirements',
        question: '导入 RMP 线网项目失败时，应检查哪些内容？',
        answer: [
          'RMP 指',
          {
            text: '地铁线路图绘制器（Rail Map Painter）',
            href: 'https://railmapgen.org/?app=rmp',
          },
          '。请在',
          { text: '公共交通导视', href: '/services/transit-materials' },
          '的“线网数据”区域使用',
          { icon: 'upload_file', label: '导入自己的项目' },
          '，不要使用地铁导视编辑器中的“导入工程”。请选择 JSON 格式的 RMP 项目文件。当前支持 RMP v77 及以下版本，文件不能超过 5 MB，最多包含 2,000 个节点和 4,000 条连接；项目还需要至少一个带名称的可识别车站，以及一条带有效线路配色的连接。其他缺少名称的站点可以在导入后补全。也可以先使用页面自动加载的 RMP 画廊示例熟悉项目数据模式。',
        ],
        keywords: ['RMP', 'JSON', '导入失败', '5 MB', 'v77', '线网项目', '画廊示例'],
      },
      {
        id: 'rmp-import-readonly',
        question: '导入 RMP 项目后，可以在物料工作台修改线网吗？',
        answer: [
          '不能修改项目固有的站点位置、站序、连接或拓扑；这些内容仍需回到 ',
          { text: 'Rail Map Painter', href: 'https://railmapgen.org/?app=rmp' },
          ' 修改并重新导入。工作台可以使用',
          { icon: 'edit_location_alt', label: '补站名' },
          '为未命名站点补充主名称和副名称，并使用',
          { icon: 'edit', label: '配置项目线路名称' },
          '为线路补充展示名称。这些补充只影响工作台中的项目数据，不会改写原始 JSON 文件。',
        ],
        keywords: ['RMP 只读', '修改站点', '补站名', '线路名称', '重新导入', '自定义线网'],
      },
      {
        id: 'rmp-project-storage',
        question: '导入的 RMP 项目会保留吗？切回服务器线网会删除它吗？',
        answer: [
          '有效项目会立即用于当前页面。账号处于可用登录状态时，系统还会尝试把它暂存为当前用户的线网草稿：“已暂存”表示重新打开页面后可以恢复，“仅本页”表示没有保存成功。没有已暂存项目时，页面可能载入带来源和许可信息的 RMP 画廊示例，示例上的名称调整只在本页有效。切换到服务器线网不会删除草稿，只有使用',
          { icon: 'close', label: '移除已导入项目' },
          '才会清除已导入项目并回到示例或服务器线网。',
        ],
        keywords: ['RMP 暂存', '仅本页', '已暂存', '服务器线网', '移除项目', '画廊示例', '登录'],
      },
      {
        id: 'rmp-line-names-colors',
        question: '为什么导入 RMP 后会显示内部线路编号或未命名站点？',
        answer: [
          'RMP 项目提供线网拓扑、部分站名、线路标识和连接配色，但不一定包含适合展示的完整名称。使用',
          { icon: 'edit_location_alt', label: '补站名' },
          '可补充未命名站点；使用',
          { icon: 'edit', label: '配置项目线路名称' },
          '可为每条线路补充主名称和副名称。线路颜色仍取自项目中的有效连接配色，补充名称不会改变站点位置、连接或线网拓扑。',
        ],
        keywords: [
          '线路编号',
          '线路名称',
          '未命名站点',
          '副名称',
          '线路颜色',
          'RMP 配色',
          '线网拓扑',
        ],
      },
      {
        id: 'network-health-meaning',
        question: '公共交通网络健康度可以直接作为运营结论吗？',
        answer:
          '不可以。健康度页面根据已发布线路、站点和拓扑连接计算统计指标，并用预设启发式阈值生成建议。它适合发现待核查目标，不代表线路服务质量已经得到验证，也不能替代人工规划判断。',
        keywords: ['线网健康度', '启发式建议', '运营指标', '规划结论'],
      },
      {
        id: 'network-health-coverage',
        question: '公共交通网络健康度显示“部分数据”时还能参考吗？',
        answer:
          '可以作为当前已读取数据的排查线索，但不能把它当作完整线网结论。页面会列出数据源状态；只要存在部分可用或不可用的数据源，统计范围和建议都可能不覆盖全部线路、站点或运营方。',
        keywords: ['部分数据', '数据源', '统计范围', '线网不完整', '运营方'],
      },
    ],
  },
];

export function faqAnswerText(answer: FaqAnswer): string {
  if (typeof answer === 'string') {
    return answer;
  }

  return answer
    .map((part) =>
      typeof part === 'string' ? part : 'text' in part ? part.text : (part.label ?? ''),
    )
    .join('');
}
