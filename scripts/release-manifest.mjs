import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_ROOT = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(SCRIPT_ROOT, '..');
export const RELEASE_NOTES_PATH = resolve(REPO_ROOT, 'apps/web/release-notes.json');
export const RELEASE_HISTORY_PATH = resolve(REPO_ROOT, 'apps/web/release-history.json');

const RELEASE_NOTES_REPO_PATH = 'apps/web/release-notes.json';
const RELEASE_WINDOW_MS = 60 * 60 * 1000;
const RELEASE_SESSION_GAP_MS = 12 * 60 * 60 * 1000;
const RELEASEABLE_TYPES = new Set(['feat', 'fix', 'perf', 'style']);
const RELEASE_BUMPS = new Set(['major', 'minor', 'patch']);
const INTERNAL_SCOPES = new Set([
  'build',
  'ci',
  'contracts',
  'core',
  'database',
  'deploy',
  'schemas',
  'test',
]);
const LEGACY_THEME_RULES = [
  [/地图|路线|道路|瓦片|玩家位置|标记|地点|POI|行政区划/iu, 'map'],
  [/班次|公交|地铁|交通|线路|站点|停靠|乘车|票务|客运|航班|轮渡/iu, 'transit'],
  [/账号|登录|成员|偏好|通知|乘车码/iu, 'account'],
  [/内容|素材|文章|专题|运营|消息|封面/iu, 'content'],
  [/物料|导视|路牌|站牌|RMP/iu, 'materials'],
  [/门户|首页|入口|友链/iu, 'portal'],
  [/搜索/iu, 'search'],
  [/离线|PWA|缓存/iu, 'offline'],
  [/翻译|多语言/iu, 'i18n'],
  [/管理员|后台|审计|投稿/iu, 'admin'],
];
const HISTORICAL_CHANGE_OVERRIDES = new Map([
  [
    'b4bad24ce25e361c082015195585aad0f15d0057',
    { category: 'feat', scope: 'general', summary: '初始化雨城通 v2 实现' },
  ],
  [
    '44bc8358f91b37dd4b6ee3b72977781ff7129c8e',
    { category: 'feat', scope: 'transit', summary: '接入统一班次查询与本地记录' },
  ],
  [
    '464e85b60b478c7aa68f8f7403fbf390aad874df',
    { category: 'feat', scope: 'transit', summary: '支持班次起终点筛选' },
  ],
  [
    'f2c94ef6990b6e61d39ee25bad61ce7e723a6aac',
    { category: 'feat', scope: 'account', summary: '接入账号同步' },
  ],
  [
    '268dca03f41cd1c87b5b3b0748ee8702bd17fd91',
    { category: 'fix', scope: 'map', summary: '优化地图线路细节' },
  ],
  [
    '01be9f77a2c12bcdd3ed2b1f560dac8265025e91',
    { category: 'feat', scope: 'i18n', summary: '完善运营提醒与多语言覆盖' },
  ],
  ['b785a3f586f7022dfda56972a6a3bba6e9537812', null],
  ['e51224b3ab442d1ef7c907295c9f682680aaf288', null],
  ['896c498044a77b0289b8ccbd8e1c711906009abd', null],
  ['2a63570a56a44763e4baee8abaf57df84c222c16', null],
  ['4dbf9da3ddc4f87a3f95fb81d7cee8e47d40bdc2', null],
  ['503b868c1415cc470ac192512cb80a9b2658be12', null],
]);
const INITIAL_RELEASE_COMMIT_SHA = 'b4bad24ce25e361c082015195585aad0f15d0057';
const INITIAL_RELEASE_THEMES = [
  'account',
  'admin',
  'content',
  'map',
  'offline',
  'services',
  'transit',
  'web',
];
const INITIAL_RELEASE_CHANGES = [
  {
    category: 'feat',
    breaking: false,
    scope: 'web',
    summary: '将旧版分散的首页、线路图、车站大屏和客运页面整合为统一导航',
    changeId: '2.0.0:1',
  },
  {
    category: 'feat',
    breaking: false,
    scope: 'map',
    summary: '重构地图探索，在同一张全屏地图中查看地点、道路和公共交通并规划路线',
    changeId: '2.0.0:2',
  },
  {
    category: 'feat',
    breaking: false,
    scope: 'transit',
    summary: '统一线路、站点、运营提醒和车站大屏，并延续旧版公交、地铁与客运数据',
    changeId: '2.0.0:3',
  },
  {
    category: 'feat',
    breaking: false,
    scope: 'account',
    summary: '接入临东通账号，集中管理主题、通知、行程提醒和本地记录',
    changeId: '2.0.0:4',
  },
  {
    category: 'feat',
    breaking: false,
    scope: 'admin',
    summary: '新增内容、地图、交通和服务入口审核后台，统一已发布信息',
    changeId: '2.0.0:5',
  },
  {
    category: 'feat',
    breaking: false,
    scope: 'offline',
    summary: '升级可安装和离线使用的响应式体验，适配移动端、桌面端与深浅色主题',
    changeId: '2.0.0:6',
  },
];
const RECORD_SEPARATOR = '\u001e';
const FIELD_SEPARATOR = '\u001f';

