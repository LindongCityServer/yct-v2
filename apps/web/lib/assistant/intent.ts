import type { AssistantPageContext, AssistantPageHighlight } from './chat';
import type { AssistantReference } from './retrieval';

/**
 * 问一问的第 0 轮意图分类。
 *
 * 这一层只回答三个问题：这句话在问什么、回答它需不需要本人账号资料、能不能在群里回答。
 * 它不访问数据库、不发网络请求、不接收完整账号对象，也不参与权限判断：
 * 真正的账号校验仍然在 resolveCurrentPlayerLocation / resolveViewerProfile 里完成。
 *
 * 分类必须是确定性的：默认不额外调用模型，避免每条消息都多一次延迟和费用。
 * 规则命中不了时返回 unknown，交回现有的检索与主模型流程，不要在这里过度拦截。
 */

export type AssistantIntent =
  | 'self_location'
  | 'nearby'
  | 'route'
  | 'identity'
  | 'account_data'
  | 'public_info'
  | 'server_status'
  | 'site_help'
  | 'smalltalk'
  | 'feedback'
  | 'unknown';

export type AssistantIntentConfidence = 'high' | 'medium' | 'low';

export type AssistantAccountDataKind =
  'orders' | 'tickets' | 'ride_code' | 'favorites' | 'reminders';

export interface AssistantIntentResult {
  intent: AssistantIntent;
  confidence: AssistantIntentConfidence;
  needsAccount: boolean;
  needsLocation: boolean;
  needsProfile: boolean;
  privateOnly: boolean;
  accountDataKind?: AssistantAccountDataKind;
  toolHints: string[];
  reasonCode: string;
}

export interface AssistantIntentInput {
  query: string;
  channel?: 'qq-group' | 'qq-c2c';
  /**
   * 是否带有可用的账号上下文（网页已验证会话或 QQ 签名上下文）。
   * 意图分类本身不看这个值：同一个问题在有没有账号时意图不变，
   * 需不需要账号由 needsAccount 表达，缺少账号时的提示由预检处理。
   */
  hasAccountContext: boolean;
  page?: AssistantPageContext;
  highlights?: AssistantPageHighlight[];
}

export type AssistantIntentReference = Omit<AssistantReference, 'id'>;

export interface AssistantIntentPrecheck {
  text: string;
  references: AssistantIntentReference[];
  reasonCode: string;
}

const accountDataLabels: Record<AssistantAccountDataKind, string> = {
  orders: '订单',
  tickets: '票务',
  ride_code: '乘车码',
  favorites: '收藏',
  reminders: '提醒',
};

/** 买票、购票属于公开信息；不能因为句子里有“我的票”就当成账号里的票。 */
const ticketPurchasePattern =
  /(?:在哪|哪里|哪儿|怎么|如何|能不能|能否)(?:可以)?(?:买|购买|购票|订票)|买票|购票|售票|票价|门票/u;

const ownsTicketPattern = /我(?:买|订|购)的(?:票|车票|船票|机票|门票)/u;

/** “我”相关的路线起点；只有这类问法才需要账号位置。 */
const routeActionPattern =
  /怎么走|怎么去|怎么到|怎么坐|怎么前往|如何去|如何到|如何前往|怎样去|路线|规划路线|换乘|坐几路|坐什么车|打车|步行|骑车|出发|前往|去往/u;

const selfPositionPattern = /我(?:现在|目前)?的?(?:当前)?(?:位置|坐标)|当前位置/u;

const selfRouteReferencePattern =
  /从我这|从我这里|从我现在|从我的位置|从当前位置|以我为(?:起点|出发点)|以我的位置|由我这|我这(?:去|到|往|出发)|我这里(?:去|到|往|出发)/u;

const routeEndpointPattern =
  /(?:从|由)\s*[^，。！？?]{1,20}\s*(?:到|去|往|前往|去往)\s*[^，。！？?]{1,20}/u;

const abbreviatedRoutePattern =
  /[^，。！？?]{1,20}\s*(?:到|去)\s*[^，。！？?]{1,20}\s*(?:怎么走|怎么去|怎么坐|如何走|如何到|如何前往|路线)/u;

const selfLocationPattern =
  /我(?:现在|目前|人|这边)?(?:到底|究竟)?(?:在|位于)(?:哪|哪里|哪儿|什么位置|什么地方)|我(?:现在|目前)?的?(?:当前)?(?:位置|坐标)|当前位置(?:在哪|是什么)?/u;

