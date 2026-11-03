import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { delimiter, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SCRIPT_ROOT = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(SCRIPT_ROOT, '..', '..');
export const RELEASE_NOTES_PATH = resolve(REPO_ROOT, 'apps/web/release-notes.json');
export const CHANGELOG_PATH = resolve(REPO_ROOT, 'CHANGELOG.md');
export const REPO_SLUG = 'LindongCityServer/yct-v2';

const GIT_CANDIDATES = [
  'C:\\Program Files\\Git\\cmd\\git.exe',
  'C:\\Program Files (x86)\\Git\\cmd\\git.exe',
];
const GH_CANDIDATES = [
  'C:\\Program Files\\GitHub CLI\\gh.exe',
  'C:\\Program Files (x86)\\GitHub CLI\\gh.exe',
];

function resolveTool(envName, candidates, command) {
  const fromEnv = process.env[envName];
  if (fromEnv && existsSync(fromEnv)) {
    return fromEnv;
  }
  try {
    const output = execFileSync(process.platform === 'win32' ? 'where.exe' : 'which', [command], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    const first = output.split(/\r?\n/u)[0];
    if (first) {
      return first;
    }
  } catch {
    // 继续查找常见安装路径。
  }
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error(`找不到 ${command}，请安装后加入 PATH，或设置 ${envName}。`);
}

export function resolveGitExe() {
  return resolveTool('YCT_GIT_EXE', GIT_CANDIDATES, 'git');
}

export function resolveGhExe() {
  return resolveTool('YCT_GH_EXE', GH_CANDIDATES, 'gh');
}

function toolEnvironment(gitExe) {
  const gitDirectory = dirname(gitExe);
  const current = process.env.PATH ?? '';
  const hasGitDirectory = current.split(delimiter).includes(gitDirectory);
  return {
    ...process.env,
    PATH: hasGitDirectory ? current : `${gitDirectory}${delimiter}${current}`,
  };
}

export function runGit(args, { allowFailure = false } = {}) {
  const gitExe = resolveGitExe();
  try {
    return execFileSync(gitExe, args, {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env: toolEnvironment(gitExe),
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (error) {
    if (allowFailure) {
      return null;
    }
    const stderr = error?.stderr?.toString().trim();
    throw new Error(stderr || `git 执行失败：git ${args.join(' ')}`);
  }
}

export function runGhJson(args) {
  const ghExe = resolveGhExe();
  const gitExe = resolveGitExe();
  const output = execFileSync(ghExe, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: toolEnvironment(gitExe),
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const text = output.trim();
  return text ? JSON.parse(text) : [];
}

export function readReleaseNotes() {
  return JSON.parse(readFileSync(RELEASE_NOTES_PATH, 'utf8'));
}

export function latestRelease(notes = readReleaseNotes()) {
  const releases = Array.isArray(notes.releases) ? notes.releases : [];
  if (releases.length === 0 || !releases[0].releasedAt) {
    throw new Error('apps/web/release-notes.json 中没有可用的 releasedAt。');
  }
  return releases[0];
}

export function resolveBoundary(value) {
  if (!value) {
    return null;
  }
  const commit = runGit(['rev-parse', '--verify', '--quiet', `${value}^{commit}`], {
    allowFailure: true,
  });
  if (commit) {
    const dateText = runGit(['show', '-s', '--format=%cI', value]);
    return { ref: value, date: new Date(dateText), label: `${value}（${dateText}）` };
  }
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    throw new Error(`无法把 "${value}" 识别为 git 引用或日期。示例：--from 111f8be 或 --from 2026-11-02T12:23:26Z`);
  }
  return { ref: null, date: new Date(timestamp), label: value };
}

export function getMergedPullRequests() {
  const pullRequests = runGhJson([
    'pr',
    'list',
    '--repo',
    REPO_SLUG,
    '--state',
    'merged',
    '--limit',
    '1000',
    '--json',
    'number,title,mergedAt,author,url,mergeCommit,closingIssuesReferences',
  ]);
  return pullRequests
    .filter((item) => item && item.mergedAt)
    .sort((left, right) => new Date(left.mergedAt) - new Date(right.mergedAt));
}

export function selectPullRequests(pullRequests, from, to) {
  return pullRequests.filter((item) => {
    const mergedAt = new Date(item.mergedAt);
    if (from && mergedAt <= from.date) {
      return false;
    }
    if (to && mergedAt > to.date) {
      return false;
    }
    return true;
  });
}

export function groupTitle(title) {
  const normalized = String(title ?? '');
  const match = /^(feat|fix|perf|style|refactor|docs|chore|build|ci|test)(\([^)]*\))?(!)?:\s*/u.exec(
    normalized,
  );
  const groups = {
    feat: '新功能',
    fix: '修复',
    perf: '性能',
    style: '样式',
    refactor: '重构',
    docs: '文档',
    chore: '维护',
    build: '维护',
    ci: '维护',
    test: '维护',
  };
  if (!match) {
    return { group: '其他', summary: normalized.trim(), breaking: false };
  }
  return {
    group: match[3] ? '破坏性变更' : groups[match[1]] ?? '其他',
    summary: normalized.slice(match[0].length).replace(/\s*\(#\d+\)\s*$/u, '').trim(),
    breaking: Boolean(match[3]),
  };
}

export function renderGroups(pullRequests) {
  const order = ['破坏性变更', '新功能', '修复', '性能', '样式', '重构', '文档', '维护', '其他'];
  const buckets = new Map(order.map((name) => [name, []]));
  for (const pr of pullRequests) {
    const { group, summary } = groupTitle(pr.title);
    const parts = [`[#${pr.number}](${pr.url})`];
    if (pr.author?.login) {
      parts.push(`@${pr.author.login}`);
    }
    for (const issue of pr.closingIssuesReferences ?? []) {
      parts.push(`关闭 [#${issue.number}](${issue.url})`);
    }
    buckets.get(group).push(`- ${summary}（${parts.join('，')}）`);
  }
  const lines = [];
  for (const name of order) {
    const entries = buckets.get(name);
    if (entries.length === 0) {
      continue;
    }
    lines.push(`### ${name}`, ...entries, '');
  }
  return lines.join('\n').trimEnd();
}

export function parseArgs(argv) {
  const options = { from: null, to: null, out: null, file: null, section: 'Unreleased', help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') {
      options.help = true;
    } else if (argument === '--from' || argument === '--to' || argument === '--out' || argument === '--file' || argument === '--section') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`${argument} 缺少参数值。`);
      }
      options[argument.slice(2)] = value;
      index += 1;
    } else {
      throw new Error(`未知参数：${argument}`);
    }
  }
  return options;
}

export function formatDate(value) {
  return new Date(value).toISOString();
}
