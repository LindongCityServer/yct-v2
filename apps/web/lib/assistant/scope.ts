import type { AssistantIntentResult } from './intent';

/**
 * 问一问的按群范围。
 *
 * 网页 `/ask` 不传 capabilities，所有范围都开着；QQ 群聊由机器人按群配置传入，
 * 服务端在检索和模型调用之前就能拦截被关闭的范围，不产生检索和 token 成本。
 */
export type AssistantScope = 'basics' | 'server' | 'transit' | 'operations' | 'map' | 'general';

export interface AssistantCapabilities {
  server: boolean;
  transit: boolean;
  operations: boolean;
  map: boolean;
  general: boolean;
}

export const assistantScopeLabels: Record<AssistantScope, string> = {
  basics: '使用说明',
  server: '临东服资料',
  transit: '公交与线路',
  operations: '公告与运营',
  map: '地图与地点',
  general: '通用问答',
};

const capabilityKeys = ['server', 'transit', 'operations', 'map', 'general'] as const;

/** 兼容旧版机器人：字段缺失或不是布尔值时不启用范围控制。 */
export function normalizeAssistantCapabilities(value: unknown): AssistantCapabilities | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const capabilities: AssistantCapabilities = {
    server: true,
    transit: true,
    operations: true,
    map: true,
    general: true,
  };
  let seen = false;
  for (const key of capabilityKeys) {
    if (typeof record[key] === 'boolean') {
      capabilities[key] = record[key] as boolean;
      seen = true;
    }
  }
  return seen ? capabilities : undefined;
}

export function allowedScopesFor(capabilities: AssistantCapabilities): AssistantScope[] {
  return ['basics', ...capabilityKeys.filter((key) => capabilities[key] === true)];
}

/**
 * 意图 → 范围。返回 undefined 表示不参与范围控制（例如账号类问题交给原有预检）。
 */
export function scopeForIntent(intent: AssistantIntentResult): AssistantScope | undefined {
  switch (intent.intent) {
    case 'public_info':
      switch (intent.reasonCode) {
        case 'public_info.transit':
          return 'transit';
        case 'public_info.operations':
          return 'operations';
        case 'public_info.place':
        case 'public_info.place_nearby':
        case 'public_info.page_anchor':
        case 'public_info.map':
          return 'map';
        case 'public_info.wiki':
          return 'server';
        default:
          return undefined;
      }
    case 'route':
      return intent.needsAccount ? undefined : 'transit';
    case 'server_status':
      return 'server';
    case 'site_help':
    case 'smalltalk':
    case 'feedback':
      return 'basics';
    case 'unknown':
      return 'general';
    default:
      return undefined;
  }
}

export interface AssistantScopePrecheck {
  text: string;
  reasonCode: string;
}

/**
 * 命中已关闭范围时返回固定文案；调用方应在检索之前短路。
 * - 除通用问答外的范围：低置信度不拦，避免把正常问题误判成别的范围；
 * - 通用问答（unknown）的置信度天然是 low，只在没有历史时拦，追问继承上文。
 */
export function buildAssistantScopePrecheck({
  result,
  capabilities,
  hasHistory = false,
}: {
  result: AssistantIntentResult;
  capabilities?: AssistantCapabilities;
  hasHistory?: boolean;
}): AssistantScopePrecheck | null {
  if (!capabilities) {
    return null;
  }
  const scope = scopeForIntent(result);
  if (!scope || scope === 'basics') {
    return null;
  }
  if (scope === 'general') {
    // unknown 的置信度天然是 low；只有没有历史、确实像通用提问时才拦。
    if (hasHistory) {
      return null;
    }
  } else if (result.confidence === 'low') {
    return null;
  }
  if (capabilities[scope] !== false) {
    return null;
  }
  const label = assistantScopeLabels[scope];
  const subject = label.endsWith('问答') ? label : `「${label}」问答`;
  return {
    text: `本群未开启${subject}。群主或管理员可以 @我 发送 /模块 开启。`,
    reasonCode: `group_scope.${scope}_disabled`,
  };
}

/** 提示词里的范围声明；全部开启时不额外增加内容。 */
export function buildAssistantScopePrompt(capabilities?: AssistantCapabilities): string {
  if (!capabilities) {
    return '';
  }
  const disabled = capabilityKeys.filter((key) => capabilities[key] === false);
  if (disabled.length === 0) {
    return '';
  }
  const enabledLabels = allowedScopesFor(capabilities).map((scope) => assistantScopeLabels[scope]);
  const disabledLabels = disabled.map((key) => assistantScopeLabels[key]);
  return [
    `本群只开放以下问一问范围：${enabledLabels.join('、')}。`,
    `${disabledLabels.join('、')}在本群未开启。`,
    '属于未开启范围的问题，直接说明本群未开启该范围，不要用常识、推测或别处的资料代答。',
  ].join('');
}