/**
 * 历史版本固定读取截止提交；后续版本只读取发布前显式准备的 release notes。
 */
export function createReleaseManifest({ buildId = '', requirePreparedRelease = false } = {}) {
  const releaseNotes = readReleaseNotesFile();
  const releaseHistory = readReleaseHistoryFile();
  if (releaseHistory.historyCutoffSha !== releaseNotes.historyCutoffSha) {
    throw new Error('Release history and release notes use different history cutoff SHAs.');
  }
  const historicalReleases = releaseHistory.releases;
  const preparedReleases = createPreparedReleases(releaseNotes.releases, historicalReleases);

  if (requirePreparedRelease) {
    assertLatestReleaseMatchesSource(preparedReleases[0]);
  }

  const releases = [...preparedReleases, ...historicalReleases];
  return {
    currentVersion: releases[0]?.version ?? '2.0.0',
    buildId: normalizeBuildId(buildId),
    headSha: readHeadSha(),
    generatedAt: new Date().toISOString(),
    releaseWindowMinutes: 60,
    releases,
  };
}

export function createHistoricalReleaseSnapshot() {
  const releaseNotes = readReleaseNotesFile();
  const historicalCommits = readGitCommits(releaseNotes.historyCutoffSha);
  return {
    schemaVersion: 1,
    historyCutoffSha: releaseNotes.historyCutoffSha,
    releases: createHistoricalReleases(historicalCommits),
  };
}

export function readReleaseHistoryFile() {
  if (!existsSync(RELEASE_HISTORY_PATH)) {
    throw new Error(`Frozen release history does not exist: ${RELEASE_HISTORY_PATH}`);
  }

  const parsed = JSON.parse(readFileSync(RELEASE_HISTORY_PATH, 'utf8'));
  if (
    parsed?.schemaVersion !== 1 ||
    typeof parsed.historyCutoffSha !== 'string' ||
    !/^[0-9a-f]{40}$/u.test(parsed.historyCutoffSha) ||
    !Array.isArray(parsed.releases)
  ) {
    throw new Error('Frozen release history has an invalid schema or history cutoff SHA.');
  }

  return {
    schemaVersion: 1,
    historyCutoffSha: parsed.historyCutoffSha,
    releases: parsed.releases.map((release, index) => normalizeHistoricalRelease(release, index)),
  };
}

export function readReleaseNotesFile() {
  if (!existsSync(RELEASE_NOTES_PATH)) {
    throw new Error(`Release notes file does not exist: ${RELEASE_NOTES_PATH}`);
  }

  const parsed = JSON.parse(readFileSync(RELEASE_NOTES_PATH, 'utf8'));
  if (
    parsed?.schemaVersion !== 1 ||
    typeof parsed.historyCutoffSha !== 'string' ||
    !/^[0-9a-f]{40}$/u.test(parsed.historyCutoffSha) ||
    !Array.isArray(parsed.releases)
  ) {
    throw new Error('Release notes file has an invalid schema or history cutoff SHA.');
  }

  return {
    schemaVersion: 1,
    historyCutoffSha: parsed.historyCutoffSha,
    releases: parsed.releases.map((release, index) => normalizePreparedRelease(release, index)),
  };
}

