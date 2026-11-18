import { randomInt as cryptoRandomInt } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 群签到、发言统计和今日运势。
 *
 * 状态保存在机器人自己的 JSON 文件里，不进网页、不进数据库；
 * 所有日期都按 Asia/Shanghai 计算，和用户看到的“今天”一致。
 */

const bundledFortuneTextsPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'data',
  'fortune-texts.txt',
);

const fortuneTexts = loadFortuneTexts(bundledFortuneTextsPath) ?? [
  '今天适合把拖着的小事做掉，完成后会很轻松。',
  '会遇到一点小惊喜，别急着否定新想法。',
  '适合出门走走，换个路线可能有新发现。',
];

export function loadFortuneTexts(path) {
  try {
    return normalizeFortuneTexts(readFileSync(path, 'utf8').split(/\r?\n/));
  } catch {
    return null;
  }
}

function normalizeFortuneTexts(lines) {
  const seen = new Set();
  return lines
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .filter((line) => {
      if (seen.has(line)) {
        return false;
      }
      seen.add(line);
      return true;
    });
}


const maximumMessageDays = 90;

export function shanghaiDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function recentDateKeys(days, endKey) {
  const count = Math.max(1, Math.min(maximumMessageDays, Number(days) || 1));
  const end = new Date(`${endKey}T00:00:00Z`);
  const keys = [];
  for (let index = count - 1; index >= 0; index -= 1) {
    const date = new Date(end.getTime() - index * 86_400_000);
    keys.push(date.toISOString().slice(0, 10));
  }
  return keys;
}

function isConsecutive(lastKey, todayKey) {
  if (!lastKey) {
    return false;
  }
  const last = new Date(`${lastKey}T00:00:00Z`).getTime();
  const today = new Date(`${todayKey}T00:00:00Z`).getTime();
  return today - last === 86_400_000;
}

export class CommunityStore {
  constructor({
    path = '',
    fortuneTextsPath = '',
    fortuneTexts: customFortuneTexts,
    logger,
    now = Date.now,
    random = cryptoRandomInt,
  } = {}) {
    this.path = path;
    this.logger = logger;
    this.now = now;
    this.random = random;
    const customTexts = normalizeFortuneTexts(
      Array.isArray(customFortuneTexts) ? customFortuneTexts : [],
    );
    this.fortuneTexts =
      customTexts.length > 0
        ? customTexts
        : loadFortuneTexts(fortuneTextsPath) ?? fortuneTexts;
    this.state = emptyState();
    this.saveTimer = null;
    this.writeChain = Promise.resolve();
  }

  async load() {
    if (!this.path) {
      return;
    }
    try {
      const text = await readFile(this.path, 'utf8');
      const payload = JSON.parse(text);
      if (payload?.version === 1 && payload.groups && payload.users) {
        this.state = payload;
      } else {
        this.logger?.warn('签到/统计状态文件格式不认识，已从空状态开始。');
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        this.logger?.warn('读取签到/统计状态失败，已从空状态开始：', error);
      }
    }
  }

  recordMessage({ groupId, userId, name, date, source = 'at' }) {
    if (!groupId || !userId || !date) {
      return;
    }
    const group = this.ensureGroup(groupId);
    if (source === 'all') {
      group.fullMessages = true;
    }
    const displayName = normalizeName(name);
    if (displayName) {
      group.names[userId] = displayName;
      this.ensureUser(userId).name = displayName;
    }
    const day = (group.messages[date] ??= { total: 0, users: {} });
    day.total += 1;
    day.users[userId] = (day.users[userId] ?? 0) + 1;
    this.pruneMessages(group);
    this.scheduleSave();
  }

  signIn({ groupId, userId, name, date }) {
    if (!groupId || !userId || !date) {
      throw new Error('签到缺少群或用户信息。');
    }
    const group = this.ensureGroup(groupId);
    const displayName = normalizeName(name);
    if (displayName) {
      group.names[userId] = displayName;
    }
    const record = (group.signins[userId] ??= {
      total: 0,
      streak: 0,
      lastSignin: '',
    });
    if (record.lastSignin === date) {
      return { already: true, total: record.total, streak: record.streak };
    }
    record.streak = isConsecutive(record.lastSignin, date) ? record.streak + 1 : 1;
    record.total += 1;
    record.lastSignin = date;
    this.scheduleSave();
    return { already: false, total: record.total, streak: record.streak };
  }

