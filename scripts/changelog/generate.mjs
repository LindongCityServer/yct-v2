import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import {
  CHANGELOG_PATH,
  formatDate,
  getMergedPullRequests,
  latestRelease,
  parseArgs,
  readReleaseNotes,
  renderGroups,
  resolveBoundary,
  selectPullRequests,
} from './lib.mjs';

const USAGE = `用法：
  node scripts/changelog/generate.mjs [--from <git引用|日期>] [--to <git引用|日期>] [--out <路径>]

  --from   Unreleased 区间起点，默认 apps/web/release-notes.json 最新版本的 releasedAt。
  --to     Unreleased 区间终点，默认当前时间。
  --out    输出文件，默认仓库根目录 CHANGELOG.md。

体例：本日志只收录经 PR 合并的改动；直接推送到 main 的提交不在此列。`;

const HISTORY_NOTE = [
  '这些版本的更新内容仍以 `apps/web/release-notes.json` 的人工摘要为准。',
  '当时仓库没有走 PR 流程，GitHub 上没有可回溯的关联编号，因此不在此重复。',
].join('\n');

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(USAGE);
    return;
  }

  const notes = readReleaseNotes();
  const releases = Array.isArray(notes.releases) ? notes.releases : [];
  const pullRequests = getMergedPullRequests();

  const from = options.from
    ? resolveBoundary(options.from)
    : { ref: null, date: new Date(latestRelease(notes).releasedAt), label: latestRelease(notes).releasedAt };
  const to = options.to ? resolveBoundary(options.to) : { ref: null, date: new Date(), label: '当前时间' };
  const unreleasedPullRequests = selectPullRequests(pullRequests, from, to);

  const windows = releases.map((release, index) => {
    const previous = releases[index + 1];
    const previousDate = previous ? new Date(previous.releasedAt) : null;
    const releasedAt = new Date(release.releasedAt);
    return {
      release,
      previous,
      pullRequests: pullRequests.filter((pr) => {
        const mergedAt = new Date(pr.mergedAt);
        return (previousDate === null || mergedAt > previousDate) && mergedAt <= releasedAt;
      }),
    };
  });

  const newestIndexWithPullRequests = windows.reduce(
    (found, window, index) => (window.pullRequests.length > 0 ? index : found),
    -1,
  );

  const sections = [];
  sections.push(renderSection('unreleased', 'Unreleased', renderUnreleased(unreleasedPullRequests, from, to)));
  for (let index = 0; index <= newestIndexWithPullRequests; index += 1) {
    const window = windows[index];
    sections.push(renderSection(`release:${window.release.version}`, `${window.release.version} — ${formatDate(window.release.releasedAt).slice(0, 10)}`, renderRelease(window)));
  }

  const historicalReleases = windows.slice(newestIndexWithPullRequests + 1);
  if (historicalReleases.length > 0) {
    const newest = historicalReleases[0].release.version;
    sections.push(renderSection('history', `历史区间（2.0.0 – ${newest}）未回溯`, HISTORY_NOTE));
  }

  const outPath = options.out ?? CHANGELOG_PATH;
  const existing = existsSync(outPath) ? readFileSync(outPath, 'utf8') : null;
  const text = existing ? mergeIntoExisting(existing, sections) : renderDocument(sections);
  writeFileSync(outPath, text, 'utf8');

  console.log(`已合并 PR（Unreleased 区间）：${unreleasedPullRequests.length} 个`);
  for (let index = 0; index <= newestIndexWithPullRequests; index += 1) {
    console.log(`  ${windows[index].release.version}：${windows[index].pullRequests.length} 个`);
  }
  console.log(`输出：${outPath}`);
}

function renderSection(key, heading, body) {
  return {
    key,
    heading,
    block: `<!-- changelog:${key}:start -->\n${body.trimEnd()}\n<!-- changelog:${key}:end -->`,
  };
}

function renderUnreleased(pullRequests, from, to) {
  const header = `区间：${from.label} → ${to.label}；已合并 PR ${pullRequests.length} 个。`;
  if (pullRequests.length === 0) {
    return `${header}\n\n本区间无经 PR 合并的改动（直接推送到 main 的提交按体例不收录）。`;
  }
  return `${header}\n\n${renderGroups(pullRequests)}`;
}

function renderRelease(window) {
  const previousLabel = window.previous
    ? `${window.previous.version}（${window.previous.releasedAt}）`
    : `（无前序版本）（${formatDate(window.release.releasedAt)}）`;
  const header = `区间：${previousLabel} → ${window.release.version}（${window.release.releasedAt}）；已合并 PR ${window.pullRequests.length} 个。`;
  if (window.pullRequests.length === 0) {
    return `${header}\n\n本区间无经 PR 合并的改动（直接推送到 main 的提交按体例不收录）。`;
  }
  return `${header}\n\n${renderGroups(window.pullRequests)}`;
}

function renderDocument(sections) {
  const head = [
    '# 更新日志',
    '',
    '> 本日志仅收录经 PR 合并的改动；直接推送到 main 的提交不在此列。',
    '> 自动区段由 `scripts/changelog/generate.mjs` 生成，重复运行可安全刷新；手工补充请写在标记之外。',
    '',
  ].join('\n');
  const body = sections.map((section) => `## ${section.heading}\n\n${section.block}`).join('\n\n');
  return `${head}\n${body}\n`;
}

function mergeIntoExisting(text, sections) {
  let next = text.replace(/\r\n/gu, '\n');
  for (const section of sections) {
    const pattern = new RegExp(
      `<!-- changelog:${escapeRegExp(section.key)}:start -->[\\s\\S]*?<!-- changelog:${escapeRegExp(section.key)}:end -->`,
      'u',
    );
    if (pattern.test(next)) {
      next = next.replace(pattern, section.block);
      continue;
    }
    if (section.key === 'unreleased') {
      next = insertAfterHeader(next, section);
    } else if (section.key === 'history') {
      next = `${next.trimEnd()}\n\n## ${section.heading}\n\n${section.block}\n`;
    } else {
      next = insertAfterUnreleased(next, section);
    }
  }
  return next.replace(/\n{3,}/gu, '\n\n').replace(/\s+$/u, '\n');
}

function insertAfterHeader(text, section) {
  const match = /^##\s+Unreleased\s*$/mu.exec(text);
  if (match) {
    const index = match.index + match[0].length;
    return `${text.slice(0, index)}\n\n${section.block}\n${text.slice(index)}`;
  }
  return `${text.trimEnd()}\n\n## ${section.heading}\n\n${section.block}\n`;
}

function insertAfterUnreleased(text, section) {
  const marker = /<!-- changelog:unreleased:end -->/u.exec(text);
  if (marker) {
    const index = marker.index + marker[0].length;
    return `${text.slice(0, index)}\n\n## ${section.heading}\n\n${section.block}\n${text.slice(index).replace(/^\n+/u, '\n')}`;
  }
  return `${text.trimEnd()}\n\n## ${section.heading}\n\n${section.block}\n`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

main();