export function calculateNextReleaseVersion(previousRelease, nextRelease, previousReleases = []) {
  if (!previousRelease) {
    return '2.0.0';
  }

  const current = parseVersion(previousRelease.version);
  if (nextRelease.bump) {
    return formatVersion(applyReleaseBump(current, nextRelease.bump, nextRelease.changes));
  }

  // 没有 bump 字段的旧准备记录继续按旧规则校验，避免历史发布清单失效。
  const sameSession = isSameReleaseSession(previousRelease, nextRelease);
  const similarTheme = isSimilarTheme(
    { tokens: previousRelease.themes ?? [] },
    { tokens: nextRelease.themes ?? [] },
  );
  const seenThemes = new Set(previousReleases.flatMap((release) => release.themes ?? []));
  if (seenThemes.size === 0) {
    for (const theme of previousRelease.themes ?? []) {
      seenThemes.add(theme);
    }
  }
  const hasNewTheme = (nextRelease.themes ?? []).some((theme) => !seenThemes.has(theme));
  const minorCapReached = hasMinorBumpInReleaseWindow(previousReleases, nextRelease);
  return formatVersion(
    bumpVersion(
      current,
      nextRelease.changes,
      similarTheme,
      sameSession,
      hasNewTheme,
      minorCapReached,
    ),
  );
}

export function getSourceFingerprint() {
  const output = execGit(['ls-files', '-z', '--cached', '--others', '--exclude-standard']);
  const paths = output
    .split('\0')
    .filter(Boolean)
    .map((path) => path.replaceAll('\\', '/'))
    .filter((path) => path !== RELEASE_NOTES_REPO_PATH)
    .sort((left, right) => left.localeCompare(right));
  const fingerprint = createHash('sha256');

  for (const path of paths) {
    const absolutePath = resolve(REPO_ROOT, path);
    fingerprint.update(path);
    fingerprint.update('\0');
    if (!existsSync(absolutePath)) {
      fingerprint.update('deleted');
    } else if (lstatSync(absolutePath).isFile()) {
      fingerprint.update(createHash('sha256').update(readFileSync(absolutePath)).digest('hex'));
    } else {
      fingerprint.update('non-file');
    }
    fingerprint.update('\0');
  }

  return fingerprint.digest('hex');
}

export function groupCommitsIntoReleaseWindows(commits) {
  const sorted = [...commits].sort(
    (left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt),
  );
  const batches = [];

  for (const commit of sorted) {
    const currentBatch = batches[batches.length - 1];
    if (
      currentBatch &&
      Date.parse(currentBatch[0].occurredAt) - Date.parse(commit.occurredAt) <= RELEASE_WINDOW_MS
    ) {
      currentBatch.push(commit);
    } else {
      batches.push([commit]);
    }
  }

  return batches;
}

function createHistoricalReleases(commits) {
  const batches = groupCommitsIntoReleaseWindows(commits);
  const releases = [];
  let version = { major: 2, minor: 0, patch: 0 };
  let previousTheme = null;
  let previousRelease = null;
  const seenThemes = new Set();

  for (const batch of [...batches].reverse()) {
    const parsedChanges = batch
      .map((commit) => parseUserFacingChange(commit))
      .filter((change) => change !== null);
    const isInitialRelease = batch.some((commit) => commit.id === INITIAL_RELEASE_COMMIT_SHA);
    const changes = isInitialRelease
      ? INITIAL_RELEASE_CHANGES.map((change) => ({ ...change }))
      : parsedChanges;
    if (changes.length === 0) {
      continue;
    }

    const theme = isInitialRelease ? { tokens: INITIAL_RELEASE_THEMES } : getTheme(changes);
    if (releases.length > 0) {
      version = bumpVersion(
        version,
        changes,
        isSimilarTheme(previousTheme, theme),
        isSameReleaseSession(previousRelease, { releasedAt: batch[0]?.occurredAt }),
        theme.tokens.some((token) => !seenThemes.has(token)),
        hasMinorBumpInReleaseWindow(releases, { releasedAt: batch[0]?.occurredAt }),
      );
    }
    for (const token of theme.tokens) {
      seenThemes.add(token);
    }
    previousTheme = theme;
    const release = {
      version: formatVersion(version),
      releasedAt: batch[0]?.occurredAt ?? new Date(0).toISOString(),
      changeCount: changes.length,
      themes: theme.tokens,
      changes: isInitialRelease ? changes : [...changes].reverse(),
    };
    releases.unshift(release);
    previousRelease = release;
  }

  return releases;
}