const nearbyWordPattern = /附近|周边|周围/u;
const nearestWordPattern = /离[^，。！？?]{1,20}最近|最近的/u;

const selfNearbyPattern =
  /离我(?:最近|不远|很近|近)|我(?:家|这里|这儿|这边|这)?(?:附近|周边|周围)|我(?:附近|周围|周边)|我这边|以我(?:为中心|为圆心)/u;

const identityPattern =
  /我的?(?:wiki|维基)(?:身份|账号|名|名字|资料)|我的?(?:服务器|游戏)(?:账号|名|名字|id)|我的?身份|我的?角色|我的?(?:账号|帐号)(?!设置|登录|绑定|验证|密码)/iu;

const serverStatusPattern =
  /(?:服务器|游戏服)(?:现在|目前)?(?:在线|开着|炸了|崩了|状态|人数|几个人|多少人在线)|在线人数|现在几个人|几个人在线|服务器人数|服炸了吗|服务器状态|服务器在线|在线玩家|谁在线|哪些人在线|谁在玩|^(?:现在|目前)?(?:有)?几个人/u;

const feedbackPattern =
  /反馈|报错|出错|错误|异常|打不开|加载不出|无法加载|白屏|卡住|闪退|崩溃|没反应|不能用|提(?:个|一个)?建议|功能建议|改进建议|意见反馈|bug|issue|crash|broken|not working/i;

const siteHelpPattern =
  /怎么绑定|如何绑定|绑定(?:码|账号|临东通|qq)|解绑|账号设置|账号(?:在哪|怎么|设置|登录)|登录(?:在哪|入口|不了|失败)|注册账号|问一问(?:怎么用|在哪|怎么开启|是什么)|怎么用|如何使用|使用说明|帮助中心|模型\s*key|api\s*key|设置(?:在哪|怎么设置)/iu;

const smalltalkPattern =
  /^(?:你好|您好|hi|hello|嗨|哈喽|哈啰|在吗|在不在|谢谢(?:你|啦|了)?|多谢|感谢|辛苦了|再见|拜拜|晚安|早安|早上好|中午好|下午好|晚上好|好的|好吧|ok|okay|嗯|嗯嗯|哈哈|嘿嘿|你是谁|你叫什么(?:名字)?|你是什么|你能做什么|你会什么|介绍一下你自己)(?:呀|啊|呢|吧|啦|了|哦|喔|嘛|哈)*$/iu;

const transitPublicPattern =
  /线路|公交|地铁|有轨|电车|车站|站点|站台|班次|时刻|首班|末班|发车|换乘|票价|票|客运|船班|航班|车次|停运|调整|绕行|施工|运营|公告|通知|沿线|经过|途经|开通|线路图/u;

const placePublicPattern =
  /地点|在哪|哪里|哪儿|有什么|有哪些|好玩|好吃|推荐|商场|超市|医院|学校|公园|餐厅|景点|工厂|银行|酒店|住宿|市场|广场|大厦|小区|道路|街|桥|码头|机场/u;

const wikiPublicPattern = /wiki|维基|历史|由来|来历|介绍|创始人/iu;

const mapPublicPattern = /地图|路线|导航|坐标|距离|方位/u;

const operationPublicPattern = /公告|停运|调整|施工|绕行|限行|活动|通知/u;

/** 这些“地点”其实是用户身边的模糊指代，不能当成显式地名。 */
const selfAnchorPattern =
  /^(?:我|我家|家|我公司|公司|单位|学校|宿舍|这边|这里|这儿|这|本地|附近|周围|周边)$/u;

/** 把“请问/问一下”等礼貌前缀去掉，避免把整串当成地名。 */
const anchorPrefixPattern = /^(?:请问|问一下|我想问|想问|想问问|麻烦问一下|麻烦问下)/u;

/**
 * 纯函数分类入口。
 *
 * 规则按“越具体越先判断”的顺序排列：
 * 账号数据 → 路线 → 自身位置 → 周边 → 服务器状态 → 反馈 → 站内帮助 → 身份 → 寒暄 → 公开信息。
 * 没有命中时返回 unknown，不拦截现有检索和工具。
 */
