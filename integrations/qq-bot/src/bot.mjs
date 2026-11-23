import { askAssistant } from './assistant-client.mjs';
import { composeAnswer, prepareAnswerText } from './answer.mjs';
import { renderCardPng } from './card-render.mjs';
import { extractBilibiliUrl, fetchBilibiliVideo, formatBilibiliVideo } from './bilibili.mjs';
import { condenseWithModel } from './condense.mjs';
import { commandHelpText, handleCommand, parseIncomingCommand } from './commands.mjs';
import { CommunityStore, shanghaiDateKey } from './community.mjs';
import { GroupModuleStore } from './group-modules.mjs';
import { HintThrottle } from './hints.mjs';
import { pickReferenceImage } from './images.mjs';
import { MaterialSourceStore } from './material-sources.mjs';
import { handleModuleCommand } from './module-command.mjs';
import { buildHelpText, commandLabel, moduleById, moduleLabel } from './modules.mjs';
import { loadGroupNotices, resolveGroupNotice } from './notices.mjs';
import { OpsRecipientStore, OpsReminder, OpsReminderStore } from './ops-reminder.mjs';
import { startEventBridge } from './event-bridge.mjs';
import { PlayerEventMonitor } from './player-events.mjs';
import { QqLinkClient } from './ldpass-link.mjs';
import { GroupLinkTokenStore } from './group-link.mjs';
import { maskOpenId } from './log.mjs';
import { getBotVersion } from './version.mjs';
import { handleSignageCommand } from './signage.mjs';
import {
  classifyCommand,
  ConversationQueue,
  ConversationStore,
  RecentSet,
  SlidingWindowLimiter,
} from './conversation.mjs';

/** 被动回复上限：群聊 5 次、单聊 4 次，包含先发的那条提示。 */
const MAX_GROUP_REPLIES = 5;
const MAX_C2C_REPLIES = 4;

/**
 * 事件处理层：把 QQ 群 @ 消息和单聊消息翻译成一次问一问请求，再把回答切段回复。
 * 所有 QQ 接口错误都只影响当前这条消息，不能把网关或进程带崩。
 */
export class QQBot {
  constructor({
    api,
    config,
    logger,
    assistant = askAssistant,
    condense = condenseWithModel,
    command = handleCommand,
    cardRenderer = renderCardPng,
    community,
    queue,
    store,
    groupLinkTokens,
    moduleStore,
    materialSourceStore,
    signage = handleSignageCommand,
  } = {}) {
    this.api = api;
    this.config = config;
    this.logger = logger;
    this.assistant = assistant;
    this.condense = condense;
    this.command = command;
    this.cardRenderer = cardRenderer;
    this.linkClient = new QqLinkClient({
      baseUrl: config.link?.baseUrl,
      secret: config.link?.secret,
      timeoutMs: config.link?.timeoutMs,
      logger,
    });
    this.groupLinkTokens =
      groupLinkTokens ??
      new GroupLinkTokenStore({
        ttlMs: config.link?.groupTokenTtlMs,
        maxEntries: config.link?.groupTokenCacheMax,
      });
    this.accountContextCache = new Map();
    this.community =
      community ??
      new CommunityStore({
        path: config.statePath,
        fortuneTextsPath: config.fortuneTextsPath,
        logger,
      });
    this.store = store ?? new ConversationStore();
    this.queue = queue ?? new ConversationQueue({ maxGlobal: 3, maxPendingPerKey: 2, logger });
    this.userLimiter = new SlidingWindowLimiter({ limit: config.qq.userQpm });
    this.groupLimiter = new SlidingWindowLimiter({ limit: config.qq.groupQpm });
    this.groupNotices = loadGroupNotices(config.groupNoticesPath);
    this.moduleStore =
      moduleStore ??
      new GroupModuleStore({
        path: config.modules?.path ?? '',
        auditPath: config.modules?.auditPath ?? '',
        aliases: config.qq?.groupAliases ?? new Map(),
        logger,
      });
    this.hints = new HintThrottle({ ttlMs: config.modules?.hintTtlMs ?? 600_000 });
    this.materialSourceStore =
      materialSourceStore ??
      new MaterialSourceStore({
        path: config.materials?.sourcePath ?? '',
        logger,
      });
    this.opsRecipients = new OpsRecipientStore({
      path: config.ops?.recipientPath ?? '',
      logger,
    });
    this.opsReminder = new OpsReminder({
      store: new OpsReminderStore({
        path: config.ops?.statePath ?? '',
        logger,
      }),
      recipientStore: this.opsRecipients,
      api: this.api,
      logger,
    });
    this.signage = signage;
    this.toggleLimiter = {
      user: new SlidingWindowLimiter({ limit: 5 }),
      group: new SlidingWindowLimiter({ limit: 20 }),
    };
    this.bridgeTargets = new Set(config.events?.groupMap?.values?.() ?? []);
    this.bridgeSeen = new RecentSet();
    this.eventBridge = null;
    this.playerEvents = new PlayerEventMonitor({
      baseUrl: config.yct.baseUrl,
      intervalMs: config.reply.playerPollMs,
      logger,
      onEvent: (event) => this.broadcastPlayerEvent(event),
    });
    this.answerSeen = new RecentSet();
    this.statsSeen = new RecentSet();
    this.warnedFullMessage = false;
    this.warnedMissingRole = new Set();
    this.seenGroups = new Set();
  }

