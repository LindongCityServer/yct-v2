import type { NextRequest } from 'next/server';
import { normalizePlayerKey } from '../player-location-store';
import { readWikiPlayerProfiles } from '../wiki-player-aliases';
import { resolveVerifiedServerAccount } from './current-location';

export type ViewerRole = 'owner' | 'staff' | 'resident' | 'guest';

export interface ViewerProfile {
  role: ViewerRole;
  serverAccountName?: string;
  wikiName?: string;
  roleText?: string;
}

/**
 * 反查当前提问者的服务器账号在 Wiki「玩家列表」里的备注角色。
 * 未绑定/未验证服务器账号按游客；已绑定但查不到备注按一般居民。
 */
export async function resolveViewerProfile(request: NextRequest): Promise<ViewerProfile> {
  const serverAccountName = await resolveVerifiedServerAccount(request);
  if (!serverAccountName) {
    return { role: 'guest' };
  }

  const profiles = await readWikiPlayerProfiles().catch(() => new Map());
  const profile = profiles.get(normalizePlayerKey(serverAccountName));

  return {
    role: classifyViewerRole(profile?.role),
    serverAccountName,
    wikiName: profile?.name,
    roleText: profile?.role,
  };
}

/** 把提问者身份写进系统提示词；只用于调整回答方式，不要求模型复述角色标签。 */
export function buildViewerPrompt(viewer: ViewerProfile): string {
  if (viewer.role === 'guest') {
    return '提问者身份：游客（未绑定或未验证服务器账号）。涉及需要服务器账号的功能时，说明需要先在账号设置里登录并验证服务器账号；不要假定对方有服务器内的任何身份。角色信息只用于调整回答方式，不要主动复述。';
  }

  const identity = viewer.wikiName
    ? `Wiki 名：${viewer.wikiName}${viewer.roleText ? `，备注：${viewer.roleText}` : ''}`
    : `服务器账号：${viewer.serverAccountName}`;

  if (viewer.role === 'owner') {
    return `提问者身份：临东市服务器服主（${identity}）。可以按服主视角回答；涉及后台、数据维护和物料审核时，给出对应的管理入口。角色信息只用于调整回答方式，不要主动复述。`;
  }
  if (viewer.role === 'staff') {
    return `提问者身份：临东市服务器管理成员（${identity}）。可以按管理视角说明后台入口、审核与数据维护流程，但仍然只能依据站内资料。角色信息只用于调整回答方式，不要主动复述。`;
  }

  return `提问者身份：已绑定服务器账号的居民（${identity}）。按普通居民回答，不要假定其拥有管理权限；如果问题涉及 Wiki 或社交内容里的人物，先确认是不是本人。角色信息只用于调整回答方式，不要主动复述。`;
}

function classifyViewerRole(roleText: string | undefined): ViewerRole {
  if (!roleText) {
    return 'resident';
  }
  if (/临东市服务器.*(?:服主|创始人)/u.test(roleText)) {
    return 'owner';
  }
  if (/临东市服务器.*(?:管理委员会|管理员|运维|管理)/u.test(roleText)) {
    return 'staff';
  }
  return 'resident';
}