function createPreparedReleases(preparedReleases, historicalReleases) {
  const releases = [];
  let previousRelease = historicalReleases[0];
  const previousReleases = [...historicalReleases];

  for (const prepared of [...preparedReleases].reverse()) {
    const expectedVersion = calculateNextReleaseVersion(
      previousRelease,
      prepared,
      previousReleases,
    );
    if (prepared.version !== expectedVersion) {
      throw new Error(
        `Prepared release ${prepared.version} does not follow the version rules; expected ${expectedVersion}.`,
      );
    }

    const release = {
      version: prepared.version,
      ...(prepared.bump ? { bump: prepared.bump } : {}),
      releasedAt: prepared.releasedAt,
      changeCount: prepared.changes.length,
      themes: prepared.themes,
      sourceFingerprint: prepared.sourceFingerprint,
      changes: prepared.changes.map((change, index) => ({
        ...change,
        changeId: `${prepared.version}:${index + 1}`,
      })),
    };
    releases.unshift(release);
    previousReleases.unshift(release);
    previousRelease = release;
  }

  return releases;
}

function normalizeHistoricalRelease(value, index) {
  if (!value || typeof value !== 'object') {
    throw new Error(`Frozen release at index ${index} must be an object.`);
  }

  const version = String(value.version ?? '').trim();
  const releasedAt = String(value.releasedAt ?? '').trim();
  const themes = Array.isArray(value.themes)
    ? [...new Set(value.themes.map((theme) => String(theme).trim()).filter(Boolean))]
    : [];
  const changes = Array.isArray(value.changes)
    ? value.changes.map((change, changeIndex) =>
        normalizeHistoricalChange(change, index, changeIndex),
      )
    : [];

  if (!/^\d+\.\d+\.\d+$/u.test(version) || Number.isNaN(Date.parse(releasedAt))) {
    throw new Error(`Frozen release at index ${index} has invalid version metadata.`);
  }
  if (themes.length === 0 || changes.length === 0 || value.changeCount !== changes.length) {
    throw new Error(`Frozen release ${version} has inconsistent themes or changes.`);
  }

  return { version, releasedAt, changeCount: changes.length, themes, changes };
}

function normalizeHistoricalChange(value, releaseIndex, changeIndex) {
  const category = String(value?.category ?? '').trim();
  const summary = String(value?.summary ?? '').trim();
  const changeId = String(value?.changeId ?? '').trim();
  const scope = String(value?.scope ?? '').trim();
  if (!RELEASEABLE_TYPES.has(category) || !summary || !changeId) {
    throw new Error(
      `Frozen change ${releaseIndex}:${changeIndex} requires a category, summary and change ID.`,
    );
  }
  return {
    category,
    breaking: Boolean(value?.breaking),
    ...(scope ? { scope } : {}),
    summary,
    changeId,
  };
}

function normalizePreparedRelease(value, index) {
  if (!value || typeof value !== 'object') {
    throw new Error(`Prepared release at index ${index} must be an object.`);
  }

  const version = String(value.version ?? '').trim();
  const releasedAt = String(value.releasedAt ?? '').trim();
  const sourceFingerprint = String(value.sourceFingerprint ?? '').trim();
  const bump = value.bump === undefined ? undefined : String(value.bump ?? '').trim();
  const themes = Array.isArray(value.themes)
    ? [...new Set(value.themes.map((theme) => String(theme).trim()).filter(Boolean))]
    : [];
  const changes = Array.isArray(value.changes)
    ? value.changes.map((change, changeIndex) =>
        normalizePreparedChange(change, index, changeIndex),
      )
    : [];

  if (!/^\d+\.\d+\.\d+$/u.test(version)) {
    throw new Error(`Prepared release at index ${index} has an invalid version.`);
  }
  if (Number.isNaN(Date.parse(releasedAt))) {
    throw new Error(`Prepared release ${version} has an invalid releasedAt value.`);
  }
  if (!/^[0-9a-f]{64}$/u.test(sourceFingerprint)) {
    throw new Error(`Prepared release ${version} has an invalid source fingerprint.`);
  }
  if (bump !== undefined && !RELEASE_BUMPS.has(bump)) {
    throw new Error(`Prepared release ${version} has an invalid bump value.`);
  }
  if (themes.length === 0 || changes.length === 0) {
    throw new Error(`Prepared release ${version} requires at least one theme and one change.`);
  }

  return { version, releasedAt, sourceFingerprint, themes, changes, ...(bump ? { bump } : {}) };
}