  async init() {
    await this.community.load();
    if (this.config.reply.playerEvents) {
      if (!this.playerEvents.enabled) {
        this.logger.warn(
          'QQ_BOT_PLAYER_EVENTS 已开启，但 YCT_BASE_URL 为空，玩家进出轮询不会启动。',
        );
      } else {
        this.playerEvents.start();
        const targets = this.resolveBroadcastGroups('playerEvents');
        this.logger.info(
          targets.length > 0
            ? `玩家进出轮询已启动：当前 ${targets.length} 个群开启播报，间隔 ${this.config.reply.playerPollMs}ms。`
            : '玩家进出轮询已启动；当前没有群开启玩家进出播报，群管理员可用 /模块 开 玩家进出播报。',
        );
      }
    } else if (this.moduleStore.listEnabledGroups('playerEvents').length > 0) {
      this.logger.warn(
        '有群开启了玩家进出播报，但 QQ_BOT_PLAYER_EVENTS=0，轮询不会启动；请让机器人运维打开全局开关。',
      );
    }
    if (
      this.config.events?.port === 0 &&
      this.moduleStore.listEnabledGroups('serverMessages').length > 0
    ) {
      this.logger.warn(
        '有群开启了服务器消息，但 QQ_BOT_EVENT_PORT=0，事件桥不会启动；请让机器人运维打开事件桥。',
      );
    }
    if (this.config.events?.port > 0) {
      this.eventBridge = await startEventBridge({
        port: this.config.events.port,
        bind: this.config.events.bind,
        token: this.config.events.token,
        opsToken: this.config.ops?.token ?? '',
        info: {
          version: getBotVersion(),
          startedAt: new Date().toISOString(),
        },
        logger: this.logger,
        onOneBotEvent: (event) => this.handleOneBotEvent(event),
        onServerEvent: (event) => this.handleServerEvent(event),
        onOpsEvent: (event) => this.opsReminder.handle(event),
      });
    }
  }

  async flush() {
    this.playerEvents.stop();
    if (this.eventBridge) {
      await this.eventBridge.close();
      this.eventBridge = null;
    }
    await this.community.flush();
  }

  /** 取一个群的有效开关；单聊不读群配置，沿用注册表默认值。 */
  policyFor(context) {
    if (context?.kind !== 'group' || !context.groupId) {
      return this.moduleStore.resolve('');
    }
    this.moduleStore.reloadIfChanged();
    return this.moduleStore.resolve(context.groupId);
  }

  canUseCommand(policy, commandId) {
    return this.moduleStore.isCommandEnabled(policy, commandId);
  }

  /** 事件类功能（进退群提示）按群判断，没有模块配置时默认开启。 */
  groupModuleEnabled(groupId, moduleId) {
    if (!groupId) {
      return false;
    }
    const policy = this.policyFor({ kind: 'group', groupId });
    return policy.modules?.[moduleId] !== false;
  }

  /**
   * 事件广播目标：只取显式开启模块的群（含群里 /模块 开的）。
   * 环境变量里的旧群列表已废弃，避免“模块显示关但仍在发消息”。
   */
  resolveBroadcastGroups(moduleId) {
    this.moduleStore.reloadIfChanged();
    return this.moduleStore.listEnabledGroups(moduleId);
  }

  /** 问一问能力位：不包含群 id，网页端只看到“哪些范围开着”。 */
  askCapabilities(policy) {
    const capabilities = {
      server: true,
      transit: true,
      operations: true,
      map: true,
      general: true,
    };
    for (const capability of Object.keys(capabilities)) {
      capabilities[capability] = policy.modules?.[`ask.${capability}`] !== false;
    }
    return capabilities;
  }

  /**
   * 只有群里有问一问范围被关闭时才延迟“正在查资料”：
   * 被范围拦截的回复是秒回的，先发提示再没下文会让成员以为机器人坏了。
   */
  shouldDeferAck(policy) {
    return Object.values(this.askCapabilities(policy)).some((enabled) => enabled === false);
  }

  scopeModuleFromReason(reasonCode) {
    if (
      typeof reasonCode !== 'string' ||
      !reasonCode.startsWith('group_scope.') ||
      !reasonCode.endsWith('_disabled')
    ) {
      return '';
    }
    const capability = reasonCode.slice('group_scope.'.length, -'_disabled'.length);
    const moduleId = `ask.${capability}`;
    return moduleById.has(moduleId) ? moduleId : '';
  }

  scopeBlockText(moduleId, policy) {
    const label = moduleLabel(moduleId);
    const subject = label.endsWith('问答') ? label : `「${label}」问答`;
    if (this.moduleStore.isLocked(policy, moduleId)) {
      return `本群未开启${subject}，该项由机器人管理员锁定。`;
    }
    return `本群未开启${subject}。群主或管理员可以 @我 发送 /模块 开启。`;
  }

  async replyDisabledHint(target, messageId, key, text) {
    if (this.config.modules?.hints === false) {
      return false;
    }
    if (!this.hints.shouldSend(`${target.openid}:${key}`)) {
      return false;
    }
    await this.safeReply(target, messageId, 1, text);
    return true;
  }