export function classifyAssistantIntent(input: AssistantIntentInput): AssistantIntentResult {
  const query = normalizeQuery(input.query);
  if (!query) {
    return createResult('unknown', 'low', 'unknown.empty');
  }

  const compactQuery = query.replace(/[\s\u3000]+/g, '');
  const spokenQuery = compactQuery.replace(/[，。！？!?、；;：:~～…]/g, '');

  const accountDataKind = detectAccountDataKind(query);
  if (accountDataKind) {
    return createResult('account_data', 'high', `account_data.${accountDataKind}`, {
      needsAccount: true,
      privateOnly: true,
      accountDataKind,
      // 账号订单、票据、乘车码、收藏、提醒目前都没有对应工具；
      // 预检会直接回答“暂未接入”，不能让模型自由发挥。
      toolHints: [],
    });
  }

  const routeAction = routeActionPattern.test(query);
  const selfPosition = selfPositionPattern.test(query);
  const selfRouteReference = selfRouteReferencePattern.test(query) || (selfPosition && routeAction);
  const explicitRouteEndpoint =
    routeEndpointPattern.test(query) || abbreviatedRoutePattern.test(query);
  if (routeAction || selfRouteReference || explicitRouteEndpoint) {
    const needsLocation = selfRouteReference;
    const transitRoute = /班次|换乘|客运|船班|航班|火车|车次/u.test(query);
    return createResult(
      'route',
      selfRouteReference ? 'high' : 'medium',
      selfRouteReference
        ? 'route.self_origin'
        : explicitRouteEndpoint
          ? 'route.explicit_endpoints'
          : 'route.general',
      {
        needsAccount: needsLocation,
        needsLocation,
        privateOnly: needsLocation,
        toolHints: transitRoute ? ['plan_route', 'plan_journey'] : ['plan_route'],
      },
    );
  }

  if (selfLocationPattern.test(query)) {
    return createResult('self_location', 'high', 'self_location.explicit', {
      needsAccount: true,
      needsLocation: true,
      privateOnly: true,
      toolHints: [],
    });
  }

  const nearbyIntentPattern =
    nearbyWordPattern.test(query) ||
    nearestWordPattern.test(query) ||
    selfNearbyPattern.test(query);
  if (nearbyIntentPattern) {
    const selfNearby = selfNearbyPattern.test(query);
    const anchor = extractNearbyAnchor(query);
    const pageAnchor = findPageAnchor(query, input.page, input.highlights, !selfNearby && !anchor);

    // “离我最近/我附近/我这附近”没有显式地名，必须用本人位置。
    if (selfNearby) {
      return createResult('nearby', 'high', 'nearby.self_anchor', {
        needsAccount: true,
        needsLocation: true,
        privateOnly: true,
        toolHints: [],
      });
    }

    // “临东站附近/离临东站最近”是公开地点周边，不需要账号位置。
    if (anchor && !isSelfAnchor(anchor)) {
      return createResult('public_info', 'medium', 'public_info.place_nearby', {
        toolHints: ['nearby_places'],
      });
    }

    // 页面正在查看某个地点/线路时，“这里附近/附近有什么”指向页面内容。
    if (pageAnchor) {
      return createResult('public_info', 'medium', 'public_info.page_anchor', {
        toolHints:
          pageAnchor.kind === 'line' || pageAnchor.kind === 'station'
            ? ['search_transit']
            : ['nearby_places', 'search_places'],
      });
    }

    // 没有显式锚点的“附近有什么”默认按“我附近”处理；
    // 群聊会在预检阶段直接提示私聊，不读取账号位置。
    return createResult('nearby', 'medium', 'nearby.implicit_self', {
      needsAccount: true,
      needsLocation: true,
      privateOnly: true,
      toolHints: [],
    });
  }

  if (serverStatusPattern.test(query)) {
    return createResult('server_status', 'high', 'server_status.query', {
      toolHints: ['get_server_status'],
    });
  }

  if (feedbackPattern.test(query)) {
    return createResult('feedback', 'medium', 'feedback.issue', {
      toolHints: [],
    });
  }

  if (siteHelpPattern.test(query)) {
    return createResult('site_help', 'medium', 'site_help.guide', {
      toolHints: ['search_site_content'],
    });
  }

  if (
    spokenQuery === '我是谁' ||
    /^我(?:到底)?是谁(?:啊|呀|呢)?$/u.test(spokenQuery) ||
    identityPattern.test(compactQuery)
  ) {
    return createResult('identity', 'high', 'identity.self', {
      needsAccount: true,
      needsProfile: true,
      privateOnly: true,
      toolHints: [],
    });
  }

  if (smalltalkPattern.test(spokenQuery)) {
    return createResult('smalltalk', 'high', 'smalltalk.greeting', {
      toolHints: [],
    });
  }

  const publicInfo = detectPublicInfo(query);
  if (publicInfo) {
    return publicInfo;
  }

  return createResult('unknown', 'low', 'unknown.no_rule');
}

