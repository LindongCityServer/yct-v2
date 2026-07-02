import sharp from 'sharp';
import { copyFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const sourceDir = join(process.cwd(), 'assets', 'brand');
const outputDir = join(process.cwd(), 'apps', 'web', 'public', 'icons');

const sources = {
  icon: join(sourceDir, '雨城通白底图标.svg'),
  logo: join(sourceDir, '雨城通logo.svg'),
  wordmark: join(sourceDir, '雨城通logo带文字.svg'),
};

await mkdir(outputDir, { recursive: true });

await copyFile(sources.icon, join(outputDir, 'yct-icon.svg'));
await copyFile(sources.logo, join(outputDir, 'yct-logo.svg'));
await copyFile(sources.wordmark, join(outputDir, 'yct-logo-wordmark.svg'));

await sharp(sources.icon).resize(192, 192).png().toFile(join(outputDir, 'yct-icon-192.png'));
await sharp(sources.icon).resize(512, 512).png().toFile(join(outputDir, 'yct-icon-512.png'));
await sharp(sources.icon).resize(512, 512).png().toFile(join(outputDir, 'yct-icon-maskable.png'));
await sharp(sources.logo).resize(192, 192).png().toFile(join(outputDir, 'yct-logo-192.png'));
await sharp(sources.logo).resize(512, 512).png().toFile(join(outputDir, 'yct-logo-512.png'));