  async handleEvent(type, data) {
    if (!data || typeof data !== 'object') {
      return;
    }
    switch (type) {
      case 'GROUP_AT_MESSAGE_CREATE':
        this.recordGroupStats(data, 'at');
        if (!this.answerSeen.add(data.id)) {
          this.logger.debug(`重复推送的消息 ${data.id}，忽略。`);
          return;
        }
        await this.handleGroupMessage(data);
        return;
      case 'C2C_MESSAGE_CREATE': {
        const c2cUserId = data.author?.user_openid ?? data.author?.id ?? '';
        if (c2cUserId) {
          this.opsRecipients.remember(c2cUserId, { source: 'message' });
        }
        if (!this.answerSeen.add(data.id)) {
          this.logger.debug(`重复推送的消息 ${data.id}，忽略。`);
          return;
        }
        await this.handleC2CMessage(data);
        return;
      }
      case 'GROUP_MESSAGE_CREATE':
        this.recordGroupStats(data, 'all');
        if (!this.warnedFullMessage) {
          this.warnedFullMessage = true;
          this.logger.info(
            '收到 GROUP_MESSAGE_CREATE（接收所有群消息）：已计入发言统计，但不会逐条回答。',
          );
        }
        return;
      case 'GROUP_ADD_ROBOT':
        this.logger.info(
          `机器人被添加到群 ${maskOpenId(data.group_openid)}；` +
            '如需限制范围，请从开放平台复制该群 group_openid 写入 QQ_BOT_GROUP_ALLOWLIST。',
        );
        return;
      case 'GROUP_MEMBER_ADD':
        await this.sendMemberNotice('welcome', data);
        return;
      case 'GROUP_MEMBER_REMOVE': {
        const memberId = memberOpenId(data);
        const operatorId =
          typeof data.operator_openid === 'string'
            ? data.operator_openid
            : typeof data.operator_id === 'string'
              ? data.operator_id
              : '';
        await this.sendMemberNotice(operatorId && operatorId !== memberId ? 'kick' : 'leave', data);
        return;
      }
      case 'GROUP_DEL_ROBOT':
        this.logger.info(`机器人被移出群 ${maskOpenId(data.group_openid)}。`);
        return;
      case 'FRIEND_ADD': {
        const friendOpenId = data.openid ?? data.user_openid ?? '';
        if (friendOpenId) {
          this.opsRecipients.remember(friendOpenId, { source: 'friend_add' });
        }
        this.logger.info(`用户 ${maskOpenId(friendOpenId)} 添加了机器人。`);
        return;
      }
      default:
        this.logger.debug(`忽略事件 ${type}。`);
    }
  }

  async broadcastPlayerEvent(event) {
    const template =
      event.type === 'join' ? this.config.reply.playerJoinText : this.config.reply.playerLeaveText;
    const content = template.replaceAll('{name}', event.name);
    const groups = this.resolveBroadcastGroups('playerEvents');
    if (groups.length === 0) {
      this.logger.debug('没有群开启玩家进出播报，跳过。');
      return;
    }
    for (const groupId of groups) {
      try {
        await this.api.sendGroupMessage(groupId, { content, msg_type: 0 });
        this.logger.info(
          `玩家${event.type === 'join' ? '进服' : '退服'}提示已发送到群 ${maskOpenId(groupId)}。`,
        );
      } catch (error) {
        this.logger.warn(`玩家${event.type === 'join' ? '进服' : '退服'}提示发送失败：`, error);
      }
    }
  }

  async sendMemberNotice(kind, data) {
    const groupId =
      (typeof data.group_openid === 'string' && data.group_openid) ||
      (typeof data.group_id === 'string' && data.group_id) ||
      (typeof data.group?.openid === 'string' && data.group.openid) ||
      '';
    if (!groupId) {
      return;
    }
    if (this.config.qq.groupAllowlist.size > 0 && !this.config.qq.groupAllowlist.has(groupId)) {
      return;
    }
    if (!this.groupModuleEnabled(groupId, 'notices')) {
      this.logger.debug(`群 ${maskOpenId(groupId)} 未开启进退群提示，跳过。`);
      return;
    }
    const id = memberOpenId(data);
    const name =
      data.member_nickname ||
      data.author?.member_nickname ||
      data.member?.nickname ||
      data.nickname ||
      '';
    const text = resolveGroupNotice(this.groupNotices, groupId, kind, {
      name: String(name),
      id,
      group: this.groupNotices.groups[groupId]?.name ?? groupId,
    });
    const noticeGroupId = this.config.qq.groupAliases?.get(groupId) ?? groupId;
    const aliasedText = text
      ? text
      : resolveGroupNotice(this.groupNotices, noticeGroupId, kind, {
          name: String(name),
          id,
          group: this.groupNotices.groups[noticeGroupId]?.name ?? noticeGroupId,
        });
    if (!aliasedText) {
      return;
    }
    try {
      await this.api.sendGroupMessage(groupId, { content: aliasedText, msg_type: 0 });
      this.logger.info(`已发送群 ${maskOpenId(groupId)} 的 ${kind} 提示。`);
    } catch (error) {
      this.logger.warn(`发送群 ${maskOpenId(groupId)} 的 ${kind} 提示失败：`, error);
    }
  }

