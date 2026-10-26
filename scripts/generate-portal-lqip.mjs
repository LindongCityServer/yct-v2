import { mkdir, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

// 为静态门户的英雄图和工具卡封面生成 32/64/128/256/512/1024 阶梯 LQIP。
// 输出：apps/portal/assets/lqip/<width>/<name>.webp（提交到仓库，供 portal.js 逐步替换）。
const root = path.resolve(import.meta.dirname, '..');
const portalAssets = path.join(root, 'apps/portal/assets');
const outputDirectory = path.join(portalAssets, 'lqip');
const groups = ['hero', 'tools'];
const widths = [32, 64, 128, 256, 512, 1024];

await Promise.all(
  widths.map((width) => mkdir(path.join(outputDirectory, String(width)), { recursive: true })),
);

for (const group of groups) {
  const directory = path.join(portalAssets, group);
  for (const name of await readdir(directory)) {
    if (!/\.(?:jpe?g|png|webp)$/i.test(name)) {
      continue;
    }

    const baseName = name.replace(/\.[^.]+$/, '');
    for (const width of widths) {
      const outputPath = path.join(outputDirectory, String(width), `${baseName}.webp`);
      await sharp(path.join(directory, name))
        .resize({ width, withoutEnlargement: true })
        .webp({ quality: width === 32 ? 60 : 72 })
        .toFile(outputPath);
      const info = await stat(outputPath);
      console.log(`${group}/${baseName}@${width}: ${info.size}b`);
    }
  }
}