/**
 * 预检：能确定性回答的句子不要交给主模型。
 *
 * 顺序很重要：群聊隐私 → 账号数据未接入 → 未绑定 → 未验证 → 没有位置记录。
 * 返回 undefined 表示可以继续走现有检索 + 模型流程。
 */
export function buildAssistantIntentPrecheck(input: {
  result: AssistantIntentResult;
  channel?: 'qq-group' | 'qq-c2c';
  hasAccountContext: boolean;
  hasVerifiedAccount?: boolean;
  hasLocation: boolean;
}): AssistantIntentPrecheck | undefined {
  const { result, channel } = input;
  const hasVerifiedAccount = input.hasVerifiedAccount ?? input.hasAccountContext;

  if (result.privateOnly && channel === 'qq-group') {
    return {
      text: buildGroupPrivateText(result),
      references: [],
      reasonCode: 'precheck.private_only_group',
    };
  }

  if (result.accountDataKind) {
    const label = accountDataLabels[result.accountDataKind];
    return {
      text: [
        `问一问暂未接入账号内的${label}查询，不能读取或代查你的${label}。`,
        '现在可以查询的是公开的线路、站点、地点、班次和运营公告；账号数据请以站内对应页面为准。',
        input.hasAccountContext ? '' : '登录或绑定账号不会改变这一点。',
      ]
        .filter(Boolean)
        .join(''),
      references: [],
      reasonCode: 'precheck.account_data_unavailable',
    };
  }

  if (result.needsAccount && !input.hasAccountContext) {
    return {
      text:
        channel === 'qq-c2c'
          ? '这个问题需要用到你的临东通账号，但当前 QQ 还没有绑定。请先私聊发送 /绑定 完成绑定，并确认服务器账号已验证，然后再问一次。'
          : '这个问题需要用到你的账号信息。请先在「账号设置」登录临东通，并验证服务器账号，然后再问一次。',
      references:
        channel === 'qq-c2c'
          ? []
          : [
              {
                title: '账号设置',
                source: '雨城通',
                href: '/account',
                snippet: '登录临东通并验证服务器账号',
                tone: 'page',
              },
            ],
      reasonCode: 'precheck.account_required',
    };
  }

  if (result.needsAccount && !hasVerifiedAccount) {
    return {
      text:
        channel === 'qq-c2c'
          ? 'QQ 已经绑定临东通，但服务器账号还没有验证，暂时不能用这个功能。请到临东通「账号设置」完成服务器账号验证后再问。'
          : '你的临东通账号还没有验证服务器账号，暂时不能用这个功能。请到「账号设置」完成服务器账号验证后再问。',
      references: [
        {
          title: '账号设置',
          source: '雨城通',
          href: '/account',
          snippet: '完成服务器账号验证',
          tone: 'page',
        },
      ],
      reasonCode: 'precheck.account_unverified',
    };
  }

  if (result.needsLocation && !input.hasLocation) {
    return {
      text: buildMissingLocationText(result.intent),
      references: [
        {
          title: '在地图上查看当前位置',
          source: '当前位置',
          href: '/map',
          snippet: '没有最后记录位置时，可以在地图上手动定位',
          tone: 'place',
        },
      ],
      reasonCode: 'precheck.location_missing',
    };
  }

  return undefined;
}

/** 群聊里只提示去私聊或账号设置，不读取、也不暗示群里存在账号绑定。 */
function buildGroupPrivateText(result: AssistantIntentResult): string {
  if (result.intent === 'identity') {
    return '群聊里无法确认你的账号身份，也不会读取账号资料。请私聊机器人发送 /绑定，绑定临东通并验证服务器账号后再问。';
  }
  if (result.intent === 'account_data') {
    return '票务、订单、乘车码、收藏和提醒属于账号数据，群聊不会读取；问一问目前也还没有接入这些查询。请私聊机器人发送 /绑定 绑定临东通，或直接到站内对应页面查看。';
  }
  if (result.intent === 'nearby') {
    return '群聊里不能读取你的账号位置，也无法判断“离我最近/我附近”是哪里。请私聊机器人发送 /绑定 绑定临东通并验证服务器账号后再问。';
  }
  return '群聊里不能读取你的账号位置。需要查看“我在哪”或从当前位置出发时，请私聊机器人发送 /绑定 绑定临东通并验证服务器账号后再问。';
}