  async handleOneBotEvent(event) {
    if (!event || typeof event !== 'object') {
      return;
    }
    if (event.self_id && String(event.user_id) === String(event.self_id)) {
      return;
    }
    const sourceGroupId = String(event.group_id ?? '');
    if (!sourceGroupId) {
      return;
    }
    const targetGroupId =
      this.config.events.groupMap.get(sourceGroupId) ??
      (this.bridgeTargets.has(sourceGroupId) ? sourceGroupId : '');
    if (!targetGroupId) {
      return;
    }

    if (event.post_type === 'message' && event.message_type === 'group') {
      const messageId = String(event.message_id ?? '');
      if (messageId && !this.bridgeSeen.add(messageId)) {
        return;
      }
      const userId = String(event.user_id ?? '');
      if (!userId) {
        return;
      }
      this.community.recordMessage({
        groupId: targetGroupId,
        userId,
        name: event.sender?.card || event.sender?.nickname || userId,
        date: shanghaiDateKey(),
        source: 'all',
      });
      return;
    }

    if (event.post_type === 'notice') {
      const kind =
        event.notice_type === 'group_increase'
          ? 'welcome'
          : event.notice_type === 'group_decrease'
            ? event.sub_type === 'kick'
              ? 'kick'
              : 'leave'
            : '';
      if (!kind) {
        return;
      }
      if (!this.groupModuleEnabled(targetGroupId, 'notices')) {
        this.logger.debug(`群 ${maskOpenId(targetGroupId)} 未开启进退群提示，跳过。`);
        return;
      }
      const text = resolveGroupNotice(this.groupNotices, sourceGroupId, kind, {
        name: event.sender?.card || event.sender?.nickname || String(event.user_id ?? ''),
        id: String(event.user_id ?? ''),
        group: this.groupNotices.groups[sourceGroupId]?.name ?? sourceGroupId,
      });
      if (text) {
        await this.sendActiveText(targetGroupId, text);
      }
    }
  }

  async handleServerEvent(event) {
    if (!event || typeof event !== 'object') {
      return;
    }
    const type = String(event.type ?? '');
    const player = String(event.player ?? event.name ?? '').trim();
    const message = String(event.message ?? '').trim();
    let content = '';
    if (type === 'chat' || type === 'server_chat') {
      if (!player || !message) {
        return;
      }
      content = `💬 ${player}：${message.slice(0, 200)}`;
    } else if (type === 'join' || type === 'player_join' || type === 'server_join') {
      if (!player) {
        return;
      }
      content = this.config.reply.playerJoinText.replaceAll('{name}', player);
    } else if (type === 'leave' || type === 'player_leave' || type === 'server_leave') {
      if (!player) {
        return;
      }
      content = this.config.reply.playerLeaveText.replaceAll('{name}', player);
    }
    if (!content) {
      return;
    }

    const playerBroadcast =
      type === 'join' ||
      type === 'player_join' ||
      type === 'server_join' ||
      type === 'leave' ||
      type === 'player_leave' ||
      type === 'server_leave';
    const moduleId = playerBroadcast ? 'playerEvents' : 'serverMessages';
    const groups = this.resolveBroadcastGroups(moduleId);
    if (groups.length === 0) {
      this.logger.debug(`没有群开启${playerBroadcast ? '玩家进出播报' : '服务器消息'}，跳过。`);
      return;
    }
    for (const groupId of groups) {
      await this.sendActiveText(groupId, content);
    }
  }

  async sendActiveText(groupId, content) {
    try {
      await this.api.sendGroupMessage(groupId, { content, msg_type: 0 });
      this.logger.info(`事件消息已发送到群 ${maskOpenId(groupId)}。`);
      return true;
    } catch (error) {
      this.logger.warn(`事件消息发送失败（群 ${maskOpenId(groupId)}）：`, error);
      return false;
    }
  }

  recordGroupStats(data, source) {
    const groupId = typeof data.group_openid === 'string' ? data.group_openid : '';
    const userId = data.author?.member_openid ?? data.author?.id ?? '';
    if (!groupId || !userId || data.author?.bot) {
      return;
    }
    // 事件桥接管了这些群的全部消息时，避免官方 @ 事件与 OneBot 事件重复计数。
    if (this.eventBridge && this.bridgeTargets.has(groupId)) {
      return;
    }
    if (this.config.qq.groupAllowlist.size > 0 && !this.config.qq.groupAllowlist.has(groupId)) {
      return;
    }
    if (!this.statsSeen.add(data.id)) {
      return;
    }
    this.community.recordMessage({
      groupId,
      userId,
      name: userDisplayName(data),
      date: shanghaiDateKey(),
      source,
    });
  }