  signInBoard({ groupId, limit = 10 }) {
    const group = this.state.groups[groupId];
    if (!group) {
      return [];
    }
    return Object.entries(group.signins)
      .map(([userId, record]) => ({
        userId,
        name: this.displayName(groupId, userId),
        total: record.total,
        streak: record.streak,
      }))
      .sort((a, b) => b.total - a.total || b.streak - a.streak || a.name.localeCompare(b.name))
      .slice(0, limit);
  }

  messageStats({ groupId, date, days = 1 }) {
    const group = this.state.groups[groupId];
    const keys = recentDateKeys(days, date);
    if (!group) {
      return { total: 0, uniqueUsers: 0, activeDays: 0, fullMessages: false };
    }
    const users = new Set();
    let total = 0;
    let activeDays = 0;
    for (const key of keys) {
      const day = group.messages[key];
      if (!day || day.total <= 0) {
        continue;
      }
      activeDays += 1;
      total += day.total;
      for (const userId of Object.keys(day.users)) {
        users.add(userId);
      }
    }
    return { total, uniqueUsers: users.size, activeDays, fullMessages: group.fullMessages };
  }

  messageBoard({ groupId, date, days = 1, limit = 10 }) {
    const group = this.state.groups[groupId];
    if (!group) {
      return [];
    }
    const counts = new Map();
    for (const key of recentDateKeys(days, date)) {
      const day = group.messages[key];
      if (!day) {
        continue;
      }
      for (const [userId, count] of Object.entries(day.users)) {
        counts.set(userId, (counts.get(userId) ?? 0) + count);
      }
    }
    return [...counts.entries()]
      .map(([userId, count]) => ({ userId, name: this.displayName(groupId, userId), count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      .slice(0, limit);
  }

  getFortune({ userId, name, date }) {
    if (!userId || !date) {
      throw new Error('运势缺少用户信息。');
    }
    const user = this.ensureUser(userId);
    const displayName = normalizeName(name);
    if (displayName) {
      user.name = displayName;
    }
    if (user.fortune?.date === date) {
      return this.fortunePayload(user.fortune, false);
    }
    user.fortune = this.createFortune(date);
    this.scheduleSave();
    return this.fortunePayload(user.fortune, true);
  }

  resetFortune({ userId, name, date }) {
    if (!userId || !date) {
      throw new Error('运势缺少用户信息。');
    }
    const user = this.ensureUser(userId);
    const displayName = normalizeName(name);
    if (displayName) {
      user.name = displayName;
    }
    user.fortune = this.createFortune(date);
    this.scheduleSave();
    return this.fortunePayload(user.fortune, true);
  }

  createFortune(date) {
    return {
      date,
      score: this.random(1, 101),
      textIndex: this.random(0, this.fortuneTexts.length),
    };
  }

  fortunePayload(fortune, isNew) {
    return {
      date: fortune.date,
      score: fortune.score,
      text: this.fortuneTexts[fortune.textIndex] ?? this.fortuneTexts[0],
      isNew,
    };
  }

  displayName(groupId, userId) {
    return (
      normalizeName(this.state.groups[groupId]?.names?.[userId]) ||
      normalizeName(this.state.users[userId]?.name) ||
      `用户${String(userId).slice(-4)}`
    );
  }

  ensureGroup(groupId) {
    return (this.state.groups[groupId] ??= {
      fullMessages: false,
      names: {},
      signins: {},
      messages: {},
    });
  }

  ensureUser(userId) {
    return (this.state.users[userId] ??= { name: '', fortune: null });
  }

  pruneMessages(group) {
    const keys = Object.keys(group.messages).sort();
    while (keys.length > maximumMessageDays) {
      delete group.messages[keys.shift()];
    }
  }

  scheduleSave() {
    if (!this.path || this.saveTimer) {
      return;
    }
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.save().catch((error) => this.logger?.warn('保存签到/统计状态失败：', error));
    }, 1000);
    this.saveTimer.unref?.();
  }

  async flush() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    await this.save();
  }

  save() {
    if (!this.path) {
      return Promise.resolve();
    }
    this.writeChain = this.writeChain
      .then(() => this.writeState())
      .catch((error) => {
        this.logger?.warn('保存签到/统计状态失败：', error);
      });
    return this.writeChain;
  }

  async writeState() {
    const directory = dirname(this.path);
    await mkdir(directory, { recursive: true });
    const tempPath = `${this.path}.${process.pid}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(this.state)}\n`, 'utf8');
    await rename(tempPath, this.path);
  }
}

function emptyState() {
  return { version: 1, users: {}, groups: {} };
}

function normalizeName(value) {
  const text = String(value ?? '')
    .replace(/[\r\n\t]/g, ' ')
    .trim();
  return text.length > 20 ? text.slice(0, 20) : text;
}