/** 有账号但没有位置记录：给出原因和地图手动定位入口，不让模型猜坐标。 */
function buildMissingLocationText(intent: AssistantIntent): string {
  if (intent === 'nearby') {
    return '没有查到你的最后记录位置，暂时无法判断“离我最近/我附近”有哪些地点。可以打开地图手动定位当前位置，或进入服务器后稍等片刻再问。';
  }
  if (intent === 'route') {
    return '没有查到你的最后记录位置，无法把“我这”作为路线起点。可以打开地图手动设置起点和终点，或进入服务器后稍等片刻再问。';
  }
  return '没有查到你的最后记录位置：可能是服务器近期没有采集到你的位置，或位置快照暂不可用。可以打开地图手动定位当前位置，或进入服务器后稍等片刻再问。';
}

/** 是否属于“附近/周边”类问法；检索层据此启用空间计算，不再重复写正则。 */
export function isNearbyIntent(result: AssistantIntentResult): boolean {
  return [
    'nearby.self_anchor',
    'nearby.implicit_self',
    'public_info.place_nearby',
    'public_info.page_anchor',
  ].includes(result.reasonCode);
}

/**
 * 群聊里即使是需要账号的意图，也不应该把位置注入上下文。
 * 预检会先拦住这类请求；这个函数是第二道保险。
 */
export function shouldInjectCurrentLocation(
  result: AssistantIntentResult,
  channel?: 'qq-group' | 'qq-c2c',
): boolean {
  return result.needsLocation && channel !== 'qq-group';
}

/** 寒暄、服务器状态和身份问题不需要全站检索；身份资料由 viewer prompt 提供。 */
export function shouldRunAssistantRetrieval(result: AssistantIntentResult): boolean {
  return !['smalltalk', 'server_status', 'identity'].includes(result.intent);
}

/** 寒暄和服务器状态不需要提问者身份；站内帮助仍可借助身份判断是否已绑定。 */
export function shouldInjectViewerProfile(result: AssistantIntentResult): boolean {
  return result.intent !== 'smalltalk' && result.intent !== 'server_status';
}

/** 寒暄、服务器状态和身份问题不需要页面上下文。 */
export function shouldInjectPageContext(result: AssistantIntentResult): boolean {
  return !['smalltalk', 'server_status', 'identity'].includes(result.intent);
}

/** 寒暄不需要工具；保留工具会给“你好”增加无意义的调用概率。 */
export function shouldEnableTools(result: AssistantIntentResult): boolean {
  return result.intent !== 'smalltalk';
}

function detectAccountDataKind(query: string): AssistantAccountDataKind | undefined {
  const ownsTicket = ownsTicketPattern.test(query);
  // “我的票在哪买”问的是购买方式，不是账号里的票。
  if (!ownsTicket && ticketPurchasePattern.test(query)) {
    return undefined;
  }

  if (/我的?订单|订单(?:在哪|呢|查询|记录|状态|详情)|查(?:一下)?我的?订单/u.test(query)) {
    return 'orders';
  }
  if (
    /我的?(?:车票|船票|机票|门票|票)(?:呢|在哪|哪里|记录|状态|订单|信息|余额|退票|改签|怎么退|怎么改|取票|$|[？?。！!，,\s])/u.test(
      query,
    ) ||
    ownsTicket ||
    /查(?:一下)?(?:我的)?(?:车票|船票|机票)/u.test(query)
  ) {
    return 'tickets';
  }
  if (/我的?(?:乘车码|乘车二维码)|乘车码(?:在哪|呢|打不开|用不了|刷不了|余额)|刷码/u.test(query)) {
    return 'ride_code';
  }
  if (/我的收藏|我收藏的|收藏(?:夹|列表)(?:在哪|呢|里)?|收藏(?:在哪|呢|记录)/u.test(query)) {
    return 'favorites';
  }
  if (/我的提醒|我的?订阅|我订阅的|提醒(?:事项|列表|记录)|订阅(?:提醒|列表)/u.test(query)) {
    return 'reminders';
  }

  return undefined;
}