  async handleGroupMessage(data) {
    const groupOpenid = typeof data.group_openid === 'string' ? data.group_openid : '';
    // 群绑定只认事件里的 member_openid；这里单独保留严格值，不回退 user_openid。
    const memberOpenId =
      typeof data.author?.member_openid === 'string' ? data.author.member_openid : '';
    const userId = memberOpenId || data.author?.id || '';
    if (!groupOpenid || !userId) {
      return;
    }
    if (!this.seenGroups.has(groupOpenid)) {
      this.seenGroups.add(groupOpenid);
      this.logger.info(
        `首次收到群 ${maskOpenId(groupOpenid)} 的消息；` +
          '如需限制范围，请从开放平台复制该群 group_openid 写入 QQ_BOT_GROUP_ALLOWLIST。',
      );
    }
    if (this.config.qq.groupAllowlist.size > 0 && !this.config.qq.groupAllowlist.has(groupOpenid)) {
      this.logger.debug(`群 ${maskOpenId(groupOpenid)} 不在白名单，忽略。`);
      return;
    }

    const target = { kind: 'group', openid: groupOpenid };
    const role = normalizeMemberRole(data.author?.member_role);
    if (role === 'unknown' && !this.warnedMissingRole.has(groupOpenid)) {
      this.warnedMissingRole.add(groupOpenid);
      this.logger.warn(
        `群 ${maskOpenId(groupOpenid)} 的事件没有 member_role，/模块 将无法确认群主或管理员；` +
          '请确认机器人事件版本，必要时用 QQ_BOT_MODULE_ADMINS 兜底。',
      );
    }
    await this.handleIncoming({
      target,
      userId,
      conversationKey: `group:${groupOpenid}:${userId}`,
      data,
      maxReplies: MAX_GROUP_REPLIES,
      context: {
        kind: 'group',
        groupId: groupOpenid,
        userId,
        memberOpenId,
        userName: userDisplayName(data),
        role,
        date: shanghaiDateKey(),
      },
    });
  }

  async handleC2CMessage(data) {
    const userId = data.author?.user_openid ?? data.author?.id ?? '';
    if (!userId) {
      return;
    }
    this.opsRecipients.remember(userId, { source: 'message' });
    if (isOpsStatusCommand(normalizeQuestion(data))) {
      await this.replyOpsStatus(userId, data);
      return;
    }
    const target = { kind: 'c2c', openid: userId };
    await this.handleIncoming({
      target,
      userId,
      conversationKey: `c2c:${userId}`,
      data,
      maxReplies: MAX_C2C_REPLIES,
      context: {
        kind: 'c2c',
        userId,
        userName: userDisplayName(data),
        date: shanghaiDateKey(),
      },
    });
  }

  /** 私聊发送 /运维：补发主动消息失败时暂存的通知，不依赖主动消息权限。 */
  async replyOpsStatus(userId, data) {
    const messageId = typeof data?.id === 'string' ? data.id : '';
    if (!messageId) {
      return;
    }
    const pending = this.opsReminder.listPending(userId);
    if (pending.length === 0) {
      await this.safeReply(
        { kind: 'c2c', openid: userId },
        messageId,
        1,
        '当前没有待补发的运维提醒。发送 /版本 可以查看当前版本。',
      );
      return;
    }
    const content = ['【补发运维提醒】', ...pending.map((item) => item.content)]
      .join('\n\n')
      .slice(0, 1800);
    try {
      await this.safeReply({ kind: 'c2c', openid: userId }, messageId, 1, content);
      this.opsReminder.removePending(pending.map((item) => item.id));
    } catch (error) {
      this.logger.warn('补发运维提醒失败：', error);
    }
  }

  async handleIncoming({ target, userId, conversationKey, data, maxReplies, context }) {
    const messageId = typeof data.id === 'string' ? data.id : '';
    const incoming = normalizeQuestion(data);
    if (!incoming) {
      await this.safeReply(target, messageId, 1, '目前只能回答文字问题，请直接输入文字再问我。');
      return;
    }

    const policy = this.policyFor(context);

    const bilibiliUrl = extractBilibiliUrl(incoming);
    if (bilibiliUrl && this.config.reply.bilibili) {
      if (!policy.modules.bilibili) {
        await this.replyDisabledHint(
          target,
          messageId,
          'bilibili',
          '本群未开启 B 站链接解析。群主或管理员可以 @我 发送 /模块 开启。',
        );
        return;
      }
      const video = await fetchBilibiliVideo(bilibiliUrl);
      if (video) {
        await this.safeReply(target, messageId, 1, formatBilibiliVideo(video));
        if (video.cover && maxReplies > 1) {
          await this.sendImageUrl(target, messageId, 2, video.cover, {
            active: target.kind === 'group',
          });
        }
        return;
      }
    }

    const command = classifyCommand(incoming);
    if (command === 'reset') {
      this.store.reset(conversationKey);
      await this.safeReply(target, messageId, 1, '上下文已清空，可以开始新问题了。');
      return;
    }

    // 帮助常开且按本群开关生成；/模块 只改本群配置，不进入问一问。
    const parsed = parseIncomingCommand(incoming);
    if (parsed && !parsed.unknown) {
      if (parsed.command === 'help') {
        await this.safeReply(target, messageId, 1, buildHelpText(policy, commandHelpText()));
        return;
      }
      if (parsed.command === 'modules') {
        const result = handleModuleCommand({
          args: parsed.args,
          context,
          store: this.moduleStore,
          config: this.config,
          limiter: this.toggleLimiter,
        });
        await this.safeReply(target, messageId, 1, clipCommandReply(result.reply));
        return;
      }
      if (!this.canUseCommand(policy, parsed.command)) {
        await this.replyDisabledHint(
          target,
          messageId,
          `command:${parsed.command}`,
          `「${commandLabel(parsed.command)}」在本群未开启。群主或管理员可以 @我 发送 /模块 开启。`,
        );
        return;
      }
    }

    // 本地快捷指令（随机数、算式、电码、天气、对联、签到、统计）不经过问一问。
    const local = await this.command({
      text: incoming,
      config: this.config,
      logger: this.logger,
      community: this.community,
      context,
      groupTokens: this.groupLinkTokens,
      linkClient: this.linkClient,
      moduleStore: this.moduleStore,
      materialSourceStore: this.materialSourceStore,
      signage: this.signage,
    });
    if (local?.handled) {
      const reply = clipCommandReply(local.reply);
      const card = local.card ? decorateCommandCard(local.card, context, target) : null;
      // 手机 QQ 不渲染 Markdown 图片。群聊先主动发卡片、再发被动文字：
      // 卡片不带 msg_id，不会 @ 发起者；文字只 @ 一次。
      if (card && target.kind === 'group') {
        const activeSent = await this.sendCommandCard({
          target,
          messageId,
          card,
          seq: 1,
          active: true,
        });
        if (activeSent) {
          await this.safeReply(target, messageId, 1, reply);
          return;
        }
        this.logger.warn('群聊主动卡片发送失败，改用单张被动卡片。');
        // 主动消息不可用时退回“只发一张被动卡片”：卡面已包含结果，
        // 比文字后补图少一次 @，也比只发文字更不容易丢图。
        const passiveSent = await this.sendCommandCard({
          target,
          messageId,
          card,
          seq: 1,
        });
        if (passiveSent) {
          return;
        }
        await this.safeReply(target, messageId, 1, reply);
        return;
      }
      await this.safeReply(target, messageId, 1, reply);
      if (card) {
        await this.sendCommandCard({ target, messageId, card, seq: 2 });
      }
      return;
    }

    const userLimit = this.userLimiter.take(`user:${userId}`);
    if (!userLimit.allowed) {
      await this.safeReply(
        target,
        messageId,
        1,
        `问得有点快，请 ${userLimit.retryAfterSec} 秒后再试。`,
      );
      return;
    }
    if (target.kind === 'group') {
      const groupLimit = this.groupLimiter.take(`group:${target.openid}`);
      if (!groupLimit.allowed) {
        await this.safeReply(
          target,
          messageId,
          1,
          `本群问一问提问较多，请 ${groupLimit.retryAfterSec} 秒后再试。`,
        );
        return;
      }
    }

    const question = incoming.slice(0, this.config.reply.maxQuestionChars);
    const accepted = this.queue.submit(conversationKey, () =>
      this.answer({ target, messageId, userId, conversationKey, question, maxReplies, policy }),
    );
    if (!accepted) {
      await this.safeReply(target, messageId, 1, '排队的问题有点多，请稍后再试。');
    }
  }

