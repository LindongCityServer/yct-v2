import { existsSync, readFileSync } from 'node:fs';
import {
  CHANGELOG_PATH,
  getMergedPullRequests,
  latestRelease,
  parseArgs,
  readReleaseNotes,
  resolveBoundary,
  selectPullRequests,
} from './lib.mjs';

const USAGE = `用法：
  node scripts/changelog/check.mjs [--from <git引用|日期>] [--to <git引用|日期>] [--section <版本号|Unreleased>] [--file <路径>]

  --from     区间起点，默认 apps/web/release-notes.json 最新版本的 releasedAt。
  --to       区间终点，默认当前时间。
  --section  校验的区段，默认 Unreleased。
  --file     要校验的 CHANGELOG 路径，默认仓库根目录 CHANGELOG.md。

基准：区间内「已合并的 PR」集合。日志里出现区间外的 PR 只提示，不算失败。
退出码：0 全覆盖；1 存在缺漏；2 参数或文件错误。`;

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(USAGE);
    return;
  }

  const notes = readReleaseNotes();
  const file = options.file ?? CHANGELOG_PATH;
  if (!existsSync(file)) {
    console.error(`找不到 CHANGELOG：${file}`);
    process.exit(2);
  }

  const from = options.from
    ? resolveBoundary(options.from)
    : { ref: null, date: new Date(latestRelease(notes).releasedAt), label: latestRelease(notes).releasedAt };
  const to = options.to ? resolveBoundary(options.to) : { ref: null, date: new Date(), label: '当前时间' };

  const sectionText = extractSection(readFileSync(file, 'utf8'), options.section);
  if (sectionText === null) {
    console.error(`CHANGELOG 中找不到区段：${options.section}`);
    process.exit(2);
  }

  const expected = selectPullRequests(getMergedPullRequests(), from, to);
  const coveredPullRequests = linkedNumbers(sectionText, 'pull');
  const coveredIssues = linkedNumbers(sectionText, 'issues');
  const expectedIssues = new Set();
  for (const pr of expected) {
    for (const issue of pr.closingIssuesReferences ?? []) {
      expectedIssues.add(String(issue.number));
    }
  }

  const expectedNumbers = new Set(expected.map((pr) => String(pr.number)));
  const missingPullRequests = [...expectedNumbers].filter((number) => !coveredPullRequests.has(number));
  const extraPullRequests = [...coveredPullRequests].filter((number) => !expectedNumbers.has(number));
  const missingIssues = [...expectedIssues].filter((number) => !coveredIssues.has(number));
  const extraIssues = [...coveredIssues].filter((number) => !expectedIssues.has(number));

  console.log(`校验区段：${options.section}`);
  console.log(`区间：${from.label} → ${to.label}`);
  console.log(`应覆盖：已合并 PR ${expectedNumbers.size} 个，关联 issue ${expectedIssues.size} 个`);
  console.log(`日志覆盖：PR ${coveredPullRequests.size} 个，issue ${coveredIssues.size} 个`);

  if (missingPullRequests.length > 0) {
    console.log('');
    console.log(`缺失 PR（${missingPullRequests.length}）：`);
    for (const number of sortNumbers(missingPullRequests)) {
      const pr = expected.find((item) => String(item.number) === number);
      console.log(`  #${number} ${pr?.title ?? ''}`);
    }
  }
  if (missingIssues.length > 0) {
    console.log('');
    console.log(`警告：以下关联 issue 未在日志中出现（不计失败）：#${sortNumbers(missingIssues).join(' #')}`);
  }
  if (extraPullRequests.length > 0) {
    console.log('');
    console.log(`警告：日志中的 PR 不在本次区间（可能是手写条目或跨区间）：#${sortNumbers(extraPullRequests).join(' #')}`);
  }
  if (extraIssues.length > 0) {
    console.log('');
    console.log(`提示：日志中的 issue 不在本次区间：#${sortNumbers(extraIssues).join(' #')}`);
  }

  if (missingPullRequests.length > 0) {
    console.log('');
    console.log('结果：未覆盖，请重新运行 scripts/changelog/generate.mjs 或手工补齐缺失条目。');
    process.exit(1);
  }

  console.log('');
  console.log('结果：已覆盖区间内全部已合并 PR。');
}

function extractSection(text, name) {
  const normalized = text.replace(/\r\n/gu, '\n');
  if (name === 'Unreleased') {
    const marker = /<!-- changelog:unreleased:start -->([\s\S]*?)<!-- changelog:unreleased:end -->/u.exec(normalized);
    if (marker) {
      return marker[1];
    }
  }
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const heading = new RegExp(`^##\\s+${escaped}\\s*$`, 'mu').exec(normalized);
  if (!heading) {
    return null;
  }
  const rest = normalized.slice(heading.index + heading[0].length);
  const next = /^##\s+/mu.exec(rest);
  return next ? rest.slice(0, next.index) : rest;
}

function linkedNumbers(text, kind) {
  const numbers = new Set();
  const pattern = new RegExp(`\\[#(\\d+)\\]\\(https://github\\.com/[^)\\s]+/${kind}/\\d+\\)`, 'gu');
  for (const match of text.matchAll(pattern)) {
    numbers.add(match[1]);
  }
  return numbers;
}

function sortNumbers(numbers) {
  return [...numbers].sort((left, right) => Number(left) - Number(right));
}

main();