function detectPublicInfo(query: string): AssistantIntentResult | undefined {
  const toolHints = buildPublicInfoToolHints(query);
  // 公告/停运/调整这类运营信息优先归到 operations：
  // 它们和线路、站点共用一些词，但按群范围关闭时应该跟着「公告与运营」走。
  if (operationPublicPattern.test(query)) {
    return createResult('public_info', 'medium', 'public_info.operations', { toolHints });
  }
  if (transitPublicPattern.test(query)) {
    return createResult('public_info', 'medium', 'public_info.transit', { toolHints });
  }
  if (placePublicPattern.test(query)) {
    return createResult('public_info', 'medium', 'public_info.place', { toolHints });
  }
  if (wikiPublicPattern.test(query)) {
    return createResult('public_info', 'medium', 'public_info.wiki', { toolHints });
  }
  if (mapPublicPattern.test(query)) {
    return createResult('public_info', 'medium', 'public_info.map', { toolHints });
  }
  return undefined;
}

function buildPublicInfoToolHints(query: string): string[] {
  const hints: string[] = [];
  if (nearbyWordPattern.test(query) || nearestWordPattern.test(query)) {
    hints.push('nearby_places');
  }
  if (/沿线|沿途|沿路/u.test(query)) {
    hints.push('along_line_places');
  }
  if (/班次|时刻|首班|末班|发车|几点/u.test(query)) {
    hints.push('line_timetable', 'query_travel_schedules');
  }
  if (/线路|公交|地铁|车站|站点|换乘|票价/u.test(query)) {
    hints.push('search_transit');
  }
  if (/地点|在哪|哪里|商场|超市|医院|学校|公园|餐厅|景点|工厂|好玩|好吃/u.test(query)) {
    hints.push('search_places');
  }
  if (operationPublicPattern.test(query)) {
    hints.push('search_site_content');
  }
  if (/wiki|维基|历史|由来|来历/u.test(query)) {
    hints.push('wiki_search');
  }
  if (/从.+到|怎么走|怎么去|路线/u.test(query)) {
    hints.push('plan_route');
  }
  return [...new Set(hints)];
}

function extractNearbyAnchor(query: string): string | undefined {
  const nearbyMatch = /(?:离|距|距离)?\s*([^\s，。！？?、；;]{1,16}?)\s*(?:附近|周边|周围)/u.exec(
    query,
  );
  if (nearbyMatch?.[1]) {
    return nearbyMatch[1].replace(anchorPrefixPattern, '').trim();
  }

  const nearestMatch = /(?:离|距|距离)\s*([^\s，。！？?、；;]{1,16}?)\s*(?:最近|不远|很近)/u.exec(
    query,
  );
  return nearestMatch?.[1]?.replace(anchorPrefixPattern, '').trim();
}

function isSelfAnchor(anchor: string): boolean {
  return !anchor || selfAnchorPattern.test(anchor);
}

function findPageAnchor(
  query: string,
  page: AssistantPageContext | undefined,
  highlights: AssistantPageHighlight[] | undefined,
  allowImplicit: boolean,
): AssistantPageHighlight | undefined {
  const list = highlights ?? page?.highlights ?? [];
  if (list.length === 0) {
    return undefined;
  }

  const mentioned = list.find(
    (highlight) => highlight.title.length >= 2 && query.includes(highlight.title),
  );
  if (mentioned) {
    return mentioned;
  }
  if (allowImplicit || /这里|这儿|这附近|当前|这个|这条/u.test(query)) {
    return list[0];
  }
  return undefined;
}

function createResult(
  intent: AssistantIntent,
  confidence: AssistantIntentConfidence,
  reasonCode: string,
  overrides: Partial<Omit<AssistantIntentResult, 'intent' | 'confidence' | 'reasonCode'>> = {},
): AssistantIntentResult {
  return {
    intent,
    confidence,
    needsAccount: false,
    needsLocation: false,
    needsProfile: false,
    privateOnly: false,
    toolHints: [],
    reasonCode,
    ...overrides,
  };
}

function normalizeQuery(value: string): string {
  return value.replace(/[\s\u3000]+/g, ' ').trim();
}
