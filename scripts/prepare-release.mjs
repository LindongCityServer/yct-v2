import { writeFileSync } from 'node:fs';
import { format, resolveConfig } from 'prettier';
import {
  RELEASE_NOTES_PATH,
  calculateNextReleaseVersion,
  createReleaseManifest,
  getSourceFingerprint,
  readReleaseNotesFile,
} from './release-manifest.mjs';

const RELEASEABLE_TYPES = new Set(['feat', 'fix', 'perf', 'style']);

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    process.exit(0);
  }

  const releaseNotes = readReleaseNotesFile();
  const currentManifest = createReleaseManifest({ buildId: 'prepare' });
  const existingRelease = options.amend ? releaseNotes.releases[0] : null;
  if (options.amend && !existingRelease) {
    throw new Error('没有可供 --amend 修改的已准备版本。');
  }

  const previousReleases = options.amend
    ? currentManifest.releases.slice(1)
    : currentManifest.releases;
  const previousRelease = previousReleases[0];
  const changes = [...(existingRelease?.changes ?? []), ...options.changes];
  const themes = [...new Set([...(existingRelease?.themes ?? []), ...options.themes])];
  if (themes.length === 0) {
    throw new Error('至少填写一个主题，例如 --theme map 或 --theme map,web。');
  }
  if (changes.length === 0) {
    throw new Error('至少填写一项用户可感知变更，例如 --change "feat|支持导出路线"。');
  }

  const candidate = {
    version: '0.0.0',
    releasedAt: options.releasedAt ?? existingRelease?.releasedAt ?? new Date().toISOString(),
    sourceFingerprint: getSourceFingerprint(),
    themes,
    changes,
  };
  candidate.version = calculateNextReleaseVersion(previousRelease, candidate, previousReleases);

  const nextReleaseNotes = {
    schemaVersion: releaseNotes.schemaVersion,
    historyCutoffSha: releaseNotes.historyCutoffSha,
    releases: options.amend
      ? [candidate, ...releaseNotes.releases.slice(1)]
      : [candidate, ...releaseNotes.releases],
  };

  if (options.dryRun) {
    console.log(JSON.stringify(candidate, null, 2));
    process.exit(0);
  }

  const prettierConfig = (await resolveConfig(RELEASE_NOTES_PATH, { editorconfig: true })) ?? {};
  const formattedReleaseNotes = await format(JSON.stringify(nextReleaseNotes), {
    ...prettierConfig,
    parser: 'json',
  });
  writeFileSync(RELEASE_NOTES_PATH, formattedReleaseNotes, 'utf8');
  console.log(`已准备版本 ${candidate.version}，变更 ${candidate.changes.length} 项。`);
  console.log(`发布清单：${RELEASE_NOTES_PATH}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function parseArgs(argv) {
  const options = {
    amend: false,
    changes: [],
    dryRun: false,
    help: false,
    releasedAt: null,
    themes: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') {
      options.help = true;
      continue;
    }
    if (argument === '--amend') {
      options.amend = true;
      continue;
    }
    if (argument === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (argument === '--theme') {
      options.themes.push(...readNextValue(argv, ++index, '--theme').split(/[,\s]+/u));
      continue;
    }
    if (argument === '--change') {
      options.changes.push(parseChange(readNextValue(argv, ++index, '--change')));
      continue;
    }
    if (argument === '--date') {
      const value = readNextValue(argv, ++index, '--date');
      if (Number.isNaN(Date.parse(value))) {
        throw new Error(`--date 不是有效的日期时间：${value}`);
      }
      options.releasedAt = value;
      continue;
    }
    throw new Error(`未知参数：${argument}。使用 pnpm release:prepare --help 查看用法。`);
  }

  options.themes = [
    ...new Set(options.themes.map((theme) => theme.trim().toLowerCase()).filter(Boolean)),
  ];
  return options;
}

function parseChange(value) {
  const separatorIndex = value.indexOf('|');
  if (separatorIndex <= 0) {
    throw new Error('变更格式必须是 category[!]|用户可感知摘要，例如 feat|支持导出路线。');
  }
  const categoryWithBreaking = value.slice(0, separatorIndex).trim();
  const summary = value.slice(separatorIndex + 1).trim();
  const match = /^(feat|fix|perf|style)(!)?$/u.exec(categoryWithBreaking);
  if (!match || !RELEASEABLE_TYPES.has(match[1]) || !summary) {
    throw new Error('变更类型必须是 feat、fix、perf 或 style，可追加 ! 表示破坏性变更。');
  }
  return {
    category: match[1],
    breaking: Boolean(match[2]),
    summary,
  };
}

function readNextValue(argv, index, flag) {
  const value = argv[index]?.trim();
  if (!value || value.startsWith('--')) {
    throw new Error(`${flag} 需要一个值。`);
  }
  return value;
}

function printUsage() {
  console.log(`用法：
  pnpm release:prepare --theme map,web --change "feat|支持导出路线"

参数：
  --theme <主题>       一个或多个稳定主题标识，逗号分隔
  --change <变更>      category[!]|用户可感知摘要，可重复
  --date <时间>        可选，ISO 日期时间；默认使用当前时间
  --amend              追加到当前已准备版本并刷新源码指纹
  --dry-run            只输出候选版本，不写入发布清单
  --help               显示此帮助`);
}
