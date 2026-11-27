import { cp, mkdir, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'apps', 'web');
const target = join(root, 'integrations', 'qq-bot', 'assets');

await mkdir(join(target, 'fonts'), { recursive: true });
await mkdir(join(target, 'icons'), { recursive: true });
await mkdir(join(target, 'card-templates'), { recursive: true });
await mkdir(join(target, 'fortune-stickers'), { recursive: true });

const copies = [
  ['app/fonts/harmonyos-sans/HarmonyOS_Sans_SC_Regular.ttf', 'fonts/HarmonyOS_Sans_SC_Regular.ttf'],
  ['app/fonts/harmonyos-sans/HarmonyOS_Sans_SC_Bold.ttf', 'fonts/HarmonyOS_Sans_SC_Bold.ttf'],
  ['public/icons/yct-logo.svg', 'icons/yct-logo.svg'],
  ['public/icons/qq-bot-wordmark.svg', 'icons/qq-bot-wordmark.svg'],
  ['public/icons/yct-logo-wordmark.svg', 'icons/yct-logo-wordmark.svg'],
];

for (const [from, to] of copies) {
  await cp(join(source, from), join(target, to), { force: true });
}

for (const name of await readdir(join(source, 'public', 'card-templates'))) {
  await cp(join(source, 'public', 'card-templates', name), join(target, 'card-templates', name), {
    force: true,
  });
}

for (const name of await readdir(join(source, 'public', 'fortune-stickers'))) {
  await cp(
    join(source, 'public', 'fortune-stickers', name),
    join(target, 'fortune-stickers', name),
    { force: true },
  );
}

console.log(`已同步机器人卡片资源到 ${target}`);
