import { existsSync, writeFileSync } from 'node:fs';
import { format, resolveConfig } from 'prettier';
import { RELEASE_HISTORY_PATH, createHistoricalReleaseSnapshot } from './release-manifest.mjs';

const force = process.argv.includes('--force');
const unknownArguments = process.argv.slice(2).filter((argument) => argument !== '--force');

if (unknownArguments.length > 0) {
  console.error(`未知参数：${unknownArguments.join(', ')}`);
  process.exitCode = 1;
} else if (existsSync(RELEASE_HISTORY_PATH) && !force) {
  console.error('历史版本已经固化。如确需重建，请显式追加 --force。');
  process.exitCode = 1;
} else {
  const snapshot = createHistoricalReleaseSnapshot();
  const prettierConfig = (await resolveConfig(RELEASE_HISTORY_PATH, { editorconfig: true })) ?? {};
  const formattedSnapshot = await format(JSON.stringify(snapshot), {
    ...prettierConfig,
    parser: 'json',
  });
  writeFileSync(RELEASE_HISTORY_PATH, formattedSnapshot, 'utf8');
  const changeCount = snapshot.releases.reduce((sum, release) => sum + release.changeCount, 0);
  console.log(
    `已固化 ${snapshot.releases.length} 个历史版本、${changeCount} 条用户可感知变更，当前版本 ${snapshot.releases[0]?.version ?? '2.0.0'}。`,
  );
}