  async answer({ target, messageId, userId, conversationKey, question, maxReplies, policy }) {
    const activePolicy = policy ?? this.moduleStore.resolve('');
    let seq = 0;
    let ackSent = false;
    let ackTask = null;
    let ackTimer = null;
    const send = async (content) => {
      if (!content) {
        return false;
      }
      seq += 1;
      if (seq > maxReplies) {
        this.logger.warn(`被动回复次数已达上限（${maxReplies}），剩余内容未发送。`);
        return false;
      }
      return this.safeReply(target, messageId, seq, content);
    };
    const startAck = () => {
      if (ackSent) {
        return null;
      }
      // 先发提示固定占用 msg_seq=1；即使发送失败也不复用该序号，避免触发平台去重。
      ackSent = true;
      seq = Math.max(seq, 1);
      ackTask = this.sendAck(target, messageId, 1);
      return ackTask;
    };
    const settleAck = async () => {
      if (ackTimer) {
        clearTimeout(ackTimer);
        ackTimer = null;
      }
      if (ackTask) {
        await ackTask;
      }
    };

    if (this.config.reply.ack) {
      if (target.kind === 'group' && this.shouldDeferAck(activePolicy)) {
        // 有问一问范围被关闭时延后提示：被拦截的回复是秒回的，
        // 先发「正在查资料」再没有下文会让成员以为机器人坏了。
        const delayMs = Math.max(0, this.config.reply.ackDelayMs ?? 1000);
        ackTimer = setTimeout(() => {
          ackTimer = null;
          startAck();
        }, delayMs);
        ackTimer.unref?.();
      } else {
        await startAck();
      }
    }

    const startedAt = Date.now();
    const history = this.store.get(conversationKey);
    this.logger.info(
      `回答问题（${target.kind}，${question.length} 字，历史 ${history.length} 条）。`,
    );

    const accountContext = await this.resolveAccountContext(target, userId);

    let result;
    try {
      result = await this.assistant({
        baseUrl: this.config.yct.baseUrl,
        apiKey: this.config.yct.apiKey,
        providerId: this.config.yct.providerId,
        model: this.config.yct.model,
        locale: this.config.yct.locale,
        channel:
          this.config.reply.style === 'chat'
            ? target.kind === 'group'
              ? 'qq-group'
              : 'qq-c2c'
            : undefined,
        capabilities: target.kind === 'group' ? this.askCapabilities(activePolicy) : undefined,
        messages: [...history, { role: 'user', content: question }],
        accountContext,
        accountContextSecret: this.config.link?.contextSecret,
        timeoutMs: this.config.reply.answerTimeoutMs,
        logger: this.logger,
      });
    } catch (error) {
      await settleAck();
      this.logger.error('问一问请求失败：', error);
      await send(friendlyError(error));
      return;
    }

    await settleAck();

    if (result.error) {
      await send(result.error);
      return;
    }

    const scopeModule = this.scopeModuleFromReason(result.reasonCode);
    if (scopeModule) {
      const key = `scope:${target.openid}:${scopeModule}`;
      const hintsEnabled = this.config.modules?.hints !== false;
      const shouldSend = ackSent || (hintsEnabled && this.hints.shouldSend(key));
      if (shouldSend) {
        await send(this.scopeBlockText(scopeModule, activePolicy));
      } else {
        this.logger.debug(`问一问范围「${scopeModule}」未开启，本次提示已节流。`);
      }
      return;
    }

    // 长回答先让模型精炼一次；失败时 composeAnswer 仍会按整句取舍，不会硬截半句。
    let answerText = result.text;
    if (this.config.reply.style === 'chat' && this.config.reply.condense) {
      const prepared = prepareAnswerText(result.text, result.references);
      if (prepared.length > this.config.reply.condenseThreshold) {
        try {
          const condensed = await this.condense({
            providerId: this.config.yct.providerId,
            model: this.config.yct.model,
            apiKey: this.config.yct.apiKey,
            text: prepared,
            question,
            targetChars: this.config.reply.condenseChars,
            timeoutMs: Math.min(this.config.reply.answerTimeoutMs, 20_000),
            logger: this.logger,
          });
          if (condensed && condensed.length < prepared.length) {
            answerText = condensed;
            this.logger.info(`回答精炼：${prepared.length} 字 → ${condensed.length} 字。`);
          }
        } catch (error) {
          this.logger.warn('精炼回答失败，改用本地按句取舍：', error);
        }
      }
    }

    const imageUrl = pickReferenceImage({
      references: result.references,
      enabled: this.config.reply.images,
      publicBaseUrl: this.config.yct.publicBaseUrl,
      hosts: this.config.reply.imageHosts,
    });

    const segments = composeAnswer({
      text: answerText,
      references: result.references,
      followups: result.followups,
      segmentChars: this.config.reply.segmentChars,
      maxChars: this.config.reply.style === 'chat' ? this.config.reply.chatMaxChars : 0,
      appendSources: this.config.reply.appendSources,
      followupSuggestions: this.config.reply.followups,
      links: this.config.reply.links,
      maxSegments: Math.max(1, maxReplies - (this.config.reply.ack ? 1 : 0)),
    });
    if (segments.length === 0) {
      await send('问一问没有返回可读内容，请换个问法再试。');
      return;
    }

    let sent = 0;
    const answerImage = imageUrl ? await this.uploadAnswerImage(target, imageUrl) : null;
    if (imageUrl && !answerImage) {
      this.logger.warn(`回答配图上传失败，改发纯文字：${imageUrl}`);
    }

    for (const segment of segments) {
      try {
        const ok = await send(segment);
        if (!ok) {
          break;
        }
        sent += 1;
      } catch (error) {
        this.logger.error('发送 QQ 消息失败：', error);
        break;
      }
    }

    if (sent > 0 && answerImage) {
      if (target.kind === 'group') {
        // 手机 QQ 对 Markdown 图片兼容性差；配图改走主动图片，不再 @ 第二次。
        const ok = await this.sendImageFile(target, messageId, 1, answerImage, { active: true });
        if (!ok) {
          this.logger.warn('主动配图发送失败，保留已发送的文字回答。');
        }
      } else if (seq < maxReplies) {
        seq += 1;
        await this.sendImageFile(target, messageId, seq, answerImage);
      }
    }

    if (sent > 0) {
      this.store.append(conversationKey, 'user', question);
      this.store.append(conversationKey, 'assistant', segments.join('\n'));
      this.logger.info(
        `回答完成${answerImage ? '（含配图）' : ''}：${result.text.length} 字，发送 ${sent}/${segments.length} 段，` +
          `用时 ${Date.now() - startedAt}ms。`,
      );
    }
  }

