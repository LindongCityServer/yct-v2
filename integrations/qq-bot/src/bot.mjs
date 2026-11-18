import { askAssistant } from './assistant-client.mjs';
import { composeAnswer, helpText, prepareAnswerText } from './answer.mjs';
import { renderCardPng } from './card-render.mjs';
import { extractBilibiliUrl, fetchBilibiliVideo, formatBilibiliVideo } from './bilibili.mjs';
import { condenseWithModel } from './condense.mjs';
import { handleCommand } from './commands.mjs';
import { CommunityStore, shanghaiDateKey } from './community.mjs';
import { pickReferenceImage } from './images.mjs';
import { loadGroupNotices, resolveGroupNotice } from './notices.mjs';
import { startEventBridge } from './event-bridge.mjs';
import { PlayerEventMonitor } from './player-events.mjs';
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
  } = {}) {
    this.api = api;
    this.config = config;
    this.logger = logger;
    this.assistant = assistant;
    this.condense = condense;
    this.command = command;
    this.cardRenderer = cardRenderer;
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
    this.bridgeTargets = new Set(config.events?.groupMap?.values?.() ?? []);
    this.bridgeSeen = new RecentSet();
    this.eventBridge = null;
    this.playerEvents = new PlayerEventMonitor({
      baseUrl: config.yct.baseUrl,
      groups: config.reply.playerEventGroups,
      intervalMs: config.reply.playerPollMs,
      logger,
      onEvent: (event) => this.broadcastPlayerEvent(event),
    });
    this.answerSeen = new RecentSet();
    this.statsSeen = new RecentSet();
    this.warnedFullMessage = false;
    this.seenGroups = new Set();
  }

  async init() {
    await this.community.load();
    if (this.config.reply.playerEvents) {
      this.playerEvents.start();
    }
    if (this.config.events?.port > 0) {
      this.eventBridge = await startEventBridge({
        port: this.config.events.port,
        bind: this.config.events.bind,
        token: this.config.events.token,
        logger: this.logger,
        onOneBotEvent: (event) => this.handleOneBotEvent(event),
        onServerEvent: (event) => this.handleServerEvent(event),
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
      case 'C2C_MESSAGE_CREATE':
        if (!this.answerSeen.add(data.id)) {
          this.logger.debug(`重复推送的消息 ${data.id}，忽略。`);
          return;
        }
        await this.handleC2CMessage(data);
        return;
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
          `机器人被添加到群 ${data.group_openid ?? '（未知）'}；` +
            '如需限制范围，可把该 openid 写入 QQ_BOT_GROUP_ALLOWLIST。',
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
        this.logger.info(`机器人被移出群 ${data.group_openid ?? '（未知）'}。`);
        return;
      case 'FRIEND_ADD':
        this.logger.info(`用户 ${data.openid ?? data.user_openid ?? '（未知）'} 添加了机器人。`);
        return;
      default:
        this.logger.debug(`忽略事件 ${type}。`);
    }
  }

  async broadcastPlayerEvent(event) {
    const template =
      event.type === 'join' ? this.config.reply.playerJoinText : this.config.reply.playerLeaveText;
    const content = template.replaceAll('{name}', event.name);
    for (const groupId of this.config.reply.playerEventGroups) {
      try {
        await this.api.sendGroupMessage(groupId, { content, msg_type: 0 });
        this.logger.info(
          `玩家${event.type === 'join' ? '进服' : '退服'}提示已发送到群 ${groupId}。`,
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
    const noticeGroupId = this.config.qq.groupAliases.get(groupId) ?? groupId;
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
      this.logger.info(`已发送群 ${groupId} 的 ${kind} 提示。`);
    } catch (error) {
      this.logger.warn(`发送群 ${groupId} 的 ${kind} 提示失败：`, error);
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
    const configuredGroups = [...(this.config.events.groups ?? [])];
    const groups =
      configuredGroups.length > 0
        ? configuredGroups
        : [...(this.config.reply.playerEventGroups ?? [])];
    if (groups.length === 0) {
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
    for (const groupId of groups) {
      await this.sendActiveText(groupId, content);
    }
  }

  async sendActiveText(groupId, content) {
    try {
      await this.api.sendGroupMessage(groupId, { content, msg_type: 0 });
      this.logger.info(`事件消息已发送到群 ${groupId}。`);
      return true;
    } catch (error) {
      this.logger.warn(`事件消息发送失败（群 ${groupId}）：`, error);
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
    const userId = data.author?.member_openid ?? data.author?.id ?? '';
    if (!groupOpenid || !userId) {
      return;
    }
    if (!this.seenGroups.has(groupOpenid)) {
      this.seenGroups.add(groupOpenid);
      this.logger.info(
        `首次收到群 ${groupOpenid} 的消息；如需限制范围，把它写入 QQ_BOT_GROUP_ALLOWLIST。`,
      );
    }
    if (this.config.qq.groupAllowlist.size > 0 && !this.config.qq.groupAllowlist.has(groupOpenid)) {
      this.logger.debug(`群 ${groupOpenid} 不在白名单，忽略。`);
      return;
    }

    const target = { kind: 'group', openid: groupOpenid };
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
        userName: userDisplayName(data),
        date: shanghaiDateKey(),
      },
    });
  }

  async handleC2CMessage(data) {
    const userId = data.author?.user_openid ?? data.author?.id ?? '';
    if (!userId) {
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

  async handleIncoming({ target, userId, conversationKey, data, maxReplies, context }) {
    const messageId = typeof data.id === 'string' ? data.id : '';
    const incoming = normalizeQuestion(data);
    if (!incoming) {
      await this.safeReply(target, messageId, 1, '目前只能回答文字问题，请直接输入文字再问我。');
      return;
    }

    const bilibiliUrl = extractBilibiliUrl(incoming);
    if (bilibiliUrl && this.config.reply.bilibili) {
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
    if (command === 'help') {
      await this.safeReply(target, messageId, 1, helpText);
      return;
    }
    if (command === 'reset') {
      this.store.reset(conversationKey);
      await this.safeReply(target, messageId, 1, '上下文已清空，可以开始新问题了。');
      return;
    }

    // 本地快捷指令（随机数、算式、电码、天气、对联、签到、统计）不经过问一问。
    const local = await this.command({
      text: incoming,
      config: this.config,
      logger: this.logger,
      community: this.community,
      context,
    });
    if (local?.handled) {
      const reply = clipCommandReply(local.reply);
      const card = local.card ? decorateCommandCard(local.card, context, target) : null;
      // 手机 QQ 不渲染 Markdown 图片。群聊先主动发卡片、再发被动文字：
      // 卡片不带 msg_id，不会 @ 发起者；文字只 @ 一次。
      if (card && target.kind === 'group') {
        await this.sendCommandCard({ target, messageId, card, seq: 1, active: true });
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
      this.answer({ target, messageId, userId, conversationKey, question, maxReplies }),
    );
    if (!accepted) {
      await this.safeReply(target, messageId, 1, '排队的问题有点多，请稍后再试。');
    }
  }

  async answer({ target, messageId, userId, conversationKey, question, maxReplies }) {
    let seq = 0;
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

    // 先发提示固定占用 msg_seq=1；即使发送失败也不复用该序号，避免触发平台去重。
    if (this.config.reply.ack) {
      seq = 1;
      await this.sendAck(target, messageId, 1);
    }

    const startedAt = Date.now();
    const history = this.store.get(conversationKey);
    this.logger.info(
      `回答问题（${target.kind}，${question.length} 字，历史 ${history.length} 条）。`,
    );

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
        messages: [...history, { role: 'user', content: question }],
        timeoutMs: this.config.reply.answerTimeoutMs,
        logger: this.logger,
      });
    } catch (error) {
      this.logger.error('问一问请求失败：', error);
      await send(friendlyError(error));
      return;
    }

    if (result.error) {
      await send(result.error);
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
      this.logger.info(`指令卡片已在机器人本地渲染并发送：${card.type}`);
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