function normalizePreparedChange(value, releaseIndex, changeIndex) {
  const category = String(value?.category ?? '').trim();
  const summary = String(value?.summary ?? '').trim();
  const breaking = Boolean(value?.breaking);
  if (!RELEASEABLE_TYPES.has(category) || !summary) {
    throw new Error(
      `Prepared change ${releaseIndex}:${changeIndex} requires a user-facing category and summary.`,
    );
  }
  return { category, breaking, summary };
}

function assertLatestReleaseMatchesSource(latestPreparedRelease) {
  if (!latestPreparedRelease) {
    throw new Error(
      'No prepared release matches the current source. Run pnpm release:prepare before building a deployment artifact.',
    );
  }

  const currentFingerprint = getSourceFingerprint();
  if (latestPreparedRelease.sourceFingerprint !== currentFingerprint) {
    throw new Error(
      'Source files changed after the latest release was prepared. Run pnpm release:prepare --amend with the final user-facing changes.',
    );
  }
}

function bumpVersion(current, changes, similarTheme, sameSession, hasNewTheme, minorCapReached) {
  if (changes.some((change) => change.breaking)) {
    return { major: current.major + 1, minor: 0, patch: 0 };
  }
  const minorRequested =
    hasNewTheme ||
    (changes.some((change) => change.category === 'feat') && !similarTheme && !sameSession);
  if (minorRequested && !minorCapReached) {
    return { major: current.major, minor: current.minor + 1, patch: 0 };
  }
  return { major: current.major, minor: current.minor, patch: current.patch + 1 };
}

function applyReleaseBump(current, bump, changes) {
  if (!RELEASE_BUMPS.has(bump)) {
    throw new Error(`Invalid release bump: ${bump}`);
  }
  if (changes.some((change) => change.breaking) && bump !== 'major') {
    throw new Error('Breaking changes require a major release bump.');
  }
  if (!changes.some((change) => change.breaking) && bump === 'major') {
    throw new Error('A major release bump requires at least one breaking change.');
  }
  if (bump === 'major') {
    return { major: current.major + 1, minor: 0, patch: 0 };
  }
  if (bump === 'minor') {
    return { major: current.major, minor: current.minor + 1, patch: 0 };
  }
  return { major: current.major, minor: current.minor, patch: current.patch + 1 };
}

function hasMinorBumpInReleaseWindow(previousReleases, nextRelease) {
  const nextReleaseDate = getReleaseDate(nextRelease.releasedAt);
  let newerRelease = nextRelease;
  let sameSession = true;

  return previousReleases.some((release, index) => {
    if (sameSession) {
      sameSession = isSameReleaseSession(release, newerRelease);
      newerRelease = release;
    }
    const isRelevant = sameSession || getReleaseDate(release.releasedAt) === nextReleaseDate;
    return isRelevant && isMinorBump(release, previousReleases[index + 1]);
  });
}

function isMinorBump(release, previousRelease) {
  if (!previousRelease) {
    return false;
  }
  const current = parseVersion(release.version);
  const previous = parseVersion(previousRelease.version);
  return (
    current.major === previous.major && current.minor === previous.minor + 1 && current.patch === 0
  );
}

function isSameReleaseSession(previousRelease, nextRelease) {
  if (!previousRelease || !nextRelease) {
    return false;
  }
  const previousTimestamp = Date.parse(previousRelease.releasedAt ?? '');
  const nextTimestamp = Date.parse(nextRelease.releasedAt ?? '');
  return (
    !Number.isNaN(previousTimestamp) &&
    !Number.isNaN(nextTimestamp) &&
    nextTimestamp >= previousTimestamp &&
    nextTimestamp - previousTimestamp <= RELEASE_SESSION_GAP_MS
  );
}

function parseVersion(value) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/u.exec(value);
  if (!match) {
    throw new Error(`Invalid semantic version: ${value}`);
  }
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

function formatVersion(version) {
  return `${version.major}.${version.minor}.${version.patch}`;
}