  async resolveAccountContext(target, userId) {
    if (
      target.kind !== 'c2c' ||
      !userId ||
      !this.config.link?.contextSecret ||
      !this.linkClient.enabled
    ) {
      return undefined;
    }
    const now = Date.now();
    const cached = this.accountContextCache.get(userId);
    if (cached && cached.expiresAt > now) {
      return cached.context;
    }

    let context;
    try {
      const link = await this.linkClient.resolve(userId);
      if (link?.ldpassUserId) {
        context = { ldpassUserId: link.ldpassUserId, openId: userId };
      }
    } catch (error) {
      this.logger.warn('读取临东通 QQ 绑定失败，本次按未绑定回答：', error);
    }

    this.accountContextCache.set(userId, {
      context,
      expiresAt: now + 60_000,
    });
    if (this.accountContextCache.size > 500) {
      this.accountContextCache.delete(this.accountContextCache.keys().next().value);
    }
    return context;
  }

  async uploadAnswerImage(target, url) {
    try {
      if (target.kind === 'group') {
        return await this.api.uploadGroupImage(target.openid, url);
      }
      return await this.api.uploadC2CImage(target.openid, url);
    } catch (error) {
      this.logger.warn('回答配图上传失败：', error);
      return null;
    }
  }

  async sendImageFile(target, messageId, seq, fileInfo, { active = false } = {}) {
    try {
      if (target.kind === 'group') {
        await this.api.sendGroupImage(
          target.openid,
          active ? { fileInfo } : { fileInfo, msgId: messageId, msgSeq: seq },
        );
      } else {
        await this.api.sendC2CImage(target.openid, { fileInfo, msgId: messageId, msgSeq: seq });
      }
      return true;
    } catch (error) {
      this.logger.warn('图片发送失败：', error);
      return false;
    }
  }

