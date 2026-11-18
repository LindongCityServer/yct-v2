import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const pnpmDir = resolve('node_modules', '.pnpm');
const esbuildDir = (await readdir(pnpmDir)).find((name) => name.startsWith('esbuild@'));
if (!esbuildDir) {
  throw new Error('找不到 esbuild，请先在仓库根目录执行 pnpm install。');
}
const { build } = await import(
  new URL(`../node_modules/.pnpm/${esbuildDir}/node_modules/esbuild/lib/main.js`, import.meta.url)
);

const output = 'integrations/qq-bot/src/card-renderer.mjs';
const checkOnly = process.argv.includes('--check');
const result = await build({
  entryPoints: ['apps/web/lib/qq-bot-card.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  external: ['@resvg/resvg-js'],
  banner: {
    js: '// 由 scripts/build-qq-bot-card-renderer.mjs 从 apps/web/lib/qq-bot-card.ts 生成，请勿手改。',
  },
  outfile: output,
  write: false,
  logLevel: 'info',
});
const generated = result.outputFiles[0]?.text ?? '';

if (checkOnly) {
  const current = await readFile(output, 'utf8').catch(() => '');
  if (current !== generated) {
    console.error(`${output} 已过期，请运行 pnpm qqbot:card:build。`);
    process.exitCode = 1;
  } else {
    console.log(`${output} 已是最新。`);
  }
} else {
  await writeFile(output, generated);
  console.log(`已生成 ${output}（${Buffer.byteLength(generated)} 字节）。`);
}