function getReleaseDate(value) {
  const timestamp = Date.parse(value ?? '');
  return Number.isNaN(timestamp)
    ? '1970-01-01'
    : new Date(timestamp + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function getTheme(changes) {
  const scopes = [
    ...new Set(
      changes.map((change) => change.scope ?? inferLegacyTheme(change.summary)).filter(Boolean),
    ),
  ].sort();
  return { tokens: scopes.length > 0 ? scopes : ['general'] };
}

function inferLegacyTheme(summary) {
  return LEGACY_THEME_RULES.find(([pattern]) => pattern.test(summary))?.[1];
}

function isSimilarTheme(left, right) {
  if (!left || !right || left.tokens.length === 0 || right.tokens.length === 0) {
    return false;
  }
  const rightTokens = new Set(right.tokens);
  return left.tokens.some((token) => rightTokens.has(token));
}

function readGitCommits(revision) {
  const output = execGit(['log', revision, '--no-merges', '--format=%H%x1f%cI%x1f%s%x1e']);
  return output
    .split(RECORD_SEPARATOR)
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [id, occurredAt, subject] = record.split(FIELD_SEPARATOR);
      return { id, occurredAt, subject };
    })
    .filter(
      (commit) =>
        Boolean(commit.id) &&
        Boolean(commit.occurredAt) &&
        Boolean(commit.subject) &&
        !Number.isNaN(Date.parse(commit.occurredAt)),
    );
}

function parseUserFacingChange(commit) {
  if (HISTORICAL_CHANGE_OVERRIDES.has(commit.id)) {
    const override = HISTORICAL_CHANGE_OVERRIDES.get(commit.id);
    return override
      ? {
          ...override,
          breaking: false,
          changeId: commit.id.slice(0, 8),
        }
      : null;
  }

  const match = /^(feat|fix|perf|style)(?:\(([^)]+)\))?(!)?:\s*(.+)$/u.exec(commit.subject);
  if (match) {
    const scope = match[2]?.toLowerCase();
    if (scope && INTERNAL_SCOPES.has(scope)) {
      return null;
    }
    return {
      category: match[1],
      breaking: Boolean(match[3]),
      scope: match[2] || undefined,
      summary: match[4].trim(),
      changeId: commit.id.slice(0, 8),
    };
  }

  const legacyChange = parseLegacyUserFacingChange(commit.subject);
  return legacyChange
    ? {
        ...legacyChange,
        changeId: commit.id.slice(0, 8),
      }
    : null;
}

function parseLegacyUserFacingChange(subject) {
  const summary = subject.trim();
  if (!summary || /^(?:docs?|chore|build|ci|refactor|test|revert)(?:\(|:|\s)/iu.test(summary)) {
    return null;
  }

  const category =
    /^(?:修复|修正|纠正|恢复|兼容|拦截|禁止|清理|移除|解决|校正|补齐|补全|刷新|适配|限定|限制|区分|明确|稳定|继承|校验|fix|correct|resolve|restore|prevent|remove|clean)/iu.test(
      summary,
    )
      ? 'fix'
      : /^(?:优化|加速|缓存|并行|延迟加载|optimize|speed|cache|parallel|lazy)/iu.test(summary)
        ? 'perf'
        : /(?:样式|排版|布局|颜色|字号|字体|间距|视觉|外观|style|layout|color|font)/iu.test(summary)
          ? 'style'
          : /^(?:初始化|接入|增加|支持|完善|展示|提供|新增|开放|启用|扩展|定义|统一|添加|建立|融合|接管|记录|常驻|高亮|标记|汇总|提示|预览|生成|自动|合并|add|support|implement|introduce|enable|integrate|improve|enhance|show|provide)/iu.test(
                summary,
              )
            ? 'feat'
            : null;

  return category ? { category, breaking: false, summary } : null;
}

function readHeadSha() {
  return execGit(['rev-parse', 'HEAD']).trim();
}

function execGit(args) {
  try {
    return execFileSync('git', args, {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    const stderr = error?.stderr?.toString().trim();
    throw new Error(stderr || `Git command failed: git ${args.join(' ')}`);
  }
}

function normalizeBuildId(value) {
  const normalized = String(value || '').trim();
  return normalized || 'dev';
}