  async sendImageUrl(target, messageId, seq, url, { active = false } = {}) {
    try {
      if (target.kind === 'group') {
        const fileInfo = await this.api.uploadGroupImage(target.openid, url);
        await this.api.sendGroupImage(
          target.openid,
          active ? { fileInfo } : { fileInfo, msgId: messageId, msgSeq: seq },
        );
      } else {
        const fileInfo = await this.api.uploadC2CImage(target.openid, url);
        await this.api.sendC2CImage(target.openid, { fileInfo, msgId: messageId, msgSeq: seq });
      }
      this.logger.info(`图片已发送：${url}`);
      return true;
    } catch (error) {
      this.logger.warn(`图片发送失败：${url}`, error);
      return false;
    }
  }

  async sendCommandCard({ target, messageId, card, seq, active = false }) {
    if (!this.config.reply.cards) {
      return false;
    }
    if (typeof this.cardRenderer !== 'function') {
      return false;
    }

    try {
      const png = await this.cardRenderer(card, {
        allowedImageHosts: [this.config.yct.publicBaseUrl, ...this.config.reply.imageHosts].filter(
          Boolean,
        ),
      });
      if (!png || png.length === 0) {
        this.logger.warn(`指令卡片渲染结果为空：${card.type}`);
        return false;
      }
      if (target.kind === 'group') {
        const fileInfo = await this.api.uploadGroupImageData(target.openid, png);
        await this.api.sendGroupImage(
          target.openid,
          active ? { fileInfo } : { fileInfo, msgId: messageId, msgSeq: seq },
        );
      } else {
        const fileInfo = await this.api.uploadC2CImageData(target.openid, png);
        await this.api.sendC2CImage(target.openid, {
          fileInfo,
          msgId: messageId,
          msgSeq: seq,
        });
      }
      this.logger.info(
        `指令卡片已在机器人本地渲染并发送（${active ? '主动' : '被动'}）：${card.type}`,
      );
      return true;
    } catch (error) {
      this.logger.warn('指令卡片本地渲染或发送失败：', error);
      return false;
    }
  }

  async sendAck(target, messageId, seq) {
    try {
      if (target.kind === 'group') {
        await this.api.sendGroupMessage(target.openid, {
          msg_type: 0,
          content: '问一问正在查资料，稍等。',
          msg_id: messageId,
          msg_seq: seq,
        });
      } else {
        await this.api.sendC2CTyping(target.openid, { msgId: messageId, msgSeq: seq });
      }
      return true;
    } catch (error) {
      this.logger.warn('发送先发提示失败：', error);
      return false;
    }
  }

  async safeReply(target, messageId, seq, content) {
    if (target.kind === 'group') {
      await this.api.sendGroupMessage(target.openid, {
        msg_type: 0,
        content,
        msg_id: messageId,
        msg_seq: seq,
      });
    } else {
      await this.api.sendC2CMessage(target.openid, {
        msg_type: 0,
        content,
        msg_id: messageId,
        msg_seq: seq,
      });
    }
    return true;
  }
}

function userDisplayName(data) {
  return data.author?.member_nickname || data.author?.username || '';
}

function normalizeMemberRole(value) {
  const role = String(value ?? '').toLowerCase();
  return ['owner', 'admin', 'member'].includes(role) ? role : 'unknown';
}

function memberOpenId(data) {
  return (
    data.member_openid ||
    data.author?.member_openid ||
    data.user_openid ||
    data.member?.openid ||
    ''
  );
}

function decorateCommandCard(card, context, target) {
  const sender = context?.userName || (target.kind === 'group' ? '群成员' : '用户');
  const sentAt = shanghaiClock();
  return {
    ...card,
    footer: card.footer
      ? `${card.footer}｜${sender}｜${sentAt}`
      : `雨城通 · 问一问｜${sender}｜${sentAt}`,
  };
}

function shanghaiClock() {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.month}-${values.day} ${values.hour}:${values.minute}`;
}

function clipCommandReply(value) {
  const text = String(value ?? '').trim();
  return text.length > 800 ? `${text.slice(0, 799)}…` : text;
}

function normalizeQuestion(data) {
  const raw = typeof data.content === 'string' ? data.content : '';
  const content = raw
    .replace(/<@[!&]?\w+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (content) {
    return content;
  }
  if (Array.isArray(data.attachments) && data.attachments.length > 0) {
    return '';
  }
  return '';
}

function isOpsStatusCommand(text) {
  const normalized = String(text ?? '')
    .trim()
    .replace(/^\/+/u, '')
    .replace(/\s+/gu, '');
  return ['运维', '运维提醒', 'ops'].includes(normalized);
}

function friendlyError(error) {
  if (error?.name === 'AssistantError') {
    // 网络错误里带着内部地址，只写日志，不要把 http://127.0.0.1 发到群里。
    if (error.code === 'network') {
      return '连不上问一问服务，请稍后再试。';
    }
    return typeof error.message === 'string'
      ? error.message.slice(0, 400)
      : '问一问暂时不可用，请稍后再试。';
  }
  if (typeof error?.message === 'string' && error.message.includes('QQ 接口')) {
    return '回答发送没有成功，可能是机器人权限或回复窗口已过期，请稍后再试。';
  }
  return '问一问暂时不可用，请稍后再试。';
}
